#!/usr/bin/env node
/**
 * What a visitor actually receives at /check, compared against what that page says it
 * receives. Fails when the two disagree, IN EITHER DIRECTION.
 *
 * WHY A SECOND CHECK, WHEN check-public-checker.mjs ALREADY ASSERTS THIS
 * ---------------------------------------------------------------------
 * Because that one reads the file on disk, and the file on disk was clean.
 *
 * Measured 2026-08-17, minutes after /check went live: the served page loaded
 * `static.cloudflareinsights.com/beacon.min.js` and POSTed to `/cdn-cgi/rum`. Nothing in
 * this repository had changed. The domain sits behind Cloudflare, which injects its Real
 * User Monitoring beacon into every HTML response on the zone.
 *
 * AND IT INJECTS ONLY FOR A BROWSER. A plain `curl https://observerprotocol.org/check`
 * returns a page with no script tag at all; the same URL with a browser User-Agent and
 * `Accept: text/html` returns one with the beacon in it. So every instrument pointed at
 * this claim agreed it was true:
 *
 *   the build check          read the working tree       clean
 *   a curl of the live page  no browser headers          clean
 *   the page in a browser    on localhost, no CDN        clean
 *
 * Three green results, and the claim was false for every real visitor. Only loading the
 * production URL in a real browser found it. This file is the cheap version of that: it
 * sends the headers that trigger the injection, which is the difference between fetching
 * the thing and fetching something adjacent to it. CONVENTIONS section 9, one layer out.
 *
 * SYMMETRIC, AND THAT IS THE POINT
 * --------------------------------
 * It would have been easier to assert "the page loads nothing" and leave this red until
 * somebody turns the beacon off. A permanently red check is not an alarm, it is a thing
 * people learn to scroll past, and this repository already has a finding about one gate
 * hiding another.
 *
 * So the shape is the one credential-expectations.json uses. DISCLOSED below is what the
 * page tells a visitor it loads, each entry with its reason. The run fails when:
 *
 *   - something loads that is NOT disclosed          a new injection nobody decided on
 *   - something disclosed is NO LONGER THERE         the page discloses a thing that is gone
 *
 * The second is the direction that matters after somebody acts on this. The day the
 * beacon is turned off at the zone, this goes red and says so, and the paragraph on
 * /check that discloses it comes out in the same commit that proves it is gone. An
 * allowlist reason describing a control that no longer exists is indistinguishable from a
 * real exception, which is CONVENTIONS section 13, and this is the mechanism that stops it.
 *
 *   node scripts/check-served-page-loads-nothing.mjs
 *   node scripts/check-served-page-loads-nothing.mjs https://some-preview.netlify.app
 *
 * UNREACHABLE IS REPORTED, NOT PASSED. A check that cannot reach its subject must say it
 * did not look.
 */

const base = process.argv[2] ?? 'https://observerprotocol.org';
const PATH = '/check';

// The headers matter. Without them Cloudflare serves an uninjected page and this file
// would report clean on a page that is not clean, which is the exact failure it exists for.
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

// What the page tells a visitor it loads. Nothing else may load, and each of these must
// still be there. Add an entry only alongside the paragraph on /check that discloses it.
const DISCLOSED = [
  {
    id: 'cloudflare-rum',
    match: /cloudflareinsights|\/cdn-cgi\/rum|beacon\.min\.js/i,
    what: "Cloudflare's RUM beacon",
    why: 'Injected at the edge into every HTML response on this zone, not by anything in this repository. /check discloses it in the note headed "One thing on this page is not this page\'s". Turning it off is a zone setting and lives outside this repo; when it goes, that note goes with it.',
  },
];

// A LOAD, not a mention. A URL inside the embedded signed document is text a reader can
// see; these are the things a browser goes and gets.
const LOADS = [
  [/<script[^>]*\bsrc\s*=\s*["']?([^"'\s>]+)/gi, 'a script'],
  [/<link[^>]*\bhref\s*=\s*["']?([^"'\s>]+)/gi, 'a linked resource'],
  [/<iframe[^>]*\bsrc\s*=\s*["']?([^"'\s>]+)/gi, 'an iframe'],
  [/<img[^>]*\bsrc\s*=\s*["']?([^"'\s>]+)/gi, 'an image'],
  [/@import\s+["']?([^"'\s;]+)/gi, 'a CSS import'],
  [/url\(\s*["']?(https?:[^"')\s]+)/gi, 'a CSS url()'],
];

const url = base + PATH;
let body;
try {
  const res = await fetch(url, { headers: BROWSER_HEADERS, redirect: 'follow' });
  if (!res.ok) {
    console.log(`NOT CHECKED: ${url} returned HTTP ${res.status}. Reported rather than passed.`);
    console.log('  A check that cannot reach its subject must say it did not look.');
    process.exit(0);
  }
  body = await res.text();
} catch (e) {
  console.log(`NOT CHECKED: ${url} could not be fetched (${e.message}). Reported rather than passed.`);
  console.log('  A check that cannot reach its subject must say it did not look.');
  process.exit(0);
}

// The page's own embedded JSON example is data, not a load.
const page = body.replace(/<script type="application\/json"[\s\S]*?<\/script>/g, '');

const loaded = [];
for (const [re, kind] of LOADS) {
  for (const m of page.matchAll(re)) loaded.push({ kind, ref: m[1] ?? m[0] });
}

const undisclosed = loaded.filter((l) => !DISCLOSED.some((d) => d.match.test(l.ref)));
const missing = DISCLOSED.filter((d) => !d.match.test(page));

for (const d of DISCLOSED) {
  if (!missing.includes(d)) console.log(`ok      ${d.what} is present, and ${PATH} discloses it`);
}
for (const l of undisclosed) console.log(`FAIL    ${l.kind} nobody disclosed: ${l.ref}`);
for (const d of missing) console.log(`FAIL    ${d.what} is disclosed by ${PATH} and is no longer served`);

if (undisclosed.length) {
  console.error('');
  console.error(`${url} loads something the page does not tell a visitor about.`);
  console.error('');
  console.error('  /check says what it loads. If the CDN in front of this origin starts adding');
  console.error('  something else, that sentence is wrong for every real visitor while every check');
  console.error('  reading this repository stays green. Either the injection goes, or it is');
  console.error('  disclosed on the page AND added to DISCLOSED here, in the same commit.');
  process.exit(1);
}

if (missing.length) {
  console.error('');
  console.error(`${url} no longer loads something it still discloses.`);
  console.error('');
  console.error('  This is the good direction and it is still a failure. The note on /check now');
  console.error('  describes a beacon that is not there, and a disclosure of a thing that has gone');
  console.error('  is indistinguishable from a real one. Remove the note and the DISCLOSED entry,');
  console.error('  and the strong sentence at the top of the page can say the whole truth again.');
  process.exit(1);
}

console.log('');
console.log(`What a visitor receives at ${PATH} is exactly what the page says it receives.`);
