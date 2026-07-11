export type TransferRecord = Record<string, any>

export type RecordIdentity = (record: TransferRecord) => string

function isPlainRecord(value: unknown): value is TransferRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function cloneMergeValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(item => cloneMergeValue(item)) as T
  }
  if (isPlainRecord(value)) {
    return deepMergeStaged({}, value) as T
  }
  return value
}

/**
 * Applies only keys present in the staged object. Nested objects are merged;
 * arrays, scalars, and null are intentional leaf replacements.
 */
export function deepMergeStaged(
  current: TransferRecord,
  staged: TransferRecord
): TransferRecord {
  const result = new Map<string, unknown>()

  for (const [key, value] of Object.entries(current)) {
    result.set(key, cloneMergeValue(value))
  }

  for (const [key, stagedValue] of Object.entries(staged)) {
    if (stagedValue === undefined) continue
    const currentValue = result.get(key)
    result.set(
      key,
      isPlainRecord(currentValue) && isPlainRecord(stagedValue)
        ? deepMergeStaged(currentValue, stagedValue)
        : cloneMergeValue(stagedValue)
    )
  }

  return Object.fromEntries(result)
}

/**
 * Keeps destination order, updates staged identity matches in place, and
 * appends genuinely new staged records. Duplicate staged identities are
 * deterministic (last staged value wins) and inputs are never mutated.
 */
export function mergeStagedRecords(
  current: TransferRecord[],
  staged: TransferRecord[],
  identify: RecordIdentity
): TransferRecord[] {
  const merged = current.map(record => deepMergeStaged({}, record))
  const indexes = new Map<string, number>()

  merged.forEach((record, index) => {
    const identity = identify(record)
    if (identity && !indexes.has(identity)) indexes.set(identity, index)
  })

  for (const stagedRecord of staged) {
    const identity = identify(stagedRecord)
    const currentIndex = identity ? indexes.get(identity) : undefined

    if (currentIndex !== undefined) {
      merged[currentIndex] = deepMergeStaged(merged[currentIndex], stagedRecord)
      continue
    }

    const nextIndex = merged.length
    merged.push(deepMergeStaged({}, stagedRecord))
    if (identity) indexes.set(identity, nextIndex)
  }

  return merged
}

/**
 * Canonicalizes the URL parts that are safe to compare while preserving
 * case-sensitive paths and query values (which may contain access keys).
 */
export function canonicalTransferUrl(value: unknown): string {
  const raw = String(value ?? '').trim()
  if (!raw) return ''

  try {
    const parsed = new URL(raw)
    parsed.hash = ''
    const normalizedPath = parsed.pathname
      .replace(/\/manifest\.json\/?$/i, '')
      .replace(/\/+$/, '')
    parsed.pathname = normalizedPath || '/'
    return parsed.toString()
  } catch {
    return raw
      .replace(/\/manifest\.json\/?$/i, '')
      .replace(/\/+$/, '')
  }
}

export function addonMergeKey(record: TransferRecord): string {
  return canonicalTransferUrl(record.url)
}

export function pluginMergeKey(record: TransferRecord): string {
  return canonicalTransferUrl(record.url)
}

export function libraryMergeKey(record: TransferRecord): string {
  const contentType = String(record.content_type ?? '').trim().toLowerCase()
  const contentId = String(record.content_id ?? '').trim().toLowerCase()
  return contentType && contentId ? `${contentType}:${contentId}` : ''
}

export function collectionMergeKey(record: TransferRecord): string {
  const id = String(record.id ?? '').trim()
  return id ? `id:${id}` : ''
}
