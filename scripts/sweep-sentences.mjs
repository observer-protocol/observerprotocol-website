#!/usr/bin/env node
// DECLARES-COMPARES: {"repositoryHolds":["this instrument's own line-number arithmetic, exercised by --self-test on a fixture with a multi-line comment and a known hit"],"worldSource":null,"goesStaleWhen":"never from outside: the self-test compares the instrument to a fixture it writes itself"}
/**
 * SWEEP EVERY HTML FILE FOR SENTENCES MATCHING A SUBJECT AND A VERB, AND REPORT WHERE.
 *
 *   node scripts/sweep-sentences.mjs --subject 'refus' --verbs 'sign|record|export|emit|verif'
 *   node scripts/sweep-sentences.mjs --self-test
 *
 * WHY THE SELF-TEST EXISTS. The first version of this sweep (2026-08-24) replaced every
 * comment, <script> and <style> block with a single space before splitting into lines. Every
 * sentence it reported was real and every line number after the first stripped block was
 * wrong, because stripping the newlines inside a block shifted everything below it. A list
 * that is right about matches and wrong about locations reads as right. So the self-test is
 * about LOCATIONS: a fixture with a multi-line comment and a multi-line style block above a
 * known hit, asserting the reported line equals the true line. It also runs the old collapsing
 * stripper on the same fixture and asserts THAT reports a different line, so the test is shown
 * to discriminate rather than to pass by construction.
 *
 * Comments, scripts and styles are excluded because they are not sentences a reader meets;
 * <meta content> and <title> are included because they are.
 */
import { readFileSync, readdirSync, statSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const keepNewlines = (m) => '\n'.repeat((m.match(/\n/g) ?? []).length);
const collapseToSpace = () => ' ';

const BLOCKS = [/<!--[\s\S]*?-->/g, /<script\b[^>]*>[\s\S]*?<\/script>/gi, /<style\b[^>]*>[\s\S]*?<\/style>/gi];
const decode = (t) => t.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&mdash;/g, '—').replace(/&nbsp;/g, ' ');

/** Returns [{line, sentence}] for one file's source. `strip` decides what a removed block leaves behind. */
export function sweepSource(src, subject, verbs, strip = keepNewlines) {
  let body = src;
  for (const re of BLOCKS) body = body.replace(re, strip);
  const hits = [];
  body.split('\n').forEach((raw, i) => {
    // meta content and title are prose a reader (or a crawler) meets; keep them
    const metas = [...raw.matchAll(/<meta\b[^>]*\scontent="([^"]*)"/gi)].map((m) => m[1]);
    const text = decode(raw.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    for (const t of [text, ...metas]) {
      if (!t) continue;
      for (const sent of t.split(/(?<=[.!?])\s+(?=[A-Z"(])/)) {
        if (subject.test(sent) && verbs.test(sent)) hits.push({ line: i + 1, sentence: sent.trim() });
      }
    }
  });
  return hits;
}

function htmlFiles(dir, out = []) {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === '.git') continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) htmlFiles(p, out);
    else if (e.endsWith('.html')) out.push(p);
  }
  return out.sort();
}

// ─── self-test: locations, not matches ────────────────────────────────────────────────────
function selfTest() {
  const fixture = [
    '<!doctype html>',            // 1
    '<!--',                        // 2
    '  a multi-line comment',      // 3
    '  that spans three lines',    // 4
    '-->',                         // 5
    '<style>',                     // 6
    '  p { color: red; }',         // 7
    '</style>',                    // 8
    '<p>Filler that matches nothing.</p>',                    // 9
    '<p>The refusal is itself a signed record.</p>',         // 10  <- the known hit
    '<script>',                    // 11
    '  const refusal = "signed inside a script, not a sentence";', // 12
    '</script>',                   // 13
  ].join('\n');
  const TRUE_LINE = 10;
  const subject = /\brefus/i, verbs = /\b(sign\w*|record\w*)\b/i;
  const dir = mkdtempSync(join(tmpdir(), 'sweep-selftest-'));
  try {
    const f = join(dir, 'fixture.html');
    writeFileSync(f, fixture);
    const good = sweepSource(readFileSync(f, 'utf8'), subject, verbs);
    const naive = sweepSource(readFileSync(f, 'utf8'), subject, verbs, collapseToSpace);
    const problems = [];
    if (good.length !== 1) problems.push(`expected exactly 1 hit, got ${good.length} (${JSON.stringify(good)})`);
    else if (good[0].line !== TRUE_LINE) problems.push(`reported line ${good[0].line}, true line is ${TRUE_LINE}`);
    if (naive.length !== 1 || naive[0].line === TRUE_LINE) problems.push(`the collapsing stripper should report a WRONG line on this fixture and did not (got ${JSON.stringify(naive)}); the test cannot discriminate`);
    if (problems.length) { console.error('SELF-TEST FAILED:\n  ' + problems.join('\n  ')); return 1; }
    console.log(`SELF-TEST PASSED — hit reported at line ${good[0].line} (true ${TRUE_LINE}); the collapsing stripper reports line ${naive[0].line}, which is the defect this test exists to catch.`);
    return 0;
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

const args = process.argv.slice(2);
if (args.includes('--self-test')) process.exit(selfTest());
const arg = (k) => { const i = args.indexOf(k); return i === -1 ? null : args[i + 1]; };
const subjectSrc = arg('--subject'), verbsSrc = arg('--verbs');
if (!subjectSrc) { console.error('usage: --subject <regex> [--verbs <regex>] | --self-test'); process.exit(2); }
const subject = new RegExp(`\\b${subjectSrc}`, 'i');
const verbs = verbsSrc ? new RegExp(`\\b(${verbsSrc})\\w*\\b`, 'i') : /./;
let n = 0;
for (const f of htmlFiles(root)) {
  for (const h of sweepSource(readFileSync(f, 'utf8'), subject, verbs)) { n++; console.log(`${relative(root, f)}:${h.line}: ${h.sentence}`); }
}
console.log(`${n} hit(s) across ${htmlFiles(root).length} HTML file(s). Locations are line numbers in the source file; see --self-test.`);
