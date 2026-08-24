import { randomBytes } from 'node:crypto';

export const PENGUPLAY_CREATE_USER_URL = 'https://pengu.uk/api/create_user';
export const TURNSTILE_SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
export const DEFAULT_PENGUPLAY_RESULT_TTL_MS = 10 * 60_000;
const DEFAULT_MAX_RESULTS = 1_000;

function requiredString(value, name) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw new Error(`${name} is required.`);
  return normalized;
}

function parseJsonResponse(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function responseDetail(data, fallback) {
  if (data && typeof data === 'object') {
    const errorCodes = Array.isArray(data['error-codes'])
      ? data['error-codes'].join(', ')
      : '';
    return String(data.error_description || data.message || data.error || errorCodes || fallback).slice(0, 300);
  }
  return String(fallback).slice(0, 300);
}

function validatePositiveInteger(value, name) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
}

function normalizeHostname(value) {
  return typeof value === 'string' ? value.trim().toLowerCase().replace(/\.$/, '') : '';
}

export function createPenguplayResultStore({
  resultTtlMs = DEFAULT_PENGUPLAY_RESULT_TTL_MS,
  maxResults = DEFAULT_MAX_RESULTS,
  now = () => Date.now(),
  generateReceipt = () => randomBytes(32).toString('base64url')
} = {}) {
  validatePositiveInteger(resultTtlMs, 'PenguPlay result TTL');
  validatePositiveInteger(maxResults, 'PenguPlay result limit');

  const results = new Map();

  function prune(timestamp) {
    for (const [receipt, result] of results) {
      if (result.expiresAt <= timestamp) results.delete(receipt);
    }
  }

  function issue(manifestUrl) {
    const normalizedManifest = requiredString(manifestUrl, 'PenguPlay manifest URL');
    const timestamp = now();
    prune(timestamp);
    while (results.size >= maxResults) results.delete(results.keys().next().value);

    let receipt;
    do {
      receipt = generateReceipt();
    } while (typeof receipt !== 'string' || receipt.length < 32 || results.has(receipt));

    results.set(receipt, {
      manifestUrl: normalizedManifest,
      expiresAt: timestamp + resultTtlMs
    });
    return receipt;
  }

  function read(receipt) {
    if (typeof receipt !== 'string') return null;
    const result = results.get(receipt);
    if (!result || result.expiresAt <= now()) {
      results.delete(receipt);
      return null;
    }
    return { ...result };
  }

  function consume(receipt) {
    const result = read(receipt);
    results.delete(receipt);
    return result;
  }

  return { consume, issue, read };
}

export async function verifyTurnstileToken({
  secretKey,
  token,
  remoteIp = '',
  expectedAction = 'penguplay-create',
  expectedHostnames = [],
  siteverifyUrl = TURNSTILE_SITEVERIFY_URL,
  fetchImpl = fetch
}) {
  const url = new URL(requiredString(siteverifyUrl, 'Turnstile Siteverify URL'));
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('Turnstile Siteverify URL must use HTTPS.');
  }

  const body = new URLSearchParams({
    secret: requiredString(secretKey, 'Turnstile secret key'),
    response: requiredString(token, 'Turnstile response token')
  });
  if (typeof remoteIp === 'string' && remoteIp.trim()) body.set('remoteip', remoteIp.trim());

  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: body.toString()
  });

  const text = await response.text();
  const data = parseJsonResponse(text);
  if (!response.ok) {
    throw new Error(`Turnstile verification failed: ${responseDetail(data, response.statusText || `HTTP ${response.status}`)}`);
  }
  if (!data?.success) {
    throw new Error(`Turnstile verification failed: ${responseDetail(data, 'challenge rejected')}`);
  }
  if (expectedAction && data.action !== expectedAction) {
    throw new Error('Turnstile verification returned an unexpected action.');
  }

  const allowedHostnames = new Set(
    (Array.isArray(expectedHostnames) ? expectedHostnames : [expectedHostnames])
      .map(normalizeHostname)
      .filter(Boolean)
  );
  const responseHostname = normalizeHostname(data.hostname);
  if (allowedHostnames.size > 0 && !allowedHostnames.has(responseHostname)) {
    throw new Error('Turnstile verification returned an unexpected hostname.');
  }

  return data;
}

export async function createPenguplayUser({
  creationKey,
  createdAt,
  createdFrom = 'nuvio.wiki',
  createUserUrl = PENGUPLAY_CREATE_USER_URL,
  fetchImpl = fetch
}) {
  const url = new URL(requiredString(createUserUrl, 'PenguPlay create-user URL'));
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('PenguPlay create-user URL must use HTTPS.');
  }

  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'Nuvio-Quickstart/1.0'
    },
    body: JSON.stringify({
      creation_key: requiredString(creationKey, 'PenguPlay creation key'),
      data: {
        createdAt: requiredString(createdAt, 'PenguPlay creation time'),
        createdFrom: requiredString(createdFrom, 'PenguPlay creation source')
      }
    })
  });

  const text = await response.text();
  const data = parseJsonResponse(text);
  if (!response.ok) {
    throw new Error(`PenguPlay user creation failed: ${responseDetail(data, response.statusText || `HTTP ${response.status}`)}`);
  }
  if (data?.status !== undefined && Number(data.status) !== 200) {
    throw new Error(`PenguPlay user creation failed: ${responseDetail(data, `status ${data.status}`)}`);
  }
  if (typeof data?.accessToken !== 'string' || !data.accessToken.trim()) {
    throw new Error('PenguPlay user creation failed: no access token was returned.');
  }
  if (typeof data?.addonUrl !== 'string' || !data.addonUrl.trim()) {
    throw new Error('PenguPlay user creation failed: no addon URL was returned.');
  }
  return {
    accessToken: data.accessToken.trim(),
    addonUrl: data.addonUrl.trim()
  };
}
