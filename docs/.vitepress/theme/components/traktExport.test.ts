import assert from 'node:assert/strict'
import test from 'node:test'
import { strToU8, zipSync } from 'fflate'
import {
  parseTraktExportEntries,
  parseTraktExportZip
} from './media-bridge/trakt-export.ts'
import { pullMediaBridge, type BridgeConnection } from './mediaBridgeProviders.ts'

function json(value: unknown) {
  return strToU8(JSON.stringify(value))
}

const movie = {
  title: 'Arrival',
  year: 2016,
  runtime: 116,
  ids: { trakt: 123, imdb: 'tt2543164', tmdb: 329865 }
}

const show = {
  title: 'Severance',
  year: 2022,
  ids: { trakt: 456, imdb: 'tt11280740', tmdb: 95396, tvdb: 371980 }
}

test('parses Trakt history chunks, playback, watchlist, and collection', () => {
  const result = parseTraktExportEntries({
    'backup/watched/history-1.json': json([
      { id: 1, watched_at: '2026-01-02T03:04:05Z', type: 'movie', movie },
      {
        id: 2,
        watched_at: '2026-02-03T04:05:06Z',
        type: 'episode',
        show,
        episode: {
          season: 1,
          number: 2,
          title: 'Half Loop',
          runtime: 53,
          ids: { trakt: 789, tvdb: 999 }
        }
      }
    ]),
    'backup/watched/watched-movies.json': json([
      { plays: 3, last_watched_at: '2025-01-01T00:00:00Z', movie }
    ]),
    'backup/playback.json': json([
      {
        type: 'movie',
        progress: 25,
        paused_at: '2026-03-01T00:00:00Z',
        movie
      }
    ]),
    'backup/lists/watchlist.json': json([
      { type: 'show', listed_at: '2025-04-01T00:00:00Z', show }
    ]),
    'backup/collection/collection-movies.json': json([
      { collected_at: '2025-05-01T00:00:00Z', movie }
    ])
  }, { accountId: 'archive-1' })

  assert.equal(result.bundle.history.length, 2)
  assert.equal(result.bundle.history[1].media.season, 1)
  assert.equal(result.bundle.history[1].media.episode, 2)
  assert.equal(result.bundle.history[1].media.videoId, 'trakt:789')
  assert.equal(result.bundle.progress.length, 1)
  assert.equal(result.bundle.progress[0].percentage, 25)
  assert.equal(result.bundle.progress[0].durationMs, 6_960_000)
  assert.equal(result.bundle.library.length, 2)
  assert.deepEqual(
    result.bundle.library.map(record => record.lists?.[0].kind).sort(),
    ['collection', 'watchlist']
  )
  assert.equal(result.bundle.library[0].source?.accountId, 'archive-1')
})

test('falls back to watched movie and show summaries when event history is absent', () => {
  const result = parseTraktExportEntries({
    'watched/watched-movies.json': json([
      { plays: 2, last_watched_at: '2026-01-01T00:00:00Z', movie }
    ]),
    'watched/watched-shows.json': json([
      {
        show,
        seasons: [{
          number: 1,
          episodes: [
            { number: 1, plays: 1, last_watched_at: '2026-02-01T00:00:00Z' },
            { number: 2, plays: 2, last_watched_at: '2026-02-02T00:00:00Z' }
          ]
        }]
      }
    ])
  })

  assert.equal(result.bundle.history.length, 3)
  assert.equal(result.bundle.history[0].playCount, 2)
  assert.deepEqual(
    result.bundle.history.slice(1).map(record => record.media.episode),
    [1, 2]
  )
})

test('reads an official-style Trakt ZIP locally', async () => {
  const zipped = zipSync({
    'trakt-export/watched/watched-movies.json': json([
      { last_watched_at: '2026-01-01T00:00:00Z', movie }
    ])
  })
  const file = new File([zipped], 'trakt-export.zip', { type: 'application/zip' })
  const result = await parseTraktExportZip(file)

  assert.equal(result.bundle.history.length, 1)
  assert.equal(result.bundle.history[0].media.ids.imdb, 'tt2543164')
})

test('rejects ZIPs without supported Trakt data', async () => {
  const zipped = zipSync({ 'readme.txt': strToU8('not a Trakt export') })
  const file = new File([zipped], 'other.zip', { type: 'application/zip' })
  await assert.rejects(
    parseTraktExportZip(file),
    /readable JSON files from a Trakt data export/
  )
})

test('uses an archive-backed Trakt connection without making API requests', async t => {
  const parsed = parseTraktExportEntries({
    'watched/watched-movies.json': json([
      { last_watched_at: '2026-01-01T00:00:00Z', movie }
    ]),
    'lists/watchlist.json': json([
      { listed_at: '2026-02-01T00:00:00Z', movie }
    ])
  })
  t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('archive sources must not use fetch')
  })
  const connection: BridgeConnection = {
    slot: 'source',
    service: 'trakt',
    accountId: 'zip-test',
    credentials: {
      service: 'trakt',
      clientId: '',
      tokens: { access_token: '' },
      refreshUrl: '',
      archiveBundle: parsed.bundle
    }
  }

  const pulled = await pullMediaBridge({
    connection,
    scopes: { history: true, progress: false, library: false }
  })

  assert.equal(pulled.bundle.history.length, 1)
  assert.equal(pulled.bundle.library.length, 0)
})
