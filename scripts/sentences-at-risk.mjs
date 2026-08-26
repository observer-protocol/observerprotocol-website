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
 * REPOINTED 2026-08-24. ITS POPULATION WAS THE SIXTH SCOPING INSTANCE.
 *
 * It was built to derive the population a change plan under-drew, and it drew its own from
 * the vocabulary of the defect it was built for: sentences containing a `data-measured` span,
 * because the fifth instance was about `data-measured` spans. A pin bump then moved a pin and
 * eight version spans, touched no `results/` file, and this printed "0 measured value(s)
 * moved" while a sentence in verify-samples/README.md went false. GREP FOUND IT.
 *
 * The population is now EVERY VALUE ANY CHECK COMPARES AGAINST THE WORLD, read from the
 * checks' own DECLARES-COMPARES lines rather than from a file shape this file chose. When a
 * check is added, its declaration joins this population without anyone editing this file; a
 * check that declares nothing fails scripts/check-declarations.mjs rather than silently
 * shrinking what this enumerates.
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

// ─── what the checks say they hold against the world ────────────────────────────────────────
// Read, not guessed. Each entry names something this repository holds that a check compares
// outward, so a change to it is a change a sentence may rest on.
const declarations = [];
{
  const MARK = 'DECLARES-COMPARES:';
  const wfDir = join(root, '.github/workflows');
  const invoked = new Set();
  for (const f of existsSync(wfDir) ? readdirSync(wfDir).filter((n) => n.endsWith('.yml')) : []) {
    let name = null;
    for (const l of readFileSync(join(wfDir, f), 'utf8').split('\n')) {
      if (/^\s+-\s+name:\s*(.+)/.test(l)) { name = 1; continue; }
      const rn = /^\s+run:\s*(.+)/.exec(l);
      if (rn && name) {
        const t = /(?:node|python3|bash|\.\/)\s*\.?\/?((?:scripts|tools)\/[\w./-]+|[\w.-]+\.(?:mjs|py|sh))/.exec(rn[1]);
        if (t) { let p = t[1];
          for (const c of [p, `scripts/${p}`, `tools/${p}`]) if (existsSync(join(root, c))) { p = c; break; }
          invoked.add(p); }
        name = null;
      }
    }
  }
  for (const p of [...invoked].sort()) {
    const src = readFileSync(join(root, p), 'utf8');
    const i = src.indexOf(MARK);
    if (i === -1) continue;
    try {
      const d = JSON.parse(src.slice(i + MARK.length, src.indexOf('\n', i)).trim());
      if (d.worldSource !== null) declarations.push({ check: p, ...d });
    } catch { /* check-declarations.mjs is what refuses a malformed one */ }
  }
  console.log(`Declared outward comparisons: ${declarations.length} check(s) hold something against the world.`);
  for (const d of declarations) console.log(`  ${d.check}\n      ${(d.repositoryHolds||[]).join('; ').slice(0,110)}`);
  console.log('');
}

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
    if (e === '_site' || e === 'dist' || e === 'node_modules' || e.startsWith('.')) continue;
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

// ─── DECLARED HOLDINGS: values that moved in a file a check holds against the world ─────────
// This is the half the results/-only version could not see. Each declaration names files this
// repository holds outward; any SCALAR in them that changed between the refs is a value a
// served document may be quoting. Both .html and .md are scanned, because the sixth instance
// was a sentence in Markdown.
const DECLARED_FILES = [
  'scripts/package.json', 'scripts/package-lock.json', 'scripts/credential-expectations.json',
  'sitemap.xml', 'scripts/shared-copy.json',
];
const scalars = (txt, path) => {
  const out = new Map();
  try {
    const walk = (n, k) => {
      if (n === null || typeof n !== 'object') { if (typeof n === 'string' && n.length > 3 && n.length < 80) out.set(k, n); return; }
      for (const [kk, vv] of Object.entries(n)) walk(vv, k ? `${k}.${kk}` : kk);
    };
    walk(JSON.parse(txt), '');
  } catch { /* not JSON: fall through */ }
  return out;
};
const servedDocs = [];
(function walkDocs(d) {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    if (e.name === '_site' || e.name === 'dist' || e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p2 = join(d, e.name);
    if (e.isDirectory()) walkDocs(p2);
    else if (e.name.endsWith('.html') || e.name.endsWith('.md')) servedDocs.push(p2);
  }
})(root);

let declaredHits = 0;
for (const f of DECLARED_FILES) {
  const now = (() => { try { return readFileSync(join(root, f), 'utf8'); } catch { return null; } })();
  const was = at(baseRef, f);
  if (now === null || was === null || now === was) continue;
  const a = scalars(was, f), b = scalars(now, f);
  for (const [k, oldV] of a) {
    const newV = b.get(k);
    if (newV === undefined || newV === oldV) continue;
    for (const doc of servedDocs) {
      const txt = readFileSync(doc, 'utf8');
      if (!txt.includes(oldV)) continue;
      const idx = txt.indexOf(oldV);
      const st = Math.max(0, txt.lastIndexOf('. ', idx) + 2);
      const dot = txt.indexOf('. ', idx + oldV.length);
      const en = dot === -1 ? Math.min(txt.length, idx + 300) : dot + 1;
      declaredHits++;
      console.log(`  ${f} :: ${k}`);
      console.log(`      ${JSON.stringify(oldV)}  ->  ${JSON.stringify(newV)}`);
      console.log(`      [${doc.slice(root.length + 1)}]  ${prose(txt.slice(st, en)).trim().slice(0, 220)}`);
      console.log('');
    }
  }
}
if (declaredHits) console.log(`${declaredHits} served document(s) quote a value that moved in a declared holding.\n`);

// ─── what this still cannot reach, printed every run ────────────────────────────────────────
// A value can be declared and still be quoted somewhere this cannot see. Named rather than
// left for the next miss to find.
console.log(`
NOT REACHED BY THIS, and stated rather than left implicit:
  - values in a declared holding this file does not list. DECLARED_FILES is hand-listed
    from the declarations, because a declaration names what a check holds in prose and
    not as a path. That mapping is the remaining hand-maintained step.
  - values that are not scalars in a JSON file. A hash inside a shell script, a version
    inside a .py constant, and anything computed rather than stored are all invisible.
  - whether a sentence SURVIVES its value changing. This enumerates; it does not judge.
    Several hits below are dated statements that are correctly unchanged, and telling
    those from the false ones is the reader's job and nothing else's.`);

console.log(found
  ? `${found} sentence(s) contain a span whose value moved. EACH NEEDS A JUDGEMENT: is it still\ntrue with the new value? This does not decide that, and nothing else does either.`
  : 'No sentence on any page contains a span whose value moved.');
