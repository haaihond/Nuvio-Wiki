import type {
  CanonicalBundle,
  ConnectedEndpoint,
  MediaIds,
  MediaRef
} from './core.ts'

export type IdentityNamespace =
  | 'imdb'
  | 'tmdb'
  | 'tvdb'
  | 'trakt'
  | 'simkl'
  | 'stremio'
  | 'slug'
  | 'plex'
  | 'jellyfin'
  | `external:${string}`

export interface IdentityContext {
  endpoint?: Pick<ConnectedEndpoint, 'service' | 'accountId' | 'profileId' | 'serverId'> | null
}

export interface IdentityAlias {
  namespace: IdentityNamespace
  qualifiedNamespace: string
  value: string
  key: string
  local: boolean
}

export interface IdentityConflict {
  left: number
  right: number
  namespaces: string[]
  reason: string
}

export interface CoalescedMediaRefs {
  media: MediaRef[]
  keys: Array<string | null>
  conflicts: IdentityConflict[]
}

export interface CoalescedBundle {
  bundle: CanonicalBundle
  conflicts: IdentityConflict[]
}

function text(value: unknown): string {
  return String(value ?? '').trim()
}

function folded(value: unknown): string {
  return text(value).toLocaleLowerCase('en-US')
}

function numericId(value: unknown): string {
  const normalized = text(value)
  if (!/^\d+$/.test(normalized)) return ''
  return normalized.replace(/^0+(?=\d)/, '')
}

function imdbId(value: unknown): string {
  const normalized = folded(value)
  return /^tt\d+$/.test(normalized) ? normalized : ''
}

function stremioContentId(value: unknown): string {
  const normalized = text(value)
  const match = /^(.*):(\d+):(\d+)$/.exec(normalized)
  return folded(match?.[1] || normalized)
}

function endpointScope(
  service: 'plex' | 'jellyfin',
  context: IdentityContext
): string | null {
  const endpoint = context.endpoint
  if (!endpoint || endpoint.service !== service) return null
  const serverId = folded(endpoint.serverId)
  if (!serverId) return null
  return encodeURIComponent(serverId)
}

function baseAliases(media: MediaRef, context: IdentityContext): IdentityAlias[] {
  const aliases: IdentityAlias[] = []
  const seen = new Set<string>()
  const add = (
    namespace: IdentityNamespace,
    value: string,
    local = false,
    scope?: string | null
  ) => {
    if (!value) return
    const scopedNamespace = local && scope ? `${namespace}@${scope}` : namespace
    const key = `${media.kind}:${scopedNamespace}:${encodeURIComponent(value)}`
    if (seen.has(key)) return
    seen.add(key)
    aliases.push({ namespace, qualifiedNamespace: scopedNamespace, value, key, local })
  }

  const stremio = stremioContentId(media.ids.stremio)
  add('imdb', imdbId(media.ids.imdb) || imdbId(stremio))
  add('tmdb', numericId(media.ids.tmdb))
  add('tvdb', numericId(media.ids.tvdb))
  add('trakt', numericId(media.ids.trakt))
  add('simkl', numericId(media.ids.simkl))
  add('stremio', stremio)
  add('slug', folded(media.ids.slug))
  add('plex', folded(media.ids.plex), true, endpointScope('plex', context))
  add('jellyfin', folded(media.ids.jellyfin), true, endpointScope('jellyfin', context))

  for (const [rawNamespace, rawValue] of Object.entries(media.ids.external || {})) {
    const namespace = folded(rawNamespace)
    const value = folded(rawValue)
    if (!namespace || !value) continue
    add(`external:${encodeURIComponent(namespace)}`, value)
  }
  return aliases
}

function normalizedTitle(value: unknown): string {
  return text(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en-US')
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
}

function episodeTokens(media: MediaRef): string[] {
  if (media.kind !== 'series') return []
  const tokens: string[] = []
  const season = Number(media.season)
  const episode = Number(media.episode)
  if (Number.isInteger(season) && season >= 0 && Number.isInteger(episode) && episode > 0) {
    tokens.push(`season:${season}:episode:${episode}`)
  }
  const absolute = Number(media.absoluteEpisode)
  if (Number.isInteger(absolute) && absolute > 0) tokens.push(`absolute:${absolute}`)
  const videoId = folded(media.videoId)
  if (videoId) tokens.push(`video:${encodeURIComponent(videoId)}`)
  return [...new Set(tokens)]
}

/**
 * Returns namespace-qualified aliases suitable for cross-provider matching.
 * Episode identities are always qualified by a parent-title alias so episodes
 * from the same show cannot collapse into one record.
 */
export function identityAliases(
  media: MediaRef,
  context: IdentityContext = {}
): IdentityAlias[] {
  const bases = baseAliases(media, context)
  const tokens = episodeTokens(media)
  if (!tokens.length) return bases
  return bases.flatMap(base => tokens.map(token => ({
    ...base,
    key: `${base.key}:${token}`
  })))
}

export function identityAliasKeys(
  media: MediaRef,
  context: IdentityContext = {}
): string[] {
  return identityAliases(media, context).map(alias => alias.key)
}

export function titleYearIdentityKeys(media: MediaRef): string[] {
  const title = normalizedTitle(media.title)
  const year = Number(media.year)
  if (!title || !Number.isInteger(year) || year <= 0) return []
  const base = `${media.kind}:title:${title}:${year}`
  const tokens = episodeTokens(media)
  if (!tokens.length && media.kind === 'series') {
    const episodeTitle = normalizedTitle(media.episodeTitle)
    if (episodeTitle && !/^(episode|ep|e|chapter|aflevering)-?\d+$/.test(episodeTitle)) {
      tokens.push(`title:${episodeTitle}`)
    }
  }
  return tokens.length ? tokens.map(token => `${base}:${token}`) : [base]
}

export function canonicalIdentityKey(
  media: MediaRef,
  context: IdentityContext = {}
): string | null {
  return identityAliasKeys(media, context)[0] || titleYearIdentityKeys(media)[0] || null
}

function cloneMedia(media: MediaRef): MediaRef {
  const ids: MediaIds = { ...media.ids }
  if (media.ids.external) ids.external = { ...media.ids.external }
  return {
    ...media,
    ids
  }
}

function mergeIds(target: MediaIds, source: MediaIds): void {
  const keys: Array<Exclude<keyof MediaIds, 'external'>> = [
    'imdb',
    'tmdb',
    'tvdb',
    'trakt',
    'simkl',
    'plex',
    'jellyfin',
    'stremio',
    'slug'
  ]
  for (const key of keys) {
    if (
      (target[key] === undefined || target[key] === '')
      && source[key] !== undefined
      && source[key] !== ''
    ) {
      ;(target as Record<string, unknown>)[key] = source[key]
    }
  }
  if (source.external) {
    target.external = { ...(target.external || {}) }
    for (const [namespace, value] of Object.entries(source.external)) {
      if (target.external[namespace] === undefined) target.external[namespace] = value
    }
  }
}

function richerText(left: string | undefined, right: string | undefined): string | undefined {
  const a = text(left)
  const b = text(right)
  if (!a) return b || undefined
  if (!b) return a
  return b.length > a.length ? b : a
}

function mergeMedia(target: MediaRef, source: MediaRef): void {
  mergeIds(target.ids, source.ids)
  target.title = richerText(target.title, source.title)
  target.episodeTitle = richerText(target.episodeTitle, source.episodeTitle)
  target.year ??= source.year
  target.season ??= source.season
  target.episode ??= source.episode
  target.absoluteEpisode ??= source.absoluteEpisode
  target.videoId ??= source.videoId
}

class IdentityUnion {
  readonly parent: number[]
  readonly namespaces: Array<Map<string, Set<string>>>

  constructor(aliases: readonly IdentityAlias[][]) {
    this.parent = aliases.map((_, index) => index)
    this.namespaces = aliases.map(items => {
      const result = new Map<string, Set<string>>()
      for (const alias of items) {
        const namespace = alias.qualifiedNamespace
        const values = result.get(namespace) || new Set<string>()
        values.add(alias.value)
        result.set(namespace, values)
      }
      return result
    })
  }

  find(index: number): number {
    if (this.parent[index] !== index) this.parent[index] = this.find(this.parent[index])
    return this.parent[index]
  }

  conflicts(left: number, right: number): string[] {
    const a = this.namespaces[this.find(left)]
    const b = this.namespaces[this.find(right)]
    const result: string[] = []
    for (const [namespace, leftValues] of a) {
      const rightValues = b.get(namespace)
      if (!rightValues) continue
      if ([...leftValues].some(value => !rightValues.has(value))
        || [...rightValues].some(value => !leftValues.has(value))) {
        result.push(namespace)
      }
    }
    return result.sort()
  }

  union(left: number, right: number): boolean {
    const leftRoot = this.find(left)
    const rightRoot = this.find(right)
    if (leftRoot === rightRoot) return true
    if (this.conflicts(leftRoot, rightRoot).length) return false
    const root = Math.min(leftRoot, rightRoot)
    const child = Math.max(leftRoot, rightRoot)
    this.parent[child] = root
    const rootNamespaces = this.namespaces[root]
    for (const [namespace, values] of this.namespaces[child]) {
      const merged = rootNamespaces.get(namespace) || new Set<string>()
      values.forEach(value => merged.add(value))
      rootNamespaces.set(namespace, merged)
    }
    return true
  }
}

/**
 * Builds connected identity components through every shared alias. A proposed
 * merge is rejected when it would give one component two values in the same
 * namespace. Title/year is used only for a unique two-component fallback.
 */
export function coalesceMediaRefs(
  input: readonly MediaRef[],
  contexts: readonly IdentityContext[] = []
): CoalescedMediaRefs {
  const aliases = input.map((media, index) => identityAliases(media, contexts[index] || {}))
  const union = new IdentityUnion(aliases)
  const conflicts: IdentityConflict[] = []
  const byAlias = new Map<string, number>()

  aliases.forEach((items, index) => {
    for (const alias of items) {
      const existing = byAlias.get(alias.key)
      if (existing === undefined) {
        byAlias.set(alias.key, index)
        continue
      }
      const namespaces = union.conflicts(existing, index)
      if (namespaces.length) {
        conflicts.push({
          left: existing,
          right: index,
          namespaces,
          reason: `Shared identity was rejected because ${namespaces.join(', ')} IDs conflict.`
        })
        continue
      }
      union.union(existing, index)
    }
  })

  const byTitle = new Map<string, Set<number>>()
  input.forEach((media, index) => {
    for (const key of titleYearIdentityKeys(media)) {
      const roots = byTitle.get(key) || new Set<number>()
      roots.add(union.find(index))
      byTitle.set(key, roots)
    }
  })
  for (const roots of byTitle.values()) {
    const candidates = [...new Set([...roots].map(root => union.find(root)))]
    if (candidates.length !== 2) continue
    const namespaces = union.conflicts(candidates[0], candidates[1])
    if (!namespaces.length) union.union(candidates[0], candidates[1])
  }

  const merged = new Map<number, MediaRef>()
  input.forEach((media, index) => {
    const root = union.find(index)
    const current = merged.get(root)
    if (current) mergeMedia(current, media)
    else merged.set(root, cloneMedia(media))
  })

  const media = input.map((_, index) => cloneMedia(merged.get(union.find(index))!))
  return {
    media,
    keys: media.map((item, index) => canonicalIdentityKey(item, contexts[index] || {})),
    conflicts
  }
}

export function coalesceBundleIdentities(
  input: CanonicalBundle,
  context: IdentityContext = {}
): CoalescedBundle {
  const records = [...input.history, ...input.progress, ...input.library]
  const result = coalesceMediaRefs(
    records.map(record => record.media),
    records.map(() => context)
  )
  let index = 0
  return {
    bundle: {
      history: input.history.map(record => ({
        ...record,
        media: result.media[index++],
        source: record.source ? { ...record.source } : undefined
      })),
      progress: input.progress.map(record => ({
        ...record,
        media: result.media[index++],
        source: record.source ? { ...record.source } : undefined
      })),
      library: input.library.map(record => ({
        ...record,
        media: result.media[index++],
        source: record.source ? { ...record.source } : undefined,
        lists: record.lists.map(list => ({ ...list }))
      }))
    },
    conflicts: result.conflicts
  }
}
