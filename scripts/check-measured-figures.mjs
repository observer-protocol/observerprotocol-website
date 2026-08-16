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
 * TWO KINDS OF COMPARISON, AND ONLY ONE OF THEM ESTABLISHES CURRENCY
 * -----------------------------------------------------------------
 * This is the lesson sync-engine-version.mjs learned the hard way, applied here before
 * rather than after.
 *
 * FIRST, always: page <-> results/. "The copy agrees with our recorded measurement."
 * On its own this is satisfiable by a consistently wrong pair, which is exactly how the
 * site once documented rc.6 while npm served rc.10 and every check passed. It is
 * necessary and it is not sufficient.
 *
 * SECOND, per source: results/ <-> the subject. "That measurement still describes the
 * world." Four sources, and they differ in whether this is even possible:
 *
 *   engine-payload-exports  <-> npm registry        re-derived, skipped WITH A NOTICE
 *   schema-claims           <-> schemas/delegation  re-derived by digest, always
 *   hosted-verifier         <-> the live service    re-derived, skipped WITH A NOTICE
 *   signed-record-coverage  <-> the record stores   NOT POSSIBLE
 *
 * The last one cannot be made here: the stores are working artifacts deliberately not in
 * this repository, so CI has no access to the subject. That figure is reported as a dated
 * measurement IT DID NOT RE-DERIVE, with the date and the per-file digests it was taken
 * over. A check that cannot reach its subject must say it did not look; reporting it green
 * would be the defect wearing this file's own badge.
 *
 * The hosted-verifier comparison is the one section 04 of /verify exists because of. That
 * section described the service's engine version for a week after it changed, because a
 * claim about somebody else's deployment goes stale with no commit here to notice.
 *
 *   node scripts/check-measured-figures.mjs
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
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

// ─── COMPARISON 2b: are the schemas still the ones that were measured? ───────────────────────────
// These ARE in the repository, so unlike the record stores this input is re-derivable here. A
// schema edited after the measurement would leave section 03 citing a document that no longer says
// what the page reports, and the digest is what notices.
let schemasChecked = 0;
const schemaClaims = results['schema-claims'];
if (schemaClaims) {
  for (const v of schemaClaims.versions ?? []) {
    const p = join(root, 'schemas/delegation', `${v.version}.json`);
    if (!existsSync(p)) {
      failures.push(`results/schema-claims.json measured ${v.version}, which is no longer published at schemas/delegation/.`);
      continue;
    }
    const digest = createHash('sha256').update(readFileSync(p)).digest('hex');
    schemasChecked++;
    if (digest !== v.sha256) {
      failures.push(
        `schemas/delegation/${v.version}.json changed since the measurement.\n` +
        `    measured: ${v.sha256}\n` +
        `    now:      ${digest}\n` +
        `    Re-run: node scripts/measure-schema-claims.mjs`
      );
    }
  }
}

// ─── COMPARISON 2c: does the hosted verifier still report what we published about it? ────────────
// THIS IS THE ONE SECTION 04 EXISTS BECAUSE OF. The page described that service's engine version
// for a week after it changed, because a claim about somebody else's deployment goes stale with no
// commit here. Re-derived every run, skipped with a notice when unreachable, never assumed.
let hostedChecked = false, hostedErr = null;
const hosted = results['hosted-verifier'];
if (hosted?.endpoint) {
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 20000);
    const live = await fetch(hosted.endpoint, { signal: ac.signal, headers: { accept: 'application/json' } })
      .finally(() => clearTimeout(t));
    if (!live.ok) throw new Error(`HTTP ${live.status}`);
    const v = await live.json();
    hostedChecked = true;
    const pairs = [
      ['engineRunning', v.engine?.running, hosted.engineRunning],
      ['engineBuiltAgainst', v.engine?.builtAgainst, hosted.engineBuiltAgainst],
      ['commit', v.build?.commit, hosted.commit],
    ];
    for (const [name, now, measured] of pairs) {
      if (now !== measured) {
        failures.push(
          `The hosted verifier's ${name} is now "${now}", recorded as "${measured}".\n` +
          `    Section 04 of /verify describes that deployment. It has moved and the page has not.\n` +
          `    Re-run: node scripts/measure-hosted-verifier.mjs, then re-read what section 04 claims.`
        );
      }
    }
  } catch (e) {
    hostedErr = e.message.split('\n')[0];
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

if (schemaClaims) {
  console.log(`\nRE-DERIVED: ${schemasChecked} published schema(s) still digest-match the measurement.`);
}

if (hosted) {
  if (hostedChecked) {
    console.log(`RE-DERIVED: the hosted verifier still reports engine ${hosted.engineRunning} at commit ${hosted.commitShort}.`);
  } else {
    console.log(`NOT CHECKED: the hosted verifier at ${hosted.endpoint} (${hostedErr ?? 'no network'}).`);
    console.log('Section 04 describes a deployment this run could not reach, so nothing here');
    console.log('establishes that what it says about that service is still true.');
  }
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
