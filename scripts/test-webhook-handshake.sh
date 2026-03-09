#!/bin/bash
# Prueba GET /webhook (handshake de Meta)
# Uso: ./test-webhook-handshake.sh [BASE_URL] [VERIFY_TOKEN]

BASE_URL="${1:-http://localhost:4000}"
TOKEN="${2:-${WHATSAPP_WEBHOOK_VERIFY_TOKEN:-test_token}}"
CHALLENGE="challenge_123"

echo "Probando GET /webhook..."
echo "URL: $BASE_URL/webhook?hub.mode=subscribe&hub.verify_token=$TOKEN&hub.challenge=$CHALLENGE"
echo ""

RESP=$(curl -s -w "\n%{http_code}" "$BASE_URL/webhook?hub.mode=subscribe&hub.verify_token=$TOKEN&hub.challenge=$CHALLENGE")
BODY=$(echo "$RESP" | head -n -1)
CODE=$(echo "$RESP" | tail -n 1)

if [ "$CODE" = "200" ] && [ "$BODY" = "$CHALLENGE" ]; then
  echo "OK: Handshake correcto (200, challenge devuelto)"
  exit 0
else
  echo "FAIL: HTTP $CODE, body=$BODY"
  exit 1
fi
