#!/usr/bin/env node
// DECLARES-COMPARES: {"repositoryHolds":["the published sample and the page's own checker"],"worldSource":"the installed @observer-protocol/policy-engine","goesStaleWhen":"the pinned engine version changes verification behaviour"}
// ^ Machine-readable. What this check holds against the world, and what makes it
//   stale. worldSource null is a DECLARATION, not an absence: it says both sides are
//   inside this repository. Read by scripts/check-declarations.mjs, which FAILS on any
//   CI-invoked check that carries no declaration.
/**
 * The public checker on /check.html, driven against real artifacts and against
 * deliberately broken ones.
 *
 * Why this file exists
 * --------------------
 * /check.html is the first page on this site that reaches a VERDICT on a visitor's
 * artifact. A page that says "attested" is worth exactly as much as the check behind
 * it, and this repository has one recorded instance of a public verification tool that
 * could never return valid for anything the site published and one of a page that had
 * never rendered at all. Both were live. Neither had a test.
 *
 * So the page's verifier is not tested by reading it. Every case below states the
 * verdict it expects BEFORE the input is built, and each broken input is broken in one
 * specific way, so a case that passes for the wrong reason is visible.
 *
 * TWO THINGS THIS ASSERTS THAT ARE NOT ABOUT VERDICTS
 *
 *   1. The embedded example parses equal to verify-samples/ppp-determination-refused-outcome.json.
 *      The page carries its own copy so that loading the example costs no request; a
 *      copy is a fork the moment nothing compares it.
 *   2. The page loads nothing. No <link>, no src=, no fetch, no XMLHttpRequest, no
 *      <form>, no @import, no url(http…). The page tells a visitor that nothing they
 *      paste leaves the browser, and that sentence is only as true as this list.
 *
 *      WHAT THAT ASSERTION DOES NOT COVER, and it took a live page to find out: it reads
 *      check.html ON DISK. Cloudflare injects a RUM beacon into every HTML response on
 *      this zone, only for requests carrying browser headers, so the file was clean, this
 *      check was green, and a visitor was loading a third-party script. The other half is
 *      scripts/served-page-audit.mjs, which fetches the production URL as a
 *      browser. Neither is sufficient: this one runs before a deploy and cannot see the
 *      CDN; that one runs after and cannot see a pull request.
 *
 * The signature check runs on WebCrypto Ed25519, the same primitive the browser uses.
 *
 *   node scripts/check-public-checker.mjs
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'check.html'), 'utf8');

// The signature cases below are the only ones that establish anything, and they need the
// same primitive the browser uses. A runtime without it would turn every one of them into
// "the signature could not be checked", which does not match what they expect, so the run
// would go red for a reason that is about this machine rather than about the page. Say so
// in one line instead, because a red build whose message is wrong costs more than no build.
try {
  await crypto.subtle.importKey('raw', new Uint8Array(32), { name: 'Ed25519' }, false, ['verify']);
} catch {
  console.error('FAIL: this runtime does not implement Ed25519 in WebCrypto, so the signature');
  console.error('      cases cannot run. That is a fact about the runtime, not about check.html.');
  console.error('      Node 22 or later, or any browser the page itself supports.');
  process.exit(1);
}

const failures = [];
const fail = (m) => failures.push(m);

// ─── 1. The page loads nothing ────────────────────────────────────────────────────
//
// Matched against the page MINUS its embedded JSON example: a URL inside a signed
// document is text a reader can see, not a request the page makes. The distinction is
// the whole point — what is forbidden here is a LOAD, not a mention.
const withoutSample = html.replace(/<script type="application\/json"[\s\S]*?<\/script>/g, '');
const LOADS = [
  [/<link\b/i, '<link> tag'],
  [/\bsrc\s*=/i, 'src= attribute'],
  [/\bfetch\s*\(/i, 'fetch('],
  [/XMLHttpRequest/i, 'XMLHttpRequest'],
  [/\bnavigator\.sendBeacon/i, 'sendBeacon'],
  [/<form\b/i, '<form> tag'],
  [/@import/i, 'CSS @import'],
  [/url\(\s*['"]?https?:/i, 'CSS url(http…)'],
  [/\bnew\s+WebSocket/i, 'WebSocket'],
  [/\bnew\s+EventSource/i, 'EventSource'],
  [/\bimport\s*\(/i, 'dynamic import()'],
];
for (const [re, what] of LOADS) {
  if (re.test(withoutSample)) fail(`check.html contains a ${what}. This page must load nothing: it tells the visitor that what they paste never leaves the browser.`);
}

// ─── 2. The embedded example is the published artifact ────────────────────────────
const embedded = html.match(/<script type="application\/json" id="op-sample">([\s\S]*?)<\/script>/);
if (!embedded) {
  fail('check.html carries no <script type="application/json" id="op-sample"> block. The example is embedded so loading it costs no request.');
}
const publishedRaw = readFileSync(join(root, 'verify-samples/ppp-determination-refused-outcome.json'), 'utf8');
const published = JSON.parse(publishedRaw);
if (embedded) {
  let parsed;
  try { parsed = JSON.parse(embedded[1]); } catch (e) { fail(`the embedded example is not valid JSON: ${e.message}`); }
  if (parsed && JSON.stringify(parsed) !== JSON.stringify(published)) {
    fail('the example embedded in check.html no longer matches verify-samples/ppp-determination-refused-outcome.json. A copy is a fork the moment nothing compares it.');
  }
}

// ─── 3. Load the page's own verifier ──────────────────────────────────────────────
//
// The IIFE returns early when there is no document, after publishing globalThis.OP_CHECK.
// So this is the page's code, not a re-implementation of it.
// Attribute-tolerant on purpose. The first version of this matched `<script>` exactly and
// broke the moment the element was given data-shared-copy, which is a tag about the prose
// inside it and nothing to do with what the script does.
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
if (!OP || typeof OP.check !== 'function') {
  console.error('FAIL: OP_CHECK.check is not a function after evaluating the page script.');
  process.exit(1);
}

// ─── helpers for building broken inputs ───────────────────────────────────────────
const clone = (o) => JSON.parse(JSON.stringify(o));
const docOf = (rec) => JSON.parse(Buffer.from(rec.document, 'base64').toString('utf8'));
const reseal = (rec, doc) => {
  // Re-encodes a tampered document AND repairs documentHash, so the hash check passes
  // and the SIGNATURE is what fails. Without this the hash fires first and the case
  // would pass while establishing nothing about the signature.
  const bytes = Buffer.from(JSON.stringify(doc), 'utf8');
  rec.document = bytes.toString('base64');
  rec.documentHash = 'sha256:' + createHash('sha256').update(bytes).digest('hex');
  return rec;
};
const flipChar = (s, i) => {
  const c = s[i];
  const next = c === 'A' ? 'B' : c === 'a' ? 'b' : c === '0' ? '1' : 'A';
  return s.slice(0, i) + next + s.slice(i + 1);
};

// ─── the refusal route's inputs ───────────────────────────────────────────────────
//
// The embedded example is read out of the page rather than out of a file, because the page
// is what a visitor loads. A file copy compared to itself would establish nothing.
const embeddedRefusalRaw = html.match(/<script type="application\/json" id="op-refusal-sample">([\s\S]*?)<\/script>/);
if (!embeddedRefusalRaw) {
  console.error('FAIL: check.html carries no embedded refusal example, so the refusal route has no worked example');
  process.exit(1);
}
const embeddedRefusal = JSON.parse(embeddedRefusalRaw[1]);

// One character, in a field INSIDE the signed payload. Not the signature: altering the
// signature shows base64 integrity, altering a signed field shows the binding.
const flipLast = (s) => s.slice(0, -1) + (s.slice(-1) === '0' ? '1' : '0');

const bareDoc = docOf(published);
const bareSig = published.signature;

const refusal = JSON.parse(readFileSync(join(root, 'verify-samples/ppp-refusal-applied-bound.json'), 'utf8'));
const delegation = JSON.parse(readFileSync(join(root, 'verify-samples/verifies-delegation-mandate.json'), 'utf8'));

// ─── 4. The cases. Expected verdict stated first, in `expect`. ─────────────────────
const cases = [
  {
    name: 'the published example',
    why: 'the artifact this page offers as its worked example. If this is not attested, the page is broken.',
    input: () => JSON.stringify(published),
    expect: (r) => r.state === 'attested' && r.hashChecked === true,
    describe: 'state=attested, and the stored bytes reproduce documentHash',
  },
  {
    name: 'the same document pasted bare, with its signature',
    why: 'a visitor holding a document and a signature rather than a stored record.',
    input: () => JSON.stringify(bareDoc),
    signature: bareSig,
    expect: (r) => r.state === 'attested',
    describe: 'state=attested',
  },
  {
    name: 'a bare document with no signature',
    why: 'a document on its own says what was decided and establishes nothing about who decided it.',
    input: () => JSON.stringify(bareDoc),
    expect: (r) => r.outcome === 'need-signature',
    describe: 'outcome=need-signature, asking for it rather than returning a verdict',
  },
  {
    name: 'one character changed in the signature',
    why: 'the base case. If this verifies, nothing else on the page is worth reading.',
    input: () => { const r = clone(published); r.signature = flipChar(r.signature, 4); return JSON.stringify(r); },
    expect: (r) => r.state === 'cited-invalid' && /signature does not verify/i.test(r.reason || ''),
    describe: 'state=cited-invalid, naming the signature',
  },
  {
    name: 'one field changed in the document, documentHash left alone',
    why: 'the record is internally inconsistent before any signature is considered.',
    input: () => {
      const r = clone(published);
      const d = docOf(r);
      d.outcome = 'forgiveness-full';
      r.document = Buffer.from(JSON.stringify(d), 'utf8').toString('base64');
      return JSON.stringify(r);
    },
    expect: (r) => r.outcome === 'hash-mismatch',
    describe: 'outcome=hash-mismatch, caught before the signature',
  },
  {
    name: 'one field changed in the document, documentHash repaired',
    why: 'proves the SIGNATURE is doing the work rather than the hash beside it. An attacker who can edit the document can edit the hash.',
    input: () => {
      const r = clone(published);
      const d = docOf(r);
      d.outcome = 'forgiveness-full';
      return JSON.stringify(reseal(r, d));
    },
    expect: (r) => r.state === 'cited-invalid' && /signature does not verify/i.test(r.reason || ''),
    describe: 'state=cited-invalid, on the signature and not on the hash',
  },
  {
    name: 'the record cites one decision and carries a document for another',
    why: 'citing one decision and shipping another would have a reader read the shipped one.',
    input: () => { const r = clone(published); r.decisionId = 'urn:ppp-cases:decision:MF-0001:OTHER'; return JSON.stringify(r); },
    expect: (r) => r.state === 'cited-invalid' && /cites decision/i.test(r.reason || ''),
    describe: 'state=cited-invalid, naming the mismatch',
  },
  {
    name: 'an outcome outside the vocabulary the document declares',
    why: 'the document would assert a choice from a set that does not contain it.',
    input: () => {
      const r = clone(published);
      const d = docOf(r);
      d.outcome = 'forgiveness-invented';
      return JSON.stringify(reseal(r, d));
    },
    expect: (r) => r.state === 'cited-invalid' && /not a member of the vocabulary/i.test(r.reason || ''),
    describe: 'state=cited-invalid, on membership, before the signature is reached',
  },
  {
    name: 'a did:web decider',
    why: 'resolving one is a network call, and this page makes none. It must decline rather than accept unverified.',
    input: () => {
      const r = clone(published);
      const d = docOf(r);
      d.decider = 'did:web:example.com';
      return JSON.stringify(reseal(r, d));
    },
    expect: (r) => r.state === 'cited-unresolvable' && /no network request/i.test(r.reason || ''),
    describe: 'state=cited-unresolvable, saying why rather than failing',
  },
  {
    name: 'a decider that is not a well-formed ed25519 did:key',
    why: 'no key can be recovered, so no verdict about the signature is possible.',
    input: () => {
      const r = clone(published);
      const d = docOf(r);
      d.decider = 'did:key:z6MkNOTAREALKEY';
      return JSON.stringify(reseal(r, d));
    },
    expect: (r) => r.state === 'cited-invalid' && /well-formed/i.test(r.reason || ''),
    describe: 'state=cited-invalid, on the key',
  },
  {
    name: 'a published enforcement refusal record',
    why: 'the artifact the refusal route exists for. This one is served from this domain and is checked by verify-published-credentials too, so a divergence between the page and the package shows up in two places.',
    input: () => JSON.stringify(refusal),
    expect: (r) => r.outcome === 'checked-refusal' && r.state === 'verifies',
    describe: 'outcome=checked-refusal, state=verifies',
  },
  {
    name: 'the embedded refusal example',
    why: 'the record the page hands a visitor who arrives empty-handed. If this does not verify, the example is teaching the wrong lesson.',
    input: () => JSON.stringify(embeddedRefusal),
    expect: (r) => r.outcome === 'checked-refusal' && r.state === 'verifies',
    describe: 'outcome=checked-refusal, state=verifies',
  },
  {
    name: 'one character changed in the refusal amount',
    why: 'THE NEGATIVE CONTROL, and the page offers this same mutation to the reader after a pass. A check nobody has seen fail is not evidence.',
    input: () => {
      const m = clone(embeddedRefusal);
      const spend = m.spend ?? m.attempted;
      spend.amountRaw = flipLast(spend.amountRaw);
      return JSON.stringify(m);
    },
    expect: (r) => r.outcome === 'checked-refusal' && r.state === 'does-not-verify',
    describe: 'state=does-not-verify',
  },
  {
    name: 'one character changed in the refusal signature',
    why: 'the other direction: the signature itself altered rather than what it covers.',
    input: () => {
      const m = clone(embeddedRefusal);
      if (m.signature && typeof m.signature === 'object') m.signature.value = flipChar(m.signature.value, 4);
      else m.signature = flipChar(m.signature, 4);
      return JSON.stringify(m);
    },
    expect: (r) => r.outcome === 'checked-refusal' && r.state === 'does-not-verify',
    describe: 'state=does-not-verify',
  },
  {
    name: 'the reason prose rewritten entirely',
    why: 'THE BOUNDARY, ASSERTED AS BEHAVIOUR. The page tells a reader the reason text is outside the refusal signature. That sentence is only worth what this case is: rewrite the prose and the signature must STILL verify. If this ever goes red the page is either over-claiming or under-claiming, and both are defects.',
    input: () => {
      const m = clone(embeddedRefusal);
      m.reason = 'Refused because the duty auditor was unavailable.';
      return JSON.stringify(m);
    },
    expect: (r) => r.outcome === 'checked-refusal' && r.state === 'verifies',
    describe: 'state=verifies, because reason is not inside the signed payload',
  },
  {
    name: 'the cited policy hash replaced with zeroes',
    why: 'the same boundary at its most uncomfortable. The refusal signature covers four fields of the citation and the policy pin is not one of them. A reader must not read a green refusal as a checked policy reference, so the page derives that and this proves the derivation is describing the artifact rather than describing itself.',
    input: () => {
      const m = clone(embeddedRefusal);
      if (m.attestation?.policyRef) m.attestation.policyRef.hash = 'sha256:' + '0'.repeat(64);
      return JSON.stringify(m);
    },
    expect: (r) => r.outcome === 'checked-refusal' && r.state === 'verifies',
    describe: 'state=verifies, because policyRef is not inside the signed payload',
  },
  // ─── THESE TWO ARE SHAPE-AWARE, AND THEY STOPPED TESTING WHAT THEY NAME ONCE ──────
  //
  // They mutated `authority` and `signedBy` on the embedded example. When that example moved from
  // the store shape to the SERVED shape, those fields stopped existing on it: a served row spells
  // them `refusedBy` and `signature.signedBy`. So the mutations added ignored top-level keys, the
  // record still verified, and both cases reported the wrong verdict rather than the wrong shape.
  //
  // The checker caught it, which is the only reason this is a comment and not a live defect. Each
  // now runs against BOTH shapes: the field name is part of what is under test, and a case that
  // silently mutates nothing is a case that has stopped asking its question.
  ...[['store', () => clone(refusal)], ['served', () => clone(embeddedRefusal)]].flatMap(([shape, get]) => [
    {
      name: `a ${shape}-shape refusal whose authority nobody recognises`,
      why: 'a payload that cannot be rebuilt is a third answer. It is not a failed signature and must not render as one.',
      input: () => {
        const m = get();
        if ('refusedBy' in m) m.refusedBy = 'something-else'; else m.authority = 'something-else';
        return JSON.stringify(m);
      },
      expect: (r) => r.outcome === 'checked-refusal' && r.state === 'unrebuildable',
      describe: 'state=unrebuildable, refused rather than reported as a bad signature',
    },
    {
      name: `a ${shape}-shape refusal signed by a did:web`,
      why: 'resolving one needs the network, and this page makes no request. It has to say so rather than fail closed and look like a bad signature. The identifier is asserted UNTRUNCATED: an earlier version cut it at 28 characters and a mangled DID reads as a damaged record, which is the exact misreading this case exists to prevent.',
      input: () => {
        const m = get();
        if (m.signature && typeof m.signature === 'object') m.signature.signedBy = 'did:web:example.org';
        else m.signedBy = 'did:web:example.org';
        return JSON.stringify(m);
      },
      expect: (r) => r.outcome === 'checked-refusal' && r.state === 'signer-unresolvable'
        && /NO SIGNATURE CHECK RAN/.test(r.reason || '')
        && /network/i.test(r.reason || '')
        && (r.signedBy || '') === 'did:web:example.org',
      describe: 'state=signer-unresolvable, saying no check ran, naming the network, identifier intact',
    },
  ]),
  {
    name: 'a served verdict row, as a console copy button emits it',
    why: 'THE PASTE THAT PRODUCED "not recognised". A verdict card has its own Copy record button, and what it emits carries no `k`. This page does not check verdicts and it must still NAME one: a page that cannot identify a real artifact reads as a page that has decided the artifact is junk.',
    input: () => JSON.stringify({
      id: 'verdict-5', reservationId: 'res-0001', at: '2026-08-15T19:11:31.955Z',
      evaluator: 'did:key:z6MksSKYrTJ7a1buUtDAjppEwbDQVf1NQUq8U48BXzhi67Cw',
      signature: 'u2ZGZaDiOY8D8pT4OLor0tiJ/tsbq/2vOAWQz6sOk5ZxPzed1hNuJg/XAaxte/huN8YAyIDsx626X4nEGgl1AQ==',
      payload: { decision: 'release', mandateId: 'urn:uuid:x', agentId: 'did:web:a.example' },
      construction: { state: 'recorded', type: 'op.evaluation.verdict.v4' },
    }),
    expect: (r) => r.outcome === 'not-covered' && /evaluation verdict/i.test(r.label || '')
      && /module constant/i.test(r.reason || ''),
    describe: 'outcome=not-covered, named as a verdict, with the reason it cannot be rebuilt',
  },
  {
    name: 'a served REFUSAL is not swallowed by the verdict test',
    why: 'ORDERING. The verdict test is positive on evaluator+payload+signature and runs before the refusal test. A served refusal carries `signature` as an OBJECT and no evaluator, so it must fall through. This case exists so an edit that loosens either test turns the build red rather than reclassifying live records. IT ONLY BECAME A REAL TEST when the embedded example moved to the served shape: a store record has no evaluator, no payload and a flat signature, so it could never have been swallowed and the case was asserting something it did not exercise.',
    input: () => JSON.stringify(embeddedRefusal),
    expect: (r) => r.outcome === 'checked-refusal' && r.state === 'verifies',
    describe: 'still reaches the refusal path and verifies',
  },
  {
    name: 'a delegation credential',
    why: 'the artifact most visitors will have. It must be told what it is holding.',
    input: () => JSON.stringify(delegation),
    expect: (r) => r.outcome === 'not-covered' && /credential/i.test(r.label || ''),
    describe: 'outcome=not-covered, naming what it is',
  },
  {
    name: 'a record stating a kind nobody has heard of',
    why: 'the construction is derived per record. An unrecognised one is reported, never guessed at.',
    input: () => JSON.stringify({ k: 'spaceship', document: 'x' }),
    expect: (r) => r.outcome === 'unrecognised' && /does not recognise/i.test(r.reason || ''),
    describe: 'outcome=unrecognised, and no guess',
  },
  {
    name: 'JSON that is not an artifact at all',
    why: 'a paste that is nothing this page knows gets an answer rather than an error.',
    input: () => JSON.stringify({ hello: 'world' }),
    expect: (r) => r.outcome === 'unrecognised',
    describe: 'outcome=unrecognised',
  },
  {
    name: 'text that is not JSON',
    why: 'the commonest paste mistake there is.',
    input: () => 'not json at all {',
    expect: (r) => r.outcome === 'not-json',
    describe: 'outcome=not-json',
  },
];

const results = [];
for (const c of cases) {
  let r;
  try { r = await OP.check(c.input(), c.signature || ''); }
  catch (e) { r = { outcome: 'threw', reason: String(e && e.message ? e.message : e) }; }
  const ok = (() => { try { return c.expect(r); } catch { return false; } })();
  results.push({ c, r, ok });
  if (!ok) {
    fail(`${c.name}\n      expected: ${c.describe}\n      got:      outcome=${r.outcome} state=${r.state ?? '-'} ${r.reason ? `reason=${String(r.reason).slice(0, 120)}` : ''}`);
  }
}

// ─── report ───────────────────────────────────────────────────────────────────────
for (const { c, r, ok } of results) {
  const state = r.state ?? r.outcome;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${c.name.padEnd(56)} ${String(state)}`);
}
console.log('');

if (failures.length) {
  console.error(`The public checker is not behaving as stated — ${failures.length} problem(s):\n`);
  for (const f of failures) console.error(`  ${f}`);
  console.error('\n  Every case above names the verdict it expected before the input was built.');
  console.error('  A page that reaches a verdict on a visitor\'s artifact is worth what this file says it is.');
  process.exit(1);
}

// COUNTED, not typed. The refusal route added a second refusal state for a break, and a
// hard-coded 5 here would have gone quietly wrong on the same commit that added them.
const broken = results.filter((x) => x.r.state === 'cited-invalid' || x.r.state === 'does-not-verify').length;
const notAVerdict = results.filter((x) => x.r.state === 'unrebuildable' || x.r.state === 'signer-unresolvable').length;
console.log(`${results.length} cases: the published examples verify, ${broken} deliberate breaks are refused,`);
console.log(`${notAVerdict} records this page reaches no signature verdict on say so plainly rather than`);
console.log('reporting a bad signature, artifacts of other kinds are named rather than errored,');
console.log('and the page loads nothing.');
