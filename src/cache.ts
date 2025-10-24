// Caching logic with embedding generation

import { Env, CachedEntry } from "./types";
import { RedisVectorStore } from "./redis";

export class PromptCache {
  private redis: RedisVectorStore;
  private ai: any;
  private similarityThreshold: number;

  constructor(env: Env) {
    this.redis = new RedisVectorStore(env.REDIS_URL, env.REDIS_TOKEN);
    this.ai = env.AI;
    this.similarityThreshold = parseFloat(env.SIMILARITY_THRESHOLD || "0.85");
  }

  /**
   * Generate embedding for a prompt using Workers AI
   */
  async generateEmbedding(text: string): Promise<number[]> {
    const response = await this.ai.run("@cf/google/embeddinggemma-300m", {
      text: text,
    });

    // Extract embedding array from response
    return response.data[0];
  }

  /**
   * Search for a cached response for a similar prompt
   */
  async findSimilarCache(prompt: string): Promise<{
    entry: CachedEntry;
    similarity: number;
  } | null> {
    // Generate embedding for the input prompt
    const embedding = await this.generateEmbedding(prompt);

    // Search for similar prompts in Redis
    const results = await this.redis.searchSimilar(
      embedding,
      this.similarityThreshold,
      1
    );

    if (results.length === 0) {
      return null;
    }

    const best = results[0];
    return {
      entry: best.data,
      similarity: best.score,
    };
  }

  /**
   * Store a new prompt-response pair in cache
   */
  async cacheResponse(
    prompt: string,
    response: string,
    model: string
  ): Promise<void> {
    // Generate embedding
    const embedding = await this.generateEmbedding(prompt);

    // Create cache entry
    const entry: CachedEntry = {
      prompt,
      embedding,
      response,
      timestamp: Date.now(),
      model,
    };

    // Generate unique ID for this entry
    const id = this.generateId(prompt);

    // Store in Redis
    await this.redis.store(id, entry);
  }

  /**
   * Generate a unique ID for a prompt
   */
  private generateId(prompt: string): string {
    // Simple hash function for generating IDs
    let hash = 0;
    for (let i = 0; i < prompt.length; i++) {
      const char = prompt.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return `${Math.abs(hash)}_${Date.now()}`;
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{ size: number }> {
    const size = await this.redis.getCacheSize();
    return { size };
  }
}
