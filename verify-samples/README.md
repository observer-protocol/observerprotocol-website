# Verification samples

Artifacts for anyone checking that the Observer Protocol verifier does what this site says it does.
All of them are served publicly and are meant to be downloaded.

Three are delegation credentials. The other eight come from the **PPP corpus**, and they are what a
determination, a verdict, a refusal and a payment instruction actually look like when a policy stack
runs end to end.

## The PPP corpus is synthetic in its cases and real in its policy

**Real in its policy.** The rule applied is US Paycheck Protection Program loan forgiveness under two
Federal Register instruments, read from the documents rather than described from memory:

| id | citation | RIN | FR doc | published | sha256 of the retrieved PDF |
|----|----------|-----|--------|-----------|------------------------------|
| APR | 85 FR 20811 | 3245-AH34 | 2020-07672 | 2020-04-15 | `9b7c561bbcf0afa79a8d8294e114ccf19c5f85fd6b778a94035b45343271be96` |
| JUN | 85 FR 36308 | 3245-AH49 | 2020-12909 | 2020-06-16 | `cee76d17312a4aa039091a8d5cedc838782f46f186b5c3323cc24fadbc99f810` |

Both retrieved from govinfo at URLs read out of the Federal Register API by RIN, and both hashed
before being read. The two rules differ in one number: the proportional non-payroll cap `c`, 25%
under APR and 40% under JUN. Every determination below carries the instrument it applied in
`policyRef`, with that digest.

**Synthetic in its cases.** The loan figures are constructed, not client data. No borrower, no
lender and no real loan appears anywhere in this directory. The cases are built to sit on and just
off the boundaries the rule creates, because that is where a determination engine is worth testing.

**Why that is the right balance, and why it is stated rather than assumed.** Real artifacts from a
real client would carry an outcome, a policy reference, a decider identity and an amount, and
publishing them would be publishing the customer's business. Purely synthetic policy would let the
worked examples agree with the tool by construction. The split puts the invented half where it costs
nothing and the checkable half where a reader can go and read the source.

**Retroactivity is recorded, not resolved.** The June rule's forgiveness provisions take effect
2020-03-27, before the April rule was published. Nothing here decides which rule was the law on a
given date. Each case carries its outcome under each instrument, and each artifact names the one it
applied. That is the same limit the site states about `policyRef.hash` generally: it can answer
*what did you read*, and it can never answer *what was the law*.

## What is here, and what the verifier returns for each

Measured with `@observer-protocol/policy-engine@1.0.0-rc.12` on 16 August 2026. Every reason string
below is the checker's own output, copied from the run, not a paraphrase. The same expectations are
recorded in `scripts/credential-expectations.json` and asserted in CI in both directions: a passing
artifact that regresses fails the build, and a failing artifact that starts passing fails it too.

### Delegation credentials

| File | Construction | Expected | Reason returned |
|---|---|---|---|
| `verifies-delegation-mandate.json` | `delegation-credential` | **allow: true** | `credential verified` |
| `must-not-verify-tampered-signature.json` | `delegation-credential` | **allow: false** | `[proof] eddsa-jcs-2022 signature does not verify against the issuer key` |
| `must-not-verify-expired-mandate.json` | `delegation-credential` | **allow: false** | `validity: credential expired (validUntil 2026-02-01T00:00:00Z)` |

### PPP corpus

| File | Construction | Expected | Reason returned |
|---|---|---|---|
| `ppp-determination-refused-outcome.json` | `op.decision.attestation` | **allow: true** | `attestation verified; state=attested` |
| `ppp-verdict-released.json` | `op.evaluation.verdict` | **allow: false** | `signature does not verify over the payload this build rebuilds (op.evaluation.verdict.v3); the record states construction op.evaluation.verdict.v4` |
| `ppp-verdict-denied-ceiling.json` | `op.evaluation.verdict` | **allow: false** | same as above |
| `ppp-refusal-applied-bound.json` | `op.enforcement.refusal` | **allow: true** | `signature verifies over the payload the record states (op.enforcement.refusal.v2)` |
| `ppp-probe-a-verdict-release-above-escalation.json` | `op.evaluation.verdict` | **allow: false** | same version mismatch as above |
| `ppp-probe-a-instruction-executed.json` | `op.payment.instruction` | **no-verifier-path** | `the package rebuilds no payload for record kind 'instructed'; its payload builders are evaluationVerdictPayload, lapsePayload, refusalPayload` |
| `ppp-probe-b-verdict-release-above-ceiling.json` | `op.evaluation.verdict` | **allow: false** | same version mismatch as above |
| `ppp-probe-b-refusal-by-the-mandate.json` | `op.enforcement.refusal` | **allow: true** | `signature verifies over the payload the record states (op.enforcement.refusal.v2)` |

**`no-verifier-path` is a third answer and not a soft failure.** A check that ran and failed and a
check that could not run are different facts about an artifact, and a surface that renders them
alike is asserting one of them without having established it.

## The four that do not verify, and why they stay published

**All four verdicts fail, and the records are sound. The failure is a version pin.**

Each of the four was signed under `op.evaluation.verdict.v4`, which the record states in its own
`construction` field. `EVALUATION_VERDICT_PAYLOAD_TYPE` is a module constant emitted **inside** the
canonicalised bytes, so a build can only ever rebuild the version it ships. rc.12 ships v3, the
bytes differ in that one string, and the signature does not verify.

Measured on 16 August 2026, against these exact eight files:

| engine | serves | rebuilds | the four verdicts | the two refusals | the determination |
|---|---|---|---|---|---|
| `1.0.0-rc.12` | npm `latest` | `op.evaluation.verdict.v3` | **do not verify** | verify | attested |
| `1.0.0-rc.18` | npm `rc` | `op.evaluation.verdict.v4` | verify | verify | attested |

So these records are not broken. They are correctly signed artifacts that the version this site
pins cannot check, and **the version this site pins is the one a reader gets.** `npm install
@observer-protocol/policy-engine` serves rc.12 today. That is why the table above states the failure
rather than the repository quietly installing `@rc` to make it disappear: the expectation recorded
in CI is what a reader will actually see when they follow the instructions on this site.

**The refusal path survives the same bump, and that contrast is the finding.**
`signableFromRefusal` reads `payloadType` off the record and rebuilds under the version that record
was signed with, so a refusal verifies under either engine. A verdict record has no such field for
the package to read; `construction.type` is on the record and nothing in the package consults it.
One design decision applied to one signed class and not the other. A verdict signed under v3 fails
at rc.18 for exactly the same reason these fail at rc.12, in the opposite direction.

**It is not worked around here.** Rebuilding the v4 bytes inside this repository would put a second
copy of the signing construction beside the package's own, and it would turn a real gap into a green
tick. The expectation names both versions instead, so whichever way the pin moves, this build goes
red and the expectation has to be updated in the same commit as the move.

**Nothing in this directory is deliberately broken except the two `must-not-verify-*` files.** Those
two are tampered fixtures and must never verify. The four verdicts are sound records a pinned
verifier cannot check, which is a different thing, and it is why the distinction is not encoded in
their filenames: a filename saying `must-not-verify` would still be saying it after the pin moves.

## The case behind each artifact

Every record below is copied verbatim out of the store of a run of the `op-ppp-cases` producer
against a local enforcement deployment on 15 August 2026. The JSON is re-indented and nothing else
is touched. That is safe here because every one of these signatures is over bytes the verifier
**rebuilds** from the record's fields, never over the file as it sits on disk.

Two mandates were in force for the run, one per instrument. Both authorise the outcomes
`forgiveness-full` and `forgiveness-partial` and no others. Both carry a per-transaction ceiling of
**700,000 USDC**, state `enforced`, and an escalation threshold of **300,000 USDC**, state
`declared`.

### `ppp-determination-refused-outcome.json`: a determination that refused

**Case MF-0001, under 85 FR 20811.** `principal_cents` is absent from the input object entirely, so
the engine refused rather than computing a figure. The determination carries
`refusalClass: SCHEMA`, `refusalCodes: ["E_PRINCIPAL_MISSING"]` and `refused: "true"`.

The outcome term is **`determination-refused-schema`**, and it is non-authorizing: neither mandate
lists it. It is in the document's own `vocabularyRef.values`, so a verifier can see the term was
declared before it was used, and the enumeration travels inside the signed document.

Which is also its limit, and the site says so elsewhere: **an outcome checked against a list the same
document carries is internally consistent and establishes nothing semantic.** The signature
establishes that this decider said this. It does not establish that the refusal was correct.

Construction: detached ed25519 over a JCS canonicalisation of the whole document, which carries no
proof member. The decider is a `did:key`, so it resolves with no network call.

### `ppp-verdict-released.json`: a verdict that released

**Case BE-0001, under 85 FR 20811, $105,922.00.** Documented payroll is exactly three quarters of
principal, so April's 25% non-payroll cap sits exactly on its boundary and does not bind; all three
terms of the rule equal the principal and the loan is forgiven in full.

Submitted 2026-08-15T19:11:31.955Z on the third attempt, answered `200 instructed` as reservation
`res-0001`. The eleven signed fields include the rail, asset, amount and decimals **of the spend**
rather than of the verdict, deliberately: signing the verdict's own figures would bind the decision
and leave the money free.

### `ppp-verdict-denied-ceiling.json`: a verdict that denied, naming the ceiling

**Case ID-0077, under 85 FR 20811, $1,156,884.63.** The principal binds under both instruments, and
the figure is well above the mandate's 700,000 USDC ceiling. The verdict is a `deny` carrying
`breachedConstraint: per_transaction_ceiling`.

**It names the ceiling and signs no figure for it.** `denialDetail` is an empty object, and it is
inside the signed bytes as `"denialDetail":{}`, so the emptiness is signed rather than merely
absent. The limit, the observed value and the unit are on the refusal record beside it and nowhere
else. A reader holding only the verdict knows which constraint refused and cannot say by how much.

### `ppp-refusal-applied-bound.json`: a refusal carrying the applied bound

The enforcement refusal for that same ID-0077 submission, answered `422` at
2026-08-15T19:10:06.718Z. Signed by a third key that is neither the decider nor the evaluator.

```
authority           mandate
code                CEILING_EXCEEDED
breachedConstraint  actionScope.per_transaction_ceiling
appliedBound        state recorded, limit 700000, observed 1156884.630000, unit USDC
```

The engine's own reason string on the record, verbatim:

> This payment moves 1156884630000 minor units (6 dp) of USDC and the mandate's
> per_transaction_ceiling is 700000 USDC, which is 700000000000 at the same scale. The payment
> exceeds it and is refused. The constraint breached is `actionScope.per_transaction_ceiling`. This
> figure is the EFFECTIVE ceiling: a deployment may tighten it below what the credential declares
> and may never raise it, so compare against the credential to see whether it was tightened.

**And this refusal names no decision.** It fired before the citation was read, so there is no
`decisionId` on it and no way to join it to the determination it refused on. For 900 of the 1,801
payments in the run the enforcement record and the determination record share no identifier at all.
That join exists only in the submitter's own log, which is not published here.

**The stored record does not carry the absence as a state, and the served view does.**
`GET /v1/refusals` reports `attestation.state: not-evaluated` for all 900 of these, which is the
right shape: it distinguishes *the citation was never read* from `not-cited`, meaning a citation was
looked for and was absent. **The record itself has no `attestation` member at all.** Since
`signableFromRefusal` includes that member only when the record carries one, the signed bytes carry
nothing about it either. So the distinction the API draws is not in the artifact and is not signed,
and a reader who holds only this file cannot tell the two apart. Download it and check: the field
is not there. It is named here because the gap between a served view and a signed record is exactly
the kind of thing this directory exists to let a reader find.

### The two probes

**A compliant client and a working control are indistinguishable by observation**, because
compliance is defined as behaving as though the control were there. Across the run's 1,801 payable
determinations, every ordinary response is consistent with the control working and equally
consistent with the service honouring a client that behaved as though it were. To
observe a control you have to be non-compliant in exactly the way it governs, which a compliant
producer will never generate. Both probes were constructed, and both outcomes were written down
before either was sent.

### `ppp-probe-a-verdict-release-above-escalation.json` and `ppp-probe-a-instruction-executed.json`

**Case DV-0004, under 85 FR 20811, $500,589.98.** April's 25% cap binds where June's 40% cap would
not, which is what makes this case interesting on its own. It was chosen for the probe because it is
the corpus payment nearest the midpoint of the escalation band: $200,589 above the escalation
threshold and $199,410 below the ceiling, so if anything unexpected happened neither threshold could
be the explanation.

The verdict says **`release`** at an amount above the mandate's displayed 300,000 USDC escalation
threshold. A compliant evaluator would have said `escalate`. The `reservationId` carries
`probe-01-deliberate-release-above-escalation-threshold`, chosen because it is the only field this
client sets that survives into a read view, so the record is identifiable as deliberate without any
accompanying note.

**The payment was instructed.** Nothing refused it and nothing escalated. The second file is the
instruction the deployment issued, `oi_e092d3ff0c7ebb9bb9990d1377688f0d`, signed by the executor.
The mandate view went on displaying `escalationThreshold: 300,000` with `state: declared` and a note
saying declared equals enforced.

**So the threshold is displayed and not applied on this path.** Stated as the counterfactual, which
is the clearest form: if every verdict in the run had said `release`, all 901 under-ceiling payments
would have settled, nothing would have escalated, and the mandate view would still have read
300,000. No surface would have disagreed with itself.

It establishes exactly that and no more. It does not establish the size of the gap, whether any
other displayed term is also unenforced, or that the threshold is unenforced anywhere but here. It
is one request and it answers a yes-or-no question.

**The instruction is the half of this probe that carries the finding, and it is the artifact no
published version of the package can check.** The verdict beside it fails at rc.12 on the version
pin and verifies at rc.18. The instruction verifies at neither, because neither ships a payload
builder for it. So of the two records that together demonstrate the gap, one fails for a reason
unrelated to the finding and the other cannot be checked at all. That is stated here rather than
left for a reader to notice.

### `ppp-probe-b-verdict-release-above-ceiling.json` and `ppp-probe-b-refusal-by-the-mandate.json`

**Case BO-0190, under 85 FR 36308, $2,339,635.21.** One cent above the exact boundary in BE-0095:
under April the cap binds and forgiveness is $1,871,708.17, under June it does not and the whole
documented spend is forgiven. The June figure is 3.3x the mandate's ceiling.

The verdict says **`release`**. Being a release it carries no `breachedConstraint` and no
`denialDetail`, and the amount is the only thing in the request that has anything to do with the
ceiling.

**The mandate refused it anyway.**

```
refusal-416   CEILING_EXCEEDED
              authority           mandate
              breachedConstraint  actionScope.per_transaction_ceiling
              appliedBound        limit 700000, observed 2339635.210000, unit USDC
```

**`per_transaction_ceiling` occurs zero times in the request.** The service produced that constraint
name against a verdict that did not ask for it, so it cannot be an echo of anything the caller sent.
For the other 900 ceiling refusals in the run, the constraint the service names is the constraint
the request already contained, so each of those is equally consistent with the control working and
with the service echoing the client. This row is the one that separates them, and no compliant
record can produce it.

The refusal is also the artifact of the pair that verifies under both engine versions. The release
it refused verifies under only one, for the version reason above.

## What verifying any of these does not establish

Carried here because a directory of green ticks would be making a claim these artifacts do not
support.

- **A reference hash is confirmed present, never confirmed correct.** `policyRef.hash`,
  `vocabularyRef.hash` and `deciderArtifactDigest.value` are checked for presence and
  non-emptiness. **Nothing dereferences any of them.** The digests in the table at the top of this
  file are the ones the producer recorded; a verifier running against these artifacts does not go
  and fetch 2020-07672 to compare.
- **A content hash cannot identify the policy in force on a date.** An amending instrument revises
  some clauses and leaves others standing, so a date selects clauses rather than documents.
- **The vocabulary travels inside the signed document**, so checking an outcome against it is
  internally consistent and establishes nothing semantic.
- **Verification takes no clock.** `decidedAt`, `notBefore` and `notAfter` are carried and compared
  to nothing by the check above.
- **A verified attestation is not a verified determination.** The signature establishes that a
  decider said this. Not that the decision was sound, that anyone observed it, or that the inputs
  are readable.

## These are not authorisations

The two `must-not-verify-*` files are not valid credentials and are not evidence of anything about
the agent named inside them.

The eight `ppp-*` files are records of a run against a local deployment using test keys, over
constructed loan figures. Two of them are deliberately non-compliant by construction. **No file in
this directory is an authorisation for anything**, and the two probe verdicts in particular are
records of a control being tested rather than of a payment anyone should honour.
