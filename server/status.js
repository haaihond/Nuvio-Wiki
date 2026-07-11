const COMMUNITY_STATUS_URL =
  'https://status.stremio-status.com/api/v1/endpoints/statuses?page=1&pageSize=12';
const COMMUNITY_STATUS_PAGE = 'https://status.stremio-status.com/';
const NUVIO_URL = 'https://nuvio.tv/';
const FETCH_TIMEOUT_MS = 12_000;
const DEFAULT_CACHE_TTL_MS = 60_000;
const HISTORY_LIMIT = 12;

// The Gatus status response exposes hostnames but not the checked path. Keep the
// exact public instance URLs here so the UI can link to the same endpoints that
// the reference monitor checks.
const INSTANCE_URLS = new Map([
  ['AIOStreams (ElfHosted)', 'https://aiostreams.elfhosted.com/stremio/manifest.json'],
  ['AIOStreams (Nhyira)', 'https://aiostreams.fortheweak.cloud/stremio/manifest.json'],
  ['AIOStreams (Nhyira Nightly)', 'https://aiostreams-nightly.fortheweak.cloud/stremio/manifest.json'],
  ['AIOStreams (MidnightIgnite)', 'https://aiostreamsfortheweebsstable.midnightignite.me/stremio/manifest.json'],
  ['AIOStreams (MidnightIgnite Nightly)', 'https://aiostreamsfortheweebs.midnightignite.me/stremio/manifest.json'],
  ['AIOStreams (ATBP)', 'https://aio.atbphosting.com/stremio/manifest.json'],
  ['AIOStreams (12312023)', 'https://aiostreams.12312023.xyz/stremio/manifest.json'],
  ['AIOStreams (Kuu)', 'https://aiostreams.stremio.ru/stremio/manifest.json'],
  ['AIOStreams (Kuu Nightly)', 'https://aiostreams-nightly.stremio.ru/stremio/manifest.json'],
  ['AIOStreams (Viren070)', 'https://aiostreams.viren070.me/stremio/manifest.json'],
  ['AIOMetadata (ElfHosted)', 'https://aiometadata.elfhosted.com/manifest.json'],
  ['AIOMetadata (Nhyira)', 'https://aiometadata.fortheweak.cloud/manifest.json'],
  ['AIOMetadata (MidnightIgnite)', 'https://aiometadatafortheweebs.midnightignite.me/manifest.json'],
  ['AIOMetadata (12312023)', 'https://aiometadata.12312023.xyz/manifest.json'],
  ['AIOMetadata (Kuu)', 'https://aiometadata.stremio.ru/manifest.json'],
  ['AIOMetadata (ATBP)', 'https://aiomd.atbphosting.com/manifest.json'],
  ['AIOMetadata (Viren070)', 'https://aiometadata.viren070.me/manifest.json'],
  ['StremThru (ElfHosted)', 'https://stremthru.elfhosted.com/stremio/manifest.json'],
  ['StremThru (MidnightIgnite)', 'https://stremthrufortheweebs.midnightignite.me/stremio/manifest.json'],
  ['StremThru (Nhyira)', 'https://stremthru.fortheweak.cloud/stremio/manifest.json'],
  ['StremThru (13377001)', 'https://stremthru.13377001.xyz/stremio/manifest.json'],
  ['StremThru (Kuu)', 'https://stremthru.stremio.ru/stremio/manifest.json'],
  ['StremThru (ATBP)', 'https://stremthru.atbphosting.com/stremio/manifest.json'],
  ['MediaFusion (ElfHosted)', 'https://mediafusion.elfhosted.com/manifest.json'],
  ['MediaFusion (MidnightIgnite)', 'https://mediafusionfortheweebs.midnightignite.me/manifest.json'],
  ['MediaFusion (Kuu)', 'https://mediafusion.stremio.ru/manifest.json'],
  ['Comet (ElfHosted)', 'https://comet.elfhosted.com/manifest.json'],
  ['Comet (MidnightIgnite)', 'https://cometfortheweebs.midnightignite.me/manifest.json'],
  ['Comet (Goldy)', 'https://comet.feels.legal/manifest.json'],
  ['Comet (Kuu)', 'https://comet.stremio.ru/manifest.json']
]);

function requestWithTimeout(fetchImpl, url, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  return fetchImpl(url, { ...init, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

function toLatencyMs(duration) {
  const nanoseconds = Number(duration);
  return Number.isFinite(nanoseconds) ? Math.max(0, Math.round(nanoseconds / 1_000_000)) : null;
}

function statusFromResult(result) {
  if (!result || typeof result.success !== 'boolean') return 'unknown';
  if (!result.success) return 'outage';

  const latencyMs = toLatencyMs(result.duration);
  return latencyMs !== null && latencyMs >= 2_000 ? 'degraded' : 'operational';
}

function cleanGroup(group) {
  return String(group || 'Other').replace(/^\d+\.\s*/, '');
}

function groupOrder(group) {
  const match = String(group || '').match(/^(\d+)\./);
  return match ? Number(match[1]) : 99;
}

function endpointUrl(name, latestResult) {
  if (INSTANCE_URLS.has(name)) return INSTANCE_URLS.get(name);
  const hostname = String(latestResult?.hostname || '').trim();
  return hostname ? `https://${hostname}` : null;
}

export function normalizeCommunityEndpoint(endpoint) {
  const results = Array.isArray(endpoint?.results)
    ? endpoint.results
      .filter((result) => result && result.timestamp)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .slice(-HISTORY_LIMIT)
    : [];
  const latest = results.at(-1) || null;
  const name = String(endpoint?.name || 'Unnamed service').replace(/^!\s*/, '');

  return {
    id: String(endpoint?.key || `${cleanGroup(endpoint?.group)}-${name}`),
    name,
    group: cleanGroup(endpoint?.group),
    groupOrder: groupOrder(endpoint?.group),
    kind: 'community',
    url: endpointUrl(name, latest),
    hostname: latest?.hostname || null,
    status: statusFromResult(latest),
    latencyMs: toLatencyMs(latest?.duration),
    checkedAt: latest?.timestamp || null,
    history: results.map((result) => ({
      status: statusFromResult(result),
      latencyMs: toLatencyMs(result.duration),
      checkedAt: result.timestamp
    }))
  };
}

export function normalizeCommunityEndpoints(endpoints) {
  if (!Array.isArray(endpoints)) throw new Error('Community status response was not an array.');

  return endpoints
    .filter((endpoint) => !String(endpoint?.group || '').includes('Stremio Platform Services'))
    .map(normalizeCommunityEndpoint)
    .sort((a, b) => a.groupOrder - b.groupOrder || a.name.localeCompare(b.name));
}

async function fetchCommunityEndpoints(fetchImpl) {
  const response = await requestWithTimeout(fetchImpl, COMMUNITY_STATUS_URL, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Nuvio-Wiki-Status/1.0'
    }
  });

  if (!response.ok) throw new Error(`Community status returned HTTP ${response.status}.`);
  return normalizeCommunityEndpoints(await response.json());
}

async function checkNuvio(fetchImpl, now, priorHistory) {
  const startedAt = now();
  let response;
  let status = 'outage';

  try {
    response = await requestWithTimeout(fetchImpl, NUVIO_URL, {
      redirect: 'follow',
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'Nuvio-Wiki-Status/1.0'
      }
    });
    status = response.ok ? 'operational' : 'outage';
  } catch {
    status = 'outage';
  } finally {
    if (response?.body?.cancel) await response.body.cancel().catch(() => {});
  }

  const checkedAt = new Date(now()).toISOString();
  const latencyMs = Math.max(0, now() - startedAt);
  const history = [
    ...(Array.isArray(priorHistory) ? priorHistory : []),
    { status, latencyMs, checkedAt }
  ].slice(-HISTORY_LIMIT);

  return {
    id: 'nuvio-platform',
    name: 'Nuvio',
    group: 'Nuvio Platform',
    groupOrder: 0,
    kind: 'platform',
    url: NUVIO_URL,
    hostname: 'nuvio.tv',
    status,
    latencyMs,
    checkedAt,
    history
  };
}

function summarize(services) {
  return services.reduce((summary, service) => {
    summary.total += 1;
    if (service.status === 'operational') summary.operational += 1;
    else if (service.status === 'degraded') summary.degraded += 1;
    else if (service.status === 'outage') summary.outages += 1;
    else summary.unknown += 1;
    return summary;
  }, { total: 0, operational: 0, degraded: 0, outages: 0, unknown: 0 });
}

export function createStatusService({
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
  cacheTtlMs = DEFAULT_CACHE_TTL_MS
} = {}) {
  let cache = null;
  let inFlight = null;
  let nuvioHistory = [];

  return async function getStatusOverview({ force = false } = {}) {
    if (!force && cache && now() - cache.cachedAt < cacheTtlMs) return cache.payload;
    if (inFlight) return inFlight;

    inFlight = (async () => {
      const [communityResult, nuvioResult] = await Promise.allSettled([
        fetchCommunityEndpoints(fetchImpl),
        checkNuvio(fetchImpl, now, nuvioHistory)
      ]);

      const services = [];
      const notices = [];

      if (nuvioResult.status === 'fulfilled') {
        nuvioHistory = nuvioResult.value.history;
        services.push(nuvioResult.value);
      } else {
        notices.push('The Nuvio platform check is temporarily unavailable.');
      }

      if (communityResult.status === 'fulfilled') {
        services.push(...communityResult.value);
      } else {
        notices.push('Community service data is temporarily unavailable.');
      }

      if (services.length === 0) throw new Error('No status data is currently available.');

      const payload = {
        updatedAt: new Date(now()).toISOString(),
        partial: notices.length > 0,
        notices,
        summary: summarize(services),
        services,
        source: {
          label: 'Community service monitor',
          url: COMMUNITY_STATUS_PAGE
        }
      };

      cache = { cachedAt: now(), payload };
      return payload;
    })().finally(() => {
      inFlight = null;
    });

    return inFlight;
  };
}

export const getStatusOverview = createStatusService();

