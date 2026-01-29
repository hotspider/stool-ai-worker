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
grep -iE "x-worker-version|x-proxy-version|x-openai-model|schema_version|x-request-id" "$RESP_HEADERS" || true

echo ""
echo "=== Response JSON (key fields) ==="
python3 - <<'PY'
import json
import sys
from pathlib import Path

body = Path(sys.argv[1]).read_text(encoding="utf-8")
data = json.loads(body)
keys = ["is_stool_image", "headline", "error_code", "stool_confidence", "stool_scene", "stool_form_hint"]
print({k: data.get(k) for k in keys})
PY
"$RESP_BODY"

echo ""
echo "请在另一个终端执行："
echo "  npx wrangler tail stool-ai-worker --format=pretty"
echo "观察日志中的 [DETECT] 与 [DETECT_DECISION]。"

rm -f "$RESP_HEADERS" "$RESP_BODY"
