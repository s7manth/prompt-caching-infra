#!/bin/bash

# Example test script for prompt caching infrastructure
# Replace YOUR_WORKER_URL with your actual worker URL

WORKER_URL="http://localhost:8787"  # Use your deployed URL in production

echo "==================================="
echo "Prompt Caching Infrastructure Test"
echo "==================================="
echo ""

# Test 1: Health check
echo "1. Testing health endpoint..."
curl -s "$WORKER_URL/health" | jq .
echo ""

# Test 2: First request (cache miss)
echo "2. Sending first request (should be cache miss)..."
curl -s -X POST "$WORKER_URL/chat" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "What is the capital of France?",
    "max_tokens": 100
  }' | jq .
echo ""

# Test 3: Similar request (cache hit)
echo "3. Sending similar request (should be cache hit)..."
sleep 1
curl -s -X POST "$WORKER_URL/chat" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Tell me the capital city of France",
    "max_tokens": 100
  }' | jq .
echo ""

# Test 4: Another different request (cache miss)
echo "4. Sending different request (should be cache miss)..."
curl -s -X POST "$WORKER_URL/chat" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Explain how photosynthesis works",
    "max_tokens": 150
  }' | jq .
echo ""

# Test 5: Check cache statistics
echo "5. Checking cache statistics..."
curl -s "$WORKER_URL/stats" | jq .
echo ""

echo "==================================="
echo "Test complete!"
echo "==================================="

