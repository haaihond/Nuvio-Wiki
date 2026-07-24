import { strFromU8, unzipSync, type Unzipped } from 'fflate'
import {
  createEmptyBundle,
  type CanonicalBundle,
  type MediaRef,
  type RecordProvenance
} from './core.ts'

const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024
const MAX_EXPANDED_BYTES = 256 * 1024 * 1024
const MAX_JSON_BYTES = 64 * 1024 * 1024

export interface TraktExportParseResult {
  bundle: CanonicalBundle
  parsedFiles: string[]
  warnings: string[]
}

interface TraktExportOptions {
  accountId?: string
}

function basename(path: string): string {
  return path.replace(/\\/g, '/').split('/').pop()?.toLowerCase() || ''
}

function rows(value: unknown): any[] {
  if (Array.isArray(value)) return value
  if (!value || typeof value !== 'object') return []
  const record = value as Record<string, unknown>
  for (const key of ['items', 'data', 'results']) {
    if (Array.isArray(record[key])) return record[key] as any[]
  }
  return []
}

function epochMs(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 10_000_000_000 ? value : value * 1000
  }
  const parsed = Date.parse(String(value || ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function ids(value: any): MediaRef['ids'] {
  const raw = value?.ids || value || {}
  const output: MediaRef['ids'] = {}
  for (const key of ['imdb', 'tmdb', 'tvdb', 'trakt'] as const) {
    const id = raw?.[key] ?? raw?.[`${key}_id`]
    if (id !== undefined && id !== null && String(id).trim()) output[key] = id
  }
  if (raw?.slug) output.slug = String(raw.slug)
  return output
}

function media(value: any, kind: 'movie' | 'series'): MediaRef {
  return {
    kind,
    ids: ids(value),
    title: value?.title,
    year: Number(value?.year) || undefined
  }
}

function episodeMedia(item: any): MediaRef | null {
  const episode = item?.episode
  const show = item?.show
  const season = Number(episode?.season)
  const number = Number(episode?.number)
  if (!episode || !show || !Number.isInteger(season) || season < 0 || !Number.isInteger(number) || number < 1) {
    return null
  }
  const traktId = Number(episode?.ids?.trakt)
  const tvdbId = Number(episode?.ids?.tvdb)
  const tmdbId = Number(episode?.ids?.tmdb)
  return {
    ...media(show, 'series'),
    season,
    episode: number,
    absoluteEpisode: Number(episode?.number_abs) || undefined,
    episodeTitle: episode?.title,
    videoId: Number.isSafeInteger(traktId) && traktId > 0
      ? `trakt:${traktId}`
      : Number.isSafeInteger(tvdbId) && tvdbId > 0
        ? `tvdb:${tvdbId}`
        : Number.isSafeInteger(tmdbId) && tmdbId > 0
          ? `tmdb:${tmdbId}`
          : undefined
  }
}

function addHistoryRow(
  bundle: CanonicalBundle,
  item: any,
  provenance: RecordProvenance
): boolean {
  const watchedAt = epochMs(item?.watched_at || item?.last_watched_at)
  if (item?.movie) {
    bundle.history.push({
      media: media(item.movie, 'movie'),
      watchedAt,
      eventId: typeof item.id === 'string' || typeof item.id === 'number' ? item.id : undefined,
      playCount: Number(item.plays) || 1,
      source: provenance
    })
    return true
  }
  const episode = episodeMedia(item)
  if (!episode) return false
  bundle.history.push({
    media: episode,
    watchedAt,
    eventId: typeof item.id === 'string' || typeof item.id === 'number' ? item.id : undefined,
    playCount: Number(item.plays) || 1,
    source: provenance
  })
  return true
}

function parseWatchedSummaries(
  bundle: CanonicalBundle,
  files: Map<string, any[]>,
  provenance: RecordProvenance
) {
  for (const item of files.get('watched-movies.json') || []) addHistoryRow(bundle, item, provenance)
  for (const item of files.get('watched-shows.json') || []) {
    for (const season of item?.seasons || []) {
      for (const episode of season?.episodes || []) {
        addHistoryRow(bundle, {
          show: item.show,
          episode: { ...episode, season: season.number },
          watched_at: episode.last_watched_at || item.last_watched_at,
          plays: episode.plays
        }, provenance)
      }
    }
  }
}

function parseProgress(
  bundle: CanonicalBundle,
  items: any[],
  provenance: RecordProvenance
) {
  for (const item of items) {
    const percentage = Number(item?.progress)
    if (!Number.isFinite(percentage) || percentage <= 0) continue
    const isMovie = Boolean(item?.movie) || item?.type === 'movie'
    const itemMedia = isMovie ? media(item.movie, 'movie') : episodeMedia(item)
    if (!itemMedia) continue
    const runtimeMinutes = Number(item?.movie?.runtime || item?.episode?.runtime)
    const normalized = Math.min(100, percentage)
    bundle.progress.push({
      media: itemMedia,
      ...(runtimeMinutes > 0
        ? {
            positionMs: Math.round(runtimeMinutes * 60_000 * normalized / 100),
            durationMs: runtimeMinutes * 60_000
          }
        : {}),
      percentage: normalized,
      updatedAt: epochMs(item?.paused_at || item?.updated_at),
      source: provenance
    })
  }
}

function parseLibrary(
  bundle: CanonicalBundle,
  items: any[],
  listKind: 'watchlist' | 'collection',
  provenance: RecordProvenance
) {
  for (const item of items) {
    const kind = item?.movie || item?.type === 'movie' ? 'movie' : 'series'
    const value = kind === 'movie' ? item?.movie : item?.show
    if (!value) continue
    bundle.library.push({
      media: media(value, kind),
      addedAt: epochMs(item?.listed_at || item?.collected_at || item?.updated_at),
      lists: [{ ...provenance, kind: listKind }],
      source: provenance
    })
  }
}

export function parseTraktExportEntries(
  entries: Unzipped,
  options: TraktExportOptions = {}
): TraktExportParseResult {
  const bundle = createEmptyBundle()
  const warnings: string[] = []
  const parsedFiles: string[] = []
  const files = new Map<string, any[]>()
  const provenance: RecordProvenance = {
    service: 'trakt',
    accountId: options.accountId || 'trakt-export'
  }

  for (const [path, bytes] of Object.entries(entries)) {
    const name = basename(path)
    if (!name.endsWith('.json') || bytes.length > MAX_JSON_BYTES) continue
    try {
      files.set(name, rows(JSON.parse(strFromU8(bytes))))
      parsedFiles.push(path)
    } catch {
      warnings.push(`Skipped ${path} because it is not valid Trakt JSON.`)
    }
  }

  const historyFiles = [...files.entries()].filter(([name]) => (
    /^(?:watched-)?history(?:-\d+)?\.json$/.test(name)
  ))
  let historyRows = 0
  for (const [, items] of historyFiles) {
    for (const item of items) historyRows += Number(addHistoryRow(bundle, item, provenance))
  }
  if (!historyRows) parseWatchedSummaries(bundle, files, provenance)

  for (const [name, items] of files) {
    if (/^(?:playback|progress)(?:-\d+)?\.json$/.test(name)) {
      parseProgress(bundle, items, provenance)
    } else if (/^watchlist(?:-(?:movies|shows|\d+))?\.json$/.test(name)) {
      parseLibrary(bundle, items, 'watchlist', provenance)
    } else if (/^collection-(?:movies|shows)(?:-\d+)?\.json$/.test(name)) {
      parseLibrary(bundle, items, 'collection', provenance)
    }
  }

  if (!parsedFiles.length) {
    throw new Error('This ZIP does not contain readable JSON files from a Trakt data export.')
  }
  if (!bundle.history.length && !bundle.progress.length && !bundle.library.length) {
    throw new Error('No watch history, playback progress, watchlist, or collection was found in this Trakt export.')
  }
  return { bundle, parsedFiles, warnings }
}

export async function parseTraktExportZip(
  file: File,
  options: TraktExportOptions = {}
): Promise<TraktExportParseResult> {
  if (!/\.zip$/i.test(file.name)) throw new Error('Choose the .zip file downloaded from Trakt.')
  if (file.size > MAX_ARCHIVE_BYTES) throw new Error('This Trakt ZIP is larger than the 64 MB import limit.')

  let expandedBytes = 0
  let expandedTooLarge = false
  const entries = unzipSync(new Uint8Array(await file.arrayBuffer()), {
    filter: entry => {
      expandedBytes += entry.originalSize
      if (expandedBytes > MAX_EXPANDED_BYTES) expandedTooLarge = true
      return !expandedTooLarge && entry.name.toLowerCase().endsWith('.json')
    }
  })
  if (expandedTooLarge) throw new Error('This Trakt ZIP expands beyond the 256 MB import limit.')
  return parseTraktExportEntries(entries, options)
}
