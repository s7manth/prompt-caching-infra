# AI Gateway Testing Guide

Complete guide to test your prompt caching infrastructure with Cloudflare AI Gateway integration.

## Prerequisites

Before testing, ensure you have:

- ✅ Upstash Redis account with RedisJSON enabled
- ✅ Cloudflare account with Workers AI access
- ✅ Cloudflare AI Gateway created
- ✅ API keys for providers you want to test (Anthropic, OpenAI, Google)
- ✅ Wrangler CLI installed

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Create AI Gateway

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Navigate to **AI** → **AI Gateway**
3. Click **Create Gateway**
4. Name it: `prompt-caching-infra-gateway`
5. Copy your **Account ID**

### 3. Configure Environment Variables

Create or update your `.dev.vars` file:

```bash
cat > .dev.vars << 'EOF'
# Redis Configuration
REDIS_URL=https://your-redis-instance.upstash.io
REDIS_TOKEN=your_redis_token_here
SIMILARITY_THRESHOLD=0.85

# Cloudflare AI Gateway Configuration
GATEWAY_ACCOUNT_ID=your_cloudflare_account_id
GATEWAY_NAME=prompt-caching-infra-gateway
CF_GATEWAY_TOKEN=your_cloudflare_gateway_token

# API Keys for External Providers (optional - only for providers you want to test)
ANTHROPIC_API_KEY=sk-ant-xxxxx
OPENAI_API_KEY=sk-xxxxx
GOOGLE_AI_STUDIO_TOKEN=xxxxx
EOF
```

**Note:** You only need to set API keys for the providers you plan to test.

### 4. Setup KV Namespace

```bash
npx wrangler kv:namespace create CACHE_STATS
```

Update the generated `id` in `wrangler.toml`.

### 5. Login to Cloudflare

```bash
npx wrangler login
```

## Local Testing

### Start Development Server

```bash
npm run dev
```

The server will start at `http://localhost:8787`

---

## Test 1: Health Check

```bash
curl http://localhost:8787/health
```

**Expected:**

```json
{ "status": "ok" }
```

---

## Test 2: Workers AI Model (Default)

### First Request (Cache Miss)

```bash
curl -X POST http://localhost:8787/chat \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "What is Cloudflare?",
    "model": "@cf/meta/llama-3.1-8b-instruct",
    "max_tokens": 100
  }'
```

**Expected:**

```json
{
  "response": "Cloudflare is a cloud-based service...",
  "cached": false,
  "timestamp": 1698172800000
}
```

### Second Request (Cache Hit)

```bash
curl -X POST http://localhost:8787/chat \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Tell me about Cloudflare",
    "model": "@cf/meta/llama-3.1-8b-instruct",
    "max_tokens": 100
  }'
```

**Expected:**

```json
{
  "response": "Cloudflare is a cloud-based service...",
  "cached": true,
  "similarity": 0.89,
  "timestamp": 1698172805000
}
```

---

## Test 3: Anthropic Claude Models

**Requires:** `ANTHROPIC_API_KEY` set in `.dev.vars`

### Test with Claude 3 Opus

```bash
curl -X POST http://localhost:8787/chat \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Explain quantum computing in simple terms",
    "model": "claude-3-opus-20240229",
    "max_tokens": 200,
    "temperature": 0.7
  }'
```

### Test with Claude 3.5 Sonnet

```bash
curl -X POST http://localhost:8787/chat \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "What are the benefits of edge computing?",
    "model": "claude-3-5-sonnet-20241022",
    "max_tokens": 150,
    "temperature": 0.7
  }'
```

### Test with anthropic/ prefix

```bash
curl -X POST http://localhost:8787/chat \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "How does AI work?",
    "model": "anthropic/claude-3-haiku-20240307",
    "max_tokens": 150
  }'
```

---

## Test 4: OpenAI GPT Models

**Requires:** `OPENAI_API_KEY` set in `.dev.vars`

### Test with GPT-4

```bash
curl -X POST http://localhost:8787/chat \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "What is machine learning?",
    "model": "gpt-4",
    "max_tokens": 150,
    "temperature": 0.7
  }'
```

### Test with GPT-3.5 Turbo

```bash
curl -X POST http://localhost:8787/chat \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Explain neural networks",
    "model": "gpt-3.5-turbo",
    "max_tokens": 150
  }'
```

### Test with openai/ prefix

```bash
curl -X POST http://localhost:8787/chat \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "What is deep learning?",
    "model": "openai/gpt-4-turbo-preview",
    "max_tokens": 150
  }'
```

---

## Test 5: Google Gemini Models

**Requires:** `GOOGLE_AI_STUDIO_TOKEN` set in `.dev.vars`

### Test with Gemini 1.5 Flash

```bash
curl -X POST http://localhost:8787/chat \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "What is generative AI?",
    "model": "gemini-1.5-flash",
    "max_tokens": 150,
    "temperature": 0.7
  }'
```

### Test with Gemini 1.5 Pro

```bash
curl -X POST http://localhost:8787/chat \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Explain large language models",
    "model": "gemini-1.5-pro",
    "max_tokens": 200
  }'
```

### Test with google/ prefix

```bash
curl -X POST http://localhost:8787/chat \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "What is prompt engineering?",
    "model": "google/gemini-1.5-flash",
    "max_tokens": 150
  }'
```

---

## Test 6: Cache Statistics

```bash
curl http://localhost:8787/stats
```

**Expected:**

```json
{
  "cacheSize": 8,
  "hits": 3,
  "misses": 5,
  "hitRate": "0.38"
}
```

---

## Test 7: Cross-Model Caching

Test if similar prompts across different models share cache:

```bash
# Request 1: Anthropic
curl -X POST http://localhost:8787/chat \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "What is artificial intelligence?",
    "model": "claude-3-opus-20240229",
    "max_tokens": 100
  }'

# Request 2: OpenAI (similar prompt)
curl -X POST http://localhost:8787/chat \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Explain artificial intelligence",
    "model": "gpt-4",
    "max_tokens": 100
  }'
```

Check if the second request gets a cache hit despite using a different model!

---

## Automated Testing Script

Create a test script for all providers:

```bash
cat > test-all-providers.sh << 'EOF'
#!/bin/bash

WORKER_URL="http://localhost:8787"

echo "======================================"
echo "AI Gateway Multi-Provider Test"
echo "======================================"
echo ""

# Test Workers AI
echo "1. Testing Workers AI (@cf/meta/llama-3.1-8b-instruct)..."
curl -s -X POST "$WORKER_URL/chat" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "What is Cloudflare Workers?",
    "model": "@cf/meta/llama-3.1-8b-instruct",
    "max_tokens": 100
  }' | jq '.cached, .response[:100]'
echo ""

# Test Anthropic
echo "2. Testing Anthropic (claude-3-haiku-20240307)..."
curl -s -X POST "$WORKER_URL/chat" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "What is edge computing?",
    "model": "claude-3-haiku-20240307",
    "max_tokens": 100
  }' | jq '.cached, .response[:100]'
echo ""

# Test OpenAI
echo "3. Testing OpenAI (gpt-3.5-turbo)..."
curl -s -X POST "$WORKER_URL/chat" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "What is serverless?",
    "model": "gpt-3.5-turbo",
    "max_tokens": 100
  }' | jq '.cached, .response[:100]'
echo ""

# Test Google
echo "4. Testing Google (gemini-1.5-flash)..."
curl -s -X POST "$WORKER_URL/chat" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "What is AI inference?",
    "model": "gemini-1.5-flash",
    "max_tokens": 100
  }' | jq '.cached, .response[:100]'
echo ""

# Check stats
echo "5. Cache Statistics:"
curl -s "$WORKER_URL/stats" | jq .
echo ""

echo "======================================"
echo "Test Complete!"
echo "======================================"
EOF

chmod +x test-all-providers.sh
./test-all-providers.sh
```

---

## Monitoring AI Gateway

### View Gateway Analytics

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Navigate to **AI** → **AI Gateway**
3. Select your gateway: `prompt-caching-infra-gateway`
4. View:
   - Request volume
   - Request by provider
   - Token usage
   - Latency metrics
   - Cost tracking

### Watch Stats in Real-Time

```bash
watch -n 5 'curl -s http://localhost:8787/stats | jq'
```

---

## Performance Testing

Compare cache hit vs miss performance:

```bash
# First request (cache miss)
time curl -X POST http://localhost:8787/chat \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "What is blockchain technology?",
    "model": "gpt-4",
    "max_tokens": 150
  }'

# Similar request (cache hit)
time curl -X POST http://localhost:8787/chat \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Explain blockchain",
    "model": "gpt-4",
    "max_tokens": 150
  }'
```

**Expected:** Cache hits should be 5-10x faster!

---

## Production Deployment

### Set Production Secrets

```bash
# Gateway Configuration
npx wrangler secret put GATEWAY_ACCOUNT_ID
npx wrangler secret put GATEWAY_NAME
npx wrangler secret put CF_GATEWAY_TOKEN

# Provider API Keys
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put GOOGLE_AI_STUDIO_TOKEN

# Redis
npx wrangler secret put REDIS_URL
npx wrangler secret put REDIS_TOKEN
```

### Deploy

```bash
npm run deploy
```

### Test Production

```bash
WORKER_URL="https://prompt-caching-infra.your-subdomain.workers.dev"

curl -X POST $WORKER_URL/chat \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "What is Cloudflare?",
    "model": "claude-3-5-sonnet-20241022",
    "max_tokens": 150
  }'
```

---

## Troubleshooting

### Error: "API key not configured for provider: anthropic"

- Set the `ANTHROPIC_API_KEY` in `.dev.vars`
- Or use a different model that doesn't require that provider

### Error: "Gateway configuration missing"

- Ensure `GATEWAY_ACCOUNT_ID` and `GATEWAY_NAME` are set
- Check that the gateway exists in your Cloudflare dashboard

### Error: "Cannot find module '@google/generative-ai'"

- Run `npm install` to install all dependencies

### Gateway Protected Access Denied

- Set the `CF_GATEWAY_TOKEN` in `.dev.vars`
- Get the token from your Cloudflare AI Gateway settings

### Models not routing correctly

- Check model prefix (`@cf/`, `anthropic/`, `openai/`, `google/`, `claude-`, `gpt-`, `gemini-`)
- View logs in terminal for routing information

---

## Expected Performance

| Metric                 | Workers AI | External Providers |
| ---------------------- | ---------- | ------------------ |
| Cache miss latency     | 1-3s       | 2-8s               |
| Cache hit latency      | 200-500ms  | 200-500ms          |
| Cost per cache miss    | ~$0.01     | $0.01-$0.10        |
| Cost per cache hit     | ~$0.001    | ~$0.001            |
| Potential cost savings | 60-90%     | 60-90%             |

---

## Next Steps

1. ✅ Monitor cache hit rates per provider
2. ✅ Adjust similarity threshold for optimal caching
3. ✅ Set up rate limiting for production
4. ✅ Configure TTL for cache expiration
5. ✅ Add authentication/API keys for your API
6. ✅ Set up monitoring and alerting

Happy testing! 🚀
