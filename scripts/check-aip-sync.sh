#!/usr/bin/env bash
# The website serves protocol artifacts. `aip` is where they are authored. This refuses when the
# two disagree.
#
# WHY THIS EXISTS. On 2026-08-05 `aip`'s key-scoping.json was found three versions behind what this
# repository serves -- scoping_version 1 against 4, roughly three months. It was not only stale: it
# still published a custody claim that production had already RETRACTED, and it documented three of
# six keys. It survived that long because there were two originals and nothing compared them. The
# reconciliation was the easy part; this is the part that stops it recurring.
#
# ONE ORIGINAL, ONE COPY, CHECKED. `aip` authors. This repository serves. When they differ, this
# fails, and the fix is to change `aip` and re-copy -- never to edit the copy here, which is exactly
# how the drift started.
#
# WHAT IT DOES NOT COVER, PRINTED EVERY RUN RATHER THAN DOCUMENTED ONCE. Only artifacts with an
# entry in MAP below are compared. Everything else this repository serves under schemas/ or
# .well-known/ has NO upstream in `aip` and this repository IS its original -- including
# .well-known/did.json, the DID document. Those are listed as UNMAPPED on every run so the gap
# stays visible. An unmapped file is not a failure; an unmapped file nobody knows about is.
set -uo pipefail

AIP_RAW="https://raw.githubusercontent.com/observer-protocol/aip/main"
FAIL=0
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

# website-path  ->  aip-path. NOT an identity mapping: key-scoping and the worldid schemas live at
# the root of `aip` and under a directory here, and a check that assumed identity would silently
# compare nothing.
MAP="
.well-known/key-scoping.json|key-scoping.json
schemas/delegation/v2.json|schemas/delegation/v2.json
schemas/delegation/v2.1.json|schemas/delegation/v2.1.json
schemas/delegation/v2.2.json|schemas/delegation/v2.2.json
schemas/delegation/v2.3.json|schemas/delegation/v2.3.json
schemas/delegation/v2.4.json|schemas/delegation/v2.4.json
schemas/delegation/v2.5.json|schemas/delegation/v2.5.json
schemas/delegation/v2.6.json|schemas/delegation/v2.6.json
schemas/worldid-linkage/v1.json|worldid-linkage-v1.json
schemas/worldid-linkage/v2.json|worldid-linkage-v2.json
"

echo "== artifacts authored in aip and served here =="
while IFS='|' read -r here there; do
  [ -n "$here" ] || continue
  if [ ! -f "$here" ]; then
    echo "  MISSING HERE  $here (mapped to aip:$there but absent from this repository)"; FAIL=1; continue
  fi
  # A FAILED FETCH MUST NOT READ AS AN EMPTY FILE. Curl's exit status is checked before the bytes
  # are hashed: on 2026-08-05 a suppressed fetch failure hashed to the empty-string digest and was
  # reported as drift on a file that was in fact identical.
  if ! curl -fsSL --max-time 25 "$AIP_RAW/$there" -o "$TMP/upstream"; then
    echo "  FETCH FAILED  aip:$there could not be retrieved -- comparison NOT performed"; FAIL=1; continue
  fi
  if cmp -s "$here" "$TMP/upstream"; then
    echo "  OK            $here"
  else
    echo "  DRIFT         $here != aip:$there"
    echo "                aip is the original. Change it there and re-copy; do not edit this copy."
    FAIL=1
  fi
done <<< "$MAP"

echo
echo "== served here with NO original in aip (this repository IS the original) =="
mapped="$(printf '%s' "$MAP" | cut -d'|' -f1 | grep . || true)"
found_unmapped=0
while IFS= read -r f; do
  [ -n "$f" ] || continue
  if ! printf '%s\n' "$mapped" | grep -qxF "$f"; then
    echo "  UNMAPPED      $f"; found_unmapped=1
  fi
done <<< "$(find schemas .well-known -type f 2>/dev/null | sed 's|^\./||' | sort)"
[ "$found_unmapped" = 0 ] && echo "  (none)"
echo
echo "  Unmapped files are NOT a failure. They are artifacts this repository owns outright, and the"
echo "  list is printed so that stays a decision rather than an oversight. If one of them should be"
echo "  authored in aip -- .well-known/did.json is the obvious candidate -- move it there and add a"
echo "  MAP entry, and this check starts holding it."

echo
if [ "$FAIL" -eq 0 ]; then echo "AIP SYNC OK"; else echo "AIP SYNC FAILED"; fi
exit "$FAIL"
