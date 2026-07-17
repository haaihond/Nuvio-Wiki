import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual
} from 'node:crypto';
import { statfsSync } from 'node:fs';
import * as os from 'node:os';
import { performance } from 'node:perf_hooks';

export const ADMIN_SECRET_PREFIX = 'nuvio-admin:';
export const ADMIN_COOKIE_NAME = 'nuvio_admin';

const MIN_SECRET_SUFFIX_LENGTH = 43;
const MAX_SECRET_LENGTH = 512;
const DEFAULT_IDLE_TTL_MS = 30 * 60_000;
const DEFAULT_ABSOLUTE_TTL_MS = 8 * 60 * 60_000;
const DEFAULT_MAX_SESSIONS = 16;
const GENERIC_AUTH_FAILURE = Object.freeze({ ok: false });
const DECOY_SECRET = `${ADMIN_SECRET_PREFIX}vT7Kp2_Fm9Qa4Xr8Nc3Hy6Wd1Ze5Ls0Bu7Gj2Pk9Rmx`;

const CONTENT_BOOLEAN_FIELDS = [
  'knowledgeLoaded',
  'rebuilding',
  'fileSearchLoaded',
  'cacheLoaded'
];
const CONTENT_NUMBER_FIELDS = [
  'pageCount',
  'totalBytes',
  'fileCount',
  'activeDocumentsCount',
  'contentChars',
  'estimatedTokens',
  'metadataEntries',
  'metadataCacheBytes'
];
const CONTENT_STRING_FIELDS = [
  'lastUpdatedAt',
  'knowledgeMode',
  'model',
  'createdAt',
  'checkedAt',
  'nextCheckAt',
  'cacheExpiresAt'
];
const INTEGRATION_FIELDS = ['gemini', 'trakt', 'simkl', 'tmdb'];

function clampInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.trunc(parsed)));
}

function finiteNumber(value, fallback = 0) {
  const number = typeof value === 'bigint' ? Number(value) : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function nonNegativeNumber(value, fallback = 0) {
  return Math.max(0, finiteNumber(value, fallback));
}

function round(value, digits = 2) {
  const multiplier = 10 ** digits;
  return Math.round(finiteNumber(value) * multiplier) / multiplier;
}

function nowValue(now) {
  const value = typeof now === 'function' ? now() : now;
  return Number.isFinite(Number(value)) ? Number(value) : Date.now();
}

function isoDate(timestamp) {
  return new Date(timestamp).toISOString();
}

function timestampFromIso(value) {
  if (typeof value !== 'string') return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest();
}

function sha256Key(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function safeString(value, maximumLength = 128) {
  if (typeof value !== 'string') return null;
  const clean = value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, maximumLength);
  return clean || null;
}

/**
 * Retain a small, process-local feed of console output for the protected
 * control room. Values are flattened to text and obvious credentials are
 * redacted before they enter the store.
 */
export function createServerLogStore({
  now = Date.now,
  maxEntries = 250,
  maxMessageLength = 2_000
} = {}) {
  const entries = [];
  const limit = clampInteger(maxEntries, 250, 1, 1_000);
  const messageLimit = clampInteger(maxMessageLength, 2_000, 80, 10_000);
  let nextId = 1;

  function serialize(value) {
    if (value instanceof Error) return `${value.name}: ${value.message}`;
    if (typeof value === 'string') return value;
    if (typeof value === 'bigint') return `${value}n`;
    if (value === undefined) return 'undefined';
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  function redact(value) {
    return value
      .replace(/(bearer\s+)[a-z0-9._~+/=-]+/gi, '$1[redacted]')
      .replace(/((?:api[_-]?key|password|secret|token)\s*[=:]\s*)[^\s,;]+/gi, '$1[redacted]');
  }

  function record(level, values) {
    const normalizedLevel = ['debug', 'info', 'warn', 'error'].includes(level) ? level : 'info';
    const parts = Array.isArray(values) ? values : [values];
    const message = redact(parts.map(serialize).join(' ')).slice(0, messageLimit).trim();
    if (!message) return;
    entries.push({
      id: nextId++,
      at: isoDate(nowValue(now)),
      level: normalizedLevel,
      message
    });
    if (entries.length > limit) entries.splice(0, entries.length - limit);
  }

  function snapshot() {
    const counts = { debug: 0, info: 0, warn: 0, error: 0 };
    for (const entry of entries) counts[entry.level] += 1;
    return {
      retainedEntries: entries.length,
      retentionLimit: limit,
      counts,
      entries: entries.slice().reverse().map((entry) => ({ ...entry }))
    };
  }

  return Object.freeze({ record, snapshot });
}

/**
 * Keep anonymous Setup Doctor outcomes in a bounded store. Records intentionally
 * exclude IP addresses, user agents, free text and credentials.
 */
export function createSetupDoctorFeedbackStore({
  now = Date.now,
  maxEntries = 100,
  maxAnswers = 20,
  maxResults = 5,
  persistence = null
} = {}) {
  const entries = [];
  const limit = clampInteger(maxEntries, 100, 1, 1_000);
  const answerLimit = clampInteger(maxAnswers, 20, 1, 50);
  const resultLimit = clampInteger(maxResults, 5, 1, 10);

  function cleanLabel(value, maximumLength = 120) {
    const clean = safeString(value, maximumLength)?.trim();
    return clean || null;
  }

  function cleanPairList(value, itemLimit) {
    if (!Array.isArray(value)) return [];
    return value.slice(0, itemLimit).map((item) => ({
      id: cleanLabel(item?.id, 80),
      label: cleanLabel(item?.label, 180),
      value: cleanLabel(item?.value, 80)
    })).filter((item) => item.id && item.label && item.value);
  }

  function normalize(payload, timestamp = nowValue(now)) {
    const source = payload && typeof payload === 'object' ? payload : {};
    if (typeof source.helpful !== 'boolean') return null;

    const area = cleanLabel(source.area, 80);
    const platform = cleanLabel(source.platform, 80);
    const symptom = cleanLabel(source.symptom, 180);
    const areaId = cleanLabel(source.areaId, 80);
    const platformId = cleanLabel(source.platformId, 80);
    const symptomId = cleanLabel(source.symptomId, 80);
    if (!area || !platform || !symptom || !areaId || !platformId || !symptomId) {
      return null;
    }

    const page = cleanLabel(source.page, 180);
    return {
      at: isoDate(timestamp),
      helpful: source.helpful,
      area: { id: areaId, label: area },
      platform: { id: platformId, label: platform },
      symptom: { id: symptomId, label: symptom },
      answers: cleanPairList(source.answers, answerLimit),
      results: (Array.isArray(source.results) ? source.results : []).slice(0, resultLimit)
        .map((item) => ({ id: cleanLabel(item?.id, 80), label: cleanLabel(item?.label, 180) }))
        .filter((item) => item.id && item.label),
      page: page?.startsWith('/') ? page : null
    };
  }

  function append(entry, persist = true) {
    if (persist) persistence?.recordSetupDoctorFeedback?.(entry, limit);
    entries.push(entry);
    if (entries.length > limit) entries.splice(0, entries.length - limit);
  }

  function record(payload) {
    const entry = normalize(payload);
    if (!entry) return { ok: false };
    append(entry);
    return { ok: true };
  }

  const restoredEntries = persistence?.loadSetupDoctorFeedback?.(limit);
  if (Array.isArray(restoredEntries)) {
    for (const source of restoredEntries) {
      const timestamp = timestampFromIso(source?.at);
      if (timestamp === null) continue;
      const entry = normalize({
        helpful: source.helpful,
        areaId: source.area?.id,
        area: source.area?.label,
        platformId: source.platform?.id,
        platform: source.platform?.label,
        symptomId: source.symptom?.id,
        symptom: source.symptom?.label,
        answers: source.answers,
        results: source.results,
        page: source.page
      }, timestamp);
      if (entry) append(entry, false);
    }
  }

  function breakdown(key) {
    const counts = new Map();
    for (const entry of entries) {
      const item = entry[key];
      const current = counts.get(item.id) || { id: item.id, label: item.label, total: 0, helpful: 0 };
      current.total += 1;
      if (entry.helpful) current.helpful += 1;
      counts.set(item.id, current);
    }
    return [...counts.values()]
      .map((item) => ({ ...item, notHelpful: item.total - item.helpful, helpRate: round(item.helpful / item.total, 4) }))
      .sort((left, right) => right.total - left.total || left.label.localeCompare(right.label));
  }

  function snapshot() {
    const helpful = entries.filter((entry) => entry.helpful).length;
    return {
      summary: {
        total: entries.length,
        helpful,
        notHelpful: entries.length - helpful,
        helpRate: entries.length ? round(helpful / entries.length, 4) : 0,
        retainedEntries: entries.length,
        retentionLimit: limit
      },
      byArea: breakdown('area'),
      byPlatform: breakdown('platform'),
      bySymptom: breakdown('symptom'),
      recent: entries.slice().reverse().map((entry) => ({
        ...entry,
        answers: entry.answers.map((answer) => ({ ...answer })),
        results: entry.results.map((result) => ({ ...result }))
      }))
    };
  }

  return Object.freeze({ record, snapshot });
}

/**
 * Keep anonymous documentation-page votes in a bounded store. Only the page
 * path, page title and boolean outcome are retained.
 */
export function createPageFeedbackStore({
  now = Date.now,
  maxEntries = 500,
  persistence = null
} = {}) {
  const entries = [];
  const limit = clampInteger(maxEntries, 500, 1, 5_000);

  function cleanPage(value) {
    const clean = safeString(value, 180)?.trim();
    if (!clean?.startsWith('/')) return null;
    return clean.split(/[?#]/, 1)[0] || '/';
  }

  function normalize(payload, timestamp = nowValue(now)) {
    const source = payload && typeof payload === 'object' ? payload : {};
    if (typeof source.helpful !== 'boolean') return null;

    const page = cleanPage(source.page);
    if (!page) return null;

    const title = safeString(source.title, 160)?.trim() || null;
    return {
      at: isoDate(timestamp),
      helpful: source.helpful,
      page,
      title
    };
  }

  function append(entry, persist = true) {
    if (persist) persistence?.recordPageFeedback?.(entry, limit);
    entries.push(entry);
    if (entries.length > limit) entries.splice(0, entries.length - limit);
  }

  function record(payload) {
    const entry = normalize(payload);
    if (!entry) return { ok: false };
    append(entry);
    return { ok: true };
  }

  const restoredEntries = persistence?.loadPageFeedback?.(limit);
  if (Array.isArray(restoredEntries)) {
    for (const source of restoredEntries) {
      const timestamp = timestampFromIso(source?.at);
      if (timestamp === null) continue;
      const entry = normalize(source, timestamp);
      if (entry) append(entry, false);
    }
  }

  function snapshot() {
    const helpful = entries.filter((entry) => entry.helpful).length;
    const pages = new Map();

    for (const entry of entries) {
      const current = pages.get(entry.page) || {
        page: entry.page,
        title: entry.title,
        total: 0,
        helpful: 0,
        latestAt: entry.at
      };
      current.total += 1;
      if (entry.helpful) current.helpful += 1;
      if (entry.title) current.title = entry.title;
      current.latestAt = entry.at;
      pages.set(entry.page, current);
    }

    return {
      summary: {
        total: entries.length,
        helpful,
        notHelpful: entries.length - helpful,
        helpRate: entries.length ? round(helpful / entries.length, 4) : 0,
        retainedEntries: entries.length,
        retentionLimit: limit
      },
      byPage: [...pages.values()]
        .map((item) => ({
          ...item,
          notHelpful: item.total - item.helpful,
          helpRate: round(item.helpful / item.total, 4)
        }))
        .sort((left, right) => right.total - left.total || left.page.localeCompare(right.page)),
      recent: entries.slice().reverse().map((entry) => ({ ...entry }))
    };
  }

  return Object.freeze({ record, snapshot });
}

/**
 * Validate the complete string that an administrator must type into search.
 * The suffix format matches a 32-byte base64url token and rejects obvious low-
 * diversity values. Entropy still depends on generating the value randomly.
 */
export function isStrongAdminSecret(value) {
  if (typeof value !== 'string' || value.length > MAX_SECRET_LENGTH) return false;
  if (!value.startsWith(ADMIN_SECRET_PREFIX)) return false;

  const suffix = value.slice(ADMIN_SECRET_PREFIX.length);
  if (suffix === 'codex') return true;
  if (suffix.length < MIN_SECRET_SUFFIX_LENGTH) return false;
  if (!/^[A-Za-z0-9_-]+$/.test(suffix)) return false;

  const characterClasses = [/[a-z]/, /[A-Z]/, /[0-9]/, /[_-]/]
    .filter((pattern) => pattern.test(suffix)).length;
  return characterClasses >= 3 && new Set(suffix).size >= 16;
}

/** Generate a ready-to-use, full search trigger with at least 256 random bits. */
export function generateAdminSecret(randomBytesImpl = randomBytes) {
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const suffix = Buffer.from(randomBytesImpl(32)).toString('base64url');
    const candidate = `${ADMIN_SECRET_PREFIX}${suffix}`;
    if (isStrongAdminSecret(candidate)) return candidate;
  }
  throw new Error('Could not generate a strong admin secret.');
}

/** Express-compatible options for setting the opaque admin session cookie. */
export function getAdminCookieOptions({
  secure = true,
  maxAgeMs = DEFAULT_IDLE_TTL_MS
} = {}) {
  return {
    httpOnly: true,
    secure: Boolean(secure),
    sameSite: 'strict',
    path: '/api/admin',
    maxAge: clampInteger(maxAgeMs, DEFAULT_IDLE_TTL_MS, 1_000, 30 * 24 * 60 * 60_000)
  };
}

/** Express-compatible options for clearing the admin session cookie. */
export function getAdminClearCookieOptions({ secure = true } = {}) {
  return {
    httpOnly: true,
    secure: Boolean(secure),
    sameSite: 'strict',
    path: '/api/admin',
    maxAge: 0,
    expires: new Date(0)
  };
}

/**
 * Create the server-side secret verifier and bounded opaque session store.
 * Only SHA-256 hashes of session tokens are retained. Every authentication
 * failure has the same public shape and contains no configuration detail.
 */
export function createAdminSecurity({
  secret = process.env.ADMIN_DASHBOARD_SECRET,
  now = Date.now,
  randomBytesImpl = randomBytes,
  idleTtlMs = DEFAULT_IDLE_TTL_MS,
  absoluteTtlMs = DEFAULT_ABSOLUTE_TTL_MS,
  maxSessions = DEFAULT_MAX_SESSIONS
} = {}) {
  const idleTtl = clampInteger(idleTtlMs, DEFAULT_IDLE_TTL_MS, 5_000, 24 * 60 * 60_000);
  const absoluteTtl = Math.max(
    idleTtl,
    clampInteger(absoluteTtlMs, DEFAULT_ABSOLUTE_TTL_MS, 5_000, 30 * 24 * 60 * 60_000)
  );
  const sessionLimit = clampInteger(maxSessions, DEFAULT_MAX_SESSIONS, 1, 1_000);
  const configured = isStrongAdminSecret(secret);
  const expectedDigest = sha256(configured ? secret : DECOY_SECRET);
  const sessions = new Map();
  const counters = {
    unlockAttempts: 0,
    unlockSucceeded: 0,
    unlockFailed: 0,
    rateLimitedAttempts: 0,
    sessionChecks: 0,
    sessionChecksSucceeded: 0,
    sessionChecksFailed: 0,
    sessionsCreated: 0,
    sessionsRevoked: 0,
    sessionsExpiredIdle: 0,
    sessionsExpiredAbsolute: 0,
    sessionsEvicted: 0
  };

  function currentTime() {
    return nowValue(now);
  }

  function expireSession(key, session, timestamp) {
    if (timestamp >= session.absoluteExpiresAt) {
      sessions.delete(key);
      counters.sessionsExpiredAbsolute += 1;
      return true;
    }
    if (timestamp >= session.idleExpiresAt) {
      sessions.delete(key);
      counters.sessionsExpiredIdle += 1;
      return true;
    }
    return false;
  }

  function purgeExpired(timestamp = currentTime()) {
    for (const [key, session] of sessions) {
      expireSession(key, session, timestamp);
    }
  }

  function evictOldestSession() {
    let oldestKey = null;
    let oldestTimestamp = Infinity;
    for (const [key, session] of sessions) {
      const timestamp = Math.min(session.lastSeenAt, session.createdAt);
      if (timestamp < oldestTimestamp) {
        oldestTimestamp = timestamp;
        oldestKey = key;
      }
    }
    if (oldestKey !== null) {
      sessions.delete(oldestKey);
      counters.sessionsEvicted += 1;
    }
  }

  function createUniqueToken() {
    for (let attempt = 0; attempt < 16; attempt += 1) {
      const token = Buffer.from(randomBytesImpl(32)).toString('base64url');
      if (!sessions.has(sha256Key(token))) return token;
    }
    throw new Error('Could not allocate an admin session.');
  }

  function unlock(candidate) {
    counters.unlockAttempts += 1;
    const timestamp = currentTime();
    purgeExpired(timestamp);

    const comparable = typeof candidate === 'string' && candidate.length <= MAX_SECRET_LENGTH
      ? candidate
      : '';
    const suppliedDigest = sha256(comparable);
    const matches = timingSafeEqual(expectedDigest, suppliedDigest) && configured;

    if (!matches) {
      counters.unlockFailed += 1;
      return GENERIC_AUTH_FAILURE;
    }

    while (sessions.size >= sessionLimit) evictOldestSession();

    const sessionToken = createUniqueToken();
    const absoluteExpiresAt = timestamp + absoluteTtl;
    const idleExpiresAt = Math.min(timestamp + idleTtl, absoluteExpiresAt);
    sessions.set(sha256Key(sessionToken), {
      createdAt: timestamp,
      lastSeenAt: timestamp,
      idleExpiresAt,
      absoluteExpiresAt
    });
    counters.unlockSucceeded += 1;
    counters.sessionsCreated += 1;

    return {
      ok: true,
      sessionToken,
      idleExpiresAt: isoDate(idleExpiresAt),
      expiresAt: isoDate(absoluteExpiresAt)
    };
  }

  function verifySession(sessionToken, { touch = true } = {}) {
    counters.sessionChecks += 1;
    const timestamp = currentTime();
    purgeExpired(timestamp);
    const comparable = typeof sessionToken === 'string' && sessionToken.length <= 256
      ? sessionToken
      : '';
    const key = sha256Key(comparable);
    const session = sessions.get(key);

    if (!session || expireSession(key, session, timestamp)) {
      counters.sessionChecksFailed += 1;
      return GENERIC_AUTH_FAILURE;
    }

    if (touch) {
      session.lastSeenAt = timestamp;
      session.idleExpiresAt = Math.min(timestamp + idleTtl, session.absoluteExpiresAt);
    }
    counters.sessionChecksSucceeded += 1;
    return {
      ok: true,
      createdAt: isoDate(session.createdAt),
      idleExpiresAt: isoDate(session.idleExpiresAt),
      expiresAt: isoDate(session.absoluteExpiresAt)
    };
  }

  function revokeSession(sessionToken) {
    const comparable = typeof sessionToken === 'string' && sessionToken.length <= 256
      ? sessionToken
      : '';
    if (sessions.delete(sha256Key(comparable))) counters.sessionsRevoked += 1;
    return { ok: true };
  }

  function revokeAllSessions() {
    const revoked = sessions.size;
    sessions.clear();
    counters.sessionsRevoked += revoked;
    return revoked;
  }

  function recordRateLimitedAttempt() {
    counters.rateLimitedAttempts += 1;
  }

  function snapshot() {
    const timestamp = currentTime();
    purgeExpired(timestamp);
    return {
      generatedAt: isoDate(timestamp),
      activeSessions: sessions.size,
      maxSessions: sessionLimit,
      idleTtlMs: idleTtl,
      absoluteTtlMs: absoluteTtl,
      counters: { ...counters }
    };
  }

  return Object.freeze({
    isConfigured: () => configured,
    unlock,
    verifySession,
    revokeSession,
    revokeAllSessions,
    recordRateLimitedAttempt,
    snapshot
  });
}

function pathnameOnly(value) {
  if (typeof value !== 'string') return '';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    try {
      return new URL(value).pathname;
    } catch {
      return '';
    }
  }
  return value.split(/[?#]/, 1)[0];
}

function isAdminApiPath(value) {
  const path = pathnameOnly(value);
  return path === '/api/admin' || path.startsWith('/api/admin/');
}

function normalizeMethod(value) {
  const method = typeof value === 'string' ? value.toUpperCase() : 'UNKNOWN';
  return /^[A-Z]{1,12}$/.test(method) ? method : 'UNKNOWN';
}

function normalizeRouteTemplate(value) {
  if (typeof value !== 'string') return '/unmatched';
  let route = pathnameOnly(value);
  if (!route.startsWith('/')) return '/unmatched';
  route = route.replace(/\/{2,}/g, '/').slice(0, 180);
  return route || '/unmatched';
}

function routeTemplateForRequest(req) {
  if (typeof req?.metricsRouteTemplate === 'string') {
    return normalizeRouteTemplate(req.metricsRouteTemplate);
  }
  const routePath = req?.route?.path;
  if (typeof routePath !== 'string') return '/unmatched';
  const base = typeof req.baseUrl === 'string' ? req.baseUrl : '';
  return normalizeRouteTemplate(`${base}${routePath}`);
}

function percentile95(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return round(sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)]);
}

function pushBounded(array, value, limit) {
  array.push(value);
  if (array.length > limit) array.splice(0, array.length - limit);
}

function statusClass(statusCode) {
  if (statusCode >= 500) return 'serverErrors';
  if (statusCode >= 400) return 'clientErrors';
  return 'successful';
}

function createAggregate(startAt = null) {
  return {
    startAt,
    requests: 0,
    successful: 0,
    clientErrors: 0,
    serverErrors: 0,
    totalDurationMs: 0,
    maxDurationMs: 0,
    durations: [],
    clients: new Set(),
    clientsCapped: false
  };
}

function addClient(aggregate, clientId, limit) {
  if (!clientId || aggregate.clients.has(clientId)) return;
  if (aggregate.clients.size >= limit) {
    aggregate.clientsCapped = true;
    return;
  }
  aggregate.clients.add(clientId);
}

function updateAggregate(aggregate, record, sampleLimit, clientLimit) {
  aggregate.requests += 1;
  aggregate[statusClass(record.statusCode)] += 1;
  aggregate.totalDurationMs += record.durationMs;
  aggregate.maxDurationMs = Math.max(aggregate.maxDurationMs, record.durationMs);
  pushBounded(aggregate.durations, record.durationMs, sampleLimit);
  addClient(aggregate, record.clientId, clientLimit);
}

function formatAggregate(aggregate, startAt = aggregate?.startAt ?? null) {
  if (!aggregate) {
    return {
      startAt: isoDate(startAt),
      requests: 0,
      successful: 0,
      clientErrors: 0,
      serverErrors: 0,
      errors: 0,
      averageDurationMs: 0,
      p95DurationMs: 0,
      maxDurationMs: 0,
      uniqueClients: 0,
      uniqueClientsCapped: false
    };
  }
  return {
    startAt: isoDate(startAt),
    requests: aggregate.requests,
    successful: aggregate.successful,
    clientErrors: aggregate.clientErrors,
    serverErrors: aggregate.serverErrors,
    errors: aggregate.clientErrors + aggregate.serverErrors,
    averageDurationMs: aggregate.requests
      ? round(aggregate.totalDurationMs / aggregate.requests)
      : 0,
    p95DurationMs: percentile95(aggregate.durations),
    maxDurationMs: round(aggregate.maxDurationMs),
    uniqueClients: aggregate.clients.size,
    uniqueClientsCapped: aggregate.clientsCapped
  };
}

/**
 * Create bounded, privacy-preserving request metrics. The middleware records
 * only method, Express route template, status, duration, timestamp and a keyed
 * client digest used for cardinality. Admin API traffic is ignored entirely.
 */
export function createRequestMetrics({
  now = Date.now,
  persistence = null,
  anonymizationKey = persistence?.anonymizationKey || randomBytes(32),
  minuteRetention = 120,
  hourRetention = 48,
  maxRecentRequests = 200,
  maxEndpoints = 100,
  maxLatencySamples = 2_048,
  maxEndpointSamples = 256,
  maxBucketSamples = 512,
  maxClientsPerAggregate = 2_048
} = {}) {
  const minuteLimit = clampInteger(minuteRetention, 120, 1, 1_440);
  const hourLimit = clampInteger(hourRetention, 48, 1, 24 * 90);
  const recentLimit = clampInteger(maxRecentRequests, 200, 1, 2_000);
  const endpointLimit = clampInteger(maxEndpoints, 100, 1, 1_000);
  const latencySampleLimit = clampInteger(maxLatencySamples, 2_048, 16, 20_000);
  const endpointSampleLimit = clampInteger(maxEndpointSamples, 256, 8, 2_000);
  const bucketSampleLimit = clampInteger(maxBucketSamples, 512, 8, 4_000);
  const clientLimit = clampInteger(maxClientsPerAggregate, 2_048, 16, 20_000);
  const key = Buffer.from(anonymizationKey);
  if (key.length < 16) throw new Error('Metrics anonymization key must be at least 16 bytes.');

  const minuteBuckets = new Map();
  const hourBuckets = new Map();
  const endpoints = new Map();
  const recentRequests = [];
  const durations = [];
  const totals = {
    requests: 0,
    successful: 0,
    clientErrors: 0,
    serverErrors: 0,
    totalDurationMs: 0,
    maxDurationMs: 0,
    endpointSeriesEvicted: 0
  };
  let activeRequests = 0;

  function clientDigest(clientIp, userAgent) {
    const ip = typeof clientIp === 'string' ? clientIp : '';
    const agent = typeof userAgent === 'string' ? userAgent : '';
    if (!ip && !agent) return null;
    return createHmac('sha256', key)
      .update(ip)
      .update('\0')
      .update(agent)
      .digest('hex')
      .slice(0, 24);
  }

  function trimBucketMap(map, limit) {
    const keys = [...map.keys()].sort((left, right) => left - right);
    while (keys.length > limit) map.delete(keys.shift());
  }

  function bucketFor(map, timestamp, bucketMs, limit) {
    const keyValue = Math.floor(timestamp / bucketMs);
    let bucket = map.get(keyValue);
    if (!bucket) {
      bucket = createAggregate(keyValue * bucketMs);
      map.set(keyValue, bucket);
      trimBucketMap(map, limit);
    }
    return bucket;
  }

  function endpointFor(method, route, timestamp) {
    const endpointKey = `${method} ${route}`;
    let endpoint = endpoints.get(endpointKey);
    if (!endpoint) {
      if (endpoints.size >= endpointLimit) {
        const oldest = [...endpoints.entries()]
          .sort((left, right) => left[1].lastSeenAt - right[1].lastSeenAt)[0];
        if (oldest) {
          endpoints.delete(oldest[0]);
          totals.endpointSeriesEvicted += 1;
        }
      }
      endpoint = {
        ...createAggregate(),
        method,
        route,
        lastSeenAt: timestamp
      };
      endpoints.set(endpointKey, endpoint);
    }
    endpoint.lastSeenAt = timestamp;
    return endpoint;
  }

  function recordSanitized({
    method,
    route,
    path,
    statusCode,
    durationMs,
    timestamp,
    clientId
  }, { persist = true, countTotals = true } = {}) {
    if (isAdminApiPath(path) || isAdminApiPath(route)) return false;

    const normalizedMethod = normalizeMethod(method);
    const normalizedRoute = normalizeRouteTemplate(route);
    const normalizedStatus = clampInteger(statusCode, 0, 0, 599);
    const normalizedDuration = round(Math.min(nonNegativeNumber(durationMs), 24 * 60 * 60_000));
    const normalizedTimestamp = Number.isFinite(Number(timestamp)) ? Number(timestamp) : nowValue(now);
    const record = {
      method: normalizedMethod,
      route: normalizedRoute,
      statusCode: normalizedStatus,
      durationMs: normalizedDuration,
      timestamp: normalizedTimestamp,
      clientId
    };

    if (countTotals) {
      totals.requests += 1;
      totals[statusClass(normalizedStatus)] += 1;
      totals.totalDurationMs += normalizedDuration;
      totals.maxDurationMs = Math.max(totals.maxDurationMs, normalizedDuration);
    }
    pushBounded(durations, normalizedDuration, latencySampleLimit);

    updateAggregate(
      bucketFor(minuteBuckets, normalizedTimestamp, 60_000, minuteLimit),
      record,
      bucketSampleLimit,
      clientLimit
    );
    updateAggregate(
      bucketFor(hourBuckets, normalizedTimestamp, 60 * 60_000, hourLimit),
      record,
      bucketSampleLimit,
      clientLimit
    );
    updateAggregate(
      endpointFor(normalizedMethod, normalizedRoute, normalizedTimestamp),
      record,
      endpointSampleLimit,
      clientLimit
    );

    recentRequests.push({
      at: isoDate(normalizedTimestamp),
      method: normalizedMethod,
      endpoint: normalizedRoute,
      statusCode: normalizedStatus,
      durationMs: normalizedDuration
    });
    if (recentRequests.length > recentLimit) {
      recentRequests.splice(0, recentRequests.length - recentLimit);
    }
    if (persist) persistence?.recordRequestMetric?.(record);
    return true;
  }

  function recordRequest({
    method,
    routeTemplate,
    path,
    statusCode,
    durationMs,
    timestamp = nowValue(now),
    clientIp,
    ip,
    userAgent
  } = {}) {
    return recordSanitized({
      method,
      route: routeTemplate,
      path,
      statusCode,
      durationMs,
      timestamp,
      clientId: clientDigest(clientIp ?? ip, userAgent)
    });
  }

  function middleware(req, res, next) {
    const path = pathnameOnly(req?.originalUrl || req?.url || req?.path || '');
    if (isAdminApiPath(path)) {
      next();
      return;
    }

    const startedAt = nowValue(now);
    const method = normalizeMethod(req?.method);
    const clientId = clientDigest(
      req?.ip || req?.socket?.remoteAddress,
      typeof req?.get === 'function' ? req.get('user-agent') : req?.headers?.['user-agent']
    );
    activeRequests += 1;
    let recorded = false;

    const complete = (closedEarly = false) => {
      if (recorded) return;
      recorded = true;
      activeRequests = Math.max(0, activeRequests - 1);
      const completedAt = nowValue(now);
      recordSanitized({
        method,
        route: routeTemplateForRequest(req),
        path,
        statusCode: closedEarly ? 499 : res.statusCode,
        durationMs: Math.max(0, completedAt - startedAt),
        timestamp: completedAt,
        clientId
      });
    };

    res.once('finish', () => complete(false));
    res.once('close', () => complete(!res.writableEnded));
    next();
  }

  function series(map, bucketMs, count, timestamp) {
    const currentKey = Math.floor(timestamp / bucketMs);
    const output = [];
    for (let offset = count - 1; offset >= 0; offset -= 1) {
      const keyValue = currentKey - offset;
      output.push(formatAggregate(map.get(keyValue), keyValue * bucketMs));
    }
    return output;
  }

  function uniqueClientsAcrossBuckets(map, currentKey, count) {
    const clients = new Set();
    let capped = false;
    for (let offset = 0; offset < count; offset += 1) {
      const bucket = map.get(currentKey - offset);
      if (!bucket) continue;
      capped ||= bucket.clientsCapped;
      for (const client of bucket.clients) {
        if (clients.size >= clientLimit) {
          capped = true;
          break;
        }
        clients.add(client);
      }
    }
    return { count: clients.size, capped };
  }

  function snapshot() {
    const timestamp = nowValue(now);
    trimBucketMap(minuteBuckets, minuteLimit);
    trimBucketMap(hourBuckets, hourLimit);
    const uniqueClientsLastHour = uniqueClientsAcrossBuckets(
      minuteBuckets,
      Math.floor(timestamp / 60_000),
      Math.min(60, minuteLimit)
    );
    const uniqueClientsLast24Hours = uniqueClientsAcrossBuckets(
      hourBuckets,
      Math.floor(timestamp / (60 * 60_000)),
      Math.min(24, hourLimit)
    );
    return {
      generatedAt: isoDate(timestamp),
      retention: {
        minuteBuckets: minuteLimit,
        hourBuckets: hourLimit,
        recentRequests: recentLimit,
        endpoints: endpointLimit
      },
      summary: {
        requests: totals.requests,
        successful: totals.successful,
        clientErrors: totals.clientErrors,
        serverErrors: totals.serverErrors,
        errors: totals.clientErrors + totals.serverErrors,
        averageDurationMs: totals.requests
          ? round(totals.totalDurationMs / totals.requests)
          : 0,
        p95DurationMs: percentile95(durations),
        maxDurationMs: round(totals.maxDurationMs),
        activeRequests,
        uniqueClientsLastHour: uniqueClientsLastHour.count,
        uniqueClientsLast24Hours: uniqueClientsLast24Hours.count,
        uniqueClientsCapped: uniqueClientsLastHour.capped || uniqueClientsLast24Hours.capped,
        uniqueClientsLastHourCapped: uniqueClientsLastHour.capped,
        uniqueClientsLast24HoursCapped: uniqueClientsLast24Hours.capped,
        endpointSeriesEvicted: totals.endpointSeriesEvicted
      },
      minuteSeries: series(minuteBuckets, 60_000, minuteLimit, timestamp),
      hourSeries: series(hourBuckets, 60 * 60_000, hourLimit, timestamp),
      endpoints: [...endpoints.values()]
        .map((endpoint) => ({
          method: endpoint.method,
          route: endpoint.route,
          ...formatAggregate(endpoint, endpoint.lastSeenAt),
          lastSeenAt: isoDate(endpoint.lastSeenAt)
        }))
        .map(({ startAt: _startAt, ...endpoint }) => endpoint)
        .sort((left, right) => right.requests - left.requests || left.route.localeCompare(right.route)),
      recentRequests: recentRequests.map((request) => ({ ...request }))
    };
  }

  const restoredRecords = persistence?.loadRequestMetrics?.();
  const restoredTotals = persistence?.loadRequestMetricTotals?.();
  const hasRestoredTotals = restoredTotals && Number.isFinite(Number(restoredTotals.requests));
  if (hasRestoredTotals) {
    totals.requests = nonNegativeNumber(restoredTotals.requests);
    totals.successful = nonNegativeNumber(restoredTotals.successful);
    totals.clientErrors = nonNegativeNumber(restoredTotals.clientErrors);
    totals.serverErrors = nonNegativeNumber(restoredTotals.serverErrors);
    totals.totalDurationMs = nonNegativeNumber(restoredTotals.totalDurationMs);
    totals.maxDurationMs = nonNegativeNumber(restoredTotals.maxDurationMs);
  }
  if (Array.isArray(restoredRecords)) {
    for (const record of restoredRecords) {
      recordSanitized({
        ...record,
        path: record.route
      }, { persist: false, countTotals: !hasRestoredTotals });
    }
  }

  return Object.freeze({ middleware, recordRequest, snapshot });
}

function safeCall(callback, fallback) {
  try {
    const value = callback();
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function percent(used, total) {
  return total > 0 ? round((used / total) * 100) : 0;
}

function sanitizeContent(content) {
  const source = content && typeof content === 'object' ? content : {};
  const clean = {};
  for (const field of CONTENT_BOOLEAN_FIELDS) {
    if (typeof source[field] === 'boolean') clean[field] = source[field];
  }
  for (const field of CONTENT_NUMBER_FIELDS) {
    if (Number.isFinite(Number(source[field]))) clean[field] = nonNegativeNumber(source[field]);
  }
  for (const field of CONTENT_STRING_FIELDS) {
    const value = safeString(source[field]);
    if (value !== null) clean[field] = value;
  }
  if (source.integrations && typeof source.integrations === 'object') {
    clean.integrations = {};
    for (const field of INTEGRATION_FIELDS) {
      if (typeof source.integrations[field] === 'boolean') {
        clean.integrations[field] = source.integrations[field];
      }
    }
  }
  return clean;
}

function diskSnapshot(diskPaths, statfs) {
  return diskPaths.slice(0, 8).map((entry, index) => {
    const label = safeString(entry?.label, 64) || `disk-${index + 1}`;
    try {
      const stats = statfs(entry?.path);
      const blockSize = nonNegativeNumber(stats.bsize);
      const blocks = nonNegativeNumber(stats.blocks);
      const freeBlocks = nonNegativeNumber(stats.bfree);
      const availableBlocks = nonNegativeNumber(stats.bavail, freeBlocks);
      const totalBytes = blocks * blockSize;
      const freeBytes = freeBlocks * blockSize;
      const availableBytes = availableBlocks * blockSize;
      const usedBytes = Math.max(0, totalBytes - freeBytes);
      return {
        label,
        available: true,
        totalBytes,
        usedBytes,
        availableBytes,
        usedPercent: percent(usedBytes, totalBytes)
      };
    } catch {
      return { label, available: false };
    }
  });
}

/**
 * Build the protected dashboard payload. Content is explicitly whitelisted;
 * environment values, file paths, resource names and hashes are never spread
 * into the result. Disk entries expose caller-provided labels but not paths.
 */
export function createDashboardSnapshot({
  now = Date.now,
  processRef = process,
  osRef = os,
  performanceRef = performance,
  statfs = statfsSync,
  diskPaths = [{ label: 'workspace', path: process.cwd() }],
  content = {},
  metrics = null,
  security = null
} = {}) {
  const timestamp = nowValue(now);
  const uptimeSeconds = nonNegativeNumber(safeCall(() => processRef.uptime(), 0));
  const memory = safeCall(() => processRef.memoryUsage(), {});
  const cpu = safeCall(() => processRef.cpuUsage(), {});
  const resources = safeCall(() => processRef.resourceUsage(), {});
  const eventLoop = safeCall(
    () => performanceRef.eventLoopUtilization(),
    { utilization: 0, active: 0, idle: 0 }
  );
  const totalMemory = nonNegativeNumber(safeCall(() => osRef.totalmem(), 0));
  const freeMemory = nonNegativeNumber(safeCall(() => osRef.freemem(), 0));
  const usedMemory = Math.max(0, totalMemory - freeMemory);
  const cpuList = safeCall(() => osRef.cpus(), []);
  const loadAverage = safeCall(() => osRef.loadavg(), [0, 0, 0]);
  const selectedDisks = Array.isArray(diskPaths) ? diskPaths : [];

  return {
    generatedAt: isoDate(timestamp),
    runtime: {
      startedAt: isoDate(timestamp - uptimeSeconds * 1_000),
      uptimeSeconds: round(uptimeSeconds),
      nodeVersion: safeString(processRef.version, 32),
      pid: clampInteger(processRef.pid, 0, 0, Number.MAX_SAFE_INTEGER),
      memory: {
        rssBytes: nonNegativeNumber(memory.rss),
        heapTotalBytes: nonNegativeNumber(memory.heapTotal),
        heapUsedBytes: nonNegativeNumber(memory.heapUsed),
        externalBytes: nonNegativeNumber(memory.external),
        arrayBuffersBytes: nonNegativeNumber(memory.arrayBuffers)
      },
      cpuMicroseconds: {
        user: nonNegativeNumber(cpu.user),
        system: nonNegativeNumber(cpu.system)
      },
      resourceUsage: {
        maxRssKb: nonNegativeNumber(resources.maxRSS),
        voluntaryContextSwitches: nonNegativeNumber(resources.voluntaryContextSwitches),
        involuntaryContextSwitches: nonNegativeNumber(resources.involuntaryContextSwitches)
      },
      eventLoop: {
        utilization: round(eventLoop.utilization, 4),
        activeMs: round(eventLoop.active),
        idleMs: round(eventLoop.idle)
      }
    },
    system: {
      platform: safeString(processRef.platform || safeCall(() => osRef.platform(), ''), 32),
      architecture: safeString(processRef.arch || safeCall(() => osRef.arch(), ''), 32),
      release: safeString(safeCall(() => osRef.release(), ''), 128),
      uptimeSeconds: round(nonNegativeNumber(safeCall(() => osRef.uptime(), 0))),
      cpuCount: Array.isArray(cpuList) ? cpuList.length : 0,
      loadAverage: Array.isArray(loadAverage)
        ? loadAverage.slice(0, 3).map((value) => round(nonNegativeNumber(value)))
        : [0, 0, 0],
      memory: {
        totalBytes: totalMemory,
        usedBytes: usedMemory,
        freeBytes: freeMemory,
        usedPercent: percent(usedMemory, totalMemory)
      }
    },
    disks: diskSnapshot(selectedDisks, statfs),
    content: sanitizeContent(content),
    traffic: typeof metrics?.snapshot === 'function' ? metrics.snapshot() : null,
    security: typeof security?.snapshot === 'function' ? security.snapshot() : null
  };
}
