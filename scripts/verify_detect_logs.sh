#!/usr/bin/env bash
set -euo pipefail

IMAGE_PATH="${1:-$HOME/Desktop/test.jpg}"

if [ ! -f "$IMAGE_PATH" ]; then
  echo "未找到图片：$IMAGE_PATH"
  echo "请传入图片路径：./scripts/verify_detect_logs.sh /path/to/image.jpg"
  exit 1
fi

BASE64_IMAGE="$(base64 -i "$IMAGE_PATH" | tr -d '\n')"

RESP_HEADERS="$(mktemp)"
RESP_BODY="$(mktemp)"

curl -sS -D "$RESP_HEADERS" -o "$RESP_BODY" -X POST "https://api.tapgiga.com/analyze" \
  -H "Content-Type: application/json" \
  -H "User-Agent: verify-detect-logs/1.0" \
  -d "{\"image\":\"$BASE64_IMAGE\",\"age_months\":30,\"odor\":\"none\",\"pain_or_strain\":false,\"diet_keywords\":\"banana\",\"context\":{\"foods_eaten\":\"米饭,香蕉\",\"drinks_taken\":\"温水\",\"mood_state\":\"精神好\",\"other_notes\":\"无\"}}"

echo "=== Response headers ==="
grep -iE "x-worker-version|x-proxy-version|x-openai-model|schema_version|x-request-id|x-build-id" "$RESP_HEADERS" || true

echo ""
echo "=== Response raw body (first 400 chars) ==="
head -c 400 "$RESP_BODY" || true
echo ""
echo ""
echo "=== Response JSON (key fields) ==="
if command -v jq >/dev/null 2>&1; then
  jq '{ok, error_code, error, message, is_stool_image, confidence, model_used, proxy_version, worker_version, stool_confidence, stool_scene, stool_form_hint}' "$RESP_BODY" || cat "$RESP_BODY"
else
  echo "jq 未安装，打印原文："
  cat "$RESP_BODY"
fi

echo ""
echo "请在另一个终端执行："
echo "  npx wrangler tail stool-ai-worker --format=pretty"
echo "观察日志中的 [DETECT] 与 [DETECT_DECISION]。"

rm -f "$RESP_HEADERS" "$RESP_BODY"
