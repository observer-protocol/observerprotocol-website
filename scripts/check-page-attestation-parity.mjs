#!/usr/bin/env node
// DECLARES-COMPARES: {"repositoryHolds":["the attestation check embedded in a page"],"worldSource":"the installed @observer-protocol/policy-engine's verifier","goesStaleWhen":"the pinned engine version changes its attestation logic"}
// ^ Machine-readable. What this check holds against the world, and what makes it
//   stale. worldSource null is a DECLARATION, not an absence: it says both sides are
//   inside this repository. Read by scripts/check-declarations.mjs, which FAILS on any
//   CI-invoked check that carries no declaration.
/**
 * The page's copy of the attestation check, held to the package's.
 *
 * Why this file exists
 * --------------------
 * The sibling check, check-page-payload-parity.mjs, holds /check.html's refusal builder to
 * the package's byte for byte. It was written on 20 August 2026 and it left the attestation
 * path — the OLDER of the two reimplementations, live since 17 August — with nothing
 * checking it at all. A gate that covers the new half and not the old one is worse than
 * none, because the page then looks uniformly verified and is not.
 *
 * HOW A BYTE COMPARISON IS POSSIBLE HERE, given the package exports no canonicaliser.
 * `verifyDecisionAttestation` takes the ed25519 verify as a CALLBACK and hands it
 * `(canonicalise(att), signature, publicKey)`. So a spy callback captures, from inside the
 * real code path:
 *
 *   1. the exact bytes the package signs over, and
 *   2. the public key it derived from the decider's did:key, already stripped to 32.
 *
 * That is a stronger subject than an exported helper would be. An exported `canonicalise`
 * would let this compare a function nobody's verdict depends on; the callback carries the
 * bytes the verdict ACTUALLY rests on, and the key length that the page has to get right
 * independently. Both are compared.
 *
 * WHAT IS COMPARED, and each answers a different way of going wrong:
 *   canonical bytes   the page canonicalises differently and signs over a different string
 *   state token       the page reaches a different verdict, on any of the branches below
 *
 * EACH OF THOSE WAS SHOWN TO FIRE BY MUTATING THE PAGE, and the first two attempts at this
 * file did not fire, which is the reason both are written down here:
 *
 *   1. THE BYTE COMPARISON WAS VACUOUS. Every attestation document in this repository is
 *      stored with its keys already in sorted order, because a JCS-canonicalising producer
 *      wrote them. So `Object.keys` returned them sorted, and REMOVING THE SORT from the
 *      page's canonicaliser changed nothing and the gate stayed green. A canonicaliser is
 *      only exercised by input that is not already canonical, so a key-shuffled document is
 *      now in the population and the sort is load-bearing again.
 *
 *   2. THE KEY COMPARISON CHECKED THE GATE'S OWN ARITHMETIC. It re-derived `raw.slice(2)`
 *      here and compared that to the package. The page's derived key was never in the
 *      comparison, so changing the page's slice to `slice(0)` left the gate green. That
 *      assertion is gone. The page's key handling is now covered where it is observable:
 *      a wrong key makes the page fail to reach `attested` on an artifact that does, and
 *      the state comparison below runs on every case including the unaltered ones.
 *
 *   2b. AND THE SAME MISTAKE TWICE. Two cases here originally handed the page a bare
 *      document while calling the package with a separate cited id. THE PAGE DERIVES THE
 *      CITED ID FROM THE DOCUMENT when a bare document is pasted, so on that shape the two
 *      can never disagree and the branch is unreachable; the package takes it from its
 *      caller. Both cases now hand the page a stored record, which is the shape that carries
 *      a citation separately from the document. A parity gate has to ask the two
 *      implementations the SAME question, and their APIs do not take the same thing.
 *
 *   3. A DELETED CHECK WAS INVISIBLE. Removing the vocabulary-membership branch from the
 *      page left the gate green: the mutated document's signature no longer verified either,
 *      so both implementations returned `cited-invalid` and the tokens matched while the
 *      page had stopped performing a check entirely. A state token is too coarse to see
 *      that. So the reasons are now compared BY SUBJECT: each reason is reduced to which
 *      fields it is about, and two reasons sharing no subject is a failure. Removing that
 *      branch now makes the page say `signature` where the package says `vocabulary`.
 *
 * WHAT THIS DOES NOT ESTABLISH, stated because defect 2 above was exactly this mistake made
 * once already. It does NOT compare reason WORDING, deliberately: the page rewrites the
 * package's reasons for a lay reader and pinning the strings would forbid that. Subject
 * overlap is coarser than equality, so two implementations refusing for two different
 * reasons that happen to name the same field would still agree here. Comparing the two over
 * the artifacts that exist plus mutants derived from them also leaves a document shape
 * neither has met uncovered.
 *
 *   node scripts/check-page-attestation-parity.mjs
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyDecisionAttestation, base58Decode } from '@observer-protocol/policy-engine';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'check.html'), 'utf8');

const lock = JSON.parse(readFileSync(join(root, 'scripts/package-lock.json'), 'utf8'));
const engineVersion =
  lock.packages?.['node_modules/@observer-protocol/policy-engine']?.version ?? 'unknown';

const failures = [];
const fail = (m) => failures.push(m);

// ─── 1. Load the page's own check ─────────────────────────────────────────────────
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
for (const name of ['check', 'canonicalise', 'base58Decode']) {
  if (typeof OP?.[name] !== 'function') {
    console.error(`FAIL: check.html does not export ${name} on OP_CHECK, so it cannot be compared`);
    console.error('      against the package. Removing that export would silently end this check.');
    process.exit(1);
  }
}

// The signature cases need the same primitive the browser uses. Say so in one line rather
// than letting every case fail for a reason that is about this machine.
try {
  await crypto.subtle.importKey('raw', new Uint8Array(32), { name: 'Ed25519' }, false, ['verify']);
} catch {
  console.error('FAIL: this runtime does not implement Ed25519 in WebCrypto, so the page cannot');
  console.error('      reach a verdict here and the state comparison would be meaningless.');
  console.error('      Node 22 or later.');
  process.exit(1);
}

// ─── 2. Every attestation artifact this repository carries ────────────────────────
const artifacts = [];
const docOf = (rec) => JSON.parse(Buffer.from(rec.document, rec.documentEncoding === 'base64' ? 'base64' : 'utf8').toString('utf8'));

const embedded = html.match(/<script type="application\/json" id="op-sample">([\s\S]*?)<\/script>/);
if (!embedded) {
  fail('check.html carries no embedded attestation example.');
} else {
  const rec = JSON.parse(embedded[1]);
  artifacts.push({ label: 'check.html embedded example', doc: docOf(rec), sig: rec.signature, cited: rec.decisionId });
}

const samplesDir = join(root, 'verify-samples');
for (const file of readdirSync(samplesDir).sort()) {
  if (!file.endsWith('.json')) continue;
  let parsed;
  try { parsed = JSON.parse(readFileSync(join(samplesDir, file), 'utf8')); } catch { continue; }
  if (parsed?.k !== 'determination' || typeof parsed.document !== 'string') continue;
  artifacts.push({ label: `verify-samples/${file}`, doc: docOf(parsed), sig: parsed.signature, cited: parsed.decisionId });
}

if (artifacts.length === 0) {
  console.error('FAIL: no attestation artifacts found to compare. A parity check with an empty');
  console.error('      population reports success and establishes nothing, so an empty run fails.');
  process.exit(1);
}

// ─── 3. Mutants, so the comparison covers branches and not just the happy path ─────
//
// Derived from the first artifact rather than written out, so they follow it if it changes.
// Each targets a DIFFERENT branch of the check, because two implementations agreeing on one
// path is not agreement.
const clone = (o) => JSON.parse(JSON.stringify(o));
const base = artifacts[0];
const flipChar = (s, i) => s.slice(0, i) + (s[i] === 'A' ? 'B' : s[i] === 'a' ? 'b' : s[i] === '0' ? '1' : 'A') + s.slice(i + 1);

const notCitedDoc = (() => { const d = clone(base.doc); delete d.decisionId; return d; })();

// THE CASE THAT MAKES THE BYTE COMPARISON MEAN SOMETHING. Every document here is stored with
// its keys already sorted, so a canonicaliser that does not sort produces identical output on
// all of them. This one reverses the key order at every level. Both implementations must sort
// it back to the same bytes, and a page that stopped sorting now diverges immediately.
const shuffleKeys = (v) => {
  if (Array.isArray(v)) return v.map(shuffleKeys);
  if (v !== null && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).reverse()) out[k] = shuffleKeys(v[k]);
    return out;
  }
  return v;
};
const shuffledDoc = shuffleKeys(base.doc);

const cases = [
  ...artifacts.map((a) => ({ ...a, why: 'a published artifact, unaltered' })),
  { label: 'the same document with every key order reversed', why: 'the canonicaliser itself. Without this the population is entirely pre-sorted and the sort is dead weight the gate cannot see.', doc: shuffledDoc, sig: base.sig, cited: base.cited },
  { label: 'signature altered by one character', why: 'the signature branch', doc: base.doc, sig: flipChar(base.sig, 4), cited: base.cited },
  // A RECORD, not a bare document, and this is the second time this file made that mistake.
  // The page derives the cited id FROM THE DOCUMENT when a bare document is pasted, so on a
  // bare document the two can never disagree and this branch is unreachable. The package
  // takes the cited id from its caller. Reaching the branch in both means handing the page
  // the shape that carries a citation separately from the document: a stored record.
  {
    label: 'a record citing one decision and carrying a document for another',
    why: 'the decisionId branch, by the route it is actually reachable',
    doc: { ...clone(base.doc), decisionId: 'urn:not:the:cited:one' },
    sig: base.sig,
    cited: base.cited,
    pageInput: JSON.stringify({
      k: 'determination',
      decisionId: base.cited,
      document: Buffer.from(JSON.stringify({ ...clone(base.doc), decisionId: 'urn:not:the:cited:one' }), 'utf8').toString('base64'),
      documentEncoding: 'base64',
      signature: base.sig,
    }),
  },
  { label: 'an outcome outside the declared vocabulary', why: 'the membership branch', doc: { ...clone(base.doc), outcome: 'not-in-the-list' }, sig: base.sig, cited: base.cited },
  { label: 'a did:web decider', why: 'the branch item 2 of tonight\'s work is about: no resolver, no network, so neither can recover a key', doc: { ...clone(base.doc), decider: 'did:web:example.org' }, sig: base.sig, cited: base.cited },
  { label: 'a decider that is not a well-formed ed25519 did:key', why: 'the key-recovery branch', doc: { ...clone(base.doc), decider: 'did:key:znotvalidbase58!!' }, sig: base.sig, cited: base.cited },
  { label: 'an unsupported DID method', why: 'the method branch', doc: { ...clone(base.doc), decider: 'did:example:1234' }, sig: base.sig, cited: base.cited },
  { label: 'assurance the verifier cannot establish', why: 'the assurance branch, declined rather than failed', doc: { ...clone(base.doc), assurance: 'device-bound' }, sig: base.sig, cited: base.cited },
  { label: 'policyRef stripped of its hash', why: 'the reference branch', doc: { ...clone(base.doc), policyRef: { id: 'urn:x', hashMethod: 'sha256' } }, sig: base.sig, cited: base.cited },
  // ─── THE not-cited BRANCH, AND THE MISTAKE THIS GATE MADE ON ITS FIRST RUN ───────
  //
  // The first version of this case handed the page a BARE DOCUMENT with decisionId deleted
  // and compared it to the package called with citedDecisionId undefined. It failed:
  // package=not-cited, page=undefined. THE PAGE WAS RIGHT AND THE CASE WAS WRONG.
  //
  // A bare document with no decisionId is not an attestation document, and the page's
  // classifier says so before any verifier runs. The package was not disagreeing about that
  // document; it was being handed a different input by its CALLER, one that says "the record
  // cited nothing". Comparing a classifier's decision to a verifier's state is a category
  // error, and it would have been reported as a page defect.
  //
  // not-cited is reachable through a STORED RECORD that cites nothing and whose document
  // carries no id, so that is what the page is given. Both return not-cited.
  {
    label: 'a stored record citing no decision',
    why: 'the not-cited branch, by the route it is actually reachable',
    doc: notCitedDoc,
    sig: base.sig,
    cited: undefined,
    pageInput: JSON.stringify({
      k: 'determination',
      document: Buffer.from(JSON.stringify(notCitedDoc), 'utf8').toString('base64'),
      documentEncoding: 'base64',
      signature: base.sig,
    }),
  },
];

// ─── 4. Compare ───────────────────────────────────────────────────────────────────
let byteComparisons = 0;
let stateComparisons = 0;
let subjectComparisons = 0;

const didKeyBytes = (did) => {
  try { return base58Decode(did.slice('did:key:z'.length)); } catch { return undefined; }
};

// The package hands this the 32-byte key it derived itself, so this is node's own ed25519
// over the package's own inputs. It is the package's verdict, not this file's opinion of it.
const { createPublicKey, verify: nodeVerify } = await import('node:crypto');
// ─── WHAT A REASON IS ABOUT ───────────────────────────────────────────────────────
//
// Not the wording. The page deliberately rewrites the package's reasons for a lay reader,
// and pinning the strings would forbid that and turn every copy edit into a build failure.
// This reduces a reason to the set of FIELDS it names. Two implementations refusing the same
// document must be refusing it about the same thing, and sharing no subject at all means one
// of them took a branch the other did not.
// CLAIM-SHAPED, NOT WORD-SHAPED, and the first version was word-shaped and did not work.
// `/decider/i` matched "the signature does not verify against the decider's own key", so a
// page that had stopped checking the vocabulary and failed at the signature instead still
// shared the subject `decider` with a package refusing about the vocabulary, and the gate
// stayed green. A pattern keyed to a NAME matches every sentence that happens to mention it.
// These are keyed to the CLAIM each reason makes.
const SUBJECTS = [
  ['vocabulary', /not a member of the vocabulary|vocabularyRef/i],
  ['decisionId', /cites decision|carried an attestation for|citing one decision|carries a document for/i],
  ['deciderIdentity', /names no decider|not a well-formed|unsupported DID method/i],
  ['policyRef', /policyRef/i],
  ['deciderArtifact', /deciderArtifactDigest|artifact of its own|supplied an artifact/i],
  ['signature', /signature does not verify|failing its own check|signature could not be checked/i],
  ['assurance', /declares assurance/i],
  ['resolution', /did:web|resolver|no network request|outbound call/i],
  ['missingField', /cannot state what was decided|carried no verifiable|is missing/i],
];
const subjectsOf = (reason) => {
  if (typeof reason !== 'string' || reason === '') return null;
  return new Set(SUBJECTS.filter(([, re]) => re.test(reason)).map(([name]) => name));
};

const realVerify = (msg, sig, pk) => {
  const der = Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(pk)]);
  const key = createPublicKey({ key: der, format: 'der', type: 'spki' });
  return nodeVerify(null, Buffer.from(msg, 'utf8'), key, Buffer.from(sig));
};

for (const c of cases) {
  // The spy. It never verifies anything: it records what it was handed and returns false,
  // so the package's own verdict on a mutant stays the mutant's verdict rather than this
  // callback's opinion. The real signature result comes from the page and from the unaltered
  // run below.
  let captured = null;
  const spy = (msg, sig, pk) => { captured = { msg, pk: Buffer.from(pk) }; return false; };

  let theirs;
  try {
    theirs = verifyDecisionAttestation(c.cited, c.doc, c.sig, spy, didKeyBytes);
  } catch (e) {
    fail(`${c.label}: the package threw rather than returning a state: ${e.message}`);
    continue;
  }

  // A case may supply its own pageInput where the shape the page must receive differs from
  // the document the package is called with. That is not a loophole: the two APIs take
  // different things, and forcing one shape through both is what produced this gate's own
  // first false positive.
  let ours;
  try {
    ours = await OP.check(c.pageInput ?? JSON.stringify(c.doc), c.sig === undefined ? '' : c.sig);
  } catch (e) {
    fail(`${c.label}: the page threw rather than returning a state: ${e.message}`);
    continue;
  }

  // ── state, on EVERY case including the unaltered ones ──
  //
  // The spy returns false, so the package's spy run cannot be asked for a verdict. A second
  // run with a REAL ed25519 verify supplies that. Both runs are needed and they answer
  // different questions: the spy carries the bytes, the real one carries the state.
  //
  // Running state on every case is what covers the page's key handling. A page that stops
  // stripping the multicodec prefix cannot reach `attested` on an artifact that does, and
  // an earlier version of this file excluded exactly these cases from the state comparison
  // and was blind to it.
  let theirsReal;
  try {
    theirsReal = verifyDecisionAttestation(c.cited, c.doc, c.sig, realVerify, didKeyBytes);
  } catch (e) {
    fail(`${c.label}: the package threw on the real-verify run: ${e.message}`);
    continue;
  }
  stateComparisons++;
  if (theirsReal.state !== ours.state) {
    fail(`${c.label}: state disagrees. package=${theirsReal.state} page=${ours.state}. ${c.why}`);
  } else if (theirsReal.state !== 'attested') {
    // Same verdict. Now: for the same reason? A token alone cannot tell a page that ran a
    // check from a page that skipped it and failed later for something else.
    const theirSubjects = subjectsOf(theirsReal.reason);
    const ourSubjects = subjectsOf(ours.reason);
    if (theirSubjects !== null && ourSubjects !== null) {
      subjectComparisons++;
      const shared = [...theirSubjects].filter((x) => ourSubjects.has(x));
      if (theirSubjects.size > 0 && ourSubjects.size > 0 && shared.length === 0) {
        fail(
          `${c.label}: both return ${theirsReal.state} and they are refusing it about DIFFERENT things.\n` +
          `      package names: ${[...theirSubjects].join(', ') || '(nothing recognised)'}\n` +
          `      page names:    ${[...ourSubjects].join(', ') || '(nothing recognised)'}\n` +
          `      A matching state token with no shared subject is how a removed check hides.`
        );
      }
    }
  }

  // ── canonical bytes ──
  if (captured !== null) {
    byteComparisons++;
    let pageBytes;
    try { pageBytes = OP.canonicalise(c.doc); }
    catch (e) { fail(`${c.label}: the page could not canonicalise a document the package canonicalised: ${e.message}`); continue; }
    if (pageBytes !== captured.msg) {
      let at = 0;
      while (at < Math.min(pageBytes.length, captured.msg.length) && pageBytes[at] === captured.msg[at]) at++;
      fail(
        `${c.label}: the page and the package canonicalise DIFFERENTLY.\n` +
        `      first difference at byte ${at}\n` +
        `      package: ${JSON.stringify(captured.msg.slice(Math.max(0, at - 40), at + 60))}\n` +
        `      page:    ${JSON.stringify(pageBytes.slice(Math.max(0, at - 40), at + 60))}`
      );
    }
  }
}

// ─── 5. The comparison must not have been vacuous ─────────────────────────────────
//
// Same discipline as the empty-population check above, applied per assertion. A run where
// no case ever reached the signature step would compare no bytes at all and still print a
// pass, which is the shape this whole file exists to argue against.
if (byteComparisons === 0) fail('no case reached the signature step, so no canonical bytes were compared and the byte assertion is vacuous.');
if (stateComparisons === 0) fail('no case compared a state token, so the branch assertion is vacuous.');
if (subjectComparisons === 0) fail('no case compared reason subjects, so the removed-check assertion is vacuous. The population needs at least one document both implementations refuse.');

console.log(`compared ${cases.length} document(s): ${byteComparisons} canonicalisations, ${stateComparisons} state tokens, ${subjectComparisons} reason subjects.`);
console.log('');
if (failures.length) {
  console.error(`The page's attestation check has diverged from the package (${engineVersion}) — ${failures.length} problem(s):\n`);
  for (const f of failures) console.error(`  ${f}`);
  console.error('\n  The page cannot import the package: it loads nothing. So the copy stays and this');
  console.error('  check is what makes it honest. Fix the PAGE to match the package, never the other');
  console.error('  way round.');
  process.exit(1);
}
console.log(`The page canonicalises and reaches states identically to`);
console.log(`@observer-protocol/policy-engine ${engineVersion}. The page's copy of the attestation`);
console.log('check is not trusted here; it is compared.');
