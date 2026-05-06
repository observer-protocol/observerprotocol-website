#!/bin/bash
# verify-did-resolution.sh
#
# Reusable verification for did:web resolution at observerprotocol.org.
# Run this after any change to:
#   - netlify.toml (especially /agents/* redirect rules)
#   - /.well-known/did.json
#   - the agents.html page
#   - api.observerprotocol.org's /agents/{id}/did.json or /.well-known/did.json endpoints
#
# Per W3C did:web spec, both did:web:observerprotocol.org and
# did:web:observerprotocol.org:agents:{id} MUST resolve via apex URLs:
#   https://observerprotocol.org/.well-known/did.json
#   https://observerprotocol.org/agents/{id}/did.json
#
# Exits 0 only if all checks pass. Non-zero on any failure.
#
# Usage:
#   ./verify-did-resolution.sh                  # default test agent
#   ./verify-did-resolution.sh <AGENT_ID>       # custom agent

set -u

# Default test agent: confirmed real, public, served by observer-api on FutureBit
TEST_AGENT="${1:-00a292ac00d4c671dd5a29c22b29f548}"
APEX="https://observerprotocol.org"
UNIRESOLVER="https://dev.uniresolver.io/1.0/identifiers"

PASS=0
FAIL=0

green()  { printf '\033[32m%s\033[0m' "$1"; }
red()    { printf '\033[31m%s\033[0m' "$1"; }
gray()   { printf '\033[90m%s\033[0m' "$1"; }

pass() { echo "$(green '  PASS') $1"; PASS=$((PASS+1)); }
fail() { echo "$(red '  FAIL') $1"; echo "        $2"; FAIL=$((FAIL+1)); }

check_json() {
  # check_json <url> <description> <required-jq-expression>
  local url="$1" desc="$2" jq_expr="$3"
  local body http_code
  http_code=$(curl -sS -o /tmp/did-verify-body.txt -w '%{http_code}' --max-time 15 -H 'Accept: application/json' "$url" 2>&1)
  body=$(cat /tmp/did-verify-body.txt)
  if [ "$http_code" != "200" ]; then
    fail "$desc" "HTTP $http_code from $url"
    return 1
  fi
  if ! echo "$body" | python3 -c 'import json,sys; json.loads(sys.stdin.read())' 2>/dev/null; then
    local first_chars
    first_chars=$(echo "$body" | head -c 80 | tr '\n' ' ')
    fail "$desc" "response is not valid JSON. First 80 chars: $first_chars"
    return 1
  fi
  if ! echo "$body" | python3 -c "import json,sys; d=json.loads(sys.stdin.read()); $jq_expr" 2>/dev/null; then
    fail "$desc" "JSON missing required structure ($jq_expr)"
    return 1
  fi
  pass "$desc"
  return 0
}

echo "================================================================"
echo "did:web resolution verification — $(date -Iseconds)"
echo "Apex:        $APEX"
echo "Test agent:  $TEST_AGENT"
echo "================================================================"
echo ""
echo "── 1. OP issuer DID document on apex (/.well-known/did.json) ──"
check_json \
  "$APEX/.well-known/did.json" \
  "OP issuer DID is JSON with required W3C fields" \
  'assert d["id"] == "did:web:observerprotocol.org"; assert "verificationMethod" in d; assert any(vm.get("type") == "Ed25519VerificationKey2020" for vm in d["verificationMethod"])'

echo ""
echo "── 2. Agent DID document on apex (/agents/{id}/did.json) ──"
check_json \
  "$APEX/agents/$TEST_AGENT/did.json" \
  "Agent DID is JSON with id matching agent" \
  "assert d['id'] == 'did:web:observerprotocol.org:agents:$TEST_AGENT'; assert 'verificationMethod' in d"

echo ""
echo "── 3. /agents/{id}/did.json must NOT serve HTML ──"
ct=$(curl -sSI --max-time 15 "$APEX/agents/$TEST_AGENT/did.json" | grep -i '^content-type:' | tr -d '\r' | awk '{print $2}')
if echo "$ct" | grep -qi 'application/json\|application/did'; then
  pass "Content-Type is JSON ($ct)"
else
  fail "Content-Type is JSON" "got Content-Type: $ct (expected application/json or application/did)"
fi

echo ""
echo "── 4. Human page /agents/{id} (no trailing /did.json) still serves the registry UI ──"
human_body=$(curl -sS --max-time 15 "$APEX/agents/$TEST_AGENT" | head -c 500)
if echo "$human_body" | grep -qi '<!doctype html\|<html'; then
  pass "Human path serves HTML"
else
  fail "Human path serves HTML" "first 500 chars: $human_body"
fi

echo ""
echo "── 5. External resolution via dev.uniresolver.io (OP issuer DID) ──"
ur_body=$(curl -sS --max-time 30 "$UNIRESOLVER/did:web:observerprotocol.org" 2>&1)
if echo "$ur_body" | python3 -c 'import json,sys; d=json.loads(sys.stdin.read()); assert d.get("didDocument",{}).get("id") == "did:web:observerprotocol.org"' 2>/dev/null; then
  pass "External resolver returns valid OP issuer DID"
else
  err=$(echo "$ur_body" | python3 -c 'import json,sys; d=json.loads(sys.stdin.read()); print(d.get("didResolutionMetadata",{}).get("error",{}).get("detail","(no detail)"))' 2>/dev/null)
  fail "External resolver returns valid OP issuer DID" "uniresolver error: $err"
fi

echo ""
echo "── 6. External resolution via dev.uniresolver.io (agent DID) ──"
agent_did="did:web:observerprotocol.org:agents:$TEST_AGENT"
ur_body=$(curl -sS --max-time 30 "$UNIRESOLVER/$agent_did" 2>&1)
if echo "$ur_body" | python3 -c "import json,sys; d=json.loads(sys.stdin.read()); assert d.get('didDocument',{}).get('id') == '$agent_did'" 2>/dev/null; then
  pass "External resolver returns valid agent DID"
else
  err=$(echo "$ur_body" | python3 -c 'import json,sys; d=json.loads(sys.stdin.read()); print(d.get("didResolutionMetadata",{}).get("error",{}).get("detail","(no detail)"))' 2>/dev/null)
  fail "External resolver returns valid agent DID" "uniresolver error: $err"
fi

echo ""
echo "================================================================"
if [ "$FAIL" -eq 0 ]; then
  echo "$(green "  $PASS / $((PASS+FAIL)) passed")"
  echo "  did:web resolution is healthy."
  exit 0
else
  echo "$(red "  $FAIL / $((PASS+FAIL)) failed") — $(green "$PASS passed")"
  echo "  did:web resolution is NOT healthy. See failures above."
  exit 1
fi
