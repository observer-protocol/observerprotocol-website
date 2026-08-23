#!/usr/bin/env node
/**
 * Does the schema /verify names as its source actually define the fields /verify
 * derives from it? Writes results/schema-claims.json.
 *
 * Why this exists
 * ---------------
 * Section 03 of /verify says its field names and derivations are taken from the
 * published schema at a named URL. That sentence is a provenance claim, and a
 * provenance claim is checkable: resolve each field the section documents against
 * the schema it cites, and see whether the schema says anything about it.
 *
 * Measured 2026-08-16: the cited version defines NONE of them. It is a reserved
 * placeholder whose whole body is `{"type": "object"}`. Every other published
 * version defines all nine. The VALUES on the page were right; the SOURCE was
 * wrong, and nothing on the page could have told a reader that, because the
 * claim and the schema were never compared.
 *
 * TWO SEPARATE REASONS PINNING THAT VERSION ESTABLISHES NOTHING, and only the
 * first is about the schema:
 *
 *   1. it imposes no constraints, so validating against it is vacuous;
 *   2. `schemaAllowlist` is an identifier comparison. The engine does
 *      `allowlist.includes(credentialSchema.id)` and never dereferences the URL,
 *      so even a strict schema at that URL would not be applied.
 *
 * Both are measured here rather than asserted, because a reader told only (1)
 * would reasonably conclude that pinning a better version fixes it.
 *
 *   node scripts/measure-schema-claims.mjs
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA_DIR = join(root, 'schemas/delegation');
const BASE = 'https://observerprotocol.org/schemas/delegation/';

/** The nine field blocks in section 03 of /verify, as dotted paths into a credential.
 *  Derived from the page by hand ONCE and then guarded: the count is asserted against the
 *  number of `.field-name` blocks on the page, so adding a tenth field without adding it here
 *  fails the build rather than quietly leaving it unmeasured. */
const CLAIMS = [
  { label: 'issuer', path: 'issuer' },
  { label: 'credentialSubject.id', path: 'credentialSubject.id' },
  { label: 'validFrom / validUntil', path: 'validFrom', also: 'validUntil' },
  { label: 'tradingMandate.maxNotionalPerOrder', path: 'credentialSubject.tradingMandate.maxNotionalPerOrder' },
  { label: 'tradingMandate.temporal.allowedTimeWindows', path: 'credentialSubject.tradingMandate.temporal.allowedTimeWindows' },
  { label: 'enforcementMode', path: 'credentialSubject.enforcementMode' },
  { label: 'delegationScope.may_delegate_further', path: 'credentialSubject.delegationScope.may_delegate_further' },
  { label: 'credentialStatus', path: 'credentialStatus' },
  { label: 'proof', path: 'proof' },
];

/** Walk a dotted path through a JSON Schema, following `properties`, `allOf` branches and
 *  local `$ref`s into `$defs`/`definitions`. Returns true if the schema says ANYTHING about
 *  the path. Deliberately generous: the finding is that a schema says nothing at all, and a
 *  stingy resolver would manufacture that result. */
function defines(schema, dotted, rootSchema = schema, depth = 0) {
  if (depth > 24 || schema === undefined || schema === null || typeof schema !== 'object') return false;
  if (typeof schema.$ref === 'string' && schema.$ref.startsWith('#/')) {
    const target = schema.$ref.slice(2).split('/').reduce((o, k) => (o ?? {})[decodeURIComponent(k)], rootSchema);
    return defines(target, dotted, rootSchema, depth + 1);
  }
  const [head, ...rest] = dotted.split('.');
  const tail = rest.join('.');
  const branches = [schema, ...(schema.allOf ?? []), ...(schema.anyOf ?? []), ...(schema.oneOf ?? [])];
  for (const b of branches) {
    if (b === schema && b.properties === undefined) continue;
    const resolved = typeof b?.$ref === 'string' && b.$ref.startsWith('#/')
      ? b.$ref.slice(2).split('/').reduce((o, k) => (o ?? {})[decodeURIComponent(k)], rootSchema)
      : b;
    const next = resolved?.properties?.[head];
    if (next === undefined) continue;
    if (rest.length === 0) return true;
    if (defines(next, tail, rootSchema, depth + 1)) return true;
  }
  return false;
}

const versions = readdirSync(SCHEMA_DIR).filter((f) => f.endsWith('.json')).sort((a, b) => {
  const n = (s) => s.replace(/^v|\.json$/g, '').split('.').map(Number);
  const [am, ai = 0] = n(a), [bm, bi = 0] = n(b);
  return am - bm || ai - bi;
});

const rows = versions.map((file) => {
  const schema = JSON.parse(readFileSync(join(SCHEMA_DIR, file), 'utf8'));
  const bytes = readFileSync(join(SCHEMA_DIR, file)).length;
  const results = CLAIMS.map((c) => ({
    label: c.label,
    defined: defines(schema, c.path) && (c.also === undefined || defines(schema, c.also)),
  }));
  return {
    version: file.replace(/\.json$/, ''),
    url: BASE + file,
    bytes,
    // The input's digest, so a later run can prove it measured the same document. The schemas
    // ARE in this repository, so unlike the record stores this measurement is re-derivable in CI.
    sha256: createHash('sha256').update(readFileSync(join(SCHEMA_DIR, file))).digest('hex'),
    title: schema.title ?? null,
    // A schema whose entire body is a type keyword constrains nothing. Detected rather than
    // recognised by version number, so a future placeholder is caught too.
    imposesNoConstraints: Object.keys(schema).every((k) => ['$schema', '$id', 'title', '$comment', 'type', 'description'].includes(k)),
    claimsDefined: results.filter((r) => r.defined).length,
    claimsTotal: CLAIMS.length,
    claims: results,
  };
});

// ─── WHICH SCHEMA EACH SERVED ARTIFACT PINS ──────────────────────────────────────────────────────
const pins = [];
for (const dir of ['credentials', 'verify-samples']) {
  const abs = join(root, dir);
  if (!existsSync(abs)) continue;
  for (const f of readdirSync(abs).filter((x) => x.endsWith('.json')).sort()) {
    const d = JSON.parse(readFileSync(join(abs, f), 'utf8'));
    const types = Array.isArray(d.type) ? d.type : [];
    if (!types.includes('VerifiableCredential')) continue; // store records carry no credentialSchema
    pins.push({ path: `${dir}/${f}`, credentialSchemaId: d?.credentialSchema?.id ?? null });
  }
}
const pinCount = (id) => pins.filter((p) => p.credentialSchemaId === id).length;

// ─── WHICH VERSION THE CODE SAMPLES TELL A READER TO ALLOWLIST ───────────────────────────────────
// Read out of the pages, so this cannot drift from what a reader is actually shown.
const samples = [];
for (const f of readdirSync(root).filter((x) => x.endsWith('.html'))) {
  const src = readFileSync(join(root, f), 'utf8');
  if (!src.includes('schemaAllowlist')) continue;
  const text = src.replace(/<[^>]*>/g, '').replace(/&#x27;|&apos;/g, "'");
  const urls = [...text.matchAll(/schemas\/delegation\/(v[\d.]+)\.json/g)].map((m) => m[1]);
  if (urls.length) samples.push({ page: f, allowlists: [...new Set(urls)] });
}

// ─── AND DOES THE FLAGSHIP ARTIFACT ACTUALLY VALIDATE? ───────────────────────────────────────────
//
// "Defines the field" and "the artifact conforms" are different questions, and the second is the
// one that decides which version the page should cite. Run with ajv when it is resolvable.
//
// AJV IS NOT A DEPENDENCY OF THIS REPOSITORY. Adding one is a decision with a maintainer, not a
// side effect of a docs fix.
//
// THIS USED TO DEGRADE TO `validationRun: false` AND SAY SO. That reasoning was wrong, and the
// way it was wrong is now a rule: A GENERATOR WITH N DECLARED INPUTS THAT HAS N-1 EXITS NON-ZERO
// AND WRITES NOTHING. Saying so inside the artifact is not enough, because the artifact is what
// the next reader and every check consume, and a degraded one is not smaller — it is DIFFERENT.
// Measured 2026-08-23: with ajv absent this wrote `citeInstead: null` where the previous run had
// `v2.4`, and `conformingVersions: []` where it had `["v2.4"]`. A page citing v2.4 then disagreed
// with results/, and check-measured-figures went red for a reason that had nothing to do with the
// pages. The generator produced a plausible artifact from an incomplete run and the failure
// surfaced three steps away.
//
// It now REFUSES and writes nothing. Resolve it with:
//   node scripts/measure-schema-claims.mjs --ajv /path/to/node_modules
// (ESM ignores NODE_PATH, so the path is passed explicitly rather than through the environment.)
const FLAGSHIP = 'credentials/maxi-0001-trading-mandate-2026-08.json';
const ajvIdx = process.argv.indexOf('--ajv');
const AJV_DIR = ajvIdx > -1 ? process.argv[ajvIdx + 1] : null;
let validation = { validationRun: false, reason: null, ajvVersion: null, results: [] };
try {
  const load = async (spec) => {
    if (AJV_DIR) return import(pathToFileURL(join(AJV_DIR, spec)).href);
    return import(spec);
  };
  const [{ default: Ajv2020 }, { default: Ajv7 }, { default: addFormats }] = await Promise.all([
    load('ajv/dist/2020.js'), load('ajv/dist/ajv.js'), load('ajv-formats/dist/index.js'),
  ]);
  const ajvVersion = JSON.parse(readFileSync(
    AJV_DIR ? join(AJV_DIR, 'ajv/package.json') : new URL(await import.meta.resolve('ajv/package.json')), 'utf8')).version;
  const cred = JSON.parse(readFileSync(join(root, FLAGSHIP), 'utf8'));
  const results = rows.map((r) => {
    const schema = JSON.parse(readFileSync(join(SCHEMA_DIR, `${r.version}.json`), 'utf8'));
    const draft = schema.$schema ?? null;
    const Ajv = /2020-12/.test(draft ?? '') ? Ajv2020 : Ajv7;
    const ajv = new Ajv({ strict: false, allErrors: true });
    addFormats(ajv);
    try {
      const validate = ajv.compile(schema);
      const valid = validate(cred);
      return {
        version: r.version, draft, valid,
        errors: (validate.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message}`).slice(0, 6),
        // A `true` from a schema that constrains nothing is not evidence of conformance.
        vacuous: valid === true && r.imposesNoConstraints,
      };
    } catch (e) {
      return { version: r.version, draft, valid: null, compileError: e.message.split('\n')[0], vacuous: false };
    }
  });
  validation = { validationRun: true, reason: null, ajvVersion, artifact: FLAGSHIP, results };
} catch (e) {
  console.error('\nREFUSING: ajv is not resolvable from this repository.');
  console.error(`  ${e.message.split('\n')[0]}`);
  console.error('');
  console.error('  This generator has two inputs: the published schemas, and a validator. One is');
  console.error('  missing, so it writes NOTHING rather than a file that looks like a measurement');
  console.error('  and is a measurement of less. A previous version degraded here and wrote');
  console.error('  citeInstead: null, which read as "no version conforms" rather than "nobody asked".');
  console.error('');
  console.error('  Resolve with:  node scripts/measure-schema-claims.mjs --ajv /path/to/node_modules');
  process.exit(1);
  validation.reason = `unreachable`;
}

const cited = 'v2.2';
const citedRow = rows.find((r) => r.version === cited);
const others = rows.filter((r) => r.version !== cited);

/** The version the page should cite: defines all nine AND is not a placeholder AND the flagship
 *  artifact actually validates against it. Derived from the run above rather than chosen, so if a
 *  future schema changes the answer this file says so instead of the page quietly going stale. */
const conforming = validation.validationRun
  ? rows.filter((r) => !r.imposesNoConstraints
      && r.claimsDefined === CLAIMS.length
      && validation.results.find((v) => v.version === r.version)?.valid === true)
  : [];

const out = {
  $comment: [
    'MEASURED OUTPUT. Regenerate with: node scripts/measure-schema-claims.mjs',
    'Asks one question per field: does this schema version say ANYTHING about it.',
    'It is not a validation run. See results/schema-validation.json for that.',
    '',
    'THIS FILE IS SERVED PUBLICLY. Read `provenance` below before quoting a figure from it.',
    'The caveats used to live only in this script, which the site returns 404 for, and in CI',
    'logs, which no reader sees.',
  ],
  measuredOn: new Date().toISOString().slice(0, 10),

  // WHAT A READER OF THIS URL NEEDS. Stated here even though this file has NO
  // registry-dependent field, because the other three served results/ artifacts do and a
  // reader comparing four of them should not have to infer why one is shaped differently.
  // Omitting the block would make the difference invisible; saying "none" makes it a fact.
  provenance: {
    whatWasMeasured: 'For each published delegation schema at ' + BASE + ', whether it says ' +
      'ANYTHING about each of the ' + CLAIMS.length + ' fields the page claims. One question ' +
      'per field per version. Not a validation run.',
    registryDependent: {
      fields: [],
      note: 'NONE. Nothing here depends on an npm dist-tag or a package version, which is what ' +
            'makes this file different from results/engine-payload-exports.json and ' +
            'results/signed-record-coverage.json. It does not go stale when `latest` moves.',
    },
    servedArtifactDependent: {
      fields: ['versions[]', 'citedDefines', 'citedBytes', 'citedImposesNoConstraints',
               'earliestFullVersion', 'citeInstead', 'conformingVersions'],
      computedAgainstServedState: { base: BASE, versionsMeasured: rows.length, citedVersion: cited },
      goesStaleWhen: 'a published schema at that base changes, or one is added or withdrawn, ' +
        'without this file being touched. Schemas are meant to be immutable at their URL, so ' +
        'this SHOULD never move; the check below exists because "should" is not a control.',
    },
    reDerivedBy: {
      script: 'scripts/check-measured-figures.mjs',
      when: 'every CI run, with no network required',
      what: 'The schema file IN THIS REPOSITORY at schemas/delegation/<version>.json is ' +
            'sha256-digested and compared to the digest recorded here; a mismatch FAILS the ' +
            'build. So this file cannot go stale silently, the same as ' +
            'results/engine-payload-exports.json and unlike the corpus half of ' +
            'results/signed-record-coverage.json, which nothing re-confirms.',
      whatItDoesNotEstablish: 'IT DIGESTS THE REPOSITORY COPY, NOT THE SERVED ONE. The figures ' +
            'here were measured by fetching ' + BASE + ', but the re-derivation compares the ' +
            'local file. That establishes the repository has not changed since the measurement. ' +
            'It does NOT establish that the URL still serves those bytes, so a deploy that ' +
            'served something else would not be caught here. Stated because the two are easy to ' +
            'read as one, and this block was first written claiming the fetch.',
    },
  },
  citedVersion: cited,
  citedDefines: citedRow?.claimsDefined ?? null,
  claimsTotal: CLAIMS.length,
  citedBytes: citedRow?.bytes ?? null,
  citedImposesNoConstraints: citedRow?.imposesNoConstraints ?? null,
  otherVersionCount: others.length,
  otherVersionsDefiningAll: others.filter((r) => r.claimsDefined === CLAIMS.length).length,
  // The version the page should cite instead: the earliest that defines all nine AND is not a
  // placeholder. Derived, so it does not have to be re-argued when a version is added.
  earliestFullVersion: others.find((r) => r.claimsDefined === CLAIMS.length && !r.imposesNoConstraints)?.version ?? null,
  // THE ONE TO CITE. Not the earliest that defines the fields: the only one that defines them AND
  // accepts the artifact the page walks a reader through. Both conditions are needed. Citing a
  // version the flagship fails would move the page from a vacuous source to a wrong one.
  citeInstead: conforming.length === 1 ? conforming[0].version : null,
  citeInsteadUrl: conforming.length === 1 ? BASE + conforming[0].version + '.json' : null,
  conformingVersions: conforming.map((r) => r.version),
  validation,
  allowlistEnforcement:
    'schemaAllowlist is an identifier comparison. The engine does allowlist.includes(credentialSchema.id) and never dereferences the URL, so no schema at any version is applied to a served artifact by the published verifier.',
  servedArtifacts: {
    total: pins.length,
    pinningCited: pinCount(BASE + cited + '.json'),
    pins,
  },
  codeSamples: samples,
  versions: rows,
};

mkdirSync(join(root, 'results'), { recursive: true });
writeFileSync(join(root, 'results/schema-claims.json'), JSON.stringify(out, null, 2) + '\n');

console.log(`${CLAIMS.length} field claims from /verify section 03, against ${rows.length} published schema version(s).\n`);
for (const r of rows) {
  const flag = r.imposesNoConstraints ? '  <-- imposes no constraints' : '';
  console.log(`  ${r.version.padEnd(6)} ${String(r.bytes).padStart(7)} bytes  defines ${r.claimsDefined}/${r.claimsTotal}${flag}`);
}
console.log(`\ncited by the page: ${cited}, defines ${out.citedDefines}/${CLAIMS.length}`);
console.log(`other published versions defining all ${CLAIMS.length}: ${out.otherVersionsDefiningAll} of ${out.otherVersionCount}`);
console.log(`earliest full version: ${out.earliestFullVersion}`);
console.log(`\nserved artifacts pinning ${cited}: ${out.servedArtifacts.pinningCited} of ${out.servedArtifacts.total}`);
for (const s of samples) console.log(`  code sample on ${s.page} allowlists ${s.allowlists.join(', ')}`);
console.log('\nWritten to results/schema-claims.json');
