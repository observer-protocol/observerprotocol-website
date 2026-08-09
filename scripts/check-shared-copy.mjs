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

// Void elements have no closing tag. The depth scanner below counts `</tag>` to find
// where a block ends, so on a <meta> it scans to EOF, never reaches depth 0, and
// silently contributes no range — the element reads as untagged however it is
// tagged. That made <meta name="description"> uncoverable by the enumeration, which
// is exactly where a claim gets restated for search engines and social cards and
// where nobody re-reads it. A void element IS its own block; its prose is the
// `content` (or `alt`) attribute.
const VOID = new Set(['meta', 'link', 'img', 'input', 'br', 'hr', 'source', 'area']);
const voidProse = (openTag) => {
  const m = openTag.match(/\s(?:content|alt)="([^"]*)"/i);
  return m ? asProse(m[1]) : '';
};

// Comments are not claims a reader meets. `<!-- THE OFFLINE PATH -->` is a section
// marker, and allowlisting it would put a non-claim in a list whose entire value is
// that every row is a real decision. Blanked rather than deleted so byte offsets —
// and therefore reported line numbers — stay true.
const stripComments = (src) => src.replace(/<!--[\s\S]*?-->/g, (m) => ' '.repeat(m.length));

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
    const openRe = new RegExp(`<([a-z][a-z0-9]*)[^>]*data-shared-copy="${key}"[^>]*>`, 'g');
    let om;
    while ((om = openRe.exec(src)) !== null) {
      const tag = om[1];
      if (VOID.has(tag)) { blocks.push(voidProse(om[0])); continue; }
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
    const src = stripComments(readFileSync(file, 'utf8'));
    const rel = file.slice(root.length + 1);
    const tagged = taggedRanges(src, key);

    // Patterns are case-insensitive REGEXES, not literal substrings. Both halves of
    // that sentence were bought with a miss. `indexOf` is case-sensitive, so the
    // heading "No call back to us" on index.html sat outside any tag and the check
    // stayed green because the pattern was written lower-case. And a literal cannot
    // spell one claim two ways: the site says "call back to us" in one place and
    // "callback to Observer" in another, so a literal list polices the phrasing it
    // was written from rather than the claim. Same lesson as the reputation stem.
    for (const pattern of patterns) {
      const re = new RegExp(pattern, 'gi');
      for (;;) {
        const m = re.exec(src);
        if (m === null) break;
        const at = m.index;
        if (re.lastIndex === at) re.lastIndex++; // zero-width guard
        if (tagged.some(([a, b]) => at >= a && at < b)) continue;
        const line = src.slice(0, at).split('\n').length;
        failures.push(
          `${rel}:${line}: "${m[0]}" (matched /${pattern}/i) appears outside any data-shared-copy="${key}" element.\n` +
          `      This is the claim that verification needs nothing from us. Every instance is\n` +
          `      enumerated so one edit can scope all of them. Tag it, or add the file to\n` +
          `      mustAppearIn in scripts/shared-copy.json if this is a new home for the claim.`
        );
      }
    }
  }
}

// REQUIRES DISCLOSURE. Not a forbidden stem: naming the package is allowed, naming it
// silently is not. A page may legitimately instruct a deprecated package when nothing
// replaces the flow — what it may not do is let a reader adopt it without knowing.
const requires = spec['$requiresDisclosure'] ?? {};
for (const [concept, rule] of Object.entries(requires)) {
  const stems = rule.stems ?? [];
  const musts = (rule.mustAlsoContain ?? []).map((x) => x.toLowerCase());
  if (stems.length === 0 || musts.length === 0) continue;

  for (const file of allHtml()) {
    const src = readFileSync(file, 'utf8');
    const rel = file.slice(root.length + 1);
    const low = src.toLowerCase();
    const hit = stems.find((stem) => low.includes(stem.toLowerCase()));
    if (!hit) continue;
    const missing = musts.filter((m) => !low.includes(m));
    if (missing.length === 0) continue;
    const line = src.slice(0, low.indexOf(hit.toLowerCase())).split('\n').length;
    failures.push(
      `${rel}:${line}: names "${hit}" but the page never says ${missing.map((m) => `"${m}"`).join(' or ')}.\n` +
      `      Concept: ${concept}. Instructing a deprecated package is allowed where nothing\n` +
      `      replaces the flow. Instructing it silently is not — a reader adopts it without\n` +
      `      knowing. Add the disclosure to this page, or stop naming the package.`
    );
  }
}

// FORBIDDEN STEMS. A concept ruled off the site cannot be policed by searching for
// the phrasing it had when it was ruled off — that is how reputation survived three
// clearances. Forbid the stem; allowlist each surviving occurrence with a reason.
const forbidden = spec['$forbidden'] ?? {};
for (const [concept, rule] of Object.entries(forbidden)) {
  const stems = (rule.stems ?? []).map((x) => x.toLowerCase());
  if (stems.length === 0) continue;
  const allow = rule.allow ?? [];

  for (const file of allHtml()) {
    const rel = file.slice(root.length + 1);
    const src = readFileSync(file, 'utf8');
    const lines = src.split('\n');

    // A whole file may be allowlisted with an empty `contains`.
    if (allow.some((a) => a.file === rel && !a.contains)) continue;

    lines.forEach((line, i) => {
      const low = line.toLowerCase();
      for (const stem of stems) {
        // Word-boundary anchored: "discord" contains "scor" and is not a reputation
        // claim. A stem is a word beginning, not a substring.
        if (!new RegExp(`\\b${stem}`, 'i').test(low)) continue;
        if (allow.some((a) => a.file === rel && a.contains && line.includes(a.contains))) return;
        const text = line.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        failures.push(
          `${rel}:${i + 1}: forbidden stem "${stem}" (${concept})\n` +
          `      ${text.slice(0, 120)}\n` +
          `      This concept was ruled off the site. Remove it, or add an allow entry in\n` +
          `      scripts/shared-copy.json naming the file, the text, and why it is an exception.`
        );
        return;
      }
    });
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
  const openRe = new RegExp(`<([a-z][a-z0-9]*)[^>]*data-shared-copy="${key}"[^>]*>`, 'g');
  let om;
  while ((om = openRe.exec(src)) !== null) {
    const tag = om[1];
    if (VOID.has(tag)) { out.push([om.index, om.index + om[0].length]); continue; }
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
