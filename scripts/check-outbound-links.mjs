#!/usr/bin/env node
// DECLARES-COMPARES: {"repositoryHolds":["every outbound href in tracked HTML"],"worldSource":"the sites those links point at","goesStaleWhen":"a third-party URL moves or goes down"}
// ^ Machine-readable. What this check holds against the world, and what makes it
//   stale. worldSource null is a DECLARATION, not an absence: it says both sides are
//   inside this repository. Read by scripts/check-declarations.mjs, which FAILS on any
//   CI-invoked check that carries no declaration.
/**
 * Every outbound link this site publishes, followed.
 *
 * Why this exists
 * ---------------
 * Measured 2026-08-16: /agentic-terminal's primary call to action, "Open Sovereign
 * Dashboard", pointed at https://agenticterminal.io/sovereign and returned 404. The
 * page had been advertising a product tier whose only entry point did not exist.
 * Nothing in this repository had ever followed an outbound link, so nothing could
 * have told anyone.
 *
 * That is the same shape as every other control here: a claim maintained in one
 * place and the thing it asserts maintained in another, with no comparison between
 * them. A published URL is a claim that an address names something.
 *
 * TWO HALVES
 * ----------
 *   DECLARED, in scripts/mustresolve.json. Must be PRESENT on the named page and
 *   must RESOLVE. Presence is checked because a CTA is broken by deletion as easily
 *   as by a 404, and deletion is the quieter of the two.
 *
 *   SWEPT, everything else. A 404 or 410 fails the build. A timeout, a refused
 *   connection or a 5xx is reported as NOT CHECKED and never as a pass, because a
 *   third party's outage is not a defect in this repository and silently passing it
 *   would be this file lying in the direction that is comfortable.
 *
 * HEAD then GET: some hosts refuse HEAD, so a 405 or 501 is retried as a GET rather
 * than recorded as a failure. A check that reports a defect because it asked the
 * wrong way is worse than no check.
 *
 *   node scripts/check-outbound-links.mjs
 * Exit: 0 all declared links present and resolving and nothing swept is gone, 1 otherwise.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(root, 'scripts/mustresolve.json'), 'utf8'));
const skipHosts = new Set(manifest.skipHosts ?? []);
const UA = 'Mozilla/5.0 (compatible; observerprotocol-link-check/1.0)';
const TIMEOUT_MS = 20000;

// ─── COLLECT ─────────────────────────────────────────────────────────────────────────────────────
const htmlFiles = [];
(function walk(dir) {
  for (const e of readdirSync(dir)) {
    if (e === '_site' || e === 'node_modules' || e === '.git' || e === 'results') continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (e.endsWith('.html')) htmlFiles.push(p);
  }
})(root);

/** url -> Set of pages carrying it */
const found = new Map();
for (const file of htmlFiles) {
  const rel = relative(root, file);
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(/href="(https?:\/\/[^"]+)"/g)) {
    const url = m[1].replace(/&amp;/g, '&');
    if (!found.has(url)) found.set(url, new Set());
    found.get(url).add(rel);
  }
}

const hostOf = (u) => { try { return new URL(u).host; } catch { return null; } };
const targets = [...found.keys()].filter((u) => {
  const h = hostOf(u);
  return h !== null && !skipHosts.has(h);
}).sort();

// ─── FOLLOW ──────────────────────────────────────────────────────────────────────────────────────
async function probe(url) {
  const attempt = async (method) => {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { method, redirect: 'follow', signal: ac.signal, headers: { 'user-agent': UA } });
      return { status: res.status, finalUrl: res.url };
    } finally { clearTimeout(t); }
  };
  try {
    let r = await attempt('HEAD');
    // Some hosts refuse HEAD outright. Ask again properly rather than calling it a defect.
    if (r.status === 405 || r.status === 501 || r.status === 403) r = await attempt('GET');
    return r;
  } catch (e) {
    return { status: null, error: e.name === 'AbortError' ? `timeout after ${TIMEOUT_MS}ms` : e.message.split('\n')[0] };
  }
}

const results = new Map();
const CONCURRENCY = 8;
for (let i = 0; i < targets.length; i += CONCURRENCY) {
  const batch = targets.slice(i, i + CONCURRENCY);
  const settled = await Promise.all(batch.map(probe));
  batch.forEach((u, n) => results.set(u, settled[n]));
}

// ─── JUDGE ───────────────────────────────────────────────────────────────────────────────────────
const failures = [];
const notChecked = [];
const declared = new Map((manifest.mustResolve ?? []).map((r) => [r.url, r]));

// Half one: declared links must be present, and must resolve.
for (const row of manifest.mustResolve ?? []) {
  const pages = found.get(row.url) ?? new Set();
  for (const page of row.mustAppearIn) {
    if (!pages.has(page)) {
      failures.push(
        `${page}: declared link ${row.url} is NOT on the page.\n` +
        `    Declared in scripts/mustresolve.json because: ${row.why}\n` +
        `    A call to action can be broken by deleting it as easily as by breaking it.`
      );
    }
  }
  const r = results.get(row.url);
  if (!r) continue;
  if (r.status === null) {
    notChecked.push(`${row.url} (DECLARED) could not be reached: ${r.error}`);
  } else if (r.status >= 400) {
    failures.push(
      `${row.url} -> HTTP ${r.status}\n` +
      `    Declared in scripts/mustresolve.json, carried on: ${[...(found.get(row.url) ?? [])].join(', ')}\n` +
      `    Because: ${row.why}`
    );
  }
}

// Half two: everything else. Gone is a failure; unreachable is not.
//
// KNOWN DEBT, held open rather than hidden. This check found 15 published 404s on the day it was
// written, none of them introduced by it. Deleting those links quietly, or running this check in
// report-only mode, would both have turned the build green while leaving a reader to discover the
// same thing. scripts/known-dead-links.json records them with the page that carries each.
//
// IT IS ENFORCED IN BOTH DIRECTIONS, which is what makes it debt and not an allowlist: an
// unlisted 404 fails, AND a listed URL that starts resolving fails, so the row must be deleted in
// the commit that fixes the link and the list can only shrink.
const debt = JSON.parse(readFileSync(join(root, 'scripts/known-dead-links.json'), 'utf8'));
const knownDead = new Map((debt.known ?? []).map((r) => [r.url, r]));
const stillDead = new Set();

for (const url of targets) {
  if (declared.has(url)) continue;
  const r = results.get(url);
  const pages = [...found.get(url)].join(', ');
  if (r.status === null) {
    notChecked.push(`${url} (${pages}): ${r.error}`);
  } else if (r.status === 404 || r.status === 410) {
    if (knownDead.has(url)) { stillDead.add(url); continue; }
    failures.push(
      `${url} -> HTTP ${r.status}\n` +
      `    Published on: ${pages}\n` +
      `    The address does not name anything. That is a fact about our page, not about their host.\n` +
      `    If this is a link we are choosing not to fix yet, record it in\n` +
      `    scripts/known-dead-links.json with the page and the reason. Do not delete the link\n` +
      `    quietly: that turns the build green and leaves the reader to find it.`
    );
  } else if (r.status >= 400) {
    notChecked.push(`${url} (${pages}): HTTP ${r.status}, not a 404, treated as their problem rather than ours`);
  }
}

// The other direction: a recorded dead link that came back to life.
for (const [url, row] of knownDead) {
  const r = results.get(url);
  if (r === undefined) {
    failures.push(
      `scripts/known-dead-links.json lists ${url}, which is no longer published on any page.\n` +
      `    Delete the row. A debt register that outlives its debt starts reading as a list of\n` +
      `    problems this site still has.`
    );
    continue;
  }
  if (r.status !== null && r.status < 400) {
    failures.push(
      `${url} -> HTTP ${r.status}, and it is recorded as known-dead.\n` +
      `    Recorded ${debt.recordedOn} because: ${row.note}\n` +
      `    It resolves now. Delete the row in the same commit as whatever fixed it, so the\n` +
      `    register only ever shrinks.`
    );
  }
}

// ─── REPORT ──────────────────────────────────────────────────────────────────────────────────────
const ok = targets.filter((u) => (results.get(u)?.status ?? 999) < 400).length;
console.log(`${targets.length} distinct outbound link(s) across ${htmlFiles.length} page(s). ${ok} resolved.`);
console.log(`${(manifest.mustResolve ?? []).length} declared as must-resolve. ${skipHosts.size} host(s) skipped: ${[...skipHosts].join(', ')}.`);

if (stillDead.size) {
  console.log(
    `\n${stillDead.size} known-dead link(s), recorded ${debt.recordedOn} and held open with the\n` +
    `failure stated rather than deleted. ${debt.recordedAtCount} on the day the check was written.\n` +
    `This list is debt and is meant to be emptied:`
  );
  for (const u of [...stillDead].sort()) {
    console.log(`  ${u}\n      on: ${knownDead.get(u).pages.join(', ')}`);
  }
}

if (notChecked.length) {
  console.log(`\nNOT CHECKED (${notChecked.length}). Reported rather than passed:`);
  for (const n of notChecked) console.log(`  ${n}`);
}

if (failures.length) {
  console.error(`\n${failures.length} outbound link failure(s):\n`);
  for (const f of failures) console.error(`  ${f}\n`);
  process.exit(1);
}

console.log('\nEvery declared link is present and resolving, and nothing published 404s.');
