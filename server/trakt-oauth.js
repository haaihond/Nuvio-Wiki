import { randomBytes } from 'node:crypto';

export const DEFAULT_TRAKT_OAUTH_STATE_TTL_MS = 10 * 60_000;
const DEFAULT_MAX_PENDING_STATES = 1_000;

function normalizeOrigin(value) {
  if (typeof value !== 'string' || !value.trim()) return null;

  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Keep OAuth state opaque, short-lived, and single-use. The return origin is
 * stored alongside it so callback input can never choose where tokens are sent.
 */
export function createTraktOAuthStateStore({
  allowedOrigins,
  ttlMs = DEFAULT_TRAKT_OAUTH_STATE_TTL_MS,
  maxPendingStates = DEFAULT_MAX_PENDING_STATES,
  now = () => Date.now(),
  generateState = () => randomBytes(32).toString('base64url')
} = {}) {
  const originValues = Array.isArray(allowedOrigins)
    ? allowedOrigins
    : String(allowedOrigins || '').split(',');
  const allowed = new Set(originValues.map(normalizeOrigin).filter(Boolean));

  if (allowed.size === 0) {
    throw new Error('At least one valid Trakt OAuth return origin must be configured.');
  }
  if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) {
    throw new Error('Trakt OAuth state TTL must be a positive integer.');
  }
  if (!Number.isSafeInteger(maxPendingStates) || maxPendingStates <= 0) {
    throw new Error('Trakt OAuth pending-state limit must be a positive integer.');
  }

  const pending = new Map();

  function pruneExpired(timestamp) {
    for (const [state, transaction] of pending) {
      if (transaction.expiresAt <= timestamp) pending.delete(state);
    }
  }

  function resolveAllowedOrigin(value) {
    const origin = normalizeOrigin(value);
    return origin && allowed.has(origin) ? origin : null;
  }

  function issue(returnOrigin) {
    const origin = resolveAllowedOrigin(returnOrigin);
    if (!origin) return null;

    const issuedAt = now();
    pruneExpired(issuedAt);
    while (pending.size >= maxPendingStates) {
      pending.delete(pending.keys().next().value);
    }

    let state;
    do {
      state = generateState();
    } while (typeof state !== 'string' || state.length < 32 || pending.has(state));

    const transaction = {
      state,
      returnOrigin: origin,
      expiresAt: issuedAt + ttlMs
    };
    pending.set(state, transaction);
    return { ...transaction };
  }

  function consume(state) {
    if (typeof state !== 'string') return null;

    const transaction = pending.get(state);
    pending.delete(state);
    if (!transaction || transaction.expiresAt <= now()) return null;
    return { ...transaction };
  }

  return {
    consume,
    issue,
    resolveAllowedOrigin
  };
}
