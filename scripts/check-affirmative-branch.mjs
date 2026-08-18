#!/usr/bin/env node
/**
 * Can /check print `attested` on a path where signature verification did not return true?
 *
 * This is a different question from "does it refuse bad input", which the fifteen cases in
 * check-public-checker.mjs already establish. Those feed the page bad artifacts and watch
 * it say no. This one attacks the VERIFIER ITSELF and asks whether the affirmative branch
 * is reachable when the cryptography did not answer yes.
 *
 * Why that is worth its own file: a verifier that refuses every bad input it is shown, and
 * also says yes when its own signature check returns something unexpected, passes every
 * test written from the outside. The failure is not in what it rejects. It is in what the
 * yes is conditional on.
 *
 * Four mutations of the page's own verifier, each a single substitution into check.html,
 * each then evaluated and run against the genuine published record:
 *
 *   a  the verifier returns false            must refuse
 *   b  the verifier throws                   must answer, must not be attested,
 *                                            and must not surface as an exception
 *   c  the verifier returns a truthy         must refuse. `if (!ok)` tests falsiness,
 *      non-boolean                           and a non-boolean truthy value is not a
 *                                            signature check returning yes
 *   d  the verify call is removed entirely   the affirmative branch must be unreachable
 *
 * (d) is the load-bearing one. If the page can still print attested with no verification
 * performed at all, then every other result in this repository about that page is about
 * something other than what it claims.
 *
 *   node scripts/check-affirmative-branch.mjs
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'check.html'), 'utf8');
const record = readFileSync(join(root, 'verify-samples/ppp-determination-refused-outcome.json'), 'utf8');

// The page's real verifier, verbatim. Every mutation replaces exactly this.
const REAL_VERIFY = `  async function ed25519Verify(publicKeyBytes, message, signature) {
    var key = await crypto.subtle.importKey('raw', publicKeyBytes, { name: 'Ed25519' }, false, ['verify']);
    return crypto.subtle.verify('Ed25519', key, signature, message);
  }`;

if (!html.includes(REAL_VERIFY)) {
  console.error('FAIL: ed25519Verify in check.html is not the shape this file mutates.');
  console.error('      It was changed without this check being updated, so nothing below');
  console.error('      would have been testing the real verifier. That is the failure mode');
  console.error('      this guard exists for: a mutation test that silently mutates nothing.');
  process.exit(1);
}

const REAL_CALL = `    try { ok = await ed25519Verify(publicKey, bytes, b64ToBytes(signature)); }
    catch (e) {
      return { state: 'cited-invalid', passed: passed, reason: 'The signature could not be checked: ' + String(e && e.message ? e.message : e) };
    }`;

if (!html.includes(REAL_CALL)) {
  console.error('FAIL: the verify call site in check.html is not the shape this file mutates.');
  process.exit(1);
}

const stub = (body) => `  async function ed25519Verify(publicKeyBytes, message, signature) {\n${body}\n  }`;

const MUTATIONS = [
  {
    id: 'a',
    name: 'the verifier returns false',
    expect: 'refusal: state cited-invalid, not attested',
    mutate: (s) => s.replace(REAL_VERIFY, stub('    return false;')),
    holds: (r) => r.state === 'cited-invalid',
  },
  {
    id: 'b',
    name: 'the verifier throws',
    expect: 'an answer, not attested, and not an unhandled exception',
    mutate: (s) => s.replace(REAL_VERIFY, stub("    throw new Error('the primitive exploded');")),
    holds: (r) => r.state !== 'attested' && r.threw !== true && typeof r.state === 'string',
  },
  {
    id: 'c',
    name: 'the verifier returns a truthy non-boolean',
    expect: 'refusal. A string is not a signature check returning yes',
    mutate: (s) => s.replace(REAL_VERIFY, stub("    return 'yes';")),
    holds: (r) => r.state === 'cited-invalid',
  },
  {
    id: 'd',
    name: 'the verify call is removed entirely',
    expect: 'the affirmative branch is unreachable',
    mutate: (s) => s.replace(REAL_CALL, '    // the verify call is gone'),
    holds: (r) => r.state !== 'attested',
  },
];

const runMutated = async (source) => {
  const scripts = [...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .filter((m) => !/type\s*=\s*"application\/json"/i.test(m[0].slice(0, m[0].indexOf('>'))))
    .map((m) => m[1]);
  const verifier = scripts.find((s) => s.includes('globalThis.OP_CHECK'));
  if (!verifier) return { state: 'NO-SCRIPT' };
  delete globalThis.OP_CHECK;
  new Function(verifier)();
  try {
    return await globalThis.OP_CHECK.check(record, '');
  } catch (e) {
    // An exception reaching here is an error surface rather than an answer.
    return { state: 'THREW', threw: true, reason: String(e && e.message ? e.message : e) };
  }
};

// The control. Unmutated, the same record must verify, or the four results below say
// nothing: a mutation that changes an already-failing answer proves no dependency.
const control = await runMutated(html);
if (control.state !== 'attested') {
  console.error(`FAIL: unmutated, the published record does not reach attested (state=${control.state}).`);
  console.error('      Every mutation below would then pass for the wrong reason.');
  process.exit(1);
}
console.log(`ok    control                                          attested`);

let bad = 0;
for (const m of MUTATIONS) {
  const r = await runMutated(m.mutate(html));
  const ok = m.holds(r);
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${m.id}. ${m.name.padEnd(44)} ${r.state}`);
  if (!ok) console.log(`        expected ${m.expect}`);
}

if (bad) {
  console.error('');
  console.error(`${bad} mutation(s) reached an affirmative verdict, or an error surface, where`);
  console.error('the signature check had not returned true.');
  console.error('');
  console.error('  The page can print `attested` on a path the cryptography did not authorise.');
  console.error('  Refusing bad input does not establish this: the defect is not in what the');
  console.error('  page rejects, it is in what the yes is conditional on.');
  process.exit(1);
}

console.log('');
console.log('The affirmative branch is unreachable unless signature verification returned true.');
