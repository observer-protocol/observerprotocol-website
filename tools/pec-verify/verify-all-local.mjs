// EVERY published PolicyEvaluationCredential, against the committed DID document,
// with the canonical W3C Data Integrity libraries and no OP endpoint.
//
// WHY THIS EXISTS RATHER THAN A SECOND HARDCODED SCRIPT. `verify:local` named ONE
// credential, and the repository published two. The second one verifies — measured
// 2026-08-10 with this same tool — and `credential-expectations.json` already asserts
// that it does, in a note. So the repository stated a provable claim, shipped the tool
// that proves it, and gated nothing.
//
// A list of two would have been the same defect with a longer list. THE SET IS DERIVED:
// every file under `credentials/` whose `type` includes PolicyEvaluationCredential is
// verified, so a third one is covered by existing, not by somebody remembering.
//
// AN EMPTY SET IS A FAILURE, NOT A PASS. If the directory moves or the type string
// changes, discovering nothing would otherwise report success — "no credentials" and
// "no check ran" produce the same green from anything that only counts errors.
//
// FAILURES ACCUMULATE. Each credential is verified and its result printed even after an
// earlier one fails, so one bad artifact cannot hide the rest. Same property as
// scripts/check-aip-sync.sh, which uses `set -uo pipefail` with `FAIL=1; continue`
// rather than `set -e` for exactly this reason.
//
//   npm run verify:local:all

import { readdirSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const CREDENTIALS = resolve(here, '../../credentials')
const DID = resolve(here, '../../.well-known/did.json')

const pecs = readdirSync(CREDENTIALS)
  .filter((f) => f.endsWith('.json'))
  .filter((f) => {
    try {
      const t = JSON.parse(readFileSync(join(CREDENTIALS, f), 'utf8')).type
      return Array.isArray(t) && t.includes('PolicyEvaluationCredential')
    } catch { return false }
  })
  .sort()

if (pecs.length === 0) {
  console.error('REFUSED: no PolicyEvaluationCredential found under credentials/.')
  console.error('         Discovering none is not a pass. Either the directory moved, or the')
  console.error('         type string changed, and this check would otherwise report success.')
  process.exit(2)
}

console.log(`${pecs.length} PolicyEvaluationCredential(s) discovered under credentials/\n`)

let failed = 0
for (const f of pecs) {
  const r = spawnSync(process.execPath, [join(here, 'verify.mjs')], {
    env: {
      ...process.env,
      PEC_URL: `file://${join(CREDENTIALS, f)}`,
      DID_URL: `file://${DID}`,
    },
    encoding: 'utf8',
  })
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`
  const ok = r.status === 0 && /verify -> true/.test(out)
  if (!ok) failed += 1
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${f}`)
  for (const line of out.trim().split('\n')) if (line.trim()) console.log(`        ${line}`)
  console.log('')
}

console.log(failed === 0
  ? `All ${pecs.length} verified with the canonical libraries, no endpoint involved.`
  : `${failed} of ${pecs.length} FAILED.`)
process.exit(failed === 0 ? 0 : 1)
