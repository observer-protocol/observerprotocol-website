#!/usr/bin/env python3
"""Check sitemap.xml against the pages this repository actually deploys.

WHY THIS WAS REPLACED, 2026-08-22. The previous version read sitemap.xml, fetched
every URL in it, and reported whether each returned 200 with nothing excluding it.
It passed 34/34 on a sitemap that was missing a deployed page entirely and carried
nine stale lastmod values, because **its passing condition was a property of the
list, not of the site.** A page absent from the list was absent from the check.

That is the same defect class as `used_by` and `clauses_no_primitive_serves`, both
withdrawn from the policy engine for it: a check whose subject is derived from the
thing under test can only confirm that thing's internal consistency.

So the enumeration now comes from the DEPLOYED PAGES, and the sitemap is compared
against it rather than the other way round.

THE ENUMERATION IS IMPORTED FROM make-sitemap.py, NOT REIMPLEMENTED. That generator
already derives which files ship, from `git ls-files *.html` filtered by the
forced-404, 410, redirect and canonical rules in netlify.toml. A second copy of that
logic here would agree until netlify.toml changed and then disagree silently, with
no way to tell which was right. There is one derivation and both scripts use it.
`publish = "."` means the repository IS the built output, so tracked HTML that
survives those rules is the deployed set.

THREE FAULT CLASSES, REPORTED SEPARATELY, because they have different causes:

  1. PRESENT BUT UNLISTED  a page ships and the sitemap does not declare it.
  2. LISTED BUT ABSENT     the sitemap declares a URL this repository does not
                           serve as a destination -- retired, redirected, or
                           canonicalising elsewhere.
  3. LASTMOD DIVERGENT     the sitemap's date and the file's git committer date
                           disagree. This is what a content change without a
                           sitemap regeneration looks like.

THE LIVE PASS IS KEPT and answers a different question: the enumeration reads the
repository, and a page can be listed from a correct reading of it and still fail in
production. But **an unreachable network is not a finding about the site.** A
request that could not be made is reported as UNCHECKED and does not fail the run;
a request that succeeded and found an exclusion does.

Run: python3 tools/check-sitemap.py [--no-live] [--sitemap PATH_OR_URL]
"""

import importlib.util
import pathlib
import subprocess
import re
import sys
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent

# Cloudflare fronts this domain and 403s the default Python-urllib signature
# (Error 1010, browser_signature_banned, confirmed 2026-07-14). Without an
# explicit User-Agent every request here fails closed on a 403.
UA = {"User-Agent": "observerprotocol-sitemap-check/2.0"}


def _generator():
    """Import make-sitemap.py. Hyphen in the filename, so importlib."""
    spec = importlib.util.spec_from_file_location(
        "make_sitemap", str(ROOT / "tools" / "make-sitemap.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def shallow_repository():
    """True if this clone has no history, so per-file commit dates are meaningless.

    A DETECTED WRONG ENVIRONMENT MUST NOT PRODUCE FINDINGS. `actions/checkout` is
    depth-1 by default; on such a clone `git log -1 -- <path>` returns HEAD for every
    file, so every page whose real date is older than HEAD reads as LASTMOD DIVERGENT.
    That is a mass false positive that looks exactly like a real one, and it would
    train a reader to ignore this check. Refuse instead, and say what to change.
    """
    try:
        out = subprocess.run(["git", "-C", str(ROOT), "rev-parse", "--is-shallow-repository"],
                             capture_output=True, text=True, timeout=10)
    except (OSError, subprocess.SubprocessError):
        return False
    return out.stdout.strip() == "true"


def deployed_pages(gen):
    """{url: (lastmod, relpath)} for every page this repository deploys."""
    rules = gen.redirect_rules()
    pages, skipped = {}, []
    for relpath in gen.tracked_html():
        url, reason = gen.url_for(relpath, rules)
        if url is None:
            skipped.append((relpath, reason))
            continue
        pages[url] = (gen.git_lastmod(relpath), relpath)
    return pages, skipped


def sitemap_entries(source):
    if source.startswith("http"):
        req = urllib.request.Request(source, headers=UA)
        text = urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "replace")
    else:
        text = pathlib.Path(source).read_text()
    out = {}
    for block in re.findall(r"<url>(.*?)</url>", text, re.S):
        loc = re.search(r"<loc>([^<]+)</loc>", block)
        mod = re.search(r"<lastmod>([^<]+)</lastmod>", block)
        if loc:
            out[loc.group(1).strip()] = mod.group(1).strip() if mod else None
    return out


def live_problems(url):
    """(problems, reached). reached=False means the request could not be made."""
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=30) as r:
            status, xrobots = r.status, r.headers.get("X-Robots-Tag")
            body = r.read().decode("utf-8", "replace")
            final = r.geturl()
    except urllib.error.HTTPError as e:
        return [f"HTTP {e.code}"], True
    except Exception as e:
        return [f"{type(e).__name__}: {e}"], False

    problems = []
    if status != 200:
        problems.append(f"HTTP {status}")
    if xrobots and "noindex" in xrobots.lower():
        problems.append(f"X-Robots-Tag: {xrobots}")
    if final != url:
        problems.append(f"redirected to {final}")
    head = body[:body.find("</head>") + 7] if "</head>" in body else body[:8000]
    m = re.search(r'<meta[^>]+name=["\']robots["\'][^>]*content=["\']([^"\']*)', head, re.I)
    if m and "noindex" in m.group(1).lower():
        problems.append(f'<meta name="robots"> {m.group(1)}')
    m = re.search(r'<link[^>]+rel=["\']canonical["\'][^>]*href=["\']([^"\']*)', head, re.I)
    if m and m.group(1).rstrip("/") != url.rstrip("/"):
        problems.append(f"canonical points at {m.group(1)}")
    return problems, True


def main(argv):
    source = str(ROOT / "sitemap.xml")
    if "--sitemap" in argv:
        source = argv[argv.index("--sitemap") + 1]

    if shallow_repository():
        print("  REFUSING: this is a shallow clone, so per-file commit dates are not\n"
              "  available and every lastmod would read as divergent. Check out with\n"
              "  fetch-depth: 0 (actions/checkout) and run again.")
        return 1

    gen = _generator()
    deployed, skipped = deployed_pages(gen)
    listed = sitemap_entries(source)

    if not deployed:
        print("  REFUSING: the enumeration found no deployed pages. That is a broken "
              "enumeration, not an empty site.")
        return 1
    if not listed:
        print("  REFUSING: sitemap has no <url> entries. A run that checks nothing "
              "must not report success.")
        return 1

    unlisted = sorted(set(deployed) - set(listed))
    absent = sorted(set(listed) - set(deployed))
    divergent = sorted(
        (u, listed[u], deployed[u][0]) for u in set(listed) & set(deployed)
        if listed[u] != deployed[u][0])

    faults = len(unlisted) + len(absent) + len(divergent)
    print(f"  {len(deployed)} deployed page(s) enumerated, {len(listed)} listed in the sitemap\n")

    if unlisted:
        print(f"  PRESENT BUT UNLISTED - {len(unlisted)} page(s) ship and the sitemap does not declare them:")
        for u in unlisted:
            print(f"        {u}   ({deployed[u][1]})")
        print()
    if absent:
        reasons = {}
        for relpath, why in skipped:
            path = "/" if relpath == "index.html" else (
                "/" + relpath[:-len("index.html")] if relpath.endswith("/index.html")
                else "/" + relpath)
            reasons[gen.ORIGIN + path] = why
        print(f"  LISTED BUT ABSENT - {len(absent)} URL(s) declared that this repository does not deploy:")
        for u in absent:
            print(f"        {u}   {reasons.get(u, 'no tracked file deploys to this URL')}")
        print()
    if divergent:
        print(f"  LASTMOD DIVERGENT - {len(divergent)} page(s) where the sitemap and git disagree:")
        for u, said, real in divergent:
            print(f"        {u}\n            sitemap says {said}, git says {real}")
        print()

    if faults:
        print(f"  SITEMAP DOES NOT DESCRIBE THE DEPLOYED SITE - {faults} fault(s).")
        print("  Regenerate with: python3 tools/make-sitemap.py")
        return 1

    print("  Sitemap matches the deployed enumeration: nothing unlisted, nothing "
          "absent, every lastmod agrees with git.")

    if "--no-live" in argv:
        print("  Live pass skipped (--no-live).")
        return 0

    bad = unchecked = 0
    for url in sorted(listed):
        problems, reached = live_problems(url)
        if not problems:
            continue
        if reached:
            bad += 1
            print(f"\n  LIVE FAIL  {url}")
        else:
            unchecked += 1
            print(f"\n  UNCHECKED  {url}")
        for p in problems:
            print(f"        {p}")
    print()
    if unchecked:
        print(f"  {unchecked} URL(s) could not be reached. That is not a finding about "
              "the site and does not fail this run.")
    if bad:
        print(f"  {bad} URL(s) were reached and are excluded from indexing.")
        return 1
    print(f"  {len(listed) - unchecked}/{len(listed)} reached and clean, to this client, just now.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
