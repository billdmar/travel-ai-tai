#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://localhost:8000}"
PASSED=0
FAILED=0

check() {
  local method="$1"
  local endpoint="$2"
  local expected="$3"
  local body="${4:-}"

  local url="${BASE_URL}${endpoint}"
  local status

  if [[ "$method" == "POST" ]]; then
    status=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
      -H "Content-Type: application/json" \
      -d "$body" \
      "$url")
  else
    status=$(curl -s -o /dev/null -w "%{http_code}" "$url")
  fi

  if [[ "$status" == "$expected" ]]; then
    echo "PASS  $method $endpoint -> $status"
    ((PASSED++))
  else
    echo "FAIL  $method $endpoint -> $status (expected $expected)"
    ((FAILED++))
  fi
}

echo "=== Smoke Test: ${BASE_URL} ==="
echo ""

check GET  /health 200
check GET  /ready 200
check GET  /docs 200
check GET  /openapi.json 200
check GET  /api/v1/destinations/curated 200
check POST /api/v1/destinations/recommend 200 '{"hobbies":["hiking"]}'
check POST /api/v1/preferences/validate 200 '{"destination":"Tokyo","start_date":"2026-08-01","end_date":"2026-08-05","budget":"medium","interests":["culture"]}'
check POST /api/v1/itineraries 201 '{"destination":"Tokyo","start_date":"2026-08-01","end_date":"2026-08-05","budget":"medium","interests":["culture"]}'
check GET  "/api/v1/images?query=kyoto" 200

echo ""
echo "=== Summary: ${PASSED} passed, ${FAILED} failed ==="

if [[ "$FAILED" -gt 0 ]]; then
  exit 1
fi
exit 0
