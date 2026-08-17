#!/usr/bin/env node
/**
 * served-page-audit — what a page actually loads, as a browser receives it.
 *
 * STANDALONE. No repository, no checkout, no npm install, no dependencies. One file and
 * a Node that has global fetch (18+). Copy it to wherever the schedule runs.
 *
 *   node served-page-audit.mjs
 *   node served-page-audit.mjs https://observerprotocol.org/check
 *   node served-page-audit.mjs https://observerprotocol.org/check --disclose=cloudflareinsights
 *
 * WHY IT IS A SEPARATE FILE FROM ANYTHING IN A REPOSITORY
 * ------------------------------------------------------
 * The defect it watches for is produced by a CDN configuration change, and a CDN
 * configuration change produces no commit. A check that runs on push therefore cannot
 * see it: nothing in the repository changes, CI stays green, and the served page is
 * wrong. That is the same scope error as reading a file to establish what a visitor
 * receives, one layer out, so the fix is the same shape — measure the subject, on a
 * clock that does not depend on anybody editing anything.
 *
 * WHY THE HEADERS
 * ---------------
 * Measured 2026-08-17 on observerprotocol.org: Cloudflare injects its Web Analytics
 * beacon into HTML responses ONLY when the request carries browser headers. A plain
 * `curl` of the same URL comes back with no script tag at all. Fetching the thing is
 * not enough; it has to be fetched as the reader.
 *
 * SYMMETRIC, AND THAT IS THE POINT
 * --------------------------------
 * `--disclose` lists what the page tells a visitor it loads. The run fails when
 * something loads that is NOT disclosed, and ALSO when something disclosed is no longer
 * there. The second direction is what stops a page carrying a disclosure of a beacon
 * that was turned off months ago: a disclosure describing something that is gone is
 * indistinguishable from a real one.
 *
 * With no --disclose the assertion is "this page loads nothing", which is the state
 * /check is written for.
 *
 * EXIT CODES, because this is meant to be scheduled
 *   0  what loads is exactly what is disclosed
 *   1  mismatch, in either direction
 *   2  could not reach the page. NOT a pass. A check that cannot reach its subject
 *      must say it did not look, and a scheduler must be able to tell that apart
 *      from a clean result.
 */

const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith('--')) ?? 'https://observerprotocol.org/check';
const disclosed = args
  .filter((a) => a.startsWith('--disclose='))
  .flatMap((a) => a.slice('--disclose='.length).split(','))
  .map((s) => s.trim())
  .filter(Boolean);

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

// A LOAD, not a mention. A URL printed inside a page, or inside a signed document a page
// displays, is text a reader can see. These are the things a browser goes and gets.
const LOADS = [
  [/<script[^>]*\bsrc\s*=\s*["']?([^"'\s>]+)/gi, 'script'],
  [/<link[^>]*\bhref\s*=\s*["']?([^"'\s>]+)/gi, 'link'],
  [/<iframe[^>]*\bsrc\s*=\s*["']?([^"'\s>]+)/gi, 'iframe'],
  [/<img[^>]*\bsrc\s*=\s*["']?([^"'\s>]+)/gi, 'image'],
  [/<embed[^>]*\bsrc\s*=\s*["']?([^"'\s>]+)/gi, 'embed'],
  [/<object[^>]*\bdata\s*=\s*["']?([^"'\s>]+)/gi, 'object'],
  [/@import\s+["']?([^"'\s;]+)/gi, 'css-import'],
  [/url\(\s*["']?(https?:\/\/[^"')\s]+)/gi, 'css-url'],
];

let body, headers;
try {
  const res = await fetch(url, { headers: BROWSER_HEADERS, redirect: 'follow' });
  headers = res.headers;
  if (!res.ok) {
    console.log(`NOT CHECKED  ${url} returned HTTP ${res.status}.`);
    console.log('             Reported rather than passed. This is not a clean result.');
    process.exit(2);
  }
  body = await res.text();
} catch (e) {
  console.log(`NOT CHECKED  ${url} could not be fetched: ${e.message}`);
  console.log('             Reported rather than passed. This is not a clean result.');
  process.exit(2);
}

// Data a page carries is not a resource a page loads. A JSON island is displayed, not fetched.
const page = body.replace(/<script[^>]*type=["']application\/json["'][\s\S]*?<\/script>/gi, '');

const loaded = [];
for (const [re, kind] of LOADS) {
  for (const m of page.matchAll(re)) {
    const ref = m[1];
    if (ref && !loaded.some((l) => l.ref === ref)) loaded.push({ kind, ref });
  }
}

const isDisclosed = (ref) => disclosed.some((d) => ref.includes(d));
const undisclosed = loaded.filter((l) => !isDisclosed(l.ref));
const missing = disclosed.filter((d) => !page.includes(d));

console.log(`url          ${url}`);
console.log(`server       ${headers.get('server') ?? '(none)'}`);
console.log(`cf-ray       ${headers.get('cf-ray') ?? '(none)'}`);
console.log(`disclosed    ${disclosed.length ? disclosed.join(', ') : '(nothing: asserting the page loads nothing)'}`);
console.log('');

if (!loaded.length) {
  console.log('loads        (nothing)');
} else {
  for (const l of loaded) {
    console.log(`${isDisclosed(l.ref) ? 'ok      ' : 'FAIL    '} ${l.kind.padEnd(10)} ${l.ref}`);
  }
}
for (const d of missing) console.log(`FAIL     disclosed  ${d}  is disclosed and no longer served`);

if (undisclosed.length || missing.length) {
  console.log('');
  if (undisclosed.length) {
    console.log('This page loads something nobody disclosed.');
    console.log('  Either the injection goes, or the page discloses it AND it is added to');
    console.log('  --disclose here, in the same change.');
  }
  if (missing.length) {
    console.log('This page discloses something it no longer loads.');
    console.log('  The good direction, and still a failure: the page now describes something');
    console.log('  that is not there. Remove the disclosure and the --disclose entry together.');
  }
  process.exit(1);
}

console.log('');
console.log('What a visitor receives is exactly what is disclosed.');
