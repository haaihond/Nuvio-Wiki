<template>
  <!-- Floating trigger button -->
  <button
    class="ask-ai-fab"
    :class="{ 'ask-ai-fab--hidden': isOpen }"
    @click="open"
    aria-label="Ask AI about Nuvio"
    title="Ask AI"
  >
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
    </svg>
  </button>

  <!-- Backdrop overlay (mobile) -->
  <Transition name="ask-ai-backdrop">
    <div v-if="isOpen" class="ask-ai-backdrop" @click="close" />
  </Transition>

  <!-- Side panel -->
  <Transition name="ask-ai-panel">
    <aside v-if="isOpen" class="ask-ai-panel" role="dialog" aria-label="Ask AI Chat">
      <!-- Header -->
      <header class="ask-ai-header">
        <div class="ask-ai-header__title">
          <svg class="ask-ai-header__icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
          </svg>
          <span>Ask AI</span>
        </div>
        <div class="ask-ai-header__actions">
          <button
            class="ask-ai-btn-icon"
            @click="clearChat"
            title="New chat"
            :disabled="messages.length === 0 && !isStreaming"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
            </svg>
          </button>
          <button class="ask-ai-btn-icon" @click="close" title="Close" aria-label="Close chat">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </header>

      <!-- Chat messages area -->
      <div class="ask-ai-messages" ref="messagesContainer">
        <!-- Welcome message when empty -->
        <div v-if="messages.length === 0 && !isStreaming" class="ask-ai-welcome">
          <div class="ask-ai-welcome__icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
            </svg>
          </div>
          <h3 class="ask-ai-welcome__title">Nuvio Wiki Assistant</h3>
          <p class="ask-ai-welcome__text">
            Ask me anything about Nuvio — installation, settings, addons, troubleshooting, and more.
          </p>
        </div>

        <!-- Message bubbles -->
        <div
          v-for="(msg, i) in messages"
          :key="i"
          class="ask-ai-msg"
          :class="`ask-ai-msg--${msg.role}`"
        >
          <div class="ask-ai-msg__bubble" v-html="msg.role === 'model' ? renderMarkdown(msg.content) : escapeHtml(msg.content)" />
        </div>

        <!-- Streaming indicator -->
        <div v-if="isStreaming && !streamingContent" class="ask-ai-msg ask-ai-msg--model">
          <div class="ask-ai-msg__bubble ask-ai-msg__typing">
            <span class="ask-ai-dot" /><span class="ask-ai-dot" /><span class="ask-ai-dot" />
          </div>
        </div>

        <!-- Error message -->
        <div v-if="errorMsg" class="ask-ai-error">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
          {{ errorMsg }}
        </div>
      </div>

      <!-- Input area -->
      <footer class="ask-ai-input-area">
        <div class="ask-ai-input-wrap">
          <textarea
            ref="inputEl"
            v-model="inputText"
            class="ask-ai-input"
            placeholder="Ask about Nuvio..."
            rows="1"
            :disabled="isStreaming"
            @keydown.enter.exact.prevent="send"
            @input="autoResize"
          />
          <button
            class="ask-ai-send"
            :disabled="!inputText.trim() || isStreaming"
            @click="send"
            aria-label="Send message"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
        <p class="ask-ai-disclaimer">AI responses are generated from wiki content and may not always be accurate.</p>
      </footer>
    </aside>
  </Transition>
</template>

<script setup>
import { ref, nextTick, onMounted, onUnmounted } from 'vue'

// ── State ────────────────────────────────────────────────────────────────
const isOpen = ref(false)
const messages = ref([])           // { role: 'user'|'model', content: string }
const inputText = ref('')
const isStreaming = ref(false)
const streamingContent = ref('')
const errorMsg = ref('')
const messagesContainer = ref(null)
const inputEl = ref(null)

// ── Panel open/close ─────────────────────────────────────────────────────
function open() {
  isOpen.value = true
  nextTick(() => inputEl.value?.focus())
}

function close() {
  isOpen.value = false
}

function clearChat() {
  messages.value = []
  streamingContent.value = ''
  errorMsg.value = ''
  inputText.value = ''
  nextTick(() => inputEl.value?.focus())
}

// Keyboard: Escape to close
function onKeydown(e) {
  if (e.key === 'Escape' && isOpen.value) close()
}
onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => document.removeEventListener('keydown', onKeydown))

// ── Auto-resize textarea ─────────────────────────────────────────────────
function autoResize() {
  const el = inputEl.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 120) + 'px'
}

// ── Scroll to bottom ─────────────────────────────────────────────────────
function scrollToBottom() {
  nextTick(() => {
    const container = messagesContainer.value
    if (container) container.scrollTop = container.scrollHeight
  })
}

// ── Send message & stream response ───────────────────────────────────────
async function send() {
  const text = inputText.value.trim()
  if (!text || isStreaming.value) return

  errorMsg.value = ''
  inputText.value = ''
  nextTick(autoResize)

  // Add user message
  messages.value.push({ role: 'user', content: text })
  scrollToBottom()

  // Start streaming
  isStreaming.value = true
  streamingContent.value = ''

  // Add placeholder for AI response
  const aiMsgIndex = messages.value.length
  messages.value.push({ role: 'model', content: '' })

  try {
    // Build the messages payload (full conversation history)
    const payload = messages.value
      .slice(0, -1)  // exclude the empty AI placeholder
      .map(m => ({ role: m.role, content: m.content }))

    const response = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: payload })
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.error || `Server error (${response.status})`)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      // Process complete SSE lines
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6).trim()

        if (data === '[DONE]') break

        try {
          const parsed = JSON.parse(data)
          if (parsed.error) {
            throw new Error(parsed.error)
          }
          if (parsed.text) {
            streamingContent.value += parsed.text
            messages.value[aiMsgIndex].content = streamingContent.value
            scrollToBottom()
          }
        } catch (parseErr) {
          if (parseErr.message !== 'Unexpected end of JSON input') {
            // Re-throw actual errors
            if (data.includes('"error"')) throw parseErr
          }
        }
      }
    }
  } catch (err) {
    console.error('Ask AI error:', err)
    errorMsg.value = err.message || 'Failed to get a response. Please try again.'

    // Remove empty AI message if nothing was streamed
    if (!messages.value[aiMsgIndex]?.content) {
      messages.value.splice(aiMsgIndex, 1)
    }
  } finally {
    isStreaming.value = false
    streamingContent.value = ''
    scrollToBottom()
    nextTick(() => inputEl.value?.focus())
  }
}

// ── Lightweight markdown rendering ───────────────────────────────────────
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function renderMarkdown(text) {
  if (!text) return ''

  // 1. Extract code blocks so we don't apply formatting inside them
  const codeBlocks = []
  let html = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const id = `__CODE_BLOCK_${codeBlocks.length}__`
    codeBlocks.push(`<pre class="ask-ai-code"><code>${escapeHtml(code.trim())}</code></pre>`)
    return id
  })

  // Escape all HTML tags for safety (except our placeholders)
  html = escapeHtml(html)

  // 2. Parse block elements line-by-line
  const lines = html.split('\n')
  const result = []
  let inUl = false
  let inOl = false

  for (let line of lines) {
    const trimmed = line.trim()

    // Headings (e.g. ### Option 1)
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/)
    if (headingMatch) {
      if (inUl) { result.push('</ul>'); inUl = false; }
      if (inOl) { result.push('</ol>'); inOl = false; }
      const level = headingMatch[1].length
      result.push(`<h${level} class="ask-ai-h${level}">${headingMatch[2]}</h${level}>`)
      continue
    }

    // Unordered Lists (e.g. - item or * item)
    const ulMatch = line.match(/^(\s*)[-*]\s+(.+)$/)
    if (ulMatch) {
      if (inOl) { result.push('</ol>'); inOl = false; }
      if (!inUl) { result.push('<ul class="ask-ai-ul">'); inUl = true; }
      result.push(`<li>${ulMatch[2]}</li>`)
      continue
    }

    // Ordered Lists (e.g. 1. item)
    const olMatch = line.match(/^(\s*)\d+\.\s+(.+)$/)
    if (olMatch) {
      if (inUl) { result.push('</ul>'); inUl = false; }
      if (!inOl) { result.push('<ol class="ask-ai-ol">'); inOl = true; }
      result.push(`<li>${olMatch[2]}</li>`)
      continue
    }

    // Empty line closes lists
    if (trimmed === '') {
      if (inUl) { result.push('</ul>'); inUl = false; }
      if (inOl) { result.push('</ol>'); inOl = false; }
      result.push('')
      continue
    }

    // Regular line continuation inside list item (if indented)
    if ((inUl || inOl) && (line.startsWith('  ') || line.startsWith('\t'))) {
      if (result.length > 0) {
        const last = result[result.length - 1]
        if (last.endsWith('</li>')) {
          result[result.length - 1] = last.slice(0, -5) + '<br>' + trimmed + '</li>'
          continue
        }
      }
    }

    // If a regular line has no indent and we're in a list, close the list
    if (inUl && !ulMatch) { result.push('</ul>'); inUl = false; }
    if (inOl && !olMatch) { result.push('</ol>'); inOl = false; }

    result.push(trimmed)
  }

  // Close any unclosed list blocks
  if (inUl) result.push('</ul>')
  if (inOl) result.push('</ol>')

  // 3. Assemble and group paragraphs
  let assembledHtml = ''
  let currentPara = []

  const flushPara = () => {
    if (currentPara.length > 0) {
      assembledHtml += `<p>${currentPara.join('<br>')}</p>`
      currentPara = []
    }
  }

  for (let item of result) {
    if (item === '') {
      flushPara()
      continue
    }

    // Check if it is already a block element
    const isBlock = item.startsWith('<h') || item.startsWith('<ul') || item.startsWith('</ul>') || item.startsWith('<ol') || item.startsWith('</ol>') || item.startsWith('<li>') || item.startsWith('__CODE_BLOCK_')

    if (isBlock) {
      flushPara()
      assembledHtml += item
    } else {
      currentPara.push(item)
    }
  }
  flushPara()

  // 4. Parse inline formatting
  // Bold: **text**
  assembledHtml = assembledHtml.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  // Italic: *text*
  assembledHtml = assembledHtml.replace(/\*(.+?)\*/g, '<em>$1</em>')
  // Inline Code: `code`
  assembledHtml = assembledHtml.replace(/`([^`]+)`/g, '<code class="ask-ai-inline-code">$1</code>')
  // Links: [text](url)
  assembledHtml = assembledHtml.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="ask-ai-link">$1</a>')

  // 5. Restore code blocks
  codeBlocks.forEach((codeHtml, idx) => {
    assembledHtml = assembledHtml.replace(`__CODE_BLOCK_${idx}__`, codeHtml)
  })

  return assembledHtml
}
</script>

<style scoped>
/* ── Floating Action Button ────────────────────────────────────────────── */
.ask-ai-fab {
  position: fixed;
  z-index: 100;
  right: 24px;
  bottom: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border: none;
  border-radius: 16px;
  background: linear-gradient(135deg, var(--vp-c-brand-1), var(--vp-c-brand-2));
  box-shadow:
    0 4px 16px rgba(8, 119, 249, 0.35),
    0 1px 3px rgba(0, 0, 0, 0.1);
  color: #fff;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease;
  animation: ask-ai-pulse 3s ease-in-out infinite;
}

.ask-ai-fab:hover {
  transform: translateY(-2px) scale(1.05);
  box-shadow:
    0 8px 28px rgba(8, 119, 249, 0.45),
    0 2px 6px rgba(0, 0, 0, 0.15);
  animation: none;
}

.ask-ai-fab:active {
  transform: scale(0.96);
}

.ask-ai-fab--hidden {
  opacity: 0;
  pointer-events: none;
  transform: scale(0.7);
}

@keyframes ask-ai-pulse {
  0%, 100% { box-shadow: 0 4px 16px rgba(8, 119, 249, 0.35); }
  50% { box-shadow: 0 4px 24px rgba(8, 119, 249, 0.55); }
}

/* ── Backdrop ──────────────────────────────────────────────────────────── */
.ask-ai-backdrop {
  position: fixed;
  z-index: 200;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(2px);
}

.ask-ai-backdrop-enter-active,
.ask-ai-backdrop-leave-active {
  transition: opacity 0.3s ease;
}

.ask-ai-backdrop-enter-from,
.ask-ai-backdrop-leave-to {
  opacity: 0;
}

/* ── Side Panel ────────────────────────────────────────────────────────── */
.ask-ai-panel {
  position: fixed;
  z-index: 201;
  top: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  width: 420px;
  max-width: 100vw;
  border-left: 1px solid var(--vp-c-divider);
  background: color-mix(in srgb, var(--vp-c-bg) 92%, transparent);
  backdrop-filter: blur(24px) saturate(160%);
  box-shadow: -8px 0 40px rgba(0, 0, 0, 0.12);
}

.ask-ai-panel-enter-active,
.ask-ai-panel-leave-active {
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.ask-ai-panel-enter-from,
.ask-ai-panel-leave-to {
  transform: translateX(100%);
}

/* ── Header ────────────────────────────────────────────────────────────── */
.ask-ai-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  padding: 16px 20px;
  border-bottom: 1px solid var(--vp-c-divider);
  background: color-mix(in srgb, var(--vp-c-bg-alt) 80%, transparent);
}

.ask-ai-header__title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--vp-c-text-1);
}

.ask-ai-header__icon {
  color: var(--vp-c-brand-1);
}

.ask-ai-header__actions {
  display: flex;
  gap: 4px;
}

.ask-ai-btn-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--vp-c-text-2);
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease;
}

.ask-ai-btn-icon:hover {
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
}

.ask-ai-btn-icon:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

/* ── Messages Area ─────────────────────────────────────────────────────── */
.ask-ai-messages {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  scroll-behavior: smooth;
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--vp-c-brand-1) 30%, transparent) transparent;
}

/* ── Welcome State ─────────────────────────────────────────────────────── */
.ask-ai-welcome {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px 16px 20px;
  text-align: center;
}

.ask-ai-welcome__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  margin-bottom: 16px;
  border-radius: 16px;
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
}

.ask-ai-welcome__title {
  margin: 0 0 8px;
  font-size: 18px;
  font-weight: 700;
  color: var(--vp-c-text-1);
  letter-spacing: -0.02em;
}

.ask-ai-welcome__text {
  margin: 0 0 24px;
  color: var(--vp-c-text-2);
  font-size: 14px;
  line-height: 1.6;
}

/* ── Message Bubbles ───────────────────────────────────────────────────── */
.ask-ai-msg {
  margin-bottom: 14px;
  display: flex;
}

.ask-ai-msg--user {
  justify-content: flex-end;
}

.ask-ai-msg--model {
  justify-content: flex-start;
}

.ask-ai-msg__bubble {
  max-width: 88%;
  padding: 10px 14px;
  border-radius: 14px;
  font-size: 14px;
  line-height: 1.65;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

.ask-ai-msg--user .ask-ai-msg__bubble {
  background: linear-gradient(135deg, var(--vp-c-brand-1), var(--vp-c-brand-2));
  color: #fff;
  border-bottom-right-radius: 4px;
}

.ask-ai-msg--model .ask-ai-msg__bubble {
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
  border: 1px solid var(--vp-c-divider);
  border-bottom-left-radius: 4px;
}

/* ── Markdown inside AI bubbles ────────────────────────────────────────── */
.ask-ai-msg--model .ask-ai-msg__bubble :deep(p) {
  margin: 0 0 8px;
}

.ask-ai-msg--model .ask-ai-msg__bubble :deep(p:last-child) {
  margin-bottom: 0;
}

.ask-ai-msg--model .ask-ai-msg__bubble :deep(strong) {
  font-weight: 650;
  color: var(--vp-c-text-1);
}

.ask-ai-msg--model .ask-ai-msg__bubble :deep(a.ask-ai-link) {
  color: var(--vp-c-brand-1);
  text-decoration: underline;
  text-underline-offset: 2px;
  font-weight: 550;
}

.ask-ai-msg--model .ask-ai-msg__bubble :deep(a.ask-ai-link:hover) {
  color: var(--vp-c-brand-2);
}

/* Headings styling */
.ask-ai-msg--model .ask-ai-msg__bubble :deep(h1),
.ask-ai-msg--model .ask-ai-msg__bubble :deep(h2),
.ask-ai-msg--model .ask-ai-msg__bubble :deep(h3),
.ask-ai-msg--model .ask-ai-msg__bubble :deep(h4),
.ask-ai-msg--model .ask-ai-msg__bubble :deep(h5),
.ask-ai-msg--model .ask-ai-msg__bubble :deep(h6) {
  margin: 14px 0 6px;
  font-weight: 750;
  line-height: 1.3;
  letter-spacing: -0.015em;
  color: var(--vp-c-text-1);
}
.ask-ai-msg--model .ask-ai-msg__bubble :deep(h1) { font-size: 1.25rem; }
.ask-ai-msg--model .ask-ai-msg__bubble :deep(h2) { font-size: 1.15rem; }
.ask-ai-msg--model .ask-ai-msg__bubble :deep(h3) { font-size: 1.05rem; }
.ask-ai-msg--model .ask-ai-msg__bubble :deep(h4),
.ask-ai-msg--model .ask-ai-msg__bubble :deep(h5),
.ask-ai-msg--model .ask-ai-msg__bubble :deep(h6) { font-size: 0.95rem; }

.ask-ai-msg--model .ask-ai-msg__bubble :deep(ol.ask-ai-ol) {
  list-style-type: decimal;
  margin: 6px 0;
  padding-left: 20px;
}

.ask-ai-msg--model .ask-ai-msg__bubble :deep(ul.ask-ai-ul) {
  list-style-type: disc;
  margin: 6px 0;
  padding-left: 20px;
}

.ask-ai-msg--model .ask-ai-msg__bubble :deep(li) {
  margin-bottom: 4px;
}

.ask-ai-msg--model .ask-ai-msg__bubble :deep(pre.ask-ai-code) {
  margin: 8px 0;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--vp-c-bg-alt);
  overflow-x: auto;
  font-size: 13px;
}

.ask-ai-msg--model .ask-ai-msg__bubble :deep(code.ask-ai-inline-code) {
  padding: 2px 6px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--vp-c-brand-soft) 50%, var(--vp-c-bg-soft));
  font-size: 0.9em;
  color: var(--vp-c-brand-1);
}

/* ── Typing Indicator ──────────────────────────────────────────────────── */
.ask-ai-msg__typing {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 14px 18px;
}

.ask-ai-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--vp-c-text-3);
  animation: ask-ai-bounce 1.4s ease-in-out infinite;
}

.ask-ai-dot:nth-child(2) { animation-delay: 0.16s; }
.ask-ai-dot:nth-child(3) { animation-delay: 0.32s; }

@keyframes ask-ai-bounce {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
  30% { transform: translateY(-6px); opacity: 1; }
}

/* ── Error Message ─────────────────────────────────────────────────────── */
.ask-ai-error {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 10px 0;
  padding: 10px 14px;
  border-radius: 10px;
  background: color-mix(in srgb, #ef4444 12%, var(--vp-c-bg-soft));
  border: 1px solid color-mix(in srgb, #ef4444 25%, var(--vp-c-divider));
  color: #ef4444;
  font-size: 13px;
}

/* ── Input Area ────────────────────────────────────────────────────────── */
.ask-ai-input-area {
  flex-shrink: 0;
  padding: 12px 16px 14px;
  border-top: 1px solid var(--vp-c-divider);
  background: color-mix(in srgb, var(--vp-c-bg-alt) 70%, transparent);
}

.ask-ai-input-wrap {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 6px 6px 6px 14px;
  border: 1px solid var(--vp-c-border);
  border-radius: 14px;
  background: var(--vp-c-bg);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.ask-ai-input-wrap:focus-within {
  border-color: color-mix(in srgb, var(--vp-c-brand-1) 50%, var(--vp-c-border));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--vp-c-brand-1) 12%, transparent);
}

.ask-ai-input {
  flex: 1;
  min-height: 36px;
  max-height: 120px;
  border: none;
  background: transparent;
  color: var(--vp-c-text-1);
  font-family: inherit;
  font-size: 14px;
  line-height: 1.5;
  resize: none;
  outline: none;
}

.ask-ai-input::placeholder {
  color: var(--vp-c-text-3);
}

.ask-ai-send {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  border: none;
  border-radius: 10px;
  background: linear-gradient(135deg, var(--vp-c-brand-1), var(--vp-c-brand-2));
  color: #fff;
  cursor: pointer;
  transition: opacity 0.2s ease, transform 0.15s ease;
}

.ask-ai-send:hover:not(:disabled) {
  transform: scale(1.06);
}

.ask-ai-send:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.ask-ai-disclaimer {
  margin: 8px 0 0;
  color: var(--vp-c-text-3);
  font-size: 11px;
  text-align: center;
  line-height: 1.4;
}

/* ── Mobile ────────────────────────────────────────────────────────────── */
@media (max-width: 767px) {
  .ask-ai-panel {
    width: 100vw;
  }

  .ask-ai-fab {
    right: 16px;
    bottom: 16px;
    width: 50px;
    height: 50px;
    border-radius: 14px;
  }
}

/* hide backdrop on desktop */
@media (min-width: 768px) {
  .ask-ai-backdrop {
    display: none;
  }
}
</style>
