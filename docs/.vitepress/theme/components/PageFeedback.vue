<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useData, useRoute } from 'vitepress'

type SubmissionState = 'idle' | 'sending' | 'sent' | 'error'

const STORAGE_PREFIX = 'nuvio-page-feedback:v1:'
const route = useRoute()
const { page } = useData()
const choice = ref<boolean | null>(null)
const submissionState = ref<SubmissionState>('idle')

const isDutch = computed(() => route.path.startsWith('/nl/'))
const pagePath = computed(() => route.path.split(/[?#]/, 1)[0] || '/')

function storageKey() {
  return `${STORAGE_PREFIX}${pagePath.value}`
}

function restoreVote() {
  choice.value = null
  submissionState.value = 'idle'
  if (typeof window === 'undefined') return

  try {
    const stored = window.localStorage.getItem(storageKey())
    if (stored === 'yes' || stored === 'no') {
      choice.value = stored === 'yes'
      submissionState.value = 'sent'
    }
  } catch {
    // Feedback still works when storage is blocked.
  }
}

async function submitVote(helpful: boolean) {
  if (submissionState.value === 'sending' || submissionState.value === 'sent') return

  choice.value = helpful
  submissionState.value = 'sending'

  try {
    const response = await fetch('/api/page-feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        helpful,
        page: pagePath.value,
        title: page.value.title
      })
    })
    if (!response.ok) throw new Error(`Feedback returned HTTP ${response.status}`)

    submissionState.value = 'sent'
    try {
      window.localStorage.setItem(storageKey(), helpful ? 'yes' : 'no')
    } catch {
      // The server has the vote even if storage is unavailable.
    }
  } catch {
    submissionState.value = 'error'
  }
}

watch(() => route.path, restoreVote)
onMounted(restoreVote)
</script>

<template>
  <aside class="page-feedback" aria-labelledby="page-feedback-title">
    <div class="page-feedback__copy">
      <span class="page-feedback__eyebrow">{{ isDutch ? 'Snelle feedback' : 'A quick question' }}</span>
      <strong id="page-feedback-title">
        {{ isDutch ? 'Was deze pagina nuttig?' : 'Was this page helpful?' }}
      </strong>
      <p v-if="choice !== null" role="status" aria-live="polite">
        <template v-if="choice">
          {{ isDutch ? 'Fijn om te horen. Je kunt het project steunen via Ko-fi.' : 'Glad to hear it. Please consider supporting the project on Ko-fi ❤️' }}
        </template>
        <template v-else>
          {{ isDutch ? 'Bedankt — je antwoord helpt ons deze pagina te verbeteren.' : 'Thanks for the honest feedback. This helps me improve this page' }}
        </template>
      </p>
      <p v-else>
        {{ isDutch ? 'Je antwoord wordt anoniem gedeeld met de wiki-beheerders.' : 'Your answer will help me to improve the docs.' }}
      </p>
    </div>

    <div v-if="choice === null" class="page-feedback__actions" aria-label="Page feedback choices">
      <button type="button" class="page-feedback__choice" @click="submitVote(true)">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10v10H4V10h3Zm3 10V9l3-6c1.5.4 2.2 1.8 1.8 3.2L14.3 8H20c1.1 0 1.9 1 1.7 2.1l-1.3 7.5A3 3 0 0 1 17.5 20H10Z" /></svg>
        {{ isDutch ? 'Ja' : 'Yes' }}
      </button>
      <button type="button" class="page-feedback__choice" @click="submitVote(false)">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 14V4H4v10h3Zm3-10v11l3 6c1.5-.4 2.2-1.8 1.8-3.2l-.5-1.8H20c1.1 0 1.9-1 1.7-2.1l-1.3-7.5A3 3 0 0 0 17.5 4H10Z" /></svg>
        {{ isDutch ? 'Nee' : 'No' }}
      </button>
    </div>

    <div v-else class="page-feedback__response-actions">
      <a
        v-if="choice"
        class="page-feedback__donate"
        href="https://ko-fi.com/haaihond"
        target="_blank"
        rel="noopener noreferrer"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.3 3.8 12A5.4 5.4 0 0 1 12 5a5.4 5.4 0 0 1 8.2 7L12 20.3Z" /></svg>
        {{ isDutch ? 'Steun via Ko-fi' : 'Support on Ko-fi' }}
      </a>
      <button
        v-if="submissionState === 'error'"
        type="button"
        class="page-feedback__retry"
        @click="submitVote(Boolean(choice))"
      >
        {{ isDutch ? 'Opnieuw proberen' : 'Retry sending' }}
      </button>
      <span v-else-if="submissionState === 'sending'" class="page-feedback__sending">
        {{ isDutch ? 'Versturen…' : 'Sending…' }}
      </span>
    </div>

    <small v-if="submissionState === 'error'" class="page-feedback__error" role="alert">
      {{ isDutch ? 'Je antwoord kon niet worden opgeslagen.' : 'Your answer could not be saved.' }}
    </small>
  </aside>
</template>

<style scoped>
.page-feedback {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 16px;
  margin-bottom: 32px;
  padding: 14px 16px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  background: var(--vp-c-bg-soft);
}

.page-feedback__copy { min-width: 0; }

.page-feedback__eyebrow {
  display: block;
  margin-bottom: 2px;
  color: var(--vp-c-text-3);
  font-size: 10px;
  font-weight: 650;
  letter-spacing: .06em;
  text-transform: uppercase;
}

.page-feedback strong {
  display: block;
  color: var(--vp-c-text-1);
  font-size: 15px;
  line-height: 1.35;
}

.page-feedback p {
  margin: 3px 0 0;
  color: var(--vp-c-text-2);
  font-size: 13px;
  line-height: 1.4;
}

.page-feedback__actions,
.page-feedback__response-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  flex-wrap: wrap;
}

.page-feedback__choice,
.page-feedback__retry,
.page-feedback__donate {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 32px;
  border-radius: 7px;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: border-color .15s ease, background-color .15s ease, color .15s ease;
}

.page-feedback__choice {
  min-width: 62px;
  border: 1px solid var(--vp-c-divider);
  background: transparent;
  color: var(--vp-c-text-2);
}

.page-feedback__choice:hover {
  border-color: var(--vp-c-text-3);
  background: var(--vp-c-bg-mute);
  color: var(--vp-c-text-1);
}

.page-feedback__choice svg,
.page-feedback__donate svg {
  width: 14px;
  height: 14px;
  fill: currentColor;
}

.page-feedback__donate {
  padding: 0 11px;
  border: 1px solid color-mix(in srgb, #ff5e5b 55%, var(--vp-c-divider));
  background: transparent;
  color: #e94e4b;
  text-decoration: none;
}

.page-feedback__donate:hover {
  border-color: #e94e4b;
  background: color-mix(in srgb, #ff5e5b 8%, transparent);
  color: #e94e4b;
}

.page-feedback__choice:focus-visible,
.page-feedback__retry:focus-visible,
.page-feedback__donate:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}

.page-feedback__retry {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--vp-c-brand-1);
}

.page-feedback__sending,
.page-feedback__error {
  color: var(--vp-c-text-3);
  font-size: 12px;
}

.page-feedback__error {
  grid-column: 1 / -1;
  margin-top: -12px;
  color: var(--vp-c-danger-1);
}

@media (max-width: 639px) {
  .page-feedback {
    grid-template-columns: 1fr;
    gap: 12px;
    margin-bottom: 24px;
    padding: 14px;
  }

  .page-feedback__actions,
  .page-feedback__response-actions { justify-content: flex-start; }

  .page-feedback__error { margin-top: -6px; }
}
</style>
