#!/usr/bin/env node
// DECLARES-COMPARES: {"repositoryHolds":["the schema index page","schemas/delegation/ directory listing"],"worldSource":null,"goesStaleWhen":"never from outside: both sides are in this repository"}
// ^ Machine-readable. What this check holds against the world, and what makes it
//   stale. worldSource null is a DECLARATION, not an absence: it says both sides are
//   inside this repository. Read by scripts/check-declarations.mjs, which FAILS on any
//   CI-invoked check that carries no declaration.
/**
 * The delegation schema directory has an index page. This fails the build when it
 * stops describing the directory, or when the path that points at it stops resolving.
 *
 * WHY IT EXISTS. `schemas/delegation/v2.2.json` carries, in its own `$comment`, the
 * sentence "See /schemas/delegation/ for published versions". That path returned 404 for
 * as long as the comment has existed, so the one pointer aimed at the reader most likely
 * to need it — someone who has landed on a reserved placeholder that imposes no
 * constraints and is trying to find out what to use instead — went nowhere.
 *
 * A CHECK, NOT A GENERATOR, for the same reason as check-shared-copy.mjs: there is no
 * build step here (`publish = "."`), so a generator would have to rewrite HTML at commit
 * time. The failure that matters is a version shipping without being listed, and a check
 * catches that without anyone having to trust a rewriter.
 *
 * THE PAGE IS NOT IN THE DIRECTORY IT DESCRIBES, and that is deliberate. netlify.toml
 * sets Content-Type application/json for everything matching /schemas/*, so an index.html
 * in that directory would be served to browsers as JSON under a site-wide nosniff header.
 * The page lives at the repo root and a 301 carries /schemas/delegation/ to it. That
 * redirect is the fix for the dead pointer, so it is asserted here too: without it the
 * page still exists, every other assertion below still passes, and the sentence inside
 * v2.2.json is broken again with nothing reporting it.
 *
 * Run: node scripts/check-schema-index.mjs
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'schemas/delegation');
const PAGE = 'delegation-schema-versions.html';
const pagePath = join(root, PAGE);

const failures = [];

if (!existsSync(pagePath)) {
  failures.push(`${PAGE} does not exist, so /schemas/delegation/ has nothing to point at`);
} else {
  const html = readFileSync(pagePath, 'utf8');
  const onDisk = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();

  // Hrefs pointing into the schema directory, however they are written.
  const linked = new Set(
    [...html.matchAll(/href="[^"]*schemas\/delegation\/([^"/]+\.json)"/g)].map((m) => m[1])
  );

  for (const f of onDisk) {
    if (!linked.has(f)) failures.push(`schemas/delegation/${f} is served but is not listed on ${PAGE}`);
  }
  for (const f of linked) {
    if (!existsSync(join(dir, f))) failures.push(`${PAGE} links schemas/delegation/${f}, which does not exist`);
  }

  // The reserved version must be labelled. Listing it indistinguishably from the others
  // is worse than not listing it: it reads as a version you could pin, and pinning it
  // establishes nothing about structure.
  if (linked.has('v2.2.json') && !/reserved/i.test(html)) {
    failures.push(`v2.2.json is listed on ${PAGE} but the page does not mark it reserved`);
  }

  // MATCHED AS ONE RULE, not as three loose substrings: /schemas/delegation/ appears all
  // over this repository, and a from/to/status that are merely all present somewhere in
  // netlify.toml is not a redirect.
  const toml = readFileSync(join(root, 'netlify.toml'), 'utf8');
  const RULE = new RegExp(
    '\\[\\[redirects\\]\\]\\s*\\n' +
    '\\s*from = "/schemas/delegation/"\\s*\\n' +
    '\\s*to = "/' + PAGE.replace(/[.]/g, '\\$&') + '"\\s*\\n' +
    '\\s*status = 301');
  if (!RULE.test(toml)) {
    failures.push(
      'netlify.toml has no intact 301 from /schemas/delegation/ to /' + PAGE +
      ' (from/to/status together). Without it the path v2.2.json names goes back to 404.');
  }
}

if (failures.length) {
  console.error(`\nSchema index does not describe the directory — ${failures.length} problem(s):\n`);
  for (const f of failures) console.error(`  ${f}`);
  console.error('');
  process.exit(1);
}
console.log(`Schema index lists all ${readdirSync(dir).filter((f) => f.endsWith('.json')).length} published delegation schema(s), and /schemas/delegation/ redirects to it.`);
