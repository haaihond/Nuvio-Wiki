import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMetadataEnricher,
  createRequestScheduler,
  MAX_METADATA_BATCH_ITEMS,
  validateMetadataBatch
} from './metadata-enrichment.js';

function createMemoryCache(initial = []) {
  const values = new Map(initial);
  return {
    values,
    getMany: keys => new Map(keys.filter(key => values.has(key)).map(key => [key, values.get(key)])),
    setMany: entries => {
      for (const [key, value] of entries) values.set(key, value);
    }
  };
}

test('accepts full-sized batches and rejects work beyond the explicit cap', () => {
  const fullBatch = Array.from({ length: MAX_METADATA_BATCH_ITEMS }, () => ({}));
  assert.equal(validateMetadataBatch(fullBatch).length, MAX_METADATA_BATCH_ITEMS);
  assert.throws(
    () => validateMetadataBatch([...fullBatch, {}]),
    error => error.status === 413 && /maximum/.test(error.message)
  );
});

test('bulk-loads cache hits without making upstream calls', async () => {
  const cache = createMemoryCache([['movie:tmdb:11', {
    posterUrl: 'poster',
    releaseDate: '1977-05-25',
    source: 'tmdb'
  }]]);
  let fetches = 0;
  const enricher = createMetadataEnricher({
    cache,
    fetchMetadata: async () => {
      fetches++;
      return { source: 'failed' };
    }
  });

  const output = await enricher.enrich([{
    content_id: 'tt0076759',
    content_type: 'movie',
    _ids: { tmdb: 11 }
  }]);

  assert.equal(fetches, 0);
  assert.equal(output.results[0].posterUrl, 'poster');
  assert.equal(output.results[0].fromCache, true);
  assert.equal(output.summary.cached, 1);
});

test('deduplicates repeated IDs and writes all aliases in one batch', async () => {
  const cache = createMemoryCache();
  let fetches = 0;
  const enricher = createMetadataEnricher({
    cache,
    fetchMetadata: async item => {
      fetches++;
      return {
        posterUrl: 'poster',
        releaseDate: '2020-01-01',
        source: 'tmdb',
        resolvedTmdbId: item.tmdbId
      };
    }
  });
  const repeated = Array.from({ length: 100 }, (_, index) => ({
    content_id: `item-${index}`,
    content_type: 'movie',
    _ids: { tmdb: 99, imdb: 'tt0000099' }
  }));

  const output = await enricher.enrich(repeated);

  assert.equal(fetches, 1);
  assert.equal(output.results.length, 100);
  assert.equal(output.summary.uniqueFetches, 1);
  assert.equal(cache.values.has('movie:tmdb:99'), true);
  assert.equal(cache.values.has('movie:imdb:tt0000099'), true);
});

test('marks deadline-aborted work as retryable and does not cache it', async () => {
  const cache = createMemoryCache();
  const controller = new AbortController();
  controller.abort();
  const enricher = createMetadataEnricher({
    cache,
    fetchMetadata: async () => {
      throw new Error('should not run');
    }
  });

  const output = await enricher.enrich([{
    content_id: 'item',
    content_type: 'series',
    _ids: { imdb: 'tt1234567' }
  }], { signal: controller.signal });

  assert.equal(output.results[0].retryable, true);
  assert.equal(cache.values.size, 0);
});

test('processes libraries larger than 20k across bounded server batches', async () => {
  const cache = createMemoryCache();
  const enricher = createMetadataEnricher({
    cache,
    fetchMetadata: async item => ({
      posterUrl: `poster-${item.tmdbId}`,
      releaseDate: null,
      source: 'tmdb',
      resolvedTmdbId: item.tmdbId
    })
  });
  const library = Array.from({ length: 20_400 }, (_, index) => ({
    content_id: `item-${index + 1}`,
    content_type: index % 2 ? 'movie' : 'series',
    _ids: { tmdb: index + 1 }
  }));

  let resultCount = 0;
  for (let offset = 0; offset < library.length; offset += MAX_METADATA_BATCH_ITEMS) {
    const output = await enricher.enrich(library.slice(offset, offset + MAX_METADATA_BATCH_ITEMS));
    resultCount += output.results.length;
  }

  assert.equal(resultCount, library.length);
  assert.equal(cache.values.size, library.length);
});

test('globally bounds concurrent upstream work', async () => {
  const scheduler = createRequestScheduler({ maxConcurrent: 2, minTimeMs: 0 });
  let active = 0;
  let peak = 0;

  await Promise.all(Array.from({ length: 8 }, (_, index) => scheduler.schedule(async () => {
    active++;
    peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 5));
    active--;
    return index;
  })));

  assert.equal(peak, 2);
});

test('rejects overload instead of allowing an unbounded upstream queue', async () => {
  const scheduler = createRequestScheduler({ maxConcurrent: 1, minTimeMs: 0, maxQueue: 1 });
  let releaseFirst;
  const first = scheduler.schedule(() => new Promise(resolve => {
    releaseFirst = resolve;
  }));
  const second = scheduler.schedule(async () => 'second');

  await assert.rejects(
    scheduler.schedule(async () => 'overflow'),
    error => error.name === 'OverloadError' && error.status === 503
  );

  releaseFirst('first');
  assert.deepEqual(await Promise.all([first, second]), ['first', 'second']);
});
