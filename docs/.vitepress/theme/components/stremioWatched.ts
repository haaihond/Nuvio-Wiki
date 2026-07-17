export interface StremioWatchedField {
  anchorVideoId: string
  anchorLength: number
  bits: boolean[]
}

function bytesFromBase64(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

function base64FromBytes(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return btoa(binary)
}

async function transformBytes(
  bytes: Uint8Array,
  mode: 'compress' | 'decompress'
): Promise<Uint8Array> {
  const StreamCtor = mode === 'compress' ? CompressionStream : DecompressionStream
  if (typeof StreamCtor === 'undefined') {
    throw new Error('This browser does not support the compression format used by Stremio watch history.')
  }

  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new StreamCtor('deflate'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

function unpackBits(bytes: Uint8Array): boolean[] {
  const bits: boolean[] = []
  for (let index = 0; index < bytes.length * 8; index++) {
    bits.push(((bytes[Math.floor(index / 8)] >> (index % 8)) & 1) !== 0)
  }
  return bits
}

function packBits(bits: boolean[]): Uint8Array {
  const bytes = new Uint8Array(Math.ceil(bits.length / 8))
  bits.forEach((value, index) => {
    if (value) bytes[Math.floor(index / 8)] |= 1 << (index % 8)
  })
  return bytes
}

/**
 * Decode Stremio's official `{anchor video id}:{anchor length}:{zlib bitfield}`
 * format. Video ids may themselves contain colons, so fields are read from the
 * right, matching stremio-core.
 */
export async function decodeStremioWatchedField(serialized: string): Promise<StremioWatchedField> {
  const components = String(serialized || '').split(':')
  if (components.length < 3) throw new Error('Invalid Stremio watched field.')

  const payload = components.pop() || ''
  const anchorLength = Number(components.pop())
  const anchorVideoId = components.join(':')
  if (!payload || !Number.isSafeInteger(anchorLength) || anchorLength < 1 || !anchorVideoId) {
    throw new Error('Invalid Stremio watched field.')
  }

  const inflated = await transformBytes(bytesFromBase64(payload), 'decompress')
  return { anchorVideoId, anchorLength, bits: unpackBits(inflated) }
}

/** Resize a stored field against the current ordered Cinemeta video list. */
export async function resizeStremioWatchedField(
  serialized: string | null | undefined,
  videoIds: string[]
): Promise<boolean[]> {
  if (!serialized) return videoIds.map(() => false)
  const field = await decodeStremioWatchedField(serialized)
  const anchorIndex = videoIds.indexOf(field.anchorVideoId)
  if (anchorIndex < 0) return videoIds.map(() => false)

  const offset = field.anchorLength - anchorIndex - 1
  return videoIds.map((_, index) => {
    const previousIndex = index + offset
    return previousIndex >= 0 && previousIndex < field.bits.length
      ? field.bits[previousIndex]
      : false
  })
}

export async function encodeStremioWatchedField(
  watched: boolean[],
  videoIds: string[]
): Promise<string> {
  const bits = videoIds.map((_, index) => Boolean(watched[index]))
  let lastWatchedIndex = -1
  for (let index = bits.length - 1; index >= 0; index--) {
    if (bits[index]) {
      lastWatchedIndex = index
      break
    }
  }

  const anchorIndex = lastWatchedIndex >= 0 ? lastWatchedIndex : 0
  const anchorVideoId = videoIds[anchorIndex] || 'undefined'
  const compressed = await transformBytes(packBits(bits), 'compress')
  return `${anchorVideoId}:${anchorIndex + 1}:${base64FromBytes(compressed)}`
}

export async function readStremioWatchedVideoIds(
  serialized: string | null | undefined,
  videoIds: string[]
): Promise<string[]> {
  const watched = await resizeStremioWatchedField(serialized, videoIds)
  return videoIds.filter((_, index) => watched[index])
}

export async function mergeStremioWatchedVideoIds(
  serialized: string | null | undefined,
  videoIds: string[],
  additions: Iterable<string>
): Promise<string> {
  const watched = await resizeStremioWatchedField(serialized, videoIds)
  const add = new Set(additions)
  videoIds.forEach((videoId, index) => {
    if (add.has(videoId)) watched[index] = true
  })
  return encodeStremioWatchedField(watched, videoIds)
}
