#!/usr/bin/env bash
# Ensures the mobile app never bundles OpenAI credentials or direct API calls.
# Usage: ./scripts/verify-no-client-openai.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FAIL=0

fail() {
  echo "✗ $1"
  FAIL=$((FAIL + 1))
}

pass() {
  echo "✓ $1"
}

echo "Checking client bundle for OpenAI leaks…"
echo

if rg -q 'EXPO_PUBLIC_OPENAI' "$ROOT/src" "$ROOT/app.config.ts" "$ROOT/app.json" 2>/dev/null; then
  fail "EXPO_PUBLIC_OPENAI found in client source or app config"
else
  pass "No EXPO_PUBLIC_OPENAI in src/ or app config"
fi

if rg -q 'OPENAI_API_KEY|sk-proj-|sk-[A-Za-z0-9]{20,}' "$ROOT/src" 2>/dev/null; then
  fail "OpenAI API key pattern found in src/"
else
  pass "No API key patterns in src/"
fi

if rg -q 'api\.openai\.com' "$ROOT/src" 2>/dev/null; then
  fail "Direct openai.com URL in src/ (AI must go through relay)"
else
  pass "No direct openai.com URLs in src/"
fi

if [[ -f "$ROOT/.env" ]] && rg -q '^EXPO_PUBLIC_OPENAI' "$ROOT/.env" 2>/dev/null; then
  fail "EXPO_PUBLIC_OPENAI* set in local .env — remove and rebuild"
else
  pass "No EXPO_PUBLIC_OPENAI in .env"
fi

echo
if [[ "$FAIL" -gt 0 ]]; then
  echo "$FAIL check(s) failed."
  exit 1
fi

echo "All client OpenAI checks passed (AI relay-only)."
