#!/usr/bin/env node
// DECLARES-COMPARES: {"repositoryHolds":["the section 05 transcript output printed in index.html, the object after `$ node verify.mjs`"],"worldSource":"@observer-protocol/policy-engine at the locked version, run against credentials/maxi-0001-trading-mandate-2026-08.json with the section's own config, resolving did:web:bitcoinsingularity.ai over the network","goesStaleWhen":"the engine's result for that credential changes: a new locked version, the issuer's DID document changing, the credential re-issued or given a credentialStatus entry, or the sample config on the page changing"}
/**
 * DOES THE SECTION 05 TRANSCRIPT SHOW WHAT THE ENGINE RETURNS?
 *
 * Section 05 prints the engine's result for a credential served from this domain. Until
 * 2026-08-24 it printed `{ allow, reason }`, a projection that dropped the one field
 * carrying the limit: for that credential the engine records `revocation: 'status-absent'`
 * and a note saying revocation was not checkable, and neither reached the page. Ruled:
 * derived, not typed. The page now prints `{ allow, reason, notes, checks }`, and this check
 * runs the same call the page shows and compares the printed object to the real one, so the
 * transcript cannot quietly become a description.
 *
 * WHAT IT READS. index.html: the text between `$ node verify.mjs` and the end of the code
 * block, tags stripped, entities decoded, whitespace collapsed. The engine: the locked
 * version in scripts/node_modules, run against the REPOSITORY copy of the credential with the
 * config the page shows. The served copy is compared to the tree elsewhere (the served-page
 * audit and the sitemap live pass); this check does not fetch the page.
 *
 * THREE STATES, not two. Exit 0 the transcript matches; exit 1 it does not; exit 2 the engine
 * could not be run (network, module), which is "could not establish" and is not a finding
 * about the page. A check that spent unavailability on `fail` would fabricate a finding
 * (CONVENTIONS 17).
 *
 * Run: node scripts/check-section05-transcript.mjs
 */
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { inspect } from 'node:util';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CRED = 'credentials/maxi-0001-trading-mandate-2026-08.json';

// ─── the page's side ─────────────────────────────────────────────────────────────────────
const html = readFileSync(join(root, 'index.html'), 'utf8');
const start = html.indexOf('<span class="k">node</span> verify.mjs');
if (start === -1) { console.error('FAIL: index.html has no `$ node verify.mjs` line in section 05.'); process.exit(1); }
const end = html.indexOf('</pre>', start);
const shown = html.slice(html.indexOf('\n', start) + 1, end);
const decode = (t) => t.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
const collapse = (t) => t.replace(/\s+/g, ' ').trim();
const printed = collapse(decode(shown));

// ─── the engine's side: the same call the page shows ─────────────────────────────────────
let actual;
const cacheDir = mkdtempSync(join(tmpdir(), 'op-sec05-'));
try {
  const { verifyCredentialObject } = await import('@observer-protocol/policy-engine');
  const credential = JSON.parse(readFileSync(join(root, CRED), 'utf8'));
  const config = {
    credentialPath: CRED,
    issuerDid: 'did:web:bitcoinsingularity.ai',
    schemaAllowlist: ['https://observerprotocol.org/schemas/delegation/v2.2.json'],
    revocation: { maxStalenessHours: 24, onUnreachable: 'cache-then-deny', fetchTimeoutMs: 5000 },
    didCache: { maxStalenessHours: 24 },
    cacheDir, auditLog: join(cacheDir, 'audit.log'),
    rails: {}, allowContractCalls: false,
  };
  const { allow, reason, notes, checks } = await verifyCredentialObject(credential, config, Date.now());
  actual = { allow, reason, notes, checks };
} catch (e) {
  console.error(`COULD NOT ESTABLISH: the engine did not run to a result.\n  ${e.message}\n  This is not a finding about the page.`);
  process.exit(2);
} finally {
  rmSync(cacheDir, { recursive: true, force: true });
}
// A network-resolved issuer can come back from cache on a repeat run in the same cacheDir; a
// fresh temp dir above keeps issuerResolution at what a first-time reader sees.
const expected = collapse(inspect(actual, { depth: null }));

console.log(`engine (${CRED}):\n  ${expected}\nindex.html section 05 prints:\n  ${printed}\n`);
if (printed === expected) {
  console.log('PASSED — the section 05 transcript is what the engine returns, notes and checks included.');
  process.exit(0);
}
console.error('FAIL: the section 05 transcript no longer matches the engine\'s result. Re-run the sample and paste its output; do not edit the object by hand.');
process.exit(1);
