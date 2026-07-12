import assert from 'node:assert/strict'
import test from 'node:test'
import {
  androidColorAlpha,
  androidColorToCss,
  findDisplayBadges,
  findWinningBadges,
  parseBadgeDocument,
  parseBadgePayload,
  serializeBadgeSet,
  testBadgePattern,
  validateBadgeSet,
  withAndroidColorAlpha,
  withAndroidColorHex,
  type EditorBadge
} from './badgeEditorUtils.ts'

const badge = (overrides: Partial<EditorBadge> = {}): EditorBadge => ({
  id: 'resolution-4k',
  groupId: 'resolution',
  name: '4K',
  pattern: '(?i)\\b(4k|2160p|uhd)\\b',
  imageURL: 'https://example.com/4k.png',
  isEnabled: true,
  tagColor: '#332F81F7',
  tagStyle: 'filled',
  textColor: '#FFFFFFFF',
  borderColor: '#FF7DA6FF',
  type: 'filter',
  extra: {},
  ...overrides
})

test('pattern testing translates the Nuvio inline case-insensitive flag', () => {
  assert.deepEqual(testBadgePattern('(?i)\\buhd\\b', 'Movie.UHD.Remux'), {
    matches: true,
    match: 'UHD',
    error: ''
  })
  assert.match(testBadgePattern('([', 'Movie.4K').error, /regular expression/i)
})

test('preview selection keeps the first matching badge in each group', () => {
  const first = badge()
  const shadowed = badge({ id: 'resolution-uhd', name: 'UHD', pattern: '(?i)uhd' })
  const audio = badge({
    id: 'audio-atmos',
    groupId: 'audio',
    name: 'Atmos',
    pattern: '(?i)atmos'
  })

  const result = findWinningBadges([first, shadowed, audio], 'Movie.2160p.UHD.Atmos')

  assert.deepEqual(result.winners.map(item => item.id), ['resolution-4k', 'audio-atmos'])
  assert.equal(result.shadowedIds.has('resolution-uhd'), true)
  assert.equal(result.matchedIds.size, 3)
})

test('current-client preview keeps global order, image deduplication, and nine badge limit', () => {
  const items = Array.from({ length: 11 }, (_, index) => badge({
    id: `badge-${index}`,
    groupId: 'same-group',
    pattern: '(?i)movie',
    imageURL: index === 1 ? 'https://example.com/0.png' : `https://example.com/${index}.png`
  }))

  assert.deepEqual(
    findDisplayBadges(items, 'MOVIE').map(item => item.id),
    ['badge-0', 'badge-2', 'badge-3', 'badge-4', 'badge-5', 'badge-6', 'badge-7', 'badge-8', 'badge-9']
  )
})

test('Android colors round-trip web color and alpha controls', () => {
  assert.equal(androidColorToCss('#330877F9'), 'rgba(8, 119, 249, 0.2)')
  assert.equal(androidColorToCss(''), 'transparent')
  assert.equal(androidColorAlpha('#330877F9'), 20)
  assert.equal(withAndroidColorHex('#330877F9', '#6b16ed'), '#336B16ED')
  assert.equal(withAndroidColorAlpha('#FF6B16ED', 20), '#336B16ED')
})

test('payload parsing accepts groups, defaults enablement, and preserves unknown fields', () => {
  const parsedDocument = parseBadgeDocument(JSON.stringify({
    source: 'community',
    filters: [
      { ...badge(), extra: undefined, custom: 'kept' },
      { ...badge({ id: 'off', isEnabled: false }), extra: undefined }
    ],
    groups: [{ id: 'resolution', name: 'Resolution', color: '#FFFFBE01', customGroup: 1 }]
  }))
  const parsed = parseBadgePayload(JSON.stringify({ filters: [badge()] }))
  assert.equal(parsed.length, 1)
  assert.equal(parsedDocument.filters[0].extra.custom, 'kept')
  assert.equal(parsedDocument.groups[0].extra.customGroup, 1)
  assert.equal(parsedDocument.extra.source, 'community')
  assert.equal(parsedDocument.filters[1].isEnabled, false)

  const exported = JSON.parse(serializeBadgeSet(
    parsedDocument.filters,
    parsedDocument.groups,
    parsedDocument.extra
  ))
  assert.equal(exported.filters.length, 2)
  assert.equal(exported.filters[0].custom, 'kept')
  assert.equal(exported.filters[1].isEnabled, false)
  assert.equal('extra' in exported.filters[0], false)
})

test('validation reports duplicate IDs and schema-specific field errors', () => {
  const issues = validateBadgeSet([
    badge({ tagColor: '#GG16ED', imageURL: 'data:image/png;base64,abc' }),
    badge({ name: 'Duplicate' })
  ])

  assert.equal(issues.some(issue => issue.field === 'id' && issue.message.includes('2 enabled')), true)
  assert.equal(issues.some(issue => issue.field === 'tagColor' && issue.message.includes('#RRGGBB')), true)
  assert.equal(issues.some(issue => issue.field === 'imageURL' && issue.message.includes('http(s)')), true)
})
