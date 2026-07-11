import assert from 'node:assert/strict'
import test from 'node:test'
import {
  addonMergeKey,
  canonicalTransferUrl,
  collectionMergeKey,
  deepMergeStaged,
  libraryMergeKey,
  mergeStagedRecords
} from './profileTransferMerge.ts'

test('deepMergeStaged preserves unstaged nested settings and replaces leaf values', () => {
  const current = {
    playback: { quality: '4k', subtitles: { language: 'en', size: 18 } },
    rows: ['popular', 'recent'],
    untouched: true
  }
  const staged = {
    playback: { subtitles: { size: 22 } },
    rows: ['template-row'],
    cleared: null
  }

  const merged = deepMergeStaged(current, staged)

  assert.deepEqual(merged, {
    playback: { quality: '4k', subtitles: { language: 'en', size: 22 } },
    rows: ['template-row'],
    untouched: true,
    cleared: null
  })
  assert.deepEqual(current.rows, ['popular', 'recent'])
  assert.equal(current.playback.subtitles.size, 18)
})

test('canonicalTransferUrl matches manifest variants without folding secret values', () => {
  assert.equal(
    canonicalTransferUrl(' HTTPS://Example.COM/addon/manifest.json?token=AbC#install '),
    'https://example.com/addon?token=AbC'
  )
  assert.equal(
    canonicalTransferUrl('https://example.com/addon/?token=AbC'),
    'https://example.com/addon?token=AbC'
  )
  assert.notEqual(
    canonicalTransferUrl('https://example.com/addon?token=AbC'),
    canonicalTransferUrl('https://example.com/addon?token=abc')
  )
})

test('mergeStagedRecords updates in place, appends new records, and keeps unrelated order', () => {
  const current = [
    { url: 'https://one.example/manifest.json', name: 'One', enabled: true, sort_order: 0 },
    { url: 'https://two.example/manifest.json', name: 'Two', enabled: true, sort_order: 1 }
  ]
  const staged = [
    { url: 'https://two.example', enabled: false },
    { url: 'https://three.example/manifest.json', name: 'Three' },
    { url: 'https://three.example', enabled: true }
  ]

  const merged = mergeStagedRecords(current, staged, addonMergeKey)

  assert.deepEqual(merged, [
    { url: 'https://one.example/manifest.json', name: 'One', enabled: true, sort_order: 0 },
    { url: 'https://two.example', name: 'Two', enabled: false, sort_order: 1 },
    { url: 'https://three.example', name: 'Three', enabled: true }
  ])
  assert.equal(current[1].enabled, true)
  assert.equal(staged[0].name, undefined)
})

test('empty staged records are a clean no-op', () => {
  const current = [{ url: 'https://keep.example', enabled: true }]
  assert.deepEqual(mergeStagedRecords(current, [], addonMergeKey), current)
})

test('library and collection identities only merge stable matching records', () => {
  assert.equal(libraryMergeKey({ content_type: ' Movie ', content_id: ' TT123 ' }), 'movie:tt123')
  assert.equal(libraryMergeKey({ content_id: 'tt123' }), '')
  assert.equal(collectionMergeKey({ id: 'favorites' }), 'id:favorites')
  assert.equal(collectionMergeKey({ name: 'Favorites' }), '')
})
