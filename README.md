# Prompt Caching Infrastructure

A lightweight, semantic prompt caching system built with Cloudflare Workers, Workers AI, and Redis vector search. This infrastructure caches LLM responses based on semantic similarity, reducing costs and latency for similar prompts.

## Architecture

- **Cloudflare Worker**: Serverless proxy that intercepts AI requests
- **Workers AI**: Generates embeddings and LLM responses
- **Redis (Upstash)**: Vector storage for semantic similarity search
- **Cloudflare KV**: Metadata storage for cache statistics

## Features

- 🚀 Semantic caching using vector similarity
- ⚡ Sub-second cache hits
- 🎯 Configurable similarity threshold (default: 0.85)
- 📊 Built-in cache statistics
- 🔧 Simple REST API

## Setup

### 1. Prerequisites

- Node.js 18+ and npm
- Cloudflare account (Workers AI enabled)
- Upstash Redis account (free tier works)

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Upstash Redis

1. Create a free Redis database at [upstash.com](https://upstash.com)
2. Enable **RedisJSON** and **RediSearch** in the database settings
3. Copy the REST API credentials (URL and token)

### 4. Create Cloudflare KV Namespace

```bash
npx wrangler kv:namespace create CACHE_STATS
```

Copy the generated `id` and update `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "CACHE_STATS"
id = "your_generated_id_here"
```

### 5. Set Environment Secrets

```bash
npx wrangler secret put REDIS_URL
# Paste your Upstash REST URL (e.g., https://xxx.upstash.io)

npx wrangler secret put REDIS_TOKEN
# Paste your Upstash REST token
```

### 6. Deploy

```bash
npm run deploy
```

Or run locally:

```bash
npm run dev
```

## API Usage

### POST /chat

Send a prompt and get a response (cached or fresh).

**Request:**

```bash
curl -X POST https://your-worker.workers.dev/chat \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "What is the capital of France?",
    "model": "@cf/meta/llama-2-7b-chat-int8",
    "max_tokens": 256,
    "temperature": 0.7
  }'
```

**Response:**

```json
{
  "response": "The capital of France is Paris.",
  "cached": false,
  "timestamp": 1698172800000
}
```

For cache hits:

```json
{
  "response": "The capital of France is Paris.",
  "cached": true,
  "similarity": 0.92,
  "timestamp": 1698172805000
}
```

### GET /stats

Get cache statistics.

```bash
curl https://your-worker.workers.dev/stats
```

**Response:**

```json
{
  "cacheSize": 42,
  "hits": 156,
  "misses": 58,
  "hitRate": "0.73"
}
```

### GET /health

Health check endpoint.

```bash
curl https://your-worker.workers.dev/health
```

## Configuration

Edit `wrangler.toml` to customize:

```toml
[vars]
SIMILARITY_THRESHOLD = "0.85"  # Higher = stricter matching (0.0-1.0)
```

## How It Works

1. **Request arrives** → Worker receives prompt
2. **Generate embedding** → Convert prompt to vector using `@cf/baai/bge-base-en-v1.5`
3. **Search cache** → Query Redis for similar vectors (cosine similarity)
4. **Cache hit?**
   - **Yes** → Return cached response (fast!)
   - **No** → Call Workers AI, cache result, return response

## Testing

Test the caching behavior:

```bash
# First request (cache miss)
curl -X POST http://localhost:8787/chat \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Explain quantum computing"}'

# Similar request (cache hit)
curl -X POST http://localhost:8787/chat \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Can you explain quantum computing?"}'
```

Check the `cached` field in responses!

## Performance

- **Cache miss**: ~2-5s (full LLM inference)
- **Cache hit**: ~200-500ms (embedding + vector search)
- **Cost savings**: ~90% reduction on cache hits

## Limitations (1-Hour Build)

- Brute-force vector search (not optimized for >1000 entries)
- No authentication
- Single model support
- No streaming responses
- Basic error handling

## Future Enhancements

- [ ] Implement Redis FT.SEARCH for optimized vector indexes
- [ ] Add API key authentication
- [ ] Support multiple models
- [ ] Streaming support
- [ ] TTL for cache entries
- [ ] Advanced analytics dashboard
- [ ] Rate limiting

## License

MIT

## Credits

Built with ❤️ using Cloudflare Workers and Upstash Redis.
