import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";

type Json = Record<string, any>;

interface Env {
  AI: any; // AutoRAG AI binding
  RAG_ID: string;
  ASSETS: Fetcher; // Static assets binding
  MCP_OBJECT: DurableObjectNamespace;
  DOCS_BUCKET?: R2Bucket; // Optional for ingestion
  
  // Configuration
  STREAM_DEFAULT?: string;
  DEFAULT_TOPK?: string;
  DEFAULT_THRESHOLD?: string;
  USE_EXTERNAL_LLM?: "" | "openai" | "azure";
  ALLOWED_ORIGINS?: string;
  
  // External LLM credentials (if needed)
  OPENAI_API_KEY?: string;
  AZURE_OPENAI_ENDPOINT?: string;
  AZURE_OPENAI_API_KEY?: string;
  AZURE_OPENAI_API_VERSION?: string;
  
  // Ingestion security
  INGESTION_TOKEN?: string;
}

const getCorsHeaders = (origin: string | null, allowedOrigins: string = "*") => {
  const allowed = allowedOrigins.split(",").map(s => s.trim()).filter(Boolean);
  const allowAll = allowed.includes("*");
  const allowOrigin = allowAll ? "*" : (origin && allowed.includes(origin) ? origin : "null");
  
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
  };
};

const json = (o: unknown, status = 200, headers: Record<string, string> = {}) => 
  new Response(JSON.stringify(o), {
    status,
    headers: { "Content-Type": "application/json", ...headers }
  });

const notFound = (headers: Record<string, string> = {}) => 
  new Response("Not Found", { status: 404, headers });

function parseBoolean(s: string | undefined, defaultValue = false): boolean {
  if (s == null) return defaultValue;
  const v = s.toLowerCase();
  return ["1", "true", "yes", "on"].includes(v);
}

async function aiSearch(env: Env, params: {
  query: string;
  topK?: number;
  threshold?: number;
  stream?: boolean;
  rewrite?: boolean;
}) {
  const searchParams: any = {
    query: params.query,
    rewrite_query: params.rewrite ?? true,
    max_num_results: Math.min(Math.max(params.topK ?? Number(env.DEFAULT_TOPK || 6), 1), 50),
    ranking_options: {
      score_threshold: Math.max(Math.min(params.threshold ?? Number(env.DEFAULT_THRESHOLD || 0.3), 1), 0)
    }
  };
  
  if (params.stream) {
    return env.AI.autorag(env.RAG_ID).aiSearch({ ...searchParams, stream: true });
  }
  return env.AI.autorag(env.RAG_ID).aiSearch(searchParams);
}

async function handleAsk(req: Request, env: Env, corsHeaders: Record<string, string>) {
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const accept = req.headers.get("Accept") || "";
  
  let query: string;
  let topK: number;
  let threshold: number;
  let stream: boolean;
  let rewrite: boolean;
  
  if (req.method === "POST" && req.headers.get("Content-Type")?.includes("json")) {
    const body = await req.json().catch(() => ({})) as any;
    query = (body.query || "").toString().trim();
    topK = Number(body.topK ?? env.DEFAULT_TOPK ?? "6");
    threshold = Number(body.threshold ?? env.DEFAULT_THRESHOLD ?? "0.30");
    stream = parseBoolean(body.stream?.toString()) || accept.includes("text/event-stream");
    rewrite = parseBoolean(body.rewrite?.toString(), true);
  } else {
    query = (url.searchParams.get("q") || url.searchParams.get("query") || "").trim();
    topK = Number(url.searchParams.get("topK") ?? env.DEFAULT_TOPK ?? "6");
    threshold = Number(url.searchParams.get("threshold") ?? env.DEFAULT_THRESHOLD ?? "0.30");
    stream = parseBoolean(url.searchParams.get("stream") || env.STREAM_DEFAULT) || accept.includes("text/event-stream");
    rewrite = parseBoolean(url.searchParams.get("rewrite"), true);
  }
  
  if (!query) {
    return json({ error: "Missing 'query' parameter" }, 400, corsHeaders);
  }

  try {
    // Default: fully managed (retrieval + generation) via AutoRAG
    if (!env.USE_EXTERNAL_LLM) {
      const result = await aiSearch(env, { query, topK, threshold, stream, rewrite });
      
      if (stream) {
        return new Response(result as any, {
          headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", ...corsHeaders }
        });
      }
      return json(result, 200, corsHeaders);
    }

    // Bring-your-own LLM: AutoRAG for retrieval, external model for generation
    const searchResult = await env.AI.autorag(env.RAG_ID).search({
      query,
      rewrite_query: rewrite,
      max_num_results: topK,
      ranking_options: { score_threshold: threshold }
    });

    if (!searchResult?.data?.length) {
      return json({ text: `No relevant information found for: "${query}"`, data: [] }, 200, corsHeaders);
    }

    // Format search results as context
    const chunks = searchResult.data.map((item: any) => {
      const text = (item.content || [])
        .map((c: any) => ("text" in c ? c.text : ""))
        .join("\n\n");
      return `<file name="${item.filename}">\n${text}\n</file>`;
    }).join("\n\n");

    // Configure external LLM provider
    const provider = env.USE_EXTERNAL_LLM === "openai"
      ? openai({ apiKey: env.OPENAI_API_KEY! })
      : openai({
          apiKey: env.AZURE_OPENAI_API_KEY!,
          baseURL: `${env.AZURE_OPENAI_ENDPOINT}?api-version=${env.AZURE_OPENAI_API_VERSION}`
        });

    const { toAIStreamResponse, text } = await streamText({
      model: provider("gpt-4o-mini"),
      system: "Answer based only on the provided documentation files. Be concise and accurate.",
      messages: [
        { role: "user", content: chunks },
        { role: "user", content: query }
      ]
    });

    if (accept.includes("text/event-stream")) {
      return toAIStreamResponse({ headers: corsHeaders });
    }
    
    return json({ text: await text, data: searchResult.data }, 200, corsHeaders);
  } catch (error: any) {
    console.error("Search error:", error);
    return json({ error: "Search failed", details: error.message }, 500, corsHeaders);
  }
}

async function handleIngestion(req: Request, env: Env, corsHeaders: Record<string, string>) {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  // Check authorization
  if (env.INGESTION_TOKEN) {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || authHeader !== `Bearer ${env.INGESTION_TOKEN}`) {
      return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    }
  }

  const body = await req.json() as {
    path: string;
    content: string;
    metadata?: Record<string, any>;
    content_type?: string;
  };

  if (!body.path || !body.content) {
    return json({ error: "Path and content are required" }, 400, corsHeaders);
  }

  if (!env.DOCS_BUCKET) {
    return json({ error: "R2 bucket not configured" }, 500, corsHeaders);
  }

  try {
    const key = body.path.startsWith("/") ? body.path.slice(1) : body.path;
    const contentType = body.content_type ?? (key.toLowerCase().endsWith(".html") ? "text/html" : "text/markdown");
    
    const customMetadata: Record<string, string> = {
      source: "api-ingestion",
      timestamp: new Date().toISOString(),
      ...Object.fromEntries(
        Object.entries(body.metadata || {}).map(([k, v]) => [k, String(v)])
      )
    };

    await env.DOCS_BUCKET.put(key, body.content, {
      httpMetadata: { contentType },
      customMetadata
    });

    return json({
      success: true,
      message: "Document ingested successfully",
      path: key
    }, 200, corsHeaders);
  } catch (error: any) {
    console.error("Ingestion error:", error);
    return json({ error: "Ingestion failed", details: error.message }, 500, corsHeaders);
  }
}

// Minimal MCP (JSON-RPC 2.0) Durable Object
export class NLWebMcp {
  constructor(private state: DurableObjectState, private env: Env) {}

  async fetch(req: Request) {
    const origin = req.headers.get("Origin");
    const corsHeaders = getCorsHeaders(origin, this.env.ALLOWED_ORIGINS);
    
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
    }

    const rpc = await req.json().catch(() => ({})) as any;
    const id = rpc.id ?? null;
    
    const error = (code: number, message: string, data?: any) =>
      json({
        jsonrpc: "2.0",
        id,
        error: { code, message, data }
      }, 200, corsHeaders);

    try {
      switch (rpc.method) {
        case "initialize":
          return json({
            jsonrpc: "2.0",
            id,
            result: {
              protocolVersion: "2025-06-18",
              serverInfo: { name: "obsidian-docs-autorag", version: "2.0.0" },
              capabilities: { tools: {} }
            }
          }, 200, corsHeaders);

        case "tools/list":
          return json({
            jsonrpc: "2.0",
            id,
            result: {
              tools: [{
                name: "ask",
                description: "Query Obsidian documentation via AutoRAG",
                inputSchema: {
                  type: "object",
                  properties: {
                    query: { type: "string", description: "Search query" },
                    topK: { type: "number", description: "Number of results (default: 6)" },
                    threshold: { type: "number", description: "Score threshold 0-1 (default: 0.3)" },
                    rewrite: { type: "boolean", description: "Rewrite query for better results (default: true)" }
                  },
                  required: ["query"]
                }
              }]
            }
          }, 200, corsHeaders);

        case "tools/call": {
          const { name, arguments: args } = rpc.params || {};
          
          if (name !== "ask") {
            return error(-32601, `Unknown tool: ${name}`);
          }
          
          const query = (args?.query || "").toString();
          if (!query) {
            return error(-32602, "Missing 'query' parameter");
          }
          
          const topK = Number(args?.topK ?? 6);
          const threshold = Number(args?.threshold ?? 0.3);
          const rewrite = Boolean(args?.rewrite ?? true);
          
          const result = await aiSearch(this.env, {
            query,
            topK,
            threshold,
            stream: false,
            rewrite
          });
          
          return json({ jsonrpc: "2.0", id, result }, 200, corsHeaders);
        }

        default:
          return error(-32601, `Method not found: ${rpc.method}`);
      }
    } catch (e: any) {
      return error(-32000, "Server error", { message: e?.message || String(e) });
    }
  }
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const { pathname } = url;
    const origin = req.headers.get("Origin");
    const corsHeaders = getCorsHeaders(origin, env.ALLOWED_ORIGINS);

    // Handle CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // API endpoints
    if (pathname === "/ask") {
      return handleAsk(req, env, corsHeaders);
    }
    
    if (pathname === "/mcp") {
      return env.MCP_OBJECT.get(env.MCP_OBJECT.idFromName("mcp")).fetch(req);
    }
    
    if (pathname === "/api/ingest") {
      return handleIngestion(req, env, corsHeaders);
    }

    // Legacy compatibility endpoints
    if (pathname === "/api/autorag-search") {
      return handleAsk(req, env, corsHeaders);
    }
    
    if (pathname === "/api/status") {
      return json({
        operational: true,
        autorag_name: env.RAG_ID,
        ai_binding_available: !!env.AI,
        ingestion_enabled: !!env.INGESTION_TOKEN,
        external_llm: env.USE_EXTERNAL_LLM || "none",
        timestamp: new Date().toISOString()
      }, 200, corsHeaders);
    }

    // Serve static assets (VitePress build)
    const assetResponse = await env.ASSETS.fetch(req);
    
    // If asset not found, return 404
    if (assetResponse.status === 404) {
      return notFound(corsHeaders);
    }
    
    return assetResponse;
  }
};