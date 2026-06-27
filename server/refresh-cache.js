#!/usr/bin/env node

/**
 * Nuvio Wiki — Context Cache Refresh Script
 *
 * Collects all English wiki markdown files, concatenates them with
 * path headers, and creates a Gemini explicit context cache.
 *
 * Usage:
 *   node refresh-cache.js                  # default 48h TTL
 *   node refresh-cache.js --ttl 86400      # custom TTL in seconds
 */

import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, relative, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const GEMINI_MODEL = 'gemini-3.1-flash-lite';
const DOCS_DIR = join(__dirname, '..', 'docs');
const CACHE_FILE = join(__dirname, 'cache.json');

// Directories to exclude from the wiki content
const EXCLUDE_DIRS = new Set(['.vitepress', 'public', 'nl', 'node_modules']);

if (!process.env.GEMINI_API_KEY) {
  console.error('❌  GEMINI_API_KEY is not set. Copy .env.example to .env and add your key.');
  process.exit(1);
}

// Parse --ttl flag
const ttlIndex = process.argv.indexOf('--ttl');
const ttlSeconds = ttlIndex !== -1 && process.argv[ttlIndex + 1]
  ? parseInt(process.argv[ttlIndex + 1], 10)
  : 48 * 3600; // default 48 hours

// ── Collect markdown files ──────────────────────────────────────────────

function collectMarkdownFiles(dir, basePath = '') {
  const files = [];

  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const relativePath = basePath ? `${basePath}/${entry}` : entry;
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry)) continue;
      files.push(...collectMarkdownFiles(fullPath, relativePath));
    } else if (extname(entry) === '.md') {
      files.push({ fullPath, relativePath });
    }
  }

  return files;
}

// ── Build wiki content string ───────────────────────────────────────────

function buildWikiContent(files) {
  const sections = [];

  for (const { fullPath, relativePath } of files) {
    const content = readFileSync(fullPath, 'utf-8');

    // Convert file path to wiki URL path
    let urlPath = '/' + relativePath
      .replace(/\\/g, '/')
      .replace(/\/index\.md$/, '')
      .replace(/\.md$/, '');

    if (urlPath === '/index') urlPath = '/';

    sections.push(`\n${'='.repeat(72)}\nWIKI PAGE: ${urlPath}\nFILE: ${relativePath}\n${'='.repeat(72)}\n\n${content}`);
  }

  return sections.join('\n');
}

// ── Main ────────────────────────────────────────────────────────────────

async function main() {
  console.log('📚  Collecting wiki markdown files...');
  const files = collectMarkdownFiles(DOCS_DIR);
  console.log(`   Found ${files.length} markdown files\n`);

  for (const f of files) {
    console.log(`   • ${f.relativePath}`);
  }

  const wikiContent = buildWikiContent(files);
  const charCount = wikiContent.length;
  const estimatedTokens = Math.ceil(charCount / 4);
  console.log(`\n📝  Total content: ${charCount.toLocaleString()} chars (~${estimatedTokens.toLocaleString()} tokens)`);

  if (estimatedTokens < 4096) {
    console.warn('⚠️   Content may be below the 4,096 token minimum for context caching.');
    console.warn('     The API may reject the cache creation request.');
  }

  console.log(`\n🔄  Creating context cache (TTL: ${ttlSeconds}s = ${(ttlSeconds / 3600).toFixed(1)}h)...`);

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const systemInstruction = `You are the Nuvio Wiki Assistant, a helpful AI that answers questions exclusively about Nuvio based on the wiki documentation provided below.

Rules:
1. ONLY answer questions about Nuvio, its features, installation, settings, addons, integrations, and troubleshooting.
2. If asked about unrelated topics, politely say: "I can only help with Nuvio-related questions. Feel free to ask about installation, settings, addons, or troubleshooting!"
3. Link heavily and frequently to the relevant wiki page routes using markdown links (e.g. [Quick Start Guide](/quick-start), [iOS Installation](/installation/ios), [Debrid Settings](/integrations/debrid)). Provide links for almost every step or resource mentioned.
4. Keep answers extremely short, brief, and to the point. Do not write long explanations; summarize key points in a few bullet points or a single paragraph, and point the user directly to the linked wiki guides for full details.
5. If the wiki doesn't cover a topic, say so honestly and suggest checking the Discord community.
6. Never make up features or information not present in the wiki content.
7. Format your responses in markdown. Use **bold**, bullet points, and code blocks where appropriate.
8. When listing steps, use numbered lists for clarity.
9. The wiki pages are provided with their URL paths. Use these paths when creating links.`;

  try {
    const cache = await ai.caches.create({
      model: GEMINI_MODEL,
      config: {
        displayName: 'nuvio-wiki-content',
        systemInstruction: systemInstruction,
        contents: [
          {
            role: 'user',
            parts: [{ text: `Here is the complete Nuvio Wiki documentation:\n\n${wikiContent}` }]
          }
        ],
        ttl: `${ttlSeconds}s`
      }
    });

    const cacheData = {
      name: cache.name,
      displayName: cache.displayName || 'nuvio-wiki-content',
      model: GEMINI_MODEL,
      createdAt: new Date().toISOString(),
      ttlSeconds,
      expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
      fileCount: files.length,
      contentChars: charCount,
      estimatedTokens
    };

    writeFileSync(CACHE_FILE, JSON.stringify(cacheData, null, 2));

    console.log(`\n✅  Cache created successfully!`);
    console.log(`   Name: ${cache.name}`);
    console.log(`   Expires: ${cacheData.expiresAt}`);
    console.log(`   Saved to: ${CACHE_FILE}\n`);
  } catch (err) {
    console.error('\n❌  Failed to create cache:', err.message);
    if (err.message?.includes('too few tokens')) {
      console.error('   The content has too few tokens. Minimum is 4,096 tokens.');
    }
    process.exit(1);
  }
}

main();
