#!/usr/bin/env bash
# ─── build-site.sh: the publish directory is BUILT, and shipping a file is a decision ───────
#
# Until 2026-08-25 netlify.toml said `publish = "."`, so the publish directory was the
# repository and every tracked file shipped to observerprotocol.org unless a forced-404 rule
# named it. That was a denylist: a new .md, .csv, .sh or .py was public the moment it merged,
# and nothing looked broken when it happened. Three ArcadiaB social exports, an internal repo
# map and a site-upgrade guide went through exactly that gap (measured 2026-08-06).
#
# This script builds `_site/` from an ALLOWLIST and netlify.toml publishes `_site/`. A file
# reaches the domain only if it is (a) a web file at the repository root, by extension, or
# (b) inside a directory named below. A new root file of any other kind, or a new directory,
# is not served until someone adds it here, in a commit, on purpose.
#
# WHAT THIS DOES NOT DECIDE. A file placed inside an allowlisted directory ships, whatever it
# is: verify-samples/README.md ships on purpose, and a notes.md dropped into credentials/ would
# ship by the same rule. The directory list is the decision boundary, not the file.
#
# WHAT IT REPORTS. Every tracked file it did NOT ship is printed, so the build log says what
# was withheld rather than leaving it to be noticed. And it refuses outright if anything of a
# non-web kind (csv, py, sh, mjs, toml, lockfile, env, key material) reached the output, so a
# mistake in the allowlist fails the build instead of shipping.
#
# Usage: tools/build-site.sh [OUT]      OUT defaults to <repo>/_site (untracked, .gitignore'd)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/_site}"

# ─── THE ALLOWLIST ────────────────────────────────────────────────────────────────────────
# Directories copied whole (regular files only, dotfiles skipped, node_modules never).
DIRS=(
  .well-known
  blog
  credentials
  genesis
  institutional
  integrate
  ows
  papers
  results
  schemas
  spec
  status-lists
  test-issuers
  verify-samples
)
# Root-level files, by extension. Nothing else at the root ships.
ROOT_EXT='html|css|png|jpg|jpeg|gif|svg|ico|webp|xml|txt'
# Extensions that must never appear anywhere in the output. A second guard, not the mechanism.
REFUSE_EXT='csv|py|sh|mjs|cjs|toml|yml|yaml|env|pem|key|lock'

case "$OUT" in "$ROOT"/*) ;; *) echo "build-site: OUT must be inside the repository: $OUT" >&2; exit 2;; esac
rm -rf "$OUT"
mkdir -p "$OUT"

shipped=0
# (a) root files by extension
for f in "$ROOT"/*; do
  [ -f "$f" ] || continue
  b="$(basename "$f")"
  case "$b" in .*) continue;; esac
  if printf '%s' "$b" | grep -Eq "\.($ROOT_EXT)$"; then
    cp -p "$f" "$OUT/$b"; shipped=$((shipped+1))
  fi
done
# (b) allowlisted directories
for d in "${DIRS[@]}"; do
  if [ ! -d "$ROOT/$d" ]; then echo "build-site: allowlisted directory absent: $d" >&2; exit 2; fi
  while IFS= read -r -d '' f; do
    rel="${f#"$ROOT"/}"
    case "$rel" in */node_modules/*|node_modules/*) continue;; esac
    mkdir -p "$OUT/$(dirname "$rel")"
    cp -p "$f" "$OUT/$rel"; shipped=$((shipped+1))
  done < <(find "$ROOT/$d" -type f ! -name '.*' -print0)
done

# ─── REFUSE non-web kinds in the output ────────────────────────────────────────────────────
bad="$(cd "$OUT" && find . -type f | grep -E "\.($REFUSE_EXT)$" || true)"
if [ -n "$bad" ]; then
  echo "build-site: REFUSED, non-web files reached the output:" >&2
  printf '  %s\n' $bad >&2
  exit 1
fi

# ─── REPORT what was withheld ──────────────────────────────────────────────────────────────
echo "build-site: shipped $shipped file(s) to ${OUT#"$ROOT"/}/"
if git -C "$ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  withheld=0
  while IFS= read -r t; do
    [ -f "$OUT/$t" ] || { [ $withheld -eq 0 ] && echo "build-site: tracked and NOT shipped:"; echo "  $t"; withheld=$((withheld+1)); }
  done < <(git -C "$ROOT" ls-files)
  echo "build-site: withheld $withheld tracked file(s)."
else
  echo "build-site: not a git checkout here, so the withheld list is not derivable; nothing is reported."
fi
