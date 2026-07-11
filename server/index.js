import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { GoogleGenAI } from '@google/genai';
import { readFileSync, existsSync, writeFileSync, readdirSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { buildAndSaveCache } from './refresh-cache.js';
import {
  buildAndSaveFileSearchStore,
  isFileSearchDataFresh,
  readFileSearchData
} from './refresh-file-search.js';
import { runSetup, SetupError } from './quickstart/services.js';
import { getStatusOverview } from './status.js';
import {
  ADMIN_COOKIE_NAME,
  createAdminSecurity,
  createDashboardSnapshot,
  createRequestMetrics,
  getAdminClearCookieOptions,
  getAdminCookieOptions
} from './admin.js';

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
const adminSecurity = createAdminSecurity();
const requestMetrics = createRequestMetrics();

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

const DOCS_DIR = resolve(__dirname, '..', 'docs');
let contentStatsCache = null;
let lastAdminFailureAt = null;

function readCookie(req, name) {
  const header = req.get('cookie') || '';
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return '';
    }
  }
  return '';
}

function requestUsesHttps(req) {
  const forwardedProtocol = String(req.get('x-forwarded-proto') || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  return req.secure || forwardedProtocol === 'https' || process.env.NODE_ENV === 'production';
}

function hasAllowedAdminOrigin(req) {
  const origin = req.get('origin');
  if (!origin) return true;

  let requestOrigin = '';
  try {
    requestOrigin = new URL(`${req.protocol}://${req.get('host')}`).origin;
  } catch {
    // ALLOWED_ORIGIN remains the authoritative fallback.
  }

  return origin === ALLOWED_ORIGIN || origin === requestOrigin;
}

function hideAdminEndpoint(res) {
  return res.status(404).json({ error: 'Not found.' });
}

function requireAdminSession(req, res, next) {
  const sessionToken = readCookie(req, ADMIN_COOKIE_NAME);
  const session = adminSecurity.verifySession(sessionToken);
  if (!session.ok) return hideAdminEndpoint(res);

  req.adminSessionToken = sessionToken;
  req.adminSession = session;
  next();
}

function readEnglishContentStats() {
  const now = Date.now();
  if (contentStatsCache && now - contentStatsCache.cachedAt < 60_000) {
    return contentStatsCache.value;
  }

  let pageCount = 0;
  let totalBytes = 0;
  let latestModifiedAt = 0;
  const pending = [DOCS_DIR];

  try {
    while (pending.length) {
      const directory = pending.pop();
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          if (entry.name === '.vitepress' || (directory === DOCS_DIR && entry.name === 'nl')) continue;
          pending.push(join(directory, entry.name));
          continue;
        }
        if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
        const stats = statSync(join(directory, entry.name));
        pageCount += 1;
        totalBytes += stats.size;
        latestModifiedAt = Math.max(latestModifiedAt, stats.mtimeMs);
      }
    }
  } catch (error) {
    console.warn('Admin content inventory unavailable:', error.message);
  }

  const value = {
    pageCount,
    totalBytes,
    lastUpdatedAt: latestModifiedAt ? new Date(latestModifiedAt).toISOString() : null
  };
  contentStatsCache = { cachedAt: now, value };
  return value;
}

function readMetadataCacheStats() {
  try {
    if (!existsSync(METADATA_CACHE_FILE)) return { metadataEntries: 0, metadataCacheBytes: 0 };
    return {
      metadataEntries: Object.keys(readMetadataCache()).length,
      metadataCacheBytes: statSync(METADATA_CACHE_FILE).size
    };
  } catch {
    return { metadataEntries: 0, metadataCacheBytes: 0 };
  }
}

function buildAdminOverview(session) {
  const fileSearchData = readFileSearchData();
  const cacheData = readCacheData();
  const docs = readEnglishContentStats();
  const metadata = readMetadataCacheStats();
  const cacheLoaded = isCacheValid(cacheData);
  const fileSearchLoaded = Boolean(fileSearchData?.storeName);
  const knowledgeLoaded = KNOWLEDGE_MODE === 'file-search' ? fileSearchLoaded : cacheLoaded;
  const integrations = {
    gemini: Boolean(process.env.GEMINI_API_KEY),
    trakt: Boolean(process.env.TRAKT_CLIENT_ID && process.env.TRAKT_CLIENT_SECRET),
    tmdb: Boolean(process.env.TMDB_API_KEY)
  };
  const content = {
    knowledgeLoaded,
    rebuilding: rebuildPromise !== null,
    fileSearchLoaded,
    cacheLoaded,
    knowledgeMode: KNOWLEDGE_MODE,
    model: GEMINI_MODEL,
    createdAt: fileSearchData?.createdAt || cacheData?.createdAt || null,
    checkedAt: fileSearchData?.checkedAt || null,
    nextCheckAt: fileSearchData?.nextCheckAt || null,
    cacheExpiresAt: cacheData?.expiresAt || null,
    fileCount: fileSearchData?.fileCount ?? cacheData?.fileCount ?? docs.pageCount,
    activeDocumentsCount: fileSearchData?.activeDocumentsCount ?? 0,
    contentChars: fileSearchData?.contentChars ?? cacheData?.contentChars ?? 0,
    estimatedTokens: cacheData?.estimatedTokens ?? 0,
    ...docs,
    ...metadata,
    integrations
  };
  const snapshot = createDashboardSnapshot({
    diskPaths: [{ label: 'server-data', path: __dirname }],
    content,
    metrics: requestMetrics,
    security: adminSecurity
  });
  const rawTraffic = snapshot.traffic || { summary: {}, minuteSeries: [], hourSeries: [], endpoints: [], recentRequests: [] };
  const summary = rawTraffic.summary || {};
  const mapPoint = (point) => ({
    ...point,
    at: point.startAt,
    averageLatencyMs: point.averageDurationMs,
    p95LatencyMs: point.p95DurationMs
  });
  const traffic = {
    ...rawTraffic,
    totalRequests: summary.requests || 0,
    activeRequests: summary.activeRequests || 0,
    errorRate: summary.requests ? summary.errors / summary.requests : 0,
    averageLatencyMs: summary.averageDurationMs || 0,
    p95LatencyMs: summary.p95DurationMs || 0,
    uniqueClients1h: summary.uniqueClientsLastHour || 0,
    uniqueClients24h: summary.uniqueClientsLast24Hours || 0,
    statusCodes: {
      successful: summary.successful || 0,
      '4xx': summary.clientErrors || 0,
      '5xx': summary.serverErrors || 0
    },
    minuteSeries: (rawTraffic.minuteSeries || []).map(mapPoint),
    hourSeries: (rawTraffic.hourSeries || []).map(mapPoint),
    endpoints: (rawTraffic.endpoints || []).map((endpoint) => ({
      ...endpoint,
      path: endpoint.route,
      averageLatencyMs: endpoint.averageDurationMs,
      p95LatencyMs: endpoint.p95DurationMs
    })),
    recentRequests: [...(rawTraffic.recentRequests || [])].reverse().map((request) => ({
      ...request,
      path: request.endpoint,
      status: request.statusCode
    }))
  };
  const primaryDisk = snapshot.disks?.find((disk) => disk.available) || null;
  const runtime = {
    ...snapshot.runtime,
    environment: process.env.NODE_ENV || 'development',
    platform: snapshot.system.platform,
    arch: snapshot.system.architecture,
    cpuCount: snapshot.system.cpuCount,
    loadAverage: snapshot.system.loadAverage,
    memory: {
      rss: snapshot.runtime.memory.rssBytes,
      heapUsed: snapshot.runtime.memory.heapUsedBytes,
      heapTotal: snapshot.runtime.memory.heapTotalBytes,
      external: snapshot.runtime.memory.externalBytes
    },
    systemMemory: {
      used: snapshot.system.memory.usedBytes,
      total: snapshot.system.memory.totalBytes
    },
    disk: primaryDisk ? { used: primaryDisk.usedBytes, total: primaryDisk.totalBytes } : null
  };
  const knowledge = {
    model: GEMINI_MODEL,
    mode: KNOWLEDGE_MODE,
    loaded: knowledgeLoaded,
    rebuilding: rebuildPromise !== null,
    fileSearch: {
      loaded: fileSearchLoaded,
      indexedDocuments: fileSearchData?.activeDocumentsCount ?? 0,
      sourceFiles: fileSearchData?.fileCount ?? 0,
      contentCharacters: fileSearchData?.contentChars ?? 0,
      createdAt: fileSearchData?.createdAt || null,
      checkedAt: fileSearchData?.checkedAt || null,
      nextCheckAt: fileSearchData?.nextCheckAt || null
    },
    cache: {
      loaded: cacheLoaded,
      sourceFiles: cacheData?.fileCount ?? 0,
      estimatedTokens: cacheData?.estimatedTokens ?? 0,
      expiresAt: cacheData?.expiresAt || null
    },
    content: docs
  };
  const securitySnapshot = snapshot.security || { counters: {} };

  return {
    ...snapshot,
    traffic,
    runtime,
    knowledge,
    integrations: {
      ...integrations,
      adminDashboard: adminSecurity.isConfigured()
    },
    security: {
      ...securitySnapshot,
      failedAttempts: securitySnapshot.counters?.unlockFailed || 0,
      rateLimitedAttempts: securitySnapshot.counters?.rateLimitedAttempts || 0,
      lastFailedAt: lastAdminFailureAt,
      currentSessionExpiresAt: session?.expiresAt || null
    }
  };
}


// ── Express app ─────────────────────────────────────────────────────────
const app = express();
app.set('trust proxy', true);

app.use(requestMetrics.middleware);

app.use(cors({
  origin: ALLOWED_ORIGIN,
  methods: ['POST', 'GET', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
  credentials: true
}));

app.use(express.json({ limit: '64kb' }));

app.use('/api/admin', (_req, res, next) => {
  res.set({
    'Cache-Control': 'no-store, max-age=0',
    Pragma: 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-Robots-Tag': 'noindex, nofollow',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'"
  });
  next();
});

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

const adminUnlockLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: (_req, res) => {
    adminSecurity.recordRateLimitedAttempt();
    lastAdminFailureAt = new Date().toISOString();
    hideAdminEndpoint(res);
  }
});

// ── Routes ──────────────────────────────────────────────────────────────

app.post('/api/admin/session', adminUnlockLimiter, (req, res) => {
  const result = adminSecurity.unlock(
    hasAllowedAdminOrigin(req) ? req.body?.secret : ''
  );
  if (!result.ok) {
    lastAdminFailureAt = new Date().toISOString();
    return hideAdminEndpoint(res);
  }

  res.cookie(
    ADMIN_COOKIE_NAME,
    result.sessionToken,
    getAdminCookieOptions({ secure: requestUsesHttps(req) })
  );
  res.status(201).json({
    ok: true,
    idleExpiresAt: result.idleExpiresAt,
    expiresAt: result.expiresAt
  });
});

app.get('/api/admin/session', requireAdminSession, (req, res) => {
  res.json({
    ok: true,
    idleExpiresAt: req.adminSession.idleExpiresAt,
    expiresAt: req.adminSession.expiresAt
  });
});

app.delete('/api/admin/session', (req, res) => {
  if (!hasAllowedAdminOrigin(req)) return hideAdminEndpoint(res);
  adminSecurity.revokeSession(readCookie(req, ADMIN_COOKIE_NAME));
  res.clearCookie(
    ADMIN_COOKIE_NAME,
    getAdminClearCookieOptions({ secure: requestUsesHttps(req) })
  );
  res.status(204).end();
});

app.get('/api/admin/overview', requireAdminSession, (req, res) => {
  res.json(buildAdminOverview(req.adminSession));
});

app.get('/api/status', async (req, res) => {
  try {
    const payload = await getStatusOverview({ provider: req.query.provider });
    res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=120');
    res.json(payload);
  } catch (error) {
    console.error('Status overview error:', error.message);
    res.status(502).json({ error: 'Live status data is temporarily unavailable.' });
  }
});

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
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'Nuvio-Trakt-Bridge/1.0'
      },
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
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'Nuvio-Trakt-Bridge/1.0'
      },
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

// ── Metadata Enrichment for Trakt Bridge ──────────────────────────────────
app.get('/api/trakt/tmdb-config', (req, res) => {
  res.json({ hasKey: !!process.env.TMDB_API_KEY });
});

const METADATA_CACHE_FILE = join(__dirname, 'metadata-cache.json');

function readMetadataCache() {
  if (!existsSync(METADATA_CACHE_FILE)) return {};
  try {
    return JSON.parse(readFileSync(METADATA_CACHE_FILE, 'utf-8'));
  } catch (e) {
    console.error('Failed to read metadata cache:', e);
    return {};
  }
}

function writeMetadataCache(cache) {
  try {
    writeFileSync(METADATA_CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8');
  } catch (e) {
    console.error('Failed to write metadata cache:', e);
  }
}

async function fetchTmdb(path, queryParams = {}) {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    throw new Error('TMDB_API_KEY is not configured on the server.');
  }
  const url = new URL(`https://api.themoviedb.org${path}`);
  url.searchParams.set('api_key', apiKey);
  Object.entries(queryParams).forEach(([key, val]) => {
    url.searchParams.set(key, String(val));
  });

  const response = await fetch(url.toString(), {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Nuvio-Trakt-Bridge/1.0'
    }
  });

  if (!response.ok) {
    throw new Error(`TMDB API HTTP error ${response.status}`);
  }
  return response.json();
}

async function fetchCinemeta(type, imdbId) {
  const cinemetaType = type === 'movie' ? 'movie' : 'series';
  const url = `https://v3-cinemeta.strem.io/meta/${cinemetaType}/${imdbId}.json`;
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Nuvio-Trakt-Bridge/1.0'
    }
  });
  if (!response.ok) {
    throw new Error(`Cinemeta API HTTP error ${response.status}`);
  }
  const data = await response.json();
  const meta = data?.meta;
  return {
    posterUrl: meta?.poster || null,
    releaseDate: meta?.released || null,
    source: 'cinemeta'
  };
}

app.post('/api/trakt/enrich-metadata', express.json({ limit: '10mb' }), async (req, res) => {
  try {
    const { items } = req.body;
    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ error: 'items array is required' });
    }

    const cache = readMetadataCache();
    const results = [];

    // Helper for concurrency limiting (max 5 parallel calls)
    const limit = 5;
    let index = 0;
    
    // Simple console tracking
    let enrichedCount = 0;
    let fallbackCount = 0;
    let missingCount = 0;
    let failedCount = 0;

    async function worker() {
      while (index < items.length) {
        const currentIndex = index++;
        const item = items[currentIndex];
        const type = item.content_type === 'movie' ? 'movie' : 'series';
        const name = item.name || 'Untitled';
        const ids = item._ids || {};

        const tmdbId = ids.tmdb;
        const imdbId = ids.imdb;

        if (!tmdbId && !imdbId) {
          missingCount++;
          console.log(`[Metadata] Missing IDs for "${name}" - cannot enrich.`);
          results[currentIndex] = {
            content_id: item.content_id,
            posterUrl: null,
            releaseDate: null,
            source: 'missing'
          };
          continue;
        }

        const tmdbCacheKey = tmdbId ? `${type}:tmdb:${tmdbId}` : null;
        const imdbCacheKey = imdbId ? `${type}:imdb:${imdbId}` : null;

        // Cache lookup
        let cachedVal = null;
        if (tmdbCacheKey && cache[tmdbCacheKey]) {
          cachedVal = cache[tmdbCacheKey];
        } else if (imdbCacheKey && cache[imdbCacheKey]) {
          cachedVal = cache[imdbCacheKey];
        }

        if (cachedVal) {
          if (cachedVal.source === 'tmdb') enrichedCount++;
          else if (cachedVal.source === 'cinemeta') fallbackCount++;
          else if (cachedVal.source === 'failed') failedCount++;
          
          results[currentIndex] = {
            content_id: item.content_id,
            posterUrl: cachedVal.posterUrl,
            releaseDate: cachedVal.releaseDate,
            source: cachedVal.source,
            fromCache: true
          };
          continue;
        }

        // Fetch
        try {
          const tmdbApiKey = process.env.TMDB_API_KEY;
          let resolvedTmdbId = tmdbId;
          let fetchSource = 'failed';
          let posterUrl = null;
          let releaseDate = null;

          if (tmdbApiKey) {
            if (!resolvedTmdbId && imdbId) {
              const findRes = await fetchTmdb(`/3/find/${imdbId}`, { external_source: 'imdb_id' });
              const resultsList = type === 'movie' ? findRes?.movie_results : findRes?.tv_results;
              if (resultsList && resultsList.length > 0) {
                resolvedTmdbId = resultsList[0].id;
              }
            }

            if (resolvedTmdbId) {
              if (type === 'movie') {
                const detail = await fetchTmdb(`/3/movie/${resolvedTmdbId}`);
                posterUrl = detail?.poster_path ? `https://image.tmdb.org/t/p/w500${detail.poster_path}` : null;
                releaseDate = detail?.release_date || null;
                fetchSource = 'tmdb';
              } else {
                const detail = await fetchTmdb(`/3/tv/${resolvedTmdbId}`);
                posterUrl = detail?.poster_path ? `https://image.tmdb.org/t/p/w500${detail.poster_path}` : null;
                releaseDate = detail?.first_air_date || null;
                fetchSource = 'tmdb';
              }
            }
          }

          // Fallback to Cinemeta
          if (fetchSource === 'failed' && imdbId) {
            try {
              const cinemeta = await fetchCinemeta(type, imdbId);
              posterUrl = cinemeta.posterUrl;
              releaseDate = cinemeta.releaseDate;
              fetchSource = 'cinemeta';
            } catch (e) {
              // Ignore cinemeta fail
            }
          }

          const cacheVal = {
            posterUrl,
            releaseDate,
            source: fetchSource,
            updatedAt: Date.now()
          };

          // Save to cache memory
          if (tmdbCacheKey) cache[tmdbCacheKey] = cacheVal;
          if (imdbCacheKey) cache[imdbCacheKey] = cacheVal;
          if (resolvedTmdbId) {
            cache[`${type}:tmdb:${resolvedTmdbId}`] = cacheVal;
          }

          // Logging
          if (fetchSource === 'tmdb') {
            enrichedCount++;
            console.log(`[Metadata] Enriched item "${name}" (TMDB) - Poster: ${posterUrl}, Release: ${releaseDate}`);
          } else if (fetchSource === 'cinemeta') {
            fallbackCount++;
            console.log(`[Metadata] Fallback Cinemeta item "${name}" - Poster: ${posterUrl}, Release: ${releaseDate}`);
          } else {
            failedCount++;
            console.log(`[Metadata] Failed to enrich "${name}" (tried TMDB/Cinemeta)`);
          }

          results[currentIndex] = {
            content_id: item.content_id,
            posterUrl,
            releaseDate,
            source: fetchSource
          };

        } catch (err) {
          failedCount++;
          console.error(`[Metadata] Error enriching "${name}":`, err.message);
          results[currentIndex] = {
            content_id: item.content_id,
            posterUrl: null,
            releaseDate: null,
            source: 'failed'
          };
        }
      }
    }

    const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
    await Promise.all(workers);

    // Save cache to file
    writeMetadataCache(cache);

    console.log(`[Metadata Sync] Completed enrichment batch: ${items.length} items. Enriched (TMDB): ${enrichedCount}, Fallback (Cinemeta): ${fallbackCount}, Missing: ${missingCount}, Failed: ${failedCount}`);

    res.json({ results });
  } catch (error) {
    console.error('Enrichment batch endpoint error:', error);
    res.status(500).json({ error: error.message });
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
