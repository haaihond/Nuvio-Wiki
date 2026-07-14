import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { GoogleGenAI } from '@google/genai';
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
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
import { createTraktOAuthStateStore } from './trakt-oauth.js';
import {
  createMetadataCache,
  DEFAULT_METADATA_CACHE_MAX_ENTRIES
} from './metadata-cache.js';
import {
  createMetadataEnricher,
  createRequestScheduler,
  MAX_METADATA_BATCH_ITEMS
} from './metadata-enrichment.js';
import {
  ADMIN_COOKIE_NAME,
  createAdminSecurity,
  createDashboardSnapshot,
  createRequestMetrics,
  createServerLogStore,
  createSetupDoctorFeedbackStore,
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
const METADATA_CACHE_DB_FILE = process.env.METADATA_CACHE_DB_FILE
  ? resolve(process.env.METADATA_CACHE_DB_FILE)
  : join(__dirname, 'metadata-cache.sqlite');
const LEGACY_METADATA_CACHE_FILE = join(__dirname, 'metadata-cache.json');
const METADATA_CACHE_MAX_ENTRIES = positiveInteger(
  process.env.METADATA_CACHE_MAX_ENTRIES,
  DEFAULT_METADATA_CACHE_MAX_ENTRIES
);
const METADATA_RATE_LIMIT_PER_MINUTE = positiveInteger(
  process.env.METADATA_RATE_LIMIT_PER_MINUTE,
  300
);
const METADATA_RATE_LIMIT_PER_HOUR = positiveInteger(
  process.env.METADATA_RATE_LIMIT_PER_HOUR,
  3_000
);
const METADATA_UPSTREAM_TIMEOUT_MS = positiveInteger(
  process.env.METADATA_UPSTREAM_TIMEOUT_MS,
  8_000
);
const METADATA_BATCH_TIMEOUT_MS = positiveInteger(
  process.env.METADATA_BATCH_TIMEOUT_MS,
  110_000
);

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

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
const setupDoctorFeedback = createSetupDoctorFeedbackStore();
const serverLogs = createServerLogStore();
const traktOAuthStates = createTraktOAuthStateStore({ allowedOrigins: ALLOWED_ORIGIN });

for (const [method, level] of Object.entries({
  log: 'info',
  info: 'info',
  warn: 'warn',
  error: 'error',
  debug: 'debug'
})) {
  const writeToConsole = console[method].bind(console);
  console[method] = (...values) => {
    serverLogs.record(level, values);
    writeToConsole(...values);
  };
}

const metadataCache = createMetadataCache({
  file: METADATA_CACHE_DB_FILE,
  legacyFile: LEGACY_METADATA_CACHE_FILE,
  maxEntries: METADATA_CACHE_MAX_ENTRIES
});
const metadataUpstreamScheduler = createRequestScheduler({
  maxConcurrent: 12,
  minTimeMs: 30
});

if (metadataCache.migratedEntries > 0) {
  console.log(`Migrated ${metadataCache.migratedEntries} legacy metadata cache entries to SQLite.`);
}

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
    return metadataCache.stats();
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
    setupDoctorFeedback: setupDoctorFeedback.snapshot(),
    serverLogs: serverLogs.snapshot(),
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
// These are deliberately high, abuse-oriented ceilings. A 20k-item library
// uses roughly 50 client batches with the current browser chunk size.
const metadataPerMinute = rateLimit({
  windowMs: 60_000,
  max: METADATA_RATE_LIMIT_PER_MINUTE,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Metadata enrichment request limit reached. Please retry shortly.' },
  keyGenerator: (req) => req.ip
});

const metadataPerHour = rateLimit({
  windowMs: 60 * 60_000,
  max: METADATA_RATE_LIMIT_PER_HOUR,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Metadata enrichment hourly limit reached. Please retry later.' },
  keyGenerator: (req) => req.ip
});

const app = express();
app.set('trust proxy', 1);

app.use(requestMetrics.middleware);

app.use(cors({
  origin: ALLOWED_ORIGIN,
  methods: ['POST', 'GET', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
  credentials: true
}));

// This route intentionally accepts larger payloads, so its parser must run
// before the global 64 KB parser consumes (or rejects) the request stream.
app.use(
  '/api/trakt/enrich-metadata',
  metadataPerMinute,
  metadataPerHour,
  express.json({ limit: '2mb' })
);
app.use(express.json({ limit: '64kb' }));

app.use((error, req, res, next) => {
  if (error?.type === 'entity.too.large') {
    const isMetadataRoute = req.path === '/api/trakt/enrich-metadata';
    return res.status(413).json({
      error: isMetadataRoute
        ? `Metadata batches are limited to 2 MB and ${MAX_METADATA_BATCH_ITEMS} items.`
        : 'JSON request body is too large.'
    });
  }
  return next(error);
});

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

const setupFeedbackLimiter = rateLimit({
  windowMs: 10 * 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many feedback submissions. Please try again later.' },
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

app.post('/api/setup-doctor/feedback', setupFeedbackLimiter, (req, res) => {
  const result = setupDoctorFeedback.record(req.body);
  if (!result.ok) return res.status(400).json({ error: 'Invalid feedback payload.' });
  res.status(201).json({ ok: true });
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

    const requestedReturnOrigin = req.body?.return_origin || req.get('origin') || ALLOWED_ORIGIN;
    const oauthTransaction = traktOAuthStates.issue(requestedReturnOrigin);
    if (!oauthTransaction) {
      return res.status(400).json({ error: 'The requested OAuth return origin is not allowed.' });
    }
    
    // We construct the redirect_uri dynamically based on the current host
    const redirectUri = getRedirectUri(req);
    const url = `https://trakt.tv/oauth/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(oauthTransaction.state)}`;

    res.json({ url, state: oauthTransaction.state, client_id: clientId });
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
    const oauthTransaction = traktOAuthStates.consume(stateStr);
    if (!oauthTransaction) {
      return res.status(400).send('Invalid or expired state parameter.');
    }
    const { returnOrigin } = oauthTransaction;

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
                state: ${JSON.stringify(stateStr)},
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

function timeoutError(message) {
  const error = new Error(message);
  error.name = 'TimeoutError';
  return error;
}

function isTransientMetadataError(error) {
  return error?.name === 'AbortError'
    || error?.name === 'TimeoutError'
    || error?.name === 'TypeError'
    || error?.name === 'SyntaxError'
    || error?.name === 'OverloadError'
    || error?.status === 429
    || error?.status >= 500;
}

async function fetchScheduledJson(url, { headers, signal, service }) {
  return metadataUpstreamScheduler.schedule(async () => {
    const controller = new AbortController();
    const onAbort = () => controller.abort(signal?.reason);
    const timeout = setTimeout(() => {
      controller.abort(timeoutError(`${service} did not respond within ${METADATA_UPSTREAM_TIMEOUT_MS}ms.`));
    }, METADATA_UPSTREAM_TIMEOUT_MS);
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) onAbort();

    try {
      const response = await fetch(url, { headers, signal: controller.signal });
      if (!response.ok) {
        const error = new Error(`${service} API HTTP error ${response.status}`);
        error.status = response.status;
        throw error;
      }
      return await response.json();
    } catch (error) {
      if (controller.signal.reason?.name === 'TimeoutError') throw controller.signal.reason;
      throw error;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
    }
  }, { signal });
}

async function fetchTmdb(path, queryParams = {}, signal) {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    throw new Error('TMDB_API_KEY is not configured on the server.');
  }
  const url = new URL(`https://api.themoviedb.org${path}`);
  url.searchParams.set('api_key', apiKey);
  Object.entries(queryParams).forEach(([key, val]) => {
    url.searchParams.set(key, String(val));
  });

  return fetchScheduledJson(url.toString(), {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Nuvio-Trakt-Bridge/1.0'
    },
    signal,
    service: 'TMDB'
  });
}

async function fetchCinemeta(type, imdbId, signal) {
  const cinemetaType = type === 'movie' ? 'movie' : 'series';
  const url = `https://v3-cinemeta.strem.io/meta/${cinemetaType}/${encodeURIComponent(imdbId)}.json`;
  const data = await fetchScheduledJson(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Nuvio-Trakt-Bridge/1.0'
    },
    signal,
    service: 'Cinemeta'
  });
  const meta = data?.meta;
  return {
    posterUrl: meta?.poster || null,
    releaseDate: meta?.released || null,
    source: 'cinemeta'
  };
}

async function resolveMetadata(item, { signal }) {
  let resolvedTmdbId = item.tmdbId;
  let sawTransientFailure = false;

  if (process.env.TMDB_API_KEY) {
    try {
      if (!resolvedTmdbId && item.imdbId) {
        const findRes = await fetchTmdb(
          `/3/find/${encodeURIComponent(item.imdbId)}`,
          { external_source: 'imdb_id' },
          signal
        );
        const matches = item.type === 'movie' ? findRes?.movie_results : findRes?.tv_results;
        if (matches?.length) resolvedTmdbId = String(matches[0].id);
      }

      if (resolvedTmdbId) {
        const detail = await fetchTmdb(
          item.type === 'movie' ? `/3/movie/${resolvedTmdbId}` : `/3/tv/${resolvedTmdbId}`,
          {},
          signal
        );
        return {
          posterUrl: detail?.poster_path
            ? `https://image.tmdb.org/t/p/w500${detail.poster_path}`
            : null,
          releaseDate: item.type === 'movie'
            ? detail?.release_date || null
            : detail?.first_air_date || null,
          source: 'tmdb',
          resolvedTmdbId
        };
      }
    } catch (error) {
      sawTransientFailure ||= isTransientMetadataError(error);
    }
  }

  if (!signal?.aborted && item.imdbId) {
    try {
      const fallback = await fetchCinemeta(item.type, item.imdbId, signal);
      return { ...fallback, resolvedTmdbId };
    } catch (error) {
      sawTransientFailure ||= isTransientMetadataError(error);
    }
  }

  return {
    posterUrl: null,
    releaseDate: null,
    source: 'failed',
    resolvedTmdbId,
    cacheable: !sawTransientFailure && !signal?.aborted,
    retryable: sawTransientFailure || signal?.aborted
  };
}

const metadataEnricher = createMetadataEnricher({
  cache: metadataCache,
  fetchMetadata: resolveMetadata
});

app.post('/api/trakt/enrich-metadata', async (req, res) => {
  const batchController = new AbortController();
  let deadlineReached = false;
  let clientAborted = false;
  const batchTimeout = setTimeout(() => {
    deadlineReached = true;
    batchController.abort(timeoutError('Metadata enrichment batch deadline reached.'));
  }, METADATA_BATCH_TIMEOUT_MS);
  const abortForClient = () => {
    clientAborted = true;
    batchController.abort();
  };
  const abortForClosedResponse = () => {
    if (!res.writableEnded) abortForClient();
  };
  req.once('aborted', abortForClient);
  res.once('close', abortForClosedResponse);

  try {
    const { items } = req.body || {};
    const { results, summary } = await metadataEnricher.enrich(items, {
      signal: batchController.signal
    });

    console.log(
      `[Metadata Sync] ${items.length} items; ${summary.uniqueFetches} unique misses; `
      + `${summary.cached} cached; ${summary.enriched} TMDB; ${summary.fallback} Cinemeta; `
      + `${summary.missing} missing IDs; ${summary.failed} failed.`
    );

    if (!clientAborted && !res.writableEnded) {
      res.json({
        results,
        meta: {
          ...summary,
          partial: deadlineReached,
          maxBatchItems: MAX_METADATA_BATCH_ITEMS
        }
      });
    }
  } catch (error) {
    console.error('Enrichment batch endpoint error:', error);
    if (!clientAborted && !res.headersSent) {
      res.status(error.status || 500).json({
        error: error.status ? error.message : 'Metadata enrichment failed.'
      });
    }
  } finally {
    clearTimeout(batchTimeout);
    req.removeListener('aborted', abortForClient);
    res.removeListener('close', abortForClosedResponse);
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
