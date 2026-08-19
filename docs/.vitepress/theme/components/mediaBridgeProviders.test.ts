import assert from 'node:assert/strict'
import test from 'node:test'
import { createEmptyBundle } from './mediaBridgeCore.ts'
import {
  identifyOAuthConnection,
  invalidateNuvioMetadataCaches,
  inspectDestinationMappings,
  pullMediaBridge,
  pullMediaBridgeForVerification,
  pushMediaBridge,
  requestBridgeJson,
  resolveNuvioMediaBridgeBundle,
  signInJellyfin,
  type BridgeConnection
} from './mediaBridgeProviders.ts'
import { planMediaBridgePreview } from './mediaBridgePlan.ts'
import { encodeStremioWatchedField } from './stremioWatched.ts'

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
    simklAccountType: 'vip',
    credentials: {
      service: 'simkl',
      clientId: 'test-client',
      accessToken: 'test-token'
    }
  }
}

test('aborts bridge requests that exceed their configured deadline', async t => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async (_input, init) => {
    const signal = init?.signal
    if (!signal) throw new Error('Expected a request abort signal.')
    return new Promise<Response>((_resolve, reject) => {
      const rejectForAbort = () => reject(signal.reason)
      if (signal.aborted) rejectForAbort()
      else signal.addEventListener('abort', rejectForAbort, { once: true })
    })
  })

  await assert.rejects(
    requestBridgeJson('https://slow.example/data', {
      timeoutMs: 10,
      timeoutMessage: 'Test request deadline reached.'
    }),
    (error: any) => error?.name === 'TimeoutError' && error?.message === 'Test request deadline reached.'
  )
  assert.equal(fetchMock.mock.callCount(), 1)
})

test('accepts Simkl Pro and VIP destinations using the documented settings request', async t => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async (_input, init) => {
    assert.equal(init?.method, 'POST')
    assert.equal(init?.body, undefined)
    const authorization = new Headers(init?.headers).get('authorization') || ''
    const accountType = authorization.includes('pro-token') ? 'pro' : 'vip'
    return Response.json({
      user: { name: `${accountType}-user` },
      account: { id: accountType === 'pro' ? 101 : 202, type: accountType }
    })
  })

  for (const accountType of ['pro', 'vip'] as const) {
    const connection = await identifyOAuthConnection('destination', {
      service: 'simkl',
      clientId: 'test-client',
      accessToken: `${accountType}-token`
    })
    assert.equal(connection.service, 'simkl')
    assert.equal(connection.simklAccountType, accountType)
    assert.equal(connection.displayName, `${accountType}-user`)
  }
  assert.equal(fetchMock.mock.callCount(), 2)
})

test('rejects Simkl Free accounts as import destinations from Trakt', async t => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => Response.json({
    user: { name: 'free-user' },
    account: { id: 303, type: 'free' }
  }))

  await assert.rejects(
    identifyOAuthConnection('destination', {
      service: 'simkl',
      clientId: 'test-client',
      accessToken: 'test-token'
    }, 'trakt'),
    /not available for Free accounts.*Pro or VIP/
  )
  assert.equal(fetchMock.mock.callCount(), 1)
})

test('allows Simkl Free accounts as import destinations from Nuvio', async t => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => Response.json({
    user: { name: 'free-user' },
    account: { id: 303, type: 'free' }
  }))

  const connection = await identifyOAuthConnection('destination', {
    service: 'simkl',
    clientId: 'test-client',
    accessToken: 'test-token'
  }, 'nuvio')

  assert.equal(connection.service, 'simkl')
  assert.equal(connection.simklAccountType, 'free')
  assert.equal(connection.displayName, 'free-user')
  assert.equal(fetchMock.mock.callCount(), 1)
})

test('allows Simkl Free accounts as export sources', async t => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async (_input, init) => {
    assert.equal(init?.method, 'POST')
    return Response.json({
      user: { name: 'free-exporter' },
      account: { id: 404, type: 'free' }
    })
  })

  const connection = await identifyOAuthConnection('source', {
    service: 'simkl',
    clientId: 'test-client',
    accessToken: 'test-token'
  })
  assert.equal(connection.slot, 'source')
  assert.equal(connection.simklAccountType, undefined)
  assert.equal(connection.displayName, 'free-exporter')
  assert.equal(fetchMock.mock.callCount(), 1)
})

test('blocks non-Nuvio Simkl writes when a paid plan was not verified', async t => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => Response.json({}))
  const connection = simklConnection()
  connection.simklAccountType = 'free'
  const bundle = createEmptyBundle()
  bundle.history.push(movieHistory('Blocked import', 'tt2015381', Date.UTC(2026, 6, 17)))

  await assert.rejects(
    pushMediaBridge({
      connection,
      sourceConnection: traktConnection('source'),
      bundle,
      scopes: { history: true, progress: false, library: false }
    }),
    /only available for Simkl Pro or VIP accounts/
  )
  assert.equal(fetchMock.mock.callCount(), 0)
})

test('allows Nuvio writes to Simkl when a paid plan was not verified', async t => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => Response.json({
    added: { movies: 1 },
    not_found: { movies: [], shows: [], anime: [] }
  }))
  const connection = simklConnection()
  connection.simklAccountType = 'free'
  const bundle = createEmptyBundle()
  bundle.history.push(movieHistory('Available import', 'tt2015381', Date.UTC(2026, 6, 17)))

  const result = await pushMediaBridge({
    connection,
    sourceConnection: nuvioConnection('source'),
    bundle,
    scopes: { history: true, progress: false, library: false }
  })

  assert.equal(fetchMock.mock.callCount(), 1)
  assert.equal(result.written.history, 1)
  assert.deepEqual(result.confirmedScopes, ['history'])
})

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

function nuvioConnection(slot: 'source' | 'destination' = 'destination'): BridgeConnection {
  return {
    slot,
    service: 'nuvio',
    accountId: 'nuvio-user',
    profileId: 1,
    displayName: 'Nuvio User · Main',
    credentials: {
      service: 'nuvio',
      publicKey: 'test-public-key',
      session: {
        access_token: 'test-access-token',
        expires_at: Math.floor(Date.now() / 1000) + 3_600
      }
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

test('submits every replay timestamp to Trakt as an individual history event', async t => {
  const watchedAt = [
    Date.UTC(2026, 6, 15),
    Date.UTC(2026, 6, 16),
    Date.UTC(2026, 6, 17)
  ]
  t.mock.method(globalThis, 'fetch', async (_input, init) => {
    const body = JSON.parse(String(init?.body || '{}'))
    assert.equal(body.movies.length, 3)
    assert.deepEqual(body.movies.map((movie: any) => movie.watched_at), watchedAt.map(value => new Date(value).toISOString()))
    return Response.json({
      added: { movies: 3, episodes: 0 },
      updated: { movies: 0, episodes: 0 },
      not_found: { movies: [], shows: [], seasons: [], episodes: [] }
    })
  })
  const bundle = createEmptyBundle()
  bundle.history.push(...watchedAt.map(value => movieHistory('Replay', 'tt2015381', value)))

  const result = await pushMediaBridge({
    connection: traktConnection(),
    bundle,
    scopes: { history: true, progress: false, library: false }
  })

  assert.equal(result.written.history, 3)
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

test('preserves Trakt replay history events and their IDs', async t => {
  t.mock.method(globalThis, 'fetch', async input => {
    const url = new URL(String(input))
    if (url.pathname !== '/users/me/history') throw new Error(`Unexpected request: ${url.pathname}`)
    if (url.searchParams.get('page') === '2') return Response.json([])
    return Response.json([
      {
        id: 2,
        type: 'movie',
        watched_at: '2026-07-17T12:00:00Z',
        movie: {
          title: 'Replay',
          year: 2024,
          ids: { trakt: 1, imdb: 'tt2015381', tmdb: 118340 }
        }
      },
      {
        id: 1,
        type: 'movie',
        watched_at: '2026-07-16T12:00:00Z',
        movie: {
          title: 'Replay',
          year: 2024,
          ids: { trakt: 1, imdb: 'tt2015381', tmdb: 118340 }
        }
      }
    ])
  })
  const scopes = { history: true, progress: false, library: false }

  const source = await pullMediaBridge({ connection: traktConnection('source'), scopes })
  const destination = await pullMediaBridge({ connection: traktConnection('destination'), scopes })

  assert.equal(source.bundle.history.length, 2)
  assert.equal(source.bundle.history[0].watchedAt, Date.parse('2026-07-17T12:00:00Z'))
  assert.deepEqual(source.bundle.history.map(record => record.eventId), [2, 1])
  assert.deepEqual(source.issues, [])
  assert.equal(destination.bundle.history.length, 2)
  assert.deepEqual(destination.issues, [])
})

test('pulls a Trakt poster URL and passes it through to Nuvio', async t => {
  const posterUrl = 'https://walter-r2.trakt.tv/images/movies/000/012/601/posters/thumb/e0d9dd35c5.jpg.webp'
  let metadataRequests = 0
  let libraryItems: any[] = []
  t.mock.method(globalThis, 'fetch', async (input, init) => {
    const url = new URL(String(input), 'https://nuvio.wiki')
    if (url.hostname === 'api.trakt.tv') {
      assert.equal(url.searchParams.get('extended'), 'full,images')
      if (url.pathname === '/sync/watchlist/movies' && url.searchParams.get('page') === '1') {
        return Response.json([{
          listed_at: '2026-07-17T12:00:00Z',
          movie: {
            title: 'TRON: Legacy',
            year: 2010,
            ids: { trakt: 12601, imdb: 'tt1104001', tmdb: 20526 },
            images: {
              poster: [posterUrl.replace(/^https:\/\//, '')]
            }
          }
        }])
      }
      return Response.json([])
    }
    const body = JSON.parse(String(init?.body || '{}'))
    if (url.pathname === '/api/trakt/enrich-metadata') {
      metadataRequests++
      return Response.json({ results: [] })
    }
    if (url.pathname === '/rest/v1/rpc/sync_push_library_items') {
      libraryItems = body.p_items
      return Response.json(null)
    }
    if (url.pathname === '/rest/v1/rpc/sync_delete_library_items') return Response.json(null)
    throw new Error(`Unexpected request: ${url}`)
  })

  const pulled = await pullMediaBridge({
    connection: traktConnection('source'),
    scopes: { history: false, progress: false, library: true }
  })
  assert.equal(pulled.bundle.library.length, 1)
  assert.equal(pulled.bundle.library[0].posterUrl, posterUrl)

  const result = await pushMediaBridge({
    connection: nuvioConnection(),
    bundle: pulled.bundle,
    scopes: { history: false, progress: false, library: true }
  })

  assert.equal(metadataRequests, 0)
  assert.equal(libraryItems.length, 1)
  assert.equal(libraryItems[0].poster, posterUrl)
  assert.equal(libraryItems[0].poster_shape, 'POSTER')
  assert.equal(result.written.library, 1)
})

test('reads every Trakt history page and maps episodes through their parent show', async t => {
  const requestedPages: string[] = []
  t.mock.method(globalThis, 'fetch', async input => {
    const url = new URL(String(input))
    const page = Number(url.searchParams.get('page') || 1)
    assert.equal(url.searchParams.get('limit'), '100')
    requestedPages.push(`${url.pathname}:${page}`)

    if (url.pathname === '/users/me/history') {
      if (page === 1) return Response.json(Array.from({ length: 100 }, (_, index) => ({
          id: index + 1,
          type: 'movie',
          watched_at: `2026-07-17T${String(index % 24).padStart(2, '0')}:00:00Z`,
          movie: {
            title: `Movie ${index + 1}`,
            year: 2024,
            ids: {
              trakt: index + 1,
              imdb: `tt${String(index + 1).padStart(7, '0')}`,
              tmdb: index + 1
            }
          }
        })))
      if (page === 2) {
        return Response.json([
          {
            id: 101,
            type: 'movie',
            watched_at: '2026-07-18T12:00:00Z',
            movie: {
              title: 'Movie 101',
              year: 2024,
              ids: { trakt: 101, imdb: 'tt0000101', tmdb: 101 }
            }
          },
          {
            id: 102,
            type: 'episode',
            watched_at: '2026-07-18T13:00:00Z',
            episode: {
              season: 1,
              number: 1,
              number_abs: 11,
              title: 'Pilot',
              ids: { trakt: 7001, tmdb: 9001 }
            },
            show: {
              title: 'Paged Series',
              year: 2024,
              ids: { trakt: 501, imdb: 'tt9000501', tmdb: 501 }
            }
          },
          {
            id: 103,
            type: 'episode',
            watched_at: '2026-07-18T14:00:00Z',
            episode: {
              season: 1,
              number: 2,
              number_abs: 12,
              title: 'Second',
              ids: { tmdb: 9002 }
            },
            show: {
              title: 'Paged Series',
              year: 2024,
              ids: { trakt: 501, imdb: 'tt9000501', tmdb: 501 }
            }
          }
        ])
      }
      return Response.json([])
    }
    throw new Error(`Unexpected request: ${url.pathname}`)
  })

  const result = await pullMediaBridge({
    connection: traktConnection('source'),
    scopes: { history: true, progress: false, library: false }
  })

  assert.equal(result.bundle.history.length, 103)
  assert.equal(result.bundle.history.filter(record => record.media.kind === 'movie').length, 101)
  assert.equal(result.bundle.history.filter(record => record.media.kind === 'series').length, 2)
  const episodes = result.bundle.history.filter(record => record.media.kind === 'series')
  assert.deepEqual(episodes.map(record => record.media.ids.tmdb), [501, 501])
  assert.deepEqual(episodes.map(record => record.media.episode), [2, 1])
  assert.deepEqual(episodes.map(record => record.media.absoluteEpisode), [12, 11])
  assert.deepEqual(episodes.map(record => record.media.videoId), ['tmdb:9002', 'trakt:7001'])
  assert.deepEqual(result.issues, [])
  assert.deepEqual(requestedPages, [
    '/users/me/history:1',
    '/users/me/history:2',
    '/users/me/history:3'
  ])
})

test('exports all 4,000 paginated Trakt history events with event IDs and replay timestamps', async t => {
  const totalEvents = 4_000
  const serverLimit = 80
  const pageCount = totalEvents / serverLimit
  const requestedLimits: number[] = []
  const fetchMock = t.mock.method(globalThis, 'fetch', async input => {
    const url = new URL(String(input))
    assert.equal(url.pathname, '/users/me/history')
    const page = Number(url.searchParams.get('page'))
    requestedLimits.push(Number(url.searchParams.get('limit')))
    const firstIndex = (page - 1) * serverLimit
    const rows = Array.from({ length: serverLimit }, (_, offset) => {
      const index = firstIndex + offset
      const watchedAt = new Date(Date.UTC(2020, 0, 1) + index * 1_000).toISOString()
      return index % 2 === 0
        ? {
            id: index + 1,
            watched_at: watchedAt,
            action: 'watch',
            type: 'movie',
            movie: {
              title: 'Repeated Movie',
              year: 2020,
              ids: { trakt: 1, imdb: 'tt0000001' }
            }
          }
        : {
            id: index + 1,
            watched_at: watchedAt,
            action: 'watch',
            type: 'episode',
            episode: { season: 1, number: 1, title: 'Pilot', ids: { trakt: 2 } },
            show: {
              title: 'Repeated Show',
              year: 2020,
              ids: { trakt: 3, imdb: 'tt0000003' }
            }
          }
    })
    return Response.json(rows, {
      headers: {
        'X-Pagination-Page': String(page),
        'X-Pagination-Limit': String(serverLimit),
        'X-Pagination-Page-Count': String(pageCount),
        'X-Pagination-Item-Count': String(totalEvents)
      }
    })
  })

  const result = await pullMediaBridge({
    connection: traktConnection('source'),
    scopes: { history: true, progress: false, library: false }
  })

  assert.equal(fetchMock.mock.callCount(), pageCount)
  assert.equal(requestedLimits[0], 100)
  assert.ok(requestedLimits.slice(1).every(limit => limit === serverLimit))
  assert.equal(result.bundle.history.length, totalEvents)
  assert.equal(result.bundle.history[0].eventId, totalEvents)
  assert.equal(result.bundle.history.at(-1)?.eventId, 1)
  assert.equal(result.bundle.history.filter(record => record.media.kind === 'movie').length, 2_000)
  assert.equal(result.bundle.history.filter(record => record.media.kind === 'series').length, 2_000)
  assert.deepEqual(result.issues, [])
})

test('continues Trakt pagination to an empty page when pagination headers are unavailable', async t => {
  const events = Array.from({ length: 5 }, (_, index) => ({
    id: `event-${index + 1}`,
    watched_at: new Date(Date.UTC(2026, 6, 17, index)).toISOString(),
    type: 'movie',
    movie: {
      title: 'Server Limited',
      year: 2026,
      ids: { trakt: 10, imdb: 'tt0000010' }
    }
  }))
  const fetchMock = t.mock.method(globalThis, 'fetch', async input => {
    const url = new URL(String(input))
    const page = Number(url.searchParams.get('page'))
    return Response.json(events.slice((page - 1) * 2, page * 2))
  })

  const result = await pullMediaBridge({
    connection: traktConnection('source'),
    scopes: { history: true, progress: false, library: false }
  })

  assert.equal(fetchMock.mock.callCount(), 4)
  assert.equal(result.bundle.history.length, 5)
  assert.deepEqual(result.bundle.history.map(record => record.eventId), [
    'event-5', 'event-4', 'event-3', 'event-2', 'event-1'
  ])
})

test('reads selected Trakt scopes concurrently within the shared request limit', async t => {
  let activeRequests = 0
  let maximumActiveRequests = 0
  const requestedPaths: string[] = []
  t.mock.method(globalThis, 'fetch', async input => {
    const url = new URL(String(input))
    requestedPaths.push(url.pathname)
    activeRequests++
    maximumActiveRequests = Math.max(maximumActiveRequests, activeRequests)
    await new Promise(resolve => setTimeout(resolve, 10))
    activeRequests--
    return Response.json([])
  })

  const result = await pullMediaBridge({
    connection: traktConnection('source'),
    scopes: { history: true, progress: true, library: true }
  })

  assert.equal(maximumActiveRequests, 6)
  assert.deepEqual(new Set(requestedPaths), new Set([
    '/users/me/history',
    '/sync/playback',
    '/sync/watchlist/movies',
    '/sync/watchlist/shows',
    '/sync/collection/movies',
    '/sync/collection/shows'
  ]))
  assert.deepEqual(result.bundle, createEmptyBundle())
})

test('fetches known Trakt pagination pages with bounded concurrency', async t => {
  let activeRequests = 0
  let maximumActiveRequests = 0
  t.mock.method(globalThis, 'fetch', async input => {
    const url = new URL(String(input))
    const page = Number(url.searchParams.get('page'))
    if (page > 1) {
      activeRequests++
      maximumActiveRequests = Math.max(maximumActiveRequests, activeRequests)
      await new Promise(resolve => setTimeout(resolve, 10))
      activeRequests--
    }
    return Response.json([{
      id: page,
      type: 'movie',
      watched_at: new Date(Date.UTC(2026, 6, page)).toISOString(),
      movie: {
        title: `Page ${page}`,
        year: 2026,
        ids: { trakt: page, imdb: `tt${String(page).padStart(7, '0')}` }
      }
    }], {
      headers: {
        'X-Pagination-Page': String(page),
        'X-Pagination-Limit': '100',
        'X-Pagination-Page-Count': '5'
      }
    })
  })

  const result = await pullMediaBridge({
    connection: traktConnection('source'),
    scopes: { history: true, progress: false, library: false }
  })

  assert.equal(maximumActiveRequests, 4)
  assert.equal(result.bundle.history.length, 5)
  assert.deepEqual(result.bundle.history.map(record => record.eventId), [5, 4, 3, 2, 1])
})

test('refreshes an expired Trakt token once for concurrent reads', async t => {
  const connection = traktConnection('source')
  if (connection.credentials.service !== 'trakt') throw new Error('Expected Trakt credentials.')
  connection.credentials.tokens = {
    access_token: 'expired-token',
    refresh_token: 'refresh-token',
    created_at: 1,
    expires_in: 1
  }
  let refreshRequests = 0
  let apiRequests = 0
  t.mock.method(globalThis, 'fetch', async (input, init) => {
    const url = new URL(String(input), 'https://nuvio.wiki')
    if (url.pathname === '/api/trakt/refresh') {
      refreshRequests++
      await new Promise(resolve => setTimeout(resolve, 10))
      return Response.json({
        access_token: 'refreshed-token',
        refresh_token: 'next-refresh-token',
        created_at: Math.floor(Date.now() / 1000),
        expires_in: 3_600
      })
    }
    apiRequests++
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer refreshed-token')
    return Response.json([])
  })

  await pullMediaBridge({
    connection,
    scopes: { history: true, progress: true, library: true }
  })

  assert.equal(refreshRequests, 1)
  assert.equal(apiRequests, 6)
})

test('writes IMDb-first Nuvio IDs with source posters and omits unsupported metadata', async t => {
  let watchedItems: any[] = []
  let deletedWatchedKeys: any[] = []
  let metadataRequests = 0
  let libraryItems: any[] = []
  t.mock.method(globalThis, 'fetch', async (input, init) => {
    const url = new URL(String(input), 'https://nuvio.wiki')
    const body = JSON.parse(String(init?.body || '{}'))
    if (url.pathname === '/rest/v1/rpc/sync_push_watched_items') {
      watchedItems = body.p_items
      return Response.json(null)
    }
    if (url.pathname === '/rest/v1/rpc/sync_delete_watched_items') {
      deletedWatchedKeys = body.p_keys
      return Response.json(null)
    }
    if (url.pathname === '/api/trakt/enrich-metadata') {
      metadataRequests++
      return Response.json({ results: [] })
    }
    if (url.pathname === '/rest/v1/rpc/sync_push_library_items') {
      libraryItems = body.p_items
      return Response.json(null)
    }
    if (url.pathname === '/rest/v1/rpc/sync_delete_library_items') return Response.json(null)
    throw new Error(`Unexpected request: ${url.pathname}`)
  })

  const media = {
    kind: 'movie' as const,
    ids: { imdb: 'tt2015381', tmdb: 118340, trakt: 28 },
    title: 'Guardians of the Galaxy',
    year: 2014
  }
  const bundle = createEmptyBundle()
  bundle.history.push({ media, watchedAt: Date.UTC(2026, 6, 17), playCount: 1 })
  bundle.history.push({
    media: {
      kind: 'series',
      ids: { imdb: 'tt0944947', tmdb: 1399 },
      title: 'Game of Thrones S0E44',
      season: 0,
      episode: 44
    },
    watchedAt: Date.UTC(2026, 6, 18),
    playCount: 1
  })
  bundle.library.push({
    media,
    addedAt: Date.UTC(2026, 6, 16),
    lists: [{ service: 'trakt', accountId: 'test-account', kind: 'watchlist' }],
    posterUrl: 'https://walter-r2.trakt.tv/images/movies/000/012/601/posters/thumb/e0d9dd35c5.jpg.webp'
  })
  bundle.library.push({
    media: {
      kind: 'movie',
      ids: { imdb: 'tt7654321', jellyfin: 'movie-101' },
      title: 'Jellyfin title without artwork',
      year: 2024
    },
    addedAt: Date.UTC(2026, 6, 15),
    lists: [{ service: 'jellyfin', accountId: 'jellyfin-user', kind: 'library' }]
  })

  const result = await pushMediaBridge({
    connection: nuvioConnection(),
    bundle,
    scopes: { history: true, progress: false, library: true }
  })

  assert.equal(result.written.history, 2)
  assert.equal(result.written.library, 2)
  const watchedMovie = watchedItems.find(item => item.content_type === 'movie')
  assert.equal(watchedMovie.content_id, 'tt2015381')
  assert.deepEqual(
    deletedWatchedKeys.map(item => JSON.stringify(item)).sort(),
    [
      { content_id: 'tmdb:118340' },
      { content_id: 'trakt:28' },
      { content_id: 'tmdb:1399', season: 0, episode: 44 }
    ].map(item => JSON.stringify(item)).sort()
  )
  const watchedEpisode = watchedItems.find(item => item.content_type === 'series')
  assert.equal(watchedEpisode.title, 'Game of Thrones')
  assert.equal(watchedEpisode.season, 0)
  assert.equal(watchedEpisode.episode, 44)
  assert.equal(metadataRequests, 0)
  assert.equal(libraryItems.length, 2)
  assert.equal(libraryItems.some(item => item.content_id === 'tmdb:118340'), false)
  const traktItem = libraryItems.find(item => item.content_id === 'tt2015381')
  assert.equal(
    traktItem.poster,
    'https://walter-r2.trakt.tv/images/movies/000/012/601/posters/thumb/e0d9dd35c5.jpg.webp'
  )
  assert.equal(traktItem.poster_shape, 'POSTER')
  assert.equal(traktItem.release_info, '2014')
  for (const field of ['background', 'description', 'imdb_rating', 'genres', 'addon_base_url']) {
    assert.equal(Object.hasOwn(traktItem, field), false)
  }
  const jellyfinItem = libraryItems.find(item => item.content_id === 'tt7654321')
  assert.equal(Object.hasOwn(jellyfinItem, 'poster'), false)
  assert.equal(Object.hasOwn(jellyfinItem, 'poster_shape'), false)
  assert.deepEqual(result.issues, [])
})

test('skips percentage-only Nuvio progress without a source duration', async t => {
  let progressEntries: any[] = []
  let metadataRequests = 0
  t.mock.method(globalThis, 'fetch', async (input, init) => {
    const url = new URL(String(input), 'https://nuvio.wiki')
    const body = JSON.parse(String(init?.body || '{}'))
    if (url.pathname === '/api/trakt/enrich-metadata') {
      metadataRequests++
      return Response.json({ results: [] })
    }
    if (url.pathname === '/rest/v1/rpc/sync_push_watch_progress') {
      progressEntries = body.p_entries
      return Response.json(null)
    }
    throw new Error(`Unexpected request: ${url.pathname}`)
  })

  const bundle = createEmptyBundle()
  bundle.progress.push(movieProgress(50))
  const result = await pushMediaBridge({
    connection: nuvioConnection(),
    bundle,
    scopes: { history: false, progress: true, library: false }
  })

  assert.equal(metadataRequests, 0)
  assert.equal(progressEntries.length, 0)
  assert.equal(result.written.progress, 0)
  assert.equal(result.skipped?.progress, 1)
  assert.equal(result.issues.length, 1)
  assert.match(result.issues[0].reason, /reliable runtime/)
})

test('writes Nuvio series-level watched state and stable episode progress keys', async t => {
  let watchedItems: any[] = []
  let progressEntries: any[] = []
  t.mock.method(globalThis, 'fetch', async (input, init) => {
    const url = new URL(String(input), 'https://nuvio.wiki')
    const body = JSON.parse(String(init?.body || '{}'))
    if (url.pathname === '/rest/v1/rpc/sync_push_watched_items') {
      watchedItems = body.p_items
      return Response.json(null)
    }
    if (url.pathname === '/rest/v1/rpc/sync_push_watch_progress') {
      progressEntries = body.p_entries
      return Response.json(null)
    }
    throw new Error(`Unexpected request: ${url.pathname}`)
  })

  const bundle = createEmptyBundle()
  bundle.history.push({
    media: {
      kind: 'series',
      ids: { imdb: 'tt0944947' },
      title: 'Game of Thrones'
    },
    watchedAt: Date.UTC(2026, 6, 17),
    playCount: 1
  })
  bundle.progress.push({
    media: {
      kind: 'series',
      ids: { imdb: 'tt0944947' },
      title: 'Game of Thrones',
      season: 2,
      episode: 3,
      videoId: 'tt0944947:2:3'
    },
    positionMs: 600_000,
    durationMs: 3_600_000,
    updatedAt: Date.UTC(2026, 6, 18)
  })

  const result = await pushMediaBridge({
    connection: nuvioConnection(),
    bundle,
    scopes: { history: true, progress: true, library: false }
  })

  assert.equal(watchedItems.length, 1)
  assert.equal(watchedItems[0].content_id, 'tt0944947')
  assert.equal(Object.hasOwn(watchedItems[0], 'season'), false)
  assert.equal(Object.hasOwn(watchedItems[0], 'episode'), false)
  assert.equal(progressEntries.length, 1)
  assert.equal(progressEntries[0].progress_key, 'tt0944947_s2e3')
  assert.deepEqual(result.written, { history: 1, progress: 1, library: 0 })
  assert.deepEqual(result.issues, [])
})

test('keeps a TMDB-only source ID when writing Nuvio', async t => {
  let metadataRequests = 0
  let watchedItems: any[] = []
  t.mock.method(globalThis, 'fetch', async (input, init) => {
    const url = new URL(String(input), 'https://nuvio.wiki')
    const body = JSON.parse(String(init?.body || '{}'))
    if (url.pathname === '/api/trakt/enrich-metadata') {
      metadataRequests++
      return Response.json({ results: [] })
    }
    if (url.pathname === '/rest/v1/rpc/sync_push_watched_items') {
      watchedItems = body.p_items
      return Response.json(null)
    }
    if (url.pathname === '/rest/v1/rpc/sync_delete_watched_items') {
      return Response.json(null)
    }
    throw new Error(`Unexpected request: ${url.pathname}`)
  })

  const bundle = createEmptyBundle()
  bundle.history.push({
    media: {
      kind: 'movie',
      ids: { tmdb: 118340 },
      title: 'Guardians of the Galaxy',
      year: 2014
    },
    watchedAt: Date.UTC(2026, 6, 17),
    playCount: 1
  })

  await pushMediaBridge({
    connection: nuvioConnection(),
    bundle,
    scopes: { history: true, progress: false, library: false }
  })

  assert.equal(metadataRequests, 0)
  assert.equal(watchedItems[0].content_id, 'tmdb:118340')
})

test('preserves mixed Nuvio IMDb and TMDB library rows without metadata lookup', async t => {
  let metadataRequests = 0
  t.mock.method(globalThis, 'fetch', async input => {
    const url = new URL(String(input), 'https://nuvio.wiki')
    if (url.pathname === '/rest/v1/rpc/sync_pull_library') {
      return Response.json([
        {
          content_id: 'tt2015381',
          content_type: 'movie',
          name: 'Guardians of the Galaxy',
          release_info: '2014-08-01',
          added_at: 100
        },
        {
          content_id: 'tmdb:118340',
          content_type: 'movie',
          name: 'Guardians of the Galaxy',
          release_info: '2014-08-01',
          added_at: 200
        }
      ])
    }
    if (url.pathname === '/api/trakt/enrich-metadata') {
      metadataRequests++
      return Response.json({ results: [] })
    }
    throw new Error(`Unexpected request: ${url.pathname}`)
  })

  const result = await pullMediaBridge({
    connection: nuvioConnection(),
    scopes: { history: false, progress: false, library: true }
  })

  assert.equal(metadataRequests, 0)
  assert.equal(result.bundle.library.length, 2)
  const imdbRecord = result.bundle.library.find(record => record.media.ids.imdb === 'tt2015381')
  const tmdbRecord = result.bundle.library.find(record => record.media.ids.tmdb === 118340)
  assert.equal(imdbRecord?.media.ids.tmdb, undefined)
  assert.equal(tmdbRecord?.media.ids.imdb, undefined)
})

test('uses the IMDb show ID when preflighting Trakt episodes against Nuvio metadata', async t => {
  let requestedMetadataId = ''
  t.mock.method(globalThis, 'fetch', async input => {
    const url = new URL(String(input))
    if (url.pathname === '/rest/v1/addons') {
      return Response.json([{
        url: 'https://meta.test/manifest.json',
        enabled: true,
        sort_order: 1,
        profile_id: 1
      }])
    }
    if (url.pathname === '/manifest.json') {
      return Response.json({ resources: ['meta'] })
    }
    if (url.pathname.startsWith('/meta/series/')) {
      requestedMetadataId = decodeURIComponent(url.pathname.split('/').at(-1)!.replace(/\.json$/, ''))
      if (requestedMetadataId !== 'tt0944947') return new Response(null, { status: 404 })
      return Response.json({
        meta: {
          videos: [{ id: 'tt0944947:1:2', season: 1, episode: 2, title: 'The Kingsroad' }]
        }
      })
    }
    throw new Error(`Unexpected request: ${url.pathname}`)
  })

  const bundle = createEmptyBundle()
  bundle.history.push({
    media: {
      kind: 'series',
      ids: { imdb: 'tt0944947', tmdb: 1399, trakt: 1390 },
      title: 'Game of Thrones',
      season: 1,
      episode: 2,
      episodeTitle: 'The Kingsroad'
    },
    watchedAt: Date.UTC(2026, 6, 17),
    playCount: 1
  })

  const mappings = await inspectDestinationMappings(
    nuvioConnection(),
    bundle,
    { history: true, progress: false, library: false }
  )

  assert.equal(requestedMetadataId, 'tt0944947')
  assert.equal(mappings.length, 1)
  assert.equal(mappings[0].mapping.status, 'mapped')
  assert.equal(mappings[0].mapping.target?.videoId, 'tt0944947:1:2')
})

test('keeps IMDb first but falls back to TMDB for Nuvio episode metadata', async t => {
  const requestedMetadataIds: string[] = []
  t.mock.method(globalThis, 'fetch', async input => {
    const url = new URL(String(input))
    if (url.pathname === '/rest/v1/addons') {
      return Response.json([{
        url: 'https://multi-id-meta.test/manifest.json',
        enabled: true,
        sort_order: 1,
        profile_id: 3
      }])
    }
    if (url.pathname === '/manifest.json') {
      return Response.json({ resources: ['meta'] })
    }
    if (url.pathname.startsWith('/meta/')) {
      const metadataId = decodeURIComponent(url.pathname.split('/').at(-1)!.replace(/\.json$/, ''))
      requestedMetadataIds.push(metadataId)
      if (metadataId !== 'tmdb:1399') return new Response(null, { status: 404 })
      return Response.json({
        meta: {
          videos: [{ id: 'tmdb:1399:2:1', season: 2, episode: 1, title: 'The Kingsroad' }]
        }
      })
    }
    throw new Error(`Unexpected request: ${url}`)
  })

  const connection = nuvioConnection()
  connection.accountId = 'multi-id-user'
  connection.profileId = 3
  const bundle = createEmptyBundle()
  bundle.history.push({
    media: {
      kind: 'series',
      ids: { imdb: 'tt0944947', tmdb: 1399, trakt: 1390 },
      title: 'Game of Thrones',
      season: 1,
      episode: 2,
      episodeTitle: 'The Kingsroad'
    },
    watchedAt: Date.UTC(2026, 6, 17),
    playCount: 1
  })

  const mappings = await inspectDestinationMappings(
    connection,
    bundle,
    { history: true, progress: false, library: false }
  )

  assert.equal(requestedMetadataIds[0], 'tt0944947')
  assert.ok(requestedMetadataIds.indexOf('tmdb:1399') > requestedMetadataIds.indexOf('tt0944947'))
  assert.equal(mappings[0].mapping.status, 'mapped')
  assert.deepEqual(
    mappings[0].mapping.target && [mappings[0].mapping.target.season, mappings[0].mapping.target.episode],
    [2, 1]
  )
})

test('prefers an IMDb-capable later addon over an earlier TMDB-only addon', async t => {
  const requests: string[] = []
  t.mock.method(globalThis, 'fetch', async input => {
    const url = new URL(String(input))
    if (url.pathname === '/rest/v1/addons') {
      return Response.json([
        {
          url: 'https://tmdb-only-meta.test/manifest.json',
          enabled: true,
          sort_order: 1,
          profile_id: 4
        },
        {
          url: 'https://imdb-meta.test/manifest.json',
          enabled: true,
          sort_order: 2,
          profile_id: 4
        }
      ])
    }
    if (url.pathname === '/manifest.json') {
      return Response.json({ resources: ['meta'] })
    }
    if (url.pathname.startsWith('/meta/')) {
      const metadataId = decodeURIComponent(url.pathname.split('/').at(-1)!.replace(/\.json$/, ''))
      requests.push(`${url.host}:${metadataId}`)
      if (url.host === 'imdb-meta.test' && metadataId === 'tt0944947') {
        return Response.json({
          meta: {
            videos: [{ id: 'tt0944947:1:2', season: 1, episode: 2, title: 'The Kingsroad' }]
          }
        })
      }
      if (url.host === 'tmdb-only-meta.test' && metadataId === 'tmdb:1399') {
        return Response.json({
          meta: {
            videos: [{ id: 'tmdb:1399:1:2', season: 1, episode: 2, title: 'The Kingsroad' }]
          }
        })
      }
      return new Response(null, { status: 404 })
    }
    throw new Error(`Unexpected request: ${url}`)
  })

  const connection = nuvioConnection()
  connection.accountId = 'global-imdb-preference-user'
  connection.profileId = 4
  const bundle = createEmptyBundle()
  bundle.history.push({
    media: {
      kind: 'series',
      ids: { imdb: 'tt0944947', tmdb: 1399 },
      title: 'Game of Thrones',
      season: 1,
      episode: 2,
      episodeTitle: 'The Kingsroad'
    },
    watchedAt: Date.UTC(2026, 6, 17),
    playCount: 1
  })

  const mappings = await inspectDestinationMappings(
    connection,
    bundle,
    { history: true, progress: false, library: false }
  )

  assert.equal(mappings[0].mapping.status, 'mapped')
  assert.equal(mappings[0].mapping.target?.videoId, 'tt0944947:1:2')
  assert.ok(requests.includes('tmdb-only-meta.test:tt0944947'))
  assert.ok(requests.includes('imdb-meta.test:tt0944947'))
  assert.equal(requests.some(request => request.endsWith(':tmdb:1399')), false)
})

test('tries later Nuvio metadata addons before skipping an episode', async t => {
  const metadataHosts: string[] = []
  t.mock.method(globalThis, 'fetch', async input => {
    const url = new URL(String(input))
    if (url.pathname === '/rest/v1/addons') {
      return Response.json([
        {
          url: 'https://first-meta.test/manifest.json',
          enabled: true,
          sort_order: 1,
          profile_id: 2
        },
        {
          url: 'https://second-meta.test/manifest.json',
          enabled: true,
          sort_order: 2,
          profile_id: 2
        }
      ])
    }
    if (url.pathname === '/manifest.json') {
      return Response.json({ resources: ['meta'] })
    }
    if (url.pathname.startsWith('/meta/')) {
      metadataHosts.push(url.host)
      if (url.host === 'first-meta.test') return new Response(null, { status: 404 })
      return Response.json({
        meta: {
          videos: [{ id: 'tt0944947:1:2', season: 1, episode: 2, title: 'The Kingsroad' }]
        }
      })
    }
    throw new Error(`Unexpected request: ${url}`)
  })

  const connection = nuvioConnection()
  connection.accountId = 'multi-addon-user'
  connection.profileId = 2
  const bundle = createEmptyBundle()
  bundle.history.push({
    media: {
      kind: 'series',
      ids: { imdb: 'tt0944947', tmdb: 1399, trakt: 1390 },
      title: 'Game of Thrones',
      season: 1,
      episode: 2,
      episodeTitle: 'The Kingsroad'
    },
    watchedAt: Date.UTC(2026, 6, 17),
    playCount: 1
  })

  const mappings = await inspectDestinationMappings(
    connection,
    bundle,
    { history: true, progress: false, library: false }
  )

  assert.deepEqual([...new Set(metadataHosts)], ['first-meta.test', 'second-meta.test'])
  assert.equal(mappings[0].mapping.status, 'mapped')
  assert.equal(mappings[0].mapping.target?.videoId, 'tt0944947:1:2')
})

test('continues without Kitsu when the Nuvio add-on query is unauthorized and retries next run', async t => {
  const connection = nuvioConnection()
  connection.accountId = 'addon-authorization-user'
  connection.profileId = 23
  const logs: string[] = []
  let addonRequests = 0

  t.mock.method(globalThis, 'fetch', async input => {
    const url = new URL(String(input), 'https://nuvio.wiki')
    if (url.pathname === '/rest/v1/addons') {
      addonRequests++
      return Response.json({ message: 'Query Authorization Failed' }, { status: 500 })
    }
    throw new Error(`Unexpected request: ${url}`)
  })

  const source = createEmptyBundle()
  source.library.push({
    media: {
      kind: 'series',
      ids: { imdb: 'tt0944947', tmdb: 1399 },
      title: 'Game of Thrones',
      year: 2011,
      genres: ['Animation']
    },
    addedAt: Date.UTC(2026, 7, 1),
    lists: [{ service: 'trakt', accountId: 'test-account', kind: 'watchlist' }]
  })

  const first = await resolveNuvioMediaBridgeBundle(source, message => logs.push(message), connection)
  const second = await resolveNuvioMediaBridgeBundle(source, message => logs.push(message), connection)

  assert.equal(first.library.length, 1)
  assert.equal(second.library.length, 1)
  assert.equal(first.library[0].media.ids.imdb, 'tt0944947')
  assert.equal(first.library[0].media.ids.external?.kitsu, undefined)
  assert.equal(addonRequests, 2)
  assert.ok(logs.every(message => !/TMDB metadata/.test(message)))
  assert.ok(logs.some(message => /500 Query Authorization Failed.*continuing without optional Kitsu identity resolution/.test(message)))
})

test('uses Main-profile metadata addons for a Nuvio profile that inherits primary addons', async t => {
  const connection = nuvioConnection()
  connection.accountId = 'inherited-addon-user'
  connection.profileId = 2
  connection.profiles = [
    { profile_index: 1, name: 'Main' },
    { profile_index: 2, name: 'Kids', uses_primary_addons: true }
  ]
  let addonProfileFilter = ''

  t.mock.method(globalThis, 'fetch', async input => {
    const url = new URL(String(input), 'https://nuvio.wiki')
    if (url.pathname === '/rest/v1/addons') {
      addonProfileFilter = url.searchParams.get('profile_id') || ''
      return Response.json([{
        url: 'https://inherited-kitsu.test/manifest.json',
        enabled: true,
        sort_order: 1,
        profile_id: 1
      }])
    }
    if (url.hostname === 'inherited-kitsu.test' && url.pathname === '/manifest.json') {
      return Response.json({
        resources: ['catalog', 'meta'],
        types: ['anime'],
        idPrefixes: ['kitsu'],
        catalogs: [{
          id: 'anime-search',
          type: 'anime',
          extra: [{ name: 'search', isRequired: true }]
        }]
      })
    }
    if (url.hostname === 'inherited-kitsu.test' && url.pathname.startsWith('/catalog/anime/anime-search/search=')) {
      return Response.json({
        metas: [{ id: 'kitsu:99', type: 'anime', name: 'Dragon Ball Z', releaseInfo: '1989' }]
      })
    }
    if (url.hostname === 'inherited-kitsu.test' && url.pathname === '/meta/anime/kitsu%3A99.json') {
      return Response.json({ meta: { id: 'kitsu:99', imdb_id: 'tt0214341', videos: [] } })
    }
    throw new Error(`Unexpected request: ${url}`)
  })

  const source = createEmptyBundle()
  source.library.push({
    media: {
      kind: 'series',
      ids: { imdb: 'tt0214341' },
      title: 'Dragon Ball Z',
      year: 1989,
      genres: ['Animation']
    },
    addedAt: Date.UTC(2026, 7, 1),
    lists: [{ service: 'trakt', accountId: 'test-account', kind: 'watchlist' }]
  })

  const enriched = await resolveNuvioMediaBridgeBundle(source, undefined, connection)

  assert.equal(addonProfileFilter, 'eq.1')
  assert.equal(enriched.library[0].media.ids.external?.kitsu, 99)
})

test('Nuvio resolution keeps source IDs without server metadata lookup', async t => {
  let metadataRequests = 0
  t.mock.method(globalThis, 'fetch', async (input, init) => {
    const url = new URL(String(input), 'https://nuvio.wiki')
    if (url.pathname !== '/api/trakt/enrich-metadata') {
      throw new Error(`Unexpected request: ${url}`)
    }
    metadataRequests++
    const body = JSON.parse(String(init?.body || '{}'))
    return Response.json({
      results: body.items.map((item: any) => ({
        content_id: item.content_id,
        imdbId: 'tt9999999',
        tmdbId: 999999
      }))
    })
  })

  const source = createEmptyBundle()
  source.library.push({
    media: {
      kind: 'series',
      ids: { imdb: 'tt11126994', tmdb: 94605 },
      title: 'Arcane',
      year: 2021
    },
    addedAt: Date.UTC(2026, 7, 1),
    lists: [{ service: 'trakt', accountId: 'test-account', kind: 'watchlist' }]
  })

  const enriched = await resolveNuvioMediaBridgeBundle(source)

  assert.equal(metadataRequests, 0)
  assert.equal(enriched.library[0].media.ids.imdb, 'tt11126994')
  assert.equal(enriched.library[0].media.ids.tmdb, 94605)
})

test('resolves Trakt anime through an enabled Kitsu catalog and persists the Kitsu identity', async t => {
  const connection = nuvioConnection()
  connection.accountId = 'kitsu-anime-user'
  connection.profileId = 7
  const logs: string[] = []
  const searchedTitles: string[] = []
  const metadataTypes: string[] = []
  let watchedItems: any[] = []
  let progressEntries: any[] = []
  let libraryItems: any[] = []

  t.mock.method(globalThis, 'fetch', async (input, init) => {
    const url = new URL(String(input), 'https://nuvio.wiki')
    const body = JSON.parse(String(init?.body || '{}'))
    if (url.pathname === '/rest/v1/addons') {
      return Response.json([{
        url: 'https://anime-kitsu.test/manifest.json',
        enabled: true,
        sort_order: 1,
        profile_id: 7
      }])
    }
    if (url.pathname === '/manifest.json') {
      return Response.json({
        id: 'community.anime.kitsu',
        resources: ['catalog', 'meta'],
        types: ['anime', 'movie', 'series'],
        idPrefixes: ['kitsu', 'mal', 'anilist', 'anidb'],
        catalogs: [{
          id: 'kitsu-anime-list',
          type: 'anime',
          extra: [{ name: 'search', isRequired: true }]
        }]
      })
    }
    if (url.pathname.startsWith('/catalog/anime/kitsu-anime-list/search=')) {
      searchedTitles.push(
        decodeURIComponent(url.pathname.split('/').at(-1)!.replace(/^search=/, '').replace(/\.json$/, ''))
      )
      return Response.json({
        metas: [
          {
            id: 'kitsu:99',
            type: 'anime',
            name: 'Doragon Bōru Zetto',
            releaseInfo: '1989-1996'
          },
          {
            id: 'kitsu:100',
            type: 'anime',
            name: 'Dragon Ball Z',
            releaseInfo: '1989'
          }
        ]
      })
    }
    if (url.pathname.startsWith('/meta/')) {
      const [, type] = /^\/meta\/([^/]+)\//.exec(url.pathname) || []
      metadataTypes.push(type)
      const metadataId = decodeURIComponent(url.pathname.split('/').at(-1)!.replace(/\.json$/, ''))
      if (type === 'anime' && metadataId === 'kitsu:100') {
        return Response.json({
          meta: {
            id: 'kitsu:100',
            imdb_id: 'tt9999999',
            videos: []
          }
        })
      }
      if (type !== 'anime' || metadataId !== 'kitsu:99') {
        return new Response(null, { status: 404 })
      }
      return Response.json({
        meta: {
          id: 'kitsu:99',
          imdb_id: 'tt0214341',
          videos: [{
            id: 'kitsu:99:1:40',
            season: 1,
            episode: 40,
            title: 'Gohan’s Hidden Powers'
          }]
        }
      })
    }
    if (url.pathname === '/rest/v1/rpc/sync_delete_watched_items') {
      return Response.json(null)
    }
    if (url.pathname === '/rest/v1/rpc/sync_push_watched_items') {
      watchedItems = body.p_items
      return Response.json(null)
    }
    if (url.pathname === '/rest/v1/rpc/sync_delete_watch_progress') {
      return Response.json(null)
    }
    if (url.pathname === '/rest/v1/rpc/sync_push_watch_progress') {
      progressEntries = body.p_entries
      return Response.json(null)
    }
    if (url.pathname === '/rest/v1/rpc/sync_push_library_items') {
      libraryItems = body.p_items
      return Response.json(null)
    }
    if (url.pathname === '/rest/v1/rpc/sync_delete_library_items') return Response.json(null)
    throw new Error(`Unexpected request: ${url}`)
  })

  const baseMedia = {
    kind: 'series' as const,
    ids: {
      imdb: 'tt0214341',
      tmdb: 12971,
      tvdb: 81472,
      trakt: 5630
    },
    title: 'Dragon Ball Z',
    year: 1989,
    genres: ['Animation']
  }
  const source = createEmptyBundle()
  source.history.push({
    media: {
      ...baseMedia,
      ids: { ...baseMedia.ids },
      season: 2,
      episode: 1,
      absoluteEpisode: 40,
      episodeTitle: 'Gohan’s Hidden Powers',
      videoId: 'trakt:65122'
    },
    watchedAt: Date.UTC(2026, 6, 17),
    playCount: 1
  })
  source.progress.push({
    media: {
      ...baseMedia,
      ids: { ...baseMedia.ids },
      season: 2,
      episode: 1,
      absoluteEpisode: 40,
      episodeTitle: 'Gohan’s Hidden Powers',
      videoId: 'trakt:65122'
    },
    positionMs: 600_000,
    durationMs: 1_440_000,
    updatedAt: Date.UTC(2026, 6, 18)
  })
  source.library.push({
    media: { ...baseMedia, ids: { ...baseMedia.ids } },
    addedAt: Date.UTC(2026, 6, 16),
    lists: [{ service: 'trakt', accountId: 'test-account', kind: 'watchlist' }]
  })

  const enriched = await resolveNuvioMediaBridgeBundle(source, message => logs.push(message), connection)
  assert.equal(source.history[0].media.ids.external, undefined)
  for (const record of [...enriched.history, ...enriched.progress, ...enriched.library]) {
    assert.equal(record.media.ids.external?.kitsu, 99)
  }
  assert.deepEqual(searchedTitles, ['Dragon Ball Z'])
  assert.ok(logs.some(message => message === 'Checking 1 series against enabled Kitsu catalogs...'))
  assert.ok(logs.some(message => message === 'Kitsu identity lookup progress: 1/1.'))

  const scopes = { history: true, progress: true, library: true }
  const mappings = await inspectDestinationMappings(
    connection,
    enriched,
    scopes,
    undefined,
    traktConnection('source')
  )
  assert.ok(metadataTypes.length >= 3)
  assert.ok(metadataTypes.every(type => type === 'anime'))
  assert.equal(mappings.length, 2)
  assert.ok(mappings.every(item => item.mapping.status === 'mapped'))
  assert.ok(mappings.every(item => item.mapping.target?.videoId === 'kitsu:99:1:40'))
  assert.ok(mappings.every(item => item.mapping.target?.absoluteEpisode === 40))
  assert.ok(mappings.every(item => /absolute episode number/.test(item.mapping.reason)))

  const plan = planMediaBridgePreview({
    source: enriched,
    destination: createEmptyBundle(),
    sourceEndpoint: traktConnection('source'),
    destinationEndpoint: connection,
    destinationService: 'nuvio',
    scopes,
    mappingIssues: mappings
  })
  assert.equal(plan.transfer.history[0].media.videoId, 'kitsu:99:1:40')
  assert.equal(plan.transfer.progress[0].media.videoId, 'kitsu:99:1:40')

  const result = await pushMediaBridge({
    connection,
    bundle: plan.transfer,
    scopes
  })

  assert.equal(watchedItems[0].content_id, 'kitsu:99')
  assert.equal(watchedItems[0].season, 1)
  assert.equal(watchedItems[0].episode, 40)
  assert.equal(progressEntries[0].content_id, 'kitsu:99')
  assert.equal(progressEntries[0].video_id, 'kitsu:99:1:40')
  assert.equal(progressEntries[0].progress_key, 'kitsu:99_s1e40')
  assert.equal(libraryItems[0].content_id, 'kitsu:99')
  assert.deepEqual(result.written, { history: 1, progress: 1, library: 1 })
  assert.deepEqual(result.issues, [])
})

test('prefers a complete IMDb episode catalog over a non-empty incomplete Kitsu catalog', async t => {
  const connection = nuvioConnection()
  connection.accountId = 'complete-imdb-catalog-user'
  connection.profileId = 31
  let kitsuMetadataRequests = 0
  let imdbMetadataRequests = 0

  t.mock.method(globalThis, 'fetch', async input => {
    const url = new URL(String(input), 'https://nuvio.wiki')
    if (url.pathname === '/rest/v1/addons') {
      return Response.json([{
        url: 'https://catalog-completeness.test/manifest.json',
        enabled: true,
        sort_order: 1,
        profile_id: 31
      }])
    }
    if (url.hostname === 'catalog-completeness.test' && url.pathname === '/manifest.json') {
      return Response.json({
        id: 'community.catalog.completeness',
        resources: ['meta'],
        types: ['anime', 'series'],
        idPrefixes: ['kitsu', 'tt']
      })
    }
    if (url.hostname === 'kitsu.io' && url.pathname === '/api/edge/anime/45469/media-relationships') {
      assert.equal(url.searchParams.get('include'), 'destination')
      return Response.json({ data: [] })
    }
    if (url.hostname === 'api.trakt.tv' && url.pathname === '/shows/154164/seasons') {
      return Response.json([1, 2].map(season => ({
        number: season,
        episodes: Array.from({ length: 9 }, (_, index) => ({
          number: index + 1,
          number_abs: ((season - 1) * 9) + index + 1,
          title: season === 2 && index === 3
            ? 'Paint the Town Blue'
            : `Trakt S${season}E${index + 1}`,
          ids: { trakt: 12_178_800 + ((season - 1) * 9) + index }
        }))
      })))
    }
    if (url.hostname === 'catalog-completeness.test' && url.pathname.startsWith('/meta/')) {
      const metadataId = decodeURIComponent(url.pathname.split('/').at(-1)!.replace(/\.json$/, ''))
      if (metadataId === 'kitsu:45469') {
        kitsuMetadataRequests++
        return Response.json({
          meta: {
            id: metadataId,
            videos: Array.from({ length: 9 }, (_, index) => ({
              id: `${metadataId}:1:${index + 1}`,
              season: 1,
              episode: index + 1,
              title: `Arcane season one episode ${index + 1}`
            }))
          }
        })
      }
      if (metadataId === 'tt11126994') {
        imdbMetadataRequests++
        return Response.json({
          meta: {
            id: metadataId,
            videos: [1, 2].flatMap(season => Array.from({ length: 9 }, (_, index) => ({
              id: `${metadataId}:${season}:${index + 1}`,
              season,
              episode: index + 1,
              title: season === 2 && index === 3
                ? 'Paint the Town Blue'
                : `IMDb S${season}E${index + 1}`
            })))
          }
        })
      }
      return new Response(null, { status: 404 })
    }
    throw new Error(`Unexpected request: ${url}`)
  })

  const source = createEmptyBundle()
  source.history.push({
    media: {
      kind: 'series',
      ids: {
        imdb: 'tt11126994',
        tmdb: 94605,
        trakt: 154164,
        external: { kitsu: 45469 }
      },
      title: 'Arcane',
      year: 2021,
      season: 2,
      episode: 4,
      absoluteEpisode: 13,
      episodeTitle: 'Paint the Town Blue',
      videoId: 'trakt:12178812'
    },
    watchedAt: Date.UTC(2026, 6, 17),
    playCount: 1
  })

  const mappings = await inspectDestinationMappings(
    connection,
    source,
    { history: true, progress: false, library: false },
    undefined,
    traktConnection('source')
  )

  assert.equal(kitsuMetadataRequests, 1)
  assert.equal(imdbMetadataRequests, 1)
  assert.equal(mappings.length, 1)
  assert.equal(mappings[0].mapping.status, 'mapped')
  assert.equal(mappings[0].mapping.target?.contentId, 'tt11126994')
  assert.equal(mappings[0].mapping.target?.videoId, 'tt11126994:2:4')
  assert.deepEqual(
    mappings[0].mapping.target && [mappings[0].mapping.target.season, mappings[0].mapping.target.episode],
    [2, 4]
  )
})

test('retries a transient Kitsu sequel lookup on the next Nuvio preview', async t => {
  const connection = nuvioConnection()
  connection.accountId = 'retry-kitsu-sequel-user'
  connection.profileId = 33
  let relationshipRequests = 0

  t.mock.method(globalThis, 'fetch', async input => {
    const url = new URL(String(input), 'https://nuvio.wiki')
    if (url.pathname === '/rest/v1/addons') {
      return Response.json([{
        url: 'https://retry-kitsu.test/manifest.json',
        enabled: true,
        sort_order: 1,
        profile_id: 33
      }])
    }
    if (url.hostname === 'retry-kitsu.test' && url.pathname === '/manifest.json') {
      return Response.json({ resources: ['meta'], types: ['anime'], idPrefixes: ['kitsu'] })
    }
    if (url.hostname === 'api.trakt.tv' && url.pathname === '/shows/154164/seasons') {
      return Response.json([1, 2].map((season, index) => ({
        number: season,
        episodes: [{
          number: 1,
          number_abs: index + 1,
          title: index === 0 ? 'Welcome to the Playground' : 'Heavy Is the Crown',
          ids: { trakt: 12_178_700 + index }
        }]
      })))
    }
    if (url.hostname === 'kitsu.io' && url.pathname === '/api/edge/anime/45469/media-relationships') {
      relationshipRequests++
      if (relationshipRequests === 1) {
        return Response.json({ errors: [{ title: 'temporarily unavailable' }] }, { status: 503 })
      }
      return Response.json({
        data: [{
          attributes: { role: 'sequel' },
          relationships: { destination: { data: { type: 'anime', id: '45515' } } }
        }]
      })
    }
    if (url.hostname === 'kitsu.io' && url.pathname === '/api/edge/anime/45515/media-relationships') {
      return Response.json({ data: [] })
    }
    if (url.hostname === 'retry-kitsu.test' && url.pathname.startsWith('/meta/')) {
      const metadataId = decodeURIComponent(url.pathname.split('/').at(-1)!.replace(/\.json$/, ''))
      if (metadataId === 'kitsu:45469' || metadataId === 'kitsu:45515') {
        const title = metadataId === 'kitsu:45469'
          ? 'Welcome to the Playground'
          : 'Heavy Is the Crown'
        return Response.json({
          meta: {
            id: metadataId,
            videos: [{ id: `${metadataId}:1:1`, season: 1, episode: 1, title }]
          }
        })
      }
      return new Response(null, { status: 404 })
    }
    throw new Error(`Unexpected request: ${url}`)
  })

  const source = createEmptyBundle()
  source.history.push({
    media: {
      kind: 'series',
      ids: { imdb: 'tt11126994', trakt: 154164, external: { kitsu: 45469 } },
      title: 'Arcane',
      year: 2021,
      season: 2,
      episode: 1,
      absoluteEpisode: 2,
      episodeTitle: 'Heavy Is the Crown',
      videoId: 'trakt:12178701'
    },
    watchedAt: Date.UTC(2026, 6, 17),
    playCount: 1
  })
  const scopes = { history: true, progress: false, library: false }
  const sourceConnection = traktConnection('source')
  sourceConnection.accountId = 'retry-kitsu-source'

  const first = await inspectDestinationMappings(
    connection,
    source,
    scopes,
    undefined,
    sourceConnection
  )
  assert.equal(first[0].mapping.status, 'unresolved')

  invalidateNuvioMetadataCaches(connection)
  const second = await inspectDestinationMappings(
    connection,
    source,
    scopes,
    undefined,
    sourceConnection
  )

  assert.equal(relationshipRequests, 2)
  assert.equal(second[0].mapping.status, 'mapped')
  assert.equal(second[0].mapping.target?.contentId, 'kitsu:45515')
  assert.equal(second[0].mapping.target?.videoId, 'kitsu:45515:1:1')
})

test('collapses duplicate history events before expensive Nuvio episode mapping', async t => {
  const connection = nuvioConnection()
  connection.accountId = 'duplicate-preflight-user'
  connection.profileId = 32
  const logs: string[] = []
  let metadataRequests = 0

  t.mock.method(globalThis, 'fetch', async input => {
    const url = new URL(String(input), 'https://nuvio.wiki')
    if (url.pathname === '/rest/v1/addons') {
      return Response.json([{
        url: 'https://duplicate-preflight.test/manifest.json',
        enabled: true,
        sort_order: 1,
        profile_id: 32
      }])
    }
    if (url.hostname === 'duplicate-preflight.test' && url.pathname === '/manifest.json') {
      return Response.json({ resources: ['meta'], types: ['series'], idPrefixes: ['tt'] })
    }
    if (url.hostname === 'duplicate-preflight.test' && url.pathname === '/meta/series/tt7654321.json') {
      metadataRequests++
      return Response.json({
        meta: {
          id: 'tt7654321',
          videos: [{ id: 'tt7654321:1:1', season: 1, episode: 1, title: 'The Duplicate' }]
        }
      })
    }
    throw new Error(`Unexpected request: ${url}`)
  })

  const source = createEmptyBundle()
  for (let index = 0; index < 500; index++) {
    source.history.push({
      media: {
        kind: 'series',
        ids: { imdb: 'tt7654321' },
        title: 'Duplicate Show',
        season: 1,
        episode: 1,
        episodeTitle: 'The Duplicate'
      },
      watchedAt: Date.UTC(2026, 6, 17, 0, 0, index),
      playCount: 1,
      eventId: index + 1
    })
  }

  const mappings = await inspectDestinationMappings(
    connection,
    source,
    { history: true, progress: false, library: false },
    message => logs.push(message)
  )

  assert.equal(mappings.length, 1)
  assert.equal(mappings[0].mapping.status, 'mapped')
  assert.equal(metadataRequests, 1)
  assert.ok(logs.some(message => (
    message.includes('Checking 1 unique selected records against nuvio metadata')
    && message.includes('499 duplicate or non-episode records skipped')
  )))
})

test('schedules Nuvio episode metadata by series instead of binge-ordered records', async t => {
  const connection = nuvioConnection()
  connection.accountId = 'series-scheduler-user'
  connection.profileId = 34
  const startedSeries = new Set<string>()
  const logs: string[] = []
  let releaseFirstWave!: () => void
  const firstWaveBarrier = new Promise<void>(resolve => {
    releaseFirstWave = resolve
  })
  let markFirstWaveReady!: () => void
  const firstWaveReady = new Promise<void>(resolve => {
    markFirstWaveReady = resolve
  })

  t.mock.method(globalThis, 'fetch', async input => {
    const url = new URL(String(input), 'https://nuvio.wiki')
    if (url.pathname === '/rest/v1/addons') {
      return Response.json([{
        url: 'https://series-scheduler.test/manifest.json',
        enabled: true,
        sort_order: 1,
        profile_id: 34
      }])
    }
    if (url.hostname === 'series-scheduler.test' && url.pathname === '/manifest.json') {
      return Response.json({ resources: ['meta'], types: ['series'], idPrefixes: ['tt'] })
    }
    if (url.hostname === 'series-scheduler.test' && url.pathname.startsWith('/meta/series/')) {
      const contentId = decodeURIComponent(url.pathname.split('/').at(-1)!.replace(/\.json$/, ''))
      startedSeries.add(contentId)
      if (startedSeries.size === 6) markFirstWaveReady()
      await firstWaveBarrier
      return Response.json({
        meta: {
          id: contentId,
          videos: Array.from({ length: 10 }, (_, index) => ({
            id: `${contentId}:1:${index + 1}`,
            season: 1,
            episode: index + 1,
            title: `Episode ${index + 1}`
          }))
        }
      })
    }
    throw new Error(`Unexpected request: ${url}`)
  })

  const source = createEmptyBundle()
  for (let seriesIndex = 0; seriesIndex < 7; seriesIndex++) {
    const contentId = `tt900000${seriesIndex}`
    for (let episodeIndex = 0; episodeIndex < 10; episodeIndex++) {
      source.history.push({
        media: {
          kind: 'series',
          ids: { imdb: contentId },
          title: `Scheduler Show ${seriesIndex + 1}`,
          season: 1,
          episode: episodeIndex + 1,
          episodeTitle: `Episode ${episodeIndex + 1}`
        },
        watchedAt: Date.UTC(2026, 7, 1, seriesIndex, episodeIndex),
        playCount: 1
      })
    }
  }

  const pendingMappings = inspectDestinationMappings(
    connection,
    source,
    { history: true, progress: false, library: false },
    message => logs.push(message)
  )
  let firstWaveTimeout: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      firstWaveReady,
      new Promise<void>((_resolve, reject) => {
        firstWaveTimeout = setTimeout(
          () => reject(new Error('Six distinct series were not scheduled concurrently.')),
          1_000
        )
      })
    ])
  } finally {
    if (firstWaveTimeout) clearTimeout(firstWaveTimeout)
  }

  assert.equal(startedSeries.size, 6)
  releaseFirstWave()
  const mappings = await pendingMappings

  assert.equal(startedSeries.size, 7)
  assert.equal(mappings.length, 70)
  assert.ok(mappings.every(item => item.mapping.status === 'mapped'))
  assert.ok(logs.some(message => (
    message.includes('Checking 70 unique selected records against nuvio metadata across 7 series')
  )))
  assert.ok(logs.some(message => (
    message.includes('nuvio metadata mapping progress: 7/7 series; 70/70 records checked')
  )))
})

test('does not delete alternate Nuvio IDs at remapped episode coordinates', async t => {
  const requestedRpcs: string[] = []
  let watchedItems: any[] = []
  let progressEntries: any[] = []
  t.mock.method(globalThis, 'fetch', async (input, init) => {
    const url = new URL(String(input), 'https://nuvio.wiki')
    const body = JSON.parse(String(init?.body || '{}'))
    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      requestedRpcs.push(url.pathname)
      if (url.pathname === '/rest/v1/rpc/sync_push_watched_items') watchedItems = body.p_items
      if (url.pathname === '/rest/v1/rpc/sync_push_watch_progress') progressEntries = body.p_entries
      return Response.json(null)
    }
    throw new Error(`Unexpected request: ${url}`)
  })

  const mappedMedia = {
    kind: 'series' as const,
    ids: {
      imdb: 'tt11126994',
      tmdb: 94605,
      external: { kitsu: 45469 }
    },
    title: 'Arcane',
    year: 2021,
    season: 1,
    episode: 1,
    absoluteEpisode: 10,
    episodeTitle: 'Heavy Is the Crown',
    videoId: 'kitsu:45515:1:1',
    destinationContentId: 'kitsu:45515',
    destinationEpisodeRemapped: true
  }
  const bundle = createEmptyBundle()
  bundle.history.push({
    media: { ...mappedMedia, ids: { ...mappedMedia.ids, external: { ...mappedMedia.ids.external } } },
    watchedAt: Date.UTC(2026, 6, 17),
    playCount: 1
  })
  bundle.progress.push({
    media: { ...mappedMedia, ids: { ...mappedMedia.ids, external: { ...mappedMedia.ids.external } } },
    positionMs: 600_000,
    durationMs: 2_400_000,
    updatedAt: Date.UTC(2026, 6, 18)
  })

  const result = await pushMediaBridge({
    connection: nuvioConnection(),
    bundle,
    scopes: { history: true, progress: true, library: false }
  })

  assert.equal(requestedRpcs.includes('/rest/v1/rpc/sync_delete_watched_items'), false)
  assert.equal(requestedRpcs.includes('/rest/v1/rpc/sync_delete_watch_progress'), false)
  assert.equal(watchedItems[0].content_id, 'kitsu:45515')
  assert.equal(watchedItems[0].season, 1)
  assert.equal(watchedItems[0].episode, 1)
  assert.equal(progressEntries[0].content_id, 'kitsu:45515')
  assert.equal(progressEntries[0].video_id, 'kitsu:45515:1:1')
  assert.deepEqual(result.written, { history: 1, progress: 1, library: 0 })
  assert.deepEqual(result.confirmedScopes, ['history', 'progress'])
  assert.deepEqual(result.issues, [])
})

test('maps combined Trakt seasons across related Kitsu installments and writes the owning Kitsu ID', async t => {
  const connection = nuvioConnection()
  connection.accountId = 'split-kitsu-user'
  connection.profileId = 8
  let watchedItems: any[] = []

  t.mock.method(globalThis, 'fetch', async (input, init) => {
    const url = new URL(String(input), 'https://nuvio.wiki')
    const body = JSON.parse(String(init?.body || '{}'))
    if (url.pathname === '/rest/v1/addons') {
      return Response.json([{
        url: 'https://split-kitsu.test/manifest.json',
        enabled: true,
        sort_order: 1,
        profile_id: 8
      }])
    }
    if (url.hostname === 'split-kitsu.test' && url.pathname === '/manifest.json') {
      return Response.json({
        id: 'community.split.kitsu',
        resources: ['meta'],
        types: ['anime'],
        idPrefixes: ['kitsu']
      })
    }
    if (url.hostname === 'kitsu.io' && url.pathname.endsWith('/media-relationships')) {
      assert.equal(url.searchParams.get('include'), 'destination')
      assert.equal(url.searchParams.get('page[limit]'), '20')
      const kitsuId = url.pathname.split('/').at(-2)
      return Response.json({
        data: kitsuId === '45469'
          ? [{
              attributes: { role: 'sequel' },
              relationships: {
                destination: { data: { type: 'anime', id: '45515' } }
              }
            }]
          : []
      })
    }
    if (url.hostname === 'split-kitsu.test' && url.pathname.startsWith('/meta/')) {
      const metadataId = decodeURIComponent(url.pathname.split('/').at(-1)!.replace(/\.json$/, ''))
      const installment = metadataId === 'kitsu:45469'
        ? { id: '45469', prefix: 'Season one' }
        : metadataId === 'kitsu:45515'
          ? { id: '45515', prefix: 'Season two' }
          : null
      if (!installment) return new Response(null, { status: 404 })
      return Response.json({
        meta: {
          id: `kitsu:${installment.id}`,
          videos: Array.from({ length: 9 }, (_, index) => ({
            id: `kitsu:${installment.id}:1:${index + 1}`,
            season: 1,
            episode: index + 1,
            title: installment.id === '45515' && index === 0
              ? 'Heavy Is the Crown'
              : `${installment.prefix} episode ${index + 1}`
          }))
        }
      })
    }
    if (url.hostname === 'api.trakt.tv' && url.pathname === '/shows/154164/seasons') {
      return Response.json([
        {
          number: 1,
          episodes: Array.from({ length: 9 }, (_, index) => ({
            number: index + 1,
            number_abs: index + 1,
            title: `Trakt season one episode ${index + 1}`,
            ids: { trakt: 12_178_700 + index }
          }))
        },
        {
          number: 2,
          episodes: Array.from({ length: 9 }, (_, index) => ({
            number: index + 1,
            number_abs: index + 10,
            title: index === 0 ? 'Heavy Is the Crown' : `Trakt season two episode ${index + 1}`,
            ids: { trakt: 12_178_826 + index }
          }))
        }
      ])
    }
    if (url.pathname === '/rest/v1/rpc/sync_delete_watched_items') {
      return Response.json(null)
    }
    if (url.pathname === '/rest/v1/rpc/sync_push_watched_items') {
      watchedItems = body.p_items
      return Response.json(null)
    }
    throw new Error(`Unexpected request: ${url}`)
  })

  const source = createEmptyBundle()
  source.history.push({
    media: {
      kind: 'series',
      ids: {
        imdb: 'tt11126994',
        tmdb: 94605,
        tvdb: 371028,
        trakt: 154164,
        external: { kitsu: 45469 }
      },
      title: 'Arcane',
      year: 2021,
      season: 2,
      episode: 1,
      absoluteEpisode: 10,
      episodeTitle: 'Heavy Is the Crown',
      videoId: 'trakt:12178826'
    },
    watchedAt: Date.UTC(2026, 6, 17),
    playCount: 1
  })

  const scopes = { history: true, progress: false, library: false }
  const mappings = await inspectDestinationMappings(
    connection,
    source,
    scopes,
    undefined,
    traktConnection('source')
  )
  assert.equal(mappings[0].mapping.status, 'mapped')
  assert.equal(mappings[0].mapping.target?.videoId, 'kitsu:45515:1:1')
  assert.equal(mappings[0].mapping.target?.contentId, 'kitsu:45515')

  const plan = planMediaBridgePreview({
    source,
    destination: createEmptyBundle(),
    sourceEndpoint: traktConnection('source'),
    destinationEndpoint: connection,
    destinationService: 'nuvio',
    scopes,
    mappingIssues: mappings
  })
  assert.equal(plan.transfer.history[0].media.destinationContentId, 'kitsu:45515')
  assert.equal(plan.transfer.history[0].media.season, 1)
  assert.equal(plan.transfer.history[0].media.episode, 1)

  const result = await pushMediaBridge({
    connection,
    bundle: plan.transfer,
    scopes
  })
  assert.equal(watchedItems[0].content_id, 'kitsu:45515')
  assert.equal(watchedItems[0].season, 1)
  assert.equal(watchedItems[0].episode, 1)
  assert.deepEqual(result.written, { history: 1, progress: 0, library: 0 })
  assert.deepEqual(result.issues, [])
})

test('decodes native Stremio Kitsu history with its installed addon episode order', async t => {
  const connection = stremioConnection()
  connection.slot = 'source'
  connection.accountId = 'stremio-kitsu-user'
  const videoIds = ['kitsu:99:1:39', 'kitsu:99:1:40']
  const watched = await encodeStremioWatchedField([false, true], videoIds)
  let cinemetaRequests = 0
  let addonMetaRequests = 0

  t.mock.method(globalThis, 'fetch', async (input, init) => {
    const url = new URL(String(input), 'https://nuvio.wiki')
    const body = JSON.parse(String(init?.body || '{}'))
    if (url.pathname === '/api/trakt/enrich-metadata') {
      return Response.json({
        results: body.items.map((item: any) => ({
          content_id: item.content_id,
          imdbId: 'tt0214341'
        }))
      })
    }
    if (url.hostname === 'api.strem.io' && url.pathname === '/api/datastoreGet') {
      return Response.json({
        result: [{
          _id: 'kitsu:99',
          _ctime: '2026-07-01T00:00:00Z',
          _mtime: '2026-07-18T00:00:00Z',
          name: 'Dragon Ball Z',
          type: 'series',
          removed: false,
          temp: false,
          state: {
            watched,
            lastWatched: '2026-07-18T00:00:00Z',
            timeOffset: 600_000,
            duration: 1_440_000,
            video_id: 'kitsu:99:1:40'
          }
        }]
      })
    }
    if (url.hostname === 'api.strem.io' && url.pathname === '/api/addonCollectionGet') {
      assert.equal(body.update, false)
      return Response.json({
        result: {
          addons: [{
            transportUrl: 'https://source-kitsu.test/private/manifest.json?token=Secret',
            manifest: {
              id: 'community.anime.kitsu',
              resources: [{ name: 'meta', types: ['anime'], idPrefixes: ['kitsu'] }],
              types: ['anime'],
              idPrefixes: ['kitsu']
            }
          }]
        }
      })
    }
    if (url.hostname === 'source-kitsu.test') {
      addonMetaRequests++
      assert.equal(url.pathname, '/private/meta/anime/kitsu%3A99.json')
      assert.equal(url.searchParams.get('token'), 'Secret')
      return Response.json({
        meta: {
          id: 'kitsu:99',
          name: 'Dragon Ball Z',
          videos: [
            { id: videoIds[0], season: 1, episode: 39, title: 'The New Namek' },
            { id: videoIds[1], season: 1, episode: 40, title: 'Gohan’s Hidden Powers' }
          ]
        }
      })
    }
    if (url.hostname === 'v3-cinemeta.strem.io') {
      cinemetaRequests++
      return new Response(null, { status: 404 })
    }
    throw new Error(`Unexpected request: ${url}`)
  })

  const result = await pullMediaBridge({
    connection,
    scopes: { history: true, progress: true, library: true }
  })

  assert.equal(cinemetaRequests, 0)
  assert.equal(addonMetaRequests, 1)
  assert.equal(result.bundle.history.length, 1)
  assert.equal(result.bundle.history[0].media.season, 1)
  assert.equal(result.bundle.history[0].media.episode, 40)
  assert.equal(result.bundle.history[0].media.videoId, 'kitsu:99:1:40')
  assert.equal(result.bundle.progress.length, 1)
  assert.equal(result.bundle.progress[0].media.videoId, 'kitsu:99:1:40')
  assert.equal(result.bundle.library[0].media.ids.external?.kitsu, 99)
  assert.deepEqual(result.issues, [])
})

test('counts every item rejected by the Nuvio writer', async () => {
  const bundle = createEmptyBundle()
  bundle.history.push({
    media: {
      kind: 'movie',
      ids: {},
      title: 'Missing ID'
    },
    watchedAt: Date.UTC(2026, 6, 17),
    playCount: 1
  })
  const result = await pushMediaBridge({
    connection: nuvioConnection(),
    bundle,
    scopes: { history: true, progress: false, library: false }
  })

  assert.equal(result.written.history, 0)
  assert.equal(result.skipped?.history, 1)
  assert.equal(result.issues.length, 1)
  assert.match(result.issues[0].reason, /supported content ID/)
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

test('imports Simkl resume points sequentially without a shared 30-second cutoff', async t => {
  const timeoutMock = t.mock.method(AbortSignal, 'timeout', () => {
    throw new Error('Simkl progress must not create a shared AbortSignal timeout.')
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

  assert.equal(timeoutMock.mock.callCount(), 0)
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

test('continues Simkl progress after an individual resume point is rejected', async t => {
  let requestCount = 0
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => {
    requestCount++
    if (requestCount === 1) {
      return new Response(JSON.stringify({ message: 'Invalid progress record.' }), {
        status: 422,
        statusText: 'Unprocessable Content',
        headers: { 'Content-Type': 'application/json' }
      })
    }
    return new Response(JSON.stringify({ action: 'pause' }), {
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
    connection: simklConnection(),
    bundle,
    scopes: { history: false, progress: true, library: false }
  })

  assert.equal(fetchMock.mock.callCount(), 2)
  assert.equal(result.written.progress, 1)
  assert.equal(result.skipped?.progress, 1)
  assert.equal(result.issues.length, 1)
  assert.equal(result.issues[0].status, 'unresolved')
  assert.equal(result.issues[0].media?.ids.imdb, 'tt2015381')
  assert.match(result.issues[0].reason, /Invalid progress record/)
})

test('converts percentage-only progress to Stremio elapsed time using metadata runtime', async t => {
  let changes: any[] = []
  t.mock.method(globalThis, 'fetch', async (input, init) => {
    const url = new URL(String(input), 'https://nuvio.wiki')
    const body = init?.body ? JSON.parse(String(init.body)) : {}
    if (url.pathname === '/api/datastoreGet') {
      return Response.json({ result: [] })
    }
    if (url.pathname === '/api/trakt/enrich-metadata') {
      return Response.json({
        results: body.items.map((item: any) => ({
          content_id: item.content_id,
          imdbId: item._ids.imdb,
          runtimeMs: 5_400_000,
          source: 'cinemeta'
        }))
      })
    }
    if (url.pathname === '/meta/movie/tt7654321.json') {
      return Response.json({ meta: { id: 'tt7654321', name: 'Runtime conversion' } })
    }
    if (url.pathname === '/api/datastorePut') {
      changes = body.changes
      return Response.json({ result: { success: true } })
    }
    throw new Error(`Unexpected request: ${url.pathname}`)
  })

  const bundle = createEmptyBundle()
  bundle.progress.push({
    media: {
      kind: 'movie',
      ids: { imdb: 'tt7654321' },
      title: 'Runtime conversion'
    },
    percentage: 40,
    updatedAt: Date.UTC(2026, 6, 17)
  })
  const result = await pushMediaBridge({
    connection: stremioConnection(),
    bundle,
    scopes: { history: false, progress: true, library: false }
  })

  assert.equal(changes.length, 1)
  assert.equal(changes[0].state.timeOffset, 2_160_000)
  assert.equal(changes[0].state.duration, 5_400_000)
  assert.equal(result.written.progress, 1)
  assert.deepEqual(result.issues, [])
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

test('keeps an existing Stremio TMDB key instead of creating an IMDb duplicate', async t => {
  let changes: any[] = []
  t.mock.method(globalThis, 'fetch', async (input, init) => {
    const url = new URL(String(input), 'https://nuvio.wiki')
    const body = init?.body ? JSON.parse(String(init.body)) : {}
    if (url.pathname === '/api/datastoreGet') {
      return Response.json({
        result: [{
          _id: 'tmdb:118340',
          type: 'movie',
          name: 'Guardians of the Galaxy',
          removed: false,
          temp: false,
          state: {}
        }]
      })
    }
    if (url.pathname === '/api/trakt/enrich-metadata') {
      return Response.json({
        results: body.items.map((item: any) => ({
          content_id: item.content_id,
          tmdbId: '118340',
          imdbId: 'tt2015381',
          source: 'tmdb'
        }))
      })
    }
    if (url.pathname === '/meta/movie/tt2015381.json') {
      return Response.json({ meta: { id: 'tt2015381', name: 'Guardians of the Galaxy' } })
    }
    if (url.pathname === '/api/datastorePut') {
      changes = body.changes
      return Response.json({ result: { success: true } })
    }
    throw new Error(`Unexpected request: ${url.pathname}`)
  })

  const bundle = createEmptyBundle()
  bundle.library.push({
    media: {
      kind: 'movie',
      ids: { imdb: 'tt2015381', tmdb: 118340 },
      title: 'Guardians of the Galaxy'
    },
    addedAt: Date.UTC(2026, 6, 17),
    lists: [{ service: 'trakt', kind: 'watchlist' }]
  })

  await pushMediaBridge({
    connection: stremioConnection(),
    bundle,
    scopes: { history: false, progress: false, library: true }
  })

  assert.equal(changes.length, 1)
  assert.equal(changes[0]._id, 'tmdb:118340')
  assert.equal(changes.some(item => item._id === 'tt2015381'), false)
})

test('writes native Kitsu anime as flat Simkl history and anime playback', async t => {
  const requests: Array<{ path: string; body: any }> = []
  t.mock.method(globalThis, 'fetch', async (input, init) => {
    const path = new URL(String(input)).pathname
    requests.push({ path, body: JSON.parse(String(init?.body || '{}')) })
    if (path === '/sync/history') return Response.json({})
    if (path === '/scrobble/pause') {
      return new Response(JSON.stringify({ action: 'pause' }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' }
      })
    }
    throw new Error(`Unexpected Simkl request: ${path}`)
  })

  const animeMedia = {
    kind: 'series' as const,
    ids: {
      imdb: 'tt0214341',
      simkl: 123456,
      external: { kitsu: 99, mal: 813 }
    },
    title: 'Dragon Ball Z',
    year: 1989,
    season: 1,
    episode: 40,
    absoluteEpisode: 40,
    videoId: 'kitsu:99:40'
  }
  const bundle = createEmptyBundle()
  bundle.history.push({
    media: { ...animeMedia, ids: { ...animeMedia.ids } },
    watchedAt: Date.UTC(2026, 6, 17),
    playCount: 1
  })
  bundle.progress.push({
    media: { ...animeMedia, ids: { ...animeMedia.ids } },
    percentage: 37.5,
    updatedAt: Date.UTC(2026, 6, 18)
  })

  const result = await pushMediaBridge({
    connection: simklConnection(),
    bundle,
    scopes: { history: true, progress: true, library: false }
  })

  const historyBody = requests.find(request => request.path === '/sync/history')?.body
  assert.equal(historyBody.shows.length, 1)
  assert.deepEqual(historyBody.shows[0].ids, { kitsu: 99 })
  assert.equal(historyBody.shows[0].seasons, undefined)
  assert.deepEqual(historyBody.shows[0].episodes, [{
    number: 40,
    watched_at: '2026-07-17T00:00:00.000Z'
  }])

  const progressBody = requests.find(request => request.path === '/scrobble/pause')?.body
  assert.deepEqual(progressBody.anime.ids, { kitsu: 99 })
  assert.equal(progressBody.show, undefined)
  assert.deepEqual(progressBody.episode, { number: 40 })
  assert.equal(progressBody.progress, 37.5)
  assert.equal(result.written.history, 1)
  assert.equal(result.written.progress, 1)
  assert.deepEqual(result.issues, [])
})

test('writes TV-style anime with parent IDs and Simkl TVDB season mapping enabled', async t => {
  let requestBody: any = null
  t.mock.method(globalThis, 'fetch', async (_input, init) => {
    requestBody = JSON.parse(String(init?.body || '{}'))
    return Response.json({})
  })
  const bundle = createEmptyBundle()
  bundle.history.push({
    media: {
      kind: 'series',
      ids: {
        imdb: 'tt0214341',
        tvdb: 81472,
        simkl: 123456,
        external: { kitsu: 99, mal: 813, anilist: 813 }
      },
      title: 'Dragon Ball Z',
      year: 1989,
      season: 2,
      episode: 3,
      videoId: 'tt0214341:2:3'
    },
    watchedAt: Date.UTC(2026, 6, 17),
    playCount: 1
  })

  const result = await pushMediaBridge({
    connection: simklConnection(),
    bundle,
    scopes: { history: true, progress: false, library: false }
  })

  assert.equal(requestBody.shows.length, 1)
  assert.deepEqual(requestBody.shows[0].ids, { imdb: 'tt0214341', tvdb: 81472 })
  assert.equal(requestBody.shows[0].use_tvdb_anime_seasons, true)
  assert.deepEqual(requestBody.shows[0].seasons, [{
    number: 2,
    episodes: [{ number: 3, watched_at: '2026-07-17T00:00:00.000Z' }]
  }])
  assert.equal(result.written.history, 1)
  assert.deepEqual(result.issues, [])
})

test('writes a series-level completed marker to Simkl without inventing an episode', async t => {
  let requestBody: any = null
  t.mock.method(globalThis, 'fetch', async (_input, init) => {
    requestBody = JSON.parse(String(init?.body || '{}'))
    return Response.json({})
  })
  const bundle = createEmptyBundle()
  bundle.history.push({
    media: {
      kind: 'series',
      ids: { imdb: 'tt0944947' },
      title: 'Game of Thrones',
      year: 2011
    },
    watchedAt: Date.UTC(2026, 6, 17),
    playCount: 1
  })

  const result = await pushMediaBridge({
    connection: simklConnection(),
    bundle,
    scopes: { history: true, progress: false, library: false }
  })

  assert.equal(requestBody.shows.length, 1)
  assert.deepEqual(requestBody.shows[0], {
    title: 'Game of Thrones',
    year: 2011,
    ids: { imdb: 'tt0944947' },
    watched_at: '2026-07-17T00:00:00.000Z',
    status: 'completed'
  })
  assert.equal(result.written.history, 1)
  assert.deepEqual(result.issues, [])
})

test('uses title and year when Simkl writes have no supported IDs', async t => {
  const requests: Array<{ path: string; body: any }> = []
  t.mock.method(globalThis, 'fetch', async (input, init) => {
    const path = new URL(String(input)).pathname
    requests.push({ path, body: JSON.parse(String(init?.body || '{}')) })
    if (path === '/scrobble/pause') {
      return new Response(JSON.stringify({ action: 'pause' }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' }
      })
    }
    return Response.json({})
  })
  const bundle = createEmptyBundle()
  bundle.history.push({
    media: { kind: 'movie', ids: {}, title: 'Title-only History', year: 2022 },
    watchedAt: Date.UTC(2026, 6, 17),
    playCount: 1
  })
  bundle.library.push({
    media: { kind: 'series', ids: {}, title: 'Title-only Library', year: 2023 },
    addedAt: Date.UTC(2026, 6, 17),
    lists: [{ service: 'nuvio', kind: 'library' }]
  })
  bundle.progress.push({
    media: { kind: 'movie', ids: {}, title: 'Title-only Progress', year: 2024 },
    percentage: 25,
    updatedAt: Date.UTC(2026, 6, 17)
  })

  const result = await pushMediaBridge({
    connection: simklConnection(),
    bundle,
    scopes: { history: true, progress: true, library: true }
  })

  const historyMovie = requests.find(request => request.path === '/sync/history')?.body.movies[0]
  assert.deepEqual(historyMovie, {
    title: 'Title-only History',
    year: 2022,
    watched_at: '2026-07-17T00:00:00.000Z'
  })
  const libraryShow = requests.find(request => request.path === '/sync/add-to-list')?.body.shows[0]
  assert.deepEqual(libraryShow, {
    title: 'Title-only Library',
    year: 2023,
    to: 'plantowatch'
  })
  const progressMovie = requests.find(request => request.path === '/scrobble/pause')?.body.movie
  assert.deepEqual(progressMovie, { title: 'Title-only Progress', year: 2024 })
  assert.deepEqual(result.written, { history: 1, progress: 1, library: 1 })
  assert.deepEqual(result.issues, [])
})

test('does not overwrite Simkl history status with an overlapping Plan to Watch write', async t => {
  const requestedPaths: string[] = []
  t.mock.method(globalThis, 'fetch', async (input, init) => {
    const url = new URL(String(input))
    requestedPaths.push(url.pathname)
    if (url.pathname !== '/sync/history') {
      throw new Error(`Unexpected Simkl status overwrite request: ${url.pathname}`)
    }
    const body = JSON.parse(String(init?.body || '{}'))
    return Response.json({
      added: {
        movies: 1,
        shows: 0,
        episodes: 0,
        statuses: [{
          request: body.movies[0],
          response: { status: 'completed', simkl_type: 'movie', anime_type: null }
        }]
      },
      not_found: { movies: [], shows: [], episodes: [] }
    })
  })
  const bundle = createEmptyBundle()
  const media = {
    kind: 'movie' as const,
    ids: { imdb: 'tt7654401' },
    title: 'History Wins',
    year: 2024
  }
  bundle.history.push({
    media: { ...media, ids: { ...media.ids } },
    watchedAt: Date.UTC(2026, 6, 17),
    playCount: 1
  })
  bundle.library.push({
    media: { ...media, ids: { ...media.ids } },
    addedAt: Date.UTC(2026, 6, 16),
    lists: [{ service: 'nuvio', kind: 'library' }]
  })

  const result = await pushMediaBridge({
    connection: simklConnection(),
    bundle,
    scopes: { history: true, progress: false, library: true }
  })

  assert.deepEqual(requestedPaths, ['/sync/history'])
  assert.deepEqual(result.written, { history: 1, progress: 0, library: 1 })
  assert.deepEqual(result.confirmedScopes, ['history', 'library'])
  assert.deepEqual(result.issues, [])
})

test('collapses replay events for Simkl watched state and confirms an accepted no-op', async t => {
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
  bundle.history.push(
    movieHistory('Already Watched', 'tt2015381', Date.UTC(2026, 6, 16)),
    movieHistory('Already Watched', 'tt2015381', Date.UTC(2026, 6, 17))
  )
  bundle.history.forEach(record => {
    record.media.ids.slug = 'provider-generated-slug'
  })

  const result = await pushMediaBridge({
    connection: simklConnection(),
    bundle,
    scopes: { history: true, progress: false, library: false }
  })

  assert.equal(fetchMock.mock.callCount(), 1)
  assert.equal(requestBody.movies.length, 1)
  assert.equal(requestBody.movies[0].watched_at, '2026-07-17T00:00:00.000Z')
  assert.equal(requestBody.movies[0].ids.traktslug, 'provider-generated-slug')
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
    assert.ok([
      '/sync/all-items/movies',
      '/sync/all-items/shows',
      '/sync/all-items/anime'
    ].includes(url.pathname))
    assert.equal(url.searchParams.get('date_from'), '2026-07-17T11:00:00Z')
    assert.equal(url.searchParams.get('extended'), 'full_anime_seasons')
    return url.pathname.endsWith('/movies')
      ? Response.json([{
        movie: { title: 'Changed', year: 2024, ids: { imdb: 'tt2015382' } },
        status: 'completed',
        last_watched_at: '2026-07-17T11:30:00Z'
      }])
      : Response.json([])
  })
  const baseline = createEmptyBundle()
  baseline.history.push(movieHistory('Existing', 'tt2015381', Date.UTC(2026, 6, 16)))

  const result = await pullMediaBridgeForVerification({
    connection: simklConnection(),
    baseline,
    checkpoint: { simklActivity: '2026-07-17T11:00:00Z' },
    scopes: { history: true, progress: false, library: false }
  })

  assert.equal(fetchMock.mock.callCount(), 4)
  assert.equal(result.bundle.history.length, 2)
  assert.deepEqual(result.bundle.history.map(record => record.media.title).sort(), ['Changed', 'Existing'])
  assert.ok(requests.slice(1).every(request => /date_from=2026-07-17T11%3A00%3A00Z/.test(request)))
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

test('serializes Simkl reads and imports the full TVDB episode projection', async t => {
  let activeRequests = 0
  let maximumActiveRequests = 0
  const requestedUrls: URL[] = []
  const fetchMock = t.mock.method(globalThis, 'fetch', async input => {
    const url = new URL(String(input))
    requestedUrls.push(url)
    activeRequests++
    maximumActiveRequests = Math.max(maximumActiveRequests, activeRequests)
    await new Promise(resolve => setTimeout(resolve, 10))
    activeRequests--
    if (url.pathname === '/sync/all-items/shows') {
      return Response.json([{
        show: {
          title: 'Mapped Show',
          year: 2024,
          poster: '36/36842f1bceb6b39',
          ids: { imdb: 'tt7654321', tvdb: 12345 }
        },
        status: 'watching',
        seasons: [{
          number: 1,
          episodes: [{
            number: 26,
            watched: true,
            watched_at: '2026-07-17T12:00:00Z',
            tvdb: { season: 2, episode: 3 }
          }]
        }]
      }])
    }
    return Response.json([])
  })
  const connection = simklConnection()
  connection.slot = 'source'

  const result = await pullMediaBridge({
    connection,
    scopes: { history: true, progress: true, library: true }
  })

  assert.equal(fetchMock.mock.callCount(), 4)
  assert.equal(maximumActiveRequests, 1)
  assert.deepEqual(new Set(requestedUrls.map(url => url.pathname)), new Set([
    '/sync/all-items/movies',
    '/sync/all-items/shows',
    '/sync/all-items/anime',
    '/sync/playback'
  ]))
  for (const url of requestedUrls.filter(url => url.pathname.startsWith('/sync/all-items/'))) {
    assert.equal(url.searchParams.get('extended'), 'full_anime_seasons')
    assert.equal(url.searchParams.get('episode_watched_at'), 'yes')
    assert.equal(url.searchParams.get('episode_tvdb_id'), 'yes')
    assert.equal(url.searchParams.get('include_all_episodes'), 'yes')
    assert.equal(url.searchParams.get('language'), 'en')
  }
  assert.equal(result.bundle.history.length, 1)
  assert.equal(result.bundle.history[0].media.season, 2)
  assert.equal(result.bundle.history[0].media.episode, 3)
  assert.equal(result.bundle.history[0].media.absoluteEpisode, 26)
  assert.equal(result.bundle.library.length, 1)
  assert.equal(
    result.bundle.library[0].posterUrl,
    'https://wsrv.nl/?url=https://simkl.in/posters/36/36842f1bceb6b39_m.webp&q=90'
  )
})

test('maps Nuvio TVDB coordinates through the cached Simkl native anime catalog', async t => {
  const destination = simklConnection()
  destination.accountId = 'simkl-native-target-cache'
  t.mock.method(globalThis, 'fetch', async input => {
    const url = new URL(String(input))
    if (url.pathname === '/sync/all-items/movies') return Response.json([])
    if (url.pathname === '/sync/all-items/shows') {
      return Response.json([{
        show: {
          title: 'Mapped Anime',
          year: 2024,
          ids: { imdb: 'tt7654399', tvdb: 7654399 }
        },
        status: 'watching',
        seasons: []
      }])
    }
    if (url.pathname === '/sync/all-items/anime') {
      return Response.json([{
        anime: {
          title: 'Mapped Anime',
          year: 2024,
          ids: { imdb: 'tt7654399', tvdb: 7654399, kitsu: 99001 }
        },
        status: 'watching',
        seasons: [{
          number: 1,
          episodes: [{
            number: 26,
            title: 'Native episode 26',
            tvdb: { season: 2, episode: 3 }
          }]
        }]
      }])
    }
    throw new Error(`Unexpected Simkl request: ${url}`)
  })

  const pulled = await pullMediaBridge({
    connection: destination,
    scopes: { history: true, progress: false, library: true }
  })
  assert.equal(pulled.bundle.library[0].media.ids.external?.kitsu, 99001)
  const source = createEmptyBundle()
  source.history.push({
    media: {
      kind: 'series',
      ids: { imdb: 'tt7654399', tvdb: 7654399 },
      title: 'Mapped Anime',
      year: 2024,
      season: 2,
      episode: 3,
      absoluteEpisode: 26,
      videoId: 'tt7654399:2:3'
    },
    watchedAt: Date.UTC(2026, 6, 17),
    playCount: 1
  })

  const mappings = await inspectDestinationMappings(
    destination,
    source,
    { history: true, progress: false, library: false }
  )

  assert.equal(mappings.length, 1)
  assert.equal(mappings[0].mapping.status, 'mapped')
  assert.equal(mappings[0].mapping.target?.season, 2)
  assert.equal(mappings[0].mapping.target?.episode, 3)
  assert.equal(mappings[0].mapping.target?.absoluteEpisode, 26)
  assert.equal(mappings[0].mapping.target?.title, 'Native episode 26')
  assert.equal(mappings[0].mapping.target?.videoId, 'tt7654399:2:3')
  assert.equal(mappings[0].mapping.target?.contentId, undefined)

  const nativeSource = createEmptyBundle()
  nativeSource.history.push({
    media: {
      ...source.history[0].media,
      ids: {
        ...source.history[0].media.ids,
        external: { kitsu: 99001 }
      },
      videoId: 'kitsu:99001:26'
    },
    watchedAt: Date.UTC(2026, 6, 17),
    playCount: 1
  })
  const nativeMappings = await inspectDestinationMappings(
    destination,
    nativeSource,
    { history: true, progress: false, library: false }
  )
  assert.equal(nativeMappings[0].mapping.status, 'mapped')
  assert.equal(nativeMappings[0].mapping.target?.videoId, 'kitsu:99001:26')
  assert.equal(nativeMappings[0].mapping.target?.contentId, 'kitsu:99001')
})

test('uses the cached Simkl source sequence when mapping split anime to Nuvio', async t => {
  const sourceConnection = simklConnection()
  sourceConnection.slot = 'source'
  sourceConnection.accountId = 'simkl-native-source-cache'
  const destination = nuvioConnection()
  destination.accountId = 'simkl-to-nuvio-sequence-user'
  destination.profileId = 44

  t.mock.method(globalThis, 'fetch', async input => {
    const url = new URL(String(input), 'https://nuvio.wiki')
    if (url.hostname === 'api.simkl.com') {
      if (url.pathname === '/sync/all-items/movies' || url.pathname === '/sync/all-items/shows') {
        return Response.json([])
      }
      if (url.pathname === '/sync/all-items/anime') {
        return Response.json([{
          anime: {
            title: 'Sequence Anime',
            year: 2024,
            ids: { imdb: 'tt7654400', kitsu: 99002 }
          },
          status: 'watching',
          seasons: [{
            number: 1,
            episodes: Array.from({ length: 3 }, (_, index) => ({
              number: 26 + index,
              title: `Simkl source episode ${26 + index}`,
              tvdb: { season: 2, episode: index + 1 },
              ...(index === 2 ? { watched_at: '2026-07-17T12:00:00Z' } : {})
            }))
          }]
        }])
      }
    }
    if (url.pathname === '/rest/v1/addons') {
      return Response.json([{
        url: 'https://simkl-sequence-meta.test/manifest.json',
        enabled: true,
        sort_order: 1,
        profile_id: 44
      }])
    }
    if (url.hostname === 'simkl-sequence-meta.test' && url.pathname === '/manifest.json') {
      return Response.json({
        id: 'community.simkl.sequence',
        resources: ['meta'],
        types: ['anime'],
        idPrefixes: ['kitsu']
      })
    }
    if (url.hostname === 'simkl-sequence-meta.test' && url.pathname.startsWith('/meta/')) {
      const contentId = decodeURIComponent(url.pathname.split('/').at(-1)!.replace(/\.json$/, ''))
      if (contentId !== 'kitsu:99002') return new Response(null, { status: 404 })
      return Response.json({
        meta: {
          id: contentId,
          videos: Array.from({ length: 3 }, (_, index) => ({
            id: `${contentId}:1:${index + 1}`,
            season: 1,
            episode: index + 1,
            title: `Nuvio destination episode ${index + 1}`
          }))
        }
      })
    }
    throw new Error(`Unexpected request: ${url}`)
  })

  const pulled = await pullMediaBridge({
    connection: sourceConnection,
    scopes: { history: true, progress: false, library: false }
  })
  assert.equal(pulled.bundle.history.length, 1)
  const mappings = await inspectDestinationMappings(
    destination,
    pulled.bundle,
    { history: true, progress: false, library: false },
    undefined,
    sourceConnection
  )

  assert.equal(mappings.length, 1)
  assert.equal(mappings[0].mapping.status, 'mapped')
  assert.equal(mappings[0].mapping.evidence?.sequenceStrategy, 'same-index')
  assert.equal(mappings[0].mapping.target?.videoId, 'kitsu:99002:1:3')
  assert.equal(mappings[0].mapping.target?.contentId, 'kitsu:99002')
})

test('refreshes Nuvio once while reading selected scopes concurrently', async t => {
  const connection = nuvioConnection('source')
  if (connection.credentials.service !== 'nuvio') throw new Error('Expected Nuvio credentials.')
  connection.credentials.session = {
    access_token: 'expired-token',
    refresh_token: 'refresh-token',
    expires_at: 1
  }
  let refreshRequests = 0
  let activeRpcRequests = 0
  let maximumActiveRpcRequests = 0
  const rpcPaths: string[] = []
  t.mock.method(globalThis, 'fetch', async (input, init) => {
    const url = new URL(String(input))
    if (url.pathname === '/auth/v1/token') {
      refreshRequests++
      await new Promise(resolve => setTimeout(resolve, 10))
      return Response.json({
        access_token: 'refreshed-token',
        refresh_token: 'next-refresh-token',
        expires_in: 3_600
      })
    }
    rpcPaths.push(url.pathname)
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer refreshed-token')
    activeRpcRequests++
    maximumActiveRpcRequests = Math.max(maximumActiveRpcRequests, activeRpcRequests)
    await new Promise(resolve => setTimeout(resolve, 10))
    activeRpcRequests--
    return Response.json([])
  })

  const result = await pullMediaBridge({
    connection,
    scopes: { history: true, progress: true, library: true }
  })

  assert.equal(refreshRequests, 1)
  assert.equal(maximumActiveRpcRequests, 3)
  assert.deepEqual(new Set(rpcPaths), new Set([
    '/rest/v1/rpc/sync_pull_watched_items',
    '/rest/v1/rpc/sync_pull_watch_progress',
    '/rest/v1/rpc/sync_pull_library'
  ]))
  assert.deepEqual(result.bundle, createEmptyBundle())
})

test('accepts Nuvio series-level watched markers and parses compact watched timestamps', async t => {
  const logs: string[] = []
  const fetchMock = t.mock.method(globalThis, 'fetch', async (input, init) => {
    const url = new URL(String(input))
    assert.equal(url.pathname, '/rest/v1/rpc/sync_pull_watched_items')
    assert.equal(JSON.parse(String(init?.body || '{}')).p_profile_id, 1)
    return Response.json([
      {
        content_id: 'custom:no-time',
        content_type: 'movie',
        title: 'Not actually watched',
        watched_at: null
      },
      {
        content_id: 'custom:series-marker',
        content_type: 'series',
        title: 'Series-level marker',
        season: null,
        episode: null,
        watched_at: '2026-07-17T12:00:00Z'
      },
      {
        content_id: 'custom:zero-marker',
        content_type: 'series',
        title: 'Series marker without an exact Simkl timestamp',
        season: null,
        episode: null,
        watched_at: 0
      },
      {
        content_id: 'custom:valid-movie',
        content_type: 'movie',
        title: 'Valid movie',
        watched_at: 20260717120000
      },
      {
        content_id: 'custom:valid-episode',
        content_type: 'series',
        title: 'Valid series',
        season: 1,
        episode: 2,
        watched_at: '2026-07-18T13:00:00Z'
      }
    ])
  })

  const result = await pullMediaBridge({
    connection: nuvioConnection('source'),
    scopes: { history: true, progress: false, library: false },
    log: message => logs.push(message)
  })

  assert.equal(fetchMock.mock.callCount(), 1)
  assert.equal(result.bundle.history.length, 4)
  assert.equal(
    result.bundle.history.find(record => record.media.title === 'Valid movie')?.watchedAt,
    Date.UTC(2026, 6, 17, 12)
  )
  assert.equal(
    result.bundle.history.find(record => record.media.title === 'Valid series')?.media.episode,
    2
  )
  const seriesMarker = result.bundle.history.find(record => record.media.title === 'Series-level marker')
  assert.equal(seriesMarker?.media.kind, 'series')
  assert.equal(seriesMarker?.media.season, undefined)
  assert.equal(seriesMarker?.media.episode, undefined)
  assert.equal(
    result.bundle.history.find(record => record.media.title === 'Series marker without an exact Simkl timestamp')?.watchedAt,
    0
  )
  assert.equal(result.issues.length, 1)
  assert.ok(result.issues.every(issue => issue.code === 'source_record_invalid'))
  assert.ok(result.issues.every(issue => issue.status === 'unresolved'))
  assert.ok(logs.includes('Ignored 1 invalid Nuvio watched record.'))
})

test('bounds concurrent Nuvio write batches across history and progress', async t => {
  let activeWrites = 0
  let maximumActiveWrites = 0
  const batchSizes: number[] = []
  const fetchMock = t.mock.method(globalThis, 'fetch', async (input, init) => {
    const url = new URL(String(input))
    const body = JSON.parse(String(init?.body || '{}'))
    if (url.pathname === '/rest/v1/rpc/sync_push_watched_items') {
      batchSizes.push(body.p_items.length)
    } else if (url.pathname === '/rest/v1/rpc/sync_push_watch_progress') {
      batchSizes.push(body.p_entries.length)
    } else {
      throw new Error(`Unexpected Nuvio request: ${url.pathname}`)
    }
    activeWrites++
    maximumActiveWrites = Math.max(maximumActiveWrites, activeWrites)
    await new Promise(resolve => setTimeout(resolve, 10))
    activeWrites--
    return Response.json(null)
  })
  const bundle = createEmptyBundle()
  for (let index = 0; index < 1_501; index++) {
    const imdb = `tt${String(index + 1).padStart(7, '0')}`
    bundle.history.push(movieHistory(`History ${index + 1}`, imdb, Date.UTC(2026, 6, 17)))
  }
  for (let index = 0; index < 601; index++) {
    const imdb = `tt${String(index + 20_000).padStart(7, '0')}`
    bundle.progress.push({
      media: { kind: 'movie', ids: { imdb }, title: `Progress ${index + 1}` },
      positionMs: 1_000,
      durationMs: 10_000,
      updatedAt: Date.UTC(2026, 6, 17)
    })
  }

  const result = await pushMediaBridge({
    connection: nuvioConnection(),
    bundle,
    scopes: { history: true, progress: true, library: false }
  })

  assert.equal(fetchMock.mock.callCount(), 7)
  assert.equal(maximumActiveWrites, 3)
  assert.deepEqual(batchSizes.sort((left, right) => left - right), [1, 1, 300, 300, 500, 500, 500])
  assert.equal(result.written.history, 1_501)
  assert.equal(result.written.progress, 601)
  assert.deepEqual(result.issues, [])
})

test('retries transient Plex writes with bounded local-server concurrency', async t => {
  const records = Array.from({ length: 6 }, (_, index) => {
    const imdb = `tt${String(index + 40_000).padStart(7, '0')}`
    return {
      imdb,
      ratingKey: String(index + 101),
      title: `Plex ${index + 1}`
    }
  })
  let activeWrites = 0
  let maximumActiveWrites = 0
  let writeAttempts = 0
  let retried = false
  t.mock.method(globalThis, 'fetch', async input => {
    const url = new URL(String(input))
    if (url.pathname === '/library/sections') {
      return Response.json({
        MediaContainer: { Directory: [{ key: '1', title: 'Movies', type: 'movie' }] }
      })
    }
    if (url.pathname === '/library/sections/1/all') {
      return Response.json({
        MediaContainer: {
          totalSize: records.length,
          Metadata: records.map(record => ({
            ratingKey: record.ratingKey,
            key: `/library/metadata/${record.ratingKey}`,
            guid: `plex://movie/${record.ratingKey}`,
            Guid: [{ id: `imdb://${record.imdb}` }],
            type: 'movie',
            title: record.title,
            year: 2024
          }))
        }
      })
    }
    if (url.pathname === '/:/scrobble') {
      writeAttempts++
      activeWrites++
      maximumActiveWrites = Math.max(maximumActiveWrites, activeWrites)
      await new Promise(resolve => setTimeout(resolve, 10))
      activeWrites--
      if (!retried && url.searchParams.get('key') === '101') {
        retried = true
        return new Response(JSON.stringify({ message: 'busy' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json', 'Retry-After': '0' }
        })
      }
      return Response.json({ MediaContainer: { size: 0 } })
    }
    throw new Error(`Unexpected Plex request: ${url}`)
  })
  const bundle = createEmptyBundle()
  for (const record of records) {
    bundle.history.push(movieHistory(record.title, record.imdb, Date.UTC(2026, 6, 17)))
  }

  const result = await pushMediaBridge({
    connection: plexConnection(),
    bundle,
    scopes: { history: true, progress: false, library: false }
  })

  assert.equal(writeAttempts, 7)
  assert.equal(maximumActiveWrites, 4)
  assert.equal(result.written.history, 6)
  assert.deepEqual(result.issues, [])
})

test('bounds concurrent Jellyfin writes per server', async t => {
  const records = Array.from({ length: 6 }, (_, index) => {
    const imdb = `tt${String(index + 50_000).padStart(7, '0')}`
    return { imdb, itemId: `movie-${index + 1}`, title: `Jellyfin ${index + 1}` }
  })
  let activeWrites = 0
  let maximumActiveWrites = 0
  t.mock.method(globalThis, 'fetch', async input => {
    const url = new URL(String(input))
    if (url.pathname === '/Items') {
      return Response.json({
        TotalRecordCount: records.length,
        Items: records.map(record => ({
          Id: record.itemId,
          Type: 'Movie',
          Name: record.title,
          ProductionYear: 2024,
          ProviderIds: { Imdb: record.imdb },
          UserData: {}
        }))
      })
    }
    if (url.pathname.startsWith('/UserPlayedItems/')) {
      activeWrites++
      maximumActiveWrites = Math.max(maximumActiveWrites, activeWrites)
      await new Promise(resolve => setTimeout(resolve, 10))
      activeWrites--
      return Response.json({ Played: true })
    }
    throw new Error(`Unexpected Jellyfin request: ${url}`)
  })
  const bundle = createEmptyBundle()
  for (const record of records) {
    bundle.history.push(movieHistory(record.title, record.imdb, Date.UTC(2026, 6, 17)))
  }

  const result = await pushMediaBridge({
    connection: jellyfinConnection(),
    bundle,
    scopes: { history: true, progress: false, library: false }
  })

  assert.equal(maximumActiveWrites, 4)
  assert.equal(result.written.history, 6)
  assert.deepEqual(result.issues, [])
})

test('combines Stremio metadata preparation into one enrichment batch', async t => {
  let metadataRequests = 0
  let metadataItems: any[] = []
  t.mock.method(globalThis, 'fetch', async (input, init) => {
    const url = new URL(String(input), 'https://nuvio.wiki')
    const body = init?.body ? JSON.parse(String(init.body)) : {}
    if (url.pathname === '/api/datastoreGet') {
      return Response.json({
        result: [{
          _id: 'tmdb:118340',
          type: 'movie',
          name: 'Existing TMDB title',
          removed: false,
          temp: false,
          state: {}
        }]
      })
    }
    if (url.pathname === '/api/trakt/enrich-metadata') {
      metadataRequests++
      metadataItems = body.items
      return Response.json({
        results: body.items.map((item: any) => ({
          content_id: item.content_id,
          tmdbId: item._ids.tmdb,
          imdbId: item._ids.imdb || (
            String(item._ids.tmdb) === '118340' ? 'tt2015381' : undefined
          ),
          runtimeMs: 5_400_000,
          source: 'tmdb'
        }))
      })
    }
    if (url.pathname === '/meta/movie/tt7654321.json') {
      return Response.json({ meta: { id: 'tt7654321', name: 'Runtime conversion' } })
    }
    if (url.pathname === '/api/datastorePut') {
      return Response.json({ result: { success: true } })
    }
    throw new Error(`Unexpected Stremio request: ${url.pathname}`)
  })
  const bundle = createEmptyBundle()
  bundle.progress.push({
    media: { kind: 'movie', ids: { imdb: 'tt7654321' }, title: 'Runtime conversion' },
    percentage: 40,
    updatedAt: Date.UTC(2026, 6, 17)
  })

  const result = await pushMediaBridge({
    connection: stremioConnection(),
    bundle,
    scopes: { history: false, progress: true, library: false }
  })

  assert.equal(metadataRequests, 1)
  assert.equal(metadataItems.length, 2)
  assert.equal(result.written.progress, 1)
  assert.deepEqual(result.issues, [])
})

test('writes Stremio datastore batches with concurrency two', async t => {
  let activeWrites = 0
  let maximumActiveWrites = 0
  const batchSizes: number[] = []
  t.mock.method(globalThis, 'fetch', async (input, init) => {
    const url = new URL(String(input))
    if (url.pathname === '/api/datastoreGet') return Response.json({ result: [] })
    if (url.pathname.startsWith('/meta/movie/')) {
      const id = url.pathname.match(/(tt\d+)\.json$/)?.[1]
      return Response.json({ meta: { id, name: id } })
    }
    if (url.pathname === '/api/datastorePut') {
      const body = JSON.parse(String(init?.body || '{}'))
      batchSizes.push(body.changes.length)
      activeWrites++
      maximumActiveWrites = Math.max(maximumActiveWrites, activeWrites)
      await new Promise(resolve => setTimeout(resolve, 10))
      activeWrites--
      return Response.json({ result: { success: true } })
    }
    throw new Error(`Unexpected Stremio request: ${url}`)
  })
  const bundle = createEmptyBundle()
  for (let index = 0; index < 201; index++) {
    const imdb = `tt${String(index + 60_000).padStart(7, '0')}`
    bundle.library.push({
      media: { kind: 'movie', ids: { imdb }, title: `Saved ${index + 1}` },
      addedAt: Date.UTC(2026, 6, 17),
      lists: [{ service: 'trakt', kind: 'watchlist' }]
    })
  }

  const result = await pushMediaBridge({
    connection: stremioConnection(),
    bundle,
    scopes: { history: false, progress: false, library: true }
  })

  assert.equal(maximumActiveWrites, 2)
  assert.deepEqual(batchSizes.sort((left, right) => left - right), [1, 100, 100])
  assert.equal(result.written.library, 201)
  assert.deepEqual(result.issues, [])
})
