#!/usr/bin/env node
/**
 * WHICH SENTENCES DOES A PENDING VALUE CHANGE PUT AT RISK?
 *
 * A `data-measured` span updates itself. The sentence around it does not. When a measured
 * value changes, every span holding it moves and every sentence built on it stays — and a
 * self-updating value inside a static sentence reads as FRESHLY CHECKED while being false.
 * That is worse than stale, which is visible, and worse than false, which the checks catch.
 *
 * Measured 2026-08-23: the section 02 swap was planned as six parts and named two dependents.
 * It missed two sentences. One of them — "We hold [122] signed resolution records that a
 * reader on [1.0.0-rc.21] has no route to" — was INSIDE the section being swapped, and both
 * of its spans updated correctly while the sentence inverted in meaning.
 *
 * THE POPULATION THAT WOULD HAVE CAUGHT THEM is not a list anyone maintains. It is derivable:
 * every sentence containing a span whose value the change moves. This derives it.
 *
 *   node scripts/sentences-at-risk.mjs <baseline-ref>
 *
 * BEFORE a change: stage or write the new results/, then run with HEAD as the baseline. The
 * new values are on disk, the old ones are in the ref, and every affected sentence prints
 * before anything is committed.
 *
 * AFTER a change: pass the ref from before it, to audit what was missed.
 *
 * IT DOES NOT DECIDE. Whether a sentence survives its span changing is a judgement about
 * meaning, and no check makes it. This prints the sentence and the old and new values beside
 * each other so the judgement is made deliberately rather than skipped. A sentence that is
 * invariant is common and fine; the point is that it was looked at.
 *
 * Exit 0 always when it runs: it is an enumerator, not a gate. A gate that guessed at meaning
 * would be the fourth way to be wrong about this.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const baseRef = process.argv[2];
if (!baseRef) {
  console.error('usage: node scripts/sentences-at-risk.mjs <baseline-ref>');
  console.error('  e.g. HEAD, or the commit before the change you are auditing.');
  process.exit(2);
}

const at = (ref, path) => {
  try { return execFileSync('git', ['show', `${ref}:${path}`], { cwd: root, encoding: 'utf8' }); }
  catch { return null; }
};
const dig = (obj, path) => path.split('.').reduce((o, k) => {
  if (o == null) return undefined;
  const m = /^(.*)\[(\d+)\]$/.exec(k);
  return m ? o[m[1]]?.[Number(m[2])] : o[k];
}, obj);

// ─── which measured values moved ────────────────────────────────────────────────────────────
const resultsDir = join(root, 'results');
const moved = new Map();               // "file:path" -> {before, after}
for (const f of readdirSync(resultsDir).filter((n) => n.endsWith('.json'))) {
  const name = f.replace(/\.json$/, '');
  const now = JSON.parse(readFileSync(join(resultsDir, f), 'utf8'));
  const oldRaw = at(baseRef, `results/${f}`);
  if (oldRaw === null) { console.log(`  results/${f} did not exist at ${baseRef}; every span on it is new.`); continue; }
  const old = JSON.parse(oldRaw);
  const walk = (a, b, path) => {
    const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
    for (const k of keys) {
      const pa = path ? `${path}.${k}` : k;
      const va = a?.[k], vb = b?.[k];
      if (va && typeof va === 'object' && !Array.isArray(va)) { walk(va, vb, pa); continue; }
      if (JSON.stringify(va) !== JSON.stringify(vb)) moved.set(`${name}:${pa}`, { before: va, after: vb });
    }
  };
  walk(old, now, '');
}

// ─── every span on every served page, and the sentence it sits in ───────────────────────────
const pages = [];
(function walkDir(d) {
  for (const e of readdirSync(d)) {
    if (e === 'dist' || e === 'node_modules' || e.startsWith('.')) continue;
    const p = join(d, e);
    try { if (readdirSync(p).length >= 0) { walkDir(p); continue; } } catch { /* a file */ }
    if (e.endsWith('.html')) pages.push(p);
  }
})(root);

const SPAN = /<span[^>]*data-measured="([^"]+)"[^>]*>([^<]*)<\/span>/g;
const prose = (h) => h.replace(/<[^>]+>/g, '').replace(/&[a-z]+;|&#\d+;/g, ' ').replace(/\s+/g, ' ');

let found = 0;
console.log(`\nBaseline ${baseRef}. ${moved.size} measured value(s) moved.\n`);
for (const [key, d] of moved) {
  const hits = [];
  for (const page of pages) {
    const html = readFileSync(page, 'utf8');
    SPAN.lastIndex = 0;
    let m;
    while ((m = SPAN.exec(html)) !== null) {
      if (m[1] !== key) continue;
      // the sentence: back to the previous ". " or block tag, forward to the next
      const a = Math.max(0, html.lastIndexOf('. ', m.index) + 2, html.lastIndexOf('>', html.lastIndexOf('<p', m.index)) + 1);
      const dot = html.indexOf('. ', m.index + m[0].length);
      const b = dot === -1 ? Math.min(html.length, m.index + 400) : dot + 1;
      hits.push({ rel: page.slice(root.length + 1), text: prose(html.slice(a, b)).trim() });
    }
  }
  if (!hits.length) continue;
  found += hits.length;
  console.log(`  ${key}`);
  console.log(`      ${JSON.stringify(d.before)}  ->  ${JSON.stringify(d.after)}`);
  for (const h of hits) console.log(`      [${h.rel}]  ${h.text.slice(0, 260)}`);
  console.log('');
}

console.log(found
  ? `${found} sentence(s) contain a span whose value moved. EACH NEEDS A JUDGEMENT: is it still\ntrue with the new value? This does not decide that, and nothing else does either.`
  : 'No sentence on any page contains a span whose value moved.');
