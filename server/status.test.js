import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createStatusService,
  normalizeCommunityEndpoints
} from './status.js';

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

  const first = await getStatusOverview();
  const cached = await getStatusOverview();

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
  const refreshed = await getStatusOverview();
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

  const result = await getStatusOverview();
  assert.equal(result.partial, true);
  assert.equal(result.services.length, 1);
  assert.equal(result.services[0].name, 'Nuvio');
  assert.match(result.notices[0], /Community service data/);
});

