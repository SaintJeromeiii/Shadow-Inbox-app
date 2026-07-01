#!/usr/bin/env bash
# Production smoke tests for Shadow Inbox relay.
# Usage: ./scripts/smoke-test-production.sh [base_url]

set -euo pipefail

BASE_URL="${1:-https://shadow-inbox-production.up.railway.app}"
PASS=0
FAIL=0

check_get() {
  local name="$1"
  local url="$2"
  local expect="${3:-200}"
  shift 3 2>/dev/null || shift 2

  status="$(curl -s -o /tmp/shadow-smoke-body.json -w "%{http_code}" "$@" "$url")"
  if [[ "$status" == "$expect" ]]; then
    echo "✓ $name ($status)"
    PASS=$((PASS + 1))
  else
    echo "✗ $name (expected $expect, got $status)"
    cat /tmp/shadow-smoke-body.json 2>/dev/null || true
    echo
    FAIL=$((FAIL + 1))
  fi
}

check_post_json() {
  local name="$1"
  local url="$2"
  local body="$3"
  local expect="${4:-200}"

  status="$(curl -s -o /tmp/shadow-smoke-body.json -w "%{http_code}" \
    -X POST "$url" \
    -H "Content-Type: application/json" \
    -d "$body")"
  if [[ "$status" == "$expect" ]]; then
    echo "✓ $name ($status)"
    PASS=$((PASS + 1))
  else
    echo "✗ $name (expected $expect, got $status)"
    cat /tmp/shadow-smoke-body.json 2>/dev/null || true
    echo
    FAIL=$((FAIL + 1))
  fi
}

echo "Shadow Inbox smoke test → $BASE_URL"
echo

check_get "Health" "$BASE_URL/health"
check_get "Landing page" "$BASE_URL/docs/"
check_get "Privacy page" "$BASE_URL/docs/privacy.html"
check_get "Triage status (personal)" "$BASE_URL/api/triage/status"
check_get "AI usage (personal)" "$BASE_URL/api/user/ai-usage"
check_get "AI usage (public test user)" "$BASE_URL/api/user/ai-usage" "200" \
  -H "x-account-key: smoke-test-user"

check_post_json "Waitlist signup" "$BASE_URL/api/waitlist/signup" \
  '{"email":"smoke-test@shadow-inbox.invalid"}'

check_post_json "Quick replies missing context" "$BASE_URL/api/replies/generate" \
  '{}' "400"

check_post_json "Redraft missing fields" "$BASE_URL/api/emails/redraft" \
  '{"emailId":"test"}' "400"

echo
echo "Results: $PASS passed, $FAIL failed"

if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi

echo "All smoke checks passed."
