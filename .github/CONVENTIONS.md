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

## 2d. Position is relative to the reader's path, not to the section

A qualification must sit before **every** claim it qualifies, in the order a reader meets them.

`crossrail.html` was rewritten specifically because a caveat below a claim comes too late, and the
correction — *"The budget is a design. The ceiling is a control."* — was placed above the transcript.
It was above the transcript and **below the engine cards**, two of which still asserted *"the same
shared budget as every other rail"* and *"one rolling budget"*. A reader met both, formed the
adversarially-binding reading, and only then reached the correction.

**"Above the transcript" was a position relative to the artifact, not relative to the reader.** The
unit is the reader's sequence through the page.

Practically: after moving or adding a qualification, read the page **from the top** and list every
claim it is supposed to cover. If any appears earlier than the qualification, the placement is wrong
however deliberate it was.

## 2e. Editing under a rule produces defects in the surroundings

**Expect to introduce instances of the family you are fixing.** This is not carelessness; it is what
working through a list does. The rule occupies the attention that would otherwise go to what is around
the edit.

Three examples, all from one evening, all introduced by the person applying the rule:

- Rebuilding `architecture.html` around the mandate spine — to remove marks nothing computes — added
  three green `live` badges that nothing computes.
- Rebuilding `agents.html` to state nothing it cannot establish left `<title>Verified Agents</title>`
  and a description claiming *"cryptographically verified transaction history"*.
- Correcting `trading.html`'s verification claim added a fresh untagged instance of the claim being
  enumerated, caught minutes later by the check.

**So: after any pass, re-run the pass's own test against the pass's own output.** The check that found
the third one had been written an hour earlier for exactly this and still had to be run to catch it.
A rule applied by hand does not check its own edits.

## 2f-pre. Search the stem, not the word — and the escalation that produced this rule

**Three variants of one lesson in one evening, each fix making the search more precise and the miss
more specific:**

| pass | searched | missed |
|---|---|---|
| 1 | the **phrase** — *"revocation works end to end"* | nouns in feature lists |
| 2 | the **subject** — `revocation` | nothing; that one worked |
| 3 | the subject **as previously written** — `trust score`, `reputation score` | `trust scoring`, `reputation data`, `Score 71` |

`trust scoring` does not contain `trust score`: the stem diverges at `scor|e` versus `scor|ing`. **A
capability asserted as a gerund, a bare noun, or a number with a label is invisible to a search for
the noun phrase.**

Reputation was ruled off this site and reported clear **three times**, wrong each time, because each
search was shaped like the previous fix. The fourth check counted 22 references across 10 live pages,
including two pages rebuilt that same evening expressly to remove it.

**Search the stem, anchored at a word boundary.** `scor` catches `score`, `scoring`, `scored`,
`scores`; anchoring stops `discord` matching — a false positive worth fixing in the matcher rather
than hiding in an allowlist, because an allowlisted false positive is indistinguishable from a real
exception.

**And do not police a retired concept by searching. Forbid it.** `scripts/shared-copy.json` carries a
`$forbidden` block: stems, plus an allowlist naming each surviving occurrence **and its reason**. The
build fails on anything else. That is the only thing that makes a fourth clearance mean more than the
first three did.

Real exceptions exist and belong in the allowlist with their reason rather than in someone's memory:
ERC-8004's contract is literally named the *Reputation Registry*; `institutional/` says *"not the
trust score"*, which is the correct usage; alt text describing a screenshot showing a score must keep
describing it.

## 2f. Phrase a constraint around its subject

**A constraint's grammar chooses the search shape of whoever checks it.** Write constraints so the
natural search is the right one.

The API's field notes carried: *"no surface may claim revocation works end to end."* That is a
**prohibition**, phrased as a predicate, so it was checked by grepping `revocation works`,
`revocation is live`, `revocation end to end`. All clean. The site claimed it in **seven** places and
six were **nouns in feature lists** — *"issuance, caps, revocation, audit"*, *"approval and
revocation"*, *"Revocation + cascade"*, *"one-click revocation"*. A capability is almost never
asserted with a verb. It is listed.

Three sibling constraints in the same field notes were checked the same evening and were genuinely
clean — but only because they were phrased as **field descriptions**: *"`total_transactions` is an
UNFILTERED count … NOT a count of verified or attested transactions."* A keyword search on that lands
on the subject by accident.

So:

| phrasing | how it gets checked | catches a noun in a list? |
|---|---|---|
| *"no surface may claim revocation works"* | grep the predicate | **no** |
| *"revocation is not a capability of this deployment"* | grep `revocation` | **yes** |

**Write the subject first and make the constraint a statement about it**, not a rule about sentences
someone might write. The second phrasing survives being checked carelessly; the first does not.

And when reading a constraint someone else wrote, notice which shape it is. If it is a prohibition,
convert it before searching: what is the subject, and where would that subject appear?

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

---

## 8. Reading and the check each catch what the other cannot. Neither is sufficient

Bought twice in one session, 2026-08-09, on the same claim.

**Reading found what the check could not see.** `check-shared-copy.mjs` matched its `claimPatterns`
with `indexOf` — case-sensitive literals. The heading "No call back to us" on `index.html` sat
outside any tag and the check stayed green, because the pattern was written lower-case. A literal
list also cannot spell one claim two ways, and this site spells it at least five: *call back to us*,
*callback to Observer*, *network call to Observer*, *neither our permission nor our uptime*, *no
runtime dependency on OP*. Each variant shares no wording with the others. Four assertions were
invisible to the enumeration whose entire job is to know where the claim lives — on three pages it
already listed. Only reading the pages found them.

**The check found what reading missed.** After widening the matcher for the fourth variant, it
immediately reported two more instances — one of them on a line of `integrate/index.html` that had
been read end to end minutes earlier. The other was on a page nobody had opened.

**So:** do not treat a passing check as coverage, and do not treat having read the page as
enumeration. A page is covered when a human has read it in a reader's order *and* every claim it
makes is inside a mechanism that will notice the next one. Convert what you find by reading into a
pattern **before** you finish the page, not after — the widened matcher is what caught the instance
the reading had just walked past.

Two corollaries, both bought the same way:

- **Put your own new prose inside the matcher.** A first fix in this session passed its base case for
  the wrong reason: the replacement wording tripped no pattern at all, so the control could not see
  the sentence just written to fix the claim. The wording you write to correct a claim is a new
  instance of that claim.
- **A sweep that found three variants is not evidence there was no fourth.** Keep widening from the
  site's own examples. Treat the pattern list as permanently incomplete.

## 9. Confirm a state by fetching the thing, never by reading a write's response

`app.agenticterminal.io` is behind a site-level Netlify password. The Netlify API **echoes
`password: false` back even on a successful write**, so a caller who confirms the lock by reading the
response it got is reading its own request back, not the state.

The general form: **a write's response is a claim about the request, not a measurement of the
result.** Where the state is externally observable, observe it — fetch the site, resolve the DID,
query the row. This is the same shape as [§7](#7-re-measure-immediately-before-writing-a-correction),
one layer down: re-measuring is useless if the instrument is the thing that just wrote.

Also true of a covered/uncovered list. On 2026-08-09 the audit handover's two lists held 33 pages and
`find . -name '*.html'` returned 38 — five pages on neither list, one of them edited by the branch
under review. **Derive the population with a command and diff it against the list.** A partition that
does not cover its domain fails by omission, so nothing ever looks wrong.

## 10. A marker that rewrites itself forward-dates every claim built around it

`data-engine-version="current"` markers are rewritten from the lockfile by
`scripts/sync-engine-version.mjs`. That is the point of them: eight hand-typed copies of a version
string disagreed within one day, and deriving the string is what stopped it.

**But a marker that updates itself carries every sentence around it forward with it, whether or not
those sentences are still true.** On 2026-08-09 two of them sat inside claims about a *measurement*:

> The hosted service reports `engine.running: "0.3.3"`; the package above is
> `<span data-engine-version="current">1.0.0-rc.6</span>`. **They agreed on every artifact tested.**

Bumping the lockfile to rc.10 would have rewritten the marker and left the verb alone, turning a true
statement about a comparison that was run into a false statement about a comparison that was not. The
sentence would still read as measured. Nothing would look wrong — that is the whole difficulty.

**So, when bumping anything a marker derives from:**

1. **Re-verify against the new value BEFORE the bump lands, not after.** If a verdict moves, that is a
   finding about the dependency, not about the site, and it stops the bump.
2. **Grep the marker and read the sentence it sits in.** Ask of each: is this a claim about the
   *current* thing, or a claim about something someone *did* to a specific version? The second kind is
   `historical`, or it needs re-running before the marker moves under it.
3. **A past-tense verb next to a self-updating marker is the tell.** "agreed", "was measured",
   "re-confirmed", "we tested". `sync-engine-version.mjs` already distinguishes `current` from
   `historical`; the trap is a sentence that is grammatically about the present and evidentially about
   the past.

Same family as [§7](#7-re-measure-immediately-before-writing-a-correction) and
[§9](#9-confirm-a-state-by-fetching-the-thing-never-by-reading-a-writes-response). The general form:
**automation that keeps one field true will happily make the sentence containing it false**, and the
better the automation, the less anyone re-reads the sentence.

### A precise name for an incomplete check is what makes the incompleteness invisible

The CI step that ran this check was called **"Engine version on the site matches the lockfile"**. That
was an exactly accurate description of the only comparison it made — and that accuracy is why nobody
went looking for a second one. A vague name invites a reader to check what it means; a precise name
that describes a subset closes the question.

**Name a check by what it establishes, and if it establishes less than its subject needs, say so in
the name.** The step is now "Engine version matches the lockfile AND what npm serves a reader".

## 11. Position decides what a claim means, and the summary is where a reader stops

Found three times on 2026-08-09, on three unrelated pages, always the same way round: **the confident
sentence above, the careful one below.**

| page | above | below |
|---|---|---|
| `crossrail.html` | two shared-budget claims | the section correcting them |
| `hermes-agents.html` | "The only path to a signed payment is through the gate" | "it trusts the agent to route payments through the gate in the first place" |
| `free-your-agent.html` | "It is shipped, running, and open" | a caption saying the hook is not in shipped Aqua |

In each case both sentences were on the page and neither was hidden. The defect is **ordering**, and
it is invisible to any check, because every individual sentence passes.

**Why it happens:** a correction gets written where the error was found — in the detail section, the
caption, the boundary note. The summary was written earlier, by someone confident, and nobody re-reads
a summary when correcting a detail.

**The rules:**

- **A caveat belongs at the altitude of the claim it qualifies.** A limit disclosed in a caption does
  not qualify a headline. If the summary makes the strong claim, the summary carries the limit.
- **Correct the summary last, deliberately, as its own step.** After fixing anything, re-read the
  page's opening and closing paragraphs and ask whether they still describe what the page now says.
  Those two are where a skimming reader forms and keeps their impression.
- **A page's strongest claim and its most careful sentence should be findable from each other.** If
  the honest version lives 400 lines below the confident one, link them or move one.

Corollary, and it is the reason this needs a rule rather than vigilance: **a page can be entirely
composed of true sentences and still mislead every reader who does not finish it.** That is family 3
in the audit taxonomy, and ordering is its most common form.

## 12. A model can survive the removal of every word that names it

§2f-pre records the escalation: phrase, then subject, then subject-as-previously-written. The answer
was to forbid the **stem** — `scor` catches score/scoring/scored/scores, `reputat` catches the rest.
That check works and it has held.

On 2026-08-09 the model turned up again anyway, on `agent.html`, wearing none of those words:

    Platinum   1000+ txns · 98%+ success rate
    Gold        100+ txns · 95%+ success rate
    Silver       10+ txns · 90%+ success rate
    Bronze       1+ verified transaction

A ladder of standing, earned by accumulated transaction count, displayed on a public agent profile.
That is the reputation model. It contains no forbidden stem, so the check could not see it, **and no
future vocabulary rule will catch the next one either** — the mechanism does not need a name.

**So the escalation has a fourth step: phrase, subject, stem, mechanism.** A stem check is a check on
what a page *says*. It cannot check what a page *does*.

**How to look for it.** Do not search for the concept's words. Ask, of any surface that ranks,
grades, tiers, badges, scores, sorts or gates by accumulated history:

- **What would a user do to move up this?** If the answer is "transact more", it is a reputation
  system regardless of what the labels say.
- **Does the ordering carry an implication of trustworthiness?** Bronze-to-Platinum does. So does a
  badge grid with unearned slots greyed out.
- **Would removing it change any decision the protocol makes?** If not, it is decoration that reads as
  a verdict — worse than a wrong number, because there is nothing to correct.

The same page also stated criteria nothing evaluated: the "98%+ success rate" half of each tier was
never computed anywhere, and the tier turned on the count alone. **A criterion published beside a
mark, which the mark does not depend on, is a mark never derived from anything** wearing the costume
of one that is.

## 13. Something correct and partial is harder to see than something absent

Three of the day's findings on 2026-08-09 have one shape, and it is the shape that beats a careful
reviewer:

| the control | why nobody looked further |
|---|---|
| the CI step named "Engine version on the site matches the lockfile" | exactly accurate about the only comparison it made |
| `technical-paper.html`'s editor's note | a note existed, exactly where the allowlist said one did — it just covered a different retired claim than the stem it exempts |
| `check-shared-copy`'s `claimPatterns` | real patterns, matching real instances, in the wrong case and the wrong vocabulary |

An **absent** control announces itself: the file is missing, the step does not exist, the list is
empty. A **partial** one answers the question you asked and stops you asking the next. Its correctness
is what closes the enquiry.

Related failure, same family: `positioning-paper.html` was allowlisted with the reason *"a dated
document. Annotate, do not rewrite"* and carried **no annotation at all**. An allowlist reason that
describes a control which does not exist is indistinguishable from a real exception.

**The rules:**

- **Check a control against its subject, not against its description.** The step name, the allowlist
  reason and the comment are claims about the control. Run it and see what it does.
- **When you find a control, ask what it does NOT cover** before crediting it. "There is an editor's
  note" is not the finding; "the editor's note covers X and this is Y" is.
- **When you write an exemption, name what the control actually does, and re-read it when the
  control changes.** Both allowlist reasons in this repo were written truthfully and became false
  without anyone editing them.

## 14. `git fetch` before you branch. Every control here reads the working tree, so a stale base is invisible

**Bought on 2026-08-13, and the defect reached the live site.**

`#48` merged at 09:15 MDT on 2026-08-10 giving `f89f24a`. `#49` merged **seventeen minutes later**
giving `f7a04c8`. Three days on, a corrections pass branched from local `master`, which was still
`f89f24a`, because nothing had run `git fetch` since. `git merge-base --is-ancestor f7a04c8 f89f24a`
returns false: the branch point was never `master`.

`#49` is the PR that replaced `tools/pec-verify`'s hardcoded single-credential `verify:local` with
`verify:local:all`. The pass added a sentence to `architecture.html` reading *"We run that check in
CI over one of the two"*, drafted deliberately against "master's tool" — the right instinct, applied
to a ref that was not master. It shipped, and it **understated the control by half**.

**Why nothing caught it.** Every control in this repository reads the working tree:
`check-shared-copy`, `verify-published-credentials`, `check-aip-sync` and `sync-engine-version` all
open files on disk. **None of them compares a local ref against its remote.** A stale base is not a
file, so it is not a thing any of them can see. The one control that reaches outside the repository,
`sync-engine-version`'s registry comparison, exists precisely because "our documents agree with each
other" is satisfiable by a consistently wrong pair — and a stale base is that same shape one layer
down: the working tree is internally consistent and consistent with the wrong parent.

It also failed in the direction [§13](#13-something-correct-and-partial-is-harder-to-see-than-something-absent)
names. Understating a control reads as caution. Nobody queries a sentence that claims less than the
truth, so it survives review that a wrong claim would not.

### The check that would have caught it

```bash
git fetch origin && git rev-parse HEAD origin/master
```

Two identical hashes means the base is current. Different hashes, before any branch is cut, is the
entire finding. Run it **before branching**, not before pushing: by push time the work is already
built on the wrong parent, and `git push` succeeds regardless because a branch from an old commit is
a perfectly valid branch.

**And when a correction describes a mechanism in this repository, read the mechanism on the ref you
are about to branch from, not on the ref you happen to have checked out.** The sentence above was
measured carefully against a real file; the file was three days old.
