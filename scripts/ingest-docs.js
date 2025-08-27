#!/usr/bin/env node

/**
 * Script to ingest documentation files to AutoRAG via the Worker API
 * This can be run locally or in CI/CD pipelines
 */

import { readdir, readFile } from 'fs/promises';
import { join, relative, extname } from 'path';

const WORKER_URL = process.env.WORKER_URL || 'https://obsidian-docs-autorag-api.workers.dev';
const INGESTION_TOKEN = process.env.INGESTION_TOKEN;
const DOCS_DIR = process.env.DOCS_DIR || './en';
const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';
const MAX_FILES = Number(process.env.MAX_FILES || '0');

/**
 * Recursively get all markdown files
 */
async function getMarkdownFiles(dir) {
  const files = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const path = join(dir, entry.name);
    
    if (entry.isDirectory()) {
      // Skip .vitepress directory
      if (entry.name === '.vitepress') continue;
      
      files.push(...await getMarkdownFiles(path));
    } else if (entry.isFile() && extname(entry.name) === '.md') {
      files.push(path);
    }
  }

  return files;
}

/**
 * Extract frontmatter from markdown content
 */
function extractFrontmatter(content) {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/;
  const match = content.match(frontmatterRegex);
  
  if (!match) return { content, metadata: {} };
  
  const frontmatter = match[1];
  const metadata = {};
  
  // Parse simple key-value pairs
  frontmatter.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split(':');
    if (key && valueParts.length) {
      metadata[key.trim()] = valueParts.join(':').trim();
    }
  });
  
  return {
    content: content.replace(frontmatterRegex, ''),
    metadata
  };
}

/**
 * Ingest a single file
 */
async function ingestFile(filePath) {
  try {
    const content = await readFile(filePath, 'utf-8');
    const relativePath = relative(DOCS_DIR, filePath);
    const { content: markdown, metadata } = extractFrontmatter(content);
    
    if (DRY_RUN) {
      console.log(`[dry-run] Would ingest: ${relativePath}`);
      return { dryRun: true, path: relativePath };
    }
    
    const response = await fetch(`${WORKER_URL}/api/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(INGESTION_TOKEN && { 'Authorization': `Bearer ${INGESTION_TOKEN}` })
      },
      body: JSON.stringify({
        path: relativePath,
        content: markdown,
        metadata: {
          ...metadata,
          source_file: relativePath,
          ingested_at: new Date().toISOString()
        }
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to ingest ${relativePath}: ${error}`);
    }

    const result = await response.json();
    console.log(`✓ Ingested: ${relativePath}`);
    return result;
  } catch (error) {
    console.error(`✗ Failed to ingest ${filePath}:`, error.message);
    throw error;
  }
}

/**
 * Main ingestion process
 */
async function main() {
  console.log('Starting documentation ingestion...');
  console.log(`Worker URL: ${WORKER_URL}`);
  console.log(`Docs directory: ${DOCS_DIR}`);
  if (DRY_RUN) console.log('Dry-run mode enabled: no data will be sent.');
  
  try {
    // Get all markdown files
    let files = await getMarkdownFiles(DOCS_DIR);
    console.log(`Found ${files.length} markdown files`);
    if (MAX_FILES > 0 && files.length > MAX_FILES) {
      files = files.slice(0, MAX_FILES);
      console.log(`Limiting to first ${files.length} files due to MAX_FILES.`);
    }
    
    // Ingest files in batches to avoid overwhelming the API
    const BATCH_SIZE = 5;
    const results = [];
    
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.allSettled(
        batch.map(file => ingestFile(file))
      );
      results.push(...batchResults);
      
      // Small delay between batches
      if (i + BATCH_SIZE < files.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    // Summary
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    
    console.log('\n=== Ingestion Summary ===');
    console.log(`Total files: ${files.length}`);
    console.log(`Successful: ${successful}`);
    console.log(`Failed: ${failed}`);
    
    // Trigger final sync
    if (successful > 0 && !DRY_RUN) {
      console.log('\nTriggering AutoRAG sync...');
      const syncResponse = await fetch(`${WORKER_URL}/api/sync`, {
        method: 'POST',
        headers: {
          ...(INGESTION_TOKEN && { 'Authorization': `Bearer ${INGESTION_TOKEN}` })
        }
      });
      
      if (syncResponse.ok) {
        console.log('✓ Sync triggered successfully');
      } else {
        console.warn('⚠ Sync trigger failed:', await syncResponse.text());
      }
    }
    
    process.exit(failed > 0 ? 1 : 0);
  } catch (error) {
    console.error('Ingestion failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
