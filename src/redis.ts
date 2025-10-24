// Redis vector operations using Upstash REST API

import { CachedEntry, VectorSearchResult } from "./types";

export class RedisVectorStore {
  private redisUrl: string;
  private redisToken: string;

  constructor(redisUrl: string, redisToken: string) {
    this.redisUrl = redisUrl;
    this.redisToken = redisToken;
  }

  /**
   * Execute Redis command via REST API
   */
  private async execute(command: any[]): Promise<any> {
    const response = await fetch(this.redisUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.redisToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(command),
    });

    if (!response.ok) {
      throw new Error(`Redis error: ${response.statusText}`);
    }

    const data = (await response.json()) as { result: any };
    return data.result;
  }

  /**
   * Store a prompt with its embedding and response
   */
  async store(id: string, entry: CachedEntry): Promise<void> {
    // Store the entry as JSON
    await this.execute(["JSON.SET", `cache:${id}`, "$", JSON.stringify(entry)]);
  }

  /**
   * Search for similar prompts using vector similarity
   * This is a simplified implementation using brute-force cosine similarity
   * For production, use Redis Stack with vector indexes (FT.SEARCH)
   */
  async searchSimilar(
    embedding: number[],
    threshold: number,
    limit: number = 1
  ): Promise<VectorSearchResult[]> {
    // Get all cache keys
    const keys = await this.execute(["KEYS", "cache:*"]);

    if (!keys || keys.length === 0) {
      return [];
    }

    const results: VectorSearchResult[] = [];

    // Fetch all entries and compute similarity
    for (const key of keys) {
      try {
        const entryJson = await this.execute(["JSON.GET", key]);
        if (!entryJson) continue;

        const entry: CachedEntry = JSON.parse(entryJson);
        const similarity = this.cosineSimilarity(embedding, entry.embedding);

        if (similarity >= threshold) {
          results.push({
            id: key,
            score: similarity,
            data: entry,
          });
        }
      } catch (e) {
        // Skip invalid entries
        continue;
      }
    }

    // Sort by similarity score (descending) and return top results
    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }

  /**
   * Get cache statistics
   */
  async getCacheSize(): Promise<number> {
    const keys = await this.execute(["KEYS", "cache:*"]);
    return keys ? keys.length : 0;
  }
}
