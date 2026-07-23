import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createEmptyBundle,
  type CanonicalBundle,
  type MediaRef,
  type SyncScopes
} from './mediaBridgeCore.ts'
import {
  planMediaBridgePreview,
  type ProviderMappingIssue
} from './mediaBridgePlan.ts'

const ALL_SCOPES: SyncScopes = { history: true, progress: true, library: true }

function movie(imdb: string, title: string): MediaRef {
  return { kind: 'movie', ids: { imdb }, title, year: 2024 }
}

function episode(imdb: string, title: string, season: number, episodeNumber: number): MediaRef {
  return {
    kind: 'series',
    ids: { imdb },
    title,
    season,
    episode: episodeNumber,
    episodeTitle: `Episode ${episodeNumber}`
  }
}

test('dedupes and scopes source records into a deeply frozen transfer plan', () => {
  const source = createEmptyBundle()
  source.history.push(
    { media: movie('tt100', 'History'), watchedAt: 100 },
    { media: movie('tt100', 'History'), watchedAt: 200 }
  )
  source.progress.push({
    media: movie('tt200', 'Progress'),
    positionMs: 50,
    durationMs: 100,
    updatedAt: 300
  })
  source.library.push({
    media: movie('tt300', 'Library'),
    addedAt: 400,
    lists: [{ service: 'nuvio', kind: 'library' }]
  })

  const plan = planMediaBridgePreview({
    source,
    destination: createEmptyBundle(),
    scopes: { history: true, progress: true, library: false }
  })

  assert.deepEqual(plan.stats, {
    source: 2,
    add: 2,
    update: 0,
    alreadyPresent: 0,
    remapped: 0,
    unresolved: 0,
    ambiguous: 0,
    skipped: 0
  })
  assert.equal(plan.transfer.history.length, 1)
  assert.equal(plan.transfer.history[0].watchedAt, 200)
  assert.equal(plan.transfer.progress.length, 1)
  assert.equal(plan.transfer.library.length, 0)
  assert.ok(Object.isFrozen(plan))
  assert.ok(Object.isFrozen(plan.transfer))
  assert.ok(Object.isFrozen(plan.transfer.history))
  assert.ok(Object.isFrozen(plan.transfer.history[0].media.ids))
})

test('classifies add, update, and already-present records without downgrading progress', () => {
  const source = createEmptyBundle()
  const destination = createEmptyBundle()

  source.history.push(
    { media: movie('tt101', 'New'), watchedAt: 100 },
    { media: movie('tt102', 'Newer'), watchedAt: 300 },
    { media: movie('tt103', 'Existing'), watchedAt: 100 }
  )
  destination.history.push(
    { media: movie('tt102', 'Newer'), watchedAt: 200 },
    { media: movie('tt103', 'Existing'), watchedAt: 100 }
  )

  source.progress.push(
    { media: movie('tt201', 'Changed'), positionMs: 80_000, durationMs: 100_000, updatedAt: 400 },
    { media: movie('tt202', 'Destination newer'), positionMs: 20_000, durationMs: 100_000, updatedAt: 100 }
  )
  destination.progress.push(
    { media: movie('tt201', 'Changed'), positionMs: 50_000, durationMs: 100_000, updatedAt: 400 },
    { media: movie('tt202', 'Destination newer'), positionMs: 70_000, durationMs: 100_000, updatedAt: 500 }
  )

  const plan = planMediaBridgePreview({ source, destination, scopes: ALL_SCOPES })

  assert.equal(plan.stats.source, 5)
  assert.equal(plan.stats.add, 1)
  assert.equal(plan.stats.update, 2)
  assert.equal(plan.stats.alreadyPresent, 2)
  assert.equal(plan.transfer.history.length, 2)
  assert.equal(plan.transfer.progress.length, 1)
  assert.equal(plan.rows.find(row => row.title === 'Destination newer')?.outcome, 'already-present')
})

test('keeps collapsed history idempotent when only provider replay counts differ', () => {
  const source = createEmptyBundle()
  const destination = createEmptyBundle()
  source.history.push({ media: movie('tt104', 'Replay'), watchedAt: 100, playCount: 8 })
  destination.history.push({ media: movie('tt104', 'Replay'), watchedAt: 100, playCount: 1 })

  const plan = planMediaBridgePreview({ source, destination, destinationService: 'simkl', scopes: ALL_SCOPES })

  assert.equal(plan.stats.alreadyPresent, 1)
  assert.equal(plan.stats.update, 0)
  assert.equal(plan.transfer.history.length, 0)
})

test('preserves replay events for Trakt and matches them as a timestamped multiset', () => {
  const source = createEmptyBundle()
  const destination = createEmptyBundle()
  const replay = movie('tt105', 'Replay events')
  source.history.push(
    { media: replay, watchedAt: 100, eventId: 1001 },
    { media: replay, watchedAt: 200, eventId: 1002 },
    { media: replay, watchedAt: 200, eventId: 1003 }
  )
  destination.history.push(
    { media: replay, watchedAt: 100, eventId: 2001 },
    { media: replay, watchedAt: 200, eventId: 2002 }
  )

  const plan = planMediaBridgePreview({
    source,
    destination,
    destinationService: 'trakt',
    scopes: ALL_SCOPES
  })

  assert.equal(plan.stats.source, 3)
  assert.equal(plan.stats.add, 1)
  assert.equal(plan.stats.update, 0)
  assert.equal(plan.stats.alreadyPresent, 2)
  assert.equal(plan.transfer.history.length, 1)
  assert.equal(plan.transfer.history[0].eventId, 1003)
  assert.equal(plan.transfer.history[0].watchedAt, 200)
})

test('matches history, progress, and library through shared secondary IDs', () => {
  const source = createEmptyBundle()
  const destination = createEmptyBundle()

  source.history.push({
    media: {
      kind: 'series',
      ids: { tmdb: 1001 },
      title: 'Shared episode',
      season: 1,
      episode: 2
    },
    watchedAt: 100
  })
  destination.history.push({
    media: {
      kind: 'series',
      ids: { imdb: 'tt1001', tmdb: 1001 },
      title: 'Shared episode',
      season: 1,
      episode: 2
    },
    watchedAt: 100
  })

  source.progress.push({
    media: { kind: 'movie', ids: { trakt: 2002 }, title: 'Shared progress' },
    positionMs: 50_000,
    durationMs: 100_000,
    updatedAt: 200
  })
  destination.progress.push({
    media: { kind: 'movie', ids: { imdb: 'tt2002', trakt: 2002 }, title: 'Shared progress' },
    positionMs: 50_000,
    durationMs: 100_000,
    updatedAt: 200
  })

  source.library.push({
    media: { kind: 'movie', ids: { simkl: 3003 }, title: 'Shared library' },
    addedAt: 300,
    lists: [{ service: 'simkl', kind: 'watchlist', accountId: 'source' }]
  })
  destination.library.push({
    media: { kind: 'movie', ids: { imdb: 'tt3003', simkl: 3003 }, title: 'Shared library' },
    addedAt: 300,
    lists: [{ service: 'simkl', kind: 'watchlist', accountId: 'source' }]
  })

  const plan = planMediaBridgePreview({ source, destination, scopes: ALL_SCOPES })
  assert.equal(plan.stats.source, 3)
  assert.equal(plan.stats.add, 0)
  assert.equal(plan.stats.alreadyPresent, 3)
  assert.equal(plan.transfer.history.length, 0)
  assert.equal(plan.transfer.progress.length, 0)
  assert.equal(plan.transfer.library.length, 0)
})

test('only updates Continue Watching state across provider ID differences and preserves destination media', () => {
  const source = createEmptyBundle()
  const destination = createEmptyBundle()

  source.progress.push(
    {
      media: { kind: 'movie', ids: { tmdb: 8101 }, title: 'Same CW item', year: 2024 },
      positionMs: 50_000,
      durationMs: 100_000,
      updatedAt: 500
    },
    {
      media: { kind: 'movie', ids: { imdb: 'tt8102' }, title: 'Changed CW item', year: 2024 },
      positionMs: 80_000,
      durationMs: 100_000,
      updatedAt: 500
    }
  )
  destination.progress.push(
    {
      media: { kind: 'movie', ids: { trakt: 9101 }, title: 'Same CW item', year: 2024 },
      positionMs: 50_500,
      durationMs: 100_000,
      updatedAt: 400
    },
    {
      media: { kind: 'movie', ids: { tmdb: 9102 }, title: 'Changed CW item', year: 2024 },
      positionMs: 20_000,
      durationMs: 100_000,
      updatedAt: 400
    }
  )

  const plan = planMediaBridgePreview({ source, destination, scopes: ALL_SCOPES })

  assert.equal(plan.stats.add, 0)
  assert.equal(plan.stats.alreadyPresent, 1)
  assert.equal(plan.stats.update, 1)
  assert.equal(plan.transfer.progress.length, 1)
  assert.deepEqual(plan.transfer.progress[0].media.ids, { tmdb: 9102 })
  assert.equal(plan.transfer.progress[0].positionMs, 80_000)
  assert.deepEqual(source.progress[1].media.ids, { imdb: 'tt8102' })
  assert.deepEqual(destination.progress[1].media.ids, { tmdb: 9102 })
})

test('matches an existing Nuvio IMDb library identity when the source also has TMDB', () => {
  const source = createEmptyBundle()
  const destination = createEmptyBundle()
  source.library.push({
    media: {
      kind: 'movie',
      ids: { imdb: 'tt2015381', tmdb: 118340 },
      title: 'Guardians of the Galaxy'
    },
    addedAt: 100,
    lists: [{ service: 'trakt', kind: 'watchlist' }],
    source: { service: 'trakt' }
  })
  destination.library.push({
    media: {
      kind: 'movie',
      ids: { imdb: 'tt2015381', stremio: 'tt2015381' },
      title: 'Guardians of the Galaxy'
    },
    addedAt: 200,
    lists: [{ service: 'nuvio', kind: 'library' }],
    source: { service: 'nuvio', profileId: 1 }
  })

  const plan = planMediaBridgePreview({
    source,
    destination,
    scopes: { history: false, progress: false, library: true }
  })

  assert.equal(plan.stats.update, 0)
  assert.equal(plan.stats.alreadyPresent, 1)
  assert.equal(plan.transfer.library.length, 0)
})

test('migrates an existing Nuvio TMDB library identity to IMDb', () => {
  const source = createEmptyBundle()
  const destination = createEmptyBundle()
  source.library.push({
    media: {
      kind: 'movie',
      ids: { imdb: 'tt2015381', tmdb: 118340 },
      title: 'Guardians of the Galaxy'
    },
    addedAt: 100,
    lists: [{ service: 'trakt', kind: 'watchlist' }],
    source: { service: 'trakt' }
  })
  destination.library.push({
    media: {
      kind: 'movie',
      ids: { imdb: 'tt2015381', tmdb: 118340, stremio: 'tmdb:118340' },
      title: 'Guardians of the Galaxy'
    },
    addedAt: 200,
    lists: [{ service: 'nuvio', kind: 'library' }],
    source: { service: 'nuvio', profileId: 1 }
  })

  const plan = planMediaBridgePreview({
    source,
    destination,
    destinationService: 'nuvio',
    scopes: { history: false, progress: false, library: true }
  })

  assert.equal(plan.stats.update, 1)
  assert.equal(plan.transfer.library.length, 1)
  assert.equal(plan.transfer.library[0].media.ids.imdb, 'tt2015381')
})

test('plans a Nuvio library write to collapse mixed-ID duplicates', () => {
  const source = createEmptyBundle()
  const destination = createEmptyBundle()
  const media = {
    kind: 'movie' as const,
    ids: { imdb: 'tt2015381', tmdb: 118340 },
    title: 'Guardians of the Galaxy'
  }
  source.library.push({
    media,
    addedAt: 100,
    lists: [{ service: 'trakt', kind: 'watchlist' }]
  })
  destination.library.push(
    {
      media: { ...media, ids: { ...media.ids, stremio: 'tt2015381' } },
      addedAt: 200,
      lists: [{ service: 'nuvio', kind: 'library' }],
      source: { service: 'nuvio', profileId: 1 }
    },
    {
      media: { ...media, ids: { ...media.ids, stremio: 'tmdb:118340' } },
      addedAt: 150,
      lists: [{ service: 'nuvio', kind: 'library' }],
      source: { service: 'nuvio', profileId: 1 }
    }
  )

  const plan = planMediaBridgePreview({
    source,
    destination,
    destinationService: 'nuvio',
    scopes: { history: false, progress: false, library: true }
  })

  assert.equal(plan.stats.update, 1)
  assert.equal(plan.transfer.library.length, 1)
})

test('does not match equal numeric IDs from different namespaces', () => {
  const source = createEmptyBundle()
  const destination = createEmptyBundle()
  source.history.push({ media: { kind: 'movie', ids: { tmdb: 42 }, title: 'TMDB item' }, watchedAt: 100 })
  destination.history.push({ media: { kind: 'movie', ids: { trakt: 42 }, title: 'Trakt item' }, watchedAt: 100 })

  const plan = planMediaBridgePreview({ source, destination, scopes: ALL_SCOPES })
  assert.equal(plan.stats.add, 1)
  assert.equal(plan.stats.alreadyPresent, 0)
  assert.equal(plan.transfer.history.length, 1)
})

test('tolerates progress round-trip noise but never overwrites newer destination progress', () => {
  const source = createEmptyBundle()
  const destination = createEmptyBundle()
  const addProgressPair = (
    imdb: string,
    sourcePosition: number,
    sourceDuration: number,
    sourceUpdatedAt: number,
    destinationPosition: number,
    destinationDuration: number,
    destinationUpdatedAt: number
  ) => {
    const media = movie(imdb, imdb)
    source.progress.push({
      media,
      positionMs: sourcePosition,
      durationMs: sourceDuration,
      updatedAt: sourceUpdatedAt
    })
    destination.progress.push({
      media,
      positionMs: destinationPosition,
      durationMs: destinationDuration,
      updatedAt: destinationUpdatedAt
    })
  }

  addProgressPair('tt7101', 50_000, 100_000, 500, 50_800, 100_000, 400) // 0.8 percentage points
  addProgressPair('tt7102', 50_000, 200_000, 500, 54_500, 204_000, 400) // <=5 seconds, near duration
  addProgressPair('tt7103', 10_000, 100_000, 100, 90_000, 100_000, 900) // destination is newer
  addProgressPair('tt7104', 10_000, 100_000, 500, 30_000, 100_000, 500) // meaningful difference

  const plan = planMediaBridgePreview({ source, destination, scopes: ALL_SCOPES })
  assert.equal(plan.stats.source, 4)
  assert.equal(plan.stats.alreadyPresent, 3)
  assert.equal(plan.stats.update, 1)
  assert.equal(plan.transfer.progress.length, 1)
  assert.equal(plan.transfer.progress[0].media.ids.imdb, 'tt7104')
})

test('compares percent-only progress and preserves it in transfer records', () => {
  const source = createEmptyBundle()
  const destination = createEmptyBundle()

  source.progress.push(
    { media: movie('tt7201', 'Percent to absolute'), percentage: 50.4, updatedAt: 500 },
    { media: movie('tt7202', 'Changed percent'), percentage: 75, updatedAt: 500 },
    { media: movie('tt7203', 'Absolute to percent'), positionMs: 25_000, durationMs: 100_000, updatedAt: 500 }
  )
  destination.progress.push(
    { media: movie('tt7201', 'Percent to absolute'), positionMs: 50_000, durationMs: 100_000, updatedAt: 400 },
    { media: movie('tt7202', 'Changed percent'), percentage: 60, updatedAt: 400 },
    { media: movie('tt7203', 'Absolute to percent'), percentage: 25.5, updatedAt: 400 }
  )

  const plan = planMediaBridgePreview({ source, destination, scopes: ALL_SCOPES })
  assert.equal(plan.stats.source, 3)
  assert.equal(plan.stats.alreadyPresent, 2)
  assert.equal(plan.stats.update, 1)
  assert.equal(plan.transfer.progress.length, 1)
  assert.equal(plan.transfer.progress[0].media.ids.imdb, 'tt7202')
  assert.equal(plan.transfer.progress[0].percentage, 75)
  assert.equal(plan.transfer.progress[0].positionMs, undefined)
  assert.equal(plan.transfer.progress[0].durationMs, undefined)
})

test('updates existing library records when source list provenance is missing at destination', () => {
  const source = createEmptyBundle()
  const destination = createEmptyBundle()
  const media = movie('tt301', 'Lists')
  source.library.push({
    media,
    addedAt: 100,
    lists: [
      { service: 'trakt', kind: 'watchlist', accountId: 'alice' },
      { service: 'trakt', kind: 'collection', accountId: 'alice' }
    ]
  })
  destination.library.push({
    media,
    addedAt: 200,
    lists: [{ service: 'trakt', kind: 'watchlist', accountId: 'alice' }]
  })

  const plan = planMediaBridgePreview({ source, destination, scopes: ALL_SCOPES })
  assert.equal(plan.stats.update, 1)
  assert.equal(plan.transfer.library.length, 1)
})

test('treats the same native list kind on different accounts as already present', () => {
  const source = createEmptyBundle()
  const destination = createEmptyBundle()
  const media = movie('tt302', 'Portable membership')
  source.library.push({
    media,
    addedAt: 100,
    lists: [{
      service: 'trakt',
      kind: 'watchlist',
      accountId: 'source-account',
      listId: 'account-specific-source-id',
      name: 'My Watchlist'
    }]
  })
  destination.library.push({
    media,
    addedAt: 200,
    lists: [{
      service: 'simkl',
      kind: 'watchlist',
      accountId: 'destination-account',
      listId: 'account-specific-destination-id',
      name: 'Watchlist'
    }]
  })

  const plan = planMediaBridgePreview({ source, destination, scopes: ALL_SCOPES })
  assert.equal(plan.stats.alreadyPresent, 1)
  assert.equal(plan.stats.update, 0)
  assert.equal(plan.transfer.library.length, 0)
  assert.equal(plan.rows[0].outcome, 'already-present')
  assert.equal(source.library[0].lists[0].accountId, 'source-account')
  assert.equal(destination.library[0].lists[0].accountId, 'destination-account')
})

test('collapses generic cross-service membership but preserves Trakt list fidelity', () => {
  const source = createEmptyBundle()
  const media = movie('tt303', 'Portable Trakt memberships')
  source.library.push({
    media,
    addedAt: 100,
    lists: [
      { service: 'trakt', kind: 'watchlist', accountId: 'source' },
      { service: 'trakt', kind: 'collection', accountId: 'source' }
    ]
  })

  const simklDestination = createEmptyBundle()
  simklDestination.library.push({
    media,
    addedAt: 200,
    lists: [{ service: 'simkl', kind: 'watchlist', accountId: 'destination', name: 'Plan to Watch' }]
  })
  const crossService = planMediaBridgePreview({ source, destination: simklDestination, scopes: ALL_SCOPES })
  assert.equal(crossService.stats.alreadyPresent, 1)
  assert.equal(crossService.stats.update, 0)
  assert.equal(crossService.transfer.library.length, 0)

  const traktDestination = createEmptyBundle()
  traktDestination.library.push({
    media,
    addedAt: 200,
    lists: [{ service: 'trakt', kind: 'watchlist', accountId: 'destination' }]
  })
  const traktToTrakt = planMediaBridgePreview({ source, destination: traktDestination, scopes: ALL_SCOPES })
  assert.equal(traktToTrakt.stats.alreadyPresent, 0)
  assert.equal(traktToTrakt.stats.update, 1)
  assert.equal(traktToTrakt.transfer.library.length, 1)
})

test('skips explicit unresolved and ambiguous provider mappings', () => {
  const source = createEmptyBundle()
  const unresolvedMedia = episode('tt401', 'Unresolved', 1, 1)
  const ambiguousMedia = episode('tt402', 'Ambiguous', 1, 2)
  source.history.push(
    { media: unresolvedMedia, watchedAt: 100 },
    { media: ambiguousMedia, watchedAt: 200 }
  )

  const mappingIssues: ProviderMappingIssue[] = [
    {
      scope: 'history',
      sourceMedia: unresolvedMedia,
      mapping: {
        status: 'unresolved',
        confidence: 'none',
        target: null,
        candidates: [],
        reason: 'No destination metadata.'
      }
    },
    {
      scope: 'history',
      sourceMedia: ambiguousMedia,
      mapping: {
        status: 'ambiguous',
        confidence: 'high',
        target: null,
        candidates: [
          { season: 2, episode: 1, title: 'Candidate' },
          { season: 2, episode: 2, title: 'Candidate' }
        ],
        reason: 'Two destination episodes match.'
      }
    }
  ]

  const plan = planMediaBridgePreview({
    source,
    destination: createEmptyBundle(),
    scopes: ALL_SCOPES,
    mappingIssues
  })

  assert.equal(plan.stats.source, 2)
  assert.equal(plan.stats.unresolved, 1)
  assert.equal(plan.stats.ambiguous, 1)
  assert.equal(plan.stats.skipped, 2)
  assert.equal(plan.transfer.history.length, 0)
  assert.deepEqual(plan.rows.map(row => row.outcome), ['unresolved', 'ambiguous'])
  assert.ok(plan.rows.every(row => row.outcomeLabel.startsWith('Skipped')))
})

test('applies a deterministic episode remap before comparison and transfer', () => {
  const source = createEmptyBundle()
  const sourceMedia = episode('tt501', 'Remapped Show', 1, 2)
  source.history.push({ media: sourceMedia, watchedAt: 500 })

  const plan = planMediaBridgePreview({
    source,
    destination: createEmptyBundle(),
    scopes: ALL_SCOPES,
    mappingIssues: [{
      scope: 'history',
      sourceMedia,
      mapping: {
        status: 'mapped',
        confidence: 'high',
        target: { season: 1, episode: 3, title: 'Episode 2' },
        candidates: [{ season: 1, episode: 3, title: 'Episode 2' }],
        reason: 'Unique normalized title match.'
      }
    }]
  })

  assert.equal(plan.stats.add, 1)
  assert.equal(plan.stats.remapped, 1)
  assert.equal(plan.transfer.history[0].media.episode, 3)
  assert.equal(plan.rows[0].remapped, true)
  assert.equal(plan.rows[0].title, 'Remapped Show')
  assert.match(plan.rows[0].outcomeLabel, /remapped/)
  assert.notEqual(plan.rows[0].sourceKey, plan.rows[0].targetKey)
})

test('treats an existing destination episode as authoritative', () => {
  const source = createEmptyBundle()
  const destination = createEmptyBundle()
  const sourceMedia = {
    ...episode('tt0944947', 'Game of Thrones', 1, 5),
    videoId: 'source:episode-5'
  }
  const destinationMedia = {
    ...episode('tt0944947', 'Game of Thrones S1E5', 1, 5),
    episodeTitle: 'The Wolf and the Lion',
    videoId: 'destination:episode-5'
  }
  source.history.push({ media: sourceMedia, watchedAt: 500 })
  destination.history.push({ media: destinationMedia, watchedAt: 100 })

  const plan = planMediaBridgePreview({
    source,
    destination,
    scopes: ALL_SCOPES,
    mappingIssues: [{
      scope: 'history',
      sourceMedia,
      mapping: {
        status: 'mapped',
        confidence: 'high',
        target: {
          season: 1,
          episode: 5,
          title: 'The Wolf and the Lion',
          videoId: 'destination:episode-5'
        },
        candidates: [{
          season: 1,
          episode: 5,
          title: 'The Wolf and the Lion',
          videoId: 'destination:episode-5'
        }],
        reason: 'Season and episode numbering match.'
      }
    }]
  })

  assert.equal(plan.stats.update, 1)
  assert.equal(plan.stats.remapped, 0)
  assert.equal(plan.rows[0].remapped, false)
  assert.equal(plan.rows[0].outcomeLabel, 'Update destination')
  assert.equal(plan.rows[0].title, 'Game of Thrones')
  assert.equal(plan.rows[0].detail, 'Destination item already exists; only its sync state will be updated.')
  assert.deepEqual(plan.transfer.history[0].media, destinationMedia)
})

test('automatically treats records without a canonical key as unresolved', () => {
  const source: CanonicalBundle = createEmptyBundle()
  source.history.push({
    media: { kind: 'movie', ids: {}, title: 'No year and no IDs' },
    watchedAt: 100
  })

  const plan = planMediaBridgePreview({ source, destination: createEmptyBundle(), scopes: ALL_SCOPES })
  assert.equal(plan.stats.unresolved, 1)
  assert.equal(plan.stats.skipped, 1)
  assert.equal(plan.transfer.history.length, 0)
  assert.equal(plan.rows[0].outcome, 'unresolved')
})

test('returns stable human-readable rows regardless of source insertion order', () => {
  const one = createEmptyBundle()
  one.history.push(
    { media: movie('tt602', 'Zulu'), watchedAt: 100 },
    { media: movie('tt601', 'Alpha'), watchedAt: 200 }
  )
  const two = createEmptyBundle()
  two.history.push(...[...one.history].reverse())

  const firstPlan = planMediaBridgePreview({ source: one, destination: createEmptyBundle(), scopes: ALL_SCOPES })
  const secondPlan = planMediaBridgePreview({ source: two, destination: createEmptyBundle(), scopes: ALL_SCOPES })

  assert.deepEqual(firstPlan.rows.map(row => [row.id, row.title, row.outcomeLabel]), [
    ['history:movie:imdb:tt601', 'Alpha', 'Add to destination'],
    ['history:movie:imdb:tt602', 'Zulu', 'Add to destination']
  ])
  assert.deepEqual(firstPlan.rows, secondPlan.rows)
})
