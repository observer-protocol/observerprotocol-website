#!/usr/bin/env node
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
    name: 'an enforcement refusal record',
    why: 'a real artifact of a kind this page does not cover. One artifact type is a scope, not a failure.',
    input: () => JSON.stringify(refusal),
    expect: (r) => r.outcome === 'not-covered' && /refusal/i.test(r.label || ''),
    describe: 'outcome=not-covered, naming what it is',
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

console.log(`${results.length} cases: the published example verifies, ${results.filter((x) => x.r.state === 'cited-invalid').length} deliberate breaks are refused,`);
console.log('artifacts of other kinds are named rather than errored, and the page loads nothing.');
