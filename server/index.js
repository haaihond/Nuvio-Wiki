import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { GoogleGenAI } from '@google/genai';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { buildAndSaveCache } from './refresh-cache.js';
import {
  buildAndSaveFileSearchStore,
  isFileSearchDataFresh,
  readFileSearchData
} from './refresh-file-search.js';
import { runSetup, SetupError } from './quickstart/services.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Config ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'http://localhost:5173';
const GEMINI_MODEL = 'gemini-3.1-flash-lite';
const KNOWLEDGE_MODE = (process.env.KNOWLEDGE_MODE || 'file-search').trim().toLowerCase();
const CACHE_FILE = process.env.CACHE_DATA_FILE
  ? resolve(process.env.CACHE_DATA_FILE)
  : join(__dirname, 'cache.json');

if (!['file-search', 'cache'].includes(KNOWLEDGE_MODE)) {
  console.error('❌  KNOWLEDGE_MODE must be either "file-search" or "cache".');
  process.exit(1);
}

if (!process.env.GEMINI_API_KEY) {
  console.error('❌  GEMINI_API_KEY is not set. Copy .env.example to .env and add your key.');
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// ── Cache state ──────────────────────────────────────────────────────────

/**
 * In-progress rebuild promise (acts as a mutex).
 * Set while a rebuild is running; null when idle.
 * All concurrent requests that arrive during a rebuild await the same promise.
 * @type {Promise<string> | null}
 */
let rebuildPromise = null;

/** Read cache.json and return its parsed data, or null if missing/corrupt. */
function readCacheData() {
  if (!existsSync(CACHE_FILE)) return null;
  try {
    return JSON.parse(readFileSync(CACHE_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

/** Returns true if the cache.json entry is present and not yet expired. */
function isCacheValid(data) {
  if (!data?.name || !data?.expiresAt) return false;
  return new Date(data.expiresAt) > new Date();
}

/**
 * Ensure a valid context cache exists.
 *
 * - If cache.json exists and `expiresAt` is in the future, return the name immediately.
 * - Otherwise, trigger a rebuild (or join an in-progress one) and return the new name.
 *
 * All concurrent callers awaiting a rebuild share the same promise so Gemini
 * is only hit once.
 *
 * @returns {Promise<string | null>} Cache name, or null if rebuild fails.
 */
async function ensureCache() {
  const data = readCacheData();

  if (isCacheValid(data)) {
    return data.name;
  }

  // Cache is missing or expired — rebuild (or join an in-progress rebuild).
  if (!rebuildPromise) {
    console.log('⚠️   Cache expired or missing — triggering lazy rebuild...');
    rebuildPromise = buildAndSaveCache()
      .finally(() => {
        rebuildPromise = null;
      });
  } else {
    console.log('⏳  Rebuild already in progress — queuing behind it...');
  }

  try {
    const newCacheName = await rebuildPromise;
    return newCacheName;
  } catch (err) {
    console.error('❌  Lazy cache rebuild failed:', err.message);
    return null;
  }
}

/**
 * Ensure a usable File Search store exists. A stale store remains available if
 * its scheduled content check fails, which is safer than dropping all context.
 *
 * @returns {Promise<string | null>} File Search store name, or null on failure.
 */
async function ensureFileSearchStore() {
  const data = readFileSearchData();

  if (isFileSearchDataFresh(data)) {
    return data.storeName;
  }

  if (!rebuildPromise) {
    console.log('⚠️   File Search store missing or due for a content check...');
    rebuildPromise = buildAndSaveFileSearchStore()
      .finally(() => {
        rebuildPromise = null;
      });
  } else {
    console.log('⏳  Knowledge refresh already in progress — queuing behind it...');
  }

  try {
    return await rebuildPromise;
  } catch (err) {
    console.error('❌  File Search refresh failed:', err.message);
    if (data?.storeName) {
      console.warn('⚠️   Continuing with the previous File Search store.');
      return data.storeName;
    }
    return null;
  }
}

function ensureKnowledge() {
  return KNOWLEDGE_MODE === 'cache' ? ensureCache() : ensureFileSearchStore();
}

// ── Helpers ─────────────────────────────────────────────────────────────

/** System prompt used when there is NO cache (fallback) */
const FALLBACK_SYSTEM = `You are the Nuvio Wiki Assistant. You help users with questions about Nuvio.
However, the wiki content cache has not been loaded yet. Please tell the user:
"The wiki knowledge base hasn't been loaded yet. The site administrator needs to run the cache refresh script. In the meantime, I can only provide very general guidance about Nuvio."
Keep answers brief and honest about your limited knowledge.`;

/** Build the system instruction for the model */
const WIKI_SYSTEM = `You are the Nuvio Wiki Assistant, a helpful AI that answers questions exclusively about Nuvio based on the wiki documentation provided in your context.

Rules:
1. ONLY answer questions about Nuvio, its features, installation, settings, addons, integrations, and troubleshooting.
2. If asked about unrelated topics, politely say: "I can only help with Nuvio-related questions. Feel free to ask about installation, settings, addons, or troubleshooting!"
3. Link heavily and frequently to the relevant wiki page routes using markdown links (e.g. [Quick Start Guide](/quick-start), [iOS Installation](/installation/ios), [Debrid Settings](/integrations/debrid)). Provide links for almost every step or resource mentioned.
4. Keep answers extremely short, brief, and to the point. Do not write long explanations; summarize key points in a few bullet points or a single paragraph, and point the user directly to the linked wiki guides for full details.
5. If the wiki doesn't cover a topic, say so honestly and suggest checking the Discord community.
6. Never make up features or information not present in the wiki content.
7. Format your responses in markdown. Use **bold**, bullet points, and code blocks where appropriate.
8. When listing steps, use numbered lists for clarity.
9. Every retrieved document identifies its WIKI PAGE route. Use that exact route for internal markdown links.`;

/** Helper to generate the Trakt redirect URI dynamically, enforcing HTTPS in production. */
function getRedirectUri(req) {
  const host = req.get('host') || '';
  const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1');
  const protocol = isLocalhost ? req.protocol : 'https';
  const uri = `${protocol}://${host}/api/trakt/callback`;
  console.log(`[Trakt API] Generated redirect URI: ${uri}`);
  return uri;
}


// ── Express app ─────────────────────────────────────────────────────────
const app = express();
app.set('trust proxy', true);

app.use(cors({
  origin: ALLOWED_ORIGIN,
  methods: ['POST', 'GET', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));

app.use(express.json({ limit: '64kb' }));

// Rate limiters
const perMinute = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please wait a moment before asking again.' },
  keyGenerator: (req) => req.ip
});

const perHour = rateLimit({
  windowMs: 60 * 60_000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Hourly limit reached. Please try again later.' },
  keyGenerator: (req) => req.ip
});

const setupLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many setup attempts. Please wait a few minutes.' },
  keyGenerator: (req) => req.ip
});

// ── Routes ──────────────────────────────────────────────────────────────

app.get('/api/ai/health', (_req, res) => {
  const cacheData = readCacheData();
  const fileSearchData = readFileSearchData();
  const cacheValid = isCacheValid(cacheData);
  const fileSearchLoaded = Boolean(fileSearchData?.storeName);
  const knowledgeLoaded = KNOWLEDGE_MODE === 'cache' ? cacheValid : fileSearchLoaded;

  res.json({
    status: 'ok',
    model: GEMINI_MODEL,
    knowledgeMode: KNOWLEDGE_MODE,
    knowledgeLoaded,
    rebuilding: rebuildPromise !== null,
    fileSearchStoreName: KNOWLEDGE_MODE === 'file-search' && fileSearchLoaded
      ? fileSearchData.storeName
      : null,
    fileSearchNextCheckAt: fileSearchData?.nextCheckAt || null,
    cacheLoaded: KNOWLEDGE_MODE === 'cache' && cacheValid,
    cacheName: KNOWLEDGE_MODE === 'cache' && cacheValid ? cacheData.name : null,
    cacheExpiresAt: cacheData?.expiresAt || null
  });
});

app.post('/api/ai/setup', setupLimiter, async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });

  try {
    const input = req.body;
    res.write(`${JSON.stringify({
      type: 'progress',
      step: 'details',
      message: 'Details validated'
    })}\n`);

    const result = await runSetup(input, (step, message) => {
      res.write(`${JSON.stringify({ type: 'progress', step, message })}\n`);
    });

    res.write(`${JSON.stringify({ type: 'result', data: result })}\n`);
  } catch (error) {
    const setupError =
      error instanceof SetupError
        ? error
        : new SetupError('Setup failed unexpectedly. Please try again.');
    res.write(`${JSON.stringify({
      type: 'error',
      step: setupError.step,
      message: setupError.message,
      status: setupError.status
    })}\n`);
  } finally {
    res.end();
  }
});

app.post('/api/trakt/login-url', async (req, res) => {
  try {
    const clientId = process.env.TRAKT_CLIENT_ID;
    if (!clientId) {
      return res.status(500).json({ error: 'TRAKT_CLIENT_ID is not configured on the server.' });
    }

    const stateValue = Math.random().toString(36).substring(2, 15);
    const returnOrigin = req.body.return_origin || req.get('origin') || 'http://localhost:5173';
    const stateParam = `${stateValue}:${Buffer.from(returnOrigin).toString('base64')}`;
    
    // We construct the redirect_uri dynamically based on the current host
    const redirectUri = getRedirectUri(req);
    const url = `https://trakt.tv/oauth/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(stateParam)}`;

    res.json({ url, state: stateParam, client_id: clientId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/trakt/callback', async (req, res) => {
  try {
    const clientId = process.env.TRAKT_CLIENT_ID;
    const clientSecret = process.env.TRAKT_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return res.status(500).send('TRAKT_CLIENT_ID or TRAKT_CLIENT_SECRET is not configured on the server.');
    }

    const { code, state } = req.query;
    if (!code || !state) {
      return res.status(400).send('Missing code or state parameter.');
    }

    const stateStr = String(state);
    const colonIdx = stateStr.indexOf(':');
    if (colonIdx === -1) {
      return res.status(400).send('Invalid state parameter.');
    }
    const returnOriginBase64 = stateStr.substring(colonIdx + 1);
    let returnOrigin = 'http://localhost:5173';
    try {
      returnOrigin = Buffer.from(returnOriginBase64, 'base64').toString('utf8');
    } catch (e) {
      console.error('Failed to decode return_origin:', e);
    }

    const redirectUri = getRedirectUri(req);
    const response = await fetch('https://api.trakt.tv/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(500).send(`Trakt token exchange failed: ${errText}`);
    }

    const tokens = await response.json();

    res.setHeader('Content-Type', 'text/html');
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Trakt Auth Callback</title>
      </head>
      <body style="background: #0d0e12; color: #ffffff; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0;">
        <div style="text-align: center; border: 1px solid #1c1e24; border-radius: 12px; padding: 24px; background: #07080a;">
          <p style="margin: 0 0 12px 0; font-size: 16px; font-weight: 600;">Authentication successful!</p>
          <p style="margin: 0; font-size: 14px; color: #9ca3af;">Returning to the wiki...</p>
        </div>
        <script>
          try {
            if (window.opener) {
              window.opener.postMessage({
                source: 'trakt-oauth',
                status: 'success',
                state: ${JSON.stringify(state)},
                client_id: ${JSON.stringify(clientId)},
                tokens: ${JSON.stringify(tokens)}
              }, ${JSON.stringify(returnOrigin)});
              window.close();
            } else {
              document.querySelector('div').innerHTML = '<p style="margin: 0; font-size: 16px;">Authentication successful! You can close this window now.</p>';
            }
          } catch (err) {
            console.error('Error posting message back:', err);
            document.querySelector('div').innerHTML = '<p style="margin: 0; color: #ef4444;">Failed to communicate with main window. Please close this window and try again.</p>';
          }
        </script>
      </body>
      </html>
    `);
  } catch (error) {
    res.status(500).send(`Server error: ${error.message}`);
  }
});

app.post('/api/trakt/refresh', async (req, res) => {
  try {
    const clientId = process.env.TRAKT_CLIENT_ID;
    const clientSecret = process.env.TRAKT_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return res.status(500).json({ error: 'TRAKT_CLIENT_ID or TRAKT_CLIENT_SECRET is not configured on the server.' });
    }

    const { refresh_token } = req.body;
    if (!refresh_token) {
      return res.status(400).json({ error: 'Missing refresh_token.' });
    }

    const redirectUri = getRedirectUri(req);
    const response = await fetch('https://api.trakt.tv/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        refresh_token,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'refresh_token'
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: `Trakt token refresh failed: ${errText}` });
    }

    const tokens = await response.json();
    res.json(tokens);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/ai/chat', perMinute, perHour, async (req, res) => {
  try {
    const { messages } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    // Validate messages
    for (const msg of messages) {
      if (!msg.role || !msg.content) {
        return res.status(400).json({ error: 'Each message must have role and content' });
      }
      if (!['user', 'model'].includes(msg.role)) {
        return res.status(400).json({ error: 'Role must be "user" or "model"' });
      }
    }

    // The last message must be from the user
    if (messages[messages.length - 1].role !== 'user') {
      return res.status(400).json({ error: 'Last message must be from user' });
    }

    // Cap conversation length to prevent abuse
    if (messages.length > 30) {
      return res.status(400).json({ error: 'Conversation too long. Please start a new chat.' });
    }

    // Ensure the configured knowledge backend is available. A first-time File
    // Search build can take a little while; concurrent callers share one build.
    const knowledgeName = await ensureKnowledge();

    // Build the request config. Only the private File Search store is enabled;
    // Google Search and every other external tool remain disabled.
    const config = {
      tools: [],
    };

    if (knowledgeName && KNOWLEDGE_MODE === 'file-search') {
      config.systemInstruction = WIKI_SYSTEM;
      config.tools = [{
        fileSearch: {
          fileSearchStoreNames: [knowledgeName]
        }
      }];
    } else if (knowledgeName && KNOWLEDGE_MODE === 'cache') {
      config.cachedContent = knowledgeName;
    } else {
      // Knowledge setup failed — be explicit instead of hallucinating.
      config.systemInstruction = FALLBACK_SYSTEM;
    }

    // Convert messages to Gemini format
    const contents = messages.map((msg) => ({
      role: msg.role === 'model' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }));

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Nginx: disable buffering
    res.flushHeaders();

    // Stream the response
    const stream = await ai.models.generateContentStream({
      model: GEMINI_MODEL,
      contents,
      config
    });

    for await (const chunk of stream) {
      const text = chunk.text;
      if (text) {
        res.write(`data: ${JSON.stringify({ text })}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    console.error('Chat error:', err);

    // If headers haven't been sent, send JSON error
    if (!res.headersSent) {
      const status = err.status || err.httpStatusCode || 500;
      return res.status(status).json({
        error: err.message || 'An error occurred while processing your request.'
      });
    }

    // If streaming already started, send error event
    res.write(`data: ${JSON.stringify({ error: err.message || 'Stream error' })}\n\n`);
    res.end();
  }
});

// ── Start ───────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  const cacheData = readCacheData();
  const fileSearchData = readFileSearchData();
  const cacheValid = isCacheValid(cacheData);
  console.log(`\n🤖  Nuvio Wiki AI server running on http://localhost:${PORT}`);
  console.log(`📦  Model: ${GEMINI_MODEL}`);
  console.log(`🧠  Knowledge mode: ${KNOWLEDGE_MODE}`);
  console.log(`🔗  CORS origin: ${ALLOWED_ORIGIN}`);

  if (KNOWLEDGE_MODE === 'file-search' && fileSearchData?.storeName) {
    console.log(`✅  File Search store loaded: ${fileSearchData.storeName}`);
    console.log(`⏰  Next content check: ${fileSearchData.nextCheckAt}`);
  } else if (KNOWLEDGE_MODE === 'file-search') {
    console.log('⚠️   No File Search store found — will build lazily on first request.');
  } else if (cacheValid) {
    console.log(`✅  Context cache loaded: ${cacheData.name}`);
    console.log(`⏰  Cache expires: ${cacheData.expiresAt}`);
  } else {
    console.log('⚠️   No valid context cache found — will rebuild lazily on first request.');
  }
  console.log('');
});
