#!/bin/bash
# Prueba /health y opcionalmente /health?db=1
BASE_URL="${1:-http://localhost:4000}"

echo "GET $BASE_URL/health"
curl -s -o /dev/null -w "HTTP %{http_code}\n" "$BASE_URL/health"

echo "GET $BASE_URL/health?db=1"
curl -s -o /dev/null -w "HTTP %{http_code}\n" "$BASE_URL/health?db=1"
