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
  type ConnectedEndpoint,
  type EpisodeMappingEvidence,
  type EpisodeRef,
  type EpisodeSequenceAnchor,
  type EpisodeSimilarityMatch,
  type HistoryRecord,
  type LibraryRecord,
  type MappingConfidence,
  type MappingOutcome,
  type MediaIds,
  type MediaRef,
  type ProgressRecord,
  type ServiceId,
  type SyncScopes
} from './core.ts'
import {
  canonicalIdentityKey,
  identityAliasKeys,
  titleYearIdentityKeys,
  type IdentityContext
} from './identity.ts'

export type PreviewOutcome = 'add' | 'update' | 'already-present' | 'unresolved' | 'ambiguous'

export interface ProviderMappingIssue {
  scope: BridgeScope
  sourceMedia: MediaRef
  mapping: MappingOutcome
}

export type PreviewDiagnosticKey =
  | 'sourceEpisode'
  | 'resolvedSource'
  | 'episodeTitle'
  | 'videoId'
  | 'mediaIds'
  | 'canonicalKey'
  | 'catalogSizes'
  | 'videoIdMatches'
  | 'coordinateMatches'
  | 'absoluteMatches'
  | 'titleMatches'
  | 'fuzzyTitleMatches'
  | 'sequenceCandidate'
  | 'sequenceAnchors'
  | 'updateReason'
  | 'sourceState'
  | 'destinationState'
  | 'changes'
  | 'sourceIds'
  | 'destinationIds'

export interface PreviewDiagnostic {
  readonly key: PreviewDiagnosticKey
  readonly value: string
}

export interface PreviewRow {
  readonly id: string
  readonly scope: BridgeScope
  readonly media: MediaRef
  readonly mediaKind: MediaRef['kind']
  readonly title: string
  readonly episodeLabel: string | null
  readonly outcome: PreviewOutcome
  readonly outcomeLabel: string
  readonly sourceKey: string | null
  readonly targetKey: string | null
  readonly remapped: boolean
  readonly mappingConfidence: MappingConfidence | null
  readonly detail: string
  readonly diagnostics: readonly PreviewDiagnostic[]
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
  sourceEndpoint?: ConnectedEndpoint
  destinationEndpoint?: ConnectedEndpoint
  destinationDuplicateAliases?: readonly string[]
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

function canonicalRecordKey(media: MediaRef, context: IdentityContext = {}): string | null {
  return canonicalIdentityKey(media, context)
    || canonicalEpisodeKey(media)
    || canonicalMediaKey(media)
}

function recordAliasKeys(media: MediaRef, context: IdentityContext = {}): string[] {
  const aliases = identityAliasKeys(media, context)
  if (aliases.length) return aliases
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

function recordComparisonKeys(
  media: MediaRef,
  includeTitleYear = false,
  context: IdentityContext = {}
): string[] {
  // Provider IDs describe the same title in different namespaces. Keep them as
  // the strongest match. Continue Watching may also use title/year (plus
  // episode coordinates) because providers do not always share an external ID.
  const semanticKeys = includeTitleYear
    ? [...titleYearRecordKeys(media), ...titleYearIdentityKeys(media)]
    : []
  return [...new Set([...recordAliasKeys(media, context), ...semanticKeys])]
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

function episodeCoordinates(media: Pick<MediaRef, 'kind' | 'season' | 'episode'>): string | null {
  if (
    media.kind !== 'series'
    || !Number.isInteger(media.season)
    || !Number.isInteger(media.episode)
  ) return null
  return `S${String(media.season).padStart(2, '0')}E${String(media.episode).padStart(2, '0')}`
}

function episodeLabel(media: MediaRef): string | null {
  const coordinates = episodeCoordinates(media)
  if (!coordinates) return null
  const title = String(media.episodeTitle || '').trim()
  return title ? `${coordinates} · ${title}` : coordinates
}

function episodeRefLabel(episode: EpisodeRef | null | undefined): string {
  if (!episode) return 'Unavailable'
  const coordinates = Number.isInteger(episode.season) && Number.isInteger(episode.episode)
    ? `S${String(episode.season).padStart(2, '0')}E${String(episode.episode).padStart(2, '0')}`
    : 'No season/episode coordinates'
  const parts = [coordinates]
  if (episode.title) parts.push(`“${episode.title}”`)
  if (Number.isInteger(episode.absoluteEpisode)) parts.push(`absolute ${episode.absoluteEpisode}`)
  if (episode.videoId) parts.push(`video ID ${episode.videoId}`)
  return parts.join(' · ')
}

function episodeRefsLabel(episodes: readonly EpisodeRef[]): string {
  return episodes.length ? episodes.map(episodeRefLabel).join(' | ') : 'None'
}

function similarityMatchesLabel(matches: readonly EpisodeSimilarityMatch[]): string {
  return matches.length
    ? matches.map(match => (
        `${episodeRefLabel(match.episode)} · ${(match.similarity * 100).toFixed(1)}% similar`
      )).join(' | ')
    : 'None'
}

function sequenceAnchorsLabel(anchors: readonly EpisodeSequenceAnchor[]): string {
  return anchors.length
    ? anchors.map(anchor => (
        `${episodeRefLabel(anchor.source)} [source position ${anchor.sourceIndex + 1}] → `
        + `${episodeRefLabel(anchor.target)} [destination position ${anchor.targetIndex + 1}]`
      )).join(' | ')
    : 'None'
}

function mediaIdsLabel(ids: MediaIds): string {
  const values: string[] = []
  for (const namespace of ['imdb', 'tmdb', 'tvdb', 'trakt', 'simkl', 'plex', 'jellyfin', 'stremio', 'slug'] as const) {
    const value = ids[namespace]
    if (value !== undefined && value !== null && String(value).trim()) {
      values.push(`${namespace}:${value}`)
    }
  }
  for (const [namespace, value] of Object.entries(ids.external || {}).sort(([left], [right]) => left.localeCompare(right))) {
    if (value !== undefined && value !== null && String(value).trim()) {
      values.push(`${namespace}:${value}`)
    }
  }
  return values.length ? values.join(', ') : 'None'
}

function mappingEvidenceDiagnostics(
  media: MediaRef,
  sourceKey: string | null,
  evidence?: EpisodeMappingEvidence
): PreviewDiagnostic[] {
  const diagnostics: PreviewDiagnostic[] = []
  const sourceEpisode = evidence?.requested || (
    media.kind === 'series'
      ? {
          season: Number(media.season),
          episode: Number(media.episode),
          absoluteEpisode: media.absoluteEpisode,
          title: media.episodeTitle,
          videoId: media.videoId
        }
      : null
  )
  if (media.kind === 'series') {
    diagnostics.push({ key: 'sourceEpisode', value: episodeRefLabel(sourceEpisode) })
  }
  if (evidence?.resolvedSource) {
    diagnostics.push({ key: 'resolvedSource', value: episodeRefLabel(evidence.resolvedSource) })
  }
  if (media.episodeTitle) diagnostics.push({ key: 'episodeTitle', value: media.episodeTitle })
  if (media.videoId) diagnostics.push({ key: 'videoId', value: media.videoId })
  diagnostics.push({ key: 'mediaIds', value: mediaIdsLabel(media.ids) })
  diagnostics.push({ key: 'canonicalKey', value: sourceKey || 'Unavailable' })
  if (evidence) {
    diagnostics.push({
      key: 'catalogSizes',
      value: `${evidence.sourceCatalogSize} source / ${evidence.destinationCatalogSize} destination episodes`
    })
    diagnostics.push({ key: 'videoIdMatches', value: episodeRefsLabel(evidence.videoIdMatches) })
    diagnostics.push({ key: 'coordinateMatches', value: episodeRefsLabel(evidence.coordinateMatches) })
    diagnostics.push({ key: 'absoluteMatches', value: episodeRefsLabel(evidence.absoluteMatches) })
    diagnostics.push({ key: 'titleMatches', value: episodeRefsLabel(evidence.titleMatches) })
    if (evidence.fuzzyTitleMatches) {
      diagnostics.push({
        key: 'fuzzyTitleMatches',
        value: similarityMatchesLabel(evidence.fuzzyTitleMatches)
      })
    }
    if (evidence.sequenceCandidate !== undefined) {
      diagnostics.push({
        key: 'sequenceCandidate',
        value: episodeRefLabel(evidence.sequenceCandidate)
      })
    }
    if (evidence.sequenceAnchors) {
      diagnostics.push({
        key: 'sequenceAnchors',
        value: sequenceAnchorsLabel(evidence.sequenceAnchors)
      })
    }
  }
  return diagnostics
}

function timestampLabel(value: number): string {
  if (!Number.isFinite(value)) return 'Unavailable'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? `${value} ms`
    : `${date.toISOString()} (${value} ms)`
}

function progressStateLabel(record: ProgressRecord): string {
  const parts: string[] = []
  const percentage = progressPercentage(record)
  if (percentage !== null) parts.push(`${percentage.toFixed(2)}%`)
  if (Number.isFinite(Number(record.positionMs))) parts.push(`position ${record.positionMs} ms`)
  if (Number.isFinite(Number(record.durationMs))) parts.push(`duration ${record.durationMs} ms`)
  parts.push(`updated ${timestampLabel(record.updatedAt)}`)
  return parts.join(' · ')
}

function listProvenanceLabel(record: LibraryRecord): string {
  if (!record.lists.length) return 'None'
  return record.lists.map(list => {
    const details = [list.service, list.kind]
    if (list.name) details.push(`“${list.name}”`)
    if (list.listId) details.push(`ID ${list.listId}`)
    return details.join(' · ')
  }).join(' | ')
}

function libraryComparison(
  source: LibraryRecord,
  destination: LibraryRecord
): { missing: string[]; sourceKeys: string[]; destinationKeys: string[] } {
  const collapseGenericMembership = !(
    hasOnlyTraktProvenance(source) && hasOnlyTraktProvenance(destination)
  )
  const sourceKeys = listIdentity(source, collapseGenericMembership)
  const destinationKeys = listIdentity(destination, collapseGenericMembership)
  const destinationSet = new Set(destinationKeys)
  return {
    missing: sourceKeys.filter(list => !destinationSet.has(list)),
    sourceKeys,
    destinationKeys
  }
}

function updateDiagnostics(
  scope: BridgeScope,
  source: ScopedRecord,
  destination: ScopedRecord,
  options: { nuvioDuplicateCleanup: boolean }
): PreviewDiagnostic[] {
  const diagnostics: PreviewDiagnostic[] = []
  const reasons: string[] = []
  const changes: string[] = []

  if (scope === 'history') {
    const sourceHistory = source as HistoryRecord
    const destinationHistory = destination as HistoryRecord
    reasons.push('The source watched timestamp is newer.')
    changes.push(
      `watchedAt: ${timestampLabel(destinationHistory.watchedAt)} → ${timestampLabel(sourceHistory.watchedAt)}`
    )
    diagnostics.push(
      { key: 'sourceState', value: `watched ${timestampLabel(sourceHistory.watchedAt)}` },
      { key: 'destinationState', value: `watched ${timestampLabel(destinationHistory.watchedAt)}` }
    )
  } else if (scope === 'progress') {
    const sourceProgress = source as ProgressRecord
    const destinationProgress = destination as ProgressRecord
    reasons.push(
      sourceProgress.updatedAt > destinationProgress.updatedAt
        ? 'The source playback state is newer and differs beyond the sync tolerance.'
        : 'The source playback position differs beyond the sync tolerance.'
    )
    const sourcePercentage = progressPercentage(sourceProgress)
    const destinationPercentage = progressPercentage(destinationProgress)
    if (
      sourcePercentage !== null
      && destinationPercentage !== null
      && sourcePercentage !== destinationPercentage
    ) {
      changes.push(`progress: ${destinationPercentage.toFixed(2)}% → ${sourcePercentage.toFixed(2)}%`)
    }
    if (sourceProgress.positionMs !== destinationProgress.positionMs) {
      changes.push(`positionMs: ${destinationProgress.positionMs ?? 'none'} → ${sourceProgress.positionMs ?? 'none'}`)
    }
    if (sourceProgress.durationMs !== destinationProgress.durationMs) {
      changes.push(`durationMs: ${destinationProgress.durationMs ?? 'none'} → ${sourceProgress.durationMs ?? 'none'}`)
    }
    if (sourceProgress.updatedAt !== destinationProgress.updatedAt) {
      changes.push(
        `updatedAt: ${timestampLabel(destinationProgress.updatedAt)} → ${timestampLabel(sourceProgress.updatedAt)}`
      )
    }
    diagnostics.push(
      { key: 'sourceState', value: progressStateLabel(sourceProgress) },
      { key: 'destinationState', value: progressStateLabel(destinationProgress) }
    )
  } else {
    const sourceLibrary = source as LibraryRecord
    const destinationLibrary = destination as LibraryRecord
    const lists = libraryComparison(sourceLibrary, destinationLibrary)
    if (needsNuvioLibraryImdbUpgrade(sourceLibrary, destinationLibrary)) {
      reasons.push('The existing Nuvio item uses a non-IMDb identity and will be migrated to IMDb.')
      changes.push(
        `destination identity: ${mediaIdsLabel(destinationLibrary.media.ids)} → ${mediaIdsLabel(sourceLibrary.media.ids)}`
      )
    }
    if (options.nuvioDuplicateCleanup) {
      reasons.push('The destination contains duplicate Nuvio identities for this title.')
      changes.push('collapse duplicate destination rows into the canonical IMDb identity')
    }
    if (sourceLibrary.addedAt > destinationLibrary.addedAt) {
      reasons.push('The source saved-title timestamp is newer.')
      changes.push(
        `addedAt: ${timestampLabel(destinationLibrary.addedAt)} → ${timestampLabel(sourceLibrary.addedAt)}`
      )
    }
    if (lists.missing.length) {
      reasons.push('The destination is missing source list membership.')
      changes.push(`add memberships: ${lists.missing.join(', ')}; preserve destination-only memberships`)
    }
    diagnostics.push(
      {
        key: 'sourceState',
        value: `added ${timestampLabel(sourceLibrary.addedAt)} · memberships ${listProvenanceLabel(sourceLibrary)}`
      },
      {
        key: 'destinationState',
        value: `added ${timestampLabel(destinationLibrary.addedAt)} · memberships ${listProvenanceLabel(destinationLibrary)}`
      }
    )
  }

  diagnostics.unshift({ key: 'updateReason', value: reasons.join(' ') || 'The source sync state differs.' })
  diagnostics.push(
    { key: 'changes', value: changes.join(' | ') || 'Provider sync state will be refreshed.' },
    { key: 'sourceIds', value: mediaIdsLabel(source.media.ids) },
    { key: 'destinationIds', value: mediaIdsLabel(destination.media.ids) }
  )
  return diagnostics
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

function destinationIndexes(
  bundle: CanonicalBundle,
  context: IdentityContext
): Record<BridgeScope, DestinationIndex> {
  const result = {
    history: new Map<string, ScopedRecord[]>(),
    progress: new Map<string, ScopedRecord[]>(),
    library: new Map<string, ScopedRecord[]>()
  }
  for (const scope of Object.keys(result) as BridgeScope[]) {
    for (const record of recordsForScope(bundle, scope)) {
      for (const key of recordComparisonKeys(record.media, true, context)) {
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
  scope: BridgeScope,
  context: IdentityContext
): ScopedRecord | undefined {
  for (const key of recordComparisonKeys(media, false, context)) {
    const record = index.get(key)?.[0]
    if (record) return record
  }
  for (const key of titleYearIdentityKeys(media)) {
    const candidates = index.get(key) || []
    if (candidates.length === 1) return candidates[0]
  }
  return undefined
}

function findDestinationHistoryEvent(
  index: DestinationIndex,
  media: MediaRef,
  watchedAt: number,
  consumed: Set<ScopedRecord>,
  context: IdentityContext
): HistoryRecord | undefined {
  const candidates = new Set<ScopedRecord>()
  for (const key of recordComparisonKeys(media, false, context)) {
    for (const candidate of index.get(key) || []) candidates.add(candidate)
  }
  if (!candidates.size) {
    for (const key of titleYearIdentityKeys(media)) {
      const titleCandidates = index.get(key) || []
      if (titleCandidates.length === 1) candidates.add(titleCandidates[0])
    }
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
  const sourceIdentity: IdentityContext = { endpoint: input.sourceEndpoint }
  const destinationIdentity: IdentityContext = { endpoint: input.destinationEndpoint }
  const historyWriteMode = input.destinationService
    ? SERVICE_DEFINITIONS[input.destinationService].capabilities.historyWriteMode
    : 'state'
  const source = dedupeBundle(input.source)
  const duplicateNuvioLibraryAliases = new Set<string>(input.destinationDuplicateAliases || [])
  if (input.destinationService === 'nuvio') {
    const aliasCounts = new Map<string, number>()
    for (const record of input.destination.library) {
      for (const alias of recordAliasKeys(record.media, destinationIdentity)) {
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
  const destinationByScope = destinationIndexes(destination, destinationIdentity)
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
      const sourceKey = canonicalRecordKey(originalMedia, sourceIdentity)
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
          media: originalMedia,
          mediaKind: originalMedia.kind,
          title: displayTitle(originalMedia),
          episodeLabel: episodeLabel(originalMedia),
          outcome,
          outcomeLabel: outcomeLabel(outcome, false),
          sourceKey,
          targetKey: null,
          remapped: false,
          mappingConfidence: issue?.mapping.confidence || 'none',
          detail,
          diagnostics: mappingEvidenceDiagnostics(
            originalMedia,
            sourceKey,
            issue?.mapping.evidence
          )
        })
        continue
      }

      const mappedMedia = issue
        ? cloneMediaWithMapping(originalMedia, issue.mapping)
        : { ...originalMedia, ids: cloneMediaIds(originalMedia.ids) }
      const targetKey = canonicalRecordKey(mappedMedia, sourceIdentity)

      if (!targetKey) {
        stats.unresolved++
        stats.skipped++
        rows.push({
          stableKey: mediaLocator(originalMedia),
          sequence: sequence++,
          scope,
          media: originalMedia,
          mediaKind: originalMedia.kind,
          title: displayTitle(originalMedia),
          episodeLabel: episodeLabel(originalMedia),
          outcome: 'unresolved',
          outcomeLabel: outcomeLabel('unresolved', false),
          sourceKey,
          targetKey: null,
          remapped: false,
          mappingConfidence: issue?.mapping.confidence || 'none',
          detail: issue?.mapping.reason || 'The mapped record has no canonical destination key.',
          diagnostics: mappingEvidenceDiagnostics(
            originalMedia,
            sourceKey,
            issue?.mapping.evidence
          )
        })
        continue
      }

      const plannedRecord = cloneRecordWithMedia(scope, sourceRecord, mappedMedia)
      const destinationRecord = scope === 'history' && historyWriteMode === 'events'
        ? findDestinationHistoryEvent(
            destinationByScope.history,
            mappedMedia,
            (plannedRecord as HistoryRecord).watchedAt,
            consumedHistoryEvents,
            sourceIdentity
          )
        : findDestinationRecord(destinationByScope[scope], mappedMedia, scope, sourceIdentity)
      let outcome = classifyRecord(scope, plannedRecord, destinationRecord)
      const nuvioDuplicateCleanup = Boolean(
        scope === 'library'
        && input.destinationService === 'nuvio'
        && recordAliasKeys(mappedMedia, sourceIdentity).some(alias => duplicateNuvioLibraryAliases.has(alias))
      )
      if (nuvioDuplicateCleanup) {
        outcome = 'update'
      }
      const diagnostics = outcome === 'update' && destinationRecord
        ? updateDiagnostics(scope, plannedRecord, destinationRecord, { nuvioDuplicateCleanup })
        : []
      const updateReason = diagnostics.find(diagnostic => diagnostic.key === 'updateReason')?.value
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
        media: destinationRecord?.media || mappedMedia,
        mediaKind: destinationRecord?.media.kind || mappedMedia.kind,
        title: displayTitle(destinationRecord?.media || mappedMedia),
        episodeLabel: episodeLabel(destinationRecord?.media || mappedMedia),
        outcome,
        outcomeLabel: outcomeLabel(outcome, remapped),
        sourceKey,
        targetKey,
        remapped,
        mappingConfidence: issue?.mapping.confidence || null,
        detail: destinationRecord
          ? outcome === 'already-present'
            ? 'Destination item already exists and is unchanged.'
            : updateReason || 'Destination item already exists; only its sync state will be updated.'
          : issue?.mapping.reason || outcomeLabel(outcome, false),
        diagnostics
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
