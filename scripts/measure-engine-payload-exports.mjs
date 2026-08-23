#!/usr/bin/env node
/**
 * Which published versions of @observer-protocol/policy-engine export which payload
 * constructor, read out of the published tarballs rather than out of a CHANGELOG.
 * Writes results/engine-payload-exports.json.
 *
 * Why the tarball and not the CHANGELOG
 * ------------------------------------
 * The CHANGELOG records no payload-type bump at all, and the withdrawal this file
 * exists to document is not in it either. A release note is a claim about a release;
 * the tarball is the release. Measured 2026-08-16: `resolutionPayload` was exported
 * at rc.8, absent from rc.9 through rc.12, and restored at rc.13. Nothing in the
 * package's own documentation says so, and rc.12 is the version `npm install` serves.
 *
 * Also read: EVALUATION_VERDICT_PAYLOAD_TYPE and REFUSAL_PAYLOAD_TYPE, because a
 * constructor being present says nothing about which domain separator it emits, and
 * the verdict constant moved (v3 through rc.17, v4 at rc.18) while the refusal one
 * did not.
 *
 *   node scripts/measure-engine-payload-exports.mjs
 *
 * Needs network and `npm pack`. It is a MEASUREMENT script, not a build step: CI runs
 * check-measured-figures.mjs, which re-derives this from npm when it can and says so
 * plainly when it cannot.
 */

import { writeFileSync, mkdirSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PKG = '@observer-protocol/policy-engine';

export function readPublishedExports() {
  const versions = JSON.parse(
    execFileSync('npm', ['view', PKG, 'versions', '--json'], { encoding: 'utf8', timeout: 60000 })
  );
  const npmLatest = execFileSync('npm', ['view', PKG, 'dist-tags.latest'], { encoding: 'utf8', timeout: 30000 }).trim();
  const npmRc = (() => {
    try { return execFileSync('npm', ['view', PKG, 'dist-tags.rc'], { encoding: 'utf8', timeout: 30000 }).trim() || null; }
    catch { return null; }
  })();

  const work = join(tmpdir(), 'op-engine-exports');
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });

  const rows = [];
  for (const v of versions) {
    let name;
    try {
      name = execFileSync('npm', ['pack', `${PKG}@${v}`, '--silent'], {
        cwd: work, encoding: 'utf8', timeout: 120000,
      }).trim().split('\n').pop();
    } catch (e) {
      throw new Error(`could not fetch ${PKG}@${v}: ${e.message.split('\n')[0]}`);
    }
    const tgz = join(work, name);
    if (!existsSync(tgz)) throw new Error(`npm pack reported ${name} for ${v} and it is not there`);

    const dts = execFileSync('tar', ['-xOzf', tgz, 'package/dist/index.d.ts'], { encoding: 'utf8' });
    const mjs = (() => {
      try { return execFileSync('tar', ['-xOzf', tgz, 'package/dist/index.mjs'], { encoding: 'utf8' }); }
      catch { return ''; }
    })();

    const exports = [...new Set([...dts.matchAll(/\b([a-zA-Z]+Payload)\b/g)].map((m) => m[1]))].sort();
    const verifiers = ['verifyDecisionAttestation', 'verifyCredentialObject', 'signableFromRefusal']
      .filter((n) => dts.includes(n));
    const constant = (re) => (mjs.match(re) ?? [null, null])[1];

    rows.push({
      version: v,
      exports,
      verifiers,
      verdictPayloadType: constant(/EVALUATION_VERDICT_PAYLOAD_TYPE = "([^"]+)"/),
      refusalPayloadType: constant(/REFUSAL_PAYLOAD_TYPE = "([^"]+)"/),
    });
  }
  rmSync(work, { recursive: true, force: true });
  return { npmLatest, npmRc, rows };
}

/** Contiguous runs of versions where `name` is absent, between two versions where it is present.
 *  A WITHDRAWAL, which is different from "not yet added" and from "removed for good", and the
 *  difference is the whole point: a reader on a withdrawn band is holding a package that USED to
 *  do this and will again, and nothing tells them. */
export function withdrawnBands(rows, name) {
  const seen = rows.map((r) => r.exports.includes(name));
  const first = seen.indexOf(true);
  const last = seen.lastIndexOf(true);
  if (first === -1) return [];
  const bands = [];
  let start = null;
  for (let i = first; i <= last; i++) {
    if (!seen[i] && start === null) start = i;
    if (seen[i] && start !== null) {
      bands.push({
        from: rows[start].version,
        to: rows[i - 1].version,
        // Derived here so no page ever computes "the one after the band" itself.
        lastPresentBefore: rows[start - 1].version,
        restoredAt: rows[i].version,
        count: i - start,
        versions: rows.slice(start, i).map((r) => r.version),
      });
      start = null;
    }
  }
  return bands;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { npmLatest, npmRc, rows } = readPublishedExports();
  const allExports = [...new Set(rows.flatMap((r) => r.exports))].sort();
  const withdrawals = {};
  for (const name of allExports) {
    const bands = withdrawnBands(rows, name);
    if (bands.length) withdrawals[name] = bands;
  }
  const latestRow = rows.find((r) => r.version === npmLatest);
  const out = {
    $comment: [
      'MEASURED OUTPUT, read out of every published tarball. Do not hand-edit: regenerate with',
      '  node scripts/measure-engine-payload-exports.mjs',
      'Presence of an export, not its behaviour. Nothing here was called.',
      '',
      'THIS FILE IS SERVED PUBLICLY. Read `provenance` below before quoting a figure from it.',
      'The caveats used to live only in this script, which the site returns 404 for, and in CI',
      'logs, which no reader sees.',
    ],
    measuredOn: new Date().toISOString().slice(0, 10),

    // WHAT A READER OF THIS URL NEEDS AND COULD NOT PREVIOUSLY GET. Which fields depend on a
    // registry state, which state they were computed against, and — the fact that makes this
    // file different from signed-record-coverage — that something re-confirms them, and where.
    // That last lived only in CI output.
    provenance: {
      whatWasMeasured: 'Which symbols each published tarball of ' + PKG + ' exports, read out of ' +
        'the tarballs themselves rather than out of a CHANGELOG.',
      registryDependent: {
        fields: ['npmLatest', 'npmRc', 'npmLatestExports', 'versionCount'],
        computedAgainstRegistryState: { npmLatest, npmRc, versionCount: rows.length },
        goesStaleWhen: 'a dist-tag moves or a new version is published, without this file being touched.',
      },
      reDerivedBy: {
        script: 'scripts/check-measured-figures.mjs',
        when: 'every CI run',
        what: 'npmLatest and versionCount are re-read from the registry and a disagreement FAILS ' +
              'the build. So this file cannot go stale silently, which is what distinguishes it ' +
              'from results/signed-record-coverage.json, whose corpus half nothing re-confirms.',
        notReDerived: 'The per-version `exports` lists. Re-reading them means fetching every ' +
              'published tarball on every run, so they are trusted between measurements.',
      },
    },
    package: PKG,
    npmLatest,
    npmRc,
    versionCount: rows.length,
    withdrawals,
    npmLatestExports: latestRow?.exports ?? [],
    versions: rows,
  };
  mkdirSync(join(root, 'results'), { recursive: true });
  writeFileSync(join(root, 'results/engine-payload-exports.json'), JSON.stringify(out, null, 2) + '\n');

  console.log(`${rows.length} published version(s). npm latest = ${npmLatest}, npm rc = ${npmRc ?? 'none'}\n`);
  for (const r of rows) {
    console.log(`  ${r.version.padEnd(12)} ${r.verdictPayloadType ?? '-'.padEnd(26)}  ${r.exports.join(', ') || '<no payload constructors>'}`);
  }
  if (Object.keys(withdrawals).length) {
    console.log('\nWITHDRAWN AND RESTORED (present, then absent, then present again):');
    for (const [name, bands] of Object.entries(withdrawals)) {
      for (const b of bands) {
        const inside = b.versions.includes(npmLatest) ? '  <-- npm latest sits INSIDE this band' : '';
        console.log(`  ${name}: absent ${b.from} through ${b.to}${inside}`);
      }
    }
  }
  console.log('\nWritten to results/engine-payload-exports.json');
}
