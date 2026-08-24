import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPenguplayResultStore,
  createPenguplayUser,
  PENGUPLAY_CREATE_USER_URL,
  TURNSTILE_SITEVERIFY_URL,
  verifyTurnstileToken
} from './penguplay.js';

function jsonResponse(data, { ok = true, status = 200, statusText = 'OK' } = {}) {
  return {
    ok,
    status,
    statusText,
    text: async () => JSON.stringify(data)
  };
}

test('keeps one-time PenguPlay results bounded and expiring', () => {
  let timestamp = 1_000;
  let receiptNumber = 0;
  const store = createPenguplayResultStore({
    resultTtlMs: 100,
    maxResults: 2,
    now: () => timestamp,
    generateReceipt: () => `${String(++receiptNumber).padStart(32, '0')}`
  });

  const first = store.issue('https://pengu.uk/first/manifest.json');
  const second = store.issue('https://pengu.uk/second/manifest.json');
  const third = store.issue('https://pengu.uk/third/manifest.json');

  assert.equal(store.read(first), null);
  assert.equal(store.read(second)?.manifestUrl, 'https://pengu.uk/second/manifest.json');
  assert.equal(store.consume(second)?.manifestUrl, 'https://pengu.uk/second/manifest.json');
  assert.equal(store.read(second), null);

  timestamp += 101;
  assert.equal(store.read(third), null);
});

test('verifies Turnstile server-side with the visitor IP, action, and hostname', async () => {
  let request;
  const result = await verifyTurnstileToken({
    secretKey: 'turnstile-secret',
    token: 'browser-token',
    remoteIp: '203.0.113.12',
    expectedAction: 'penguplay-create',
    expectedHostnames: ['nuvio.wiki'],
    fetchImpl: async (url, options) => {
      request = { url: url.toString(), options };
      return jsonResponse({
        success: true,
        action: 'penguplay-create',
        hostname: 'nuvio.wiki'
      });
    }
  });

  assert.equal(request.url, TURNSTILE_SITEVERIFY_URL);
  assert.equal(request.options.method, 'POST');
  assert.deepEqual(Object.fromEntries(new URLSearchParams(request.options.body)), {
    secret: 'turnstile-secret',
    response: 'browser-token',
    remoteip: '203.0.113.12'
  });
  assert.equal(result.success, true);
});

test('rejects failed Turnstile challenges and mismatched metadata', async () => {
  await assert.rejects(
    verifyTurnstileToken({
      secretKey: 'secret',
      token: 'token',
      fetchImpl: async () => jsonResponse({ success: false, 'error-codes': ['timeout-or-duplicate'] })
    }),
    /timeout-or-duplicate/
  );

  await assert.rejects(
    verifyTurnstileToken({
      secretKey: 'secret',
      token: 'token',
      expectedHostnames: ['nuvio.wiki'],
      fetchImpl: async () => jsonResponse({
        success: true,
        action: 'penguplay-create',
        hostname: 'example.com'
      })
    }),
    /unexpected hostname/
  );
});

test('creates a PenguPlay user server-to-server and receives the addon URL', async () => {
  let request;
  const result = await createPenguplayUser({
    creationKey: 'creation-secret',
    createdAt: '2026-08-20T00:00:00.000Z',
    fetchImpl: async (url, options) => {
      request = { url: url.toString(), options };
      return jsonResponse({
        status: 200,
        accessToken: 'personal-access-token',
        addonUrl: 'https://pengu.uk/personal/manifest.json'
      });
    }
  });

  assert.equal(request.url, PENGUPLAY_CREATE_USER_URL);
  assert.equal(request.options.headers.Authorization, undefined);
  assert.deepEqual(JSON.parse(request.options.body), {
    creation_key: 'creation-secret',
    data: {
      createdAt: '2026-08-20T00:00:00.000Z',
      createdFrom: 'nuvio.wiki'
    }
  });
  assert.deepEqual(result, {
    accessToken: 'personal-access-token',
    addonUrl: 'https://pengu.uk/personal/manifest.json'
  });
});
