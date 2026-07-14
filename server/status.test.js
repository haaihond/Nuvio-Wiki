import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createStatusService,
  normalizeIbbyLabsStatus,
  normalizeCommunityEndpoints
} from './status.js';

const ibbyLabsPayload = {
  generatedAt: '2026-07-10T12:00:00.000Z',
  source: { name: 'IbbyLabs Uptime Tracker', url: 'https://uptime.ibbylabs.dev' },
  services: [
    {
      id: 'nuvio-website', name: 'Nuvio Website', group: 'Nuvio', url: 'https://nuvio.tv/',
      last: {
        state: 'UP', up: true, status: 200, latency: 125, checkDuration: 180,
        attemptCount: 1, checkedAt: '2026-07-10T12:00:00.000Z'
      },
      lastStateChangeAt: '2026-07-09T12:00:00.000Z',
      upSince: '2026-07-01T12:00:00.000Z',
      uptimePercent: 99.98,
      uptimeWindows: { h1: 100, h12: 100, h24: 99.9, d7: 99.98, d30: null }
    },
    {
      id: 'community-addon', name: 'Community Addon', group: 'Addons', url: 'https://addon.example/',
      last: { state: 'DEGRADED', up: true, latency: 850, checkedAt: '2026-07-10T12:00:00.000Z' }
    },
    {
      id: 'nuvio-api', name: 'Nuvio API', group: 'Nuvio', url: 'https://nuvio.tv/',
      last: { state: 'DOWN', up: false, latency: 900, checkedAt: '2026-07-10T12:00:00.000Z' }
    },
    {
      id: 'stremio-app', name: 'Stremio App', group: 'Stremio', url: 'https://app.strem.io/',
      last: { state: 'UP', up: true, latency: 200, checkedAt: '2026-07-10T12:00:00.000Z' }
    },
    {
      id: 'hidden-service', name: 'Hidden', group: 'Internal', hideFromStatusPage: true,
      last: { state: 'DOWN', up: false }
    }
  ]
};

const communityEndpoint = {
  name: 'AIOStreams (ElfHosted)',
  group: '03. AIOStreams Instances',
  key: '03--aiostreams-instances_aiostreams-elfhosted',
  results: [
    {
      hostname: 'aiostreams.elfhosted.com',
      duration: 180_000_000,
      success: false,
      timestamp: '2026-07-10T11:55:00.000Z'
    },
    {
      hostname: 'aiostreams.elfhosted.com',
      duration: 2_500_000_000,
      success: true,
      timestamp: '2026-07-10T12:00:00.000Z'
    }
  ]
};

const stremioPlatformEndpoint = {
  name: 'Stremio Website',
  group: '08. Stremio Platform Services',
  key: '08--stremio-platform-services_stremio-website',
  results: [{
    hostname: 'www.stremio.com',
    duration: 100_000_000,
    success: true,
    timestamp: '2026-07-10T12:00:00.000Z'
  }]
};

test('normalizes community checks and removes Stremio platform services', () => {
  const services = normalizeCommunityEndpoints([
    stremioPlatformEndpoint,
    communityEndpoint
  ]);

  assert.equal(services.length, 1);
  assert.equal(services[0].group, 'AIOStreams Instances');
  assert.equal(services[0].status, 'degraded');
  assert.equal(services[0].latencyMs, 2_500);
  assert.equal(
    services[0].url,
    'https://aiostreams.elfhosted.com/stremio/manifest.json'
  );
  assert.deepEqual(
    services[0].history.map((result) => result.status),
    ['outage', 'degraded']
  );
});

test('normalizes Ibby Labs services and puts every Nuvio service first', () => {
  const services = normalizeIbbyLabsStatus(ibbyLabsPayload);

  assert.equal(services.length, 4);
  assert.equal(services[0].kind, 'community');
  assert.equal(services[0].group, 'Nuvio');
  assert.equal(services[0].groupOrder, 0);
  assert.equal(services[0].name, 'Nuvio');
  assert.equal(services[0].latencyMs, 125);
  assert.equal(services[0].httpStatus, 200);
  assert.equal(services[0].checkDurationMs, 180);
  assert.equal(services[0].attemptCount, 1);
  assert.equal(services[0].uptimePercent, 99.98);
  assert.deepEqual(services[0].uptimeWindows, {
    h1: 100, h12: 100, h24: 99.9, d7: 99.98, d30: null
  });
  assert.equal(services[0].upSince, '2026-07-01T12:00:00.000Z');
  assert.deepEqual(services[0].history, []);
  assert.equal(services[1].kind, 'community');
  assert.equal(services[1].group, 'Nuvio');
  assert.equal(services[1].groupOrder, 0);
  assert.equal(services[1].name, 'Nuvio API');
  assert.equal(services[1].status, 'outage');
  assert.equal(services[2].status, 'degraded');
  assert.equal(services[2].hostname, 'addon.example');
  assert.equal(services[3].group, 'Stremio');
  assert.equal(services[3].groupOrder, Number.MAX_SAFE_INTEGER);
});

test('uses Ibby Labs by default and caches its overview', async () => {
  const calls = [];
  const getStatusOverview = createStatusService({
    fetchImpl: async (url) => {
      calls.push(url);
      return { ok: true, status: 200, json: async () => ibbyLabsPayload };
    },
    now: () => Date.parse('2026-07-10T12:00:00.000Z')
  });

  const first = await getStatusOverview();
  const cached = await getStatusOverview();

  assert.equal(calls.length, 1);
  assert.equal(first, cached);
  assert.equal(first.provider, 'ibbylabs');
  assert.equal(first.source.url, 'https://uptime.ibbylabs.dev');
  assert.deepEqual(first.summary, {
    total: 4, operational: 2, degraded: 1, outages: 1, unknown: 0
  });
});

test('builds and caches a combined Nuvio and community overview', async () => {
  const calls = [];
  let currentTime = Date.parse('2026-07-10T12:00:00.000Z');

  const fetchImpl = async (url) => {
    calls.push(url);
    if (String(url).includes('/api/v1/endpoints/statuses')) {
      return {
        ok: true,
        status: 200,
        json: async () => [communityEndpoint, stremioPlatformEndpoint]
      };
    }

    return {
      ok: true,
      status: 200,
      body: { cancel: async () => {} }
    };
  };

  const getStatusOverview = createStatusService({
    fetchImpl,
    now: () => currentTime,
    cacheTtlMs: 60_000
  });

  const first = await getStatusOverview({ provider: 'stremio-status' });
  const cached = await getStatusOverview({ provider: 'stremio-status' });

  assert.equal(calls.length, 2);
  assert.equal(first, cached);
  assert.equal(first.services[0].name, 'Nuvio');
  assert.equal(first.services.some((service) => service.name === 'Stremio Website'), false);
  assert.deepEqual(first.summary, {
    total: 2,
    operational: 1,
    degraded: 1,
    outages: 0,
    unknown: 0
  });

  currentTime += 61_000;
  const refreshed = await getStatusOverview({ provider: 'stremio-status' });
  assert.equal(calls.length, 4);
  assert.equal(refreshed.services[0].history.length, 2);
});

test('returns Nuvio status with a partial-data notice when the community monitor fails', async () => {
  const getStatusOverview = createStatusService({
    fetchImpl: async (url) => {
      if (String(url).includes('/api/v1/endpoints/statuses')) {
        throw new Error('upstream unavailable');
      }
      return {
        ok: true,
        status: 200,
        body: { cancel: async () => {} }
      };
    },
    now: () => Date.parse('2026-07-10T12:00:00.000Z')
  });

  const result = await getStatusOverview({ provider: 'stremio-status' });
  assert.equal(result.partial, true);
  assert.equal(result.services.length, 1);
  assert.equal(result.services[0].name, 'Nuvio');
  assert.match(result.notices[0], /Community service data/);
});
