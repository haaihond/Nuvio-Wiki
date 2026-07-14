import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMetadataCache } from './metadata-cache.js';

test('persists metadata entries without rewriting a JSON object', () => {
  const directory = mkdtempSync(join(tmpdir(), 'nuvio-metadata-'));
  const file = join(directory, 'metadata.sqlite');

  try {
    const first = createMetadataCache({ file, now: () => 1_000 });
    first.setMany(new Map([['movie:tmdb:11', {
      posterUrl: 'https://image.example/11.jpg',
      releaseDate: '1977-05-25',
      source: 'tmdb',
      updatedAt: 1_000
    }]]));
    first.close();

    const second = createMetadataCache({ file, now: () => 2_000 });
    assert.deepEqual(second.getMany(['movie:tmdb:11']).get('movie:tmdb:11'), {
      posterUrl: 'https://image.example/11.jpg',
      releaseDate: '1977-05-25',
      source: 'tmdb',
      updatedAt: 1_000
    });
    assert.equal(second.stats().metadataEntries, 1);
    second.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('evicts oldest entries when the configured bound is reached', () => {
  let timestamp = 1_000;
  const cache = createMetadataCache({
    file: ':memory:',
    maxEntries: 2,
    now: () => timestamp
  });

  cache.setMany(new Map([
    ['movie:tmdb:1', { source: 'tmdb', updatedAt: timestamp }],
    ['movie:tmdb:2', { source: 'tmdb', updatedAt: timestamp + 1 }]
  ]));
  timestamp = 2_000;
  cache.setMany(new Map([
    ['movie:tmdb:3', { source: 'tmdb', updatedAt: timestamp }]
  ]));

  const values = cache.getMany(['movie:tmdb:1', 'movie:tmdb:2', 'movie:tmdb:3']);
  assert.equal(values.has('movie:tmdb:1'), false);
  assert.equal(values.has('movie:tmdb:2'), true);
  assert.equal(values.has('movie:tmdb:3'), true);
  assert.equal(cache.stats().metadataEntries, 2);
  cache.close();
});

test('expires failed lookups on the shorter negative-cache TTL', () => {
  let timestamp = 100;
  const cache = createMetadataCache({
    file: ':memory:',
    failureTtlMs: 10,
    now: () => timestamp
  });
  cache.setMany(new Map([['series:imdb:tt1', {
    source: 'failed',
    updatedAt: timestamp
  }]]));

  timestamp = 111;
  assert.equal(cache.getMany(['series:imdb:tt1']).size, 0);
  cache.prune();
  assert.equal(cache.stats().metadataEntries, 0);
  cache.close();
});
