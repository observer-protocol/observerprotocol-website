#!/usr/bin/env node
/**
 * The page's copy of a signing construction, held to the package's.
 *
 * Why this file exists
 * --------------------
 * /check.html loads nothing. That is the property the page's central sentence rests on, and
 * it means the page CANNOT import @observer-protocol/policy-engine at runtime. So the
 * refusal route carries its own copy of `signableFromRefusal` and `refusalPayload`.
 *
 * A second copy of a signing construction is the defect this estate keeps finding, and
 * `scripts/verify-published-credentials.mjs` says so in as many words about a rebuild it
 * refused to do for exactly this reason. The copy is not avoidable here; what is avoidable
 * is letting the two agree by inspection.
 *
 * So this compares BYTES, not behaviour. For every refusal record this repository carries,
 * the page's builder and the package's builder must produce the identical payload string.
 * A divergence of one character in one field name turns this red, which is the failure mode
 * that would otherwise show up as a verdict on somebody else's artifact being quietly wrong.
 *
 * WHAT THIS DOES NOT ESTABLISH. It compares the two builders over the records that exist
 * here. A record shape neither has met is not covered by it, and cannot be: that is what the
 * page's own coverage derivation is for, which reports what a signature reaches by rebuilding
 * the payload without each field rather than by consulting a list.
 *
 *   node scripts/check-page-payload-parity.mjs
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { signableFromRefusal, refusalPayload } from '@observer-protocol/policy-engine';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'check.html'), 'utf8');

// THE LOCKFILE, not the package's own package.json, which its `exports` map does not expose.
// The lockfile is also the version sync-engine-version.mjs holds the pages to, so the version
// named in a failure here is the same one /check.html prints to a reader.
const lock = JSON.parse(readFileSync(join(root, 'scripts/package-lock.json'), 'utf8'));
const engineVersion =
  lock.packages?.['node_modules/@observer-protocol/policy-engine']?.version ?? 'unknown';

const failures = [];
const fail = (m) => failures.push(m);

// ─── 1. Load the page's own builders ──────────────────────────────────────────────
//
// The same technique check-public-checker.mjs uses: evaluate the page's script, which
// returns early with no document after publishing globalThis.OP_CHECK. This is the page's
// code and not a re-implementation of it, which is the only way the comparison means
// anything.
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
  .filter((m) => !/type\s*=\s*"application\/json"/i.test(m[0].slice(0, m[0].indexOf('>'))))
  .map((m) => m[1]);
const verifier = scripts.find((s) => s.includes('globalThis.OP_CHECK'));
if (!verifier) {
  console.error('FAIL: no <script> in check.html publishes globalThis.OP_CHECK.');
  process.exit(1);
}
new Function(verifier)();
const OP = globalThis.OP_CHECK;
for (const name of ['signableFromRefusal', 'refusalPayload', 'coverageOf']) {
  if (typeof OP?.[name] !== 'function') {
    console.error(`FAIL: check.html does not export ${name} on OP_CHECK, so it cannot be compared`);
    console.error('      against the package. Removing that export would silently end this check,');
    console.error('      which is why its absence is a failure rather than a skip.');
    process.exit(1);
  }
}

// ─── 2. Every refusal record this repository carries ──────────────────────────────
const records = [];

const embedded = html.match(/<script type="application\/json" id="op-refusal-sample">([\s\S]*?)<\/script>/);
if (!embedded) {
  fail('check.html carries no <script type="application/json" id="op-refusal-sample"> block. The refusal example is embedded so that loading it costs no request, and its absence would leave the refusal route with no worked example.');
} else {
  try {
    records.push({ label: 'check.html embedded refusal example', record: JSON.parse(embedded[1]) });
  } catch (e) {
    fail(`the embedded refusal example is not parseable JSON: ${e.message}`);
  }
}

const samplesDir = join(root, 'verify-samples');
for (const file of readdirSync(samplesDir).sort()) {
  if (!file.endsWith('.json')) continue;
  let parsed;
  try { parsed = JSON.parse(readFileSync(join(samplesDir, file), 'utf8')); } catch { continue; }
  if (parsed?.k === 'refused') records.push({ label: `verify-samples/${file}`, record: parsed });
}

if (records.length === 0) {
  console.error('FAIL: no refusal records found to compare. A parity check with an empty population');
  console.error('      reports success and establishes nothing, so an empty run is a failure.');
  process.exit(1);
}

// ─── 3. Bytes, not behaviour ──────────────────────────────────────────────────────
const firstDifference = (a, b) => {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i;
  return n;
};

let compared = 0;
for (const { label, record } of records) {
  let theirs, ours, theirErr, ourErr;
  try { theirs = refusalPayload(signableFromRefusal(record)); } catch (e) { theirErr = e; }
  try { ours = OP.refusalPayload(OP.signableFromRefusal(record)); } catch (e) { ourErr = e; }

  // A record BOTH refuse to build is agreement too, and it is the case a naive comparison
  // of two undefineds would report as a pass without noticing either had thrown.
  if (theirErr && ourErr) { compared++; console.log(`ok    both refuse to rebuild  ${label}`); continue; }
  if (theirErr) { fail(`${label}: the package refuses to rebuild this record (${theirErr.message.slice(0, 120)}) and the page builds it anyway. The page is more permissive than the construction it claims to run.`); continue; }
  if (ourErr) { fail(`${label}: the page refuses to rebuild this record (${ourErr.message.slice(0, 120)}) and the package builds it. A reader would be told their record cannot be checked when it can.`); continue; }

  if (theirs !== ours) {
    const at = firstDifference(theirs, ours);
    fail(
      `${label}: the page and the package build DIFFERENT payloads.\n` +
      `      first difference at byte ${at}\n` +
      `      package: ${JSON.stringify(theirs.slice(Math.max(0, at - 40), at + 60))}\n` +
      `      page:    ${JSON.stringify(ours.slice(Math.max(0, at - 40), at + 60))}`
    );
    continue;
  }
  compared++;
  console.log(`ok    identical bytes       ${label}  (${theirs.length} bytes)`);
}

// ─── 4. The coverage derivation is not vacuous ────────────────────────────────────
//
// coverageOf reports what a signature reaches by REMOVING each field and rebuilding. If it
// ever returned everything as covered, or nothing, the page would print a boundary that is
// not a boundary. Both directions have to be non-empty on a record that has both.
const forCoverage = records.find((r) => r.record?.reason !== undefined && r.record?.code !== undefined);
if (forCoverage) {
  const c = OP.coverageOf(forCoverage.record);
  if (!c) {
    fail(`coverageOf returned null for ${forCoverage.label}, whose payload rebuilds, so the page would print no boundary at all.`);
  } else {
    if (!c.covered.includes('code')) fail(`coverageOf does not report 'code' as covered for ${forCoverage.label}. The refusal code is inside the signed payload and a reader told otherwise would understate what they hold.`);
    if (!c.uncovered.includes('reason')) fail(`coverageOf does not report 'reason' as uncovered for ${forCoverage.label}. The reason prose is NOT inside the signed payload, and a reader told otherwise would carry a green result across a boundary it does not reach.`);
    if (c.covered.length === 0 || c.uncovered.length === 0) fail(`coverageOf returned an empty list in one direction for ${forCoverage.label} (${c.covered.length} covered, ${c.uncovered.length} uncovered). A boundary with nothing on one side of it is not a boundary.`);
    console.log(`ok    coverage derives both sides  ${c.covered.length} covered, ${c.uncovered.length} not, on ${forCoverage.label}`);
  }
} else {
  fail('no refusal record carries both a reason and a code, so the coverage derivation was not exercised in either direction.');
}

// ─── 5. Report ────────────────────────────────────────────────────────────────────
console.log('');
if (failures.length) {
  console.error(`The page's copy of the refusal construction has diverged from the package (${engineVersion}) — ${failures.length} problem(s):\n`);
  for (const f of failures) console.error(`  ${f}`);
  console.error('\n  The page cannot import the package: it loads nothing, and that is the claim the');
  console.error('  page is built around. So the copy stays and this check is what makes it honest.');
  console.error('  Fix the PAGE to match the package, never the other way round.');
  process.exit(1);
}
console.log(`The page builds byte-identical refusal payloads to @observer-protocol/policy-engine`);
console.log(`${engineVersion}, over ${compared} record(s). The page's copy of the construction is`);
console.log('not trusted here; it is compared.');
