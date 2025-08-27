# Deployment Guide for Obsidian Developer Docs with AutoRAG

This guide explains how to deploy the Obsidian Developer Documentation site to Cloudflare Pages with AutoRAG search integration and continuous ingestion.

## Architecture Overview

- **Documentation Site**: VitePress static site hosted on Cloudflare Pages
- **Search API**: Cloudflare Worker providing AutoRAG search functionality
- **AutoRAG**: Cloudflare's managed RAG service for semantic search
- **Continuous Ingestion**: Automatic syncing of documentation updates to AutoRAG

## Prerequisites

1. Cloudflare account with:
   - Pages enabled
   - Workers enabled
   - R2 storage enabled
   - AutoRAG access

2. Required API tokens and IDs:
   - Cloudflare API Token (with Pages, Workers, R2, and AutoRAG permissions)
   - Cloudflare Account ID
   - AutoRAG instance name (already created as "obsidian-docs")

## Setup Instructions

### 1. Install Dependencies

```bash
# Install main dependencies
npm install

# Install Worker dependencies
cd workers/autorag-api
npm install
cd ../..
```

### 2. Configure Environment Variables

Create a `.env` file in the root directory:

```env
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_API_TOKEN=your-api-token
AUTORAG_NAME=obsidian-docs
INGESTION_TOKEN=your-secure-token
WORKER_URL=https://obsidian-docs-autorag-api.workers.dev
```

### 3. Deploy the Worker API

```bash
cd workers/autorag-api

# Configure wrangler (first time only)
npx wrangler login

# Update wrangler.toml with your account details
# Then deploy
npm run deploy
```

### 4. Deploy to Cloudflare Pages

#### Option A: GitHub Actions (Recommended)

1. Add secrets to your GitHub repository:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
   - `AUTORAG_NAME`
   - `INGESTION_TOKEN`

2. Push to main branch to trigger deployment:
   ```bash
   git add .
   git commit -m "Deploy documentation site with AutoRAG"
   git push origin main
   ```

#### Option B: Manual Deployment

```bash
# Build the site
npm run build

# Deploy using Wrangler
npx wrangler pages deploy en/.vitepress/dist \
  --project-name=obsidian-developer-docs \
  --production
```

### 5. Configure Custom Domain (Optional)

1. Go to Cloudflare Dashboard > Pages > Your Project > Custom domains
2. Add your domain (e.g., `docs.obsidian.md`)
3. Update DNS records as instructed

### 6. Initial Content Ingestion

Since your content is already in AutoRAG, this step is optional. For future updates:

```bash
# Run the ingestion script
WORKER_URL=https://your-worker.workers.dev \
INGESTION_TOKEN=your-token \
node scripts/ingest-docs.js
```

## Continuous Ingestion Workflow

The system supports three methods for keeping AutoRAG updated:

### 1. Automatic GitHub Actions
- Triggers on every push to main branch
- Syncs all changed documentation files
- Runs AutoRAG sync after ingestion

### 2. Manual Ingestion Script
```bash
npm run ingest
```

### 3. API-based Ingestion
```bash
curl -X POST https://your-worker.workers.dev/api/ingest \
  -H "Authorization: Bearer your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "path": "Plugins/NewFeature.md",
    "content": "# New Feature Documentation...",
    "metadata": {
      "category": "plugins",
      "version": "1.0.0"
    }
  }'
```

## Testing the Integration

### 1. Test Search Functionality

Open the deployed site and press `Ctrl+K` to open the AI search modal.

### 2. Test via API

```bash
curl -X POST https://your-worker.workers.dev/api/autorag-search \
  -H "Content-Type: application/json" \
  -d '{"query": "How to build a plugin?"}'
```

### 3. Check AutoRAG Status

```bash
curl https://your-worker.workers.dev/api/status
```

## Monitoring and Maintenance

### View Worker Logs
```bash
cd workers/autorag-api
npm run tail
```

### Monitor AutoRAG Indexing
1. Go to Cloudflare Dashboard > AI > AutoRAG
2. Select your "obsidian-docs" instance
3. Check Overview tab for indexing status

### Trigger Manual Sync
```bash
curl -X POST https://your-worker.workers.dev/api/sync \
  -H "Authorization: Bearer your-token"
```

## Customization

### Modify Search UI
Edit `en/.vitepress/theme/AutoRAGSearch.vue` to customize the search interface.

### Adjust Search Parameters
Edit `workers/autorag-api/src/index.ts` to modify:
- Number of results returned
- Score thresholds
- Query rewriting behavior

### Update Ingestion Rules
Modify `scripts/ingest-docs.js` to:
- Filter specific file types
- Add custom metadata
- Implement incremental updates

## Troubleshooting

### Search Not Working
1. Check Worker is deployed: `npx wrangler tail`
2. Verify AutoRAG binding in Worker
3. Check CORS headers in Worker response

### Content Not Updating
1. Check R2 bucket permissions
2. Verify AutoRAG sync is running
3. Check ingestion script logs

### Build Failures
1. Ensure Node.js 18+ is installed
2. Clear cache: `rm -rf node_modules package-lock.json`
3. Reinstall: `npm install`

## Security Considerations

1. **Ingestion Token**: Always use a secure token for the ingestion API
2. **API Token Storage**: Never commit API tokens to git
3. **CORS Configuration**: Restrict origins in production
4. **Rate Limiting**: Consider adding rate limiting to the Worker

## Performance Optimization

1. **Caching**: AutoRAG includes similarity caching by default
2. **CDN**: Cloudflare Pages includes CDN automatically
3. **Worker Location**: Deploy Worker close to your users
4. **Chunk Size**: Optimize AutoRAG chunk size for your content

## Support

For issues related to:
- **VitePress**: Check [VitePress docs](https://vitepress.dev)
- **Cloudflare Pages**: Visit [Pages docs](https://developers.cloudflare.com/pages)
- **AutoRAG**: See [AutoRAG docs](https://developers.cloudflare.com/autorag)
- **This setup**: Open an issue in the repository