export const MAX_METADATA_BATCH_ITEMS = 1_000;
export const DEFAULT_METADATA_BATCH_CONCURRENCY = 24;

function abortError(message = 'The operation was aborted.') {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

function normalizeTmdbId(value) {
  const normalized = value == null ? '' : String(value).trim();
  return /^[1-9]\d{0,11}$/.test(normalized) ? normalized : null;
}

function normalizeImdbId(value) {
  const normalized = value == null ? '' : String(value).trim().toLowerCase();
  return /^tt\d{1,12}$/.test(normalized) ? normalized : null;
}

function safeText(value, maxLength) {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text.slice(0, maxLength) : null;
}

function normalizeItem(item) {
  const value = item && typeof item === 'object' && !Array.isArray(item) ? item : {};
  const type = value.content_type === 'movie' ? 'movie' : 'series';
  const tmdbId = normalizeTmdbId(value._ids?.tmdb);
  const imdbId = normalizeImdbId(value._ids?.imdb);
  const contentId = typeof value.content_id === 'number'
    ? value.content_id
    : safeText(value.content_id, 256);

  return {
    contentId,
    type,
    name: safeText(value.name, 256) || 'Untitled',
    tmdbId,
    imdbId,
    keys: [
      tmdbId ? `${type}:tmdb:${tmdbId}` : null,
      imdbId ? `${type}:imdb:${imdbId}` : null
    ].filter(Boolean)
  };
}

function publicResult(contentId, value, fromCache = false) {
  return {
    content_id: contentId,
    posterUrl: value.posterUrl || null,
    releaseDate: value.releaseDate || null,
    source: value.source,
    ...(value.retryable ? { retryable: true } : {}),
    ...(fromCache ? { fromCache: true } : {})
  };
}

function summarize(results, uniqueFetches) {
  const summary = {
    enriched: 0,
    fallback: 0,
    missing: 0,
    failed: 0,
    cached: 0,
    uniqueFetches
  };

  for (const result of results) {
    if (result.fromCache) summary.cached++;
    if (result.source === 'tmdb') summary.enriched++;
    else if (result.source === 'cinemeta') summary.fallback++;
    else if (result.source === 'missing') summary.missing++;
    else summary.failed++;
  }
  return summary;
}

export function validateMetadataBatch(items, maxItems = MAX_METADATA_BATCH_ITEMS) {
  if (!Array.isArray(items)) {
    const error = new Error('items array is required');
    error.status = 400;
    throw error;
  }
  if (items.length > maxItems) {
    const error = new Error(`A maximum of ${maxItems} metadata items is allowed per batch.`);
    error.status = 413;
    throw error;
  }
  return items;
}

/**
 * FIFO scheduler shared by every request. It bounds both concurrent sockets and
 * request start rate so large browser batches cannot stampede upstream APIs.
 */
export function createRequestScheduler({
  maxConcurrent = 12,
  minTimeMs = 30,
  maxQueue = 2_000
} = {}) {
  const queue = [];
  let active = 0;
  let nextStartAt = 0;
  let timer = null;

  function scheduleDrain(delay = 0) {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      drain();
    }, delay);
  }

  function drain() {
    while (queue.length && queue[0].cancelled) queue.shift();
    if (active >= maxConcurrent || queue.length === 0) return;

    const wait = Math.max(0, nextStartAt - Date.now());
    if (wait > 0) {
      scheduleDrain(wait);
      return;
    }

    const item = queue.shift();
    if (item.cancelled) {
      drain();
      return;
    }

    item.started = true;
    if (item.signal && item.onAbort) item.signal.removeEventListener('abort', item.onAbort);
    active++;
    nextStartAt = Date.now() + minTimeMs;

    Promise.resolve()
      .then(item.task)
      .then(item.resolve, item.reject)
      .finally(() => {
        active--;
        drain();
      });

    drain();
  }

  function schedule(task, { signal } = {}) {
    if (signal?.aborted) return Promise.reject(abortError());
    if (queue.length >= maxQueue) {
      const error = new Error('Metadata upstream queue is temporarily full.');
      error.name = 'OverloadError';
      error.status = 503;
      return Promise.reject(error);
    }

    return new Promise((resolve, reject) => {
      const item = { task, signal, resolve, reject, started: false, cancelled: false, onAbort: null };
      item.onAbort = () => {
        if (item.started || item.cancelled) return;
        item.cancelled = true;
        reject(abortError());
        drain();
      };
      signal?.addEventListener('abort', item.onAbort, { once: true });
      queue.push(item);
      drain();
    });
  }

  return { schedule };
}

export function createMetadataEnricher({
  cache,
  fetchMetadata,
  concurrency = DEFAULT_METADATA_BATCH_CONCURRENCY
}) {
  if (!cache || typeof cache.getMany !== 'function' || typeof cache.setMany !== 'function') {
    throw new Error('A metadata cache is required.');
  }
  if (typeof fetchMetadata !== 'function') throw new Error('fetchMetadata must be a function.');

  async function enrich(items, { signal } = {}) {
    const normalizedItems = validateMetadataBatch(items).map(normalizeItem);
    const allKeys = normalizedItems.flatMap(item => item.keys);
    const cachedValues = cache.getMany(allKeys);
    const taskByKey = new Map();
    const tasks = [];
    const prepared = [];

    for (const item of normalizedItems) {
      if (item.keys.length === 0) {
        prepared.push({ item, value: { posterUrl: null, releaseDate: null, source: 'missing' } });
        continue;
      }

      const cachedValue = item.keys.map(key => cachedValues.get(key)).find(Boolean);
      if (cachedValue) {
        prepared.push({ item, value: cachedValue, fromCache: true });
        continue;
      }

      let task = item.keys.map(key => taskByKey.get(key)).find(Boolean);
      if (!task) {
        task = { ...item, result: null };
        tasks.push(task);
      } else {
        task.tmdbId ||= item.tmdbId;
        task.imdbId ||= item.imdbId;
        task.keys = [...new Set([...task.keys, ...item.keys])];
      }
      for (const key of item.keys) taskByKey.set(key, task);
      prepared.push({ item, task });
    }

    let nextTask = 0;
    const cacheWrites = new Map();

    async function worker() {
      while (nextTask < tasks.length) {
        const task = tasks[nextTask++];
        if (signal?.aborted) {
          task.result = {
            posterUrl: null,
            releaseDate: null,
            source: 'failed',
            cacheable: false,
            retryable: true
          };
          continue;
        }

        try {
          const fetched = await fetchMetadata(task, { signal });
          task.result = {
            posterUrl: fetched?.posterUrl || null,
            releaseDate: fetched?.releaseDate || null,
            source: ['tmdb', 'cinemeta'].includes(fetched?.source) ? fetched.source : 'failed',
            resolvedTmdbId: normalizeTmdbId(fetched?.resolvedTmdbId),
            cacheable: fetched?.cacheable !== false,
            retryable: fetched?.retryable === true
          };
        } catch (error) {
          const retryable = ['AbortError', 'TimeoutError', 'TypeError'].includes(error?.name)
            || signal?.aborted;
          task.result = {
            posterUrl: null,
            releaseDate: null,
            source: 'failed',
            cacheable: !retryable,
            retryable
          };
        }

        if (task.result.cacheable) {
          const value = {
            posterUrl: task.result.posterUrl,
            releaseDate: task.result.releaseDate,
            source: task.result.source,
            updatedAt: Date.now()
          };
          for (const key of task.keys) cacheWrites.set(key, value);
          if (task.result.resolvedTmdbId) {
            cacheWrites.set(`${task.type}:tmdb:${task.result.resolvedTmdbId}`, value);
          }
        }
      }
    }

    const workers = Array.from(
      { length: Math.min(concurrency, tasks.length) },
      () => worker()
    );
    await Promise.all(workers);
    cache.setMany(cacheWrites);

    const results = prepared.map(entry => {
      if (entry.value) return publicResult(entry.item.contentId, entry.value, entry.fromCache);
      return publicResult(
        entry.item.contentId,
        entry.task.result || { posterUrl: null, releaseDate: null, source: 'failed' }
      );
    });

    return { results, summary: summarize(results, tasks.length) };
  }

  return { enrich };
}
