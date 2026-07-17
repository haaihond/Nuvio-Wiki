import assert from 'node:assert/strict'
import test from 'node:test'

import {
  decodeStremioWatchedField,
  encodeStremioWatchedField,
  mergeStremioWatchedVideoIds,
  readStremioWatchedVideoIds,
  resizeStremioWatchedField,
} from './stremioWatched.ts'

const videos = Array.from({ length: 9 }, (_, index) => `tt2934286:1:${index + 1}`)
const officialFixture = 'tt2934286:1:5:5:eJyTZwAAAEAAIA=='

test('decodes the official stremio-core watched field fixture', async () => {
  const decoded = await decodeStremioWatchedField(officialFixture)
  assert.equal(decoded.anchorVideoId, 'tt2934286:1:5')
  assert.equal(decoded.anchorLength, 5)
  assert.deepEqual(await readStremioWatchedVideoIds(officialFixture, videos), videos.slice(0, 5))
})

test('resizes a bitfield when older videos shift around its anchor', async () => {
  const shifted = ['tt2934286:0:1', ...videos]
  const bits = await resizeStremioWatchedField(officialFixture, shifted)
  assert.equal(bits[0], false)
  assert.deepEqual(shifted.filter((_, index) => bits[index]), videos.slice(0, 5))
})

test('round trips watched episodes and merges without clearing destination state', async () => {
  const initial = await encodeStremioWatchedField(
    videos.map(video => video.endsWith(':2') || video.endsWith(':5')),
    videos
  )
  const merged = await mergeStremioWatchedVideoIds(initial, videos, [videos[6]])
  assert.deepEqual(await readStremioWatchedVideoIds(merged, videos), [videos[1], videos[4], videos[6]])
})

test('uses Stremio empty-field semantics when there are no videos', async () => {
  const serialized = await encodeStremioWatchedField([], [])
  const decoded = await decodeStremioWatchedField(serialized)
  assert.equal(decoded.anchorVideoId, 'undefined')
  assert.equal(decoded.anchorLength, 1)
  assert.deepEqual(decoded.bits, [])
})
