import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ROUTE_PAIRS,
  SERVICE_DEFINITIONS,
  SERVICE_IDS,
  buildStremioVideoId,
  canonicalEpisodeKey,
  canonicalMediaKey,
  createEmptyBundle,
  dedupeBundle,
  episodeAliasKeys,
  generateRoutePairs,
  mediaAliasKeys,
  normalizeTitle,
  parseStremioVideoId,
  remapEpisode,
  summarizeRoute,
  validateEndpointPair,
  type CanonicalBundle,
  type ConnectedEndpoint,
  type EpisodeRef,
  type MediaRef,
  type ServiceId
} from './mediaBridgeCore.ts'

function endpoint(
  slot: 'source' | 'destination',
  service: ServiceId,
  accountId: string,
  profileId?: string | number
): ConnectedEndpoint {
  return { slot, service, accountId, profileId }
}

function movie(ids: MediaRef['ids'], title = 'Movie'): MediaRef {
  return { kind: 'movie', ids, title, year: 2024 }
}

test('defines four complete services and generates every directional pair', () => {
  assert.deepEqual(SERVICE_IDS, ['simkl', 'stremio', 'trakt', 'nuvio'])
  assert.equal(generateRoutePairs().length, 16)
  assert.equal(ROUTE_PAIRS.length, 16)
  assert.equal(new Set(ROUTE_PAIRS.map(route => route.id)).size, 16)

  for (const service of SERVICE_IDS) {
    assert.equal(SERVICE_DEFINITIONS[service].id, service)
    assert.deepEqual(SERVICE_DEFINITIONS[service].capabilities.read, {
      history: true,
      progress: true,
      library: true
    })
    assert.deepEqual(SERVICE_DEFINITIONS[service].capabilities.write, {
      history: true,
      progress: true,
      library: true
    })
  }

  assert.equal(ROUTE_PAIRS.filter(route => route.sameService).length, 4)
  assert.equal(summarizeRoute('simkl', 'nuvio').label, 'Simkl → Nuvio')
  assert.equal(summarizeRoute('simkl', 'nuvio').enabledScopeCount, 3)
})

test('blocks identical same-service endpoints but allows distinct accounts and services', () => {
  const sameTrakt = validateEndpointPair(
    endpoint('source', 'trakt', 'Alice'),
    endpoint('destination', 'trakt', ' alice ')
  )
  assert.equal(sameTrakt.valid, false)
  assert.equal(sameTrakt.code, 'same_endpoint')

  assert.equal(validateEndpointPair(
    endpoint('source', 'trakt', 'alice'),
    endpoint('destination', 'trakt', 'archive')
  ).valid, true)

  assert.equal(validateEndpointPair(
    endpoint('source', 'trakt', 'alice'),
    endpoint('destination', 'simkl', 'alice')
  ).valid, true)
})

test('allows Nuvio profiles on one account only when profile identities differ', () => {
  const differentProfiles = validateEndpointPair(
    endpoint('source', 'nuvio', 'user-1', 1),
    endpoint('destination', 'nuvio', 'user-1', 2)
  )
  assert.equal(differentProfiles.valid, true)

  const sameProfile = validateEndpointPair(
    endpoint('source', 'nuvio', 'user-1', 1),
    endpoint('destination', 'nuvio', 'USER-1', '1')
  )
  assert.equal(sameProfile.valid, false)
  assert.equal(sameProfile.code, 'same_endpoint')

  const missingProfile = validateEndpointPair(
    endpoint('source', 'nuvio', 'user-1'),
    endpoint('destination', 'nuvio', 'user-1', 2)
  )
  assert.equal(missingProfile.valid, false)
  assert.equal(missingProfile.code, 'profile_required')
})

test('builds canonical keys by stable ID priority and episode coordinates', () => {
  assert.equal(canonicalMediaKey(movie({
    imdb: ' TT0123456 ',
    tmdb: 999,
    trakt: 888,
    simkl: 777
  })), 'movie:imdb:tt0123456')

  assert.equal(canonicalMediaKey(movie({ tmdb: '00042', trakt: 9 })), 'movie:tmdb:42')
  assert.equal(canonicalMediaKey(movie({}, 'Dune')), 'movie:title:dune:2024')

  assert.equal(canonicalEpisodeKey({
    kind: 'series',
    ids: { imdb: 'tt123' },
    season: 0,
    episode: 2
  }), 'series:imdb:tt123:season:0:episode:2')

  assert.equal(canonicalEpisodeKey({
    kind: 'series',
    ids: { imdb: 'tt123' },
    videoId: 'tt123:4:7'
  }), 'series:imdb:tt123:season:4:episode:7')
})

test('exposes namespace-safe media and episode aliases for secondary-ID matching', () => {
  assert.deepEqual(mediaAliasKeys(movie({
    imdb: 'TT00123',
    tmdb: '0042',
    trakt: 42,
    simkl: 77,
    stremio: 'tt00123',
    external: { mal: 42, kitsu: 42 }
  })), [
    'movie:imdb:tt00123',
    'movie:tmdb:42',
    'movie:trakt:42',
    'movie:simkl:77',
    'movie:stremio:tt00123',
    'movie:external:kitsu:42',
    'movie:external:mal:42'
  ])

  assert.deepEqual(episodeAliasKeys({
    kind: 'series',
    ids: { imdb: 'tt900', tmdb: 900 },
    season: 1,
    episode: 2,
    absoluteEpisode: 14
  }), [
    'series:imdb:tt900:season:1:episode:2',
    'series:imdb:tt900:absolute:14',
    'series:tmdb:900:season:1:episode:2',
    'series:tmdb:900:absolute:14'
  ])

  const tmdbAliases = new Set(mediaAliasKeys(movie({ tmdb: 42 })))
  const traktAliases = mediaAliasKeys(movie({ trakt: 42 }))
  assert.ok(traktAliases.every(alias => !tmdbAliases.has(alias)))

  assert.equal(
    canonicalMediaKey(movie({ external: { mal: 42 } })),
    'movie:external:mal:42'
  )
  const malAliases = new Set(mediaAliasKeys(movie({ external: { mal: 42 } })))
  assert.ok(mediaAliasKeys(movie({ external: { kitsu: 42 } })).every(alias => !malAliases.has(alias)))
})

test('preserves external anime IDs without sharing nested references', () => {
  const bundle = createEmptyBundle()
  const media = movie({ external: { mal: 123, kitsu: 456 } }, 'Anime')
  bundle.history.push({ media, watchedAt: 100 })

  const deduped = dedupeBundle(bundle)
  assert.deepEqual(deduped.history[0].media.ids.external, { mal: 123, kitsu: 456 })
  assert.notEqual(deduped.history[0].media.ids.external, media.ids.external)
})

test('dedupes deterministically with latest records and preserved list provenance', () => {
  const bundle: CanonicalBundle = createEmptyBundle()
  const sharedMovie = movie({ imdb: 'tt100' }, 'Shared')

  bundle.history.push(
    { media: sharedMovie, watchedAt: 100, playCount: 1 },
    { media: sharedMovie, watchedAt: 200, playCount: 2 }
  )
  bundle.progress.push(
    { media: sharedMovie, positionMs: 10, durationMs: 100, updatedAt: 300 },
    { media: sharedMovie, positionMs: 80, durationMs: 100, updatedAt: 400 }
  )
  bundle.library.push(
    {
      media: sharedMovie,
      addedAt: 500,
      lists: [{ service: 'trakt', kind: 'watchlist', accountId: 'alice' }]
    },
    {
      media: sharedMovie,
      addedAt: 600,
      lists: [
        { service: 'trakt', kind: 'watchlist', accountId: 'alice' },
        { service: 'nuvio', kind: 'library', accountId: 'user', profileId: 2 }
      ]
    }
  )

  const deduped = dedupeBundle(bundle)
  assert.equal(deduped.history.length, 1)
  assert.equal(deduped.history[0].watchedAt, 200)
  assert.equal(deduped.history[0].playCount, 2)
  assert.equal(deduped.progress.length, 1)
  assert.equal(deduped.progress[0].positionMs, 80)
  assert.equal(deduped.library.length, 1)
  assert.equal(deduped.library[0].addedAt, 600)
  assert.deepEqual(deduped.library[0].lists.map(list => `${list.service}:${list.kind}`), [
    'nuvio:library',
    'trakt:watchlist'
  ])
  assert.equal(bundle.library[1].lists.length, 2)
})

test('dedupes percent-only progress without inventing absolute values', () => {
  const bundle = createEmptyBundle()
  const sharedMovie = movie({ imdb: 'tt101' }, 'Percent only')
  bundle.progress.push(
    { media: sharedMovie, positionMs: 20_000, durationMs: 100_000, updatedAt: 100 },
    { media: sharedMovie, percentage: 67.5, updatedAt: 200 }
  )

  const deduped = dedupeBundle(bundle)
  assert.equal(deduped.progress.length, 1)
  assert.equal(deduped.progress[0].percentage, 67.5)
  assert.equal(deduped.progress[0].positionMs, undefined)
  assert.equal(deduped.progress[0].durationMs, undefined)
  assert.notEqual(deduped.progress[0].media, sharedMovie)
})

test('normalizes titles and maps deterministic video, numbering, title, and absolute matches', () => {
  assert.equal(normalizeTitle("  L'Épisode & Return!  "), 'lepisode and return')

  const exact = remapEpisode(
    { season: 1, episode: 1, videoId: 'shared-video', title: 'Pilot' },
    [{ season: 1, episode: 1, videoId: 'shared-video', title: 'Pilot' }],
    [{ season: 9, episode: 4, videoId: 'shared-video', title: 'Pilot' }]
  )
  assert.equal(exact.status, 'mapped')
  assert.equal(exact.confidence, 'exact')
  assert.deepEqual(exact.target && [exact.target.season, exact.target.episode], [9, 4])

  const byTitle = remapEpisode(
    { season: 1, episode: 2, title: 'The Return' },
    [{ season: 1, episode: 2, title: 'The Return' }],
    [
      { season: 1, episode: 2, title: 'Another Story' },
      { season: 1, episode: 3, title: 'The Return!' }
    ]
  )
  assert.equal(byTitle.status, 'mapped')
  assert.equal(byTitle.confidence, 'high')
  assert.equal(byTitle.target?.episode, 3)

  const byAbsolute = remapEpisode(
    { season: 2, episode: 4, absoluteEpisode: 28 },
    [{ season: 2, episode: 4, absoluteEpisode: 28 }],
    [{ season: 1, episode: 28, absoluteEpisode: 28 }]
  )
  assert.equal(byAbsolute.status, 'mapped')
  assert.equal(byAbsolute.confidence, 'medium')
})

test('returns ambiguous or unresolved episode mappings instead of silently guessing', () => {
  const duplicateTitle = remapEpisode(
    { season: 1, episode: 3, title: 'Finale' },
    [{ season: 1, episode: 3, title: 'Finale' }],
    [
      { season: 2, episode: 1, title: 'Finale' },
      { season: 2, episode: 2, title: 'Finale' }
    ]
  )
  assert.equal(duplicateTitle.status, 'ambiguous')
  assert.equal(duplicateTitle.candidates.length, 2)

  const ordinalOnly = remapEpisode(
    { season: 1, episode: 2 },
    [
      { season: 1, episode: 1 },
      { season: 1, episode: 2 }
    ],
    [
      { season: 4, episode: 7 },
      { season: 4, episode: 8 }
    ]
  )
  assert.equal(ordinalOnly.status, 'ambiguous')
  assert.equal(ordinalOnly.confidence, 'low')
  assert.equal(ordinalOnly.candidates[0].episode, 8)

  const unresolved = remapEpisode(
    { season: 1, episode: 1 },
    [],
    [{ season: 8, episode: 8 }]
  )
  assert.equal(unresolved.status, 'unresolved')
})

test('parses and builds Stremio episode IDs from the right-hand coordinates', () => {
  assert.deepEqual(parseStremioVideoId('tt0944947:1:2'), {
    contentId: 'tt0944947',
    season: 1,
    episode: 2
  })
  assert.deepEqual(parseStremioVideoId('tmdb:1399:0:4'), {
    contentId: 'tmdb:1399',
    season: 0,
    episode: 4
  })
  assert.equal(parseStremioVideoId('tt0944947'), null)
  assert.equal(parseStremioVideoId('tt0944947:-1:2'), null)
  assert.equal(buildStremioVideoId('tmdb:1399', 3, 6), 'tmdb:1399:3:6')
  assert.throws(() => buildStremioVideoId('', 1, 1), /required/)
  assert.throws(() => buildStremioVideoId('tt1', 1, 0), /positive integer/)
})
