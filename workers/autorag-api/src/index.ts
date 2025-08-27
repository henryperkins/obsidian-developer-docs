/**
 * AutoRAG API Worker
 * Provides proxy to AutoRAG REST API with CORS support and continuous ingestion
 */
import puppeteer from '@cloudflare/puppeteer';

interface Env {
  AI?: any; // Optional: Use Workers AI binding if available
  DOCS_BUCKET: R2Bucket;
  ACCOUNT_ID: string;
  AUTORAG_NAME: string;
  API_TOKEN: string;
  INGESTION_TOKEN?: string;
  ALLOWED_ORIGINS?: string; // Comma-separated list of allowed Origins
  ALLOWED_RENDER_HOSTS?: string; // Comma-separated list of allowed hostnames for render-ingest
  MY_BROWSER?: any; // Browser Rendering binding
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS headers for documentation site
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '*')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    const allowAll = allowed.includes('*');
    const allowOrigin = allowAll ? '*' : (allowed.includes(origin) ? origin : 'null');
    const corsHeaders = {
      'Access-Control-Allow-Origin': allowOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Route handling
      switch (url.pathname) {
        case '/api/autorag-search':
          return handleSearch(request, env, corsHeaders);
        
        case '/api/ingest':
          return handleIngestion(request, env, corsHeaders);
        
        case '/api/render-ingest':
          return handleRenderAndIngest(request, env, corsHeaders);
        
        case '/api/sync':
          return handleSync(request, env, corsHeaders);
        
        case '/api/status':
          return handleStatus(env, corsHeaders);
        
        default:
          return new Response('Not Found', { status: 404, headers: corsHeaders });
      }
    } catch (error) {
      console.error('Worker error:', error);
      return new Response(
        JSON.stringify({ error: 'Internal Server Error' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }
  },
} satisfies ExportedHandler<Env>;

/**
 * Handle AutoRAG search requests
 * Can use either Workers AI binding or REST API
 */
async function handleSearch(request: Request, env: Env, headers: Record<string, string>): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers });
  }

  const body = await request.json() as {
    query: string;
    max_num_results?: number;
    rewrite_query?: boolean;
    use_ai_search?: boolean;
    model?: string;
    ranking_options?: {
      score_threshold?: number;
    };
    filters?: any;
    stream?: boolean;
  };

  if (!body.query) {
    return new Response(
      JSON.stringify({ error: 'Query is required' }),
      { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Use AI Search by default for better responses
    const useAiSearch = body.use_ai_search !== false;
    
    // Try Workers AI binding first if available
    if (env.AI) {
      const searchParams = {
        query: body.query,
        max_num_results: body.max_num_results || 5,
        rewrite_query: body.rewrite_query !== false,
        ranking_options: body.ranking_options || { score_threshold: 0.3 },
        ...(body.model && { model: body.model }),
        ...(body.filters && { filters: body.filters }),
        ...(body.stream && { stream: body.stream }),
      };

      const result = useAiSearch
        ? await env.AI.autorag(env.AUTORAG_NAME).aiSearch(searchParams)
        : await env.AI.autorag(env.AUTORAG_NAME).search(searchParams);

      return new Response(JSON.stringify(result), {
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    // Fallback to REST API
    const endpoint = useAiSearch ? 'ai-search' : 'search';
    const apiUrl = `https://api.cloudflare.com/client/v4/accounts/${env.ACCOUNT_ID}/autorag/rags/${env.AUTORAG_NAME}/${endpoint}`;
    
    const apiResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.API_TOKEN}`,
      },
      body: JSON.stringify({
        query: body.query,
        ...(body.max_num_results && { max_num_results: body.max_num_results }),
        ...(body.rewrite_query !== undefined && { rewrite_query: body.rewrite_query }),
        ...(body.model && { model: body.model }),
        ...(body.ranking_options && { ranking_options: body.ranking_options }),
        ...(body.filters && { filters: body.filters }),
        ...(body.stream && { stream: body.stream }),
      }),
    });

    if (!apiResponse.ok) {
      const error = await apiResponse.text();
      throw new Error(`API error: ${apiResponse.status} - ${error}`);
    }

    // Handle streaming response
    if (body.stream && apiResponse.body) {
      return new Response(apiResponse.body, {
        headers: {
          ...headers,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
        },
      });
    }

    const result = await apiResponse.json();
    
    // Extract the result from the API response format
    const responseData = result.success && result.result ? result.result : result;
    
    return new Response(JSON.stringify(responseData), {
      headers: { ...headers, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Search error:', error);
    return new Response(
      JSON.stringify({ error: 'Search failed', details: error.message }),
      { status: 500, headers: { ...headers, 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Handle document ingestion for continuous updates
 */
async function handleIngestion(request: Request, env: Env, headers: Record<string, string>): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers });
  }

  // Check authorization token if configured
  if (env.INGESTION_TOKEN) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || authHeader !== `Bearer ${env.INGESTION_TOKEN}`) {
      return new Response('Unauthorized', { status: 401, headers });
    }
  }

  const body = await request.json() as {
    path: string;
    content: string;
    metadata?: Record<string, any>;
    content_type?: string;
  };

  if (!body.path || !body.content) {
    return new Response(
      JSON.stringify({ error: 'Path and content are required' }),
      { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Store the document in R2
    const key = body.path.startsWith('/') ? body.path.slice(1) : body.path;

    // Resolve content type (default markdown, switch for .html or explicit override)
    const contentType = body.content_type
      ?? (key.toLowerCase().endsWith('.html') ? 'text/html' : 'text/markdown');

    // Custom metadata for indexing/debug
    const customMetadata: Record<string, string> = {
      source: 'continuous-ingestion',
      timestamp: new Date().toISOString(),
      ...Object.fromEntries(Object.entries(body.metadata || {}).map(([k, v]) => [k, String(v)])),
    };

    await env.DOCS_BUCKET.put(key, body.content, {
      httpMetadata: { contentType },
      customMetadata,
    });

    // Trigger AutoRAG sync via API
    const syncResponse = await triggerAutoRAGSync(env);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Document ingested successfully',
        path: key,
        sync: syncResponse,
      }),
      { headers: { ...headers, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Ingestion error:', error);
    return new Response(
      JSON.stringify({ error: 'Ingestion failed', details: error.message }),
      { status: 500, headers: { ...headers, 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Render a remote web page via Browser Rendering and ingest its HTML into R2
 */
async function handleRenderAndIngest(request: Request, env: Env, headers: Record<string, string>): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers });
  }

  // Require ingestion token if configured
  if (env.INGESTION_TOKEN) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || authHeader !== `Bearer ${env.INGESTION_TOKEN}`) {
      return new Response('Unauthorized', { status: 401, headers });
    }
  }

  if (!(env as any).MY_BROWSER) {
    return new Response(
      JSON.stringify({ error: 'Browser binding not configured' }),
      { status: 500, headers: { ...headers, 'Content-Type': 'application/json' } }
    );
  }

  type Body = { url: string; waitUntil?: 'load' | 'domcontentloaded' | 'networkidle'; timeoutMs?: number; keyPrefix?: string };
  let body: Body;
  try {
    body = await request.json<Body>();
  } catch {
    return new Response('Invalid JSON', { status: 400, headers });
  }
  if (!body?.url) {
    return new Response('Missing url', { status: 400, headers });
  }

  // Optional hostname allowlist via ALLOWED_RENDER_HOSTS
  const allowList = ((env as any).ALLOWED_RENDER_HOSTS || '')
    .split(',')
    .map((s: string) => s.trim())
    .filter(Boolean);
  let target: URL;
  try {
    target = new URL(body.url);
  } catch {
    return new Response('Invalid url', { status: 400, headers });
  }
  if (allowList.length && !allowList.includes(target.hostname)) {
    return new Response('Host not allowed', { status: 403, headers });
  }

  try {
    const browser = await puppeteer.launch((env as any).MY_BROWSER);
    const page = await browser.newPage();
    await page.goto(target.href, { waitUntil: body.waitUntil || 'networkidle', timeout: body.timeoutMs ?? 20000 });
    const html = await page.content();
    await browser.close();

    const safeHost = target.hostname.replace(/[^a-zA-Z0-9.-]/g, '_');
    const time = new Date().toISOString().replace(/[:.]/g, '-');
    const prefix = body.keyPrefix ? body.keyPrefix.replace(/^\/+|\/+$/g, '') + '/' : '';
    const key = `${prefix}${safeHost}_${time}.html`;

    await env.DOCS_BUCKET.put(key, html, {
      httpMetadata: { contentType: 'text/html' },
      customMetadata: { source: 'browser-render', url: target.href, timestamp: new Date().toISOString() },
    });

    const sync = await triggerAutoRAGSync(env);

    return new Response(JSON.stringify({ success: true, key, sync }), {
      headers: { ...headers, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Render-ingest error:', error);
    return new Response(
      JSON.stringify({ error: 'Render-ingest failed', details: String(error?.message || error) }),
      { status: 500, headers: { ...headers, 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Handle manual sync trigger
 */
async function handleSync(request: Request, env: Env, headers: Record<string, string>): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers });
  }

  // Check authorization
  if (env.INGESTION_TOKEN) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || authHeader !== `Bearer ${env.INGESTION_TOKEN}`) {
      return new Response('Unauthorized', { status: 401, headers });
    }
  }

  try {
    const syncResponse = await triggerAutoRAGSync(env);
    
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Sync triggered successfully',
        response: syncResponse,
      }),
      { headers: { ...headers, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Sync error:', error);
    return new Response(
      JSON.stringify({ error: 'Sync failed', details: error.message }),
      { status: 500, headers: { ...headers, 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Get AutoRAG status
 */
async function handleStatus(env: Env, headers: Record<string, string>): Promise<Response> {
  try {
    // Get basic status info
    const status = {
      autorag_name: env.AUTORAG_NAME,
      operational: true,
      last_check: new Date().toISOString(),
      api_configured: !!env.API_TOKEN,
      ai_binding_available: !!env.AI,
      ingestion_enabled: !!env.INGESTION_TOKEN,
    };

    // Try to get more details if API is configured
    if (env.API_TOKEN && env.ACCOUNT_ID) {
      try {
        const apiUrl = `https://api.cloudflare.com/client/v4/accounts/${env.ACCOUNT_ID}/autorag/rags/${env.AUTORAG_NAME}`;
        const response = await fetch(apiUrl, {
          headers: {
            'Authorization': `Bearer ${env.API_TOKEN}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          Object.assign(status, {
            autorag_details: data.result,
          });
        }
      } catch (e) {
        // Ignore errors, return basic status
        console.error('Failed to fetch AutoRAG details:', e);
      }
    }

    return new Response(JSON.stringify(status), {
      headers: { ...headers, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Status error:', error);
    return new Response(
      JSON.stringify({ error: 'Status check failed' }),
      { status: 500, headers: { ...headers, 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Trigger AutoRAG sync via API
 */
async function triggerAutoRAGSync(env: Env): Promise<any> {
  if (!env.ACCOUNT_ID || !env.API_TOKEN || !env.AUTORAG_NAME) {
    console.log('Sync not configured - missing environment variables');
    return { skipped: true, reason: 'Not configured' };
  }

  const syncUrl = `https://api.cloudflare.com/client/v4/accounts/${env.ACCOUNT_ID}/autorag/rags/${env.AUTORAG_NAME}/sync`;
  
  try {
    const response = await fetch(syncUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.API_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      // Check if it's a cooldown error
      if (response.status === 429 || response.status === 409) {
        return { 
          skipped: true, 
          reason: 'Sync is on cooldown (3-minute minimum between syncs)' 
        };
      }
      
      const error = await response.text();
      throw new Error(`Sync API error: ${response.status} - ${error}`);
    }

    return await response.json();
  } catch (error) {
    // Log but don't fail the entire request
    console.error('Sync error:', error);
    return { 
      error: true, 
      message: error.message 
    };
  }
}
