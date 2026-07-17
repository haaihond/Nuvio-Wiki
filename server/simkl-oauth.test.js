import test from 'node:test';
import assert from 'node:assert/strict';
import { createTraktOAuthStateStore } from './trakt-oauth.js';
import {
  SIMKL_TOKEN_URL,
  buildSimklAuthorizationUrl,
  createSimklOAuthStateStore,
  exchangeSimklAuthorizationCode,
  renderSimklOAuthCallback
} from './simkl-oauth.js';

test('builds the confidential Simkl authorization URL with exact callback and state', () => {
  const url = new URL(buildSimklAuthorizationUrl({
    clientId: 'simkl-client',
    redirectUri: 'https://nuvio.wiki/api/simkl/callback',
    state: 'opaque-state'
  }));

  assert.equal(url.origin, 'https://simkl.com');
  assert.equal(url.pathname, '/oauth/authorize');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('client_id'), 'simkl-client');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://nuvio.wiki/api/simkl/callback');
  assert.equal(url.searchParams.get('state'), 'opaque-state');
  assert.equal(url.searchParams.get('app-name'), 'nuvio-wiki');
  assert.equal(url.searchParams.get('app-version'), '1.0');
});

test('keeps Simkl OAuth state independent and exact-origin allowlisted', () => {
  const simklStates = createSimklOAuthStateStore({ allowedOrigins: 'https://nuvio.wiki' });
  const traktStates = createTraktOAuthStateStore({ allowedOrigins: 'https://nuvio.wiki' });

  assert.equal(simklStates.issue('https://nuvio.wiki/path'), null);
  assert.equal(simklStates.issue('https://other.example'), null);

  const transaction = simklStates.issue('https://nuvio.wiki');
  assert.ok(transaction);
  assert.equal(traktStates.consume(transaction.state), null);
  assert.deepEqual(simklStates.consume(transaction.state), transaction);
  assert.equal(simklStates.consume(transaction.state), null);
});

test('exchanges a Simkl code server-side without exposing the client secret', async () => {
  let request = null;
  const tokens = {
    access_token: 'access-token',
    token_type: 'bearer',
    scope: 'public',
    expires_in: 157_680_000
  };

  const result = await exchangeSimklAuthorizationCode({
    clientId: 'simkl-client',
    clientSecret: 'server-only-secret',
    code: 'authorization-code',
    redirectUri: 'https://nuvio.wiki/api/simkl/callback',
    fetchImpl: async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => JSON.stringify(tokens)
      };
    }
  });

  assert.deepEqual(result, tokens);
  assert.equal(request.url, SIMKL_TOKEN_URL);
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.headers['Content-Type'], 'application/json');
  assert.equal(request.options.headers['User-Agent'], 'Nuvio-Sync-Bridge/1.0');
  assert.deepEqual(JSON.parse(request.options.body), {
    code: 'authorization-code',
    client_id: 'simkl-client',
    client_secret: 'server-only-secret',
    redirect_uri: 'https://nuvio.wiki/api/simkl/callback',
    grant_type: 'authorization_code'
  });
});

test('surfaces a bounded clear Simkl token exchange error', async () => {
  await assert.rejects(
    exchangeSimklAuthorizationCode({
      clientId: 'simkl-client',
      clientSecret: 'bad-secret',
      code: 'bad-code',
      redirectUri: 'https://nuvio.wiki/api/simkl/callback',
      fetchImpl: async () => ({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => JSON.stringify({ error: 'grant_error', message: 'Bad code provided.' })
      })
    }),
    (error) => {
      assert.equal(error.upstreamStatus, 401);
      assert.match(error.message, /Simkl token exchange failed: Bad code provided\./);
      assert.doesNotMatch(error.message, /bad-secret/);
      return true;
    }
  );
});

test('renders a no-storage popup callback with an exact postMessage target', () => {
  const html = renderSimklOAuthCallback({
    state: 'opaque-state',
    clientId: 'simkl-client',
    tokens: { access_token: '</script><script>alert(1)</script>' },
    returnOrigin: 'https://nuvio.wiki'
  });

  assert.match(html, /source: 'simkl-oauth'/);
  assert.match(html, /state: "opaque-state"/);
  assert.match(html, /client_id: "simkl-client"/);
  assert.match(html, /}, "https:\/\/nuvio\.wiki"\);/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.match(html, /\\u003c\/script\\u003e/);
});
