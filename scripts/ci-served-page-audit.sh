#!/usr/bin/env bash
# DECLARES-COMPARES: {"repositoryHolds":["served-page-audit.mjs EXPECTED script hashes"],"worldSource":"https://observerprotocol.org/check as served","goesStaleWhen":"check.html changes and the deploy has not landed, or production is altered"}
# ^ Machine-readable. What this check holds against the world, and what makes it
#   stale. worldSource null is a DECLARATION, not an absence: it says both sides are
#   inside this repository. Read by scripts/check-declarations.mjs, which FAILS on any
#   CI-invoked check that carries no declaration.
#
# Runs served-page-audit.mjs from CI and maps its four exit codes onto the two a workflow
# step has. It exists because those are not the same shape, and collapsing them loses the
# distinction the audit was written to draw.
#
#   audit 0   what the page carries is what is expected and disclosed   -> step passes
#   audit 1   an established mismatch                                   -> step FAILS
#   audit 3   disclosed thing absent, single observation                -> step FAILS
#   audit 2   could not reach production                                -> step PASSES, loudly
#
# WHY 2 IS DIFFERENT FROM 1 AND 3, AND WHY IT MUST NOT BLOCK
# A `run:` step fails on any non-zero, so wiring the audit straight in would let a
# production outage redden a build that is reviewing a diff. That is a fact about the
# network, not about the diff, and a red build that means "someone else's host was down"
# teaches people that red means nothing.
#
# WHY IT MUST NOT PASS QUIETLY EITHER
# A skipped check that looks identical to a passed check is the same defect one layer up,
# in the display. So exit 2 writes to the job summary AND raises a workflow annotation,
# both of which appear on the run page without anyone opening a log. Green with a warning
# on the face of it is a different thing from green.
#
# NO --observations HERE, DELIBERATELY. A CI runner is ephemeral, so nothing it writes
# survives to the next run and absence could never be corroborated from here anyway.
# Corroboration is the scheduled copy's job, on a host that keeps its own file. What CI
# can say is "absent, and nobody has established that", which is exit 3, which fails.
#
#   scripts/ci-served-page-audit.sh [url] [extra audit args...]

set -uo pipefail

URL="${1:-https://observerprotocol.org/check}"
shift || true

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
out="$(mktemp)"

# ─── HOW OLD IS THE TIP THIS RUN IS AUDITING? ───────────────────────────────────────────────
# A failure here has two causes that look identical and want opposite responses:
#
#   the page and production genuinely disagree      -> investigate
#   the deploy of this very commit has not landed   -> wait and re-run
#
# The second is not hypothetical. This check fetches PRODUCTION, and a merge that changes an
# audited file makes production wrong for as long as the deploy takes. Nothing tells this
# repository when a deploy finished, so the check cannot know; what it CAN know is how long
# ago its own tip landed, which bounds how plausible the second cause is.
#
# THE THRESHOLD IS 120 SECONDS, DERIVED RATHER THAN CHOSEN:
#
#   13s   deploy duration, MEASURED 2026-08-24 on the #97 merge at 5-second resolution:
#         production served the old bytes at +8s and the new bytes at +13s.
#   42s   this workflow's latency from run start to reaching this step, checkout plus
#         `npm ci`, measured on the same run. The fetch happens ~44s after the merge, which
#         is why that merge never went red: the deploy had finished 31 seconds before
#         anything looked.
#   ~10x  margin on the deploy figure. IT IS ONE SAMPLE, on a Sunday, on a site with
#         `publish = "."` and no build step and a handful of changed files. Payload growth,
#         provider load and time of day are all unmeasured. A single sample does not get a
#         tight bound drawn around it.
#
# 13 x 10 rounded to 120 covers that margin and stays far below the interval a genuine
# mismatch persists for, which is until someone fixes it.
#
# IT DOES NOT PASS. A check that excused itself on a timer would be worse than the ambiguity
# it treats. The message narrows what a reader must consider; re-running settles it in under
# a minute. Being wrong about the cause costs one re-run. Being wrong about the verdict costs
# the check.
DEPLOY_WINDOW_SECONDS=120
tip_age() {
  local ts
  ts="$(git -C "$here/.." log -1 --format=%ct 2>/dev/null)" || return 1
  [ -n "$ts" ] || return 1
  echo $(( $(date +%s) - ts ))
}

deploy_window_note() {
  local age
  age="$(tip_age)" || return 0
  [ -n "$age" ] || return 0
  [ "$age" -lt "$DEPLOY_WINDOW_SECONDS" ] || return 0
  echo ""
  echo "  THIS TIP LANDED ${age}s AGO, UNDER THE ${DEPLOY_WINDOW_SECONDS}s DEPLOY WINDOW."
  echo ""
  echo "  This check fetches PRODUCTION. If this commit changed a file the audit covers,"
  echo "  production may still be serving the previous deploy, and this failure is the"
  echo "  window rather than a defect. Nothing tells this repository when a deploy"
  echo "  completed, so the check cannot rule it out and does not try."
  echo ""
  echo "  RE-RUN THIS JOB BEFORE INVESTIGATING. If it passes, it was the window. If it"
  echo "  fails again the mismatch is real and everything above stands."
  echo ""
  echo "  Threshold derived: 13s measured deploy on 2026-08-24, x10 margin because that is"
  echo "  ONE sample. This step is reached ~44s after a merge, so a post-merge failure will"
  echo "  usually fall inside the window and usually not be caused by it."
  summary "\n:hourglass: **The tip landed ${age}s ago, under the ${DEPLOY_WINDOW_SECONDS}s deploy window.** This check fetches production, which may still be serving the previous deploy. **Re-run this job before investigating.** It does not pass on this basis: a check that excused itself on a timer would be worse than the ambiguity it treats."
  annotate "::warning title=Possibly the deploy window::Tip landed ${age}s ago. Re-run this job before investigating; the audit fetches production and the deploy may not have landed."
}

node "$here/served-page-audit.mjs" "$URL" "$@" 2>&1 | tee "$out"
code="${PIPESTATUS[0]}"

# Both sinks are optional so this runs identically on a laptop.
summary() { [ -n "${GITHUB_STEP_SUMMARY:-}" ] && printf '%b\n' "$1" >> "$GITHUB_STEP_SUMMARY"; return 0; }
annotate() { [ -n "${GITHUB_ACTIONS:-}" ] && printf '%b\n' "$1"; return 0; }

case "$code" in
  0)
    summary "### Served page audit: clean\n\`$URL\` carries exactly what is expected and disclosed."
    echo "wrapper: audit exit 0, step passes"
    exit 0
    ;;
  2)
    summary "### :warning: Served page audit: NOT CHECKED\n\`$URL\` could not be reached, so **nobody looked**. This is not a pass and it is not a failure: it is a fact about the network rather than about this diff, so it does not block. The audit did not run against production on this build.\n\n\`\`\`\n$(head -3 "$out")\n\`\`\`"
    annotate "::warning title=Served page audit NOT CHECKED::$URL could not be reached. The audit did not run against production on this build. Not a pass."
    echo "wrapper: audit exit 2, reported NOT CHECKED, step passes without blocking"
    exit 0
    ;;
  3)
    summary "### Served page audit: absent, uncorroborated\nSomething \`$URL\` discloses is not in the response, on a single observation. That is not established: absence has two causes and this cannot tell them apart. Blocking, because the page and what it is served are out of step either way."
    annotate "::error title=Served page audit::Something disclosed is absent on a single observation. Not established, and still a mismatch between the page and what is served."
    deploy_window_note
    echo "wrapper: audit exit 3, step fails"
    exit 1
    ;;
  1)
    summary "### Served page audit: mismatch\n\`$URL\` carries something undisclosed, is missing one of its own scripts, or discloses something no longer served."
    annotate "::error title=Served page audit::What production serves is not what the page says it serves."
    deploy_window_note
    echo "wrapper: audit exit 1, step fails"
    exit 1
    ;;
  *)
    # An exit code nobody has assigned meaning to is not silently a pass.
    summary "### Served page audit: unrecognised exit $code\nThe audit returned an exit code this wrapper does not know. Treated as a failure, because an unmapped state must not be read as a clean one."
    annotate "::error title=Served page audit::Unrecognised exit code $code."
    echo "wrapper: audit exit $code is unmapped, step fails"
    exit 1
    ;;
esac
