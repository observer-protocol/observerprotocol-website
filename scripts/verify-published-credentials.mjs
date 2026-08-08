#!/usr/bin/env node
/**
 * Verify every credential artifact this repository publishes, against the
 * expectations recorded in scripts/credential-expectations.json.
 *
 * Why this exists
 * ---------------
 * observerprotocol.org tells a reader to install @observer-protocol/policy-engine
 * and check our records. Nothing tested that our own published records pass that
 * check, and two of them did not. The claim and the check were maintained in
 * separate places, which is the defect class this file closes.
 *
 * The check is symmetric on purpose. It fails when a passing artifact starts
 * failing (a regression) AND when a failing artifact starts passing (a stale
 * expectation). It also fails when an artifact is published with no expectation
 * recorded at all, so a new credential cannot appear on the site unmeasured.
 *
 * Run:  node scripts/verify-published-credentials.mjs
 * Exit: 0 all expectations held, 1 otherwise.
 */

import { readFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const WATCHED_DIRS = ['credentials', 'verify-samples'];

let verifyCredentialObject;
try {
  ({ verifyCredentialObject } = await import('@observer-protocol/policy-engine'));
} catch {
  console.error('FAIL: @observer-protocol/policy-engine is not installed.');
  console.error('      npm install @observer-protocol/policy-engine');
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(join(root, 'scripts/credential-expectations.json'), 'utf8'));
const expected = new Map(manifest.artifacts.map((a) => [a.path, a]));

// Every .json actually published under the watched directories.
const published = [];
for (const dir of WATCHED_DIRS) {
  const abs = join(root, dir);
  if (!existsSync(abs)) continue;
  for (const f of readdirSync(abs)) {
    if (f.endsWith('.json')) published.push(`${dir}/${f}`);
  }
}

const cacheDir = '/tmp/op-credential-check';
mkdirSync(cacheDir, { recursive: true });

const failures = [];

// 1. Nothing published without a recorded expectation.
for (const p of published) {
  if (!expected.has(p)) {
    failures.push(
      `${p}\n    UNDECLARED: published but absent from scripts/credential-expectations.json.\n` +
      `    Add it with the verdict you expect. A credential on the site that nobody has\n` +
      `    run through the verifier is exactly how the last two got there.`
    );
  }
}

// 2. Nothing declared that is no longer published.
for (const p of expected.keys()) {
  if (!published.includes(p)) {
    failures.push(`${p}\n    MISSING: declared in the manifest but not present in the repository.`);
  }
}

// 3. Every published artifact matches its expectation.
const results = [];
for (const p of published) {
  const a = expected.get(p);
  if (!a) continue;

  const credential = JSON.parse(readFileSync(join(root, p), 'utf8'));
  const schemaId = credential?.credentialSchema?.id;

  const config = {
    credentialPath: p,
    issuerDid: a.issuerDid,
    schemaAllowlist: schemaId ? [schemaId] : [],
    revocation: { maxStalenessHours: 24, onUnreachable: 'cache-then-deny', fetchTimeoutMs: 8000 },
    didCache: { maxStalenessHours: 24 },
    cacheDir,
    auditLog: join(cacheDir, 'audit.log'),
    rails: {},
    allowContractCalls: false,
  };

  let verdict;
  try {
    verdict = await verifyCredentialObject(credential, config, Date.now());
  } catch (e) {
    verdict = { allow: 'threw', reason: e.message };
  }

  const allowOk = verdict.allow === a.expect.allow;
  const reasonOk = String(verdict.reason ?? '').includes(a.expect.reasonContains);
  const ok = allowOk && reasonOk;

  results.push({ path: p, ok, verdict, expect: a.expect, knownIssue: a.knownIssue });

  if (!ok) {
    failures.push(
      `${p}\n` +
      `    expected: allow=${a.expect.allow} reason~"${a.expect.reasonContains}"\n` +
      `    actual:   allow=${verdict.allow} reason="${verdict.reason}"\n` +
      (allowOk
        ? `    The verdict matched but the reason changed. A reason string is what the\n` +
          `    site quotes to a reader; treat a change in it as a change in the claim.`
        : a.expect.allow === false
          ? `    An artifact expected to FAIL now passes. If that is intended, this\n` +
            `    expectation is stale and should be updated in the same commit as the fix.`
          : `    A published credential no longer verifies. The site instructs readers to\n` +
            `    run this exact check.`)
    );
  }
}

const pad = Math.max(...results.map((r) => r.path.length));
for (const r of results) {
  const mark = r.ok ? 'ok  ' : 'FAIL';
  const flag = r.knownIssue ? `  [${r.knownIssue}]` : '';
  console.log(`${mark}  ${r.path.padEnd(pad)}  allow=${String(r.verdict.allow).padEnd(5)}${flag}`);
}

const known = results.filter((r) => r.ok && r.knownIssue);
if (known.length) {
  console.log(
    `\n${known.length} artifact(s) fail verification as expected and are disclosed on /verify.html.\n` +
    `These are held open deliberately, not passing quietly:`
  );
  for (const r of known) console.log(`  ${r.knownIssue}  ${r.path}`);
}

if (failures.length) {
  console.error(`\n${failures.length} expectation(s) not met:\n`);
  for (const f of failures) console.error(`  ${f}\n`);
  process.exit(1);
}

console.log(`\nAll ${results.length} published artifacts match their recorded expectation.`);
