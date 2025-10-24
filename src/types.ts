// TypeScript types for the prompt caching system

export interface Env {
  AI: any; // Cloudflare Workers AI binding
  CACHE_STATS: KVNamespace; // KV for metadata
  REDIS_URL: string; // Upstash Redis REST URL
  REDIS_TOKEN: string; // Upstash Redis token
  SIMILARITY_THRESHOLD?: string; // Configurable threshold

  // Cloudflare AI Gateway configuration
  GATEWAY_ACCOUNT_ID?: string; // Your Cloudflare account ID
  GATEWAY_NAME?: string; // Gateway name (e.g., "prompt-caching-infra-gateway")
  CF_GATEWAY_TOKEN?: string; // Cloudflare AI Gateway authorization token

  // API keys for different providers
  ANTHROPIC_API_KEY?: string; // For Anthropic models
  OPENAI_API_KEY?: string; // For OpenAI models
  GOOGLE_AI_STUDIO_TOKEN?: string; // For Google/Gemini models
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
