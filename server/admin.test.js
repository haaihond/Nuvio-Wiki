import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  ADMIN_COOKIE_NAME,
  ADMIN_SECRET_PREFIX,
  createAdminSecurity,
  createDashboardSnapshot,
  createPageFeedbackStore,
  createRequestMetrics,
  createServerLogStore,
  createSetupDoctorFeedbackStore,
  generateAdminSecret,
  getAdminClearCookieOptions,
  getAdminCookieOptions,
  isStrongAdminSecret
} from './admin.js';

test('stores bounded redacted server logs newest first', () => {
  let now = Date.parse('2026-07-12T12:00:00.000Z');
  const logs = createServerLogStore({ now: () => now, maxEntries: 2 });

  logs.record('info', ['Server ready', { port: 3001 }]);
  now += 1_000;
  logs.record('warn', ['token=do-not-expose', 'Retrying']);
  now += 1_000;
  logs.record('error', [new Error('Request failed')]);

  const snapshot = logs.snapshot();
  assert.equal(snapshot.retainedEntries, 2);
  assert.deepEqual(snapshot.counts, { debug: 0, info: 0, warn: 1, error: 1 });
  assert.equal(snapshot.entries[0].message, 'Error: Request failed');
  assert.match(snapshot.entries[1].message, /token=\[redacted\]/);
  assert.equal(JSON.stringify(snapshot).includes('do-not-expose'), false);
});

test('stores bounded anonymous Setup Doctor feedback and builds useful breakdowns', () => {
  let now = Date.parse('2026-07-12T10:00:00.000Z');
  const feedback = createSetupDoctorFeedbackStore({ now: () => now, maxEntries: 2 });
  const base = {
    areaId: 'playback', area: 'Playback', platformId: 'android-tv', platform: 'Android TV',
    symptomId: 'buffering', symptom: 'Streams keep buffering', page: '/setup-doctor',
    answers: [{ id: 'vpn', label: 'Does it work without VPN?', value: 'No' }],
    results: [{ id: 'network-buffering', label: 'Check the connection' }]
  };

  assert.deepEqual(feedback.record({ ...base, helpful: true }), { ok: true });
  now += 1_000;
  assert.deepEqual(feedback.record({ ...base, helpful: false }), { ok: true });
  now += 1_000;
  assert.deepEqual(feedback.record({ ...base, helpful: false, symptomId: 'other', symptom: 'Other symptom' }), { ok: true });
  assert.deepEqual(feedback.record({ ...base, helpful: 'yes' }), { ok: false });

  const snapshot = feedback.snapshot();
  assert.deepEqual(snapshot.summary, {
    total: 2, helpful: 0, notHelpful: 2, helpRate: 0, retainedEntries: 2, retentionLimit: 2
  });
  assert.equal(snapshot.byPlatform[0].label, 'Android TV');
  assert.equal(snapshot.bySymptom.length, 2);
  assert.equal(snapshot.recent[0].symptom.id, 'other');
  assert.equal(JSON.stringify(snapshot).includes('203.0.113'), false);
});

test('stores bounded anonymous page feedback and aggregates it by page', () => {
  let now = Date.parse('2026-07-15T10:00:00.000Z');
  const feedback = createPageFeedbackStore({ now: () => now, maxEntries: 3 });

  assert.deepEqual(feedback.record({
    helpful: true,
    page: '/installation/windows.html?source=nav',
    title: 'Install Nuvio on Windows',
    userAgent: 'must not be retained'
  }), { ok: true });
  now += 1_000;
  assert.deepEqual(feedback.record({
    helpful: false,
    page: '/installation/windows.html',
    title: 'Install Nuvio on Windows'
  }), { ok: true });
  now += 1_000;
  assert.deepEqual(feedback.record({ helpful: true, page: '/faq', title: 'FAQ' }), { ok: true });
  assert.deepEqual(feedback.record({ helpful: 'yes', page: '/faq' }), { ok: false });
  assert.deepEqual(feedback.record({ helpful: true, page: 'https://example.com' }), { ok: false });

  const snapshot = feedback.snapshot();
  assert.deepEqual(snapshot.summary, {
    total: 3, helpful: 2, notHelpful: 1, helpRate: 0.6667, retainedEntries: 3, retentionLimit: 3
  });
  assert.equal(snapshot.byPage[0].page, '/installation/windows.html');
  assert.equal(snapshot.byPage[0].total, 2);
  assert.equal(snapshot.byPage[0].helpRate, 0.5);
  assert.equal(snapshot.recent[0].page, '/faq');
  assert.equal(JSON.stringify(snapshot).includes('must not be retained'), false);
});

const STRONG_SECRET =
  'nuvio-admin:Ab3_defGHIjklMNOpqrSTUvwxYZ0123456789-ABCDE';

function sequentialRandomBytes() {
  let value = 0;
  return (size) => {
    const output = Buffer.alloc(size, value % 251);
    output.writeUInt32BE(++value, Math.max(0, size - 4));
    return output;
  };
}

test('requires the full prefixed, high-diversity admin trigger', () => {
  assert.equal(isStrongAdminSecret(STRONG_SECRET), true);
  assert.equal(isStrongAdminSecret(STRONG_SECRET.slice(ADMIN_SECRET_PREFIX.length)), false);
  assert.equal(isStrongAdminSecret('Nuvio-admin:Ab3_defGHIjklMNOpqrSTUvwxYZ0123456789-ABCDE'), false);
  assert.equal(isStrongAdminSecret('nuvio-admin:Ab3_short'), false);
  assert.equal(isStrongAdminSecret(`nuvio-admin:${'a'.repeat(64)}`), false);
  assert.equal(isStrongAdminSecret(`nuvio-admin:${'Ab3 '.repeat(20)}`), false);
  assert.equal(isStrongAdminSecret('nuvio-admin:codex'), true);
  assert.equal(isStrongAdminSecret(null), false);
});

test('generates a complete 256-bit base64url search trigger', () => {
  const generated = generateAdminSecret();
  assert.equal(generated.startsWith(ADMIN_SECRET_PREFIX), true);
  assert.equal(generated.slice(ADMIN_SECRET_PREFIX.length).length, 43);
  assert.equal(isStrongAdminSecret(generated), true);
});

test('returns tightly scoped HttpOnly and SameSite cookie options', () => {
  assert.equal(ADMIN_COOKIE_NAME, 'nuvio_admin');
  assert.deepEqual(getAdminCookieOptions({ secure: true, maxAgeMs: 12_345 }), {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/api/admin',
    maxAge: 12_345
  });
  const clear = getAdminClearCookieOptions({ secure: false });
  assert.equal(clear.httpOnly, true);
  assert.equal(clear.secure, false);
  assert.equal(clear.sameSite, 'strict');
  assert.equal(clear.path, '/api/admin');
  assert.equal(clear.maxAge, 0);
  assert.equal(clear.expires.getTime(), 0);
  assert.equal('domain' in clear, false);
});

test('uses the same generic failure for missing configuration and bad input', () => {
  const disabled = createAdminSecurity({ secret: undefined });
  const configured = createAdminSecurity({ secret: STRONG_SECRET });

  assert.equal(disabled.isConfigured(), false);
  assert.equal(configured.isConfigured(), true);
  assert.deepEqual(disabled.unlock(STRONG_SECRET), { ok: false });
  assert.deepEqual(configured.unlock('wrong'), { ok: false });
  assert.deepEqual(configured.unlock(`${STRONG_SECRET} `), { ok: false });
  assert.deepEqual(configured.unlock({ secret: STRONG_SECRET }), { ok: false });
});

test('creates opaque sessions while snapshots retain no secret or token', () => {
  let now = Date.parse('2026-07-11T10:00:00.000Z');
  const security = createAdminSecurity({
    secret: STRONG_SECRET,
    now: () => now,
    randomBytesImpl: sequentialRandomBytes(),
    idleTtlMs: 60_000,
    absoluteTtlMs: 300_000
  });

  const unlocked = security.unlock(STRONG_SECRET);
  assert.equal(unlocked.ok, true);
  assert.match(unlocked.sessionToken, /^[A-Za-z0-9_-]{43}$/);
  assert.deepEqual(security.verifySession(unlocked.sessionToken, { touch: false }), {
    ok: true,
    createdAt: '2026-07-11T10:00:00.000Z',
    idleExpiresAt: '2026-07-11T10:01:00.000Z',
    expiresAt: '2026-07-11T10:05:00.000Z'
  });
  assert.deepEqual(security.verifySession('not-a-session'), { ok: false });

  const snapshotText = JSON.stringify(security.snapshot());
  assert.equal(snapshotText.includes(STRONG_SECRET), false);
  assert.equal(snapshotText.includes(unlocked.sessionToken), false);
  assert.equal(JSON.parse(snapshotText).activeSessions, 1);

  now += 1_000;
  assert.deepEqual(security.revokeSession('not-a-session'), { ok: true });
  assert.deepEqual(security.revokeSession(unlocked.sessionToken), { ok: true });
  assert.deepEqual(security.verifySession(unlocked.sessionToken), { ok: false });
});

test('refreshes idle expiry but never extends absolute expiry', () => {
  let now = 1_000_000;
  const security = createAdminSecurity({
    secret: STRONG_SECRET,
    now: () => now,
    randomBytesImpl: sequentialRandomBytes(),
    idleTtlMs: 10_000,
    absoluteTtlMs: 20_000
  });
  const session = security.unlock(STRONG_SECRET);

  now += 9_000;
  const firstTouch = security.verifySession(session.sessionToken);
  assert.equal(firstTouch.ok, true);
  assert.equal(firstTouch.idleExpiresAt, new Date(1_019_000).toISOString());
  assert.equal(firstTouch.expiresAt, new Date(1_020_000).toISOString());

  now += 9_000;
  const secondTouch = security.verifySession(session.sessionToken);
  assert.equal(secondTouch.ok, true);
  assert.equal(secondTouch.idleExpiresAt, new Date(1_020_000).toISOString());

  now += 2_000;
  assert.deepEqual(security.verifySession(session.sessionToken), { ok: false });
  assert.equal(security.snapshot().counters.sessionsExpiredAbsolute, 1);
});

test('expires untouched sessions on their idle deadline', () => {
  let now = 50_000;
  const security = createAdminSecurity({
    secret: STRONG_SECRET,
    now: () => now,
    randomBytesImpl: sequentialRandomBytes(),
    idleTtlMs: 5_000,
    absoluteTtlMs: 50_000
  });
  const session = security.unlock(STRONG_SECRET);
  now = 55_000;
  assert.deepEqual(security.verifySession(session.sessionToken), { ok: false });
  assert.equal(security.snapshot().counters.sessionsExpiredIdle, 1);
});

test('bounds the session store and evicts the oldest session', () => {
  let now = 100_000;
  const security = createAdminSecurity({
    secret: STRONG_SECRET,
    now: () => now,
    randomBytesImpl: sequentialRandomBytes(),
    maxSessions: 2
  });
  const first = security.unlock(STRONG_SECRET);
  now += 1;
  const second = security.unlock(STRONG_SECRET);
  now += 1;
  const third = security.unlock(STRONG_SECRET);

  assert.deepEqual(security.verifySession(first.sessionToken), { ok: false });
  assert.equal(security.verifySession(second.sessionToken).ok, true);
  assert.equal(security.verifySession(third.sessionToken).ok, true);
  const snapshot = security.snapshot();
  assert.equal(snapshot.activeSessions, 2);
  assert.equal(snapshot.counters.sessionsCreated, 3);
  assert.equal(snapshot.counters.sessionsEvicted, 1);

  security.recordRateLimitedAttempt();
  assert.equal(security.snapshot().counters.rateLimitedAttempts, 1);
  assert.equal(security.revokeAllSessions(), 2);
  assert.equal(security.snapshot().activeSessions, 0);
});

test('records bounded traffic aggregates without admin traffic or client data', () => {
  const now = Date.parse('2026-07-11T12:30:00.000Z');
  const metrics = createRequestMetrics({
    now: () => now,
    anonymizationKey: Buffer.alloc(32, 7),
    minuteRetention: 2,
    hourRetention: 2,
    maxRecentRequests: 5
  });

  assert.equal(metrics.recordRequest({
    method: 'post',
    routeTemplate: '/api/ai/chat?query=secret-search',
    path: '/api/ai/chat?query=secret-search',
    statusCode: 200,
    durationMs: 10,
    clientIp: '203.0.113.10',
    userAgent: 'Private Browser/1.0'
  }), true);
  metrics.recordRequest({
    method: 'POST',
    routeTemplate: '/api/ai/chat',
    path: '/api/ai/chat',
    statusCode: 500,
    durationMs: 50,
    clientIp: '203.0.113.10',
    userAgent: 'Private Browser/1.0'
  });
  metrics.recordRequest({
    method: 'GET',
    routeTemplate: '/api/status',
    path: '/api/status',
    statusCode: 404,
    durationMs: 20,
    clientIp: '198.51.100.8',
    userAgent: 'Another Browser/2.0'
  });
  assert.equal(metrics.recordRequest({
    method: 'POST',
    routeTemplate: '/api/admin/session',
    path: '/api/admin/session?candidate=never-store-this',
    statusCode: 401,
    durationMs: 99,
    clientIp: '192.0.2.1',
    userAgent: 'Attacker'
  }), false);

  const snapshot = metrics.snapshot();
  assert.equal(snapshot.summary.requests, 3);
  assert.equal(snapshot.summary.successful, 1);
  assert.equal(snapshot.summary.clientErrors, 1);
  assert.equal(snapshot.summary.serverErrors, 1);
  assert.equal(snapshot.summary.p95DurationMs, 50);
  assert.equal(snapshot.summary.uniqueClientsLastHour, 2);
  assert.equal(snapshot.summary.uniqueClientsLast24Hours, 2);
  assert.equal(snapshot.minuteSeries.length, 2);
  assert.equal(snapshot.hourSeries.length, 2);
  assert.equal(snapshot.endpoints.find((entry) => entry.route === '/api/ai/chat').requests, 2);
  assert.equal(snapshot.recentRequests[0].endpoint, '/api/ai/chat');

  const serialized = JSON.stringify(snapshot);
  for (const sensitive of [
    'secret-search',
    'never-store-this',
    '203.0.113.10',
    '198.51.100.8',
    'Private Browser',
    'Another Browser',
    '/api/admin'
  ]) {
    assert.equal(serialized.includes(sensitive), false, `did not retain ${sensitive}`);
  }
});

test('bounds recent requests, endpoint series, and latency samples', () => {
  let now = 0;
  const metrics = createRequestMetrics({
    now: () => now,
    anonymizationKey: Buffer.alloc(32, 8),
    minuteRetention: 2,
    hourRetention: 2,
    maxRecentRequests: 2,
    maxEndpoints: 2,
    maxLatencySamples: 16
  });

  for (let index = 0; index < 20; index += 1) {
    now = index * 60_000;
    metrics.recordRequest({
      method: 'GET',
      routeTemplate: `/route-${index % 3}`,
      path: `/route-${index % 3}`,
      statusCode: 200,
      durationMs: index,
      clientIp: `198.51.100.${index}`,
      userAgent: 'test'
    });
  }

  const snapshot = metrics.snapshot();
  assert.equal(snapshot.summary.requests, 20);
  assert.equal(snapshot.recentRequests.length, 2);
  assert.equal(snapshot.endpoints.length, 2);
  assert.equal(snapshot.summary.endpointSeriesEvicted > 0, true);
  assert.equal(snapshot.minuteSeries.length, 2);
  assert.equal(snapshot.hourSeries.length, 2);
});

test('caps client-cardinality sets while preserving anonymized counts', () => {
  const metrics = createRequestMetrics({
    now: () => 10_000,
    anonymizationKey: Buffer.alloc(32, 9),
    minuteRetention: 1,
    hourRetention: 1,
    maxClientsPerAggregate: 16
  });
  for (let index = 0; index < 30; index += 1) {
    metrics.recordRequest({
      method: 'GET',
      routeTemplate: '/api/status',
      path: '/api/status',
      statusCode: 200,
      durationMs: 1,
      clientIp: `192.0.2.${index}`,
      userAgent: `browser-${index}`
    });
  }
  const snapshot = metrics.snapshot();
  assert.equal(snapshot.summary.uniqueClientsLastHour, 16);
  assert.equal(snapshot.summary.uniqueClientsLast24Hours, 16);
  assert.equal(snapshot.summary.uniqueClientsCapped, true);
  assert.equal(snapshot.endpoints[0].uniqueClients, 16);
  assert.equal(snapshot.endpoints[0].uniqueClientsCapped, true);
});

test('Express middleware resolves route templates and records early closes once', () => {
  let now = 1_000;
  const metrics = createRequestMetrics({
    now: () => now,
    anonymizationKey: Buffer.alloc(32, 10),
    minuteRetention: 1,
    hourRetention: 1
  });
  const response = new EventEmitter();
  response.statusCode = 201;
  response.writableEnded = true;
  const request = {
    method: 'POST',
    originalUrl: '/api/items/real-id?token=secret',
    baseUrl: '/api/items',
    route: { path: '/:itemId' },
    ip: '203.0.113.22',
    get: () => 'Hidden Agent'
  };
  let nextCalls = 0;
  metrics.middleware(request, response, () => { nextCalls += 1; });
  assert.equal(metrics.snapshot().summary.activeRequests, 1);
  now = 1_042;
  response.emit('finish');
  response.emit('close');

  let snapshot = metrics.snapshot();
  assert.equal(nextCalls, 1);
  assert.equal(snapshot.summary.requests, 1);
  assert.equal(snapshot.summary.activeRequests, 0);
  assert.equal(snapshot.recentRequests[0].endpoint, '/api/items/:itemId');
  assert.equal(snapshot.recentRequests[0].durationMs, 42);
  assert.equal(JSON.stringify(snapshot).includes('real-id'), false);
  assert.equal(JSON.stringify(snapshot).includes('Hidden Agent'), false);

  const closedResponse = new EventEmitter();
  closedResponse.statusCode = 200;
  closedResponse.writableEnded = false;
  metrics.middleware({
    method: 'GET',
    originalUrl: '/api/status',
    route: { path: '/api/status' },
    get: () => ''
  }, closedResponse, () => {});
  now = 1_050;
  closedResponse.emit('close');
  snapshot = metrics.snapshot();
  assert.equal(snapshot.summary.requests, 2);
  assert.equal(snapshot.recentRequests.at(-1).statusCode, 499);

  const adminResponse = new EventEmitter();
  metrics.middleware({ method: 'POST', originalUrl: '/api/admin/session' }, adminResponse, () => {});
  adminResponse.emit('finish');
  assert.equal(metrics.snapshot().summary.requests, 2);
});

test('tracks distinct clients across retained hourly buckets for 24 hours', () => {
  let now = Date.parse('2026-07-11T00:00:00.000Z');
  const metrics = createRequestMetrics({
    now: () => now,
    anonymizationKey: Buffer.alloc(32, 11),
    minuteRetention: 60,
    hourRetention: 24
  });
  metrics.recordRequest({
    method: 'GET', routeTemplate: '/api/status', path: '/api/status',
    statusCode: 200, durationMs: 1, clientIp: '192.0.2.1', userAgent: 'a'
  });
  now += 23 * 60 * 60_000;
  metrics.recordRequest({
    method: 'GET', routeTemplate: '/api/status', path: '/api/status',
    statusCode: 200, durationMs: 1, clientIp: '192.0.2.2', userAgent: 'b'
  });
  const snapshot = metrics.snapshot();
  assert.equal(snapshot.summary.uniqueClientsLastHour, 1);
  assert.equal(snapshot.summary.uniqueClientsLast24Hours, 2);
});

test('builds a whitelisted runtime, system, disk, content, traffic, and security snapshot', () => {
  const now = Date.parse('2026-07-11T15:00:00.000Z');
  const processRef = {
    uptime: () => 12,
    memoryUsage: () => ({
      rss: 1_000,
      heapTotal: 800,
      heapUsed: 400,
      external: 100,
      arrayBuffers: 50
    }),
    cpuUsage: () => ({ user: 20, system: 10 }),
    resourceUsage: () => ({
      maxRSS: 99,
      voluntaryContextSwitches: 8,
      involuntaryContextSwitches: 2
    }),
    version: 'v24.0.0',
    pid: 123,
    platform: 'linux',
    arch: 'x64'
  };
  const osRef = {
    totalmem: () => 1_000,
    freemem: () => 250,
    cpus: () => [{}, {}, {}, {}],
    loadavg: () => [0.25, 0.5, 0.75],
    uptime: () => 500,
    release: () => 'test-release',
    platform: () => 'linux',
    arch: () => 'x64'
  };
  const performanceRef = {
    eventLoopUtilization: () => ({ utilization: 0.12345, active: 4.567, idle: 8.9 })
  };
  const metrics = { snapshot: () => ({ summary: { requests: 7 } }) };
  const security = { snapshot: () => ({ activeSessions: 1 }) };

  const snapshot = createDashboardSnapshot({
    now: () => now,
    processRef,
    osRef,
    performanceRef,
    statfs: () => ({ bsize: 10, blocks: 100, bfree: 40, bavail: 30 }),
    diskPaths: [{ label: 'state', path: '/super/secret/server/path' }],
    content: {
      pageCount: 42,
      totalBytes: 123_456,
      lastUpdatedAt: '2026-07-11T14:59:00.000Z',
      knowledgeMode: 'file-search',
      model: 'gemini-test',
      knowledgeLoaded: true,
      fileCount: 42,
      contentChars: 123_456,
      integrations: { gemini: true, trakt: false, simkl: true, tmdb: true, private: 'secret' },
      apiKey: 'must-not-leak',
      fileSearchStoreName: 'stores/private-name',
      contentHash: 'private-hash'
    },
    metrics,
    security
  });

  assert.equal(snapshot.generatedAt, '2026-07-11T15:00:00.000Z');
  assert.equal(snapshot.runtime.startedAt, '2026-07-11T14:59:48.000Z');
  assert.equal(snapshot.runtime.memory.heapUsedBytes, 400);
  assert.equal(snapshot.runtime.eventLoop.utilization, 0.1235);
  assert.equal(snapshot.system.cpuCount, 4);
  assert.equal(snapshot.system.memory.usedPercent, 75);
  assert.deepEqual(snapshot.disks[0], {
    label: 'state',
    available: true,
    totalBytes: 1_000,
    usedBytes: 600,
    availableBytes: 300,
    usedPercent: 60
  });
  assert.equal(snapshot.content.pageCount, 42);
  assert.equal(snapshot.content.totalBytes, 123_456);
  assert.equal(snapshot.content.lastUpdatedAt, '2026-07-11T14:59:00.000Z');
  assert.deepEqual(snapshot.content.integrations, {
    gemini: true,
    trakt: false,
    simkl: true,
    tmdb: true
  });
  assert.equal(snapshot.traffic.summary.requests, 7);
  assert.equal(snapshot.security.activeSessions, 1);

  const serialized = JSON.stringify(snapshot);
  for (const sensitive of [
    '/super/secret/server/path',
    'must-not-leak',
    'stores/private-name',
    'private-hash',
    '"private"'
  ]) {
    assert.equal(serialized.includes(sensitive), false, `did not expose ${sensitive}`);
  }
});

test('reports unavailable disks without exposing paths or errors', () => {
  const snapshot = createDashboardSnapshot({
    diskPaths: [{ label: 'state', path: '/private/path' }],
    statfs: () => { throw new Error('sensitive failure for /private/path'); }
  });
  assert.deepEqual(snapshot.disks, [{ label: 'state', available: false }]);
  assert.equal(JSON.stringify(snapshot).includes('/private/path'), false);
  assert.equal(JSON.stringify(snapshot).includes('sensitive failure'), false);
});
