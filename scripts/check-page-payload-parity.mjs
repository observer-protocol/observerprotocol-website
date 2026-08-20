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
 * ── TWO SHAPES ARE COVERED, AND A THIRD WOULD NEED ITS OWN RUN ──────────────────────────────
 *
 *   store shape   what a store file holds: `k`, `authority`, `spend`, `attribution`, signature
 *                 inline. Compared builder-to-builder, byte for byte, against the package.
 *   served shape  what GET /v1/refusals sends and what a console's copy button emits:
 *                 `refusedBy`, `attempted`, `agentId`/`mandateId` at the top level, signature
 *                 as an object. The package has no equivalent to compare against, because the
 *                 normalisation lives in the payment server rather than in the package. THE
 *                 ORACLE IS THE SIGNATURE: a wrong field mapping rebuilds different bytes and
 *                 the signature stops verifying. A mapping cannot be wrong and pass.
 *
 * IF A THIRD SHAPE APPEARS, ADD FIXTURES OF IT AND LET THE ORACLE RUN OVER THEM. Do not assume
 * this mapping generalises. The two here already differ in field names, in nesting, in where
 * the signature lives, and in whether absence is spelled `null` or omitted. A third could
 * differ again in a way that still rebuilds and still produces the wrong bytes, and the only
 * thing that can tell you is a signature refusing.
 *
 * WHAT THIS DOES NOT ESTABLISH. It compares over the records that exist here. A record shape
 * neither has met is not covered by it, and cannot be: that is what the page's own coverage
 * derivation is for, which reports what a signature reaches by rebuilding the payload without
 * each field rather than by consulting a list.
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
for (const name of ['signableFromRefusal', 'refusalPayload', 'coverageOf', 'signableFromRefusalRow', 'check']) {
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

// ─── 5. The served shape, against the signature ───────────────────────────────────
//
// Real served rows. The package cannot be asked what these should rebuild to, because the
// normalisation lives in op-mcp-payment-server/src/http/reads.ts and is exported from no
// package this repository depends on. So the check is not a comparison, it is a challenge:
// rebuild the bytes through the page's own normalisation and require the record's OWN
// signature to verify over them.
//
// That is a stronger oracle than a byte comparison against a second copy would be. A copy can
// be wrong in the same way twice. A signature cannot.
import { ed25519Verify, base58Decode } from '@observer-protocol/policy-engine';

const servedPath = join(root, 'scripts/__fixtures__/refusals-served.json');
let servedRows = [];
try {
  servedRows = JSON.parse(readFileSync(servedPath, 'utf8')).refusals ?? [];
} catch (e) {
  fail(`the served-shape fixture at scripts/__fixtures__/refusals-served.json could not be read (${e.message}). The served shape is what a console's copy button emits, and it is the loop this page exists to close.`);
}

const signable = servedRows.filter((r) => r?.signature && r.signature.state !== 'unsigned' && typeof r.signature.value === 'string');

// SAME DISCIPLINE AS THE POPULATION CHECK ABOVE. An empty served population would report a
// pass over nothing, which is the failure this whole file argues against.
if (signable.length === 0) {
  fail('no SIGNED served rows to check. A served-shape run over an empty population establishes nothing and must not report success.');
}

let servedVerified = 0;
for (const row of signable) {
  let ok;
  try {
    const bytes = OP.refusalPayload(OP.signableFromRefusal(OP.signableFromRefusalRow(row)));
    const key = Buffer.from(base58Decode(row.signature.signedBy.slice('did:key:z'.length)).slice(2));
    ok = ed25519Verify(key, Buffer.from(bytes, 'utf8'), Buffer.from(row.signature.value, 'base64'));
  } catch (e) {
    ok = `threw: ${e.message.slice(0, 100)}`;
  }
  if (ok === true) { servedVerified++; console.log(`ok    served row verifies    ${row.refusalId}  ${row.code}`); }
  else fail(`served row ${row.refusalId} (${row.code}) does not verify after normalisation: ${ok}. The mapping from the served shape to the signed form is wrong in at least one field, and the signature is what caught it.`);
}

// AND THE PAGE ITSELF, not just the exported helpers. A normalisation that works when called
// directly and is never reached because the classifier does not recognise the shape is the
// defect this section was added for.
let servedThroughPage = 0;
for (const row of signable) {
  const r = await OP.check(JSON.stringify(row), '');
  if (r.outcome === 'checked-refusal' && r.state === 'verifies') servedThroughPage++;
  else fail(`served row ${row.refusalId} does not reach a verifying verdict THROUGH THE PAGE: outcome=${r.outcome} state=${r.state}. The helpers can be right while the classifier never routes to them.`);
}
console.log(`ok    served rows reach a verdict through OP_CHECK.check  ${servedThroughPage}/${signable.length}`);

// ─── v3, AGAINST THE ENGINE'S OWN BYTES ───────────────────────────────────────────
//
// The pinned package has no v3: rc.12 is what npm serves and the v3 construction is unpublished,
// living on op-policy-engine at 6f58fcb. So there is nothing here to compare the page against
// field by field, exactly as with the served shape, and the answer is the same one: the
// signature.
//
// These fixtures were signed over bytes THE ENGINE produced. A page whose rebuild differs from
// the engine's in any field cannot verify them. That makes them an oracle for the v3
// construction without waiting on a publish, and it is why they are worth committing rather
// than deriving here: a fixture this file generated from this file's own understanding would
// agree with it by construction and establish nothing.
//
// WHAT THEY DO NOT ESTABLISH: anything about a production record. The keys are throwaway and
// the records are engine-derived. A production v3 record spanning both arms is asked for.
const v3Path = join(root, 'scripts/__fixtures__/refusals-v3.json');
let v3Rows = [];
try {
  v3Rows = JSON.parse(readFileSync(v3Path, 'utf8')).refusals ?? [];
} catch (e) {
  fail(`the v3 fixture at scripts/__fixtures__/refusals-v3.json could not be read (${e.message}). v3 is the version the enforcement point issues, so a build with no v3 oracle is a build that cannot tell whether this page accuses every new record.`);
}
if (v3Rows.length === 0) {
  fail('no v3 records to check. The construction this page ships for v3 would then be unoracled, which is how a false negative reaches a reader.');
}
// BOTH ARMS, ASSERTED. v3 changes appliedBound in two places and they are on different arms, so
// a population carrying one arm leaves the other's gating unexercised.
const v3Arms = new Set(v3Rows.map((r) => r?.appliedBound?.state));
for (const arm of ['not-supplied', 'recorded']) {
  if (!v3Arms.has(arm)) fail(`the v3 population carries no \`${arm}\` bound. v3 adds \`reason\` on not-supplied and signs \`note\` on recorded; a population missing an arm cannot see that arm's gating.`);
}
// THE RECORDED ARM'S NOTE, WHICH THE LIVE CORPUS DOES NOT PRODUCE. 18 of 145 refusals sit on
// that arm and none carries a note, so a population drawn only from what the service serves would
// exercise the arm WITHOUT the field v3 exists to sign, and this page could drop it and pass.
if (!v3Rows.some((r) => r?.appliedBound?.state === 'recorded' && r.appliedBound.note !== undefined)) {
  fail('no v3 record carries a `recorded` bound WITH a note. That arm is the one v3 newly signs and the live deployment does not emit it, so without a constructed vector the field can be dropped silently and every check still passes.');
}

let v3Verified = 0;
for (const row of v3Rows) {
  let ok;
  try {
    const bytes = OP.refusalPayload(OP.signableFromRefusal(row));
    const key = Buffer.from(base58Decode(row.signedBy.slice('did:key:z'.length)).slice(2));
    ok = ed25519Verify(key, Buffer.from(bytes, 'utf8'), Buffer.from(row.signature, 'base64'));
  } catch (e) { ok = `threw: ${e.message.slice(0, 110)}`; }
  if (ok === true) { v3Verified++; console.log(`ok    v3 verifies             ${row.refusalId}  ${row.appliedBound.state} arm`); }
  else fail(`a v3 record on the ${row.appliedBound?.state} arm does not verify: ${ok}. The bytes were signed by the engine, so this page's v3 rebuild differs from it and every v3 record would read as a bad signature.`);
}

// THE NEGATIVE CONTROL CC CORPUS BUILT INTO THE VECTORS. Each rejects a one-unit change to the
// amount. Asserted here rather than taken on trust: a fixture said to discriminate, and never shown
// to, is a fixture nobody has checked.
for (const row of v3Rows) {
  const tampered = JSON.parse(JSON.stringify(row));
  const spend = tampered.spend ?? tampered.attempted;
  spend.amountRaw = String(BigInt(spend.amountRaw) + 1n);
  let stillVerifies = false;
  try {
    const bytes = OP.refusalPayload(OP.signableFromRefusal(tampered));
    const key = Buffer.from(base58Decode(tampered.signedBy.slice('did:key:z'.length)).slice(2));
    stillVerifies = ed25519Verify(key, Buffer.from(bytes, 'utf8'), Buffer.from(tampered.signature, 'base64'));
  } catch { stillVerifies = false; }
  if (stillVerifies) fail(`v3 record ${row.refusalId} still verifies after one unit was added to the amount. A vector that cannot be broken is not evidence that this page is checking.`);
}
console.log(`ok    each v3 vector rejects a one-unit amount change  ${v3Rows.length}`);

// SERVED SHAPE x v3, covered by PROJECTING the signed store records rather than by inventing a
// signature. The signature stays CC Corpus's, so a projection that loses `reason` or the recorded
// note fails loudly instead of passing quietly. A genuine served v3 row is still worth having.
{
  const project = (r) => ({
    refusalId: r.refusalId, at: r.at, observedAt: r.observedAt ?? null,
    agentId: r.attribution?.agentId ?? null, mandateId: r.attribution?.mandateId ?? null,
    refusedBy: r.authority, code: r.code, constraint: r.breachedConstraint ?? null,
    attempted: {
      amountRaw: r.spend.amountRaw, decimals: r.spend.decimals, asset: r.spend.asset,
      rail: r.spend.rail, counterparty: r.spend.counterparty ?? null,
    },
    appliedBound: r.appliedBound ?? null,
    credential: r.credentialDigest ? { state: 'digest', value: r.credentialDigest } : { state: 'not-supplied', note: 'n/a' },
    network: r.network ?? null,
    attestation: r.attestation ?? null,
    signature: { state: 'signed', value: r.signature, signedBy: r.signedBy, payloadType: r.payloadType },
  });
  let projected = 0;
  for (const row of v3Rows) {
    const asServed = project(row);
    const r = await OP.check(JSON.stringify(asServed), '');
    if (r.outcome === 'checked-refusal' && r.state === 'verifies') projected++;
    else fail(`a v3 record projected to the served shape does not verify through the page: outcome=${r.outcome} state=${r.state}. The served normalisation loses something v3 signs.`);
  }
  console.log(`ok    v3 survives the served-shape normalisation      ${projected}/${v3Rows.length}`);
}

// AND THE GATING, IN THE DIRECTION THAT BREAKS OLD RECORDS. v3 emits two fields older versions do
// not. If the page emitted them unconditionally, every v2 record carrying a `recorded` note or a
// stray `reason` would gain a field its signature never covered and flip to DOES NOT VERIFY. The
// store-shape comparison above cannot see this: its records carry neither field.
{
  const withBoth = JSON.parse(JSON.stringify(v3Rows[0]));
  withBoth.payloadType = 'op.enforcement.refusal.v2';
  withBoth.appliedBound = { state: 'not-supplied', constraint: 'x', reason: 'not-reached', note: 'n' };
  const asV2 = JSON.parse(OP.refusalPayload(OP.signableFromRefusal(withBoth)));
  if ('reason' in asV2.appliedBound) fail('a v2 record carrying a stray `reason` had it emitted into the signed bytes. Older records must rebuild byte-identically, or this page invents a field their signature never covered.');
  const recV2 = JSON.parse(JSON.stringify(v3Rows[0]));
  recV2.payloadType = 'op.enforcement.refusal.v2';
  recV2.appliedBound = { state: 'recorded', limit: '1', note: 'n' };
  const recBytes = JSON.parse(OP.refusalPayload(OP.signableFromRefusal(recV2)));
  if ('note' in recBytes.appliedBound) fail('a v2 record with a `recorded` note had it emitted into the signed bytes. The recorded note is signed at v3 and not before.');
  console.log('ok    v2 rebuilds byte-identically with v3 fields present but gated off');
}

// THE REASON VOCABULARY, which no fixture exercises because both carry a valid one. The union is
// a compiler fact and this page has no compiler, so without an explicit set the closed discriminant
// is a convention. An unrecognised reason must be REFUSED rather than omitted: a bound whose
// absence cannot be explained must not carry a signature saying it can.
{
  const bad = JSON.parse(JSON.stringify(v3Rows.find((r) => r.appliedBound.state === 'not-supplied')));
  for (const [label, reason] of [['an unrecognised reason', 'made-up'], ['no reason at all', undefined]]) {
    const probe = JSON.parse(JSON.stringify(bad));
    if (reason === undefined) delete probe.appliedBound.reason; else probe.appliedBound.reason = reason;
    let refused = false;
    try { OP.refusalPayload(OP.signableFromRefusal(probe)); } catch { refused = true; }
    if (!refused) fail(`a v3 refusal with ${label} was rebuilt rather than refused. The reason vocabulary is closed at the engine and the compiler enforces it there; here it is a runtime set or it is nothing, and a record this page cannot describe must not get a signature check that appears to describe it.`);
  }
  console.log('ok    a v3 reason outside the vocabulary is refused, not omitted');
}

// ─── NULL MEANS ABSENT, AND THE SIGNATURE ORACLE CANNOT REACH THIS RULE ────────────
//
// STATED AS A LIMIT RATHER THAN LEFT AS A GAP. A served row NULLS a field it does not have,
// so `{constraint: null}` and an omitted `constraint` are the same document and must produce
// the same bytes. The mutation that breaks this is the one most likely to arrive as a
// simplification: dropping the null test from `stripNulls` and keeping only `undefined`.
//
// The oracle above cannot catch it. Every signed served row available carries EVERY optional
// field, so no null ever reaches the normaliser in that population, and the null branch is
// never taken. Measured, not assumed: 0 nulls across all 14 signed rows, and the one live
// fixture that does carry nulls has 0 signed rows in it, so it cannot be an oracle.
//
// So this is a STRUCTURAL assertion and not a signature one, and the difference matters: it
// establishes that null and absent normalise identically, and it does NOT establish that the
// resulting bytes are the ones the enforcement point signed. If a signed served row carrying
// a null ever exists, add it above and this section becomes redundant.
const OPTIONAL = ['observedAt', 'agentId', 'mandateId', 'constraint', 'appliedBound', 'credential', 'network', 'attestation'];
const sortedJson = (v) => JSON.stringify(v, (k, val) =>
  val && typeof val === 'object' && !Array.isArray(val)
    ? Object.fromEntries(Object.keys(val).sort().map((kk) => [kk, val[kk]]))
    : val);

let nullChecks = 0;
if (signable.length > 0) {
  const sample = signable[0];
  for (const field of OPTIONAL) {
    const asNull = JSON.parse(JSON.stringify(sample));
    const asAbsent = JSON.parse(JSON.stringify(sample));
    asNull[field] = null;
    delete asAbsent[field];
    let a, b;
    try { a = sortedJson(OP.signableFromRefusalRow(asNull)); } catch (e) { a = `threw: ${e.message}`; }
    try { b = sortedJson(OP.signableFromRefusalRow(asAbsent)); } catch (e) { b = `threw: ${e.message}`; }
    nullChecks++;
    if (a !== b) {
      fail(`null is not being treated as absent for \`${field}\`. A served row spells an absent field null, so these two rows are the same document and must normalise identically.\n      with null:   ${String(a).slice(0, 150)}\n      with absent: ${String(b).slice(0, 150)}`);
    }
    if (typeof a === 'string' && a.includes(':null')) {
      fail(`normalising a row whose \`${field}\` is null left a null in the signable form. The canonicaliser refuses null outright, so this does not produce different bytes, it produces NO bytes, and the reader is told their record cannot be rebuilt.`);
    }
  }
  // The nested case, which is the one the payment server's own appliedBoundView got backwards.
  if (sample.appliedBound && typeof sample.appliedBound === 'object') {
    for (const sub of Object.keys(sample.appliedBound)) {
      const asNull = JSON.parse(JSON.stringify(sample));
      const asAbsent = JSON.parse(JSON.stringify(sample));
      asNull.appliedBound[sub] = null;
      delete asAbsent.appliedBound[sub];
      nullChecks++;
      let a, b;
      try { a = sortedJson(OP.signableFromRefusalRow(asNull)); } catch (e) { a = `threw: ${e.message}`; }
      try { b = sortedJson(OP.signableFromRefusalRow(asAbsent)); } catch (e) { b = `threw: ${e.message}`; }
      if (a !== b) fail(`null is not being treated as absent for \`appliedBound.${sub}\`. This is the exact field where the payment server's own view turned absent into null, leaving the key PRESENT so every "is the field there" check passed while the bytes differed.`);
    }
  }
  // And the spend sub-object.
  if (sample.attempted && 'counterparty' in sample.attempted) {
    const asNull = JSON.parse(JSON.stringify(sample));
    const asAbsent = JSON.parse(JSON.stringify(sample));
    asNull.attempted.counterparty = null;
    delete asAbsent.attempted.counterparty;
    nullChecks++;
    const a = sortedJson(OP.signableFromRefusalRow(asNull));
    const b = sortedJson(OP.signableFromRefusalRow(asAbsent));
    if (a !== b) fail('null is not being treated as absent for `attempted.counterparty`.');
  }
}
// THE credential GUARD, which no row in the population exercises. All 14 carry
// `credential.state === 'digest'`, so a normaliser that ignored the state entirely and always
// read `.value` would behave identically on every one of them. The state is what says whether
// there IS a digest, and a `not-supplied` credential must contribute no credentialDigest at
// all rather than an undefined one.
if (signable.length > 0) {
  const notSupplied = JSON.parse(JSON.stringify(signable[0]));
  notSupplied.credential = { state: 'not-supplied', note: 'The evaluator supplied no credentialDigest with this verdict.' };
  const out = OP.signableFromRefusalRow(notSupplied);
  nullChecks++;
  if (Object.prototype.hasOwnProperty.call(out, 'credentialDigest')) {
    fail('a `not-supplied` credential still produced a credentialDigest. The state is what says whether a digest exists, and reading `.value` regardless would carry a placeholder into the signed form on any row where one is present alongside a non-digest state.');
  }
  const withValue = JSON.parse(JSON.stringify(signable[0]));
  withValue.credential = { state: 'not-supplied', note: 'n/a', value: 'sha256:' + '0'.repeat(64) };
  nullChecks++;
  if (Object.prototype.hasOwnProperty.call(OP.signableFromRefusalRow(withValue), 'credentialDigest')) {
    fail('a credential whose state is `not-supplied` but which carries a value still produced a credentialDigest. The state governs, not the presence of the field.');
  }
}

if (nullChecks === 0) fail('the null-means-absent rule was not exercised at all, so the assertion is vacuous.');
console.log(`ok    null normalises exactly as absent        ${nullChecks} field(s)`);

// ─── 6. Report ────────────────────────────────────────────────────────────────────
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
console.log(`${engineVersion}, over ${compared} store-shape record(s), and ${servedVerified} served-shape row(s)`);
console.log(`rebuild to bytes their own signatures verify, and ${v3Verified} v3 record(s) rebuild to the\nengine's own bytes at 6f58fcb. Two shapes covered; a third needs its own run.`);
