#!/usr/bin/env python3
"""Generate sitemap.xml for observerprotocol.org.

THE EXCLUSIONS ARE DERIVED FROM netlify.toml, NOT LISTED HERE. That is the whole
design. This site retires pages by adding a 410 rule to netlify.toml and deleting
the file, and it hides non-web files by adding a forced 404 rule. A hand-written
exclusion list would be correct on the day it was written and would start listing
withdrawn pages the next time someone retires one, which is the failure this
generator exists to prevent. If a rule in netlify.toml says a path does not serve
200, this script does not put that path in the sitemap, and nobody has to
remember to tell it.

THE CANONICAL URL COMES FROM THE SAME PLACE. netlify.toml declares extension-less
canonical URLs as 200 rewrites (`/crossrail` -> `/crossrail.html`). Where such a
rule exists, the extension-less form is what ships, because that is what the file
calls canonical.

WHAT THIS CANNOT DO, and it matters because a sitemap is a claim about what is
reachable:

  * It reads the repository, not the live site. A page can be listed here and
    fail in production for reasons no file records: a Cloudflare rule, a DNS
    change, an origin error. Run tools/check-sitemap.py against the live domain
    to close that gap. This script writes the claim; that one tests it.
  * It cannot tell whether a page SHOULD be indexed. A page that serves 200 and
    is worth nothing to a reader is still listed. Judging that is human.
  * lastmod is the last commit that touched the file. A commit that changed only
    a comment moves the date; a change to a shared stylesheet does not.
  * IT IS ONE COMMIT BEHIND BY CONSTRUCTION. lastmod comes from git history, so a
    run made before committing an edit reports the PREVIOUS commit's date for the
    file just edited. Regenerate AFTER committing content, or the sitemap
    understates every page in the same change. This is a property of deriving the
    date rather than stamping it, and it is the price of the date meaning
    something; it is written down here because it is invisible in the output.

Run: python3 tools/make-sitemap.py
"""

import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
ORIGIN = "https://observerprotocol.org"

# Pages that serve 200 but are not destinations. Kept short and justified, because
# every entry here is a hand-maintained exception to a derived list.
def declared_canonical(relpath):
    """The href of a <link rel="canonical"> in the file's head, or None.

    Read from the repository rather than fetched, because this runs before the
    change ships and the point is to keep the sitemap and the page agreeing at
    the moment they are committed together.
    """
    try:
        text = (ROOT / relpath).read_text(errors="replace")
    except OSError:
        return None
    head = text[:text.find("</head>") + 7] if "</head>" in text else text[:8000]
    head = re.sub(r"<!--.*?-->", "", head, flags=re.S)
    m = re.search(r'<link[^>]+rel=["\']canonical["\'][^>]*href=["\']([^"\']+)', head, re.I)
    return m.group(1) if m else None


NOT_A_DESTINATION = {
    # The target of every forced-404 and 410 rule in netlify.toml. It serves 200
    # when fetched directly, so no rule excludes it, and listing the page that
    # says "this was withdrawn" as a live destination would be absurd.
    "gone.html",
}


def redirect_rules():
    """Every [[redirects]] block in netlify.toml, as dicts. Order preserved.

    Netlify applies the FIRST matching rule, so order is meaning, not decoration.
    """
    toml = (ROOT / "netlify.toml").read_text()
    rules = []
    for block in re.split(r"^\[\[redirects\]\]\s*$", toml, flags=re.M)[1:]:
        block = re.split(r"^\[\[", block, flags=re.M)[0]
        rule = {}
        for key in ("from", "to"):
            m = re.search(rf'^\s*{key}\s*=\s*"([^"]*)"', block, re.M)
            if m:
                rule[key] = m.group(1)
        m = re.search(r"^\s*status\s*=\s*(\d+)", block, re.M)
        rule["status"] = int(m.group(1)) if m else 301
        rule["force"] = bool(re.search(r"^\s*force\s*=\s*true", block, re.M))
        if "from" in rule:
            rules.append(rule)
    return rules


def matches(pattern, path):
    """Netlify path matching: :placeholder segments and a trailing splat."""
    if pattern.endswith("/*"):
        return path.startswith(pattern[:-1])
    regex = re.sub(r":[A-Za-z_][A-Za-z0-9_]*", "[^/]+", re.escape(pattern)
                   .replace(r"\:", ":"))
    regex = regex.replace(r"\[\^/\]\+", "[^/]+")
    return re.fullmatch(regex, path) is not None


def first_match(rules, path):
    for rule in rules:
        if rule["from"].startswith("http"):
            continue  # host-level rule, not a path rule
        if matches(rule["from"], path):
            return rule
    return None


def git_lastmod(relpath):
    """Committer date of the last commit touching relpath, as YYYY-MM-DD.

    Committer rather than author date: a cherry-picked or rebased commit keeps
    its original author date, which would date a page before the content it
    describes existed. Returns None rather than guessing.
    """
    try:
        out = subprocess.run(
            ["git", "-C", str(ROOT), "log", "-1", "--format=%cs", "--", relpath],
            capture_output=True, text=True, timeout=10)
    except (OSError, subprocess.SubprocessError):
        return None
    if out.returncode != 0:
        return None
    date = out.stdout.strip()
    return date if re.fullmatch(r"\d{4}-\d{2}-\d{2}", date) else None


def tracked_html():
    out = subprocess.run(["git", "-C", str(ROOT), "ls-files", "*.html"],
                         capture_output=True, text=True, check=True)
    return sorted(p for p in out.stdout.split("\n") if p)


def url_for(relpath, rules):
    """The canonical URL for a tracked file, or None if it should not be listed.

    Returns a (url, reason_if_skipped) pair so the caller can report what was
    left out and why. A sitemap generator that silently drops pages is the same
    defect as one that silently lists withdrawn ones.
    """
    if relpath in NOT_A_DESTINATION:
        return None, "not a destination"

    # index.html in a directory serves at the directory URL.
    if relpath == "index.html":
        path = "/"
    elif relpath.endswith("/index.html"):
        path = "/" + relpath[: -len("index.html")]
    else:
        path = "/" + relpath

    rule = first_match(rules, path)
    if rule and rule["status"] in (404, 410):
        return None, f"netlify.toml returns {rule['status']}"
    if rule and rule["status"] in (301, 302, 308):
        return None, f"netlify.toml redirects it ({rule['status']} to {rule['to']})"

    # A PAGE THAT CANONICALISES SOMEWHERE ELSE DOES NOT BELONG IN THIS SITEMAP.
    # The two artifacts make opposite claims: a sitemap entry says "index this
    # URL", a canonical pointing elsewhere says "index that one instead". Listing
    # such a page asks a crawler to resolve a contradiction we authored.
    #
    # Derived rather than listed, for the same reason the 410 exclusions are:
    # agentic-terminal.html canonicalises to agenticterminal.io as of 2026-08-18,
    # and the next page to do so should leave the sitemap without anyone
    # remembering that it must.
    declared = declared_canonical(relpath)
    if declared and declared.rstrip("/") != (ORIGIN + path).rstrip("/"):
        return None, f"canonicalises to {declared}"

    # An extension-less canonical is declared by a 200 rewrite pointing AT this
    # file. Prefer it: netlify.toml calls it canonical, so the sitemap should
    # agree with the site rather than with the filesystem.
    for r in rules:
        if r["status"] == 200 and r.get("to") == path and not r["from"].startswith("http") \
                and "*" not in r["from"] and ":" not in r["from"]:
            return ORIGIN + r["from"], None

    return ORIGIN + path, None


def main():
    rules = redirect_rules()
    entries, skipped, undated = [], [], []

    for relpath in tracked_html():
        url, reason = url_for(relpath, rules)
        if url is None:
            skipped.append((relpath, reason))
            continue
        lastmod = git_lastmod(relpath)
        if lastmod is None:
            undated.append(relpath)
        entries.append((url, lastmod))

    if undated:
        # Fails rather than omitting the element for those pages. A sitemap where
        # some entries carry a date and others do not is not a smaller claim, it
        # is an inconsistent one, and the cause is always something worth knowing.
        print("  REFUSING: no commit date for: " + ", ".join(undated))
        return 1

    if not entries:
        print("  REFUSING: no pages to list. That is not a small sitemap, "
              "it is a broken enumeration.")
        return 1

    body = "".join(
        f"  <url>\n    <loc>{url}</loc>\n    <lastmod>{lastmod}</lastmod>\n  </url>\n"
        for url, lastmod in sorted(entries))
    (ROOT / "sitemap.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + body + "</urlset>\n")

    print(f"  sitemap.xml: {len(entries)} URL(s)")
    print(f"  excluded {len(skipped)}, each with its reason:")
    for relpath, reason in skipped:
        print(f"    {relpath:34} {reason}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
