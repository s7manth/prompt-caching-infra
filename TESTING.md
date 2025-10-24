# Testing Guide

Complete guide to test your prompt caching infrastructure.

## Prerequisites

Before testing, ensure you have:

- ✅ Upstash Redis account with RedisJSON enabled
- ✅ Cloudflare account with Workers AI access
- ✅ Wrangler CLI installed

## Setup Commands

### 1. Install Dependencies

```bash
npm install
```

### 2. Setup Upstash Redis

1. Go to [console.upstash.com](https://console.upstash.com)
2. Create a Redis database (free tier works)
3. Enable **RedisJSON** in settings
4. Copy REST API URL and Token

### 3. Configure Local Development

Create `.dev.vars` file:

```bash
cat > .dev.vars << 'EOF'
REDIS_URL=https://your-redis-instance.upstash.io
REDIS_TOKEN=your_redis_token_here
SIMILARITY_THRESHOLD=0.85
EOF
```

Replace with your actual Redis credentials.

### 4. Create KV Namespace

```bash
npx wrangler kv:namespace create CACHE_STATS
```

Copy the generated `id` and update in `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "CACHE_STATS"
id = "your_generated_id_here"
```

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

### Test 1: Health Check

```bash
curl http://localhost:8787/health
```

Expected output:

```json
{ "status": "ok" }
```

### Test 2: First Request (Cache Miss)

```bash
curl -X POST http://localhost:8787/chat \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "What is the capital of France?",
    "max_tokens": 100
  }'
```

Expected output (takes 2-5 seconds):

```json
{
  "response": "The capital of France is Paris...",
  "cached": false,
  "timestamp": 1698172800000
}
```

Note: `"cached": false` means this was a fresh LLM call.

### Test 3: Similar Request (Cache Hit)

```bash
curl -X POST http://localhost:8787/chat \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Tell me the capital city of France",
    "max_tokens": 100
  }'
```

Expected output (takes <1 second):

```json
{
  "response": "The capital of France is Paris...",
  "cached": true,
  "similarity": 0.92,
  "timestamp": 1698172805000
}
```

Note: `"cached": true` and `"similarity": 0.92` indicates a cache hit!

### Test 4: Different Request (Cache Miss)

```bash
curl -X POST http://localhost:8787/chat \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Explain how photosynthesis works",
    "max_tokens": 150
  }'
```

Expected: `"cached": false` (new topic, not cached)

### Test 5: Cache Statistics

```bash
curl http://localhost:8787/stats
```

Expected output:

```json
{
  "cacheSize": 2,
  "hits": 1,
  "misses": 2,
  "hitRate": "0.33"
}
```

## Automated Testing Script

Run the provided test script:

```bash
chmod +x example-test.sh
./example-test.sh
```

This runs all tests sequentially and shows results.

## Production Deployment

### Set Production Secrets

```bash
# Set Redis URL
npx wrangler secret put REDIS_URL
# Paste: https://your-instance.upstash.io

# Set Redis Token
npx wrangler secret put REDIS_TOKEN
# Paste: Your token
```

### Deploy to Cloudflare

```bash
npm run deploy
```

You'll get a URL like: `https://prompt-caching-infra.your-subdomain.workers.dev`

### Test Production Deployment

Replace `http://localhost:8787` with your deployed URL:

```bash
WORKER_URL="https://prompt-caching-infra.your-subdomain.workers.dev"

# Health check
curl $WORKER_URL/health

# Test caching
curl -X POST $WORKER_URL/chat \
  -H "Content-Type: application/json" \
  -d '{"prompt": "What is machine learning?"}'
```

## Advanced Testing

### Test Different Models

```bash
curl -X POST http://localhost:8787/chat \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Explain quantum computing",
    "model": "@cf/meta/llama-2-7b-chat-int8",
    "max_tokens": 200,
    "temperature": 0.5
  }'
```

### Test Similarity Threshold

Send increasingly different prompts to see where caching stops:

```bash
# Original
curl -X POST http://localhost:8787/chat \
  -H "Content-Type: application/json" \
  -d '{"prompt": "What is AI?"}'

# Very similar (should cache hit)
curl -X POST http://localhost:8787/chat \
  -H "Content-Type: application/json" \
  -d '{"prompt": "What is artificial intelligence?"}'

# Somewhat similar (might cache hit)
curl -X POST http://localhost:8787/chat \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Explain AI technology"}'

# Different (should cache miss)
curl -X POST http://localhost:8787/chat \
  -H "Content-Type: application/json" \
  -d '{"prompt": "What is quantum physics?"}'
```

### Performance Testing

Measure response times:

```bash
# First request (cache miss)
time curl -X POST http://localhost:8787/chat \
  -H "Content-Type: application/json" \
  -d '{"prompt": "What is blockchain?"}'

# Second similar request (cache hit)
time curl -X POST http://localhost:8787/chat \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Explain blockchain technology"}'
```

Compare the times - cache hits should be ~5-10x faster!

## Troubleshooting

### Error: "Redis error: Unauthorized"

- Check your Redis URL and token in `.dev.vars`
- Verify credentials are correct in Upstash dashboard

### Error: "Failed to fetch AI"

- Ensure Workers AI is enabled in your Cloudflare account
- Check you're on a paid plan or within free tier limits

### Error: "KV namespace not found"

- Create the KV namespace: `npx wrangler kv:namespace create CACHE_STATS`
- Update the ID in `wrangler.toml`

### No cache hits when expected

- Check the similarity threshold (default: 0.85)
- Verify Redis is storing data: check Upstash dashboard
- Try more similar prompts

### TypeScript errors

- Run `npm install` to install dependencies
- Restart your IDE/TypeScript server

## Monitoring

### Watch Cache Performance

```bash
watch -n 5 'curl -s http://localhost:8787/stats | jq'
```

This displays cache stats every 5 seconds.

### Check Redis Data

In Upstash dashboard:

1. Go to Data Browser
2. Run: `KEYS cache:*`
3. View cached entries: `JSON.GET cache:12345`

## Performance Benchmarks

Expected results:

| Metric             | Target    | Notes                |
| ------------------ | --------- | -------------------- |
| Cache miss latency | 2-5s      | Full LLM inference   |
| Cache hit latency  | 200-500ms | Embedding only       |
| Cache hit rate     | 50-80%    | With similar prompts |
| Cost savings       | 60-90%    | Depends on hit rate  |

## Clean Up

To clear all cached data:

```bash
# In Upstash dashboard, run:
# KEYS cache:* | XARGS DEL

# Or via API (destructive!):
curl -X POST "https://your-redis.upstash.io" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '["FLUSHDB"]'
```

## Next Steps

After successful testing:

1. ✅ Monitor cache hit rates
2. ✅ Adjust similarity threshold based on accuracy
3. ✅ Add authentication for production use
4. ✅ Set up monitoring/alerting
5. ✅ Implement cache eviction (TTL)

Happy caching! 🚀
