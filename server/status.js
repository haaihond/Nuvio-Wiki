const IBBY_LABS_STATUS_URL = 'https://uptime.ibbylabs.dev/v1/status';
const IBBY_LABS_STATUS_PAGE = 'https://uptime.ibbylabs.dev/';
const COMMUNITY_STATUS_URL =
  'https://status.stremio-status.com/api/v1/endpoints/statuses?page=1&pageSize=12';
const COMMUNITY_STATUS_PAGE = 'https://status.stremio-status.com/';
const NUVIO_URL = 'https://nuvio.tv/';
const FETCH_TIMEOUT_MS = 12_000;
const DEFAULT_CACHE_TTL_MS = 60_000;
const HISTORY_LIMIT = 12;

export const DEFAULT_STATUS_PROVIDER = 'ibbylabs';
export const STATUS_PROVIDERS = new Set([DEFAULT_STATUS_PROVIDER, 'stremio-status']);

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

function hostnameFromUrl(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

function boundedPercent(value) {
  if (value === null || value === undefined || value === '') return null;
  const percent = Number(value);
  return Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : null;
}

function ibbyLabsState(last, maintenance) {
  const state = String(last?.state || last?.rawState || '').toUpperCase();
  if (maintenance || state === 'MAINTENANCE') return 'degraded';
  if (state === 'DOWN' || state === 'OUTAGE' || last?.up === false) return 'outage';
  if (state === 'DEGRADED' || last?.flapping || last?.recovering) return 'degraded';
  if (state === 'UP' || last?.up === true) return 'operational';
  return 'unknown';
}

export function normalizeIbbyLabsStatus(payload) {
  if (!Array.isArray(payload?.services)) {
    throw new Error('Ibby Labs status response did not contain a services array.');
  }

  const groupOrders = new Map();
  const services = payload.services
    .filter((service) => !service?.hideFromStatusPage)
    .map((service) => {
      const group = String(service?.group || 'Other');
      if (!groupOrders.has(group)) groupOrders.set(group, groupOrders.size + 1);

      const last = service?.last || null;
      const status = ibbyLabsState(last, service?.maintenance);
      const checkedAt = last?.checkedAt || payload.generatedAt || null;
      const latency = last?.latency === null || last?.latency === undefined
        ? null
        : Number(last.latency);
      const latencyMs = Number.isFinite(latency) ? Math.max(0, Math.round(latency)) : null;
      const checkDuration = last?.checkDuration === null || last?.checkDuration === undefined
        ? null
        : Number(last.checkDuration);
      const httpStatus = last?.status === null || last?.status === undefined
        ? null
        : Number(last.status);
      const attemptCount = last?.attemptCount === null || last?.attemptCount === undefined
        ? null
        : Number(last.attemptCount);
      const uptimeWindows = Object.fromEntries(
        ['h1', 'h12', 'h24', 'd7', 'd30'].map((window) => [
          window,
          boundedPercent(service?.uptimeWindows?.[window])
        ])
      );
      const isNuvioService = group.trim().toLocaleLowerCase() === 'nuvio'
        || String(service?.id || '').startsWith('nuvio-');
      const isStremioService = group.trim().toLocaleLowerCase() === 'stremio'
        || String(service?.id || '').startsWith('stremio-');
      const isNuvioWebsite = service?.id === 'nuvio-website';

      return {
        id: String(service?.id || `${group}-${service?.name || 'service'}`),
        name: isNuvioWebsite ? 'Nuvio' : String(service?.name || 'Unnamed service'),
        group: isNuvioService ? 'Nuvio' : group,
        groupOrder: isNuvioService ? 0 : isStremioService ? Number.MAX_SAFE_INTEGER : groupOrders.get(group),
        kind: 'community',
        url: service?.url || null,
        hostname: hostnameFromUrl(service?.url),
        status,
        latencyMs,
        checkedAt,
        history: [],
        uptimePercent: boundedPercent(service?.uptimePercent),
        uptimeWindows,
        lastStateChangeAt: service?.lastStateChangeAt || null,
        upSince: service?.upSince || null,
        downSince: service?.downSince || null,
        httpStatus: Number.isFinite(httpStatus) ? Math.round(httpStatus) : null,
        checkDurationMs: Number.isFinite(checkDuration) ? Math.max(0, Math.round(checkDuration)) : null,
        attemptCount: Number.isFinite(attemptCount) ? Math.max(1, Math.round(attemptCount)) : null,
        statusDetail: service?.maintenance?.message
          || last?.degradedReason
          || last?.flapReason
          || last?.error
          || null
      };
    });

  return services.sort((a, b) =>
    a.groupOrder - b.groupOrder || a.name.localeCompare(b.name)
  );
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

async function fetchIbbyLabsStatus(fetchImpl) {
  const response = await requestWithTimeout(fetchImpl, IBBY_LABS_STATUS_URL, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Nuvio-Wiki-Status/1.0'
    }
  });

  if (!response.ok) throw new Error(`Ibby Labs status returned HTTP ${response.status}.`);
  const payload = await response.json();
  return {
    services: normalizeIbbyLabsStatus(payload),
    updatedAt: payload.generatedAt || null,
    source: {
      label: payload?.source?.name || 'Ibby Labs uptime monitor',
      url: payload?.source?.url || IBBY_LABS_STATUS_PAGE
    }
  };
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
    group: 'Nuvio',
    groupOrder: 0,
    kind: 'community',
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
  const caches = new Map();
  const inFlightRequests = new Map();
  let nuvioHistory = [];

  return async function getStatusOverview({ force = false, provider = DEFAULT_STATUS_PROVIDER } = {}) {
    const selectedProvider = STATUS_PROVIDERS.has(provider) ? provider : DEFAULT_STATUS_PROVIDER;
    const cached = caches.get(selectedProvider);
    if (!force && cached && now() - cached.cachedAt < cacheTtlMs) return cached.payload;
    if (inFlightRequests.has(selectedProvider)) return inFlightRequests.get(selectedProvider);

    const inFlight = (async () => {
      if (selectedProvider === DEFAULT_STATUS_PROVIDER) {
        const result = await fetchIbbyLabsStatus(fetchImpl);
        if (result.services.length === 0) throw new Error('No Ibby Labs status data is currently available.');

        const payload = {
          provider: selectedProvider,
          updatedAt: result.updatedAt || new Date(now()).toISOString(),
          partial: false,
          notices: [],
          summary: summarize(result.services),
          services: result.services,
          source: result.source
        };
        caches.set(selectedProvider, { cachedAt: now(), payload });
        return payload;
      }

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
        provider: selectedProvider,
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

      caches.set(selectedProvider, { cachedAt: now(), payload });
      return payload;
    })().finally(() => {
      inFlightRequests.delete(selectedProvider);
    });

    inFlightRequests.set(selectedProvider, inFlight);
    return inFlight;
  };
}

export const getStatusOverview = createStatusService();
