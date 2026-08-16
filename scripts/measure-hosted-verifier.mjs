#!/usr/bin/env node
/**
 * What the hosted verifier actually is, read from the service. Writes
 * results/hosted-verifier.json.
 *
 * Why this exists
 * ---------------
 * Section 04 of /verify described a hosted service running engine 0.3.3 and argued
 * that agreement with the published package was "observed on samples, not a shared
 * code path". Measured 2026-08-16, that argument is false: the service reports
 * `engine.running` and `engine.builtAgainst` both at 1.0.0-rc.10, `agree: true`.
 * It IS the published package, two releases behind what npm serves. Convergence
 * landed 2026-08-09 and nothing on the site recorded it, so the page went on making
 * an argument its own subject had stopped supporting.
 *
 * THE SENTENCE WAS NOT WRONG WHEN IT WAS WRITTEN. That is the point of measuring it
 * on a schedule rather than checking it once: a claim about somebody else's
 * deployment goes stale without anything in this repository changing.
 *
 *   node scripts/measure-hosted-verifier.mjs
 *
 * Read-only. One GET. It does not submit any artifact.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const VERSION_URL = 'https://verify.observerprotocol.org/version';

export async function readHostedVersion(url = VERSION_URL, timeoutMs = 20000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ac.signal, headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const v = await readHostedVersion();
  const engine = v.engine ?? {};
  const out = {
    $comment: [
      'MEASURED OUTPUT. Regenerate with: node scripts/measure-hosted-verifier.mjs',
      'One GET against the service. Nothing was submitted to it and nothing here is a',
      'claim about whether it VERIFIES correctly, only about what it says it is.',
    ],
    measuredOn: new Date().toISOString().slice(0, 10),
    endpoint: VERSION_URL,
    service: v.service ?? null,
    commit: v.build?.commit ?? null,
    commitShort: (v.build?.commit ?? '').slice(0, 12) || null,
    branch: v.build?.branch ?? null,
    dirty: v.build?.dirty ?? null,
    builtAt: v.build?.builtAt ?? null,
    builtAtDate: (v.build?.builtAt ?? '').slice(0, 10) || null,
    engineRunning: engine.running ?? null,
    engineBuiltAgainst: engine.builtAgainst ?? null,
    // The service's OWN self-report. Recorded rather than recomputed, and named `reported`
    // so nobody reads it as something this script established.
    engineAgreeReported: engine.agree ?? null,
    // What we can say independently: the two strings it printed are equal. That is a weaker
    // statement than "the builds agree" and it is the only one available from here.
    runningEqualsBuiltAgainst: engine.running != null && engine.running === engine.builtAgainst,
    allowlists: {
      issuers: v.accepts?.issuers ?? [],
      schemas: v.accepts?.schemas ?? [],
      inRepo: v.accepts?.source?.inRepo ?? null,
      sourceNote: v.accepts?.source?.note ?? null,
    },
    raw: v,
  };
  mkdirSync(join(root, 'results'), { recursive: true });
  writeFileSync(join(root, 'results/hosted-verifier.json'), JSON.stringify(out, null, 2) + '\n');

  console.log(`service           ${out.service}`);
  console.log(`commit            ${out.commit}  (${out.branch}, ${out.dirty})`);
  console.log(`built             ${out.builtAt}`);
  console.log(`engine running    ${out.engineRunning}`);
  console.log(`engine built-against ${out.engineBuiltAgainst}   agree(reported)=${out.engineAgreeReported}`);
  console.log(`issuer allowlist  ${out.allowlists.issuers.join(', ')}`);
  console.log(`allowlists inRepo ${out.allowlists.inRepo}`);
  console.log('\nWritten to results/hosted-verifier.json');
}
