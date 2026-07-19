import assert from 'node:assert/strict'
import test from 'node:test'
import { createEmptyBundle } from './mediaBridgeCore.ts'
import {
  pullMediaBridge,
  pullMediaBridgeForVerification,
  pushMediaBridge,
  signInJellyfin,
  type BridgeConnection
} from './mediaBridgeProviders.ts'

function traktConnection(slot: 'source' | 'destination' = 'destination'): BridgeConnection {
  return {
    slot,
    service: 'trakt',
    accountId: 'test-account',
    displayName: 'Test Trakt account',
    credentials: {
      service: 'trakt',
      clientId: 'test-client',
      tokens: {
        access_token: 'test-token',
        created_at: Math.floor(Date.now() / 1000),
        expires_in: 3_600
      },
      refreshUrl: '/api/trakt/refresh'
    }
  }
}

function simklConnection(): BridgeConnection {
  return {
    slot: 'destination',
    service: 'simkl',
    accountId: 'test-account',
    displayName: 'Test Simkl account',
    credentials: {
      service: 'simkl',
      clientId: 'test-client',
      accessToken: 'test-token'
    }
  }
}

function stremioConnection(): BridgeConnection {
  return {
    slot: 'destination',
    service: 'stremio',
    accountId: 'test-account',
    displayName: 'Test Stremio account',
    credentials: {
      service: 'stremio',
      authKey: 'test-auth-key'
    }
  }
}

function plexConnection(slot: 'source' | 'destination' = 'destination'): BridgeConnection {
  return {
    slot,
    service: 'plex',
    accountId: 'plex-user',
    serverId: 'plex-server',
    displayName: 'Plex User · Test Server',
    credentials: {
      service: 'plex',
      accountToken: 'account-token',
      clientIdentifier: 'test-client',
      server: {
        id: 'plex-server',
        name: 'Test Server',
        baseUrl: 'https://plex.test',
        accessToken: 'server-token',
        owned: true
      }
    }
  }
}

function jellyfinConnection(slot: 'source' | 'destination' = 'destination'): BridgeConnection {
  return {
    slot,
    service: 'jellyfin',
    accountId: 'jellyfin-user',
    serverId: 'jellyfin-server',
    displayName: 'Jellyfin User · Test Server',
    credentials: {
      service: 'jellyfin',
      baseUrl: 'https://jellyfin.test',
      accessToken: 'jellyfin-token',
      userId: 'jellyfin-user',
      serverId: 'jellyfin-server',
      serverName: 'Test Server',
      deviceId: 'test-device'
    }
  }
}

function movieProgress(percentage: number, imdb = 'tt2015381') {
  return {
    media: {
      kind: 'movie' as const,
      ids: { imdb },
      title: 'Almost Finished',
      year: 2024
    },
    percentage,
    updatedAt: Date.UTC(2026, 6, 17)
  }
}

function movieHistory(title: string, imdb: string, watchedAt: number) {
  return {
    media: {
      kind: 'movie' as const,
      ids: { imdb },
      title,
      year: 2024
    },
    watchedAt,
    playCount: 1
  }
}

test('uses Trakt stop below 80 percent to create a paused resume point', async t => {
  let requestUrl = ''
  let requestBody: any = null
  t.mock.method(globalThis, 'fetch', async (input, init) => {
    requestUrl = String(input)
    requestBody = JSON.parse(String(init?.body || '{}'))
    return new Response(JSON.stringify({ action: 'pause', progress: requestBody.progress }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    })
  })

  const bundle = createEmptyBundle()
  bundle.progress.push(movieProgress(79.9))
  const result = await pushMediaBridge({
    connection: traktConnection(),
    bundle,
    scopes: { history: false, progress: true, library: false }
  })

  assert.equal(new URL(requestUrl).pathname, '/scrobble/stop')
  assert.equal(requestBody.progress, 79)
  assert.equal(result.written.progress, 1)
  assert.deepEqual(result.issues, [])
})

test('reports Trakt resume points at 80 percent or higher once as a note', async t => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('Trakt should not be called for completed progress.')
  })

  const bundle = createEmptyBundle()
  bundle.progress.push(
    movieProgress(99),
    movieProgress(80, 'tt2015382')
  )
  const result = await pushMediaBridge({
    connection: traktConnection(),
    bundle,
    scopes: { history: false, progress: true, library: false }
  })

  assert.equal(fetchMock.mock.callCount(), 0)
  assert.equal(result.written.progress, 0)
  assert.equal(result.issues.length, 1)
  assert.equal(result.issues[0].status, 'note')
  assert.equal(result.issues[0].media, undefined)
  assert.equal(
    result.issues[0].reason,
    'Trakt cannot store resume points at 80% or higher; it treats them as watched. Transfer watch history to preserve the completed state.'
  )
  assert.equal(result.skipped?.progress, 2)
})

test('keeps syncing after Trakt rejects an individual resume point', async t => {
  let now = Date.UTC(2026, 6, 17)
  t.mock.method(Date, 'now', () => (now += 2_000))
  let requestCount = 0
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => {
    requestCount++
    return requestCount === 1
      ? new Response(JSON.stringify({ message: 'Invalid progress record.' }), {
          status: 422,
          statusText: 'Unprocessable Content',
          headers: { 'Content-Type': 'application/json' }
        })
      : new Response(JSON.stringify({ action: 'pause', progress: 40 }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' }
        })
  })

  const bundle = createEmptyBundle()
  bundle.progress.push(
    movieProgress(50),
    movieProgress(40, 'tt2015382')
  )
  const result = await pushMediaBridge({
    connection: traktConnection(),
    bundle,
    scopes: { history: false, progress: true, library: false }
  })

  assert.equal(fetchMock.mock.callCount(), 2)
  assert.equal(result.written.progress, 1)
  assert.equal(result.issues.length, 1)
  assert.equal(result.issues[0].scope, 'progress')
  assert.match(result.issues[0].reason, /Invalid progress record/)
})

test('confirms Trakt history writes from the structured sync response', async t => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async (_input, init) => {
    const body = JSON.parse(String(init?.body || '{}'))
    assert.equal(body.movies.length, 2)
    return Response.json({
      added: { movies: 1, episodes: 0 },
      updated: { movies: 0, episodes: 0 },
      not_found: {
        movies: [body.movies[1]],
        shows: [],
        seasons: [],
        episodes: []
      }
    })
  })
  const bundle = createEmptyBundle()
  bundle.history.push(
    movieHistory('Found', 'tt2015381', Date.UTC(2026, 6, 17)),
    movieHistory('Missing', 'tt0000000', Date.UTC(2026, 6, 16))
  )

  const result = await pushMediaBridge({
    connection: traktConnection(),
    bundle,
    scopes: { history: true, progress: false, library: false }
  })

  assert.equal(fetchMock.mock.callCount(), 1)
  assert.equal(result.written.history, 1)
  assert.equal(result.skipped?.history, 1)
  assert.deepEqual(result.confirmedScopes, ['history'])
  assert.equal(result.issues.length, 1)
  assert.match(result.issues[0].reason, /could not match 1 submitted history record/)
})

test('confirms nested Trakt episode history counts from the sync response', async t => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async (_input, init) => {
    const body = JSON.parse(String(init?.body || '{}'))
    assert.equal(body.shows.length, 1)
    assert.equal(body.shows[0].seasons[0].episodes.length, 2)
    return Response.json({
      added: { movies: 0, episodes: 1 },
      updated: { movies: 0, episodes: 1 },
      not_found: { movies: [], shows: [], seasons: [], episodes: [] }
    })
  })
  const bundle = createEmptyBundle()
  for (const episode of [1, 2]) {
    bundle.history.push({
      media: {
        kind: 'series',
        ids: { imdb: 'tt0944947' },
        title: 'Game of Thrones',
        season: 1,
        episode
      },
      watchedAt: Date.UTC(2026, 6, 17, episode),
      playCount: 1
    })
  }

  const result = await pushMediaBridge({
    connection: traktConnection(),
    bundle,
    scopes: { history: true, progress: false, library: false }
  })

  assert.equal(fetchMock.mock.callCount(), 1)
  assert.equal(result.written.history, 2)
  assert.equal(result.skipped?.history, undefined)
  assert.deepEqual(result.confirmedScopes, ['history'])
  assert.deepEqual(result.issues, [])
})

test('falls back to destination verification for an incomplete Trakt history response', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ success: true }))
  const bundle = createEmptyBundle()
  bundle.history.push(movieHistory('Fallback', 'tt2015381', Date.UTC(2026, 6, 17)))

  const result = await pushMediaBridge({
    connection: traktConnection(),
    bundle,
    scopes: { history: true, progress: false, library: false }
  })

  assert.equal(result.written.history, 1)
  assert.deepEqual(result.confirmedScopes, [])
  assert.deepEqual(result.issues, [])
})

test('only reports omitted Trakt replay timestamps when Trakt is the source', async t => {
  t.mock.method(globalThis, 'fetch', async input => {
    const path = new URL(String(input)).pathname
    if (path === '/sync/watched/movies') {
      return Response.json([{
        plays: 3,
        last_watched_at: '2026-07-17T12:00:00Z',
        movie: {
          title: 'Replay',
          year: 2024,
          ids: { trakt: 1, imdb: 'tt2015381' }
        }
      }])
    }
    if (path === '/sync/watched/shows') return Response.json([])
    throw new Error(`Unexpected request: ${path}`)
  })
  const scopes = { history: true, progress: false, library: false }

  const source = await pullMediaBridge({ connection: traktConnection('source'), scopes })
  const destination = await pullMediaBridge({ connection: traktConnection('destination'), scopes })

  assert.equal(source.issues.length, 1)
  assert.match(source.issues[0].reason, /2 earlier play events cannot be transferred/)
  assert.deepEqual(destination.issues, [])
})

test('signs in to a Jellyfin server without keeping the password in the connection result', async t => {
  let authorization = ''
  let body: any = null
  t.mock.method(globalThis, 'fetch', async (input, init) => {
    const url = new URL(String(input))
    assert.equal(url.pathname, '/jellyfin/Users/AuthenticateByName')
    authorization = new Headers(init?.headers).get('Authorization') || ''
    body = JSON.parse(String(init?.body || '{}'))
    return Response.json({
      AccessToken: 'returned-token',
      ServerId: 'server-id',
      User: {
        Id: 'user-id',
        Name: 'Jellyfin User',
        ServerName: 'Home Server'
      }
    })
  })

  const login = await signInJellyfin(
    'https://jellyfin.test/jellyfin/web/',
    'Jellyfin User',
    'secret'
  )

  assert.match(authorization, /^MediaBrowser /)
  assert.deepEqual(body, { Username: 'Jellyfin User', Pw: 'secret' })
  assert.equal(login.baseUrl, 'https://jellyfin.test/jellyfin')
  assert.equal(login.accessToken, 'returned-token')
  assert.equal(login.userId, 'user-id')
  assert.equal(login.serverId, 'server-id')
  assert.equal('password' in login, false)
})

test('reads watched state, resume points, and server-library membership from Jellyfin', async t => {
  t.mock.method(globalThis, 'fetch', async (input, init) => {
    const url = new URL(String(input))
    assert.equal(url.pathname, '/Items')
    assert.equal(url.searchParams.get('IncludeItemTypes'), 'Movie,Series,Episode')
    const headers = new Headers(init?.headers)
    assert.equal(headers.get('X-Emby-Token'), 'jellyfin-token')
    return Response.json({
      TotalRecordCount: 3,
      Items: [{
        Id: 'movie-101',
        Type: 'Movie',
        Name: 'Guardians of the Galaxy',
        ProductionYear: 2014,
        DateCreated: '2023-11-14T22:13:20Z',
        RunTimeTicks: 72_000_000_000,
        ProviderIds: { Imdb: 'tt2015381', Tmdb: '118340' },
        UserData: {
          Played: true,
          PlayCount: 2,
          LastPlayedDate: '2024-07-03T09:46:40Z',
          PlaybackPositionTicks: 12_000_000_000
        }
      }, {
        Id: 'show-200',
        Type: 'Series',
        Name: 'Game of Thrones',
        ProductionYear: 2011,
        DateCreated: '2023-11-14T22:13:20Z',
        ProviderIds: { Imdb: 'tt0944947', Tvdb: '121361' },
        UserData: {}
      }, {
        Id: 'episode-203',
        Type: 'Episode',
        SeriesId: 'show-200',
        SeriesName: 'Game of Thrones',
        ParentIndexNumber: 2,
        IndexNumber: 3,
        Name: 'What Is Dead May Never Die',
        RunTimeTicks: 36_000_000_000,
        UserData: {
          Played: true,
          PlayCount: 1,
          LastPlayedDate: '2024-07-04T09:46:40Z'
        }
      }]
    })
  })

  const result = await pullMediaBridge({
    connection: jellyfinConnection('source'),
    scopes: { history: true, progress: true, library: true }
  })

  assert.equal(result.bundle.history.length, 2)
  const movie = result.bundle.history.find(record => record.media.kind === 'movie')
  assert.equal(movie?.media.ids.imdb, 'tt2015381')
  assert.equal(result.bundle.progress.length, 1)
  assert.equal(result.bundle.progress[0].positionMs, 1_200_000)
  assert.equal(result.bundle.library.length, 2)
  assert.equal(result.bundle.library[0].lists[0].name, 'Test Server')
  const episode = result.bundle.history.find(record => record.media.episode === 3)
  assert.equal(episode?.media.ids.imdb, 'tt0944947')
  assert.equal(episode?.media.videoId, 'jellyfin:episode-203')
})

test('writes Jellyfin watched state and resume points only for media already on the server', async t => {
  const writes: Array<{ path: string; method: string; body: any }> = []
  t.mock.method(globalThis, 'fetch', async (input, init) => {
    const url = new URL(String(input))
    if (url.pathname === '/Items') {
      return Response.json({
        TotalRecordCount: 1,
        Items: [{
          Id: 'movie-101',
          Type: 'Movie',
          Name: 'Almost Finished',
          ProductionYear: 2024,
          RunTimeTicks: 72_000_000_000,
          ProviderIds: { Imdb: 'tt2015381' },
          UserData: { Played: false, PlayCount: 0, IsFavorite: true }
        }]
      })
    }
    if (url.pathname === '/UserPlayedItems/movie-101' || url.pathname === '/UserItems/movie-101/UserData') {
      writes.push({
        path: url.pathname,
        method: String(init?.method || 'GET'),
        body: init?.body ? JSON.parse(String(init.body)) : null
      })
      return Response.json({ ItemId: 'movie-101' })
    }
    throw new Error(`Unexpected Jellyfin request: ${url}`)
  })

  const bundle = createEmptyBundle()
  bundle.history.push(movieHistory('Almost Finished', 'tt2015381', Date.UTC(2026, 6, 17)))
  bundle.progress.push(movieProgress(50))
  bundle.library.push({
    media: { kind: 'movie', ids: { imdb: 'tt9999999' }, title: 'Missing' },
    addedAt: Date.UTC(2026, 6, 17),
    lists: [{ service: 'trakt', kind: 'watchlist' }]
  })

  const result = await pushMediaBridge({
    connection: jellyfinConnection(),
    bundle,
    scopes: { history: true, progress: true, library: true }
  })

  assert.deepEqual(writes.map(write => [write.path, write.method]), [
    ['/UserPlayedItems/movie-101', 'POST'],
    ['/UserItems/movie-101/UserData', 'POST']
  ])
  assert.equal(writes[1].body.PlaybackPositionTicks, 36_000_000_000)
  assert.equal(writes[1].body.IsFavorite, true)
  assert.deepEqual(result.written, { history: 1, progress: 1, library: 0 })
  assert.equal(result.skipped?.library, 1)
  assert.deepEqual(result.confirmedScopes, ['history', 'progress'])
  assert.match(result.issues[0].reason, /read-only/)
})

test('maps series episodes to Jellyfin item IDs before marking them watched', async t => {
  let playedItemId = ''
  t.mock.method(globalThis, 'fetch', async (input, init) => {
    const url = new URL(String(input))
    if (url.pathname === '/Items') {
      return Response.json({
        TotalRecordCount: 2,
        Items: [{
          Id: 'show-200',
          Type: 'Series',
          Name: 'Game of Thrones',
          ProductionYear: 2011,
          ProviderIds: { Imdb: 'tt0944947' },
          UserData: {}
        }, {
          Id: 'episode-203',
          Type: 'Episode',
          SeriesId: 'show-200',
          SeriesName: 'Game of Thrones',
          ParentIndexNumber: 2,
          IndexNumber: 3,
          Name: 'What Is Dead May Never Die',
          UserData: {}
        }]
      })
    }
    if (url.pathname === '/UserPlayedItems/episode-203') {
      assert.equal(init?.method, 'POST')
      playedItemId = url.pathname.split('/').at(-1) || ''
      return Response.json({ ItemId: 'episode-203', Played: true })
    }
    throw new Error(`Unexpected Jellyfin request: ${url}`)
  })

  const bundle = createEmptyBundle()
  bundle.history.push({
    media: {
      kind: 'series',
      ids: { imdb: 'tt0944947' },
      title: 'Game of Thrones',
      year: 2011,
      season: 2,
      episode: 3,
      episodeTitle: 'What Is Dead May Never Die'
    },
    watchedAt: Date.UTC(2026, 6, 17),
    playCount: 1
  })

  const result = await pushMediaBridge({
    connection: jellyfinConnection(),
    bundle,
    scopes: { history: true, progress: false, library: false }
  })

  assert.equal(playedItemId, 'episode-203')
  assert.equal(result.written.history, 1)
  assert.deepEqual(result.issues, [])
})

test('reads watched state, resume points, and server-library membership from Plex', async t => {
  t.mock.method(globalThis, 'fetch', async input => {
    const url = new URL(String(input))
    if (url.pathname === '/library/sections') {
      return Response.json({
        MediaContainer: {
          Directory: [{ key: '1', title: 'Movies', type: 'movie' }]
        }
      })
    }
    if (url.pathname === '/library/sections/1/all') {
      return Response.json({
        MediaContainer: {
          totalSize: 1,
          Metadata: [{
            ratingKey: '101',
            key: '/library/metadata/101',
            guid: 'plex://movie/movie-101',
            Guid: [{ id: 'imdb://tt2015381' }, { id: 'tmdb://118340' }],
            type: 'movie',
            title: 'Guardians of the Galaxy',
            year: 2014,
            addedAt: 1_700_000_000,
            updatedAt: 1_710_000_000,
            lastViewedAt: 1_720_000_000,
            viewCount: 2,
            viewOffset: 1_200_000,
            duration: 7_200_000
          }]
        }
      })
    }
    throw new Error(`Unexpected Plex request: ${url}`)
  })

  const result = await pullMediaBridge({
    connection: plexConnection('source'),
    scopes: { history: true, progress: true, library: true }
  })

  assert.equal(result.bundle.history.length, 1)
  assert.equal(result.bundle.history[0].playCount, 2)
  assert.equal(result.bundle.history[0].media.ids.imdb, 'tt2015381')
  assert.equal(result.bundle.progress.length, 1)
  assert.equal(result.bundle.progress[0].positionMs, 1_200_000)
  assert.equal(result.bundle.library.length, 1)
  assert.equal(result.bundle.library[0].lists[0].name, 'Movies')
})

test('writes Plex watched state and timeline only for media already on the server', async t => {
  const writes: Array<{ path: string; method: string; params: URLSearchParams }> = []
  t.mock.method(globalThis, 'fetch', async (input, init) => {
    const url = new URL(String(input))
    if (url.pathname === '/library/sections') {
      return Response.json({
        MediaContainer: {
          Directory: [{ key: '1', title: 'Movies', type: 'movie' }]
        }
      })
    }
    if (url.pathname === '/library/sections/1/all') {
      return Response.json({
        MediaContainer: {
          totalSize: 1,
          Metadata: [{
            ratingKey: '101',
            key: '/library/metadata/101',
            guid: 'plex://movie/movie-101',
            Guid: [{ id: 'imdb://tt2015381' }],
            type: 'movie',
            title: 'Almost Finished',
            year: 2024,
            duration: 7_200_000
          }]
        }
      })
    }
    if (url.pathname === '/:/scrobble' || url.pathname === '/:/timeline') {
      writes.push({
        path: url.pathname,
        method: String(init?.method || 'GET'),
        params: url.searchParams
      })
      return Response.json({ MediaContainer: { size: 0 } })
    }
    throw new Error(`Unexpected Plex request: ${url}`)
  })

  const bundle = createEmptyBundle()
  bundle.history.push(movieHistory('Almost Finished', 'tt2015381', Date.UTC(2026, 6, 17)))
  bundle.progress.push(movieProgress(50))
  bundle.library.push({
    media: { kind: 'movie', ids: { imdb: 'tt9999999' }, title: 'Missing' },
    addedAt: Date.UTC(2026, 6, 17),
    lists: [{ service: 'trakt', kind: 'watchlist' }]
  })

  const result = await pushMediaBridge({
    connection: plexConnection(),
    bundle,
    scopes: { history: true, progress: true, library: true }
  })

  assert.deepEqual(writes.map(write => [write.path, write.method]), [
    ['/:/scrobble', 'PUT'],
    ['/:/timeline', 'POST']
  ])
  assert.equal(writes[0].params.get('key'), '101')
  assert.equal(writes[1].params.get('ratingKey'), '101')
  assert.equal(writes[1].params.get('time'), '3600000')
  assert.deepEqual(result.written, { history: 1, progress: 1, library: 0 })
  assert.equal(result.skipped?.library, 1)
  assert.deepEqual(result.confirmedScopes, ['history', 'progress'])
  assert.match(result.issues[0].reason, /read-only/)
})

test('maps series episodes to Plex rating keys before marking them watched', async t => {
  let scrobbledKey = ''
  t.mock.method(globalThis, 'fetch', async (input, init) => {
    const url = new URL(String(input))
    if (url.pathname === '/library/sections') {
      return Response.json({
        MediaContainer: { Directory: [{ key: '2', title: 'TV', type: 'show' }] }
      })
    }
    if (url.pathname === '/library/sections/2/all' && url.searchParams.get('type') === '2') {
      return Response.json({
        MediaContainer: {
          totalSize: 1,
          Metadata: [{
            ratingKey: '200',
            key: '/library/metadata/200',
            guid: 'plex://show/show-200',
            Guid: [{ id: 'imdb://tt0944947' }],
            title: 'Game of Thrones',
            year: 2011
          }]
        }
      })
    }
    if (url.pathname === '/library/sections/2/all' && url.searchParams.get('type') === '4') {
      return Response.json({
        MediaContainer: {
          totalSize: 1,
          Metadata: [{
            ratingKey: '203',
            key: '/library/metadata/203',
            grandparentRatingKey: '200',
            grandparentTitle: 'Game of Thrones',
            parentIndex: 2,
            index: 3,
            title: 'What Is Dead May Never Die'
          }]
        }
      })
    }
    if (url.pathname === '/:/scrobble') {
      assert.equal(init?.method, 'PUT')
      scrobbledKey = String(url.searchParams.get('key'))
      return Response.json({ MediaContainer: { size: 0 } })
    }
    throw new Error(`Unexpected Plex request: ${url}`)
  })

  const bundle = createEmptyBundle()
  bundle.history.push({
    media: {
      kind: 'series',
      ids: { imdb: 'tt0944947' },
      title: 'Game of Thrones',
      year: 2011,
      season: 2,
      episode: 3,
      episodeTitle: 'What Is Dead May Never Die'
    },
    watchedAt: Date.UTC(2026, 6, 17),
    playCount: 1
  })

  const result = await pushMediaBridge({
    connection: plexConnection(),
    bundle,
    scopes: { history: true, progress: false, library: false }
  })

  assert.equal(scrobbledKey, '203')
  assert.equal(result.written.history, 1)
  assert.deepEqual(result.issues, [])
})

test('imports Simkl resume points sequentially through pause within one 30-second budget', async t => {
  let timeoutMs = 0
  const timeoutController = new AbortController()
  const timeoutMock = t.mock.method(AbortSignal, 'timeout', (ms: number) => {
    timeoutMs = ms
    return timeoutController.signal
  })
  const requests: Array<{ url: string; body: any }> = []
  let activeRequests = 0
  let maximumActiveRequests = 0
  const fetchMock = t.mock.method(globalThis, 'fetch', async (input, init) => {
    activeRequests++
    maximumActiveRequests = Math.max(maximumActiveRequests, activeRequests)
    await Promise.resolve()
    requests.push({
      url: String(input),
      body: JSON.parse(String(init?.body || '{}'))
    })
    activeRequests--
    return new Response(JSON.stringify({ action: 'pause' }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    })
  })
  const logs: string[] = []
  const bundle = createEmptyBundle()
  bundle.progress.push(
    movieProgress(50),
    {
      media: {
        kind: 'series',
        ids: { imdb: 'tt0944947' },
        title: 'Game of Thrones',
        videoId: 'tt0944947:2:3'
      },
      percentage: 40,
      updatedAt: Date.UTC(2026, 6, 17)
    }
  )

  const result = await pushMediaBridge({
    connection: simklConnection(),
    bundle,
    scopes: { history: false, progress: true, library: false },
    log: message => logs.push(message)
  })

  assert.equal(timeoutMock.mock.callCount(), 1)
  assert.equal(timeoutMs, 30_000)
  assert.equal(fetchMock.mock.callCount(), 2)
  assert.equal(maximumActiveRequests, 1)
  assert.deepEqual(requests.map(request => new URL(request.url).pathname), [
    '/scrobble/pause',
    '/scrobble/pause'
  ])
  assert.deepEqual(requests[0].body, {
    progress: 50,
    movie: {
      title: 'Almost Finished',
      year: 2024,
      ids: { imdb: 'tt2015381' }
    }
  })
  assert.deepEqual(requests[1].body, {
    progress: 40,
    show: {
      title: 'Game of Thrones',
      ids: { imdb: 'tt0944947' }
    },
    episode: { season: 2, number: 3 }
  })
  assert.equal(result.written.progress, 2)
  assert.equal(result.skipped?.progress, undefined)
  assert.deepEqual(result.issues, [])
  assert.deepEqual(logs, ['Updated 2 Simkl resume points.'])
})

test('stops the Simkl progress phase and skips the remainder when its budget expires', async t => {
  const timeoutController = new AbortController()
  t.mock.method(AbortSignal, 'timeout', () => timeoutController.signal)
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => {
    timeoutController.abort(new DOMException('The operation timed out.', 'TimeoutError'))
    throw timeoutController.signal.reason
  })
  const bundle = createEmptyBundle()
  bundle.progress.push(
    movieProgress(50),
    movieProgress(40, 'tt2015382')
  )

  const result = await pushMediaBridge({
    connection: simklConnection(),
    bundle,
    scopes: { history: false, progress: true, library: false }
  })

  assert.equal(fetchMock.mock.callCount(), 1)
  assert.equal(result.written.progress, 0)
  assert.equal(result.skipped?.progress, 2)
  assert.equal(result.issues.length, 1)
  assert.equal(result.issues[0].status, 'note')
  assert.match(result.issues[0].reason, /stopped after 30 seconds; 2 resume points were skipped/)
})

test('confirms successful Stremio batches and explains superseded series resume points', async t => {
  const requests: Array<{ path: string; body: any }> = []
  t.mock.method(globalThis, 'fetch', async (input, init) => {
    const url = new URL(String(input))
    const body = init?.body ? JSON.parse(String(init.body)) : null
    requests.push({ path: url.pathname, body })

    if (url.pathname === '/api/datastoreGet') {
      return Response.json({ result: [] })
    }
    if (url.pathname === '/api/datastorePut') {
      return Response.json({ result: { success: true } })
    }
    if (url.pathname === '/meta/series/tt0944947.json') {
      return Response.json({
        meta: {
          id: 'tt0944947',
          name: 'Game of Thrones',
          videos: [
            { id: 'tt0944947:2:3', season: 2, episode: 3, title: 'What Is Dead May Never Die' },
            { id: 'tt0944947:2:4', season: 2, episode: 4, title: 'Garden of Bones' }
          ]
        }
      })
    }
    throw new Error(`Unexpected request: ${url}`)
  })

  const bundle = createEmptyBundle()
  bundle.progress.push(
    {
      media: {
        kind: 'series',
        ids: { imdb: 'tt0944947' },
        title: 'Game of Thrones',
        season: 2,
        episode: 3
      },
      positionMs: 1_200_000,
      durationMs: 3_600_000,
      updatedAt: Date.UTC(2026, 6, 16)
    },
    {
      media: {
        kind: 'series',
        ids: { imdb: 'tt0944947' },
        title: 'Game of Thrones',
        season: 2,
        episode: 4
      },
      positionMs: 1_800_000,
      durationMs: 3_600_000,
      updatedAt: Date.UTC(2026, 6, 17)
    }
  )

  const result = await pushMediaBridge({
    connection: stremioConnection(),
    bundle,
    scopes: { history: false, progress: true, library: false }
  })

  const put = requests.find(request => request.path === '/api/datastorePut')
  assert.equal(put?.body.changes.length, 1)
  assert.equal(put?.body.changes[0].state.video_id, 'tt0944947:2:4')
  assert.equal(result.written.progress, 1)
  assert.equal(result.skipped?.progress, 1)
  assert.deepEqual(result.confirmedScopes, ['progress'])
  assert.equal(result.issues.length, 1)
  assert.match(result.issues[0].reason, /one continue-watching position per series/)
  assert.match(result.issues[0].reason, /skipped in favor of the newest/)
})

test('treats a successful Stremio saved-title batch as confirmed', async t => {
  const savedIds = ['tt3100011', 'tt3100012', 'tt3100013', 'tt3100014']
  t.mock.method(globalThis, 'fetch', async (input, init) => {
    const url = new URL(String(input))
    if (url.pathname === '/api/datastoreGet') return Response.json({ result: [] })
    if (url.pathname === '/api/datastorePut') return Response.json({ result: { success: true } })
    if (url.pathname.startsWith('/meta/movie/')) {
      const id = url.pathname.match(/(tt\d+)\.json$/)?.[1]
      return Response.json({ meta: { id, name: id } })
    }
    throw new Error(`Unexpected request: ${url}`)
  })

  const bundle = createEmptyBundle()
  for (const [index, imdb] of savedIds.entries()) {
    bundle.library.push({
      media: { kind: 'movie', ids: { imdb }, title: `Saved ${index + 1}` },
      addedAt: Date.UTC(2026, 6, 17, 12, index),
      lists: [{ service: 'trakt', kind: 'watchlist' }]
    })
  }

  const result = await pushMediaBridge({
    connection: stremioConnection(),
    bundle,
    scopes: { history: false, progress: false, library: true }
  })

  assert.equal(result.written.library, 4)
  assert.equal(result.skipped?.library, 0)
  assert.deepEqual(result.confirmedScopes, ['library'])
  assert.deepEqual(result.issues, [])
})

test('treats an accepted Simkl history no-op as confirmed without requiring a newer timestamp', async t => {
  let requestBody: any = null
  const fetchMock = t.mock.method(globalThis, 'fetch', async (input, init) => {
    assert.equal(new URL(String(input)).pathname, '/sync/history')
    requestBody = JSON.parse(String(init?.body || '{}'))
    return new Response(JSON.stringify({
      added: {
        movies: 0,
        shows: 0,
        episodes: 0,
        statuses: [{
          request: requestBody.movies[0],
          response: { status: 'completed', simkl_type: 'movie', anime_type: null }
        }]
      },
      not_found: { movies: [], shows: [], episodes: [] }
    }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    })
  })
  const bundle = createEmptyBundle()
  bundle.history.push(movieHistory('Already Watched', 'tt2015381', Date.UTC(2026, 6, 17)))

  const result = await pushMediaBridge({
    connection: simklConnection(),
    bundle,
    scopes: { history: true, progress: false, library: false }
  })

  assert.equal(fetchMock.mock.callCount(), 1)
  assert.equal(result.written.history, 1)
  assert.equal(result.skipped?.history, undefined)
  assert.deepEqual(result.confirmedScopes, ['history'])
  assert.deepEqual(result.issues, [])
})

test('reports Simkl history not_found records instead of counting the whole HTTP 201 as success', async t => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async (_input, init) => {
    const body = JSON.parse(String(init?.body || '{}'))
    return new Response(JSON.stringify({
      added: {
        movies: 1,
        shows: 0,
        episodes: 0,
        statuses: [{
          request: body.movies[0],
          response: { status: 'completed', simkl_type: 'movie', anime_type: null }
        }]
      },
      not_found: { movies: [body.movies[1]], shows: [], episodes: [] }
    }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    })
  })
  const bundle = createEmptyBundle()
  bundle.history.push(
    movieHistory('Found', 'tt2015381', Date.UTC(2026, 6, 17)),
    movieHistory('Missing', 'tt0000000', Date.UTC(2026, 6, 16))
  )

  const result = await pushMediaBridge({
    connection: simklConnection(),
    bundle,
    scopes: { history: true, progress: false, library: false }
  })

  assert.equal(fetchMock.mock.callCount(), 1)
  assert.equal(result.written.history, 1)
  assert.equal(result.skipped?.history, 1)
  assert.deepEqual(result.confirmedScopes, ['history'])
  assert.equal(result.issues.length, 1)
  assert.equal(result.issues[0].scope, 'history')
  assert.equal(result.issues[0].media?.title, 'Missing')
  assert.match(result.issues[0].reason, /could not match/)
})

test('checks Simkl activities and merges only the changed destination delta for verification', async t => {
  const requests: string[] = []
  const fetchMock = t.mock.method(globalThis, 'fetch', async input => {
    const url = new URL(String(input))
    requests.push(url.toString())
    if (url.pathname === '/sync/activities') {
      return Response.json({ all: '2026-07-17T12:00:00Z' })
    }
    assert.equal(url.pathname, '/sync/all-items')
    assert.equal(url.searchParams.get('date_from'), '2026-07-17T11:00:00Z')
    return Response.json({
      movies: [{
        movie: { title: 'Changed', year: 2024, ids: { imdb: 'tt2015382' } },
        status: 'completed',
        last_watched_at: '2026-07-17T11:30:00Z'
      }],
      shows: [],
      anime: []
    })
  })
  const baseline = createEmptyBundle()
  baseline.history.push(movieHistory('Existing', 'tt2015381', Date.UTC(2026, 6, 16)))

  const result = await pullMediaBridgeForVerification({
    connection: simklConnection(),
    baseline,
    checkpoint: { simklActivity: '2026-07-17T11:00:00Z' },
    scopes: { history: true, progress: false, library: false }
  })

  assert.equal(fetchMock.mock.callCount(), 2)
  assert.equal(result.bundle.history.length, 2)
  assert.deepEqual(result.bundle.history.map(record => record.media.title).sort(), ['Changed', 'Existing'])
  assert.match(requests[1], /date_from=2026-07-17T11%3A00%3A00Z/)
})

test('skips the Simkl destination reread when activities did not change', async t => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async input => {
    assert.equal(new URL(String(input)).pathname, '/sync/activities')
    return Response.json({ all: '2026-07-17T11:00:00Z' })
  })
  const baseline = createEmptyBundle()
  baseline.history.push(movieHistory('Existing', 'tt2015381', Date.UTC(2026, 6, 16)))

  const result = await pullMediaBridgeForVerification({
    connection: simklConnection(),
    baseline,
    checkpoint: { simklActivity: '2026-07-17T11:00:00Z' },
    scopes: { history: true, progress: false, library: false }
  })

  assert.equal(fetchMock.mock.callCount(), 1)
  assert.equal(result.bundle.history.length, 1)
})
