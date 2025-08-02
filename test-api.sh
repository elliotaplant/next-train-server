#!/bin/bash

# Simple wrapper for curl to test the API endpoints
# Usage: ./test-api.sh <endpoint> [jq-filter]

BASE_URL="${BASE_URL:-http://localhost:8787}"
ENDPOINT="$1"
JQ_FILTER="${2:-.}"

if [ -z "$ENDPOINT" ]; then
    echo "Usage: $0 <endpoint> [jq-filter]"
    echo "Example: $0 /api/transit/agencies"
    echo "Example: $0 '/api/transit/stops?agency=actransit&route=1T' '.stops[:3]'"
    exit 1
fi

# Make the request
curl -s "${BASE_URL}${ENDPOINT}" | jq "${JQ_FILTER}"