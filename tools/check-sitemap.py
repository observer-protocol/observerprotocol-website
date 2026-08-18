#!/usr/bin/env python3
"""Fetch every URL in sitemap.xml from the live site and report what it returns.

make-sitemap.py reads the repository. This reads the internet. The two answer
different questions and the second is the one a crawler asks: a page can be
listed from a correct reading of netlify.toml and still fail in production for a
reason no file in this repository records.

A sitemap is a claim that each URL is a live, canonical, indexable destination.
This checks the parts of that claim a fetch can settle:

  * the status code is 200
  * no X-Robots-Tag header excludes it
  * no <meta name="robots"> in the document excludes it
  * where the document declares a canonical, it points at the URL we listed

WHAT IT CANNOT SETTLE: whether the page is worth indexing, whether its content
matches what the sitemap implies, or whether a crawler from another IP range sees
what this machine sees. A pass means "these URLs served correctly to this client
just now", never "the sitemap is right".

Run: python3 tools/check-sitemap.py [--sitemap URL_OR_PATH]
"""

import pathlib
import re
import sys
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent

# Cloudflare fronts this domain and 403s the default Python-urllib signature
# (Error 1010, browser_signature_banned, confirmed 2026-07-14). Without an
# explicit User-Agent every request here fails closed on a 403 and the script
# reports the whole sitemap broken.
UA = {"User-Agent": "observerprotocol-sitemap-check/1.0"}


def sitemap_urls(source):
    if source.startswith("http"):
        req = urllib.request.Request(source, headers=UA)
        text = urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "replace")
    else:
        text = pathlib.Path(source).read_text()
    return re.findall(r"<loc>([^<]+)</loc>", text)


def check(url):
    """Return a list of problems with this URL. Empty list means clean."""
    problems = []
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=30) as r:
            status = r.status
            xrobots = r.headers.get("X-Robots-Tag")
            body = r.read().decode("utf-8", "replace")
            final = r.geturl()
    except urllib.error.HTTPError as e:
        return [f"HTTP {e.code}"]
    except Exception as e:
        return [f"{type(e).__name__}: {e}"]

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
    return problems


def main(argv):
    source = str(ROOT / "sitemap.xml")
    if "--sitemap" in argv:
        source = argv[argv.index("--sitemap") + 1]

    urls = sitemap_urls(source)
    if not urls:
        print("  REFUSING: sitemap has no URLs. Nothing was checked, and a run "
              "that checks nothing must not report success.")
        return 1

    print(f"  checking {len(urls)} URL(s) from {source}\n")
    bad = 0
    for url in urls:
        problems = check(url)
        if problems:
            bad += 1
            print(f"  FAIL  {url}")
            for p in problems:
                print(f"        {p}")
    print()
    if bad:
        print(f"  {len(urls) - bad}/{len(urls)} clean, {bad} FAILING")
        return 1
    print(f"  {len(urls)}/{len(urls)} returned 200 with nothing excluding them, "
          "to this client, just now")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
