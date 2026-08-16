#!/usr/bin/env node
/**
 * No figure about our own evidence is typed into a page. Every one is marked, and
 * every marked figure is compared against results/ on every build.
 *
 * Why this exists
 * ---------------
 * The estate's named defect is an affirmative answer computed on a code path separate
 * from the check meant to justify it, so the answer cannot be falsified by the check
 * failing. A count typed into a page is the purest form of it: the sentence says 27%
 * and nothing anywhere can make the sentence wrong. This file closes that for the
 * register on index.html and the version claims on verify.html.
 *
 *   <span data-measured="signed-record-coverage:headline.neverRebuildable.count">3,089</span>
 *
 * The key is `<results file stem>:<dotted path>`. The element's text must equal the
 * value at that path, comparing with thousands separators removed, so a page may write
 * 3,089 where results/ holds 3089 and may not write 3,090.
 *
 * THREE COMPARISONS, AND THEY ESTABLISH DIFFERENT THINGS
 * -----------------------------------------------------
 * This is the lesson sync-engine-version.mjs learned the hard way, applied here before
 * rather than after:
 *
 *   1. page  <->  results/            "the copy agrees with our recorded measurement"
 *   2. results/engine-payload-exports  <->  npm    "that measurement still describes npm"
 *   3. results/signed-record-coverage  <->  the stores    NOT POSSIBLE HERE
 *
 * (1) alone is satisfiable by a consistently wrong pair, which is exactly how the site
 * once documented rc.6 while npm served rc.10 and every check passed.
 *
 * (2) is re-derived from the registry when the network allows and is SKIPPED WITH A
 * NOTICE, never passed, when it does not.
 *
 * (3) cannot be made: the record stores are working artifacts that are deliberately not
 * in this repository, so CI has no access to the subject. This check therefore reports
 * that figure as a dated measurement IT DID NOT RE-DERIVE, and prints the date and the
 * file digests it was taken over. A check that cannot reach its subject must say it did
 * not look. Reporting it green would be the defect wearing this file's own badge.
 *
 *   node scripts/check-measured-figures.mjs
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const resultsDir = join(root, 'results');

if (!existsSync(resultsDir)) {
  console.error('FAIL: results/ does not exist. Run the measure-*.mjs scripts.');
  process.exit(1);
}

const results = {};
for (const f of readdirSync(resultsDir)) {
  if (f.endsWith('.json')) results[f.replace(/\.json$/, '')] = JSON.parse(readFileSync(join(resultsDir, f), 'utf8'));
}

const htmlFiles = [];
(function walk(dir) {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === '.git' || e === 'results') continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (e.endsWith('.html')) htmlFiles.push(p);
  }
})(root);

const norm = (s) => String(s).replace(/[,\s ]/g, '');
const resolve = (obj, path) => path.split('.').reduce((o, k) => (o === undefined || o === null ? undefined : o[k]), obj);
const render = (v) => (Array.isArray(v) ? v.join(', ') : String(v));

const MARKED = /<span data-measured="([^"]+)">(.*?)<\/span>/gs;

const manifest = JSON.parse(readFileSync(join(root, 'scripts/measured-figures.json'), 'utf8'));
const declared = new Map(manifest.required.map((r) => [r.key, r]));

const failures = [];
const seen = new Map();
/** key -> Set of page basenames it was actually found on. */
const foundOn = new Map();

for (const file of htmlFiles) {
  const src = readFileSync(file, 'utf8');
  const rel = file.slice(root.length + 1);
  for (const m of src.matchAll(MARKED)) {
    const [, key, body] = m;
    const [stem, path] = key.split(':');
    const bag = results[stem];
    if (!bag) {
      failures.push(`${rel}: data-measured="${key}" names results/${stem}.json, which does not exist.`);
      continue;
    }
    if (path === undefined) {
      failures.push(`${rel}: data-measured="${key}" has no dotted path after the colon.`);
      continue;
    }
    const value = resolve(bag, path);
    if (value === undefined) {
      failures.push(`${rel}: data-measured="${key}" resolves to nothing in results/${stem}.json.`);
      continue;
    }
    // The page may carry markup inside the span (a <code> wrapper, an entity). Compare text.
    const text = body.replace(/<[^>]*>/g, '').replace(/&[a-z]+;/g, ' ');
    seen.set(key, (seen.get(key) ?? 0) + 1);
    if (!foundOn.has(key)) foundOn.set(key, new Set());
    foundOn.get(key).add(rel);
    if (!declared.has(key)) {
      failures.push(
        `${rel}: data-measured="${key}" is not declared in scripts/measured-figures.json.\n` +
        `    Declare it with the page it belongs on and why. An undeclared figure is one that\n` +
        `    can be deleted later without the build noticing.`
      );
    }
    if (norm(text) !== norm(render(value))) {
      failures.push(
        `${rel}: data-measured="${key}"\n` +
        `    page says:    ${text.trim()}\n` +
        `    results says: ${render(value)}\n` +
        `    The copy and the measurement disagree. Re-run the measure script and update the\n` +
        `    page, or find out why the measurement moved. Do not edit results/ by hand.`
      );
    }
  }
}

// ─── COVERAGE: a declared figure that vanished from its page ─────────────────────────────────────
// The comparison above only sees figures that ARE marked, so deleting an uncomfortable number
// would turn this check green. This is the half that stops that.
for (const r of manifest.required) {
  for (const page of r.mustAppearIn) {
    if (!(foundOn.get(r.key)?.has(page))) {
      failures.push(
        `${page}: required figure "${r.key}" is not on the page.\n` +
        `    Declared in scripts/measured-figures.json because: ${r.why}\n` +
        `    If it genuinely belongs elsewhere now, move the declaration in the same commit and\n` +
        `    say why. Dropping a measured claim must not be something an edit does quietly.`
      );
    }
  }
}

// ─── COMPARISON 2: does results/engine-payload-exports still describe npm? ───────────────────────
let registryChecked = false, registryErr = null;
const engine = results['engine-payload-exports'];
if (engine) {
  try {
    const { execFileSync } = await import('node:child_process');
    const latest = execFileSync('npm', ['view', engine.package, 'dist-tags.latest'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 20000,
    }).trim();
    const count = JSON.parse(execFileSync('npm', ['view', engine.package, 'versions', '--json'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 30000,
    })).length;
    registryChecked = true;
    if (latest !== engine.npmLatest) {
      failures.push(
        `results/engine-payload-exports.json records npmLatest ${engine.npmLatest}, npm now serves ${latest}.\n` +
        `    Every claim on the site about what a reader receives is now about the wrong version.\n` +
        `    Re-run: node scripts/measure-engine-payload-exports.mjs`
      );
    }
    if (count !== engine.versionCount) {
      failures.push(
        `results/engine-payload-exports.json covers ${engine.versionCount} published version(s), npm now has ${count}.\n` +
        `    A version published since the measurement is unmeasured, and a withdrawal band that\n` +
        `    ends in a new release would still read as open. Re-run the measure script.`
      );
    }
  } catch (e) {
    registryErr = e.message.split('\n')[0];
  }
}

// ─── REPORT ──────────────────────────────────────────────────────────────────────────────────────
console.log(`${seen.size} distinct measured figure(s) across ${[...seen.values()].reduce((a, b) => a + b, 0)} marker(s) in ${htmlFiles.length} page(s).`);

const coverage = results['signed-record-coverage'];
if (coverage) {
  console.log(
    `\nNOT RE-DERIVED: signed-record-coverage. Measured ${coverage.measuredOn} over ` +
    `${coverage.storeFileCount} file(s) under ${coverage.storesRoot}, which are not in this\n` +
    `repository, so this run compared the pages to that record and did NOT check that the record\n` +
    `still describes the stores. It is a dated measurement. Re-derive with:\n` +
    `  node scripts/measure-signed-record-coverage.mjs`
  );
}

if (engine) {
  if (registryChecked) {
    console.log(`\nRE-DERIVED: engine-payload-exports still agrees with npm (latest ${engine.npmLatest}, ${engine.versionCount} versions).`);
  } else {
    console.log(`\nNOT CHECKED: npm registry (${registryErr ?? 'no network'}). The comparison that establishes`);
    console.log('currency did not run, so this pass proves internal consistency ONLY.');
  }
}

if (failures.length) {
  console.error(`\n${failures.length} measured figure(s) out of sync:\n`);
  for (const f of failures) console.error(`  ${f}\n`);
  process.exit(1);
}

console.log('\nEvery marked figure matches results/.');
