// Main Cloudflare Worker entry point

import { Env, ChatRequest, ChatResponse } from "./types";
import { PromptCache } from "./cache";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Anthropic from "@anthropic-ai/sdk";

// Helper function to determine model type and get API key
function getModelConfig(
  model: string,
  env: Env
): {
  isWorkersAI: boolean;
  provider?: string;
  apiKey?: string;
} {
  // Workers AI models start with @cf
  if (model.startsWith("@cf/")) {
    return { isWorkersAI: true };
  }

  // Determine provider from model prefix
  if (model.startsWith("anthropic/") || model.startsWith("claude-")) {
    return {
      isWorkersAI: false,
      provider: "anthropic",
      apiKey: env.ANTHROPIC_API_KEY,
    };
  }

  if (model.startsWith("openai/") || model.startsWith("gpt-")) {
    return {
      isWorkersAI: false,
      provider: "openai",
      apiKey: env.OPENAI_API_KEY,
    };
  }

  if (model.startsWith("google/") || model.startsWith("gemini-")) {
    return {
      isWorkersAI: false,
      provider: "google",
      apiKey: env.GOOGLE_AI_STUDIO_TOKEN,
    };
  }

  // Default to Workers AI if no prefix matches
  return { isWorkersAI: true };
}

// Helper function to call model through gateway
async function callModelGateway(
  model: string,
  prompt: string,
  maxTokens: number,
  temperature: number,
  env: Env
): Promise<string> {
  const config = getModelConfig(model, env);

  // For Workers AI models, use env.AI.run with gateway option
  if (config.isWorkersAI) {
    const gatewayConfig = env.GATEWAY_NAME
      ? {
          gateway: {
            id: env.GATEWAY_NAME,
          },
        }
      : {};

    const aiResponse = await env.AI.run(
      model,
      {
        messages: [{ role: "user", content: prompt }],
        max_tokens: maxTokens,
        temperature: temperature,
      },
      gatewayConfig
    );

    return (
      aiResponse.response ||
      aiResponse.result?.response ||
      JSON.stringify(aiResponse)
    );
  }

  // For external providers, use OpenAI client with gateway endpoint
  if (!config.apiKey) {
    throw new Error(`API key not configured for provider: ${config.provider}`);
  }

  if (!env.GATEWAY_ACCOUNT_ID || !env.GATEWAY_NAME) {
    throw new Error(
      "Gateway configuration missing. Set GATEWAY_ACCOUNT_ID and GATEWAY_NAME."
    );
  }

  const host = "https://gateway.ai.cloudflare.com";

  // Handle Google models - use Google Generative AI SDK
  if (config.provider === "google") {
    const endpoint = `/v1/${env.GATEWAY_ACCOUNT_ID}/${env.GATEWAY_NAME}/google-ai-studio`;

    const genAI = new GoogleGenerativeAI(config.apiKey);

    // Extract the actual model name (remove google/ prefix if present)
    const modelName = model.startsWith("google/") ? model.slice(7) : model;

    const googleModel = genAI.getGenerativeModel(
      { model: modelName },
      { baseUrl: host + endpoint }
    );

    const result = await googleModel.generateContent([prompt]);
    return result.response.text();
  }

  // Handle Anthropic models - use Anthropic SDK
  if (config.provider === "anthropic") {
    const endpoint = `/v1/${env.GATEWAY_ACCOUNT_ID}/${env.GATEWAY_NAME}/anthropic`;

    const anthropic = new Anthropic({
      apiKey: config.apiKey,
      baseURL: host + endpoint,
    });

    // Extract the actual model name (remove anthropic/ prefix if present)
    const modelName = model.startsWith("anthropic/") ? model.slice(10) : model;

    const message = await anthropic.messages.create({
      model: modelName,
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokens,
      temperature: temperature,
    });

    return message.content[0].type === "text" ? message.content[0].text : "";
  }

  // For OpenAI models, use OpenAI SDK with /compat endpoint
  const endpoint = `/v1/${env.GATEWAY_ACCOUNT_ID}/${env.GATEWAY_NAME}/compat`;

  // Prepare headers - include gateway authorization if provided
  const headers: Record<string, string> = {};
  if (env.CF_GATEWAY_TOKEN) {
    headers["cf-aig-authorization"] = `Bearer ${env.CF_GATEWAY_TOKEN}`;
  }

  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: host + endpoint,
    defaultHeaders: headers,
  });

  // Ensure model name has the provider prefix for gateway routing
  let modelName = model;
  if (!modelName.startsWith("openai/")) {
    modelName = `openai/${modelName}`;
  }

  const response = await client.chat.completions.create({
    model: modelName,
    messages: [{ role: "user", content: prompt }],
    max_completion_tokens: maxTokens,
  });

  return response.choices[0]?.message?.content || "";
}

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

        // Cache miss - call model through gateway
        console.log(`Cache miss - calling model ${model} through gateway`);

        // Update miss count
        const misses = parseInt((await env.CACHE_STATS.get("misses")) || "0");
        await env.CACHE_STATS.put("misses", (misses + 1).toString());

        const responseText = await callModelGateway(
          model,
          prompt,
          maxTokens,
          temperature,
          env
        );

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
