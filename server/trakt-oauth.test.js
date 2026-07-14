import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createTraktOAuthStateStore,
  DEFAULT_TRAKT_OAUTH_STATE_TTL_MS
} from './trakt-oauth.js';

test('issues a cryptographically sized opaque state for an allowed origin', () => {
  const store = createTraktOAuthStateStore({
    allowedOrigins: 'https://wiki.example.com'
  });

  const transaction = store.issue('https://wiki.example.com');

  assert.match(transaction.state, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(transaction.returnOrigin, 'https://wiki.example.com');
  assert.ok(transaction.expiresAt > Date.now());
});

test('rejects unallowlisted and non-origin return values', () => {
  const store = createTraktOAuthStateStore({
    allowedOrigins: 'https://wiki.example.com'
  });

  assert.equal(store.issue('https://attacker.example'), null);
  assert.equal(store.issue('https://wiki.example.com/path'), null);
  assert.equal(store.issue('javascript:alert(1)'), null);
});

test('consumes state exactly once', () => {
  const store = createTraktOAuthStateStore({
    allowedOrigins: 'https://wiki.example.com'
  });
  const issued = store.issue('https://wiki.example.com');

  assert.deepEqual(store.consume(issued.state), issued);
  assert.equal(store.consume(issued.state), null);
  assert.equal(store.consume('unknown-state'), null);
});

test('rejects expired state', () => {
  let timestamp = 1_000;
  const store = createTraktOAuthStateStore({
    allowedOrigins: 'https://wiki.example.com',
    now: () => timestamp
  });
  const issued = store.issue('https://wiki.example.com');

  timestamp += DEFAULT_TRAKT_OAUTH_STATE_TTL_MS;

  assert.equal(store.consume(issued.state), null);
});

test('normalizes configured origins without accepting arbitrary URLs', () => {
  const store = createTraktOAuthStateStore({
    allowedOrigins: ['https://WIKI.example.com/', 'http://localhost:5173']
  });

  assert.equal(store.resolveAllowedOrigin('https://wiki.example.com'), 'https://wiki.example.com');
  assert.equal(store.resolveAllowedOrigin('http://localhost:5173/'), 'http://localhost:5173');
  assert.equal(store.resolveAllowedOrigin('https://wiki.example.com.evil.test'), null);
});
