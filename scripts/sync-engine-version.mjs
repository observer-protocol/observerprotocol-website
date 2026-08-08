#!/usr/bin/env node
/**
 * One source for the engine version: scripts/package-lock.json.
 *
 * Why this exists
 * ---------------
 * On 2026-08-08 the version of @observer-protocol/policy-engine was stated in eight
 * hand-typed places across four files. Within a single day they disagreed: the homepage
 * said rc.5 while /verify said rc.6, and the package published rc.7 that night. Nothing
 * derived the string, so nothing could notice.
 *
 * A blanket find-and-replace is NOT the fix, and that is the whole design here. Some
 * mentions are claims about the CURRENT package and must track the lockfile. Others are
 * statements about a PAST measurement — "re-measured against rc.6 on 8 August 2026" —
 * and rewriting those would turn an accurate historical record into a false one. One
 * line in verify.html contains both.
 *
 * So every occurrence is explicitly marked and the marking is the coverage:
 *
 *   <span data-engine-version="current">1.0.0-rc.6</span>      rewritten from the lockfile
 *   <span data-engine-version="historical">…rc.6…</span>       never touched
 *
 * An unmarked full version string in an HTML file is a FAILURE, not a default. That is
 * what stops a ninth hand-typed occurrence appearing without anyone deciding.
 *
 *   node scripts/sync-engine-version.mjs           rewrite the current markers
 *   node scripts/sync-engine-version.mjs --check   fail if anything is out of sync
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
const PKG = '@observer-protocol/policy-engine';
const VERSION_RE = /\d+\.\d+\.\d+-rc\.\d+|\d+\.\d+\.\d+/;

// The single source.
const lock = JSON.parse(readFileSync(join(root, 'scripts/package-lock.json'), 'utf8'));
const locked = lock.packages?.[`node_modules/${PKG}`]?.version;
if (!locked) {
  console.error(`FAIL: ${PKG} not found in scripts/package-lock.json. Nothing to derive from.`);
  process.exit(1);
}

const htmlFiles = [];
(function walk(dir) {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === '.git') continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (e.endsWith('.html')) htmlFiles.push(p);
  }
})(root);

const MARKED = /<span data-engine-version="(current|historical)">(.*?)<\/span>/gs;

let changed = [], stale = [], unmarked = [];

for (const file of htmlFiles) {
  const src = readFileSync(file, 'utf8');
  const rel = file.slice(root.length + 1);

  // 1. Rewrite (or verify) the marked "current" spans.
  const out = src.replace(MARKED, (whole, kind, body) => {
    if (kind !== 'current') return whole;
    const next = body.replace(VERSION_RE, locked);
    if (next !== body) {
      (check ? stale : changed).push(`${rel}: ${body.trim()} -> ${locked}`);
    }
    return `<span data-engine-version="current">${next}</span>`;
  });

  // 2. Any full version string OUTSIDE a marker is an unaccounted occurrence.
  const stripped = out.replace(MARKED, '');
  for (const m of stripped.matchAll(/\d+\.\d+\.\d+-rc\.\d+/g)) {
    unmarked.push(`${rel}: ${m[0]} is not inside a data-engine-version marker`);
  }

  if (!check && out !== src) writeFileSync(file, out);
}

console.log(`locked version (scripts/package-lock.json): ${locked}\n`);

if (unmarked.length) {
  console.error('UNMARKED engine version string(s):');
  for (const u of unmarked) console.error(`  ${u}`);
  console.error(
    '\n  Wrap it in <span data-engine-version="current">…</span> if it should track the\n' +
    '  lockfile, or "historical" if it records a past measurement and must not move.\n' +
    '  Leaving it unmarked is how eight hand-typed copies happened.'
  );
}

if (check) {
  if (stale.length) {
    console.error('STALE marker(s) — the site disagrees with the lockfile:');
    for (const s of stale) console.error(`  ${s}`);
    console.error('\n  Run: node scripts/sync-engine-version.mjs');
  }
  if (stale.length || unmarked.length) process.exit(1);
  console.log('Every current marker matches the lockfile, and no version string is unmarked.');
} else {
  if (unmarked.length) process.exit(1);
  console.log(changed.length ? `Updated ${changed.length} marker(s):` : 'Nothing to update.');
  for (const c of changed) console.log(`  ${c}`);
}
