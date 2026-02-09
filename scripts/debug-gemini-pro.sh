#!/bin/bash
set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

if [ -z "$ANTIGRAVITY_REFRESH_TOKEN" ]; then
  echo -e "${RED}Error: ANTIGRAVITY_REFRESH_TOKEN is not set.${NC}"
  exit 1
fi

BASE_URL="http://localhost:8000/v1/chat/completions"

test_model_raw() {
  local model_input=$1
  local desc=$2
  
  echo -e "\n${YELLOW}Testing: ${desc} (Model: ${model_input})...${NC}"

  payload=$(cat <<EOF
{
  "model": "$model_input",
  "messages": [{"role": "user", "content": "Hi"}],
  "stream": false
}
EOF
)

  response=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$BASE_URL" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $ANTIGRAVITY_REFRESH_TOKEN" \
    -d "$payload")

  http_status=$(echo "$response" | grep "HTTP_STATUS" | cut -d':' -f2)
  body=$(echo "$response" | grep -v "HTTP_STATUS")

  if [ "$http_status" -eq 200 ]; then
    echo -e "${GREEN}SUCCESS (HTTP 200)${NC}"
    echo "Response snippet: $(echo "$body" | head -c 150)..."
  else
    echo -e "${RED}FAILED (HTTP $http_status)${NC}"
    # Extract error message for clarity
    echo "$body" | grep -o '"message": "[^"]*"' | head -1
  fi
}

# 1. Standard approach (known to fail 403)
test_model_raw "gemini-3-pro" "Standard Gemini 3 Pro (expect 403)"

# 2. Prefix approach (Hypothesis: needs 'antigravity-' prefix)
test_model_raw "antigravity-gemini-3-pro-low" "Prefix Hypothesis (antigravity-gemini-3-pro-low)"

