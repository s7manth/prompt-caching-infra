// Main Cloudflare Worker entry point

import { Env, ChatRequest, ChatResponse } from "./types";
import { PromptCache } from "./cache";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // CORS headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    // Health check endpoint
    if (url.pathname === "/health" && request.method === "GET") {
      return Response.json({ status: "ok" }, { headers: corsHeaders });
    }

    // Stats endpoint
    if (url.pathname === "/stats" && request.method === "GET") {
      try {
        const cache = new PromptCache(env);
        const stats = await cache.getStats();

        // Get hit/miss stats from KV
        const hits = (await env.CACHE_STATS.get("hits")) || "0";
        const misses = (await env.CACHE_STATS.get("misses")) || "0";

        return Response.json(
          {
            cacheSize: stats.size,
            hits: parseInt(hits),
            misses: parseInt(misses),
            hitRate:
              parseInt(hits) + parseInt(misses) > 0
                ? (
                    parseInt(hits) /
                    (parseInt(hits) + parseInt(misses))
                  ).toFixed(2)
                : 0,
          },
          { headers: corsHeaders }
        );
      } catch (error: any) {
        return Response.json(
          { error: "Failed to fetch stats", details: error.message },
          { status: 500, headers: corsHeaders }
        );
      }
    }

    // Main chat endpoint
    if (url.pathname === "/chat" && request.method === "POST") {
      try {
        // Parse request
        const body: ChatRequest = await request.json();

        if (!body.prompt) {
          return Response.json(
            { error: "Missing required field: prompt" },
            { status: 400, headers: corsHeaders }
          );
        }

        const prompt = body.prompt;
        const model = body.model || "@cf/meta/llama-2-7b-chat-int8";
        const maxTokens = body.max_tokens || 256;
        const temperature = body.temperature || 0.7;

        // Initialize cache
        const cache = new PromptCache(env);

        // Check for cached response
        const cachedResult = await cache.findSimilarCache(prompt);

        if (cachedResult) {
          // Cache hit!
          console.log(`Cache hit! Similarity: ${cachedResult.similarity}`);

          // Update hit count
          const hits = parseInt((await env.CACHE_STATS.get("hits")) || "0");
          await env.CACHE_STATS.put("hits", (hits + 1).toString());

          const response: ChatResponse = {
            response: cachedResult.entry.response,
            cached: true,
            similarity: cachedResult.similarity,
            timestamp: Date.now(),
          };

          return Response.json(response, { headers: corsHeaders });
        }

        // Cache miss - call Workers AI
        console.log("Cache miss - calling Workers AI");

        // Update miss count
        const misses = parseInt((await env.CACHE_STATS.get("misses")) || "0");
        await env.CACHE_STATS.put("misses", (misses + 1).toString());

        const aiResponse = await env.AI.run(model, {
          messages: [{ role: "user", content: prompt }],
          max_tokens: maxTokens,
          temperature: temperature,
        });

        const responseText =
          aiResponse.response ||
          aiResponse.result?.response ||
          JSON.stringify(aiResponse);

        // Cache the response
        await cache.cacheResponse(prompt, responseText, model);

        const response: ChatResponse = {
          response: responseText,
          cached: false,
          timestamp: Date.now(),
        };

        return Response.json(response, { headers: corsHeaders });
      } catch (error: any) {
        console.error("Error processing request:", error);
        return Response.json(
          { error: "Internal server error", details: error.message },
          { status: 500, headers: corsHeaders }
        );
      }
    }

    // 404 for unknown routes
    return Response.json(
      { error: "Not found" },
      { status: 404, headers: corsHeaders }
    );
  },
};
