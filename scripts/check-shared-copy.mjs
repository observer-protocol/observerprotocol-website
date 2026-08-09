#!/usr/bin/env node
/**
 * Some sentences must read identically wherever they appear. This fails the build when
 * they stop doing so.
 *
 * A CHECK, NOT A GENERATOR, and that is the design decision. There is no build step here
 * (`publish = "."`), so a generator would have to rewrite prose inside HTML files at
 * commit time — a mechanism you have to trust, editing the thing it is supposed to
 * protect. A check is a mechanism you can verify, and divergence is the failure that
 * matters: nobody edits one of two paragraphs on purpose, they edit the one in front of
 * them.
 *
 * Contract, from scripts/shared-copy.json:
 *   - every file in `mustAppearIn` must carry an element with data-shared-copy="<key>"
 *   - that element must contain every phrase listed
 *   - a file carrying the attribute but missing a phrase fails
 *   - a key no page claims at all fails, so deleting one side is not a silent pass
 *
 * Run: node scripts/check-shared-copy.mjs
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const spec = JSON.parse(readFileSync(join(root, 'scripts/shared-copy.json'), 'utf8'));

// Collapse markup and whitespace so a phrase is compared as prose, not as HTML.
const asProse = (html) =>
  html.replace(/<[^>]+>/g, '').replace(/&mdash;/g, '—').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

const failures = [];
let checked = 0;

for (const [key, entry] of Object.entries(spec)) {
  if (key.startsWith('$')) continue;
  const { mustAppearIn = [], phrases = [] } = entry;

  for (const file of mustAppearIn) {
    const path = join(root, file);
    if (!existsSync(path)) {
      failures.push(`${file}: listed for "${key}" but the file does not exist`);
      continue;
    }
    const src = readFileSync(path, 'utf8');

    // Grab every element carrying the attribute, however it is tagged.
    // Depth-aware: a naive lazy regex stops at the first nested </strong> and silently
    // truncates the block, which makes the check fail on correct input. That happened
    // on the first run of this file.
    const blocks = [];
    const openRe = new RegExp(`<([a-z]+)[^>]*data-shared-copy="${key}"[^>]*>`, 'g');
    let om;
    while ((om = openRe.exec(src)) !== null) {
      const tag = om[1];
      let i = om.index + om[0].length;
      let depth = 1;
      const scan = new RegExp(`</?${tag}\\b[^>]*>`, 'g');
      scan.lastIndex = i;
      let sm;
      while (depth > 0 && (sm = scan.exec(src)) !== null) {
        depth += sm[0].startsWith('</') ? -1 : 1;
        if (depth === 0) blocks.push(asProse(src.slice(i, sm.index)));
      }
    }

    if (blocks.length === 0) {
      failures.push(
        `${file}: no element carries data-shared-copy="${key}".\n` +
        `      The shared wording is supposed to live here. If it was moved, update\n` +
        `      scripts/shared-copy.json in the same commit; if it was deleted, say why.`
      );
      continue;
    }

    checked++;
    for (const phrase of phrases) {
      const wanted = asProse(phrase);
      if (!blocks.some((b) => b.includes(wanted))) {
        failures.push(
          `${file}: the "${key}" block no longer contains a shared phrase.\n` +
          `      missing: "${wanted.slice(0, 90)}${wanted.length > 90 ? '…' : ''}"\n` +
          `      These sentences are read by the same person in one sitting. Two phrasings\n` +
          `      of one unsolved problem reads as two different problems.`
        );
      }
    }
  }
}

// A tagged instance is enumeration. Catching an UNTAGGED one is what makes the
// enumeration hold: the claim can be repeated on a new page by someone who has
// never read this file, and nothing else would notice.
for (const [key, entry] of Object.entries(spec)) {
  if (key.startsWith('$')) continue;
  const patterns = entry.claimPatterns ?? [];
  if (patterns.length === 0) continue;

  for (const file of allHtml()) {
    const src = readFileSync(file, 'utf8');
    const rel = file.slice(root.length + 1);
    const tagged = taggedRanges(src, key);

    for (const pattern of patterns) {
      let from = 0;
      for (;;) {
        const at = src.indexOf(pattern, from);
        if (at === -1) break;
        from = at + pattern.length;
        if (tagged.some(([a, b]) => at >= a && at < b)) continue;
        const line = src.slice(0, at).split('\n').length;
        failures.push(
          `${rel}:${line}: "${pattern}" appears outside any data-shared-copy="${key}" element.\n` +
          `      This is the claim that verification needs nothing from us. Every instance is\n` +
          `      enumerated so one edit can scope all of them. Tag it, or add the file to\n` +
          `      mustAppearIn in scripts/shared-copy.json if this is a new home for the claim.`
        );
      }
    }
  }
}

if (failures.length) {
  console.error(`Shared copy has diverged — ${failures.length} problem(s):\n`);
  for (const f of failures) console.error(`  ${f}\n`);
  process.exit(1);
}

console.log(`Shared copy is consistent across ${checked} block(s).`);

// Every HTML file in the repo, so a new page cannot carry the claim unnoticed.
function allHtml(dir = root, acc = []) {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === '.git') continue;
    const full = join(dir, e);
    if (statSync(full).isDirectory()) allHtml(full, acc);
    else if (e.endsWith('.html')) acc.push(full);
  }
  return acc;
}

// Byte ranges covered by elements carrying the tag, depth-aware for the same
// reason the extractor above is.
function taggedRanges(src, key) {
  const out = [];
  const openRe = new RegExp(`<([a-z]+)[^>]*data-shared-copy="${key}"[^>]*>`, 'g');
  let om;
  while ((om = openRe.exec(src)) !== null) {
    const tag = om[1];
    let depth = 1;
    const scan = new RegExp(`</?${tag}\\b[^>]*>`, 'g');
    scan.lastIndex = om.index + om[0].length;
    let sm;
    while (depth > 0 && (sm = scan.exec(src)) !== null) {
      depth += sm[0].startsWith('</') ? -1 : 1;
      if (depth === 0) out.push([om.index, sm.index + sm[0].length]);
    }
  }
  return out;
}
