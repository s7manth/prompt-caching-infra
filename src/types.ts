// TypeScript types for the prompt caching system

export interface Env {
  AI: any; // Cloudflare Workers AI binding
  CACHE_STATS: KVNamespace; // KV for metadata
  REDIS_URL: string; // Upstash Redis REST URL
  REDIS_TOKEN: string; // Upstash Redis token
  SIMILARITY_THRESHOLD?: string; // Configurable threshold
}

export interface ChatRequest {
  prompt: string;
  model?: string;
  max_tokens?: number;
  temperature?: number;
}

export interface ChatResponse {
  response: string;
  cached: boolean;
  similarity?: number;
  timestamp: number;
}

export interface CachedEntry {
  prompt: string;
  embedding: number[];
  response: string;
  timestamp: number;
  model: string;
}

export interface VectorSearchResult {
  id: string;
  score: number;
  data: CachedEntry;
}
