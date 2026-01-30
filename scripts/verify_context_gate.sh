#!/usr/bin/env bash
set -euo pipefail

IMG_PATH="${1:-$HOME/Desktop/test.jpg}"

if [[ ! -f "$IMG_PATH" ]]; then
  echo "缺少测试图片：$IMG_PATH"
  exit 1
fi

B64="$(base64 -i "$IMG_PATH" | tr -d '\n')"

run_case() {
  local label="$1"
  local with_context="$2"
  local body_file
  local header_file
  body_file="$(mktemp)"
  header_file="$(mktemp)"

  if [[ "$with_context" == "yes" ]]; then
    curl -sS -D "$header_file" -o "$body_file" \
      -X POST "https://api.tapgiga.com/analyze" \
      -H "Content-Type: application/json" \
      -d "{\"image\":\"$B64\",\"age_months\":30,\"odor\":\"none\",\"pain_or_strain\":false,\"diet_keywords\":\"banana\",\"mode\":\"prod\",\"context\":{\"foods_eaten\":\"香蕉\",\"drinks_taken\":\"温水\",\"mood_state\":\"精神好\",\"other_notes\":\"无\"}}"
  else
    curl -sS -D "$header_file" -o "$body_file" \
      -X POST "https://api.tapgiga.com/analyze" \
      -H "Content-Type: application/json" \
      -d "{\"image\":\"$B64\",\"age_months\":30,\"odor\":\"none\",\"pain_or_strain\":false,\"diet_keywords\":\"banana\",\"mode\":\"prod\"}"
  fi

  echo "=== Case $label headers ==="
  grep -iE 'x-request-id:|x-worker-git:|x-proxy-version:|x-openai-model:|schema_version:' "$header_file" || true

  echo "=== Case $label body key fields ==="
  if command -v jq >/dev/null 2>&1; then
    jq '{ok,is_stool_image,error_code,image_validation,worker_version,proxy_version}' "$body_file"
  else
    cat "$body_file"
  fi

  if [[ "$label" == "A" ]]; then
    local err_code
    if command -v jq >/dev/null 2>&1; then
      err_code="$(jq -r '.error_code // ""' "$body_file" 2>/dev/null || echo "")"
    else
      err_code=""
    fi
    if [[ "$err_code" != "MISSING_CONTEXT" ]]; then
      echo "FAIL: Case A 期望 MISSING_CONTEXT，但得到 '$err_code'"
      exit 1
    fi
  else
    local err_code
    if command -v jq >/dev/null 2>&1; then
      err_code="$(jq -r '.error_code // ""' "$body_file" 2>/dev/null || echo "")"
    else
      err_code=""
    fi
    if [[ "$err_code" == "MISSING_CONTEXT" ]]; then
      echo "FAIL: Case B 不应返回 MISSING_CONTEXT"
      exit 1
    fi
  fi

  rm -f "$body_file" "$header_file"
}

run_case "A" "no"
run_case "B" "yes"

echo "PASS: verify_context_gate.sh"
