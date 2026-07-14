const INTERNAL_LINK_BASE = new URL('https://nuvio.internal/')
const ABSOLUTE_SCHEME_RE = /^[a-z][a-z\d+.-]*:/i
const CONTROL_CHARACTER_RE = /[\u0000-\u001f\u007f]/

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Accept web URLs and links that stay on the current site. Everything else is
 * rendered as text so an AI response cannot create an executable href.
 */
export function sanitizeMarkdownLink(value: string): string | null {
  const href = value.trim()
  if (!href || CONTROL_CHARACTER_RE.test(href)) return null

  try {
    if (ABSOLUTE_SCHEME_RE.test(href)) {
      const url = new URL(href)
      return url.protocol === 'http:' || url.protocol === 'https:' ? href : null
    }

    // URL parsing catches protocol-relative and backslash-obfuscated hosts while
    // still allowing root-relative, path-relative, query, and fragment links.
    const url = new URL(href, INTERNAL_LINK_BASE)
    return url.origin === INTERNAL_LINK_BASE.origin ? href : null
  } catch {
    return null
  }
}

export function renderMarkdown(text: string) {
  if (!text) return ''

  // Extract code blocks so inline formatting is not applied inside them.
  const codeBlocks: string[] = []
  let html = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_, _lang, code) => {
    const id = `__CODE_BLOCK_${codeBlocks.length}__`
    codeBlocks.push(`<pre class="ask-ai-code"><code>${escapeHtml(code.trim())}</code></pre>`)
    return id
  })

  // Raw model-provided HTML is never trusted. The renderer only introduces the
  // fixed tags and class names below.
  html = escapeHtml(html)

  const lines = html.split('\n')
  const result: string[] = []
  let inUl = false
  let inOl = false

  for (const line of lines) {
    const trimmed = line.trim()

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/)
    if (headingMatch) {
      if (inUl) { result.push('</ul>'); inUl = false }
      if (inOl) { result.push('</ol>'); inOl = false }
      const level = headingMatch[1].length
      result.push(`<h${level} class="ask-ai-h${level}">${headingMatch[2]}</h${level}>`)
      continue
    }

    const ulMatch = line.match(/^(\s*)[-*]\s+(.+)$/)
    if (ulMatch) {
      if (inOl) { result.push('</ol>'); inOl = false }
      if (!inUl) { result.push('<ul class="ask-ai-ul">'); inUl = true }
      result.push(`<li>${ulMatch[2]}</li>`)
      continue
    }

    const olMatch = line.match(/^(\s*)\d+\.\s+(.+)$/)
    if (olMatch) {
      if (inUl) { result.push('</ul>'); inUl = false }
      if (!inOl) { result.push('<ol class="ask-ai-ol">'); inOl = true }
      result.push(`<li>${olMatch[2]}</li>`)
      continue
    }

    if (trimmed === '') {
      if (inUl) { result.push('</ul>'); inUl = false }
      if (inOl) { result.push('</ol>'); inOl = false }
      result.push('')
      continue
    }

    if ((inUl || inOl) && (line.startsWith('  ') || line.startsWith('\t'))) {
      const last = result[result.length - 1]
      if (last?.endsWith('</li>')) {
        result[result.length - 1] = last.slice(0, -5) + '<br>' + trimmed + '</li>'
        continue
      }
    }

    if (inUl && !ulMatch) { result.push('</ul>'); inUl = false }
    if (inOl && !olMatch) { result.push('</ol>'); inOl = false }

    result.push(trimmed)
  }

  if (inUl) result.push('</ul>')
  if (inOl) result.push('</ol>')

  let assembledHtml = ''
  let currentPara: string[] = []

  const flushPara = () => {
    if (currentPara.length > 0) {
      assembledHtml += `<p>${currentPara.join('<br>')}</p>`
      currentPara = []
    }
  }

  for (const item of result) {
    if (item === '') {
      flushPara()
      continue
    }

    const isBlock = item.startsWith('<h') || item.startsWith('<ul') || item.startsWith('</ul>') || item.startsWith('<ol') || item.startsWith('</ol>') || item.startsWith('<li>') || item.startsWith('__CODE_BLOCK_')

    if (isBlock) {
      flushPara()
      assembledHtml += item
    } else {
      currentPara.push(item)
    }
  }
  flushPara()

  assembledHtml = assembledHtml.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  assembledHtml = assembledHtml.replace(/\*(.+?)\*/g, '<em>$1</em>')
  assembledHtml = assembledHtml.replace(/`([^`]+)`/g, '<code class="ask-ai-inline-code">$1</code>')
  assembledHtml = assembledHtml.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, target) => {
    const safeTarget = sanitizeMarkdownLink(target)
    return safeTarget
      ? `<a href="${safeTarget}" class="ask-ai-link">${label}</a>`
      : label
  })

  codeBlocks.forEach((codeHtml, index) => {
    assembledHtml = assembledHtml.replace(`__CODE_BLOCK_${index}__`, codeHtml)
  })

  return assembledHtml
}
