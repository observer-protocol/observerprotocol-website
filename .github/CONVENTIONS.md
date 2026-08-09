# Conventions for this repository

Short, and every entry exists because something went wrong without it.

Lives under `.github/` deliberately: `netlify.toml` sets `publish = "."`, so the publish directory
**is** the repository and any file at the root is served on the live domain. Netlify withholds
dot-directories — verified, `/.github/workflows/aip-sync.yml` returns 404 — so this file is not
public.

---

## 1. Protected sentences: `<!-- REVIEWER: -->`

Some sentences are load-bearing in a way that is invisible to the person editing them. They look
long, or redundant, or like they could be tightened. Tightening them reintroduces a defect that was
specifically removed.

**When a sentence is like that, guard it in the source, where the editing happens.** A note in a spec
document in another repository cannot protect a tile: the person who shortens it will be in this
file, not in that one.

### The form

```html
<!-- ==========================================================================
     REVIEWER: <ONE LINE SAYING WHAT NOT TO DO.>

     <Why the sentence exists: the specific wrong reading it prevents, stated
     concretely enough that a reader who disagrees can evaluate the claim
     rather than just obey it.>

     <Which sentence must survive if the block is shortened, and what to cut
     instead.>
     ========================================================================== -->
```

Three parts, all required: **what not to do**, **why**, and **what to cut first instead**. A bare
"do not edit" is an instruction; the reason is what makes it survive a reader who thinks they know
better.

### Current protected sentences

| file | sentence | prevents |
|---|---|---|
| `agentic-terminal.html` | *"This is a record of authority decisions made in this surface. It is not a record of settlements"* | implying Agentic Terminal observes settlements and that they are verified |
| `architecture.html` | *"A system that both made the determination and sold assurance over it would be attesting to its own work"* | the decider's separation reading as an implementation detail a customer could ask us to waive |
| `architecture.html` | the decision attestation is drawn **below** the spine | drawing it on the spine puts us in the decision path in the picture while the prose says we are not |
| `supervisors.html` | *"a firm holding only one of the two can report itself clean while every one of them is occurring"* | the four cross-firm conditions reading as a feature list rather than as the reason the page exists |

Add a row when you add a comment. A protected sentence nobody knows about is one edit from gone.

---

## 2. Any copy defect gets swept sitewide before it is closed

**Standing rule.** Fixing the instance you found is not finishing.

On 2026-08-09 a capability tile on `agentic-terminal.html` described configuring a response to *"an
agent failing a trust threshold check"* — a mechanism that does not exist. It was fixed. A sitewide
grep then found it **twice more on `architecture.html`**, in the technical reference, which is where
an evaluator goes specifically to check whether a mechanism is real.

**Why this class propagates:** each mention reads as ordinary product prose. It survives every sweep
aimed at wrong numbers, dead links or stale versions, because nobody copies a false claim
deliberately — they copy a sentence that describes the product.

So:

```bash
grep -rni "<the mechanism's name>" --include='*.html' .
```

Grep the **mechanism**, not the sentence you happened to fix. The instance you found is evidence
about the class, not about the page.

---

## 2a. The four defect families, and what a grep can and cannot find

Every copy audit on this site checks four things. **Three are greppable. One is not, and a sweep that
does not say so is reporting a result it did not get.**

**1. A mark never derived from anything.** A ✓, a badge, a status pill or a `VERIFIED` string that no
code computes. Worse than a wrong predicate: it cannot be stale relative to data it never consulted,
there is no code path to audit, and nothing would ever go red. *Detection:* grep the page for
`<script`; a verdict on a page with none came from a keyboard. Then ask what would have to change for
the mark to become false — if the answer is "someone would have to retype it", it is this.

**2. A mechanism named in copy with no implementation.** Copy describing configuration of, or a
response to, an event the system cannot emit. Reads as a feature to a customer and as a lie to an
evaluator. *Detection:* grep verbs of configuration and response — `configure`, `set thresholds`,
`escalation`, `monitoring`, `alerts` — then ask whether the upstream event exists.

**3. Claims a reader combines across sections into something we do not meet.** Each sentence true;
the conjunction false. *Detection:* **none. A grep does not find these.**

**4. A number correct under a wrong predicate.** *Detection:* greppable, but **start from the label**
— a correct number under a wrong predicate is still a false claim, so verify what the field counts
before verifying the figure.

### Family 3 is not greppable, and a sweep must say so

All three known instances were found by **reading two sections together and reasoning about what a
reader concludes**, never by searching:

- §03 said an attestation verifies offline with nothing from us; §04 showed a refusal. A reader
  concludes refusals verify offline. They cannot — `refusalPayload` is not exported.
- Crossrail's hero claimed one cross-rail budget with buyer-side enforcement at every rail's boundary;
  a reader concludes an adversarially binding cross-rail cap exists in production. It is a cooperative
  counter the agent can truncate, and it has never run in production.
- The AT audit tile said "every verified transaction is logged", implying both that AT observes
  settlements and that they are verified.

**So "no family-3 instances found" means "not established", never "clean", and any sweep report must
use those words.** The only method known to work is reading adjacent sections in the order a reader
meets them and asking what the conjunction claims.

### The unit of a sweep is the ruling, not the page

When a ruling is about a **concept**, sweep the concept and **work the hit list to zero** — not the
pages. A page-scoped pass finds every instance and fixes a subset, and nothing distinguishes that from
having fixed them all, because each page ends up clean.

This happened. Reputation was ruled off the site entirely; a sitewide grep produced the list; the work
was then organised page by page, and reputation survived in five places including one page already
audited, whose instance was in the original grep output.

And key on **structure, not vocabulary**: `registry.html`'s six "Scope levels" were removed, while
`agents.html`'s "Badge Levels" — the identical tier model under different words — survived a cut aimed
at the words. After sweeping the term, ask what else has the same shape.

Re-run the sweep at the end and paste the empty result. Do not conclude from the last page you touched.

## 2b. The measured test: name the check, or it is not measured

**Any claim whose justification cannot be reduced to *"this check runs, and here is what it reads"* is
not measured, whatever the column says.**

Found by demoting a row on `supervisors.html`. Four claims were marked YES under a heading reading
*measured*. Three named a check that runs:

- a signature verifies against a resolved key
- a DID document resolves over HTTPS
- a field is read directly from the signed document

The fourth — *"the authority was granted before the action, not reconstructed after it"* — justified
itself with an **argument**: *"a mandate backdated to cover an action would have to be re-signed,
which changes the signature."* True, and it establishes nothing. Re-signing a backdated document
produces a valid signature over a backdated document. **Nothing in these artifacts binds a signature
to a wall-clock moment.** An issuer holding the key mints a mandate today with `validFrom` last March
and every check on the page goes green.

It is now a NO that names the missing mechanism: an external timestamping authority, or an anchor
binding the signature to a time nobody in the transaction controls.

### Applying it

For every ✓, YES, badge, pill or *measured* label on the site, ask: **which check runs, and what does
it read?** If the answer is a chain of reasoning rather than an operation, the mark is wrong.

**Do not convert a failing claim into YES-with-a-limit.** A qualification that empties the claim is
the same defect wearing a caveat — a reader scanning the column sees the mark, not the paragraph. If
the honest content is that nothing is established, the mark is NO.

**Name what would close it.** A NO that only says no reads as evasion; a NO that names the missing
mechanism reads as an engineering gap someone could close, and is checkable against the day it
arrives.

## 2c. Narrowing a sentence is not narrowing a claim

When a claim needs a limit, the limit belongs in **the section a reader acts on**, stated in full, not
referenced from elsewhere.

Homepage §03 was narrowed to say the offline set is delegation credentials and excludes the refusal
record. §05 — *Verify it yourself*, where a reader actually runs something — still said *"you do not
need our cooperation to check our work"* with no limit at all. The conjunction survived the fix,
because the fix was applied to the sentence that was wrong rather than to the claim the page makes.

The same shape appears as **the promise preceding the exception**: `verify.html`'s H1 read *"You have
a record. Here is how to check it"* while the page can only check delegation credentials, with the
exception disclosed further down. Narrowed to *"You have a delegation credential"*, and the caveat
moved above the instructions.

**A cross-reference is not a limit.** A reader in the section that promises does not scroll to the
section that qualifies.

## 3. Adding a non-web file makes it public

`publish = "."`. A new `.md`, `.sh`, `.csv` or `.py` at the root is served the moment it merges, and
nothing looks broken when it happens. `netlify.toml` carries a **denylist**, which does not close the
class.

If you add a non-web file: put it under `.github/`, `scripts/` or `tools/` (the last two are
404'd by rule), or add a `netlify.toml` rule **in the same commit**.

---

## 4. Version strings are derived, not typed

The engine version is stated in HTML only inside markers:

```html
<span data-engine-version="current">…</span>      rewritten from scripts/package-lock.json
<span data-engine-version="historical">…</span>   a past measurement; never rewritten
```

`node scripts/sync-engine-version.mjs` rewrites the current ones; `--check` runs in CI. **An unmarked
version string in any HTML file fails the build.** This exists because the version was hand-typed in
eight places and they disagreed within a single day.

---

## 5. Published credentials are checked, in both directions

`scripts/verify-published-credentials.mjs` runs every artifact under `credentials/` and
`verify-samples/` against a recorded expected verdict. It fails when a passing artifact regresses,
when a failing artifact starts passing, when a reason string changes, and when an artifact is
published with no expectation recorded at all.

Adding a credential means adding its expectation in the same commit.

---

## 6. Deleted pages return 410, not 404

`404` says "nothing is here", which invites a crawler to retry and a reader to assume a broken link.
`410` says "this existed and was withdrawn", which is the true statement. `/gone.html` carries the
body. Do not redirect a removed page to a replacement unless one genuinely covers the same subject.

---

## 7. Re-measure immediately before writing a correction

Not before deciding to make one. On 2026-08-09 a stat block correction was about to publish a
corrected value for `vacs_issued` — a field that had been **deleted upstream that same day** for
counting nothing meaningful. The endpoint had been rewritten between two readings hours apart.

The same applies to base branches: check whether the PR you are stacking on has merged before
branching from `master`, or you will silently revert it.
