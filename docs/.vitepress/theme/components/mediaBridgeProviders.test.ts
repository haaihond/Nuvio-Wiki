import assert from 'node:assert/strict'
import test from 'node:test'
import { createEmptyBundle } from './mediaBridgeCore.ts'
import {
  pullMediaBridge,
  pullMediaBridgeForVerification,
  pushMediaBridge,
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
