# Hand carriage to Atlas: the served-page audit

Under `scripts/`, which `netlify.toml` 404s, so this file is not published. That is
deliberate and it is the same ruling that keeps the audit itself unserved.

## The file

| | |
|---|---|
| **file** | `scripts/served-page-audit.mjs` |
| **AUDIT_VERSION** | `3.1.0` |
| **AUDIT_SHA256** (self-hash, recorded in the file) | `590b0ae5dcf5b96bda2c67215a5339877e4d3455afefd35b5a475186d60b0dc0` |
| **sha256 of the file on disk** | `30deda31d2ac2158f8843a995e791d49c85d5287efef911cf651f99015f9a9f0` |
| **size** | 18,933 bytes |
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
# expect 30deda31d2ac2158f8843a995e791d49c85d5287efef911cf651f99015f9a9f0

node served-page-audit.mjs --version
# expect version 3.1.0 and recorded == computed
```

`recorded != computed` means the copy was edited and its header was not updated. Both
agreeing but differing from the value above means it is a different version of the file.

## The daily invocation

```bash
node served-page-audit.mjs https://observerprotocol.org/check \
  --disclose=cloudflareinsights \
  --observations=/var/lib/op-audit/observations.json
```

`--disclose=cloudflareinsights` is correct **while the beacon is live**. It says: the page
discloses this and its presence is expected.

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

## When the toggle is flipped, this invocation starts failing. That is the point.

The beacon is disclosed. When Cloudflare Web Analytics is turned off at the zone, the
beacon stops being injected, and the disclosure becomes a description of something that is
not there.

So the sequence you should expect is:

1. **exit 3** on the first run after the flip. Absent, one observation, nothing
   established. The audit writes down when it first saw the absence.
2. **exit 3** on any run less than 60 minutes after that first sighting.
3. **exit 1** on the first run at least 60 minutes after it, reported as
   `absent and corroborated`.

**That exit 1 is the intended signal, not a break to repair.** It is the audit reporting
that the page now discloses a beacon that is no longer served, which is a copy defect on
the page rather than a fault in the monitor. The repair is on the website side: the
disclosure paragraph comes off `/check`, the strong sentence goes back to its full form,
and `--disclose=cloudflareinsights` comes out of this invocation. All three together, in
one change.

Until that happens, leave the invocation exactly as it is. Removing `--disclose` early
would make the audit assert the page loads nothing while the page still says it loads a
beacon, which is the same defect pointing the other way.

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
