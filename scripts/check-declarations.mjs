#!/usr/bin/env node
// DECLARES-COMPARES: {"repositoryHolds":["every CI-invoked check's DECLARES-COMPARES line"],"worldSource":null,"goesStaleWhen":"never from outside: it compares the workflow's invocation list to the scripts in this repository"}
// ^ Machine-readable. What this check holds against the world, and what makes it
//   stale. worldSource null is a DECLARATION, not an absence: it says both sides are
//   inside this repository. Read by scripts/check-declarations.mjs, which FAILS on any
//   CI-invoked check that carries no declaration.
/**
 * DOES EVERY CHECK THE BUILD DEPENDS ON SAY WHAT IT COMPARES AGAINST THE WORLD?
 *
 * THE POPULATION IS DERIVED FROM THE WORKFLOW, NOT FROM A FILENAME PATTERN. Every script a
 * `run:` step invokes is a check the build depends on. Globbing `scripts/check-*` would draw
 * the population from the predicate's own vocabulary — the defect this file exists to fix —
 * and would miss `ci-served-page-audit.sh`, `sync-engine-version.mjs`,
 * `verify-published-credentials.mjs` and `tools/check-sitemap.py`, none of which match it.
 *
 * WHY DECLARATIONS AT ALL. Six times a sweep drew a population that shared its vocabulary
 * with its predicate and missed what fell outside. The fix is not a seventh sweep: it is
 * making the population derivable from the checks themselves. A check declares what it holds
 * against the world; anything wanting that population reads the declarations instead of
 * guessing at a file shape.
 *
 * THE PROPERTY THAT MUST HOLD BY CONSTRUCTION: a check that declares nothing is VISIBLY
 * outside the population, not silently outside it. That is why a missing declaration is an
 * ERROR and not a recorded absence. A recorded absence is what this estate already has —
 * entries in a corrections file that nothing reads at the moment anything is decided — and a
 * new check added without a declaration would join the undeclared set in silence, which is
 * the exact failure being treated.
 *
 * `worldSource: null` IS A DECLARATION. It says both sides are inside this repository. It is
 * not the same as no declaration, and this check accepts it and rejects the other.
 *
 * Exit 0 all declared, 1 something is not.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MARK = 'DECLARES-COMPARES:';

// ─── population: what does CI actually invoke ──────────────────────────────────────────────
const invoked = new Map();
const wfDir = join(root, '.github/workflows');
for (const f of existsSync(wfDir) ? readdirSync(wfDir).filter((n) => n.endsWith('.yml')) : []) {
  const lines = readFileSync(join(wfDir, f), 'utf8').split('\n');
  let name = null;
  for (const l of lines) {
    const nm = /^\s+-\s+name:\s*(.+)/.exec(l);
    if (nm) { name = nm.group ?? nm[1].trim(); continue; }
    const rn = /^\s+run:\s*(.+)/.exec(l);
    if (rn && name) {
      const t = /(?:node|python3|bash|\.\/)\s*\.?\/?((?:scripts|tools)\/[\w./-]+|[\w.-]+\.(?:mjs|py|sh))/.exec(rn[1]);
      if (t) {
        let p = t[1];
        for (const c of [p, `scripts/${p}`, `tools/${p}`]) if (existsSync(join(root, c))) { p = c; break; }
        if (!invoked.has(p)) invoked.set(p, { file: f, step: name });
      }
      name = null;
    }
  }
}

console.log(`Population: ${invoked.size} check(s), derived from ${readdirSync(wfDir).filter((n)=>n.endsWith('.yml')).length} workflow file(s).\n`);

const declared = [], undeclared = [], malformed = [];
for (const [p, use] of [...invoked].sort()) {
  const src = readFileSync(join(root, p), 'utf8');
  const i = src.indexOf(MARK);
  if (i === -1) { undeclared.push({ p, use }); continue; }
  const line = src.slice(i + MARK.length, src.indexOf('\n', i)).trim();
  try {
    const d = JSON.parse(line);
    if (!('repositoryHolds' in d) || !('worldSource' in d) || !('goesStaleWhen' in d)) throw new Error('missing a required key');
    declared.push({ p, d });
  } catch (e) { malformed.push({ p, why: e.message }); }
}

for (const { p, d } of declared) {
  const w = d.worldSource === null ? 'repository-only' : d.worldSource;
  console.log(`  ok    ${p}`);
  console.log(`          holds  ${(d.repositoryHolds || []).join('; ').slice(0, 96)}`);
  console.log(`          vs     ${String(w).slice(0, 96)}`);
}

if (malformed.length) {
  console.error(`\nMALFORMED — ${malformed.length} declaration(s) could not be read:\n`);
  for (const m of malformed) console.error(`  ${m.p}\n      ${m.why}\n`);
}
if (undeclared.length) {
  console.error(`\nUNDECLARED — ${undeclared.length} check(s) the build depends on declare nothing:\n`);
  for (const u of undeclared) {
    console.error(`  ${u.p}`);
    console.error(`      invoked by ${u.use.file} as "${u.use.step}"`);
  }
  console.error(`
  A check that declares nothing is INVISIBLY outside every population derived from
  these declarations. That is the defect this file exists to make impossible, so it
  is an error and not a recorded absence: a recorded absence is what this estate
  already has, and a new check would join the undeclared set in silence.

  Add a line to the script:

    DECLARES-COMPARES: {"repositoryHolds":["..."],"worldSource":"...","goesStaleWhen":"..."}

  worldSource null IS a declaration. It says both sides are inside this repository,
  and it is accepted.`);
}
if (malformed.length || undeclared.length) process.exit(1);
console.log(`\nAll ${declared.length} CI-invoked check(s) declare what they compare. ${declared.filter((x)=>x.d.worldSource===null).length} declare repository-only.`);
