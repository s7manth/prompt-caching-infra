# Quick Command Reference

Essential commands to get started quickly.

## Setup (5 minutes)

```bash
# 1. Install dependencies
npm install

# 2. Login to Cloudflare
npx wrangler login

# 3. Create KV namespace
npx wrangler kv:namespace create CACHE_STATS
# Copy the id and update wrangler.toml

# 4. Create .dev.vars file
cat > .dev.vars << 'EOF'
REDIS_URL=https://your-redis.upstash.io
REDIS_TOKEN=your_redis_token
SIMILARITY_THRESHOLD=0.85
EOF
# Replace with your actual Redis credentials from Upstash
```

## Local Development

```bash
# Start dev server
npm run dev

# Server runs at: http://localhost:8787
```

## Test Commands (Local)

```bash
# Health check
curl http://localhost:8787/health

# Send a prompt (cache miss)
curl -X POST http://localhost:8787/chat \
  -H "Content-Type: application/json" \
  -d '{"prompt": "What is the capital of France?"}'

# Send similar prompt (cache hit)
curl -X POST http://localhost:8787/chat \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Tell me the capital city of France"}'

# Check cache stats
curl http://localhost:8787/stats
```

## Deploy to Production

```bash
# Set secrets (only needed once)
npx wrangler secret put REDIS_URL
npx wrangler secret put REDIS_TOKEN

# Deploy
npm run deploy

# You'll get a URL like:
# https://prompt-caching-infra.your-subdomain.workers.dev
```

## Test Production

```bash
# Replace with your actual worker URL
WORKER_URL="https://your-worker.workers.dev"

# Test
curl -X POST $WORKER_URL/chat \
  -H "Content-Type: application/json" \
  -d '{"prompt": "What is machine learning?"}'
```

## Run Test Script

```bash
chmod +x example-test.sh
./example-test.sh
```

## Check Cache Stats

```bash
# View stats
curl http://localhost:8787/stats | jq

# Continuous monitoring (updates every 5 seconds)
watch -n 5 'curl -s http://localhost:8787/stats | jq'
```

## Useful Wrangler Commands

```bash
# View logs (after deployment)
npx wrangler tail

# List KV namespaces
npx wrangler kv:namespace list

# List secrets
npx wrangler secret list

# Delete worker
npx wrangler delete
```

## Response Format

### Cache Miss

```json
{
  "response": "The capital of France is Paris.",
  "cached": false,
  "timestamp": 1698172800000
}
```

### Cache Hit

```json
{
  "response": "The capital of France is Paris.",
  "cached": true,
  "similarity": 0.92,
  "timestamp": 1698172805000
}
```

### Stats

```json
{
  "cacheSize": 42,
  "hits": 156,
  "misses": 58,
  "hitRate": "0.73"
}
```

## Troubleshooting Quick Fixes

```bash
# Redis connection issues
# → Check .dev.vars has correct REDIS_URL and REDIS_TOKEN

# KV namespace not found
npx wrangler kv:namespace create CACHE_STATS
# → Update id in wrangler.toml

# TypeScript errors
npm install
# → Restart IDE

# Clear cache (in Upstash dashboard)
# → Run: KEYS cache:* then DEL <keys>
```

## Performance Expectations

- **Cache miss**: 2-5 seconds (full LLM call)
- **Cache hit**: 200-500ms (embedding only)
- **Speedup**: 5-10x faster on cache hits
- **Cost savings**: 60-90% on cached requests

---

For detailed documentation, see:

- `README.md` - Full documentation
- `QUICKSTART.md` - Step-by-step setup
- `TESTING.md` - Comprehensive testing guide
- `ARCHITECTURE.md` - System architecture
