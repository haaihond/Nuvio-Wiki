import assert from 'node:assert/strict'
import test from 'node:test'
import { createEmptyBundle } from './mediaBridgeCore.ts'
import {
  pushMediaBridge,
  type BridgeConnection
} from './mediaBridgeProviders.ts'

function traktConnection(): BridgeConnection {
  return {
    slot: 'destination',
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
