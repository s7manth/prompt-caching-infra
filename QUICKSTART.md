# Quick Start Guide (Under 10 Minutes)

Get your prompt caching infrastructure running in under 10 minutes!

## Step-by-Step Setup

### 1. Install Dependencies (1 min)

```bash
npm install
```

### 2. Setup Upstash Redis (3 min)

1. Go to [console.upstash.com](https://console.upstash.com)
2. Create a new Redis database (free tier)
3. **Important**: Enable **RedisJSON** in the database settings
4. Copy the **REST API** credentials:
   - UPSTASH_REDIS_REST_URL
   - UPSTASH_REDIS_REST_TOKEN

### 3. Setup Cloudflare (3 min)

```bash
# Login to Cloudflare
npx wrangler login

# Create KV namespace
npx wrangler kv:namespace create CACHE_STATS
```

Copy the generated `id` from output and update in `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "CACHE_STATS"
id = "paste_your_id_here"
```

### 4. Configure Secrets (1 min)

```bash
# Set Redis URL
npx wrangler secret put REDIS_URL
# Paste: https://your-instance.upstash.io

# Set Redis Token
npx wrangler secret put REDIS_TOKEN
# Paste: Your Upstash token
```

### 5. Deploy! (1 min)

```bash
# Deploy to Cloudflare
npm run deploy
```

You'll get a URL like: `https://prompt-caching-infra.your-subdomain.workers.dev`

## Test It Out

```bash
# Test with your deployed URL
curl -X POST https://your-worker.workers.dev/chat \
  -H "Content-Type: application/json" \
  -d '{"prompt": "What is machine learning?"}'

# Send a similar prompt (should cache hit!)
curl -X POST https://your-worker.workers.dev/chat \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Can you explain machine learning?"}'
```

Check the `cached` field in the response!

## Local Development

For local testing:

1. Create `.dev.vars` file:

```bash
cp .dev.vars.example .dev.vars
# Edit .dev.vars with your Redis credentials
```

2. Run locally:

```bash
npm run dev
```

3. Test at `http://localhost:8787`

## Troubleshooting

### "Redis error" when testing

- Verify RedisJSON is enabled in Upstash
- Check credentials in secrets

### "AI binding not found"

- Ensure Workers AI is enabled in your Cloudflare account
- Check `wrangler.toml` has `[ai]` binding

### "KV namespace not found"

- Run `npx wrangler kv:namespace create CACHE_STATS`
- Update the `id` in `wrangler.toml`

## Next Steps

- Check cache stats: `GET /stats`
- Adjust similarity threshold in `wrangler.toml`
- Add authentication (API keys)
- Monitor cache hit rates

Enjoy your semantic prompt cache! 🚀
