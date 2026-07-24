import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  SERVICE_DEFINITIONS,
  SERVICE_IDS,
  createEmptyBundle,
  type CanonicalBundle,
  type MediaRef,
  type ServiceId,
  type SyncScopes
} from './mediaBridgeCore.ts'
import {
  createMediaBridgeEngine,
  type MediaBridgeEngineInput
} from './media-bridge/engine.ts'
import type {
  ProviderAdapter,
  ProviderWriteResult,
  WriteReceipt
} from './media-bridge/contracts.ts'
import type { BridgeConnection } from './mediaBridgeProviders.ts'

const ALL_SCOPES: SyncScopes = { history: true, progress: true, library: true }

function connection(
  service: ServiceId,
  slot: BridgeConnection['slot'],
  accountId = `${slot}-${service}`
): BridgeConnection {
  return {
    slot,
    service,
    accountId,
    profileId: service === 'nuvio' ? (slot === 'source' ? 1 : 2) : undefined,
    serverId: service === 'plex' || service === 'jellyfin' ? `${slot}-server` : undefined,
    credentials: { service } as BridgeConnection['credentials']
  }
}

function movie(id: string): MediaRef {
  return { kind: 'movie', ids: { imdb: id }, title: `Movie ${id}`, year: 2024 }
}

interface FakeState {
  source: CanonicalBundle
  destination: CanonicalBundle
  destinationDuplicates?: Array<{
    scope: 'history' | 'progress' | 'library'
    aliases: string[]
    media: MediaRef
  }>
  verify?: CanonicalBundle
  write?: (bundle: CanonicalBundle, service: ServiceId) => ProviderWriteResult
  verifyScopes: SyncScopes[]
}

function fakeAdapter(id: ServiceId, state: FakeState): ProviderAdapter {
  return {
    id,
    capabilities: SERVICE_DEFINITIONS[id].capabilities,
    async snapshot({ connection }) {
      return {
        bundle: connection.slot === 'source' ? state.source : state.destination,
        issues: [],
        duplicates: connection.slot === 'destination'
          ? state.destinationDuplicates
          : undefined
      }
    },
    async resolveDestination() {
      return []
    },
    async write({ bundle }) {
      if (state.write) return state.write(bundle, id)
      const receipts: WriteReceipt[] = []
      for (const scope of ['history', 'progress', 'library'] as const) {
        bundle[scope].forEach((record, index) => receipts.push({
          id: `${id}:${scope}:${index}`,
          scope,
          status: 'confirmed',
          media: record.media
        }))
      }
      return {
        written: {
          history: bundle.history.length,
          progress: bundle.progress.length,
          library: bundle.library.length
        },
        issues: [],
        confirmedScopes: ['history', 'progress', 'library'],
        receipts
      }
    },
    async createCheckpoint() {
      return {}
    },
    async verify({ scopes }) {
      state.verifyScopes.push({ ...scopes })
      return { bundle: state.verify || state.destination, issues: [] }
    }
  }
}

function adapters(state: FakeState): Record<ServiceId, ProviderAdapter> {
  return Object.fromEntries(SERVICE_IDS.map(id => [id, fakeAdapter(id, state)])) as Record<
    ServiceId,
    ProviderAdapter
  >
}

function engineInput(source: ServiceId, destination: ServiceId): MediaBridgeEngineInput {
  return {
    source: connection(source, 'source'),
    destination: connection(destination, 'destination'),
    scopes: ALL_SCOPES
  }
}

test('previews all 36 directional routes through the provider registry', async () => {
  const state: FakeState = {
    source: createEmptyBundle(),
    destination: createEmptyBundle(),
    verifyScopes: []
  }
  const engine = createMediaBridgeEngine({
    adapters: adapters(state),
    enrichBundle: async bundle => bundle
  })
  for (const source of SERVICE_IDS) {
    for (const destination of SERVICE_IDS) {
      const prepared = await engine.preview(engineInput(source, destination))
      assert.equal(prepared.plan.stats.source, 0, `${source} -> ${destination}`)
    }
  }
})

test('is additive and leaves destination-only records out of the transfer', async () => {
  const source = createEmptyBundle()
  const destination = createEmptyBundle()
  source.library.push({
    media: movie('tt501'),
    addedAt: 100,
    lists: [{ service: 'trakt', kind: 'watchlist' }]
  })
  destination.library.push({
    media: movie('tt999'),
    addedAt: 100,
    lists: [{ service: 'simkl', kind: 'watchlist' }]
  })
  const state: FakeState = { source, destination, verifyScopes: [] }
  const engine = createMediaBridgeEngine({ adapters: adapters(state) })
  const prepared = await engine.preview(engineInput('trakt', 'simkl'))
  assert.equal(prepared.plan.transfer.library.length, 1)
  assert.equal(prepared.plan.transfer.library[0].media.ids.imdb, 'tt501')
  assert.ok(prepared.plan.rows.every(row => row.media.ids.imdb !== 'tt999'))
})

test('enriches a TMDB-only source to IMDb before planning a Nuvio write', async () => {
  const source = createEmptyBundle()
  source.library.push({
    media: { kind: 'movie', ids: { tmdb: 118340 }, title: 'Guardians', year: 2014 },
    addedAt: 100,
    lists: [{ service: 'trakt', kind: 'watchlist' }]
  })
  const state: FakeState = {
    source,
    destination: createEmptyBundle(),
    verifyScopes: []
  }
  let enrichmentCalls = 0
  const engine = createMediaBridgeEngine({
    adapters: adapters(state),
    async enrichBundle(bundle) {
      enrichmentCalls++
      const enriched = structuredClone(bundle)
      enriched.library[0].media.ids.imdb = 'tt2015381'
      return enriched
    }
  })
  const prepared = await engine.preview(engineInput('trakt', 'nuvio'))
  assert.equal(enrichmentCalls, 1)
  assert.equal(prepared.plan.transfer.library[0].media.ids.imdb, 'tt2015381')
  assert.equal(prepared.plan.transfer.library[0].media.ids.tmdb, 118340)
})

test('retains Nuvio duplicate-alias evidence long enough to plan cleanup', async () => {
  const source = createEmptyBundle()
  const destination = createEmptyBundle()
  const media = movie('tt2015381')
  media.ids.tmdb = 118340
  const libraryRecord = {
    media,
    addedAt: 100,
    lists: [{ service: 'nuvio' as const, kind: 'library' as const }]
  }
  source.library.push({
    ...libraryRecord,
    lists: [{ service: 'trakt', kind: 'watchlist' }]
  })
  destination.library.push(libraryRecord)
  const state: FakeState = {
    source,
    destination,
    destinationDuplicates: [{
      scope: 'library',
      aliases: ['movie:imdb:tt2015381', 'movie:tmdb:118340'],
      media
    }],
    verifyScopes: []
  }
  const engine = createMediaBridgeEngine({
    adapters: adapters(state),
    enrichBundle: async bundle => bundle
  })
  const prepared = await engine.preview(engineInput('trakt', 'nuvio'))
  assert.equal(prepared.plan.stats.update, 1)
  assert.equal(prepared.plan.transfer.library.length, 1)
})

test('verifies only accepted scopes and promotes observed receipts to confirmed', async () => {
  const source = createEmptyBundle()
  const destination = createEmptyBundle()
  const verified = createEmptyBundle()
  source.history.push({ media: movie('tt601'), watchedAt: 100 })
  source.library.push({
    media: movie('tt602'),
    addedAt: 100,
    lists: [{ service: 'trakt', kind: 'watchlist' }]
  })
  verified.history.push({ media: movie('tt601'), watchedAt: 100 })

  const state: FakeState = {
    source,
    destination,
    verify: verified,
    verifyScopes: [],
    write(bundle, service) {
      return {
        written: { history: 1, progress: 0, library: 1 },
        issues: [],
        confirmedScopes: ['library'],
        receipts: [
          {
            id: `${service}:history:0`,
            scope: 'history',
            status: 'accepted',
            media: bundle.history[0].media
          },
          {
            id: `${service}:library:0`,
            scope: 'library',
            status: 'confirmed',
            media: bundle.library[0].media
          }
        ]
      }
    }
  }
  const events: string[] = []
  const engine = createMediaBridgeEngine({ adapters: adapters(state) })
  const result = await engine.run({
    ...engineInput('trakt', 'simkl'),
    onEvent: event => events.push(event.phase)
  })
  assert.deepEqual(state.verifyScopes, [{ history: true, progress: false, library: false }])
  assert.deepEqual(result.receipts.map(receipt => receipt.status), ['confirmed', 'confirmed'])
  assert.deepEqual(result.written, { history: 1, progress: 0, library: 1 })
  assert.ok(['validate', 'read', 'normalize', 'resolve', 'plan', 'write', 'verify', 'complete']
    .every(phase => events.includes(phase)))
})

test('marks an accepted record failed when selective verification cannot observe it', async () => {
  const source = createEmptyBundle()
  source.history.push({ media: movie('tt701'), watchedAt: 100 })
  const state: FakeState = {
    source,
    destination: createEmptyBundle(),
    verify: createEmptyBundle(),
    verifyScopes: [],
    write(bundle, service) {
      return {
        written: { history: 1, progress: 0, library: 0 },
        issues: [],
        receipts: [{
          id: `${service}:history:0`,
          scope: 'history',
          status: 'accepted',
          media: bundle.history[0].media
        }]
      }
    }
  }
  const engine = createMediaBridgeEngine({ adapters: adapters(state) })
  const result = await engine.run(engineInput('trakt', 'simkl'))
  assert.equal(result.receipts[0].status, 'failed')
  assert.equal(result.receipts[0].code, 'verification_unconfirmed')
  assert.equal(result.written.history, 0)
  assert.ok(result.issues.some(issue => issue.code === 'verification_unconfirmed'))
})

test('exposes stable mapping issue codes and keeps the portal activity UI wired to the engine', async () => {
  const source = createEmptyBundle()
  source.history.push({
    media: { kind: 'movie', ids: {}, title: 'Unknown' },
    watchedAt: 100
  })
  const state: FakeState = {
    source,
    destination: createEmptyBundle(),
    verifyScopes: []
  }
  const engine = createMediaBridgeEngine({ adapters: adapters(state) })
  const prepared = await engine.preview(engineInput('trakt', 'simkl'))
  assert.ok(prepared.issues.some(issue => issue.code === 'mapping_unresolved'))

  const component = await readFile(
    new URL('./MediaSyncBridge.vue', import.meta.url),
    'utf8'
  )
  assert.match(component, /<Teleport to="body">/)
  assert.match(component, /mediaBridgeEngine\.preview/)
  assert.match(component, /mediaBridgeEngine\.run/)
  assert.match(component, /activity\.value\.push/)
})
