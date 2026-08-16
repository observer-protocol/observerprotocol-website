#!/usr/bin/env node
/**
 * Verify every signed artifact this repository publishes, against the
 * expectations recorded in scripts/credential-expectations.json.
 *
 * Why this exists
 * ---------------
 * observerprotocol.org tells a reader to install @observer-protocol/policy-engine
 * and check our records. Nothing tested that our own published records pass that
 * check, and two of them did not. The claim and the check were maintained in
 * separate places, which is the defect class this file closes.
 *
 * The check is symmetric on purpose. It fails when a passing artifact starts
 * failing (a regression) AND when a failing artifact starts passing (a stale
 * expectation). It also fails when an artifact is published with no expectation
 * recorded at all, so a new artifact cannot appear on the site unmeasured.
 *
 * FIVE CONSTRUCTIONS, AND THE ARTIFACT SAYS WHICH
 * -----------------------------------------------
 * This started as one verifier over one construction, because everything published
 * here was a delegation credential. The PPP corpus artifacts are decision
 * attestations, evaluation verdicts, enforcement refusals and a payment
 * instruction, and each is signed differently. The construction is READ OFF THE
 * RECORD and the manifest's stated construction is compared against it, so the
 * manifest can never select the verifier that makes an artifact pass.
 *
 * `allow` therefore takes more than two values. `true` and `false` are a check
 * that ran; `no-verifier-path` is a check that COULD NOT RUN because the package
 * rebuilds no payload for that record kind; `threw` is a handler that broke.
 * Those are four different facts and none of them is a blank.
 *
 * Run:  node scripts/verify-published-credentials.mjs
 * Exit: 0 all expectations held, 1 otherwise.
 */

import { readFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const WATCHED_DIRS = ['credentials', 'verify-samples'];

let engine;
try {
  engine = await import('@observer-protocol/policy-engine');
} catch {
  console.error('FAIL: @observer-protocol/policy-engine is not installed.');
  console.error('      npm install @observer-protocol/policy-engine');
  process.exit(1);
}
const {
  verifyCredentialObject,
  verifyDecisionAttestation,
  evaluationVerdictPayload, EVALUATION_VERDICT_PAYLOAD_TYPE,
  refusalPayload, signableFromRefusal,
  ed25519Verify, base58Decode,
} = engine;

const manifest = JSON.parse(readFileSync(join(root, 'scripts/credential-expectations.json'), 'utf8'));
const expected = new Map(manifest.artifacts.map((a) => [a.path, a]));

// Every .json actually published under the watched directories.
const published = [];
for (const dir of WATCHED_DIRS) {
  const abs = join(root, dir);
  if (!existsSync(abs)) continue;
  for (const f of readdirSync(abs)) {
    if (f.endsWith('.json')) published.push(`${dir}/${f}`);
  }
}

const cacheDir = '/tmp/op-credential-check';
mkdirSync(cacheDir, { recursive: true });

// ─── ONE DIRECTORY, FIVE CONSTRUCTIONS, AND THE ARTIFACT SAYS WHICH ─────────────────────────────
//
// This file used to call verifyCredentialObject on everything, which was correct while everything
// published here was a delegation credential. The PPP corpus artifacts are not: a decision
// attestation is detached ed25519 over a JCS canonicalisation with no proof member, an evaluation
// verdict and an enforcement refusal are signatures over a rebuilt field set, and none of the three
// is a VC. Handing one of them to the delegation verifier would produce a structural refusal that
// says nothing about whether the record verifies.
//
// THE CONSTRUCTION IS DERIVED FROM THE RECORD, NEVER FROM THE MANIFEST OR THE FILENAME. The manifest
// then states which construction it expects and the two are compared, so a record that changes shape
// fails here rather than being verified by whichever path the manifest happened to name.
const CONSTRUCTIONS = {
  DELEGATION: 'delegation-credential',
  ATTESTATION: 'op.decision.attestation',
  VERDICT: 'op.evaluation.verdict',
  REFUSAL: 'op.enforcement.refusal',
  INSTRUCTION: 'op.payment.instruction',
};

function constructionOf(a) {
  // The store records state their own kind in `k`. Read it rather than sniffing fields.
  switch (a?.k) {
    case 'determination': return CONSTRUCTIONS.ATTESTATION;
    case 'verdict': return CONSTRUCTIONS.VERDICT;
    case 'refused': return CONSTRUCTIONS.REFUSAL;
    case 'instructed': return CONSTRUCTIONS.INSTRUCTION;
  }
  const types = Array.isArray(a?.type) ? a.type : a?.type === undefined ? [] : [a.type];
  if (types.includes('VerifiableCredential')) return CONSTRUCTIONS.DELEGATION;
  return undefined;
}

/** did:key -> the 34 multicodec-prefixed bytes verifyDecisionAttestation expects.
 *  NOT decodeEd25519Multibase, which strips the 0xed01 prefix the engine checks for. */
const didKeyBytes = (did) => {
  if (typeof did !== 'string' || !did.startsWith('did:key:z')) return undefined;
  try { return base58Decode(did.slice('did:key:z'.length)); } catch { return undefined; }
};
const rawKey = (did) => {
  const b = didKeyBytes(did);
  return b === undefined ? undefined : Buffer.from(b.slice(2));
};
const checkSig = (did, bytes, signature) => {
  const key = rawKey(did);
  if (key === undefined) return false;
  return ed25519Verify(key, Buffer.from(bytes, 'utf8'), Buffer.from(String(signature ?? ''), 'base64'));
};

// A verdict rebuild has no builder for the record's OWN payload version; see the verdict handler.
// Enumerated from the package's live exports rather than typed out, so the claim "the package has no
// builder for this record" is re-derived on every run instead of being a comment that goes stale.
const PAYLOAD_BUILDERS = Object.keys(engine).filter((k) => k.endsWith('Payload')).sort();

/** Every handler returns the same {allow, reason} shape verifyCredentialObject returns, so one
 *  manifest shape covers all five constructions and the symmetry check below is unchanged. */
async function runCheck(construction, a, artifact) {
  switch (construction) {
    case CONSTRUCTIONS.DELEGATION: {
      const schemaId = artifact?.credentialSchema?.id;
      return await verifyCredentialObject(artifact, {
        credentialPath: a.path,
        issuerDid: a.issuerDid,
        schemaAllowlist: schemaId ? [schemaId] : [],
        revocation: { maxStalenessHours: 24, onUnreachable: 'cache-then-deny', fetchTimeoutMs: 8000 },
        didCache: { maxStalenessHours: 24 },
        cacheDir,
        auditLog: join(cacheDir, 'audit.log'),
        rails: {},
        allowContractCalls: false,
      }, Date.now());
    }

    case CONSTRUCTIONS.ATTESTATION: {
      // The record carries the WIRE bytes; the signature is over JCS re-derived from the parsed
      // document, which is what the record's own `verification.construction` says.
      const doc = JSON.parse(Buffer.from(artifact.document, artifact.documentEncoding === 'base64' ? 'base64' : 'utf8').toString('utf8'));
      const block = verifyDecisionAttestation(
        artifact.decisionId, doc, artifact.signature,
        (msg, sig, pk) => ed25519Verify(Buffer.from(pk), Buffer.from(msg, 'utf8'), Buffer.from(sig)),
        didKeyBytes,
      );
      // `state` is the engine's own AttestationState vocabulary. On a failure the engine supplies a
      // reason; on success it supplies none, so the state token is carried in a delimited form
      // rather than as a bare word a future state name could contain as a substring.
      return {
        allow: block.state === 'attested',
        reason: block.reason ?? `attestation verified; state=${block.state}`,
      };
    }

    case CONSTRUCTIONS.VERDICT: {
      // ─── THE ONE PATH WHERE THE PACKAGE CANNOT READ THE RECORD'S OWN CONSTRUCTION ──────────────
      //
      // signableFromRefusal rebuilds a refusal under the version the RECORD carries, so an old
      // refusal verifies under an upgraded build. evaluationVerdictPayload has no equivalent: the
      // domain separator is a module constant, so this build can only ever rebuild the version it
      // ships. A record signed under any other version fails here, and the failure is about the
      // BUILD rather than about the record.
      //
      // NOT WORKED AROUND. Rebuilding the record's version here would mean a second copy of the
      // signing construction living in this repository, which is the defect the estate keeps
      // finding; and it would turn a real gap in the published package into a green tick. The
      // expectation in the manifest states the failure instead, and names both versions, so a
      // package that starts rebuilding the record's version turns this check red and forces the
      // expectation to be updated in the same commit.
      const declared = artifact?.construction?.type;
      const rebuilt = EVALUATION_VERDICT_PAYLOAD_TYPE;
      const ok = checkSig(artifact.evaluator, evaluationVerdictPayload(artifact.payload), artifact.signature);
      return {
        allow: ok,
        reason: ok
          ? `signature verifies over the payload this build rebuilds (${rebuilt})`
          : `signature does not verify over the payload this build rebuilds (${rebuilt}); the record states construction ${declared ?? 'none'}`,
      };
    }

    case CONSTRUCTIONS.REFUSAL: {
      const signable = signableFromRefusal(artifact);
      const ok = checkSig(artifact.signedBy, refusalPayload(signable), artifact.signature);
      return {
        allow: ok,
        reason: `${ok ? 'signature verifies' : 'signature does not verify'} over the payload the record states (${signable.payloadType})`,
      };
    }

    case CONSTRUCTIONS.INSTRUCTION: {
      // THE THIRD ANSWER, NOT A FAILURE. A check that ran and failed and a check that could not run
      // are different facts, and collapsing them here would publish "does not verify" over a record
      // nothing has looked at.
      return {
        allow: 'no-verifier-path',
        reason: `the package rebuilds no payload for record kind '${artifact.k}'; its payload builders are ${PAYLOAD_BUILDERS.join(', ')}`,
      };
    }

    default:
      return { allow: 'unrecognised-construction', reason: 'nothing in this artifact states which construction signed it' };
  }
}

const failures = [];

// 1. Nothing published without a recorded expectation.
for (const p of published) {
  if (!expected.has(p)) {
    failures.push(
      `${p}\n    UNDECLARED: published but absent from scripts/credential-expectations.json.\n` +
      `    Add it with the verdict you expect. A credential on the site that nobody has\n` +
      `    run through the verifier is exactly how the last two got there.`
    );
  }
}

// 2. Nothing declared that is no longer published.
for (const p of expected.keys()) {
  if (!published.includes(p)) {
    failures.push(`${p}\n    MISSING: declared in the manifest but not present in the repository.`);
  }
}

// 3. Every published artifact matches its expectation.
const results = [];
for (const p of published) {
  const a = expected.get(p);
  if (!a) continue;

  const artifact = JSON.parse(readFileSync(join(root, p), 'utf8'));
  const construction = constructionOf(artifact);

  let verdict;
  try {
    verdict = await runCheck(construction, a, artifact);
  } catch (e) {
    verdict = { allow: 'threw', reason: e.message };
  }

  // The construction is compared, not trusted. An artifact whose shape changes under a filename
  // the manifest already declares would otherwise be checked by the wrong verifier and pass.
  const constructionOk = construction === a.expect.construction;
  const allowOk = verdict.allow === a.expect.allow;
  const reasonOk = String(verdict.reason ?? '').includes(a.expect.reasonContains);
  const ok = constructionOk && allowOk && reasonOk;

  results.push({ path: p, ok, construction, verdict, expect: a.expect, knownIssue: a.knownIssue });

  if (!ok) {
    failures.push(
      `${p}\n` +
      `    expected: construction=${a.expect.construction} allow=${a.expect.allow} reason~"${a.expect.reasonContains}"\n` +
      `    actual:   construction=${construction} allow=${verdict.allow} reason="${verdict.reason}"\n` +
      (!constructionOk
        ? `    The artifact no longer states the construction the manifest expects. Nothing was\n` +
          `    verified by the intended path; fix the artifact or the expectation before reading\n` +
          `    anything into the verdict above.`
        : allowOk
          ? `    The verdict matched but the reason changed. A reason string is what the\n` +
            `    site quotes to a reader; treat a change in it as a change in the claim.`
          : a.expect.allow === false
            ? `    An artifact expected to FAIL now passes. If that is intended, this\n` +
              `    expectation is stale and should be updated in the same commit as the fix.`
            : `    A published artifact no longer verifies. The site instructs readers to\n` +
              `    run this exact check.`)
    );
  }
}

const pad = Math.max(...results.map((r) => r.path.length));
const cpad = Math.max(...results.map((r) => String(r.construction).length));
for (const r of results) {
  const mark = r.ok ? 'ok  ' : 'FAIL';
  const flag = r.knownIssue ? `  [${r.knownIssue}]` : '';
  console.log(`${mark}  ${r.path.padEnd(pad)}  ${String(r.construction).padEnd(cpad)}  allow=${String(r.verdict.allow).padEnd(17)}${flag}`);
}

const known = results.filter((r) => r.ok && r.knownIssue);
if (known.length) {
  console.log(
    `\n${known.length} artifact(s) do not verify, as expected, and are disclosed beside the artifact:\n` +
    `/verify.html for the credentials, verify-samples/README.md for the PPP corpus.\n` +
    `These are held open deliberately, not passing quietly:`
  );
  for (const r of known) console.log(`  ${r.knownIssue.padEnd(28)}  ${r.path}`);
}

if (failures.length) {
  console.error(`\n${failures.length} expectation(s) not met:\n`);
  for (const f of failures) console.error(`  ${f}\n`);
  process.exit(1);
}

console.log(`\nAll ${results.length} published artifacts match their recorded expectation.`);
