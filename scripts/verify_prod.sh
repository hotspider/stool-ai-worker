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
  local confirmed="$2"
  local body_file
  local header_file
  body_file="$(mktemp)"
  header_file="$(mktemp)"

  curl -sS -D "$header_file" -o "$body_file" \
    -X POST "https://api.tapgiga.com/analyze" \
    -H "Content-Type: application/json" \
    -d "{\"image\":\"$B64\",\"age_months\":30,\"odor\":\"none\",\"pain_or_strain\":false,\"diet_keywords\":\"banana\",\"user_confirmed_stool\":$confirmed}"

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
    if [[ "$err_code" == "NOT_STOOL_IMAGE" ]]; then
      echo "FAIL: Case A 返回 NOT_STOOL_IMAGE"
      exit 1
    fi
  fi

  rm -f "$body_file" "$header_file"
}

run_case "A" "true"
run_case "B" "false"

echo "PASS: verify_prod.sh"
