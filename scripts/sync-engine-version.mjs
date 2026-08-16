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
 *
 * TWO comparisons, and they establish DIFFERENT things. Until 2026-08-09 this file made
 * only the first and reported it as though it were the second:
 *
 *   site  <-> scripts/package-lock.json   "our documents agree with each other"
 *   site  <-> npm's `latest` dist-tag     "our documents agree with what a reader gets"
 *
 * The first is satisfiable by a consistently wrong pair. On 2026-08-09 the site said
 * rc.6, the lockfile said rc.6, this check passed, and npm had been serving rc.10 for
 * some time — so every reader running the install line on our own homepage received a
 * package four releases from the one the site documents, and nothing here could notice,
 * because the lockfile is not the reader.
 *
 * The registry comparison is skipped, not failed, when the network is unavailable, and
 * says so. A check that cannot reach its subject must report that it did not look,
 * rather than passing.
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

// A THIRD MARKER, OWNED BY A DIFFERENT CHECK, and it is not a loophole.
//
// `<span data-measured="…">1.0.0-rc.9</span>` holds a version string that was READ OUT OF THE
// PUBLISHED TARBALLS and written to results/. check-measured-figures.mjs asserts it equals the
// measured value exactly, and re-derives the measurement from npm on every run. That is a
// STRICTER guarantee than this file offers: "current" here only tracks the lockfile.
//
// So these are excluded from the unmarked scan because they are covered, not because they are
// exempt. The rule is unchanged: an unaccounted version string is a failure. Deleting
// check-measured-figures.mjs from CI would leave these uncovered, which is why both run in the
// same job and neither is conditional on the other passing.
const MEASURED = /<span data-measured="[^"]*">(.*?)<\/span>/gs;

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
  const stripped = out.replace(MARKED, '').replace(MEASURED, '');
  for (const m of stripped.matchAll(/\d+\.\d+\.\d+-rc\.\d+/g)) {
    unmarked.push(`${rel}: ${m[0]} is not inside a data-engine-version marker`);
  }

  if (!check && out !== src) writeFileSync(file, out);
}

// THE THIRD TERM. The lockfile says what we install; this says what a reader installs.
let published = null;
let publishedErr = null;
try {
  const { execFileSync } = await import('node:child_process');
  published = execFileSync('npm', ['view', PKG, 'dist-tags.latest'], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 20000,
  }).trim();
} catch (e) {
  publishedErr = e.message;
}

console.log(`locked version   (scripts/package-lock.json): ${locked}`);
console.log(`published latest (npm dist-tag)             : ${published ?? 'NOT CHECKED'}\n`);

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
  let drift = false;
  if (published && published !== locked) {
    drift = true;
    console.error(`DRIFT — the site documents ${locked}, npm serves ${published}.`);
    console.error('\n  THIS IS EXPECTED AFTER A PUBLISH. It is not a defect in the build and it is\n  not something to work around: it is this check doing the one job the lockfile\n  comparison cannot do. Someone published a new version and the site has not\n  caught up yet. Follow the procedure below and it goes green.');
    console.error(
      '\n  This is the comparison the lockfile cannot make. The site and the lockfile can\n' +
      '  agree with each other while both disagree with what a reader receives from\n' +
      `  \`npm install ${PKG}\`.\n` +
      '\n  Re-verify the published credential expectations against the new version FIRST,\n' +
      '  then bump: cd scripts && npm install ' + PKG + '@^' + published + '\n' +
      '  and re-run node scripts/verify-published-credentials.mjs before the bump lands.\n' +
      '  If any verdict moves, that is a finding about the engine, not about the site.'
    );
  }
  if (stale.length || unmarked.length || drift) process.exit(1);
  if (published) {
    console.log(`Site, lockfile and npm's published latest all agree on ${locked}, and no`);
    console.log('version string is unmarked. Both comparisons made: our documents agree with');
    console.log("each other, AND they agree with what a reader installing today receives.");
  } else {
    console.log('Every current marker matches the lockfile, and no version string is unmarked.');
    console.log(`NOT CHECKED: npm's published latest (${publishedErr ? publishedErr.split('\n')[0] : 'no network'}).`);
    console.log('That second comparison is the one that establishes currency, so this run');
    console.log('proves internal consistency ONLY.');
  }
} else {
  if (unmarked.length) process.exit(1);
  console.log(changed.length ? `Updated ${changed.length} marker(s):` : 'Nothing to update.');
  for (const c of changed) console.log(`  ${c}`);
}
