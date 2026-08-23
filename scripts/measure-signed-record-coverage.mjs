#!/usr/bin/env node
/**
 * Measure how much of this estate's signed output any outside party can rebuild,
 * and write the answer to results/signed-record-coverage.json.
 *
 * Why this file exists rather than a number in a page
 * --------------------------------------------------
 * The estate's named defect is an affirmative answer computed on a code path
 * separate from the check meant to justify it. A count typed into a page is
 * exactly that: the sentence and the evidence are maintained in two places, and
 * the sentence cannot be falsified by the evidence moving.
 *
 * So no figure about record coverage is typed into any page. This script derives
 * them, results/ holds them, and check-measured-figures.mjs fails the build when a
 * page disagrees with results/.
 *
 * WHAT THIS CAN AND CANNOT ESTABLISH
 * ----------------------------------
 * It counts records carrying a non-empty `signature` and asks, per record kind,
 * whether ANY published version of the package exports something that rebuilds that
 * kind's signed bytes. It is a question about REBUILDABILITY, not about validity:
 * nothing here checks a signature. A kind with a constructor may still hold records
 * that fail; a kind without one cannot be checked at all, by us or by anyone.
 *
 * THE STORES ARE NOT IN THIS REPOSITORY, and that is a real limit rather than an
 * inconvenience. They are working artifacts under op-artifacts/, so CI cannot
 * re-derive this. The output therefore carries the file list with a sha256 per file,
 * so a later run can prove it measured the same population, and check-measured-figures
 * reports this figure as a DATED MEASUREMENT IT DID NOT RE-DERIVE rather than as
 * something it confirmed.
 *
 *   node scripts/measure-signed-record-coverage.mjs [--stores <dir>]
 */

import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const argIdx = process.argv.indexOf('--stores');
const STORES = argIdx > -1 ? process.argv[argIdx + 1] : join(process.env.HOME ?? '', 'op-artifacts');

if (!existsSync(STORES)) {
  console.error(`FAIL: no store directory at ${STORES}.`);
  console.error('      This script measures working artifacts that are deliberately not in this');
  console.error('      repository. Pass --stores <dir>, or run it where they live. It must not');
  console.error('      fall back to a default population: a coverage figure whose denominator is');
  console.error('      whatever happened to be readable is the defect this file exists to avoid.');
  process.exit(1);
}

// ─── WHICH KINDS CAN BE REBUILT, DERIVED FROM THE PUBLISHED PACKAGES ─────────────────────────────
// Read out of results/engine-payload-exports.json, which is itself measured rather than typed.
// This file does NOT carry its own opinion about which versions export what.
const exportsPath = join(root, 'results/engine-payload-exports.json');
if (!existsSync(exportsPath)) {
  console.error('FAIL: results/engine-payload-exports.json is missing.');
  console.error('      Run: node scripts/measure-engine-payload-exports.mjs');
  console.error('      This script will not guess which versions export which constructor.');
  process.exit(1);
}
const engineExports = JSON.parse(readFileSync(exportsPath, 'utf8'));

/** Record kind -> the export that rebuilds its signed bytes.
 *  A kind absent from this map has NO known rebuild route and is counted as such.
 *  Stated as a map rather than inferred from names because `determination` is rebuilt by a
 *  VERIFIER (verifyDecisionAttestation) and not by a *Payload constructor, and a naming
 *  convention would have silently mis-filed it. */
const REBUILD_ROUTE = {
  verdict: 'evaluationVerdictPayload',
  refused: 'refusalPayload',
  lapse: 'lapsePayload',
  resolution: 'resolutionPayload',
  determination: 'verifyDecisionAttestation',
};

// BOTH LISTS, and the reason is a bug this file already had once. `determination` is rebuilt by
// verifyDecisionAttestation, which lives in `verifiers`, not in `exports` (which holds only
// *Payload constructors). Reading `exports` alone filed 2,908 verifiable determinations as NEVER
// REBUILDABLE and put the headline at 52.5%. The measurement was wrong in the direction that
// makes the estate look worse, which is exactly as bad as the other direction and harder to doubt.
const everExported = new Set();
const exportedAtLatest = new Set();
for (const row of engineExports.versions) {
  const names = [...row.exports, ...(row.verifiers ?? [])];
  for (const e of names) everExported.add(e);
  if (row.version === engineExports.npmLatest) for (const e of names) exportedAtLatest.add(e);
}

// Every route named in REBUILD_ROUTE must be a name the packages actually publish, or the map has
// a typo and the kind it names is silently reported as unverifiable. Derived check, not a comment.
const unknownRoutes = Object.entries(REBUILD_ROUTE).filter(([, r]) => !everExported.has(r));
if (unknownRoutes.length) {
  console.error('FAIL: REBUILD_ROUTE names an export no published version has:');
  for (const [k, r] of unknownRoutes) console.error(`  ${k} -> ${r}`);
  console.error('      Fix the map. A wrong name here reports a verifiable kind as unverifiable.');
  process.exit(1);
}

// ─── WALK THE STORES ─────────────────────────────────────────────────────────────────────────────
const files = [];
(function walk(dir) {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === '.git') continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (e.endsWith('.jsonl')) files.push(p);
  }
})(STORES);
files.sort();

const total = new Map();
const signed = new Map();
const fileRows = [];
let unparsed = 0;
let lo = null, hi = null;

for (const f of files) {
  const raw = readFileSync(f);
  let lines = 0, sig = 0;
  for (const line of raw.toString('utf8').split('\n')) {
    const t = line.trim();
    if (!t) continue;
    lines++;
    let d;
    try { d = JSON.parse(t); } catch { unparsed++; continue; }
    if (d === null || typeof d !== 'object' || Array.isArray(d)) { unparsed++; continue; }
    const k = typeof d.k === 'string' ? d.k : '<no k>';
    total.set(k, (total.get(k) ?? 0) + 1);
    if (typeof d.signature === 'string' && d.signature !== '') {
      signed.set(k, (signed.get(k) ?? 0) + 1);
      sig++;
      const ts = d.observedAt ?? d.at;
      if (typeof ts === 'string' && ts.length >= 10) {
        if (lo === null || ts < lo) lo = ts;
        if (hi === null || ts > hi) hi = ts;
      }
    }
  }
  fileRows.push({
    path: relative(STORES, f),
    lines,
    signed: sig,
    sha256: createHash('sha256').update(raw).digest('hex'),
  });
}

const kinds = [...signed.keys()].sort((a, b) => signed.get(b) - signed.get(a));
const classes = kinds.map((k) => {
  const route = REBUILD_ROUTE[k];
  return {
    kind: k,
    signed: signed.get(k),
    total: total.get(k),
    rebuildRoute: route ?? null,
    rebuildableEver: route ? everExported.has(route) : false,
    rebuildableAtNpmLatest: route ? exportedAtLatest.has(route) : false,
  };
});

const signedTotal = classes.reduce((n, c) => n + c.signed, 0);
const neverRebuildable = classes.filter((c) => !c.rebuildableEver);
const notAtLatest = classes.filter((c) => c.rebuildableEver && !c.rebuildableAtNpmLatest);
const sum = (rows) => rows.reduce((n, c) => n + c.signed, 0);

// The percentage is DERIVED and rounded once, here, so a page never rounds it a second
// time and never disagrees with the ratio beside it.
const pct = (n) => `${(Math.round((n / signedTotal) * 1000) / 10).toFixed(1)}%`;

const out = {
  $comment: [
    'MEASURED OUTPUT. Do not hand-edit: regenerate with',
    '  node scripts/measure-signed-record-coverage.mjs',
    'Every figure quoted on a page must appear here first. check-measured-figures.mjs',
    'fails the build when a page and this file disagree.',
    '',
    'A signature is counted as PRESENT, never as valid. Nothing here verifies anything.',
    'The question asked is narrower and worse: can the bytes be rebuilt at all.',
    '',
    'THIS FILE IS SERVED PUBLICLY AND HAS TWO HALVES THAT AGE DIFFERENTLY.',
    'Read `provenance` below before quoting any figure from it. The caveats used to',
    'live only in this script, which the site returns 404 for, and in CI logs, which',
    'no reader sees. A figure that announces it is unchecked where nobody reads the',
    'announcement is a marker doing no work, so the announcement is now in the artifact.',
  ],
  measuredOn: new Date().toISOString().slice(0, 10),

  // WHAT A READER OF THIS URL NEEDS AND COULD NOT PREVIOUSLY GET. What was measured,
  // when, over what, which fields depend on a registry state, and which registry state
  // they were computed against. The last of those was not recorded anywhere at all:
  // `rebuildableAtNpmLatest` named a version only inside a prose note.
  provenance: {
    corpusHalf: {
      fields: ['classes[].signed', 'classes[].total', 'signedRecordTotal', 'recordTotal',
               'signedRange', 'headline.neverRebuildable'],
      measuredOn: new Date().toISOString().slice(0, 10),
      over: `${files.length} store file(s) under ${STORES.replace(process.env.HOME ?? '', '~')}`,
      reDerivable: false,
      why: 'The stores are working artifacts outside this repository. CI cannot reach them, ' +
           'so these figures are a DATED MEASUREMENT and nothing re-confirms them. The per-file ' +
           'sha256 list below exists so a later run can prove it measured the same population.',
    },
    predicateHalf: {
      fields: ['classes[].rebuildableAtNpmLatest', 'headline.notRebuildableAtNpmLatest'],
      computedAgainstRegistryState: {
        npmLatest: engineExports.npmLatest,
        source: 'results/engine-payload-exports.json',
        thatFileMeasuredOn: engineExports.measuredOn,
      },
      reDerivable: true,
      why: 'These depend on which symbols npm\'s `latest` exports, which is public and is ' +
           're-read by check-measured-figures.mjs on every run. THEY GO FALSE WHEN THE ' +
           '`latest` DIST-TAG MOVES, without this file being touched. If npm latest is not ' +
           `${engineExports.npmLatest}, treat every field listed here as stale.`,
    },
  },
  storesRoot: STORES.replace(process.env.HOME ?? '', '~'),
  storeFileCount: files.length,
  unparsedLines: unparsed,
  signedRecordTotal: signedTotal,
  recordTotal: [...total.values()].reduce((a, b) => a + b, 0),
  signedRange: {
    earliest: lo,
    latest: hi,
    // Date-only forms, derived here so a page never slices a timestamp itself and never
    // disagrees with the full value beside it.
    earliestDate: lo ? lo.slice(0, 10) : null,
    latestDate: hi ? hi.slice(0, 10) : null,
  },
  classes,
  headline: {
    neverRebuildable: {
      kinds: neverRebuildable.map((c) => c.kind),
      count: sum(neverRebuildable),
      percentOfSigned: pct(sum(neverRebuildable)),
      note: 'No published version of the package rebuilds these. Not fragile, not version-pinned: unverifiable by anyone, permanently, on the evidence of every version published to date.',
    },
    notRebuildableAtNpmLatest: {
      kinds: notAtLatest.map((c) => c.kind),
      count: sum(notAtLatest),
      percentOfSigned: pct(sum(notAtLatest)),
      note: `Rebuildable at some published version but NOT at ${engineExports.npmLatest}, which is what npm install serves a reader today.`,
    },
  },
  files: fileRows,
};

mkdirSync(join(root, 'results'), { recursive: true });
writeFileSync(join(root, 'results/signed-record-coverage.json'), JSON.stringify(out, null, 2) + '\n');

console.log(`${files.length} record file(s) under ${out.storesRoot}, ${unparsed} unparsed line(s).`);
console.log(`${signedTotal} signed records, ${out.signedRange.earliest} to ${out.signedRange.latest}.\n`);
const w = Math.max(...classes.map((c) => c.kind.length));
for (const c of classes) {
  const mark = !c.rebuildableEver ? 'NEVER REBUILDABLE'
    : !c.rebuildableAtNpmLatest ? `not at ${engineExports.npmLatest}`
    : `via ${c.rebuildRoute}`;
  console.log(`  ${c.kind.padEnd(w)}  ${String(c.signed).padStart(6)} signed   ${mark}`);
}
console.log(`\nnever rebuildable: ${out.headline.neverRebuildable.count} of ${signedTotal} (${out.headline.neverRebuildable.percentOfSigned})`);
console.log(`not at npm latest: ${out.headline.notRebuildableAtNpmLatest.count} of ${signedTotal} (${out.headline.notRebuildableAtNpmLatest.percentOfSigned})`);
console.log('\nWritten to results/signed-record-coverage.json');
