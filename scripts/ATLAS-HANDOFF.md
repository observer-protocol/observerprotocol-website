# Hand carriage to Atlas: the served-page audit

Under `scripts/`, which `netlify.toml` 404s, so this file is not published. That is
deliberate and it is the same ruling that keeps the audit itself unserved.

## The file

| | |
|---|---|
| **file** | `scripts/served-page-audit.mjs` |
| **AUDIT_VERSION** | `3.4.0` |
| **AUDIT_SHA256** (self-hash, recorded in the file) | `d5c71cfca0231993f3dcd0745d0aef56b73f6896cd6c2f6d9226d25357d1f2ce` |
| **sha256 of the file on disk** | `161831b652c8038018ec6c983b9489b37c8a4bd7393a4116f272c670b0a8a38e` |
| **size** | 19,624 bytes |
| **confirmed under** | Node **v22.22.3** on darwin |
| **needs** | a Node with global `fetch` (18+). No npm install, no dependencies, no checkout. |

**Two different hashes, and they answer different questions.** `AUDIT_SHA256` is computed
over the file with its own hash line normalised away, so it does not change when the
recorded value is written in. It is what `--version` prints and what tells you two copies
are the same file. The plain sha256 of the bytes on disk is what you check a transfer with.

### Carry it, do not fetch it

The scheduler holds its own copy. It must not pull the script from the zone it is
watching: a monitor that downloads itself from its own subject cannot report that the
subject is compromised.

### Confirm the copy arrived intact

```bash
shasum -a 256 served-page-audit.mjs
# expect 161831b652c8038018ec6c983b9489b37c8a4bd7393a4116f272c670b0a8a38e

node served-page-audit.mjs --version
# expect version 3.4.0 and recorded == computed
```

`recorded != computed` means the copy was edited and its header was not updated. Both
agreeing but differing from the value above means it is a different version of the file.

## The daily invocation

```bash
node served-page-audit.mjs https://observerprotocol.org/check \
  --observations=/var/lib/op-audit/observations.json
```

**Nothing is disclosed, and that is the invocation rather than an omission.** With no
`--disclose` the audit asserts that the page carries its own two scripts and nothing else,
so the absence of the analytics injection is *proven on every run* instead of having been
asserted once in a paragraph. The day anything is added at the edge, this goes red without
anyone having to remember what used to be there.

`--observations` is a small JSON file the audit reads and writes. It is how a later run
corroborates what an earlier one saw. Give it a path that survives between runs.

### Exit codes, which are the whole interface

| code | meaning | what to do |
|---|---|---|
| `0` | what the page carries is exactly what is expected and disclosed | nothing |
| `1` | a mismatch, established | look. See below for the one that is expected. |
| `2` | could not reach the page | **not a pass.** Nobody looked. Alert differently from 1. |
| `3` | something disclosed is absent, on a single observation | **not a pass and not the signal.** It will resolve itself into 0 or 1 on the next run. |

Do not collapse 2 and 3 into "failed", and do not treat either as "passed". A scheduler
that maps everything non-zero to one alarm throws away the distinction this file exists
to draw.

## What happened, and what the invocation used to be

Until 17 August 2026 this ran with `--disclose=cloudflareinsights`, because the CDN was
adding an analytics script to every HTML response on the zone and `/check` disclosed it.
The setting was disabled on 17 August. Two runs an hour apart, on 17 and 18 August, both
found it absent; on the second the audit reported `absent and corroborated` and exited 1,
which was the intended signal rather than a break.

The repair was three edits made together on the website side: the disclosure paragraph
came off `/check`, the strong sentence went back to its full form, and `--disclose` came
out of this invocation. Nothing here should now return 1 in the disclosed-but-absent
direction, because nothing is disclosed.

**If a red result appears, it means something was added.** That is what the invocation is
now shaped to find.

### Why 60 minutes, and why corroboration at all

Absence has two causes and one observation cannot separate them: the setting was changed,
or the edge transiently did not inject. The first is the thing being waited for; the
second means nothing. Corroboration across time is the cheapest thing that tells them
apart.

It is also why a clean run **does not by itself** authorise the website change. That needs
all three of:

1. the operator states the toggle was flipped
2. two runs at least 60 minutes apart, both corroborating the absence
3. the CDN's own status page showing the dashboard incident resolved

Condition 3 is not ceremony. While the dashboard is in an incident the toggle cannot be
flipped at all, so an absence observed during one is evidence about the incident and not
about the setting.

## What this establishes, and what it does not

It reads markup. It executes nothing. **So it reports what was delivered, not what is
performed.** It sees every script the page carries, external or inline, and it cannot see
what any of them does once it runs. A runtime request made by a script that is already
disclosed is outside it.

An earlier version read only external references, and an inline script issuing a request
on load came back clean and printed that the page loaded nothing. That is why inline is
adjudicated now, and why this paragraph is here rather than left to be discovered.

## If the page legitimately changes

The audit carries the sha256 of `check.html`'s own inline scripts, so that a **removal** of
the page's verifier fails as loudly as an injection. Those hashes go stale when the page
is edited, and the tempting repair is to delete the entry, which silently removes the
positive assertion.

Do not. In the repository, `scripts/check-audit-expectations.mjs` recomputes them and fails
the build with the new values to paste in. Carry the updated file to Atlas afterwards and
re-check both hashes above.
