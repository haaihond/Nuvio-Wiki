export interface EditorBadge {
  id: string
  groupId: string
  name: string
  pattern: string
  imageURL: string
  isEnabled: boolean
  tagColor: string
  tagStyle: string
  textColor: string
  borderColor: string
  type: string
  extra: Record<string, unknown>
}

export interface BadgeGroup {
  id: string
  name: string
  color: string
  isExpanded: boolean
  borderColor: string
  extra: Record<string, unknown>
}

export interface BadgeDocument {
  filters: EditorBadge[]
  groups: BadgeGroup[]
  extra: Record<string, unknown>
}

export type BadgeField = Exclude<keyof EditorBadge, 'extra'> | 'groups' | 'workspace'

export interface BadgeIssue {
  badgeIndex: number
  badgeId: string
  field: BadgeField
  message: string
  severity: 'error' | 'warning'
}

export interface BadgeMatchResult {
  winners: EditorBadge[]
  matchedIds: Set<string>
  shadowedIds: Set<string>
  invalidBadges: Set<EditorBadge>
}

export interface PatternTestResult {
  matches: boolean
  match: string
  error: string
}

const NUVIO_COLOR_RE = /^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/i
const WEB_COLOR_RE = /^#[0-9a-f]{6}$/i
const FILTER_KEYS = new Set([
  'id',
  'groupId',
  'name',
  'pattern',
  'imageURL',
  'isEnabled',
  'tagColor',
  'tagStyle',
  'textColor',
  'borderColor',
  'type'
])
const GROUP_KEYS = new Set(['id', 'name', 'color', 'isExpanded', 'borderColor'])

export function cloneBadge(badge: EditorBadge): EditorBadge {
  return { ...badge, extra: { ...badge.extra } }
}

export function cloneGroup(group: BadgeGroup): BadgeGroup {
  return { ...group, extra: { ...group.extra } }
}

export function compileBadgePattern(pattern: string): RegExp {
  let source = pattern
  let flags = ''
  const inlineFlags = source.match(/^\(\?([imsx]+)\)/)

  if (inlineFlags) {
    if (inlineFlags[1].includes('x')) {
      throw new Error('The extended (?x) flag cannot be previewed in a browser.')
    }
    flags = [...new Set(inlineFlags[1].split(''))].join('')
    source = source.slice(inlineFlags[0].length)
  }

  return new RegExp(source, flags)
}

export function testBadgePattern(pattern: string, title: string): PatternTestResult {
  if (!pattern.trim()) {
    return { matches: false, match: '', error: 'Add a regex pattern to test this badge.' }
  }

  try {
    const result = compileBadgePattern(pattern).exec(title)
    return {
      matches: Boolean(result),
      match: result?.[0] ?? '',
      error: ''
    }
  } catch (error) {
    return {
      matches: false,
      match: '',
      error: error instanceof Error ? error.message : 'Invalid regular expression.'
    }
  }
}

export function findWinningBadges(
  badges: EditorBadge[],
  title: string
): BadgeMatchResult {
  const winners: EditorBadge[] = []
  const matchedIds = new Set<string>()
  const shadowedIds = new Set<string>()
  const invalidBadges = new Set<EditorBadge>()
  const claimedGroups = new Set<string>()

  for (const badge of badges) {
    if (!badge.isEnabled) continue

    const result = testBadgePattern(badge.pattern, title)
    if (result.error) {
      invalidBadges.add(badge)
      continue
    }
    if (!result.matches) continue

    matchedIds.add(badge.id)
    const group = badge.groupId.trim() || badge.id
    if (claimedGroups.has(group)) {
      shadowedIds.add(badge.id)
      continue
    }

    claimedGroups.add(group)
    winners.push(badge)
  }

  return { winners, matchedIds, shadowedIds, invalidBadges }
}

export function findDisplayBadges(badges: EditorBadge[], title: string, limit = 9): EditorBadge[] {
  const displayed: EditorBadge[] = []
  const seen = new Set<string>()

  for (const badge of badges) {
    if (!badge.isEnabled || !badge.imageURL.trim()) continue
    const result = testBadgePattern(badge.pattern, title)
    if (result.error || !result.matches) continue

    const key = (badge.imageURL.trim() || badge.name.trim()).toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    displayed.push(badge)
    if (displayed.length >= limit) break
  }

  return displayed
}

export function isNuvioColor(value: string): boolean {
  return NUVIO_COLOR_RE.test(value.trim())
}

export function isAndroidColor(value: string): boolean {
  return isNuvioColor(value)
}

export function androidColorToCss(value: string): string {
  if (!isNuvioColor(value)) return 'transparent'

  const normalized = value.trim().slice(1)
  const hasAlpha = normalized.length === 8
  const alpha = hasAlpha ? Number.parseInt(normalized.slice(0, 2), 16) / 255 : 1
  const offset = hasAlpha ? 2 : 0
  const red = Number.parseInt(normalized.slice(offset, offset + 2), 16)
  const green = Number.parseInt(normalized.slice(offset + 2, offset + 4), 16)
  const blue = Number.parseInt(normalized.slice(offset + 4, offset + 6), 16)
  return `rgba(${red}, ${green}, ${blue}, ${Number(alpha.toFixed(3))})`
}

export function androidColorToHex(value: string): string {
  if (!isNuvioColor(value)) return '#6B16ED'
  const normalized = value.trim()
  return normalized.length === 7 ? normalized.toUpperCase() : `#${normalized.slice(3).toUpperCase()}`
}

export function androidColorAlpha(value: string): number {
  if (!isNuvioColor(value) || value.trim().length === 7) return 100
  return Math.round((Number.parseInt(value.trim().slice(1, 3), 16) / 255) * 100)
}

export function withAndroidColorHex(value: string, webHex: string): string {
  const alpha = isNuvioColor(value) && value.trim().length === 9 ? value.trim().slice(1, 3) : 'FF'
  const hex = WEB_COLOR_RE.test(webHex.trim()) ? webHex.trim().slice(1) : '6B16ED'
  return `#${alpha}${hex}`.toUpperCase()
}

export function withAndroidColorAlpha(value: string, percentage: number): string {
  const hex = isNuvioColor(value)
    ? value.trim().length === 9
      ? value.trim().slice(3)
      : value.trim().slice(1)
    : '6B16ED'
  const normalized = Math.max(0, Math.min(100, Number.isFinite(percentage) ? percentage : 100))
  const alpha = Math.round((normalized / 100) * 255).toString(16).padStart(2, '0')
  return `#${alpha}${hex}`.toUpperCase()
}

function readString(
  record: Record<string, unknown>,
  key: string,
  label: string
): string {
  const value = record[key]
  if (value == null) return ''
  if (typeof value !== 'string') throw new Error(`${label}.${key} must be a string.`)
  return value
}

function readBoolean(
  record: Record<string, unknown>,
  key: string,
  fallback: boolean,
  label: string
): boolean {
  const value = record[key]
  if (value == null) return fallback
  if (typeof value !== 'boolean') throw new Error(`${label}.${key} must be true or false.`)
  return value
}

function extras(record: Record<string, unknown>, knownKeys: Set<string>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !knownKeys.has(key)))
}

export function parseBadgeDocument(payload: string): BadgeDocument {
  const parsed: unknown = JSON.parse(payload)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Expected a JSON object with a filters array.')
  }

  const document = parsed as Record<string, unknown>
  if (!Array.isArray(document.filters)) {
    throw new Error('Expected a JSON object with a filters array.')
  }
  if (document.groups != null && !Array.isArray(document.groups)) {
    throw new Error('groups must be an array when provided.')
  }

  const filters = document.filters.map((candidate, index): EditorBadge => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      throw new Error(`filters[${index}] must be a JSON object.`)
    }

    const record = candidate as Record<string, unknown>
    const label = `filters[${index}]`
    return {
      id: readString(record, 'id', label),
      groupId: readString(record, 'groupId', label),
      name: readString(record, 'name', label),
      pattern: readString(record, 'pattern', label),
      imageURL: readString(record, 'imageURL', label),
      isEnabled: readBoolean(record, 'isEnabled', true, label),
      tagColor: readString(record, 'tagColor', label),
      tagStyle: readString(record, 'tagStyle', label),
      textColor: readString(record, 'textColor', label),
      borderColor: readString(record, 'borderColor', label),
      type: readString(record, 'type', label),
      extra: extras(record, FILTER_KEYS)
    }
  })

  const groups = ((document.groups ?? []) as unknown[]).map((candidate, index): BadgeGroup => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      throw new Error(`groups[${index}] must be a JSON object.`)
    }

    const record = candidate as Record<string, unknown>
    const label = `groups[${index}]`
    return {
      id: readString(record, 'id', label),
      name: readString(record, 'name', label),
      color: readString(record, 'color', label),
      isExpanded: readBoolean(record, 'isExpanded', true, label),
      borderColor: readString(record, 'borderColor', label),
      extra: extras(record, GROUP_KEYS)
    }
  })

  return {
    filters,
    groups,
    extra: extras(document, new Set(['filters', 'groups']))
  }
}

export function parseBadgePayload(payload: string): EditorBadge[] {
  return parseBadgeDocument(payload).filters
}

function serializableBadge({ extra, ...badge }: EditorBadge): Record<string, unknown> {
  return { ...extra, ...badge }
}

function serializableGroup({ extra, ...group }: BadgeGroup): Record<string, unknown> {
  return { ...extra, ...group }
}

export function serializeBadgeSet(
  badges: EditorBadge[],
  groups: BadgeGroup[] = [],
  extra: Record<string, unknown> = {}
): string {
  return JSON.stringify({
    ...extra,
    filters: badges.map(serializableBadge),
    groups: groups.map(serializableGroup)
  }, null, 2)
}

export function validateBadgeDocument(badges: EditorBadge[], groups: BadgeGroup[]): BadgeIssue[] {
  const issues: BadgeIssue[] = []
  const ids = new Map<string, number>()
  const imageUrls = new Map<string, number>()
  const groupIds = new Set(groups.map(group => group.id.trim()).filter(Boolean))

  for (const [badgeIndex, badge] of badges.entries()) {
    const badgeId = badge.id.trim()
    if (!badge.name.trim()) {
      issues.push({ badgeIndex, badgeId, field: 'name', message: 'Current clients may discard filters without a display name.', severity: 'warning' })
    }
    if (!badge.pattern.trim()) {
      issues.push({ badgeIndex, badgeId, field: 'pattern', message: 'A regex pattern is required.', severity: badge.isEnabled ? 'error' : 'warning' })
    }
    if (!badgeId) {
      issues.push({ badgeIndex, badgeId, field: 'id', message: 'Add an ID for reliable editing and sharing.', severity: 'warning' })
    } else if (badge.isEnabled) {
      ids.set(badgeId, (ids.get(badgeId) ?? 0) + 1)
    }
    if (!badge.groupId.trim()) {
      issues.push({ badgeIndex, badgeId, field: 'groupId', message: 'Assign a group to keep the set organized.', severity: 'warning' })
    } else if (groups.length && !groupIds.has(badge.groupId.trim())) {
      issues.push({ badgeIndex, badgeId, field: 'groupId', message: 'This group is not defined in the group library.', severity: 'warning' })
    }

    const patternResult = testBadgePattern(badge.pattern, '')
    if (badge.pattern.trim() && patternResult.error) {
      const previewOnly = patternResult.error.includes('cannot be previewed in a browser')
      issues.push({
        badgeIndex,
        badgeId,
        field: 'pattern',
        message: patternResult.error,
        severity: !badge.isEnabled || previewOnly ? 'warning' : 'error'
      })
    }
    if (badge.isEnabled && /^(?:\(\?[ims]+\))?\^?\.\*\$?$/.test(badge.pattern.trim())) {
      issues.push({ badgeIndex, badgeId, field: 'pattern', message: 'This pattern matches almost every stream.', severity: 'warning' })
    }

    for (const field of ['tagColor', 'textColor', 'borderColor'] as const) {
      const color = badge[field].trim()
      if (color && !isNuvioColor(color)) {
        issues.push({ badgeIndex, badgeId, field, message: 'Use #RRGGBB or Android #AARRGGBB.', severity: badge.isEnabled ? 'error' : 'warning' })
      }
    }

    if (badge.tagStyle.trim() && badge.tagStyle.trim().toLowerCase() !== 'filled') {
      issues.push({ badgeIndex, badgeId, field: 'tagStyle', message: 'Current apps only apply a fill when this is “filled”.', severity: 'warning' })
    }

    const imageURL = badge.imageURL.trim()
    if (!imageURL && badge.isEnabled) {
      issues.push({ badgeIndex, badgeId, field: 'imageURL', message: 'Current stream cards hide badges without an image URL.', severity: 'warning' })
    } else {
      if (badge.isEnabled && imageURL) {
        imageUrls.set(imageURL.toLowerCase(), (imageUrls.get(imageURL.toLowerCase()) ?? 0) + 1)
      }
      if (!imageURL) continue
      try {
        const url = new URL(imageURL)
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error()
        if (url.hostname === 'github.com' && url.pathname.includes('/blob/')) {
          issues.push({ badgeIndex, badgeId, field: 'imageURL', message: 'Use the raw GitHub image URL, not a blob page.', severity: 'warning' })
        }
      } catch {
        issues.push({ badgeIndex, badgeId, field: 'imageURL', message: 'Use a direct http(s) image URL.', severity: 'warning' })
      }
    }
  }

  for (const [id, count] of ids) {
    if (count > 1) {
      const badgeIndex = badges.findIndex(badge => badge.id.trim() === id)
      issues.push({ badgeIndex, badgeId: id, field: 'id', message: `ID is used by ${count} enabled badges.`, severity: 'warning' })
    }
  }
  for (const [url, count] of imageUrls) {
    if (count > 1) {
      const badgeIndex = badges.findIndex(badge => badge.imageURL.trim().toLowerCase() === url)
      const badgeId = badgeIndex >= 0 ? badges[badgeIndex].id : ''
      issues.push({ badgeIndex, badgeId, field: 'imageURL', message: `${count} enabled badges share this image and may be deduplicated.`, severity: 'warning' })
    }
  }

  if (!badges.some(badge => badge.isEnabled)) {
    issues.push({ badgeIndex: -1, badgeId: '', field: 'workspace', message: 'No badges are enabled, so the set will not display anything.', severity: 'warning' })
  }

  return issues
}

export function validateBadgeSet(badges: EditorBadge[]): BadgeIssue[] {
  return validateBadgeDocument(badges, [])
}
