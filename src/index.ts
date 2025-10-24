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

  // Prepare headers - include gateway authorization if provided
  const headers: Record<string, string> = {};
  if (env.CF_GATEWAY_TOKEN) {
    headers["cf-aig-authorization"] = `Bearer ${env.CF_GATEWAY_TOKEN}`;
  }

  // Handle Google models - use Google Generative AI SDK
  if (config.provider === "google") {
    const endpoint = `/v1/${env.GATEWAY_ACCOUNT_ID}/${env.GATEWAY_NAME}/google-ai-studio`;

    const genAI = new GoogleGenerativeAI(config.apiKey);

    // Extract the actual model name (remove google/ prefix if present)
    const modelName = model.startsWith("google/") ? model.slice(7) : model;

    const googleModel = genAI.getGenerativeModel(
      { model: modelName },
      { baseUrl: host + endpoint, customHeaders: headers }
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
      defaultHeaders: headers,
    });

    // Extract the actual model name (remove anthropic/ prefix if present)
    const modelName = model.startsWith("anthropic/") ? model.slice(10) : model;

    const message = await anthropic.messages.create({
      model: modelName,
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokens,
    });

    return message.content[0].type === "text" ? message.content[0].text : "";
  }

  // For OpenAI models, use OpenAI SDK with /compat endpoint
  const endpoint = `/v1/${env.GATEWAY_ACCOUNT_ID}/${env.GATEWAY_NAME}/compat`;

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

    // Serve HTML interface at root
    if (url.pathname === "/" && request.method === "GET") {
      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Prompt Caching Infrastructure</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Monaco', 'Courier New', monospace;
      background-color: #0a0a0a;
      color: #00ff00;
      padding: 20px;
      line-height: 1.6;
    }

    .container {
      max-width: 900px;
      margin: 0 auto;
    }

    h1 {
      font-size: 24px;
      margin-bottom: 10px;
      border-bottom: 2px solid #00ff00;
      padding-bottom: 10px;
    }

    .subtitle {
      color: #888;
      margin-bottom: 30px;
      font-size: 14px;
    }

    .section {
      margin-bottom: 30px;
      border: 1px solid #333;
      padding: 20px;
      background-color: #0f0f0f;
    }

    .section-title {
      font-size: 18px;
      margin-bottom: 15px;
      color: #00ff00;
    }

    label {
      display: block;
      margin-bottom: 5px;
      color: #888;
      font-size: 12px;
    }

    input, textarea, select {
      width: 100%;
      padding: 10px;
      margin-bottom: 15px;
      background-color: #1a1a1a;
      border: 1px solid #333;
      color: #00ff00;
      font-family: 'Monaco', 'Courier New', monospace;
      font-size: 14px;
    }

    textarea {
      min-height: 80px;
      resize: vertical;
    }

    input:focus, textarea:focus, select:focus {
      outline: none;
      border-color: #00ff00;
    }

    button {
      padding: 10px 20px;
      background-color: #1a1a1a;
      border: 2px solid #00ff00;
      color: #00ff00;
      cursor: pointer;
      font-family: 'Monaco', 'Courier New', monospace;
      font-size: 14px;
      margin-right: 10px;
      margin-bottom: 10px;
    }

    button:hover {
      background-color: #00ff00;
      color: #0a0a0a;
    }

    button:active {
      transform: scale(0.98);
    }

    .response-box {
      background-color: #1a1a1a;
      border: 1px solid #333;
      padding: 15px;
      margin-top: 15px;
      min-height: 100px;
      white-space: pre-wrap;
      word-wrap: break-word;
      font-size: 13px;
    }

    .metric {
      display: inline-block;
      margin-right: 20px;
      margin-bottom: 10px;
    }

    .metric-label {
      color: #888;
      font-size: 11px;
    }

    .metric-value {
      color: #00ff00;
      font-size: 16px;
      font-weight: bold;
    }

    .cache-hit {
      color: #00ff00;
    }

    .cache-miss {
      color: #ff6600;
    }

    .error {
      color: #ff0000;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 15px;
      margin-top: 15px;
    }

    .stat-card {
      background-color: #1a1a1a;
      border: 1px solid #333;
      padding: 15px;
      text-align: center;
    }

    .loading {
      color: #ffff00;
    }

    .endpoint-info {
      background-color: #1a1a1a;
      border-left: 3px solid #00ff00;
      padding: 10px 15px;
      margin-bottom: 10px;
      font-size: 13px;
    }

    .endpoint-method {
      color: #ffff00;
      font-weight: bold;
    }

    .endpoint-path {
      color: #00ff00;
    }

    .small-input {
      width: 150px;
      display: inline-block;
      margin-right: 10px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>PROMPT CACHING INFRASTRUCTURE</h1>
    <p class="subtitle">Cloudflare AI Gateway | Vector Search | Multi-Provider Support</p>

    <div class="section">
      <div class="section-title">&gt; AVAILABLE ENDPOINTS</div>
      <div class="endpoint-info">
        <span class="endpoint-method">GET</span>
        <span class="endpoint-path">/health</span>
        <span style="color: #888;"> - Health check</span>
      </div>
      <div class="endpoint-info">
        <span class="endpoint-method">GET</span>
        <span class="endpoint-path">/stats</span>
        <span style="color: #888;"> - Cache statistics</span>
      </div>
      <div class="endpoint-info">
        <span class="endpoint-method">POST</span>
        <span class="endpoint-path">/chat</span>
        <span style="color: #888;"> - Send prompt (with caching)</span>
      </div>
    </div>

    <div class="section">
      <div class="section-title">&gt; CHAT REQUEST</div>
      
      <label>PROMPT</label>
      <textarea id="prompt" placeholder="What is Cloudflare?">What is Cloudflare?</textarea>

      <label>MODEL</label>
      <select id="model">
        <optgroup label="Workers AI">
          <option value="@cf/meta/llama-3.1-8b-instruct">@cf/meta/llama-3.1-8b-instruct</option>
          <option value="@cf/meta/llama-2-7b-chat-int8">@cf/meta/llama-2-7b-chat-int8</option>
        </optgroup>
        <optgroup label="OpenAI">
          <option value="gpt-5-mini">gpt-5-mini</option>
          <option value="gpt-5-nano">gpt-5-nano</option>
          <option value="gpt-5-pro">gpt-5-pro</option>
        </optgroup>
        <optgroup label="Anthropic">
          <option value="claude-sonnet-4-5-20250929">claude-sonnet-4-5-20250929</option>
          <option value="claude-haiku-4-5-20251001">claude-haiku-4-5-20251001</option>
          <option value="claude-opus-4-1-20250805">claude-opus-4-1-20250805</option>
        </optgroup>
        <optgroup label="Google">
          <option value="gemini-1.5-flash">gemini-1.5-flash</option>
          <option value="gemini-1.5-pro">gemini-1.5-pro</option>
        </optgroup>
      </select>

      <div>
        <label>MAX TOKENS</label>
        <input type="number" id="maxTokens" value="150" class="small-input">
        
        <label>TEMPERATURE</label>
        <input type="number" id="temperature" value="0.7" step="0.1" min="0" max="2" class="small-input">
      </div>

      <button onclick="sendChatRequest()">SEND REQUEST</button>
      <button onclick="clearResponse()">CLEAR</button>

      <div id="chatMetrics"></div>
      <div id="chatResponse" class="response-box"></div>
    </div>

    <div class="section">
      <div class="section-title">&gt; CACHE STATISTICS</div>
      <button onclick="getStats()">REFRESH STATS</button>
      <button onclick="checkHealth()">CHECK HEALTH</button>
      <div id="statsContent" class="stats-grid"></div>
    </div>

    <div class="section">
      <div class="section-title">&gt; REQUEST LOG</div>
      <div id="requestLog" class="response-box">No requests yet...</div>
    </div>
  </div>

  <script>
    let requestLog = [];
    const apiUrl = window.location.origin;

    async function sendChatRequest() {
      const prompt = document.getElementById('prompt').value;
      const model = document.getElementById('model').value;
      const maxTokens = parseInt(document.getElementById('maxTokens').value);
      const temperature = parseFloat(document.getElementById('temperature').value);

      const responseDiv = document.getElementById('chatResponse');
      const metricsDiv = document.getElementById('chatMetrics');
      
      responseDiv.innerHTML = '<span class="loading">SENDING REQUEST...</span>';
      metricsDiv.innerHTML = '';

      const startTime = performance.now();
      const requestBody = {
        prompt,
        model,
        max_tokens: maxTokens,
        temperature
      };

      try {
        const response = await fetch(apiUrl + '/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        });

        const endTime = performance.now();
        const responseTime = (endTime - startTime).toFixed(0);
        const data = await response.json();
        
        const responseSize = new Blob([JSON.stringify(data)]).size;

        const cacheStatus = data.cached ? 'HIT' : 'MISS';
        const cacheClass = data.cached ? 'cache-hit' : 'cache-miss';
        
        let metricsHTML = \`
          <div class="metric">
            <div class="metric-label">RESPONSE TIME</div>
            <div class="metric-value">\${responseTime}ms</div>
          </div>
          <div class="metric">
            <div class="metric-label">RESPONSE SIZE</div>
            <div class="metric-value">\${responseSize} bytes</div>
          </div>
          <div class="metric">
            <div class="metric-label">CACHE</div>
            <div class="metric-value \${cacheClass}">\${cacheStatus}</div>
          </div>
        \`;

        if (data.similarity) {
          metricsHTML += \`
            <div class="metric">
              <div class="metric-label">SIMILARITY</div>
              <div class="metric-value">\${(data.similarity * 100).toFixed(1)}%</div>
            </div>
          \`;
        }

        metricsDiv.innerHTML = metricsHTML;
        responseDiv.innerHTML = \`[RESPONSE]\\n\\n\${data.response || JSON.stringify(data, null, 2)}\`;

        logRequest({
          timestamp: new Date().toLocaleTimeString(),
          model,
          cached: data.cached,
          responseTime: \`\${responseTime}ms\`,
          size: \`\${responseSize}B\`
        });

      } catch (error) {
        const endTime = performance.now();
        const responseTime = (endTime - startTime).toFixed(0);
        
        metricsDiv.innerHTML = \`
          <div class="metric">
            <div class="metric-label">RESPONSE TIME</div>
            <div class="metric-value">\${responseTime}ms</div>
          </div>
        \`;

        responseDiv.innerHTML = \`<span class="error">[ERROR]\\n\\n\${error.message}</span>\`;
        
        logRequest({
          timestamp: new Date().toLocaleTimeString(),
          model,
          cached: false,
          responseTime: \`\${responseTime}ms\`,
          size: 'ERROR'
        });
      }
    }

    async function getStats() {
      const statsDiv = document.getElementById('statsContent');
      statsDiv.innerHTML = '<span class="loading">LOADING...</span>';

      try {
        const response = await fetch(apiUrl + '/stats');
        const data = await response.json();

        statsDiv.innerHTML = \`
          <div class="stat-card">
            <div class="metric-label">CACHE SIZE</div>
            <div class="metric-value">\${data.cacheSize || 0}</div>
          </div>
          <div class="stat-card">
            <div class="metric-label">HITS</div>
            <div class="metric-value cache-hit">\${data.hits || 0}</div>
          </div>
          <div class="stat-card">
            <div class="metric-label">MISSES</div>
            <div class="metric-value cache-miss">\${data.misses || 0}</div>
          </div>
          <div class="stat-card">
            <div class="metric-label">HIT RATE</div>
            <div class="metric-value">\${((data.hitRate || 0) * 100).toFixed(1)}%</div>
          </div>
        \`;
      } catch (error) {
        statsDiv.innerHTML = \`<span class="error">[ERROR] \${error.message}</span>\`;
      }
    }

    async function checkHealth() {
      const statsDiv = document.getElementById('statsContent');
      
      try {
        const startTime = performance.now();
        const response = await fetch(apiUrl + '/health');
        const endTime = performance.now();
        const data = await response.json();

        statsDiv.innerHTML = \`
          <div class="stat-card">
            <div class="metric-label">STATUS</div>
            <div class="metric-value cache-hit">\${data.status.toUpperCase()}</div>
          </div>
          <div class="stat-card">
            <div class="metric-label">LATENCY</div>
            <div class="metric-value">\${(endTime - startTime).toFixed(0)}ms</div>
          </div>
        \`;
      } catch (error) {
        statsDiv.innerHTML = \`<span class="error">[ERROR] \${error.message}</span>\`;
      }
    }

    function clearResponse() {
      document.getElementById('chatResponse').innerHTML = '';
      document.getElementById('chatMetrics').innerHTML = '';
    }

    function logRequest(request) {
      requestLog.unshift(request);
      if (requestLog.length > 10) requestLog.pop();
      
      const logDiv = document.getElementById('requestLog');
      const cacheClass = request.cached ? 'cache-hit' : 'cache-miss';
      
      logDiv.innerHTML = requestLog.map(r => 
        \`[\${r.timestamp}] \${r.model} | <span class="\${cacheClass}">\${r.cached ? 'HIT' : 'MISS'}</span> | \${r.responseTime} | \${r.size}\`
      ).join('\\n');
    }

    window.onload = function() {
      getStats();
    };
  </script>
</body>
</html>`;

      return new Response(html, {
        headers: {
          "Content-Type": "text/html;charset=UTF-8",
          ...corsHeaders,
        },
      });
    }

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
