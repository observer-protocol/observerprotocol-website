#!/usr/bin/env node
// DECLARES-COMPARES: {"repositoryHolds":["results/*.json fields quoted in pages via data-measured","data-derived-claim predicates on pages"],"worldSource":"npmjs.org dist-tags and versions; the hosted verifier's /version; published schema files in this repo","goesStaleWhen":"a dist-tag moves, a version is published, or the hosted service is redeployed"}
// ^ Machine-readable. What this check holds against the world, and what makes it
//   stale. worldSource null is a DECLARATION, not an absence: it says both sides are
//   inside this repository. Read by scripts/check-declarations.mjs, which FAILS on any
//   CI-invoked check that carries no declaration.
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
    if (e === '_site' || e === 'node_modules' || e === '.git' || e === 'results') continue;
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
const claimsSkipped = [];   // conditions that make a claim UNCHECKED, not false. Exit 4, not 1.
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
let registryChecked = false, registryErr = null, freshLatest = null;
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
    freshLatest = latest;
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

// ─── RUN PROVENANCE ──────────────────────────────────────────────────────────────────────────────
// WAS THIS RUN MADE AGAINST THE REPOSITORY, OR AGAINST EDITED INPUTS?
//
// A check that can be driven to fail by injection produces, on an injected run, output
// BYTE-IDENTICAL to a live failure. That happened here: the first demonstration of the
// derived-claim marker was reported as a failure and was an injection, and the only thing
// that distinguished them was that the person reporting it remembered doing it. Nothing in
// the output said so.
//
// Two distinguishers are available to the check itself, and both are used:
//
//   1. IS THE INPUT THE COMMITTED ONE? Every file read here is tracked. `git diff HEAD`
//      answers it exactly, and names the fields that moved.
//   2. DID measuredOn MOVE? A measured value can only change legitimately by re-running the
//      measure script, which rewrites measuredOn. A results file whose VALUES differ from
//      HEAD while its measuredOn does NOT is the signature of a hand edit, because a
//      re-measurement would have stamped it.
//
// THESE LABEL, THEY DO NOT REFUSE. Injection is how this check gets demonstrated, so a run
// that refuses on modified inputs would forbid its own test. The verdict is unchanged; the
// reader is told what the verdict was computed from.
//
// It is silent when every input matches HEAD. NOTE THE COST OF THAT SILENCE: a clean run and
// a run where this labelling failed to execute look the same. Absence is carrying meaning
// here without an instrument behind it, which is the shape this estate keeps flagging. Stated
// rather than fixed, because "say nothing on a clean run" was the instruction.
const provenance = [];
let inputsChecked = 0;
let provenanceUnavailable = false;
{
  const { execFileSync } = await import('node:child_process');
  const git = (args) => {
    try {
      return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    } catch { return null; }
  };
  const tracked = [
    ...readdirSync(resultsDir).filter((f) => f.endsWith('.json')).map((f) => `results/${f}`),
    ...htmlFiles.map((f) => f.slice(root.length + 1)),
  ];
  inputsChecked = tracked.length;
  const dirty = git(['diff', '--name-only', 'HEAD', '--', ...tracked]);
  if (dirty === null) {
    // NOT A MODIFICATION AND NOT A CLEAN RUN. Collapsing "could not establish" into
    // either one is the estate's own named defect, so it gets its own state.
    provenanceUnavailable = true;
  } else {
    for (const rel of dirty.split('\n').filter(Boolean)) {
      if (rel.startsWith('results/')) {
        let headMeasuredOn = null, nowMeasuredOn = null;
        try { headMeasuredOn = JSON.parse(git(['show', `HEAD:${rel}`]) ?? '{}').measuredOn ?? null; } catch { /* unparseable at HEAD */ }
        try { nowMeasuredOn = JSON.parse(readFileSync(join(root, rel), 'utf8')).measuredOn ?? null; } catch { /* unparseable now */ }
        if (headMeasuredOn && nowMeasuredOn && headMeasuredOn === nowMeasuredOn) {
          provenance.push(
            `  ${rel}\n` +
            `      differs from HEAD, and measuredOn did NOT move (still ${nowMeasuredOn}).\n` +
            `      A measured value changed without the measure script running. That is a hand edit\n` +
            `      or an injection, not a re-measurement.`
          );
        } else {
          provenance.push(
            `  ${rel}\n` +
            `      differs from HEAD; measuredOn ${headMeasuredOn ?? '(none)'} -> ${nowMeasuredOn ?? '(none)'}.\n` +
            `      Consistent with a re-measurement.`
          );
        }
      } else {
        provenance.push(`  ${rel}\n      differs from HEAD. A page this run read is not the committed one.`);
      }
    }
  }
}
// IT SPEAKS ON A CLEAN RUN TOO, AND THAT IS THE POINT. Saying nothing when every input
// matches HEAD makes a clean run and a run where this labelling never executed look
// identical — a silent-failure mode inside the mechanism that exists to remove
// silent-failure modes. With the line, absence becomes a positive statement with an
// instrument behind it: no provenance line at all now means THE LABELLING DID NOT RUN,
// rather than leaving a reader to guess that it ran and found nothing. It carries the
// number of inputs compared, so "clean" is a measurement and not an assurance.
const provenanceBanner = provenanceUnavailable
  ? `RUN PROVENANCE — COULD NOT BE ESTABLISHED. git did not answer, so this run cannot say\n` +
    `whether its inputs are the committed ones. That is not a clean run and not a modified one.`
  : provenance.length
    ? `RUN PROVENANCE — this run was made against MODIFIED INPUTS, so the findings below may\n` +
      `follow from those modifications rather than from the world:\n\n${provenance.join('\n')}\n`
    : `RUN PROVENANCE — ${inputsChecked} input(s) compared against HEAD; every one is the committed version.`;

// ─── REPORT ──────────────────────────────────────────────────────────────────────────────────────
// THE VERDICT IS PRINTED BEFORE THE CONTEXT, DELIBERATELY. This block used to print
// its RE-DERIVED lines as it went, so a FAILING run opened with
//   "RE-DERIVED: engine-payload-exports still agrees with npm (latest ...)"
// and only said what was wrong further down. That line echoes the STORED value, so on a
// failing run the first thing the check said was that the thing agreed. A reader skimming
// for "agrees" got the opposite of the finding, from a check that was working correctly.
//
// An affirmative ahead of the verdict is the estate's dominant defect class wearing the
// output format, so the context is buffered and printed AFTER the verdict, under a heading
// that says what it is.
const notes = [];
const note = (...xs) => notes.push(xs.join(' '));
note(`${seen.size} distinct measured figure(s) across ${[...seen.values()].reduce((a, b) => a + b, 0)} marker(s) in ${htmlFiles.length} page(s).`);

// ─── signed-record-coverage: TWO VERDICTS, BECAUSE IT IS TWO FIGURES ─────────────────────────────
// This file used to carry one verdict, NOT RE-DERIVED, over a figure with two halves. That
// was honest about the whole and overbroad about the part that matters, because it declared
// unchecked something that costs one comparison to check.
//
//   THE CORPUS HALF   per-kind `signed` counts, and which rebuildRoute each kind needs.
//                     Measured over stores outside this repository. NOT re-derivable here,
//                     and that is a real limit rather than an omission: the stores are
//                     working artifacts and were never in the repo.
//
//   THE PREDICATE HALF  whether npm's `latest` exports that route. Public, and already
//                     fetched this run for engine-payload-exports. This is the half a tag
//                     move bites: move `latest` past rc.12 and `resolution` becomes
//                     rebuildable, which turns a kinds list, a count and a percentage false
//                     at once.
//
// THE STORED VALUES ARE NOT REWRITTEN HERE. The predicate recomputing to what is stored is
// the correct state today; this exists to notice when it stops being.
const coverage = results['signed-record-coverage'];
if (coverage) {
  note(
    `\nNOT RE-DERIVED — the corpus half of signed-record-coverage. Measured ${coverage.measuredOn} over ` +
    `${coverage.storeFileCount} file(s) under ${coverage.storesRoot},\n` +
    `which are not in this repository, so this run did NOT check that the per-kind counts still\n` +
    `describe the stores. A dated measurement. Re-derive with:\n` +
    `  node scripts/measure-signed-record-coverage.mjs`
  );

  // The predicate half, recomputed from a file this run already re-derived against npm.
  if (!engine) {
    failures.push(
      `signed-record-coverage carries claims about what npm's latest rebuilds, and\n` +
      `    results/engine-payload-exports.json is not loaded, so they could not be checked.\n` +
      `    Not a pass: the half of this figure that CAN be re-derived was not.`
    );
  } else if (!registryChecked) {
    // SKIP, NOT FAIL — same reconciliation as the derived-claim path above. Unreachable is not
    // a finding that the stored booleans are wrong; it is the absence of the comparison.
    claimsSkipped.push(
      `signed-record-coverage's rebuildableAtNpmLatest claims, which are about the version a\n` +
      `    reader receives TODAY (${registryErr ?? 'no network'})`
    );
  } else {
    const at = engine.versions?.find((v) => v.version === engine.npmLatest);
    if (!at) {
      failures.push(
        `signed-record-coverage's rebuildableAtNpmLatest claims are computed against npm latest\n` +
        `    ${engine.npmLatest}, for which results/engine-payload-exports.json carries no measurement.\n` +
        `    The claims cannot be evaluated, which is not the same as them being true.`
      );
    } else {
      const available = new Set([...(at.exports ?? []), ...(at.verifiers ?? [])]);
      const disagreed = [];
      for (const c of coverage.classes ?? []) {
        const derived = Boolean(c.rebuildRoute) && available.has(c.rebuildRoute);
        if (derived !== c.rebuildableAtNpmLatest) disagreed.push({ c, derived });
      }
      const notRebuildable = (coverage.classes ?? []).filter((c) => c.rebuildRoute && !available.has(c.rebuildRoute));
      const derivedKinds = notRebuildable.map((c) => c.kind);
      const derivedCount = notRebuildable.reduce((a, c) => a + (c.signed ?? 0), 0);
      const stored = coverage.headline?.notRebuildableAtNpmLatest ?? {};
      const storedKinds = stored.kinds ?? [];
      const sameKinds = derivedKinds.length === storedKinds.length &&
        derivedKinds.every((k) => storedKinds.includes(k));

      for (const { c, derived } of disagreed) {
        failures.push(
          `results/signed-record-coverage.json records ${c.kind}.rebuildableAtNpmLatest=${c.rebuildableAtNpmLatest},\n` +
          `    but npm's latest (${engine.npmLatest}) ${derived ? 'DOES' : 'does NOT'} export ${c.rebuildRoute}.\n` +
          `    Re-run: node scripts/measure-signed-record-coverage.mjs`
        );
      }
      if (!sameKinds || derivedCount !== stored.count) {
        failures.push(
          `results/signed-record-coverage.json's headline.notRebuildableAtNpmLatest records\n` +
          `    kinds ${JSON.stringify(storedKinds)} count ${stored.count}; recomputed against npm latest\n` +
          `    ${engine.npmLatest} it is kinds ${JSON.stringify(derivedKinds)} count ${derivedCount}.\n` +
          `    A count, a kinds list and a percentage are wrong together.\n` +
          `    Re-run: node scripts/measure-signed-record-coverage.mjs`
        );
      }
      if (!disagreed.length && sameKinds && derivedCount === stored.count) {
        note(
          `\nRE-DERIVED — the predicate half of signed-record-coverage. All ` +
          `${(coverage.classes ?? []).length} kind(s) still agree with what\n` +
          `npm's latest (${engine.npmLatest}) exports, and headline.notRebuildableAtNpmLatest ` +
          `recomputes to kinds\n${JSON.stringify(derivedKinds)} count ${derivedCount}, which is what is stored.`
        );
      }
    }
  }
}

if (schemaClaims) {
  note(`\nRE-DERIVED: ${schemasChecked} published schema(s) still digest-match the measurement.`);
}

if (hosted) {
  if (hostedChecked) {
    note(`RE-DERIVED: the hosted verifier still reports engine ${hosted.engineRunning} at commit ${hosted.commitShort}.`);
  } else {
    note(`NOT CHECKED: the hosted verifier at ${hosted.endpoint} (${hostedErr ?? 'no network'}).`);
    note('Section 04 describes a deployment this run could not reach, so nothing here');
    note('establishes that what it says about that service is still true.');
  }
}

if (engine) {
  if (registryChecked) {
    note(`\nRE-DERIVED: engine-payload-exports still agrees with npm (latest ${engine.npmLatest}, ${engine.versionCount} versions).`);
  } else {
    note(`\nNOT CHECKED: npm registry (${registryErr ?? 'no network'}). The comparison that establishes`);
    note('currency did not run, so this pass proves internal consistency ONLY.');
  }
}

// ─── COMPARISON 3: derived claims ────────────────────────────────────────────────────────────────
// A `data-measured` marker protects a VALUE. A sentence built on several values is not
// a value, so no `data-measured` marker can cover it — and the sentence is what a reader
// takes away. Section 02 of /verify carried eight value markers and two unprotected
// sentences, and the two sentences were the ones a tag move would falsify.
//
// A `data-derived-claim` marker names a PREDICATE instead. The predicate is written in
// the marker, and it is evaluated against FRESHLY MEASURED values rather than against the
// stored file, so a re-measurement that makes the sentence false turns this red instead of
// green. That is the whole point: re-measuring must not be able to launder a false claim.
//
//   <p data-derived-claim="engine-payload-exports:latest-does-not-export(resolutionPayload)">
//
// Syntax: <result-file>:<predicate>(<arg>). Predicates are registered below, and an
// unknown predicate FAILS. A marker naming a predicate nobody implemented is not a
// weaker claim, it is an unchecked one, and it must not read as covered.
// WHAT A PREDICATE ESTABLISHES, AND WHAT IT TRUSTS
// -----------------------------------------------------------------------------
// A predicate is evaluated against a MEASUREMENT, and some fields of that
// measurement are re-derived from the world on this run while others are not.
// `npmLatest` and `versionCount` are re-read from the registry above and a
// disagreement fails. The per-version `exports` lists are NOT re-read — that
// would mean fetching every published tarball on every CI run — so
// `latest-does-not-export` rests on a field this check takes on trust from
// results/engine-payload-exports.json.
//
// That is the boundary, and it is not a reason to drop the marker. It is the
// thing a reader of this file has to know: THE CLAIM IS CHECKED AGAINST A
// MEASUREMENT, AND THAT FIELD OF THE MEASUREMENT IS TRUSTED BECAUSE NOTHING
// HERE RE-DERIVES IT.
//
// THE GENERAL FORM, because it applies well beyond this file: a demonstration
// that a check can fail is worth what the failing condition costs to produce.
// A condition you can create by writing the value the check reads costs
// nothing, so it evidences that the code path runs and almost nothing about
// whether the check would catch the real thing. A condition you have to go and
// make true in the world costs something, and buys proportionally more.
//
// THE CONTRAST IN THIS ESTATE. scripts/postflight-publish.mjs in op-policy-engine
// fails on 1.0.0-rc.20, which is published to npm with no gitHead. Nobody wrote
// that condition for the test; it is in the registry, it got there by accident,
// and it cannot be edited away. That demonstration is worth more than this one,
// and the difference is not the quality of either check.
//
// The run-provenance labelling below exists because of this: an injected run and
// a live failure print the same findings, and the reader deserves to be told
// which one they are looking at.
const PREDICATES = {
  // True when the version npm's `latest` tag serves does NOT export the named symbol.
  // The affirmative of the same question. Both exist because BOTH SIDES OF A TAG MOVE NEED A
  // PREDICATE: the page says one thing before `latest` moves past a withdrawal band and the
  // opposite after, and a swap between two markers is mechanical where a hand edit on the day
  // is not. Adding this one is safe BEFORE the move — it is unused until a marker names it.
  //
  // NOT THE NEGATION OF THE OTHER, deliberately. `latest-does-not-export` returns false when
  // the version is unmeasured, and so does this: an unevaluable claim is not true, whichever
  // direction it points, and a predicate defined as `!other` would turn one of those refusals
  // into a pass.
  'latest-exports': (res, arg, fresh) => {
    const version = fresh ?? res.npmLatest;
    const entry = (res.versions ?? []).find((v) => v.version === version);
    if (!entry) {
      return {
        ok: false,
        why: `npm serves ${version} at latest, and results/ carries no measurement for it. ` +
             `The claim cannot be evaluated, which is not the same as it being true. ` +
             `Re-run: node scripts/measure-engine-payload-exports.mjs`,
      };
    }
    const exports_ = entry.exports ?? [];
    return exports_.includes(arg)
      ? { ok: true, why: `latest (${version}) exports \`${arg}\`.` }
      : { ok: false, why: `the version at latest (${version}) does NOT export \`${arg}\`, so this sentence is false.` };
  },

  'latest-does-not-export': (res, arg, fresh) => {
    const version = fresh ?? res.npmLatest;
    const entry = (res.versions ?? []).find((v) => v.version === version);
    if (!entry) {
      return {
        ok: false,
        why: `npm serves ${version} at latest, and results/ carries no measurement for it. ` +
             `The claim cannot be evaluated, which is not the same as it being true. ` +
             `Re-run: node scripts/measure-engine-payload-exports.mjs`,
      };
    }
    const exports_ = entry.exports ?? [];
    return exports_.includes(arg)
      ? { ok: false, why: `the version at latest (${version}) DOES export \`${arg}\`, so this sentence is false.` }
      : { ok: true, why: `latest (${version}) does not export \`${arg}\`.` };
  },
};

const CLAIM_RE = /data-derived-claim="([^"]+)"/g;
let claimsChecked = 0;
for (const file of htmlFiles) {
  const rel = file.slice(root.length + 1);
  const html = readFileSync(file, 'utf8');
  for (const m of html.matchAll(CLAIM_RE)) {
    const spec = m[1];
    const parsed = /^([a-z0-9-]+):([a-z0-9-]+)\(([^)]*)\)$/.exec(spec);
    if (!parsed) {
      failures.push(`${rel}: data-derived-claim="${spec}" is not <result>:<predicate>(<arg>).`);
      continue;
    }
    const [, resultName, predName, arg] = parsed;
    const res = results[resultName];
    if (!res) {
      failures.push(`${rel}: data-derived-claim names results/${resultName}.json, which is not loaded.`);
      continue;
    }
    const pred = PREDICATES[predName];
    if (!pred) {
      failures.push(
        `${rel}: data-derived-claim uses predicate "${predName}", which is not implemented.\n` +
        `    An unimplemented predicate is an UNCHECKED claim, not a weaker one.`
      );
      continue;
    }
    const fresh = resultName === 'engine-payload-exports' ? freshLatest : null;
    if (resultName === 'engine-payload-exports' && !registryChecked) {
      // SKIP, NOT FAIL. This pushed a failure while the block below classified the same
      // condition — registry unreachable — as a skip, so one script had two verdicts for one
      // state and which one you got depended on whether a page carried a claim marker.
      // Recorded rather than quietly reconciled: the failure text was written first and was
      // right that this is not a pass; exit 4 says that without saying the claim is false.
      claimsSkipped.push(
        `${rel}: data-derived-claim="${spec}" could not be evaluated against the registry\n` +
        `    (${registryErr ?? 'no network'}). This claim is about what a reader receives TODAY, so a\n` +
        `    run that could not ask the registry does not establish it. Not a pass.`
      );
      continue;
    }
    claimsChecked++;
    const verdict = pred(res, arg, fresh);
    if (!verdict.ok) {
      failures.push(
        `${rel}: a derived claim on the page is no longer true.\n` +
        `    marker: ${spec}\n` +
        `    ${verdict.why}\n` +
        `    Fix the SENTENCE. Re-measuring will not make it true again.`
      );
    }
  }
}

note(`\nDERIVED CLAIMS: ${claimsChecked} claim marker(s) evaluated against freshly measured values.`);

if (failures.length) {
  const figures = failures.filter((f) => !/derived claim/.test(f)).length;
  const claims = failures.length - figures;
  const parts = [];
  if (figures) parts.push(`${figures} measured figure(s) out of sync`);
  if (claims) parts.push(`${claims} derived claim(s) no longer true`);
  console.error(`\nFAILED — ${parts.join(', ')}.\n`);
  if (provenanceBanner) console.error(provenanceBanner);
  for (const f of failures) console.error(`  ${f}\n`);
  console.error('Context for the run above, which does NOT change the verdict:');
  console.error(notes.join('\n'));
  process.exit(1);
}

// ─── SKIP HAS ITS OWN CODE ──────────────────────────────────────────────────────────────────
// A gate reads the exit code. A run that could not perform one of its comparisons and exits 0
// keeps the build green forever with that comparison never made, and the sentence naming the
// skip is in output nobody's CI reads. 0 pass, 1 fail, 2 unreachable, 3 tool-absent are taken;
// skip is 4. CI TREATS SKIP AS FAILURE until a per-check ruling says otherwise. No such ruling
// is made here.
const EXIT_SKIPPED = 4;
const skipped = [];
for (const c of claimsSkipped) skipped.push(c);
if (hosted && !hostedChecked) skipped.push(`the hosted verifier at ${hosted.endpoint} (${hostedErr ?? 'no network'})`);
if (engine && !registryChecked) skipped.push(`npm's published latest (${registryErr ?? 'no network'})`);
if (skipped.length) {
  console.log(`SKIPPED — ${skipped.length} comparison(s) could not be made, so this run did not establish`);
  console.log('what it exists to establish. Not a pass:');
  for (const s of skipped) console.log(`  ${s}`);
  console.log(notes.join('\n'));
  process.exit(EXIT_SKIPPED);
}

console.log('PASSED — every marked figure matches results/, and every derived claim still holds.');
if (provenanceBanner) console.log('\n' + provenanceBanner);
console.log(notes.join('\n'));
