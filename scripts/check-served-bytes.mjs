#!/usr/bin/env node
// DECLARES-COMPARES: {"repositoryHolds":["schemas/delegation/*.json"],"worldSource":"https://observerprotocol.org/schemas/delegation/*.json as served","goesStaleWhen":"a deploy serves different bytes than the repository holds"}
// ^ Machine-readable. What this check holds against the world, and what makes it
//   stale. worldSource null is a DECLARATION, not an absence: it says both sides are
//   inside this repository. Read by scripts/check-declarations.mjs, which FAILS on any
//   CI-invoked check that carries no declaration.
/**
 * DOES THE URL SERVE THE BYTES THIS REPOSITORY HOLDS?
 *
 * Nothing established this. check-measured-figures digests schemas/delegation/<v>.json FROM
 * THE REPOSITORY and compares it to results/schema-claims.json, which proves the repository
 * has not changed since the measurement. It says nothing about what the site returns. A
 * deploy that served different bytes — a stale CDN copy, a rewrite rule, a partial publish —
 * would pass every existing check.
 *
 * The distinction was invisible until a provenance block was written claiming the fetch, and
 * the claim was wrong. Correcting the sentence left the property still unestablished, which
 * is why this exists rather than a note saying nobody checks.
 *
 * WHAT IT COMPARES. For every published schema this repository holds, the sha256 of the local
 * file against the sha256 of what the URL returns. Byte equality, not JSON equivalence: a
 * reader verifying a credential hashes bytes, so a semantically-identical reserialisation is
 * still a different artifact to them.
 *
 * EXIT CODES. 0 every fetched artifact matches. 1 at least one differs. 4 SKIPPED, nothing
 * could be fetched, so the comparison did not happen — a run that cannot ask is not a pass.
 * 3 is tool-absent and is not reachable here; this uses no external tool.
 *
 * WHAT IT CANNOT REACH. Only what is BOTH in the repository and published. An artifact served
 * from a path this repository does not hold is invisible to it, which is a different question
 * and needs a different instrument.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://observerprotocol.org';
const DIR = 'schemas/delegation';

const sha = (b) => createHash('sha256').update(b).digest('hex');
const local = existsSync(join(root, DIR))
  ? readdirSync(join(root, DIR)).filter((f) => f.endsWith('.json')).sort()
  : [];

if (!local.length) {
  console.error(`REFUSING: no schemas found under ${DIR}. There is nothing to compare, which is`);
  console.error('not the same as everything matching.');
  process.exit(1);
}

let matched = 0, unreachable = 0;
const differs = [];
for (const f of local) {
  const url = `${ORIGIN}/${DIR}/${f}`;
  const want = sha(readFileSync(join(root, DIR, f)));
  let got;
  try {
    const res = await fetch(url, { headers: { 'Cache-Control': 'no-cache' } });
    if (!res.ok) { differs.push(`${url}\n      repository holds it; the URL returns HTTP ${res.status}`); continue; }
    got = sha(Buffer.from(await res.arrayBuffer()));
  } catch (e) {
    unreachable++;
    console.log(`  UNREACHABLE  ${url}  (${e.message.split('\n')[0]})`);
    continue;
  }
  if (got === want) { matched++; console.log(`  ok    ${f}  ${want.slice(0, 16)}`); }
  else differs.push(`${url}\n      repository: ${want}\n      served:     ${got}`);
}

console.log('');
if (differs.length) {
  console.error(`FAILED — ${differs.length} artifact(s) served differently from what this repository holds.\n`);
  for (const d of differs) console.error(`  ${d}\n`);
  console.error('Every check that digests the local copy passes in this state. This is the one');
  console.error('that does not.');
  process.exit(1);
}
if (matched === 0) {
  console.log(`SKIPPED — ${unreachable} artifact(s) could not be fetched and none was compared.`);
  console.log('The property this checks is not established by a run that could not ask. Exit 4 is');
  console.log('skip, not pass.');
  process.exit(4);
}
if (unreachable) {
  console.log(`SKIPPED — ${matched} matched, ${unreachable} could not be fetched.`);
  console.log('A partial comparison does not establish the whole. Exit 4 is skip, not pass.');
  process.exit(4);
}
console.log(`${matched}/${local.length} published schema(s): the URL serves exactly the bytes this`);
console.log('repository holds, compared by sha256 just now.');
