import assert from 'node:assert/strict'
import test from 'node:test'
import {
  escapeHtml,
  renderMarkdown,
  sanitizeMarkdownLink
} from './aiMarkdown.ts'

test('allows web and internal links', () => {
  const allowed = [
    'https://example.com/guide',
    'http://example.com/guide',
    '/quick-start',
    './next-page',
    '../parent-page',
    'relative-page',
    '?platform=android',
    '#installation'
  ]

  for (const href of allowed) {
    assert.equal(sanitizeMarkdownLink(href), href)
  }
})

test('rejects executable and non-web link protocols', () => {
  const rejected = [
    'javascript:document.body.textContent="owned"',
    'JaVaScRiPt:alert(1)',
    'java\tscript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    'mailto:user@example.com',
    '//attacker.example/path',
    '\\\\attacker.example\\path'
  ]

  for (const href of rejected) {
    assert.equal(sanitizeMarkdownLink(href), null)
  }
})

test('renders unsafe markdown links as non-clickable text', () => {
  const html = renderMarkdown('[Open the guide](javascript:document.body.textContent=\'owned\')')

  assert.equal(html, '<p>Open the guide</p>')
  assert.doesNotMatch(html, /href|javascript/i)
})

test('escapes raw HTML and link attribute content', () => {
  assert.equal(
    escapeHtml('<img src="x" onerror="alert(1)">'),
    '&lt;img src=&quot;x&quot; onerror=&quot;alert(1)&quot;&gt;'
  )

  const html = renderMarkdown('<img src=x onerror=alert(1)> [safe](https://example.com/?a=" onclick="alert)')
  assert.doesNotMatch(html, /<img/)
  assert.doesNotMatch(html, /href="[^"]*"\s+onclick=/)
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/)
  assert.match(html, /href="https:\/\/example\.com\/\?a=&quot; onclick=&quot;alert"/)
})

test('preserves the existing AI markdown structure and classes', () => {
  const html = renderMarkdown([
    '## Install',
    '',
    '- Open the **safe** [guide](/quick-start)',
    '',
    '```html',
    '<script>alert(1)</script>',
    '```'
  ].join('\n'))

  assert.match(html, /<h2 class="ask-ai-h2">Install<\/h2>/)
  assert.match(html, /<ul class="ask-ai-ul"><li>Open the <strong>safe<\/strong> <a href="\/quick-start" class="ask-ai-link">guide<\/a><\/li><\/ul>/)
  assert.match(html, /<pre class="ask-ai-code"><code>&lt;script&gt;alert\(1\)&lt;\/script&gt;<\/code><\/pre>/)
})
