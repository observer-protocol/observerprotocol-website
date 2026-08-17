#!/usr/bin/env node
/**
 * served-page-audit.mjs carries two things it cannot derive at run time, because it runs
 * with no repository: the hashes of check.html's own inline scripts, and its own content
 * hash. Both are baked in. This is what stops them going stale.
 *
 * Neither is decorative:
 *
 *   EXPECTED       the audit asserts check.html's own scripts POSITIVELY, so that a
 *                  removal fails and not only an addition. A stale hash here would fail
 *                  every run after any edit to the page, and the obvious repair under
 *                  time pressure is to delete the entry, which silently removes the
 *                  positive assertion and leaves a check that only catches additions.
 *                  That is the failure this file exists to make impossible.
 *
 *   AUDIT_SHA256   the scheduler holds its own copy of the audit and does not fetch it
 *                  from the zone under test. Copies drift. `--version` prints the hash
 *                  computed from the file on disk, and the operator compares it against
 *                  the repository's. That comparison is worthless if the repository's own
 *                  copy does not match its own header.
 *
 * So: recompute both from the files, compare, and print what to paste when they differ.
 *
 *   node scripts/check-audit-expectations.mjs
 */

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sha256 = (s) => createHash('sha256').update(s).digest('hex');

const auditPath = join(root, 'scripts/served-page-audit.mjs');
const audit = readFileSync(auditPath, 'utf8');
const page = readFileSync(join(root, 'check.html'), 'utf8');

const failures = [];

// ─── 1. the audit's own content hash ──────────────────────────────────────────────
const recordedSelf = audit.match(/const AUDIT_SHA256 = '([a-f0-9]*)';/)?.[1];
const computedSelf = sha256(audit.replace(/const AUDIT_SHA256 = '[a-f0-9]*';/, "const AUDIT_SHA256 = '';"));
if (recordedSelf === undefined) {
  failures.push('served-page-audit.mjs carries no AUDIT_SHA256 line. A copy with no identity cannot be compared to this one.');
} else if (recordedSelf !== computedSelf) {
  failures.push(
    `served-page-audit.mjs was edited and its AUDIT_SHA256 was not updated.\n` +
    `      recorded: ${recordedSelf}\n` +
    `      computed: ${computedSelf}\n` +
    `      Paste the computed value into the AUDIT_SHA256 line.`
  );
}

// ─── 2. the page's own inline scripts ─────────────────────────────────────────────
const inline = [];
for (const m of page.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
  if (/\bsrc\s*=/.test(m[1] ?? '')) continue;
  inline.push({ attrs: (m[1] ?? '').trim(), hash: sha256(m[2]) });
}

const recordedHashes = [...audit.matchAll(/sha256: '([a-f0-9]{64})'/g)].map((m) => m[1]);
const pageHashes = inline.map((i) => i.hash);

const missing = pageHashes.filter((h) => !recordedHashes.includes(h));
const extra = recordedHashes.filter((h) => !pageHashes.includes(h));

if (missing.length || extra.length) {
  failures.push(
    `served-page-audit.mjs's EXPECTED no longer matches check.html's inline scripts.\n` +
    (missing.length ? `      in the page, not in EXPECTED: ${missing.join(', ')}\n` : '') +
    (extra.length ? `      in EXPECTED, not in the page:  ${extra.join(', ')}\n` : '') +
    `      DO NOT repair this by deleting an EXPECTED entry. The entry is what makes a\n` +
    `      REMOVAL of the page's own verifier fail. Update the hash to the new value.\n` +
    `      Current inline scripts in check.html:\n` +
    inline.map((i) => `        ${i.hash}  ${i.attrs || '(no attributes)'}`).join('\n')
  );
}

if (failures.length) {
  console.error(`The standalone audit's baked-in values are stale — ${failures.length} problem(s):\n`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}

console.log(`ok    AUDIT_SHA256 matches the file: ${computedSelf.slice(0, 16)}`);
for (const i of inline) console.log(`ok    EXPECTED covers ${i.hash.slice(0, 16)}  ${i.attrs || '(no attributes)'}`);
console.log('');
console.log(`The audit's ${inline.length} expected script hashes and its own content hash agree with the files.`);
