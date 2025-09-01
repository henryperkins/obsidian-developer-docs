# Migration Guide: Cloudflare Pages → Workers v2

This guide documents the migration from the deprecated Cloudflare Pages + Worker setup to a modern single Worker architecture that serves both static assets and API endpoints.

## Why Migrate?

- **Cloudflare Pages is being deprecated** and merged into Workers
- **Single deployment unit** - one Worker serves everything
- **Better performance** - no cross-service calls
- **Simplified architecture** - fewer moving parts
- **Modern approach** - aligns with Cloudflare's current recommendations

## Architecture Changes

### Old Architecture (Pages + Worker)
```
┌─────────────┐     ┌──────────────┐     ┌─────────┐
│   GitHub    │────▶│   CF Pages   │     │ Worker  │
│    Repo     │     │  (Static)    │────▶│  (API)  │
└─────────────┘     └──────────────┘     └─────────┘
                           │                    │
                           ▼                    ▼
                        Browser             AutoRAG
```

### New Architecture (Single Worker)
```
┌─────────────┐     ┌──────────────────────────┐
│   GitHub    │────▶│    Single Worker v2      │
│    Repo     │     │  - Static Assets         │
└─────────────┘     │  - /ask endpoint         │
                    │  - /mcp endpoint         │
                    │  - /api/ingest           │
                    └──────────────────────────┘
                               │
                               ▼
                           AutoRAG
```

## New Features

### 1. Modern Endpoints
- **`/ask`** - Simplified search endpoint with streaming support
- **`/mcp`** - Model Context Protocol for AI assistants
- **`/api/ingest`** - Document ingestion (backward compatible)
- **`/api/status`** - Health check endpoint

### 2. Flexible LLM Configuration
- Use AutoRAG's built-in models (default)
- Or bring your own OpenAI/Azure models
- Per-request model override support

### 3. Static Asset Serving
- VitePress build served directly from Worker
- No separate Pages deployment needed
- Automatic fallback to index.html for SPA routing

## File Structure

```
obsidian-developer-docs/
├── worker-v2/               # New Worker (replaces both old worker and Pages)
│   ├── src/
│   │   └── index.ts        # Main Worker with all endpoints
│   ├── public/             # VitePress build output (populated by CI)
│   ├── wrangler.toml       # Worker configuration
│   └── package.json
├── workers/autorag-api/    # Old Worker (can be removed after migration)
└── .github/workflows/
    ├── deploy.yml          # Old workflow (can be removed)
    └── deploy-worker-v2.yml # New unified workflow
```

## Migration Steps

### Step 1: Deploy New Worker

1. Install dependencies:
```bash
cd worker-v2
npm install
```

2. Configure environment:
```bash
# Copy your existing credentials
cp ../.env.example .env
# Edit .env with your values
```

3. Test locally:
```bash
# Build VitePress first
cd ..
npm run build

# Copy assets to worker
cp -r en/.vitepress/dist/* worker-v2/public/

# Run worker locally
cd worker-v2
npm run dev
```

4. Deploy to production:
```bash
npm run deploy
```

### Step 2: Update DNS/Routing

If using custom domain:
1. Go to Cloudflare Dashboard → Workers & Pages
2. Select your new Worker `obsidian-docs-autorag`
3. Add custom domain (same as your old Pages domain)
4. DNS will automatically update

### Step 3: Update GitHub Secrets

Ensure these secrets are set in your repository:
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `INGESTION_TOKEN`
- (Optional) `OPENAI_API_KEY` or Azure credentials

### Step 4: Switch GitHub Actions

1. Disable old workflow:
```bash
# Rename to disable
mv .github/workflows/deploy.yml .github/workflows/deploy.yml.old
```

2. Enable new workflow:
```bash
# Already created as deploy-worker-v2.yml
# Push to trigger
git add .
git commit -m "Switch to Worker v2 deployment"
git push
```

### Step 5: Verify Deployment

Test all endpoints:
```bash
# Check static site
curl https://your-worker-domain/

# Test search
curl -X POST https://your-worker-domain/ask \
  -H "Content-Type: application/json" \
  -d '{"query": "How to create a plugin?"}'

# Test MCP
curl -X POST https://your-worker-domain/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "method": "initialize", "id": 1}'

# Check status
curl https://your-worker-domain/api/status
```

## API Compatibility

### Backward Compatible Endpoints
- `/api/autorag-search` → Still works, routes to `/ask`
- `/api/ingest` → Unchanged
- `/api/status` → Enhanced but compatible

### New Endpoints
- `/ask` → Simplified search with GET/POST support
- `/mcp` → Model Context Protocol for AI tools

### Breaking Changes
- `/api/render-ingest` → Removed (browser rendering)
- `/api/sync` → Removed (use AutoRAG dashboard)

## Configuration Options

### wrangler.toml
```toml
[vars]
RAG_ID = "obsidian-docs"          # Your AutoRAG instance
USE_EXTERNAL_LLM = ""              # "", "openai", or "azure"
DEFAULT_TOPK = "6"                 # Default search results
DEFAULT_THRESHOLD = "0.30"         # Minimum relevance score
STREAM_DEFAULT = "false"           # Enable streaming by default
ALLOWED_ORIGINS = "*"              # CORS (set to your domain in production)
```

### Environment Variables (Secrets)
Set via Wrangler or GitHub Secrets:
```bash
# Required
CLOUDFLARE_API_TOKEN=xxx
CLOUDFLARE_ACCOUNT_ID=xxx

# Optional
INGESTION_TOKEN=xxx        # For document updates
OPENAI_API_KEY=xxx        # If using OpenAI
AZURE_OPENAI_ENDPOINT=xxx  # If using Azure
AZURE_OPENAI_API_KEY=xxx
```

## Performance Optimization

### 1. Caching
- Worker automatically caches static assets
- AutoRAG includes similarity caching
- Consider adding Cache API for search results

### 2. Edge Locations
- Worker runs at all Cloudflare edge locations
- No need for separate CDN configuration

### 3. Bundle Size
- VitePress build is optimized and compressed
- Worker code is minimal (~10KB)

## Rollback Plan

If issues arise:

1. **Quick rollback**: Re-enable old workflow
```bash
mv .github/workflows/deploy.yml.old .github/workflows/deploy.yml
git commit -m "Rollback to Pages deployment"
git push
```

2. **DNS rollback**: Point domain back to Pages project

3. **Keep both running**: Run new Worker on subdomain first
```
docs.example.com → Old Pages
api.docs.example.com → New Worker
```

## Troubleshooting

### Static assets return 404
- Check `worker-v2/public/` contains VitePress build
- Verify `wrangler.toml` has correct assets configuration
- Ensure `run_worker_first: true` is set

### AutoRAG returns empty results
- Verify `RAG_ID` matches your AutoRAG instance name
- Check AutoRAG has indexed your content
- Lower `DEFAULT_THRESHOLD` to 0.2 for testing

### CORS errors
- Set `ALLOWED_ORIGINS` to your domain
- Use `"*"` for development only

### Streaming not working
- Check client accepts `text/event-stream`
- Set `stream=true` in request
- Ensure no proxy/CDN is buffering responses

## Monitoring

### Worker Analytics
```bash
# View real-time logs
cd worker-v2
npm run tail

# Or use Cloudflare Dashboard
# Workers & Pages → Your Worker → Analytics
```

### AutoRAG Monitoring
- Dashboard: AI → AutoRAG → Your Instance
- Check indexing status
- Monitor query patterns

## Cleanup After Migration

Once confirmed working, remove old files:
```bash
# Remove old worker
rm -rf workers/autorag-api/

# Remove old deployment file
rm DEPLOYMENT.md

# Remove old workflow
rm .github/workflows/deploy.yml.old

# Update README to reference new setup
```

## Benefits Summary

✅ **Single deployment** - One Worker serves everything
✅ **Modern architecture** - Aligns with Cloudflare's direction  
✅ **Better performance** - No inter-service latency
✅ **Simplified ops** - One log stream, one config
✅ **Cost efficient** - Single Worker billing
✅ **Future proof** - Ready for Cloudflare's unified platform

## Support

- Worker issues: Check `wrangler tail` logs
- AutoRAG issues: Check AI dashboard
- Static site issues: Verify build output in `public/`
- Search issues: Test with `/api/status` endpoint first