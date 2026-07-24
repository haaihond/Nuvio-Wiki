import { PROVIDER_ADAPTERS } from './adapters/index.ts'
import type {
  BridgePreparedPlan,
  BridgeRunEvent,
  BridgeRunEventHandler,
  BridgeRunPhase,
  ProviderAdapter,
  ProviderWriteResult,
  WriteReceipt
} from './contracts.ts'
import {
  SERVICE_DEFINITIONS,
  createEmptyBundle,
  dedupeBundle,
  validateEndpointPair,
  type BridgeScope,
  type CanonicalBundle,
  type ServiceId,
  type SyncScopes
} from './core.ts'
import {
  canonicalIdentityKey,
  coalesceBundleIdentities,
  identityAliasKeys,
  type IdentityConflict
} from './identity.ts'
import {
  enrichMediaBridgeBundle,
  type BridgeConnection,
  type BridgeIssue,
  type BridgeLog,
  type PushCounts,
  type PushResult
} from './legacy-providers.ts'
import { planMediaBridgePreview } from './planner.ts'

export interface MediaBridgeEngineOptions {
  adapters?: Readonly<Record<ServiceId, ProviderAdapter>>
  enrichBundle?: typeof enrichMediaBridgeBundle
}

export interface MediaBridgeEngineInput {
  source: BridgeConnection
  destination: BridgeConnection
  scopes: SyncScopes
  log?: BridgeLog
  onEvent?: BridgeRunEventHandler
}

export interface MediaBridgeEngineRunResult extends PushResult {
  prepared: BridgePreparedPlan
  receipts: WriteReceipt[]
}

export interface MediaBridgeEngine {
  preview(input: MediaBridgeEngineInput): Promise<BridgePreparedPlan>
  run(input: MediaBridgeEngineInput): Promise<MediaBridgeEngineRunResult>
}

const SCOPES: readonly BridgeScope[] = ['history', 'progress', 'library']

export function formatBridgeRunEvent(event: BridgeRunEvent): string {
  const provider = event.provider ? SERVICE_DEFINITIONS[event.provider].label : 'Bridge'
  return `[${provider} · ${event.phase}] ${event.message}`
}

function emitter(input: MediaBridgeEngineInput) {
  return (
    phase: BridgeRunPhase,
    message: string,
    options: Partial<Omit<BridgeRunEvent, 'at' | 'phase' | 'message'>> = {}
  ) => {
    const event: BridgeRunEvent = {
      at: Date.now(),
      phase,
      level: 'info',
      ...options,
      message
    }
    input.onEvent?.(event)
    input.log?.(formatBridgeRunEvent(event))
  }
}

function total(bundle: CanonicalBundle): number {
  return bundle.history.length + bundle.progress.length + bundle.library.length
}

function supportedScopes(
  input: MediaBridgeEngineInput,
  adapters: Readonly<Record<ServiceId, ProviderAdapter>>
): SyncScopes {
  const source = adapters[input.source.service]
  const destination = adapters[input.destination.service]
  return {
    history: input.scopes.history
      && source.capabilities.read.history
      && destination.capabilities.write.history,
    progress: input.scopes.progress
      && source.capabilities.read.progress
      && destination.capabilities.write.progress,
    library: input.scopes.library
      && source.capabilities.read.library
      && destination.capabilities.write.library
  }
}

function changeCount(prepared: BridgePreparedPlan): number {
  return prepared.plan.transfer.history.length
    + prepared.plan.transfer.progress.length
    + prepared.plan.transfer.library.length
}

function issueCode(issue: BridgeIssue): string {
  if (issue.code) return issue.code
  if (issue.status === 'ambiguous') return 'mapping_ambiguous'
  if (issue.status === 'unresolved') return 'mapping_unresolved'
  if (issue.status === 'warning') return 'provider_warning'
  return 'provider_note'
}

function typedIssues(issues: readonly BridgeIssue[]): BridgeIssue[] {
  return issues.map(issue => ({ ...issue, code: issueCode(issue) }))
}

function recordAt(bundle: CanonicalBundle, index: number) {
  if (index < bundle.history.length) {
    return { scope: 'history' as const, record: bundle.history[index] }
  }
  const progressIndex = index - bundle.history.length
  if (progressIndex < bundle.progress.length) {
    return { scope: 'progress' as const, record: bundle.progress[progressIndex] }
  }
  return {
    scope: 'library' as const,
    record: bundle.library[progressIndex - bundle.progress.length]
  }
}

function identityConflictIssues(
  bundle: CanonicalBundle,
  conflicts: readonly IdentityConflict[]
): BridgeIssue[] {
  return conflicts.map(conflict => {
    const scoped = recordAt(bundle, conflict.left)
    const media = scoped?.record.media
    return {
      scope: scoped?.scope || 'library',
      status: 'warning',
      media,
      code: 'identity_conflict',
      reason: conflict.reason,
      evidence: {
        aliases: media ? identityAliasKeys(media) : [],
        candidates: conflict.namespaces
      }
    }
  })
}

function normalizeSnapshot(
  bundle: CanonicalBundle,
  connection: BridgeConnection
): { bundle: CanonicalBundle; issues: BridgeIssue[] } {
  const coalesced = coalesceBundleIdentities(bundle, { endpoint: connection })
  return {
    bundle: dedupeBundle(coalesced.bundle),
    issues: identityConflictIssues(bundle, coalesced.conflicts)
  }
}

function planIssues(prepared: ReturnType<typeof planMediaBridgePreview>): BridgeIssue[] {
  return prepared.rows
    .filter(row => row.outcome === 'unresolved' || row.outcome === 'ambiguous')
    .map(row => ({
      scope: row.scope,
      status: row.outcome as 'unresolved' | 'ambiguous',
      media: row.media,
      code: row.outcome === 'ambiguous' ? 'mapping_ambiguous' : 'mapping_unresolved',
      reason: row.detail,
      evidence: {
        sourceKey: row.sourceKey,
        targetKey: row.targetKey,
        confidence: row.mappingConfidence || undefined,
        aliases: identityAliasKeys(row.media)
      }
    }))
}

function mutableBundle(bundle: BridgePreparedPlan['plan']['transfer']): CanonicalBundle {
  return {
    history: [...bundle.history],
    progress: [...bundle.progress],
    library: [...bundle.library]
  }
}

function bundleForReceipts(
  bundle: CanonicalBundle,
  receipts: readonly WriteReceipt[],
  status: WriteReceipt['status']
): CanonicalBundle {
  const selected = createEmptyBundle()
  for (const scope of SCOPES) {
    const scopeReceipts = receipts.filter(receipt => receipt.scope === scope)
    const used = new Set<WriteReceipt>()
    bundle[scope].forEach((record, index) => {
      const key = receiptRecordKey(scope, record)
      const receipt = scopeReceipts.find(item => (
        !used.has(item)
        && item.status === status
        && (!item.recordKey || item.recordKey === key)
      )) || scopeReceipts[index]
      if (receipt) used.add(receipt)
      if (receipt?.status === status) {
        ;(selected[scope] as Array<typeof record>).push(record)
      }
    })
  }
  return selected
}

function receiptRecordKey(scope: BridgeScope, record: any): string {
  const identity = canonicalIdentityKey(record.media) || 'unresolved'
  if (scope === 'history') {
    return `${scope}:${identity}:${Number(record.watchedAt) || 0}:${String(record.eventId || '')}`
  }
  return `${scope}:${identity}`
}

function countReceiptStatus(
  receipts: readonly WriteReceipt[],
  scope: BridgeScope,
  status: WriteReceipt['status']
): number {
  return receipts.filter(receipt => receipt.scope === scope && receipt.status === status).length
}

function acceptedScopes(receipts: readonly WriteReceipt[]): SyncScopes {
  return {
    history: countReceiptStatus(receipts, 'history', 'accepted') > 0,
    progress: countReceiptStatus(receipts, 'progress', 'accepted') > 0,
    library: countReceiptStatus(receipts, 'library', 'accepted') > 0
  }
}

function writtenFromReceipts(receipts: readonly WriteReceipt[]): PushCounts {
  return {
    history: countReceiptStatus(receipts, 'history', 'confirmed'),
    progress: countReceiptStatus(receipts, 'progress', 'confirmed'),
    library: countReceiptStatus(receipts, 'library', 'confirmed')
  }
}

function skippedFromReceipts(receipts: readonly WriteReceipt[]): Partial<PushCounts> {
  const result: Partial<PushCounts> = {}
  for (const scope of SCOPES) {
    const count = countReceiptStatus(receipts, scope, 'skipped')
      + countReceiptStatus(receipts, scope, 'failed')
    if (count) result[scope] = count
  }
  return result
}

function receiptIssues(
  receipts: readonly WriteReceipt[],
  existing: readonly BridgeIssue[]
): BridgeIssue[] {
  return receipts
    .filter(receipt => receipt.status === 'failed' || receipt.status === 'skipped')
    .filter(receipt => !existing.some(issue => (
      issue.scope === receipt.scope
      && issue.media
      && canonicalIdentityKey(issue.media) === canonicalIdentityKey(receipt.media)
    )))
    .map(receipt => ({
      scope: receipt.scope,
      status: receipt.status === 'failed' ? 'warning' : 'note',
      media: receipt.media,
      code: receipt.code || (receipt.status === 'failed' ? 'write_failed' : 'write_skipped'),
      reason: receipt.reason || (
        receipt.status === 'failed'
          ? 'The provider did not account for this submitted record.'
          : 'The provider skipped this submitted record.'
      ),
      evidence: {
        targetKey: receipt.destinationKey,
        aliases: identityAliasKeys(receipt.media)
      }
    } as BridgeIssue))
}

function finalizeAcceptedReceipts(
  receipts: WriteReceipt[],
  remaining: CanonicalBundle,
  issues: BridgeIssue[]
): void {
  for (const scope of SCOPES) {
    const accepted = receipts.filter(receipt => receipt.scope === scope && receipt.status === 'accepted')
    const remainingByKey = new Map<string, number>()
    remaining[scope].forEach(record => {
      const key = receiptRecordKey(scope, record)
      remainingByKey.set(key, (remainingByKey.get(key) || 0) + 1)
    })
    let unconfirmed = 0
    accepted.forEach(receipt => {
      const receiptIdentity = canonicalIdentityKey(receipt.media) || 'unresolved'
      const key = receipt.recordKey || `${scope}:${receiptIdentity}`
      let count = remainingByKey.get(key) || 0
      if (!count && scope === 'history' && !receipt.recordKey) {
        const prefix = `${scope}:${receiptIdentity}:`
        const candidate = [...remainingByKey].find(([remainingKey, amount]) => (
          amount > 0 && remainingKey.startsWith(prefix)
        ))
        if (candidate) {
          count = candidate[1]
          remainingByKey.set(candidate[0], count - 1)
        }
      } else if (count) {
        remainingByKey.set(key, count - 1)
      }
      if (!count) {
        receipt.status = 'confirmed'
        return
      }
      unconfirmed++
      receipt.status = 'failed'
      receipt.code = 'verification_unconfirmed'
      receipt.reason = 'The destination refresh did not contain this accepted record.'
    })
    if (unconfirmed) {
      issues.push({
        scope,
        status: 'warning',
        code: 'verification_unconfirmed',
        reason: `${unconfirmed} ${scope} record${unconfirmed === 1 ? '' : 's'} could not be confirmed after verification.`
      })
    }
  }
}

export function createMediaBridgeEngine(
  options: MediaBridgeEngineOptions = {}
): MediaBridgeEngine {
  const adapters = options.adapters || PROVIDER_ADAPTERS
  const enrichBundle = options.enrichBundle || enrichMediaBridgeBundle

  async function preview(input: MediaBridgeEngineInput): Promise<BridgePreparedPlan> {
    const emit = emitter(input)
    emit('validate', 'Validating connected source and destination.')
    const validation = validateEndpointPair(input.source, input.destination)
    if (!validation.valid) throw new Error(validation.message)
    const sourceAdapter = adapters[input.source.service]
    const destinationAdapter = adapters[input.destination.service]
    if (!sourceAdapter || !destinationAdapter) throw new Error('No provider adapter is registered for this route.')
    const scopes = supportedScopes(input, adapters)
    const unsupported = SCOPES.filter(scope => input.scopes[scope] && !scopes[scope])
    if (unsupported.length) {
      emit('validate', `Skipping unsupported scopes: ${unsupported.join(', ')}.`, {
        level: 'warning'
      })
    }
    if (!Object.values(scopes).some(Boolean)) {
      throw new Error('This route has no requested scopes that both providers support.')
    }

    const sourceLog: BridgeLog = message => emit('read', message, { provider: input.source.service })
    const destinationLog: BridgeLog = message => emit('read', message, { provider: input.destination.service })
    emit('read', 'Reading source and destination snapshots concurrently.', {
      counts: { source: 2 }
    })
    const [sourceResult, destinationResult] = await Promise.all([
      sourceAdapter.snapshot({ connection: input.source, scopes, log: sourceLog }),
      destinationAdapter.snapshot({ connection: input.destination, scopes, log: destinationLog })
    ])

    let sourceBundle = sourceResult.bundle
    let destinationBundle = destinationResult.bundle
    if (input.destination.service === 'nuvio' && input.source.service !== 'nuvio') {
      emit('enrich', 'Resolving source IMDb/TMDB aliases for Nuvio.', { provider: 'nuvio' })
      sourceBundle = await enrichBundle(
        sourceBundle,
        message => emit('enrich', message, { provider: 'nuvio' })
      )
    }
    if (input.source.service === 'nuvio' && input.destination.service !== 'nuvio') {
      emit('enrich', 'Resolving destination IMDb/TMDB aliases for Nuvio.', { provider: 'nuvio' })
      destinationBundle = await enrichBundle(
        destinationBundle,
        message => emit('enrich', message, { provider: 'nuvio' })
      )
    }

    emit('normalize', 'Coalescing snapshots through all non-conflicting aliases.')
    const normalizedSource = normalizeSnapshot(sourceBundle, input.source)
    const normalizedDestination = normalizeSnapshot(destinationBundle, input.destination)

    emit('resolve', 'Resolving deterministic destination identities and episode mappings.', {
      provider: input.destination.service
    })
    const mappingIssues = await destinationAdapter.resolveDestination({
      connection: input.destination,
      sourceConnection: input.source,
      source: normalizedSource.bundle,
      scopes,
      log: message => emit('resolve', message, { provider: input.destination.service })
    })

    emit('plan', 'Building the additive transfer plan.')
    const plan = planMediaBridgePreview({
      source: normalizedSource.bundle,
      destination: normalizedDestination.bundle,
      sourceEndpoint: input.source,
      destinationEndpoint: input.destination,
      destinationService: input.destination.service,
      destinationDuplicateAliases: destinationResult.duplicates?.flatMap(item => item.aliases),
      scopes,
      mappingIssues
    })
    const changes = changeCount({
      source: normalizedSource.bundle,
      destination: normalizedDestination.bundle,
      plan,
      issues: []
    })
    emit('plan', `${changes} changes are ready; ${plan.stats.skipped} records were skipped.`, {
      counts: { changes, skipped: plan.stats.skipped }
    })

    return {
      source: normalizedSource.bundle,
      destination: normalizedDestination.bundle,
      plan,
      issues: typedIssues([
        ...sourceResult.issues,
        ...destinationResult.issues,
        ...normalizedSource.issues,
        ...normalizedDestination.issues,
        ...planIssues(plan)
      ])
    }
  }

  async function run(input: MediaBridgeEngineInput): Promise<MediaBridgeEngineRunResult> {
    const emit = emitter(input)
    const prepared = await preview(input)
    const transfer = mutableBundle(prepared.plan.transfer)
    if (!total(transfer)) {
      emit('complete', 'No destination changes are needed.', {
        counts: { changes: 0, skipped: prepared.plan.stats.skipped }
      })
      return {
        prepared,
        written: { history: 0, progress: 0, library: 0 },
        skipped: {},
        confirmedScopes: [],
        issues: [],
        receipts: []
      }
    }

    const adapter = adapters[input.destination.service]
    const scopes = supportedScopes(input, adapters)
    const checkpoint = await adapter.createCheckpoint({
      connection: input.destination,
      log: message => emit('verify', message, { provider: input.destination.service })
    })
    emit('write', `Writing ${total(transfer)} planned records.`, {
      provider: input.destination.service,
      counts: {
        history: transfer.history.length,
        progress: transfer.progress.length,
        library: transfer.library.length
      }
    })
    const write: ProviderWriteResult = await adapter.write({
      connection: input.destination,
      bundle: transfer,
      scopes,
      log: message => emit('write', message, { provider: input.destination.service })
    })
    const receipts = write.receipts.map(receipt => ({ ...receipt }))
    const issues = typedIssues([
      ...write.issues,
      ...receiptIssues(receipts, write.issues)
    ])
    const verifyScopes = acceptedScopes(receipts)

    if (Object.values(verifyScopes).some(Boolean)) {
      const accepted = bundleForReceipts(transfer, receipts, 'accepted')
      emit('verify', 'Refreshing only scopes with accepted, unconfirmed writes.', {
        provider: input.destination.service,
        counts: {
          history: accepted.history.length,
          progress: accepted.progress.length,
          library: accepted.library.length
        }
      })
      const verified = await adapter.verify({
        connection: input.destination,
        scopes: verifyScopes,
        log: message => emit('verify', message, { provider: input.destination.service }),
        baseline: prepared.destination,
        checkpoint
      })
      const remaining = planMediaBridgePreview({
        source: accepted,
        destination: normalizeSnapshot(verified.bundle, input.destination).bundle,
        sourceEndpoint: input.source,
        destinationEndpoint: input.destination,
        destinationService: input.destination.service,
        scopes: verifyScopes
      })
      finalizeAcceptedReceipts(receipts, mutableBundle(remaining.transfer), issues)
      issues.push(...typedIssues(verified.issues))
    } else {
      emit('verify', 'Provider responses accounted for every submitted record.', {
        provider: input.destination.service
      })
    }

    const written = writtenFromReceipts(receipts)
    emit('complete', `Wrote ${written.history} history, ${written.progress} progress, and ${written.library} library records.`, {
      provider: input.destination.service,
      counts: written
    })
    return {
      prepared,
      written,
      skipped: skippedFromReceipts(receipts),
      confirmedScopes: SCOPES.filter(scope => (
        scopes[scope]
        && !receipts.some(receipt => receipt.scope === scope && receipt.status === 'accepted')
      )),
      issues,
      receipts
    }
  }

  return { preview, run }
}

export const mediaBridgeEngine = createMediaBridgeEngine()
