import {
  SERVICE_DEFINITIONS,
  canonicalEpisodeKey,
  canonicalMediaKey,
  collapseHistoryToWatchedState,
  dedupeBundle,
  episodeAliasKeys,
  mediaAliasKeys,
  mediaTitle,
  normalizeTitle,
  type BridgeScope,
  type CanonicalBundle,
  type HistoryRecord,
  type LibraryRecord,
  type MappingConfidence,
  type MappingOutcome,
  type MediaIds,
  type MediaRef,
  type ProgressRecord,
  type ServiceId,
  type SyncScopes
} from './mediaBridgeCore.ts'

export type PreviewOutcome = 'add' | 'update' | 'already-present' | 'unresolved' | 'ambiguous'

export interface ProviderMappingIssue {
  scope: BridgeScope
  sourceMedia: MediaRef
  mapping: MappingOutcome
}

export interface PreviewRow {
  readonly id: string
  readonly scope: BridgeScope
  readonly mediaKind: MediaRef['kind']
  readonly title: string
  readonly outcome: PreviewOutcome
  readonly outcomeLabel: string
  readonly sourceKey: string | null
  readonly targetKey: string | null
  readonly remapped: boolean
  readonly mappingConfidence: MappingConfidence | null
  readonly detail: string
}

export interface PreviewStats {
  source: number
  add: number
  update: number
  alreadyPresent: number
  remapped: number
  unresolved: number
  ambiguous: number
  skipped: number
}

export interface PlannedTransferBundle {
  readonly history: readonly HistoryRecord[]
  readonly progress: readonly ProgressRecord[]
  readonly library: readonly LibraryRecord[]
}

export interface MediaBridgePreviewPlan {
  readonly transfer: PlannedTransferBundle
  readonly rows: readonly PreviewRow[]
  readonly stats: Readonly<PreviewStats>
}

export interface MediaBridgePlanInput {
  source: CanonicalBundle
  destination: CanonicalBundle
  scopes: SyncScopes
  destinationService?: ServiceId
  mappingIssues?: readonly ProviderMappingIssue[]
}

type ScopedRecord = HistoryRecord | ProgressRecord | LibraryRecord

interface PendingRow extends Omit<PreviewRow, 'id'> {
  stableKey: string
  sequence: number
}

const SCOPE_ORDER: Record<BridgeScope, number> = {
  history: 0,
  progress: 1,
  library: 2
}

function canonicalRecordKey(media: MediaRef): string | null {
  return canonicalEpisodeKey(media) || canonicalMediaKey(media)
}

function recordAliasKeys(media: MediaRef): string[] {
  const episodeAliases = episodeAliasKeys(media)
  return episodeAliases.length ? episodeAliases : mediaAliasKeys(media)
}

function titleYearRecordKeys(media: MediaRef): string[] {
  const title = normalizeTitle(mediaTitle(media))
  const year = Number(media.year)
  if (!title || !Number.isInteger(year) || year <= 0) return []

  const base = `${media.kind}:title:${title.replace(/\s+/g, '-')}:${year}`
  if (media.kind !== 'series') return [base]

  const keys: string[] = []
  if (Number.isInteger(media.season) && Number(media.season) >= 0
    && Number.isInteger(media.episode) && Number(media.episode) > 0) {
    keys.push(`${base}:season:${media.season}:episode:${media.episode}`)
  }
  if (Number.isInteger(media.absoluteEpisode) && Number(media.absoluteEpisode) > 0) {
    keys.push(`${base}:absolute:${media.absoluteEpisode}`)
  }
  return keys
}

function recordComparisonKeys(media: MediaRef, includeTitleYear = false): string[] {
  // Provider IDs describe the same title in different namespaces. Keep them as
  // the strongest match. Continue Watching may also use title/year (plus
  // episode coordinates) because providers do not always share an external ID.
  const semanticKeys = includeTitleYear ? titleYearRecordKeys(media) : []
  return [...new Set([...recordAliasKeys(media), ...semanticKeys])]
}

function mediaLocator(media: MediaRef): string {
  return canonicalRecordKey(media) || [
    'unresolved',
    media.kind,
    normalizeTitle(media.title),
    Number.isInteger(media.year) ? media.year : '',
    Number.isInteger(media.season) ? media.season : '',
    Number.isInteger(media.episode) ? media.episode : '',
    Number.isInteger(media.absoluteEpisode) ? media.absoluteEpisode : '',
    normalizeTitle(media.episodeTitle),
    String(media.videoId || '').trim()
  ].join(':')
}

function mappingIssueKey(scope: BridgeScope, media: MediaRef): string {
  return `${scope}:${mediaLocator(media)}`
}

function mappingIssueRank(mapping: MappingOutcome): number {
  if (mapping.status === 'unresolved') return 3
  if (mapping.status === 'ambiguous') return 2
  return 1
}

function buildMappingIssueIndex(issues: readonly ProviderMappingIssue[]): Map<string, ProviderMappingIssue> {
  const index = new Map<string, ProviderMappingIssue>()
  for (const issue of issues) {
    const key = mappingIssueKey(issue.scope, issue.sourceMedia)
    const existing = index.get(key)
    if (!existing || mappingIssueRank(issue.mapping) > mappingIssueRank(existing.mapping)) {
      index.set(key, issue)
    }
  }
  return index
}

function cloneMediaIds(ids: MediaIds): MediaIds {
  const cloned: MediaIds = { ...ids }
  if (ids.external) cloned.external = { ...ids.external }
  return cloned
}

function cloneMediaWithMapping(media: MediaRef, mapping: MappingOutcome): MediaRef {
  if (mapping.status !== 'mapped' || media.kind !== 'series') {
    return { ...media, ids: cloneMediaIds(media.ids) }
  }
  return {
    ...media,
    ids: cloneMediaIds(media.ids),
    season: mapping.target.season,
    episode: mapping.target.episode,
    absoluteEpisode: mapping.target.absoluteEpisode ?? media.absoluteEpisode,
    episodeTitle: mapping.target.title || media.episodeTitle,
    videoId: mapping.target.videoId || media.videoId
  }
}

function cloneRecordWithMedia(
  scope: BridgeScope,
  record: ScopedRecord,
  media: MediaRef
): ScopedRecord {
  if (scope === 'history') {
    const history = record as HistoryRecord
    return {
      ...history,
      media,
      source: history.source ? { ...history.source } : undefined
    }
  }
  if (scope === 'progress') {
    const progress = record as ProgressRecord
    return {
      ...progress,
      media,
      source: progress.source ? { ...progress.source } : undefined
    }
  }
  const library = record as LibraryRecord
  return {
    ...library,
    media,
    source: library.source ? { ...library.source } : undefined,
    lists: library.lists.map(list => ({ ...list }))
  }
}

function displayTitle(media: MediaRef): string {
  return mediaTitle(media)
}

function outcomeLabel(outcome: PreviewOutcome, remapped: boolean): string {
  const suffix = remapped ? ' · remapped' : ''
  if (outcome === 'add') return `Add to destination${suffix}`
  if (outcome === 'update') return `Update destination${suffix}`
  if (outcome === 'already-present') return `Already present${suffix}`
  if (outcome === 'ambiguous') return 'Skipped · ambiguous mapping'
  return 'Skipped · unresolved mapping'
}

const GENERIC_LIST_NAMES: Record<LibraryRecord['lists'][number]['kind'], ReadonlySet<string>> = {
  watchlist: new Set(['watchlist', 'watch list', 'my watchlist', 'plan to watch']),
  collection: new Set(['collection', 'my collection']),
  library: new Set(['library', 'my library']),
  favorites: new Set(['favorites', 'favourites', 'my favorites', 'my favourites']),
  other: new Set()
}

function semanticListKey(
  list: LibraryRecord['lists'][number],
  collapseGenericMembership = false
): string {
  const name = normalizeTitle(list.name)
  const generic = list.kind !== 'other' && (!name || GENERIC_LIST_NAMES[list.kind].has(name))
  if (collapseGenericMembership && generic) return 'generic-membership'
  if (name && !GENERIC_LIST_NAMES[list.kind].has(name)) {
    return `${list.kind}:name:${name}`
  }
  const listId = String(list.listId || '').trim().toLocaleLowerCase('en-US')
  if (list.kind === 'other' && listId) return `${list.kind}:id:${listId}`
  return list.kind
}

function listIdentity(record: LibraryRecord, collapseGenericMembership = false): string[] {
  return [...new Set(record.lists.map(list => semanticListKey(list, collapseGenericMembership)))].sort()
}

function hasOnlyTraktProvenance(record: LibraryRecord): boolean {
  return record.lists.length > 0 && record.lists.every(list => list.service === 'trakt')
}

function hasDifferentLists(source: LibraryRecord, destination: LibraryRecord): boolean {
  // Trakt is the only bridge provider with two independently writable native
  // memberships. Other providers expose one generic saved-title destination,
  // so watchlist/collection/library provenance must converge after a refresh.
  const collapseGenericMembership = !(
    hasOnlyTraktProvenance(source) && hasOnlyTraktProvenance(destination)
  )
  const sourceLists = listIdentity(source, collapseGenericMembership)
  const destinationLists = new Set(listIdentity(destination, collapseGenericMembership))
  return sourceLists.some(list => !destinationLists.has(list))
}

function progressPercentage(record: ProgressRecord): number | null {
  const duration = Number(record.durationMs)
  const position = Number(record.positionMs)
  if (Number.isFinite(position) && position >= 0 && Number.isFinite(duration) && duration > 0) {
    return (position / duration) * 100
  }

  const percentage = Number(record.percentage)
  return Number.isFinite(percentage) && percentage >= 0 && percentage <= 100
    ? percentage
    : null
}

function progressEquivalent(source: ProgressRecord, destination: ProgressRecord): boolean {
  const sourceDuration = Number(source.durationMs)
  const destinationDuration = Number(destination.durationMs)
  const sourcePosition = Number(source.positionMs)
  const destinationPosition = Number(destination.positionMs)
  const durationsValid = sourceDuration > 0 && destinationDuration > 0

  const sourcePercentage = progressPercentage(source)
  const destinationPercentage = progressPercentage(destination)
  if (
    sourcePercentage !== null
    && destinationPercentage !== null
    && Math.abs(sourcePercentage - destinationPercentage) <= 1
  ) return true

  if (!durationsValid) return false

  const durationDifference = Math.abs(sourceDuration - destinationDuration)
  const durationScale = Math.max(sourceDuration, destinationDuration, 1)
  const durationNear = durationDifference <= 5_000 || (durationDifference / durationScale) <= 0.01
  return durationNear && Math.abs(sourcePosition - destinationPosition) <= 5_000
}

function needsNuvioLibraryImdbUpgrade(source: ScopedRecord, destination: ScopedRecord): boolean {
  const sourceImdb = String(source.media.ids.imdb ?? '').trim().toLowerCase()
  const destinationNativeId = String(destination.media.ids.stremio ?? '').trim().toLowerCase()
  return /^tt\d+$/.test(sourceImdb)
    && !/^tt\d+$/.test(destinationNativeId)
    && destination.source?.service === 'nuvio'
}

function classifyRecord(
  scope: BridgeScope,
  source: ScopedRecord,
  destination: ScopedRecord | undefined
): Extract<PreviewOutcome, 'add' | 'update' | 'already-present'> {
  if (!destination) return 'add'

  if (scope === 'library' && needsNuvioLibraryImdbUpgrade(source, destination)) {
    return 'update'
  }

  if (scope === 'history') {
    const sourceHistory = source as HistoryRecord
    const destinationHistory = destination as HistoryRecord
    return sourceHistory.watchedAt > destinationHistory.watchedAt
      ? 'update'
      : 'already-present'
  }

  if (scope === 'progress') {
    const sourceProgress = source as ProgressRecord
    const destinationProgress = destination as ProgressRecord
    if (sourceProgress.updatedAt < destinationProgress.updatedAt) return 'already-present'
    return progressEquivalent(sourceProgress, destinationProgress) ? 'already-present' : 'update'
  }

  const sourceLibrary = source as LibraryRecord
  const destinationLibrary = destination as LibraryRecord
  return sourceLibrary.addedAt > destinationLibrary.addedAt
    || hasDifferentLists(sourceLibrary, destinationLibrary)
    ? 'update'
    : 'already-present'
}

function recordsForScope(bundle: CanonicalBundle, scope: BridgeScope): ScopedRecord[] {
  if (scope === 'history') return bundle.history
  if (scope === 'progress') return bundle.progress
  return bundle.library
}

type DestinationIndex = Map<string, ScopedRecord[]>

function destinationIndexes(bundle: CanonicalBundle): Record<BridgeScope, DestinationIndex> {
  const result = {
    history: new Map<string, ScopedRecord[]>(),
    progress: new Map<string, ScopedRecord[]>(),
    library: new Map<string, ScopedRecord[]>()
  }
  for (const scope of Object.keys(result) as BridgeScope[]) {
    for (const record of recordsForScope(bundle, scope)) {
      for (const key of recordComparisonKeys(record.media, scope === 'progress')) {
        const records = result[scope].get(key) || []
        records.push(record)
        result[scope].set(key, records)
      }
    }
  }
  return result
}

function findDestinationRecord(
  index: DestinationIndex,
  media: MediaRef,
  scope: BridgeScope
): ScopedRecord | undefined {
  for (const key of recordComparisonKeys(media, scope === 'progress')) {
    const record = index.get(key)?.[0]
    if (record) return record
  }
  return undefined
}

function findDestinationHistoryEvent(
  index: DestinationIndex,
  media: MediaRef,
  watchedAt: number,
  consumed: Set<ScopedRecord>
): HistoryRecord | undefined {
  const candidates = new Set<ScopedRecord>()
  for (const key of recordComparisonKeys(media)) {
    for (const candidate of index.get(key) || []) candidates.add(candidate)
  }
  for (const candidate of candidates) {
    if (consumed.has(candidate)) continue
    const history = candidate as HistoryRecord
    if (history.watchedAt !== watchedAt) continue
    consumed.add(candidate)
    return history
  }
  return undefined
}

function pushTransferRecord(bundle: CanonicalBundle, scope: BridgeScope, record: ScopedRecord): void {
  if (scope === 'history') bundle.history.push(record as HistoryRecord)
  else if (scope === 'progress') bundle.progress.push(record as ProgressRecord)
  else bundle.library.push(record as LibraryRecord)
}

function episodeCoordinatesChanged(source: MediaRef, target: MediaRef): boolean {
  return source.season !== target.season
    || source.episode !== target.episode
}

function stableRows(rows: PendingRow[]): PreviewRow[] {
  rows.sort((left, right) => (
    SCOPE_ORDER[left.scope] - SCOPE_ORDER[right.scope]
    || left.stableKey.localeCompare(right.stableKey)
    || left.outcome.localeCompare(right.outcome)
    || left.sequence - right.sequence
  ))

  const occurrences = new Map<string, number>()
  return rows.map(row => {
    const baseId = `${row.scope}:${row.stableKey}`
    const occurrence = occurrences.get(baseId) || 0
    occurrences.set(baseId, occurrence + 1)
    const { stableKey: _stableKey, sequence: _sequence, ...previewRow } = row
    return {
      ...previewRow,
      id: occurrence ? `${baseId}:${occurrence + 1}` : baseId
    }
  })
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (!value || typeof value !== 'object') return value
  const object = value as object
  if (seen.has(object)) return value
  seen.add(object)
  for (const child of Object.values(object)) deepFreeze(child, seen)
  return Object.freeze(value)
}

export function planMediaBridgePreview(input: MediaBridgePlanInput): MediaBridgePreviewPlan {
  const historyWriteMode = input.destinationService
    ? SERVICE_DEFINITIONS[input.destinationService].capabilities.historyWriteMode
    : 'state'
  const source = dedupeBundle(input.source)
  const duplicateNuvioLibraryAliases = new Set<string>()
  if (input.destinationService === 'nuvio') {
    const aliasCounts = new Map<string, number>()
    for (const record of input.destination.library) {
      for (const alias of mediaAliasKeys(record.media)) {
        aliasCounts.set(alias, (aliasCounts.get(alias) || 0) + 1)
      }
    }
    for (const [alias, count] of aliasCounts) {
      if (count > 1) duplicateNuvioLibraryAliases.add(alias)
    }
  }
  const destination = dedupeBundle(input.destination)
  if (historyWriteMode === 'state') {
    source.history = collapseHistoryToWatchedState(source.history)
    destination.history = collapseHistoryToWatchedState(destination.history)
  }
  const destinationByScope = destinationIndexes(destination)
  const consumedHistoryEvents = new Set<ScopedRecord>()
  const mappingIssues = buildMappingIssueIndex(input.mappingIssues || [])
  const transfer: CanonicalBundle = { history: [], progress: [], library: [] }
  const rows: PendingRow[] = []
  const stats: PreviewStats = {
    source: 0,
    add: 0,
    update: 0,
    alreadyPresent: 0,
    remapped: 0,
    unresolved: 0,
    ambiguous: 0,
    skipped: 0
  }
  let sequence = 0

  for (const scope of ['history', 'progress', 'library'] as const) {
    if (!input.scopes[scope]) continue

    for (const sourceRecord of recordsForScope(source, scope)) {
      stats.source++
      const originalMedia = sourceRecord.media
      const sourceKey = canonicalRecordKey(originalMedia)
      const issue = mappingIssues.get(mappingIssueKey(scope, originalMedia))

      if (!sourceKey || issue?.mapping.status === 'unresolved' || issue?.mapping.status === 'ambiguous') {
        const outcome: PreviewOutcome = issue?.mapping.status === 'ambiguous' ? 'ambiguous' : 'unresolved'
        stats[outcome]++
        stats.skipped++
        const detail = issue?.mapping.reason || 'No canonical content or episode key is available.'
        rows.push({
          stableKey: mediaLocator(originalMedia),
          sequence: sequence++,
          scope,
          mediaKind: originalMedia.kind,
          title: displayTitle(originalMedia),
          outcome,
          outcomeLabel: outcomeLabel(outcome, false),
          sourceKey,
          targetKey: null,
          remapped: false,
          mappingConfidence: issue?.mapping.confidence || 'none',
          detail
        })
        continue
      }

      const mappedMedia = issue
        ? cloneMediaWithMapping(originalMedia, issue.mapping)
        : { ...originalMedia, ids: cloneMediaIds(originalMedia.ids) }
      const targetKey = canonicalRecordKey(mappedMedia)

      if (!targetKey) {
        stats.unresolved++
        stats.skipped++
        rows.push({
          stableKey: mediaLocator(originalMedia),
          sequence: sequence++,
          scope,
          mediaKind: originalMedia.kind,
          title: displayTitle(originalMedia),
          outcome: 'unresolved',
          outcomeLabel: outcomeLabel('unresolved', false),
          sourceKey,
          targetKey: null,
          remapped: false,
          mappingConfidence: issue?.mapping.confidence || 'none',
          detail: issue?.mapping.reason || 'The mapped record has no canonical destination key.'
        })
        continue
      }

      const plannedRecord = cloneRecordWithMedia(scope, sourceRecord, mappedMedia)
      const destinationRecord = scope === 'history' && historyWriteMode === 'events'
        ? findDestinationHistoryEvent(
            destinationByScope.history,
            mappedMedia,
            (plannedRecord as HistoryRecord).watchedAt,
            consumedHistoryEvents
          )
        : findDestinationRecord(destinationByScope[scope], mappedMedia, scope)
      let outcome = classifyRecord(scope, plannedRecord, destinationRecord)
      if (
        scope === 'library'
        && input.destinationService === 'nuvio'
        && recordAliasKeys(mappedMedia).some(alias => duplicateNuvioLibraryAliases.has(alias))
      ) {
        outcome = 'update'
      }
      // Existing destination records are authoritative. Provider ID, title, and
      // absolute-number translations must neither overwrite them nor count as a
      // remap. Only a newly added record with changed visible coordinates is a
      // genuine episode remap.
      const remapped = Boolean(
        !destinationRecord
        && issue?.mapping.status === 'mapped'
        && episodeCoordinatesChanged(originalMedia, mappedMedia)
      )
      stats[outcome === 'already-present' ? 'alreadyPresent' : outcome]++
      if (remapped) stats.remapped++
      if (outcome === 'add' || outcome === 'update') {
        // Existing history and Continue Watching entries change sync state only.
        // Preserve the destination provider's established identity and metadata.
        const transferRecord = scope !== 'library' && destinationRecord
          ? cloneRecordWithMedia(scope, plannedRecord, destinationRecord.media)
          : plannedRecord
        pushTransferRecord(transfer, scope, transferRecord)
      }

      rows.push({
        stableKey: targetKey,
        sequence: sequence++,
        scope,
        mediaKind: destinationRecord?.media.kind || mappedMedia.kind,
        title: displayTitle(destinationRecord?.media || mappedMedia),
        outcome,
        outcomeLabel: outcomeLabel(outcome, remapped),
        sourceKey,
        targetKey,
        remapped,
        mappingConfidence: issue?.mapping.confidence || null,
        detail: destinationRecord
          ? outcome === 'already-present'
            ? 'Destination item already exists and is unchanged.'
            : 'Destination item already exists; only its sync state will be updated.'
          : issue?.mapping.reason || outcomeLabel(outcome, false)
      })
    }
  }

  const result: MediaBridgePreviewPlan = {
    transfer: dedupeBundle(transfer),
    rows: stableRows(rows),
    stats
  }
  return deepFreeze(result)
}
