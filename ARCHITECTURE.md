# Architecture Overview

## System Diagram

```
┌─────────────┐
│   Client    │
│  (curl/app) │
└──────┬──────┘
       │ POST /chat
       │ {prompt: "..."}
       ▼
┌──────────────────────────────────────────────┐
│      Cloudflare Worker (Edge Runtime)        │
│                                              │
│  ┌────────────────────────────────────────┐ │
│  │  1. Receive Request                    │ │
│  │     ↓                                  │ │
│  │  2. Generate Embedding                 │ │
│  │     (Workers AI: bge-base-en-v1.5)     │ │
│  │     ↓                                  │ │
│  │  3. Search Redis for Similar Vectors   │ │
│  │     ↓                                  │ │
│  │  4. Cache Hit?                         │ │
│  │     ├─ YES → Return Cached (fast!)     │ │
│  │     └─ NO → Continue                   │ │
│  │            ↓                           │ │
│  │  5. Call Workers AI (LLM inference)    │ │
│  │     ↓                                  │ │
│  │  6. Cache Response in Redis            │ │
│  │     ↓                                  │ │
│  │  7. Return Response to Client          │ │
│  └────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
         │                │
         │                │
    ┌────▼────┐      ┌────▼─────┐
    │ Redis   │      │ KV Store │
    │ (Upstash)│      │ (Stats)  │
    └─────────┘      └──────────┘
```

## Components

### 1. Cloudflare Worker (`src/index.ts`)

- **Purpose**: Main entry point and request router
- **Endpoints**:
  - `POST /chat` - Submit prompts for caching/inference
  - `GET /stats` - View cache statistics
  - `GET /health` - Health check
- **Responsibilities**:
  - Request validation
  - Route handling
  - Response formatting
  - Statistics tracking

### 2. Prompt Cache (`src/cache.ts`)

- **Purpose**: High-level caching logic
- **Features**:
  - Embedding generation
  - Similarity search orchestration
  - Cache storage
  - ID generation
- **Key Method**: `findSimilarCache()` - Searches for semantically similar prompts

### 3. Redis Vector Store (`src/redis.ts`)

- **Purpose**: Low-level Redis operations
- **Features**:
  - REST API communication with Upstash
  - Vector storage using RedisJSON
  - Cosine similarity computation
  - Brute-force vector search
- **Storage Format**:
  ```json
  {
    "prompt": "original text",
    "embedding": [0.1, 0.2, ...],
    "response": "LLM output",
    "timestamp": 1234567890,
    "model": "@cf/meta/llama-2-7b-chat-int8"
  }
  ```

### 4. Workers AI

- **Embedding Model**: `@cf/baai/bge-base-en-v1.5`
  - Converts text → 768-dimensional vector
  - Used for semantic similarity
- **LLM Model**: `@cf/meta/llama-2-7b-chat-int8` (default)
  - Generates responses for cache misses

### 5. Storage Layers

#### Redis (Upstash)

- **Purpose**: Vector embeddings + cached responses
- **Why Redis**: Fast key-value access, RedisJSON support
- **Format**: JSON documents with vector arrays

#### Cloudflare KV

- **Purpose**: Metadata (hit/miss counts)
- **Why KV**: Global edge distribution, simple counters

## Data Flow

### Cache Miss Flow (First Request)

```
1. Client → Worker: "What is AI?"
2. Worker → Workers AI: Generate embedding for "What is AI?"
3. Worker → Redis: Search similar vectors (threshold: 0.85)
4. Redis → Worker: No matches found
5. Worker → Workers AI: Generate response for "What is AI?"
6. Workers AI → Worker: "AI is artificial intelligence..."
7. Worker → Redis: Store (prompt, embedding, response)
8. Worker → Client: {response: "...", cached: false}
```

### Cache Hit Flow (Similar Request)

```
1. Client → Worker: "Can you explain AI?"
2. Worker → Workers AI: Generate embedding for "Can you explain AI?"
3. Worker → Redis: Search similar vectors
4. Redis → Worker: Found match! (similarity: 0.92)
5. Worker → Client: {response: "...", cached: true, similarity: 0.92}
```

## Performance Characteristics

| Scenario   | Latency   | Cost                          |
| ---------- | --------- | ----------------------------- |
| Cache Miss | 2-5s      | Full LLM inference            |
| Cache Hit  | 200-500ms | Embedding only (~10x cheaper) |

## Similarity Threshold

- **Default**: 0.85 (85% similarity)
- **Range**: 0.0 to 1.0
- **Impact**:
  - **Higher** (0.9+): Stricter matching, fewer hits
  - **Lower** (0.7-0.8): More hits, less precise

## Scalability Considerations

### Current Implementation (1-Hour Build)

- ✅ Good for: Up to ~1,000 cached prompts
- ⚠️ Limitation: Brute-force vector search (O(n))

### Production Optimizations

- Use Redis FT.SEARCH with HNSW indexes (O(log n))
- Implement cache eviction (TTL, LRU)
- Add multi-model support
- Implement request batching

## Security

### Current (v1.0)

- ❌ No authentication
- ✅ CORS enabled
- ✅ Input validation

### Recommended Additions

- API key authentication
- Rate limiting
- Request size limits
- IP allowlisting

## Cost Estimation

### Cloudflare Workers

- Free tier: 100,000 requests/day
- Paid: $0.50 per million requests

### Workers AI

- Free tier: 10,000 neurons/day
- Embeddings: ~5 neurons per request
- LLM inference: ~1,000+ neurons per request

### Redis (Upstash)

- Free tier: 10,000 commands/day
- Paid: Pay-as-you-go

### Example Savings

- 1,000 requests/day
- 70% cache hit rate
- **Cost reduction**: ~60% (embeddings vs. full inference)

## Extension Ideas

1. **Multi-model support**: Cache per model
2. **Streaming responses**: Server-sent events
3. **Analytics dashboard**: Visualize cache performance
4. **Smart eviction**: Remove old/unused entries
5. **Prompt preprocessing**: Normalize prompts before embedding
6. **Response post-processing**: Personalize cached responses

## File Structure

```
prompt-caching-infra/
├── src/
│   ├── index.ts       # Main worker entry point
│   ├── cache.ts       # Caching logic
│   ├── redis.ts       # Redis operations
│   └── types.ts       # TypeScript types
├── wrangler.toml      # Cloudflare config
├── package.json       # Dependencies
├── tsconfig.json      # TypeScript config
├── README.md          # Full documentation
├── QUICKSTART.md      # Setup guide
├── ARCHITECTURE.md    # This file
└── example-test.sh    # Testing script
```

## Tech Stack Summary

- **Runtime**: Cloudflare Workers (Edge)
- **Language**: TypeScript
- **LLM**: Cloudflare Workers AI
- **Vector DB**: Redis (Upstash)
- **Metadata**: Cloudflare KV
- **Deployment**: Wrangler CLI

Built for simplicity, designed for scale. 🚀
