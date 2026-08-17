#!/usr/bin/env bash
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
    echo "wrapper: audit exit 3, step fails"
    exit 1
    ;;
  1)
    summary "### Served page audit: mismatch\n\`$URL\` carries something undisclosed, is missing one of its own scripts, or discloses something no longer served."
    annotate "::error title=Served page audit::What production serves is not what the page says it serves."
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
