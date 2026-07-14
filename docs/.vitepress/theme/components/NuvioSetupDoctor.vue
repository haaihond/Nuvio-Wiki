<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { withBase } from 'vitepress'
import {
  areas,
  findings,
  installChecksByPlatform,
  playbackChecksByPlatform,
  platforms,
  symptomsByArea,
  type AnswerValue,
  type AreaId,
  type FindingId,
  type PlatformId
} from './setupDoctorData'

type DoctorStep = 1 | 2 | 3 | 4

const steps = [
  { number: 1, label: 'Start' },
  { number: 2, label: 'Symptom' },
  { number: 3, label: 'Checks' },
  { number: 4, label: 'Answer' }
] as const

const findingPriority: Partial<Record<FindingId, number>> = {
  'dolby-vision': 100,
  'addon-disabled': 100,
  'ios-p2p-unsupported': 95,
  'native-debrid-readiness': 95,
  'native-debrid-connection': 95,
  'native-debrid-p2p': 95,
  'debrid-subscription': 90,
  'debrid-session': 90,
  'wrong-build': 90,
  'low-storage': 90,
  'signature-conflict': 90,
  'addon-host-load': 85,
  'isp-routing': 85,
  'auto-frame-rate': 80,
  'tunneled-playback': 75,
  'stream-file': 80,
  'vpn-filter': 80,
  'subtitle-source': 80,
  'subtitle-sync': 80,
  'subtitle-startup': 80,
  'local-network': 70,
  'content-availability': 65,
  'codec-renderer': 45,
  'network-buffering': 85,
  'common-checks-passed': 0
}

const step = ref<DoctorStep>(1)
const maxStepReached = ref<DoctorStep>(1)
const selectedArea = ref<AreaId | ''>('')
const selectedPlatform = ref<PlatformId | ''>('')
const selectedSymptom = ref('')
const selectedSubSymptom = ref('')
const showingSubSymptoms = ref(false)
const answers = ref<Record<string, AnswerValue>>({})
const stageHeading = ref<HTMLElement>()
const feedbackChoice = ref<boolean | null>(null)
const feedbackState = ref<'idle' | 'sending' | 'sent' | 'error'>('idle')

const isCheckingStatus = ref(false)
const nuvioServicesUp = ref<boolean | null>(null)

async function checkNuvioStatus() {
  if (isCheckingStatus.value) return
  isCheckingStatus.value = true
  try {
    const response = await fetch(withBase('/api/status?provider=ibbylabs'))
    if (!response.ok) throw new Error('Status request failed')
    const data = await response.json()
    if (data && Array.isArray(data.services)) {
      const nuvioServices = data.services.filter((s: any) =>
        s.group === 'Nuvio' || s.id.startsWith('nuvio-')
      )
      if (nuvioServices.length > 0) {
        const hasIssue = nuvioServices.some((s: any) => s.status === 'outage' || s.status === 'degraded')
        nuvioServicesUp.value = !hasIssue
      } else {
        nuvioServicesUp.value = !(data.summary?.outages > 0)
      }
    } else {
      nuvioServicesUp.value = true
    }
  } catch (error) {
    console.error('Failed to check Nuvio service status:', error)
    nuvioServicesUp.value = true
  } finally {
    isCheckingStatus.value = false
  }
}

watch([selectedArea, selectedSymptom], ([area, symptom]) => {
  if (area === 'install' && symptom === 'login') {
    checkNuvioStatus()
  } else {
    nuvioServicesUp.value = null
  }
})

const discordDmHref = 'https://discord.com/channels/@me'
const kofiHref = 'https://ko-fi.com/haaihond'
const redditThreadHref = 'https://www.reddit.com/r/Nuvio/comments/1uv9eka/the_setup_doctor_is_live/'

const selectedAreaData = computed(() => areas.find((area) => area.id === selectedArea.value))
const selectedPlatformData = computed(() => platforms.find((platform) => platform.id === selectedPlatform.value))
const availableSymptoms = computed(() => selectedArea.value ? symptomsByArea[selectedArea.value] : [])
const selectedSymptomData = computed(() => availableSymptoms.value.find((symptom) => symptom.id === selectedSymptom.value))
const selectedSubSymptomData = computed(() => {
  if (!selectedSymptomData.value?.subSymptoms) return undefined
  return selectedSymptomData.value.subSymptoms.find((sub) => sub.id === selectedSubSymptom.value)
})
const currentChecks = computed(() => {
  const symptom = selectedSymptomData.value
  if (!symptom) return []

  if (symptom.subSymptoms) {
    const subSymptom = selectedSubSymptomData.value
    if (!subSymptom) return []

    if (selectedPlatform.value && selectedArea.value === 'playback') {
      return playbackChecksByPlatform[selectedPlatform.value]?.[subSymptom.id] ?? subSymptom.checks
    }
    return subSymptom.checks
  }

  if (selectedPlatform.value) {
    if (selectedArea.value === 'install') {
      return installChecksByPlatform[selectedPlatform.value][symptom.id] ?? symptom.checks
    } else if (selectedArea.value === 'playback') {
      return playbackChecksByPlatform[selectedPlatform.value]?.[symptom.id] ?? symptom.checks
    }
  }

  return symptom.checks ?? []
})
const canLeaveStart = computed(() => Boolean(selectedArea.value && selectedPlatform.value))
const canLeaveSymptom = computed(() => {
  if (!selectedSymptom.value) return false
  if (selectedSymptomData.value?.subSymptoms && showingSubSymptoms.value) {
    return Boolean(selectedSubSymptom.value)
  }
  return true
})
const canShowResults = computed(() => currentChecks.value.length > 0 && currentChecks.value.every((check) => answers.value[check.id]))

const resultContext = computed(() => [
  selectedPlatformData.value?.label,
  selectedAreaData.value?.label,
  selectedSymptomData.value?.label,
  selectedSubSymptomData.value?.label
].filter(Boolean).join(' · '))

const diagnosisResults = computed(() => {
  if (!selectedSymptomData.value) return []

  const evidence = new Map<FindingId, { uncertain: boolean }>()
  for (const check of currentChecks.value) {
    const answer = answers.value[check.id]
    const findingId = answer ? check.findingByAnswer[answer] : undefined
    if (!findingId) continue

    const uncertain = answer === 'unsure' || answer === 'not-tried'
    const existing = evidence.get(findingId)
    if (!existing || (existing.uncertain && !uncertain)) evidence.set(findingId, { uncertain })
  }

  if (evidence.size === 0) evidence.set('common-checks-passed', { uncertain: false })

  const rankedEvidence = Array.from(evidence.entries())
    .sort(([leftId, left], [rightId, right]) => {
      const certaintyDifference = Number(left.uncertain) - Number(right.uncertain)
      if (certaintyDifference !== 0) return certaintyDifference
      return (findingPriority[rightId] ?? 60) - (findingPriority[leftId] ?? 60)
    })

  return rankedEvidence.slice(0, 3).map(([id, match], index) => {
    const finding = findings[id]
    const useInstallationGuide = (id === 'wrong-build' || id === 'platform-install') && selectedPlatformData.value

    return {
      id,
      ...finding,
      confidence: id === 'common-checks-passed'
        ? 'Next step'
        : match.uncertain
          ? 'Worth checking'
          : index === 0 ? 'Most likely' : 'Also check',
      href: useInstallationGuide ? selectedPlatformData.value!.installHref : finding.href,
      linkLabel: useInstallationGuide
        ? `Open the ${selectedPlatformData.value!.label.toLowerCase()} guide`
        : finding.linkLabel
    }
  })
})

function focusCurrentStage() {
  nextTick(() => stageHeading.value?.focus())
}

function setStep(nextStep: DoctorStep) {
  step.value = nextStep
  if (nextStep > maxStepReached.value) maxStepReached.value = nextStep
  focusCurrentStage()
}

function visitStep(nextStep: DoctorStep) {
  if (nextStep <= maxStepReached.value) setStep(nextStep)
}

function selectPlatform(id: PlatformId) {
  if (selectedPlatform.value && selectedPlatform.value !== id && selectedArea.value === 'install') {
    answers.value = {}
    maxStepReached.value = 1
  }
  selectedPlatform.value = id
}

function selectArea(id: AreaId) {
  if (selectedArea.value && selectedArea.value !== id) {
    selectedSymptom.value = ''
    selectedSubSymptom.value = ''
    showingSubSymptoms.value = false
    answers.value = {}
    maxStepReached.value = 1
  }
  selectedArea.value = id
}

function selectSymptom(id: string) {
  if (selectedSymptom.value !== id) {
    selectedSubSymptom.value = ''
    showingSubSymptoms.value = false
    answers.value = {}
    maxStepReached.value = 2
  }
  selectedSymptom.value = id
}

function selectSubSymptom(id: string) {
  if (selectedSubSymptom.value !== id) {
    answers.value = {}
    maxStepReached.value = 2
  }
  selectedSubSymptom.value = id
}

function selectAnswer(checkId: string, value: AnswerValue) {
  answers.value = { ...answers.value, [checkId]: value }
}

function continueFromStart() {
  if (canLeaveStart.value) setStep(2)
}

function continueFromSymptom() {
  if (!canLeaveSymptom.value) return

  if (selectedSymptomData.value?.subSymptoms && !showingSubSymptoms.value) {
    showingSubSymptoms.value = true
    focusCurrentStage()
  } else {
    setStep(3)
  }
}

function goBackFromSymptom() {
  if (showingSubSymptoms.value) {
    showingSubSymptoms.value = false
    selectedSubSymptom.value = ''
    focusCurrentStage()
  } else {
    setStep(1)
  }
}

function showResults() {
  if (canShowResults.value) setStep(4)
}

async function submitFeedback(helpful: boolean) {
  if (feedbackState.value === 'sending' || feedbackState.value === 'sent') return
  feedbackChoice.value = helpful
  feedbackState.value = 'sending'

  const payload = {
    helpful,
    areaId: selectedArea.value,
    area: selectedAreaData.value?.label,
    platformId: selectedPlatform.value,
    platform: selectedPlatformData.value?.label,
    symptomId: selectedSubSymptom.value || selectedSymptom.value,
    symptom: selectedSubSymptomData.value?.label || selectedSymptomData.value?.label,
    page: typeof window === 'undefined' ? '/setup-doctor' : window.location.pathname,
    answers: currentChecks.value.map((check) => ({
      id: check.id,
      label: check.question,
      value: check.options.find((option) => option.value === answers.value[check.id])?.label || answers.value[check.id]
    })),
    results: diagnosisResults.value.map((result) => ({ id: result.id, label: result.title }))
  }

  try {
    const response = await fetch('/api/setup-doctor/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload)
    })
    if (!response.ok) throw new Error(`Feedback returned HTTP ${response.status}`)
    feedbackState.value = 'sent'
  } catch {
    feedbackState.value = 'error'
  }
}

function resetDoctor() {
  selectedArea.value = ''
  selectedPlatform.value = ''
  selectedSymptom.value = ''
  selectedSubSymptom.value = ''
  showingSubSymptoms.value = false
  answers.value = {}
  feedbackChoice.value = null
  feedbackState.value = 'idle'
  maxStepReached.value = 1
  nuvioServicesUp.value = null
  setStep(1)
}
</script>

<template>
  <main class="setup-doctor">
    <header class="doctor-hero">
      <div class="doctor-kicker">
        <img class="doctor-kicker__logo" :src="withBase('/tools_icon_coloured.webp')" alt="" aria-hidden="true" />
        Triage Desk
      </div>
      <h1>Tell the Doctor where it hurts.</h1>
      <p>
        Select your symptoms, answer a few diagnostic questions, and get a custom prescription to cure what's ailing your Nuvio setup.
      </p>
      <div class="doctor-trust" aria-label="Setup Doctor details">
        <span>No insurance required</span>
        <span>Doctor-patient confidentiality</span>
        <span>Express check-up (~1 min)</span>
      </div>
    </header>

    <div class="doctor-shell">
      <nav class="doctor-progress" aria-label="Setup Doctor progress">
        <ol>
          <li v-for="item in steps" :key="item.number" :class="{ complete: item.number < step }">
            <button
              type="button"
              :disabled="item.number > maxStepReached"
              :aria-current="item.number === step ? 'step' : undefined"
              @click="visitStep(item.number)"
            >
              <span class="doctor-progress__number" aria-hidden="true">
                <svg v-if="item.number < step" viewBox="0 0 16 16">
                  <path d="m3.2 8.2 3 3 6.6-6.5" />
                </svg>
                <template v-else>{{ item.number }}</template>
              </span>
              <span>{{ item.label }}</span>
            </button>
          </li>
        </ol>
      </nav>

      <section class="doctor-panel">
        <div v-if="step === 1" class="doctor-stage">
          <div class="doctor-stage__header">
            <span>Step 1 of 3</span>
            <h2 ref="stageHeading" tabindex="-1">Let’s narrow it down</h2>
            <p>Pick your device and the part of Nuvio that needs attention.</p>
          </div>

          <fieldset class="doctor-fieldset">
            <legend>What are you using?</legend>
            <div class="choice-grid choice-grid--platforms">
              <label
                v-for="platform in platforms"
                :key="platform.id"
                class="choice-card choice-card--compact"
                :class="{ selected: selectedPlatform === platform.id }"
              >
                <input
                  type="radio"
                  name="doctor-platform"
                  :value="platform.id"
                  :checked="selectedPlatform === platform.id"
                  @change="selectPlatform(platform.id)"
                />
                <span class="choice-card__check" aria-hidden="true"></span>
                <strong>{{ platform.label }}</strong>
                <small>{{ platform.description }}</small>
              </label>
            </div>
          </fieldset>

          <fieldset class="doctor-fieldset">
            <legend>What is going wrong?</legend>
            <div class="choice-grid">
              <label
                v-for="area in areas"
                :key="area.id"
                class="choice-card"
                :class="{ selected: selectedArea === area.id }"
              >
                <input
                  type="radio"
                  name="doctor-area"
                  :value="area.id"
                  :checked="selectedArea === area.id"
                  @change="selectArea(area.id)"
                />
                <span class="choice-card__check" aria-hidden="true"></span>
                <strong>{{ area.label }}</strong>
                <small>{{ area.description }}</small>
              </label>
            </div>
          </fieldset>

          <div class="doctor-actions doctor-actions--end">
            <button class="doctor-button doctor-button--primary" type="button" :disabled="!canLeaveStart" @click="continueFromStart">
              Continue
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7 4 6 6-6 6" /></svg>
            </button>
          </div>
        </div>

        <div v-else-if="step === 2" class="doctor-stage">
          <template v-if="!showingSubSymptoms">
            <div class="doctor-stage__header">
              <span>Step 2 of 3</span>
              <h2 ref="stageHeading" tabindex="-1">Which symptom is closest?</h2>
              <p>Choose the best match. You can go back if none of these feels right.</p>
            </div>

            <fieldset class="doctor-fieldset doctor-fieldset--flush">
              <legend class="sr-only">Choose a symptom</legend>
              <div class="choice-grid">
                <label
                  v-for="symptom in availableSymptoms"
                  :key="symptom.id"
                  class="choice-card choice-card--symptom"
                  :class="{ selected: selectedSymptom === symptom.id }"
                >
                  <input
                    type="radio"
                    name="doctor-symptom"
                    :value="symptom.id"
                    :checked="selectedSymptom === symptom.id"
                    @change="selectSymptom(symptom.id)"
                  />
                  <span class="choice-card__check" aria-hidden="true"></span>
                  <strong>{{ symptom.label }}</strong>
                  <small>{{ symptom.description }}</small>
                </label>
              </div>
            </fieldset>
          </template>

          <template v-else>
            <div class="doctor-stage__header">
              <span>Step 2 of 3</span>
              <h2 ref="stageHeading" tabindex="-1">
                {{ selectedSymptomData?.id === 'buffering' ? 'Buffering or stuttering?' : 'Narrow down the playback error' }}
              </h2>
              <p>
                {{ selectedSymptomData?.id === 'buffering'
                  ? 'Identify which type of playback issue you are experiencing. Buffering is network-related, while stuttering is usually decoding/performance-related.'
                  : 'Select the specific playback issue you are experiencing.' }}
              </p>
            </div>

            <fieldset class="doctor-fieldset doctor-fieldset--flush">
              <legend class="sr-only">
                {{ selectedSymptomData?.id === 'buffering' ? 'Choose buffering or stuttering' : 'Choose a specific playback error' }}
              </legend>
              <div class="choice-grid">
                <label
                  v-for="subSymptom in selectedSymptomData?.subSymptoms"
                  :key="subSymptom.id"
                  class="choice-card choice-card--symptom"
                  :class="{ selected: selectedSubSymptom === subSymptom.id }"
                >
                  <input
                    type="radio"
                    name="doctor-subsymptom"
                    :value="subSymptom.id"
                    :checked="selectedSubSymptom === subSymptom.id"
                    @change="selectSubSymptom(subSymptom.id)"
                  />
                  <span class="choice-card__check" aria-hidden="true"></span>
                  <strong>{{ subSymptom.label }}</strong>
                  <small>{{ subSymptom.description }}</small>
                </label>
              </div>
            </fieldset>
          </template>

          <aside class="doctor-contact-card">
            <div>
              <strong>Is your symptom missing?</strong>
              <p>Tell me what you are seeing so I can add it to the Setup Doctor.</p>
            </div>
            <div class="doctor-contact-links doctor-contact-card__links">
              <a :href="discordDmHref" target="_blank" rel="noopener noreferrer">Discord · @haaihondschildpad</a>
              <a :href="redditThreadHref" target="_blank" rel="noopener noreferrer">Reddit · thread</a>
            </div>
          </aside>

          <div class="doctor-actions">
            <button class="doctor-button doctor-button--quiet" type="button" @click="goBackFromSymptom">
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m13 4-6 6 6 6" /></svg>
              Back
            </button>
            <button class="doctor-button doctor-button--primary" type="button" :disabled="!canLeaveSymptom" @click="continueFromSymptom">
              Continue
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7 4 6 6-6 6" /></svg>
            </button>
          </div>
        </div>

        <div v-else-if="step === 3" class="doctor-stage">
          <div class="doctor-stage__header">
            <span>Step 3 of 3</span>
            <h2 ref="stageHeading" tabindex="-1">Quick checks</h2>
            <p>Your answers help put the most useful fix first.</p>
          </div>

          <div class="check-list">
            <div
              v-for="(check, index) in currentChecks"
              :key="check.id"
              class="check-card"
              role="group"
              :aria-labelledby="`doctor-check-label-${check.id}`"
            >
              <div :id="`doctor-check-label-${check.id}`" class="check-card__question">
                <span>{{ index + 1 }}</span>
                {{ check.question }}
              </div>
              <p>{{ check.hint }}</p>
              <div class="answer-grid">
                <label
                  v-for="option in check.options"
                  :key="option.value"
                  class="answer-button"
                  :class="{ selected: answers[check.id] === option.value }"
                >
                  <input
                    type="radio"
                    :name="`doctor-check-${check.id}`"
                    :value="option.value"
                    :checked="answers[check.id] === option.value"
                    @change="selectAnswer(check.id, option.value)"
                  />
                  <span>{{ option.label }}</span>
                </label>
              </div>
            </div>
          </div>

          <div class="doctor-actions">
            <button class="doctor-button doctor-button--quiet" type="button" @click="setStep(2)">
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m13 4-6 6 6 6" /></svg>
              Back
            </button>
            <button class="doctor-button doctor-button--primary" type="button" :disabled="!canShowResults" @click="showResults">
              Show my diagnosis
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7 4 6 6-6 6" /></svg>
            </button>
          </div>
        </div>

        <div v-else class="doctor-stage doctor-results">
          <div class="doctor-stage__header doctor-stage__header--results">
            <span>Your check-up is ready</span>
            <div class="doctor-result-mark" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="m5 12.5 4.3 4.3L19 7" /></svg>
            </div>
            <h2 ref="stageHeading" tabindex="-1">
              <template v-if="selectedArea === 'install' && selectedSymptom === 'login' && nuvioServicesUp === true">
                Nuvio seems to be up, so try these things:
              </template>
              <template v-else-if="selectedArea === 'install' && selectedSymptom === 'login' && nuvioServicesUp === false">
                Nuvio is currently down
              </template>
              <template v-else>
                Start with the first fix
              </template>
            </h2>
            <p>{{ resultContext }}</p>
          </div>

          <div v-if="selectedArea === 'install' && selectedSymptom === 'login' && nuvioServicesUp === false" class="status-warning-banner">
            <svg viewBox="0 0 24 24" class="warning-icon" aria-hidden="true">
              <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div class="warning-content">
              <strong>Nuvio services appear to be down</strong>
              <p>
                Our monitor detected that Nuvio is currently experiencing an outage.
                Please check the <a :href="withBase('/status')">Service Status</a> page for live details.
              </p>
            </div>
          </div>

          <div class="result-list">
            <article v-for="(result, index) in diagnosisResults" :key="result.id" class="result-card">
              <div class="result-card__topline">
                <span>{{ result.confidence }}</span>
                <b aria-hidden="true">0{{ index + 1 }}</b>
              </div>
              <h3>{{ result.title }}</h3>
              <p>{{ result.summary }}</p>
              <h4>Try this</h4>
              <ul>
                <li v-for="fix in result.fixes" :key="fix">{{ fix }}</li>
              </ul>
              <a :href="withBase(result.href)">
                {{ result.linkLabel }}
                <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7 4 6 6-6 6" /></svg>
              </a>
            </article>
          </div>

          <aside class="doctor-privacy">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="5" y="10" width="14" height="10" rx="2" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" />
            </svg>
            <div>
              <strong>Protect private setup details</strong>
              <p>Never post Debrid API keys, addon manifest URLs, or account credentials when asking for help.</p>
            </div>
          </aside>

          <section class="doctor-feedback" aria-labelledby="doctor-feedback-heading">
            <div>
              <span>Guide feedback</span>
              <h3 id="doctor-feedback-heading">Did this help?</h3>
              <p>Your anonymous setup choices and results help show which parts of the guide need work.</p>
            </div>
            <div v-if="feedbackState === 'idle' || feedbackState === 'sending' || feedbackState === 'error'" class="doctor-feedback__actions">
              <button type="button" :disabled="feedbackState === 'sending'" @click="submitFeedback(true)">Yes, it helped</button>
              <button type="button" :disabled="feedbackState === 'sending'" @click="submitFeedback(false)">No, not yet</button>
            </div>
            <p v-if="feedbackState === 'error'" class="doctor-feedback__status is-error" role="alert">Feedback could not be sent. You can try again.</p>
            <div v-else-if="feedbackState === 'sent'" class="doctor-feedback__status" role="status">
              <strong>{{ feedbackChoice ? 'Thanks — that helps.' : 'Thanks — let’s improve it.' }}</strong>
              <p v-if="feedbackChoice">If you would like to support the clinic, you can buy the doctor a coffee:</p>
              <div v-if="feedbackChoice" class="doctor-contact-links">
                <a :href="kofiHref" target="_blank" rel="noopener noreferrer">Tip the Doctor on Ko-fi</a>
              </div>
              <p v-if="feedbackChoice === false">To help troubleshoot and update the guide, send me what happened:</p>
              <div v-if="feedbackChoice === false" class="doctor-contact-links">
                <a :href="discordDmHref" target="_blank" rel="noopener noreferrer">DM @haaihondschildpad on Discord</a>
                <a :href="redditThreadHref" target="_blank" rel="noopener noreferrer">Reddit post</a>
              </div>
            </div>
          </section>

          <div class="doctor-actions doctor-actions--results">
            <button class="doctor-button doctor-button--quiet" type="button" @click="setStep(3)">Review answers</button>
            <a class="doctor-button doctor-button--secondary" :href="withBase('/troubleshooting')">Open the full guide</a>
            <button class="doctor-button doctor-button--primary" type="button" @click="resetDoctor">Start over</button>
          </div>
        </div>
      </section>
    </div>
  </main>
</template>

<style scoped>
.setup-doctor {
  width: min(1120px, 100%);
  margin: 0 auto;
  padding: clamp(36px, 6vw, 72px) clamp(18px, 4vw, 44px) 88px;
  color: var(--vp-c-text-1);
}

.doctor-hero {
  max-width: 760px;
  margin: 0 auto clamp(32px, 5vw, 54px);
  text-align: center;
}

.doctor-kicker {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  color: var(--vp-c-brand-1);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.doctor-kicker__logo {
  width: 42px;
  height: 22px;
  border: 1px solid color-mix(in srgb, var(--vp-c-brand-1) 30%, var(--vp-c-divider));
  border-radius: 6px;
  background: var(--vp-c-bg-soft);
  object-fit: contain;
}

.doctor-hero h1 {
  margin: 0;
  border: 0;
  font-size: clamp(36px, 5.5vw, 64px);
  font-weight: 750;
  letter-spacing: -0.045em;
  line-height: 1.02;
}

.doctor-hero > p {
  max-width: 660px;
  margin: 20px auto 0;
  color: var(--vp-c-text-2);
  font-size: clamp(16px, 2vw, 18px);
  line-height: 1.7;
}

.doctor-trust {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px 22px;
  margin-top: 22px;
  color: var(--vp-c-text-2);
  font-size: 12px;
  font-weight: 600;
}

.doctor-trust span::before {
  content: '✓';
  margin-right: 6px;
  color: var(--vp-c-brand-1);
}

.doctor-shell {
  display: grid;
  grid-template-columns: 150px minmax(0, 1fr);
  gap: clamp(22px, 4vw, 46px);
  align-items: start;
}

.doctor-progress {
  position: sticky;
  top: 96px;
}

.doctor-progress ol {
  display: flex;
  flex-direction: column;
  gap: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}

.doctor-progress li {
  position: relative;
}

.doctor-progress li:not(:last-child)::after {
  position: absolute;
  top: 38px;
  left: 15px;
  width: 1px;
  height: 28px;
  background: var(--vp-c-divider);
  content: '';
}

.doctor-progress li.complete:not(:last-child)::after {
  background: var(--vp-c-brand-1);
}

.doctor-progress button {
  display: flex;
  align-items: center;
  gap: 11px;
  width: 100%;
  min-height: 54px;
  padding: 6px 0;
  border: 0;
  background: transparent;
  color: var(--vp-c-text-2);
  font: inherit;
  font-size: 13px;
  font-weight: 650;
  text-align: left;
}

.doctor-progress button:not(:disabled) {
  cursor: pointer;
}

.doctor-progress button[aria-current='step'],
.doctor-progress li.complete button {
  color: var(--vp-c-text-1);
}

.doctor-progress__number {
  position: relative;
  z-index: 1;
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 31px;
  height: 31px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 50%;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-2);
  font-size: 12px;
}

.doctor-progress button[aria-current='step'] .doctor-progress__number {
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-1);
  color: var(--vp-c-bg);
  box-shadow: 0 0 0 5px var(--vp-c-brand-soft);
}

.doctor-progress li.complete .doctor-progress__number {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}

.doctor-progress svg,
.doctor-button svg,
.result-card a svg {
  width: 17px;
  height: 17px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.doctor-panel {
  min-width: 0;
  min-height: 600px;
  padding: clamp(24px, 4.5vw, 48px);
  border: 1px solid var(--vp-c-divider);
  border-radius: 24px;
  background: var(--vp-c-bg-elv);
  box-shadow: 0 22px 60px color-mix(in srgb, var(--vp-c-text-1) 7%, transparent);
}

.doctor-stage__header {
  margin-bottom: 32px;
}

.doctor-stage__header > span {
  display: block;
  margin-bottom: 8px;
  color: var(--vp-c-brand-1);
  font-size: 12px;
  font-weight: 750;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.doctor-stage__header h2 {
  margin: 0;
  border: 0;
  font-size: clamp(26px, 3.4vw, 36px);
  letter-spacing: -0.025em;
  line-height: 1.15;
}

.doctor-stage__header h2:focus {
  border-radius: 4px;
  outline: 3px solid var(--vp-c-brand-1);
  outline-offset: 6px;
}

.doctor-stage__header p {
  margin: 10px 0 0;
  color: var(--vp-c-text-2);
  font-size: 15px;
  line-height: 1.6;
}

.doctor-fieldset,
.check-card {
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

.doctor-fieldset + .doctor-fieldset {
  margin-top: 30px;
}

.doctor-fieldset > legend {
  margin-bottom: 13px;
  padding: 0;
  color: var(--vp-c-text-1);
  font-size: 14px;
  font-weight: 700;
}

.doctor-fieldset--flush > legend {
  margin: 0;
}

.choice-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.choice-grid--platforms {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.choice-card {
  position: relative;
  display: flex;
  min-width: 0;
  min-height: 88px;
  flex-direction: column;
  justify-content: center;
  padding: 15px 42px 15px 16px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 13px;
  background: var(--vp-c-bg);
  cursor: pointer;
  transition: border-color 160ms ease, background 160ms ease, transform 160ms ease, box-shadow 160ms ease;
}

.choice-card--compact {
  min-height: 82px;
}

.choice-card:hover {
  border-color: color-mix(in srgb, var(--vp-c-brand-1) 42%, var(--vp-c-divider));
  transform: translateY(-1px);
}

.choice-card.selected {
  border-color: var(--vp-c-brand-1);
  background: color-mix(in srgb, var(--vp-c-brand-soft) 65%, var(--vp-c-bg));
  box-shadow: inset 0 0 0 1px var(--vp-c-brand-1);
}

.choice-card input,
.answer-button input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
}

.choice-card:focus-within,
.answer-button:focus-within {
  outline: 3px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}

.choice-card strong {
  overflow-wrap: anywhere;
  font-size: 14px;
  line-height: 1.35;
}

.choice-card small {
  display: block;
  margin-top: 4px;
  color: var(--vp-c-text-2);
  font-size: 11px;
  line-height: 1.4;
}

.choice-card__check {
  position: absolute;
  top: 14px;
  right: 14px;
  width: 18px;
  height: 18px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 50%;
  background: var(--vp-c-bg-elv);
}

.choice-card.selected .choice-card__check {
  border: 5px solid var(--vp-c-brand-1);
}

.check-list {
  display: grid;
  gap: 14px;
}

.check-card {
  padding: 20px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 14px;
  background: var(--vp-c-bg);
}

.check-card__question {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.4;
}

.check-card__question span {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 25px;
  height: 25px;
  border-radius: 8px;
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-2);
  font-size: 11px;
}

.check-card > p {
  margin: 7px 0 14px 35px;
  color: var(--vp-c-text-2);
  font-size: 12px;
  line-height: 1.5;
}

.answer-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(105px, 1fr));
  gap: 8px;
  margin-left: 35px;
}

.answer-button {
  position: relative;
  display: flex;
  min-height: 42px;
  align-items: center;
  justify-content: center;
  padding: 8px 10px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 9px;
  background: var(--vp-c-bg-elv);
  color: var(--vp-c-text-2);
  cursor: pointer;
  font-size: 12px;
  font-weight: 650;
  text-align: center;
  transition: border-color 150ms ease, background 150ms ease, color 150ms ease;
}

.answer-button:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-text-1);
}

.answer-button.selected {
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
}

.doctor-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 34px;
  padding-top: 22px;
  border-top: 1px solid var(--vp-c-divider);
}

.doctor-actions--end {
  justify-content: flex-end;
}

.doctor-button {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 17px;
  border: 1px solid transparent;
  border-radius: 10px;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.2;
  text-decoration: none !important;
  cursor: pointer;
  transition: transform 150ms ease, border-color 150ms ease, background 150ms ease;
}

.doctor-button:hover:not(:disabled) {
  transform: translateY(-1px);
}

.doctor-button:focus-visible,
.doctor-progress button:focus-visible,
.result-card a:focus-visible {
  outline: 3px solid var(--vp-c-brand-1);
  outline-offset: 3px;
}

.doctor-button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.doctor-button--primary {
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-1);
  color: var(--vp-c-bg);
}

.doctor-button--quiet {
  border-color: var(--vp-c-divider);
  background: transparent;
  color: var(--vp-c-text-2);
}

.doctor-button--secondary {
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
}

.doctor-stage__header--results {
  position: relative;
  padding-right: 76px;
}

.doctor-result-mark {
  position: absolute;
  top: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 58px;
  height: 58px;
  border-radius: 18px;
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
}

.doctor-result-mark svg {
  width: 29px;
  height: 29px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.result-list {
  display: grid;
  gap: 14px;
}

.result-card {
  padding: clamp(20px, 3vw, 28px);
  border: 1px solid var(--vp-c-divider);
  border-radius: 16px;
  background: var(--vp-c-bg);
}

.result-card:first-child {
  border-color: color-mix(in srgb, var(--vp-c-brand-1) 55%, var(--vp-c-divider));
  box-shadow: inset 3px 0 0 var(--vp-c-brand-1);
}

.result-card__topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.result-card__topline span {
  color: var(--vp-c-brand-1);
  font-size: 11px;
  font-weight: 750;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.result-card__topline b {
  color: var(--vp-c-text-2);
  font-size: 12px;
}

.result-card h3 {
  margin: 0;
  border: 0;
  font-size: 20px;
  letter-spacing: -0.015em;
}

.result-card > p {
  margin: 8px 0 18px;
  color: var(--vp-c-text-2);
  font-size: 14px;
  line-height: 1.6;
}

.result-card h4 {
  margin: 0 0 8px;
  font-size: 12px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.result-card ul {
  margin: 0 0 18px;
  padding-left: 19px;
  color: var(--vp-c-text-2);
  font-size: 13px;
  line-height: 1.55;
}

.result-card li + li {
  margin-top: 5px;
}

.result-card a {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--vp-c-brand-1);
  font-size: 13px;
  font-weight: 700;
  text-decoration: none;
}

.doctor-contact-card,
.doctor-feedback {
  margin-top: 18px;
  padding: 18px;
  border: 1px solid color-mix(in srgb, var(--vp-c-brand-1) 30%, var(--vp-c-divider));
  border-radius: 14px;
  background: color-mix(in srgb, var(--vp-c-brand-soft) 55%, var(--vp-c-bg));
}

.doctor-contact-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 12px;
  padding: 12px 14px;
  border-style: dashed;
  background: color-mix(in srgb, var(--vp-c-brand-soft) 25%, var(--vp-c-bg));
}

.doctor-feedback h3 {
  font-size: 15px;
}

.doctor-contact-card strong {
  font-size: 13px;
}

.doctor-contact-card p,
.doctor-feedback p {
  margin: 4px 0 0;
  color: var(--vp-c-text-2);
  font-size: 12px;
  line-height: 1.5;
}

.doctor-contact-card p {
  margin-top: 2px;
  font-size: 11px;
}

.doctor-contact-links,
.doctor-feedback__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.doctor-contact-links a,
.doctor-contact-links button,
.doctor-feedback__actions button {
  min-height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 13px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 9px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  font-size: 12px;
  font-weight: 700;
  text-decoration: none;
}

.doctor-contact-links a,
.doctor-feedback__actions button:first-child {
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-1);
  color: var(--vp-c-white);
}

.doctor-contact-links button:disabled,
.doctor-feedback__actions button:disabled {
  cursor: not-allowed;
  opacity: .56;
}

.doctor-contact-card__links {
  flex: 0 0 auto;
  flex-wrap: nowrap;
  gap: 6px;
}

.doctor-contact-card__links a,
.doctor-contact-card__links button {
  min-height: 30px;
  padding: 0 9px;
  border-radius: 7px;
  font-size: 10px;
}

.doctor-feedback {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 18px;
}

.doctor-feedback > div:first-child > span {
  color: var(--vp-c-brand-1);
  font-size: 11px;
  font-weight: 750;
  letter-spacing: .07em;
  text-transform: uppercase;
}

.doctor-feedback h3 {
  margin: 3px 0 0;
  border: 0;
}

.doctor-feedback__status {
  grid-column: 1 / -1;
  margin: 0 !important;
}

.doctor-feedback__status > p {
  margin-bottom: 10px;
}

.doctor-feedback__status.is-error {
  color: var(--vp-c-danger-1);
}

.doctor-privacy {
  display: flex;
  gap: 13px;
  margin-top: 16px;
  padding: 16px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 13px;
  background: var(--vp-c-bg-soft);
}

.doctor-privacy > svg {
  width: 22px;
  height: 22px;
  flex: 0 0 auto;
  fill: none;
  stroke: var(--vp-c-brand-1);
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.doctor-privacy strong {
  font-size: 13px;
}

.doctor-privacy p {
  margin: 3px 0 0;
  color: var(--vp-c-text-2);
  font-size: 12px;
  line-height: 1.5;
}

.doctor-actions--results {
  flex-wrap: wrap;
  justify-content: flex-start;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 840px) {
  .doctor-shell {
    grid-template-columns: 1fr;
  }

  .doctor-progress {
    position: static;
  }

  .doctor-progress ol {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
  }

  .doctor-progress li:not(:last-child)::after {
    top: 21px;
    left: calc(50% + 16px);
    width: calc(100% - 32px);
    height: 1px;
  }

  .doctor-progress button {
    min-height: 56px;
    flex-direction: column;
    justify-content: flex-start;
    gap: 6px;
    text-align: center;
  }
}

@media (max-width: 640px) {
  .setup-doctor {
    padding: 30px 14px 64px;
  }

  .doctor-hero {
    margin-bottom: 30px;
  }

  .doctor-hero h1 {
    font-size: clamp(34px, 11vw, 48px);
  }

  .doctor-trust {
    gap: 7px 14px;
  }

  .doctor-panel {
    min-height: 0;
    padding: 22px 16px;
    border-radius: 18px;
  }

  .choice-grid:not(.choice-grid--platforms) {
    grid-template-columns: 1fr;
  }

  .choice-grid--platforms {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .choice-card {
    min-height: 80px;
  }

  .choice-card--compact {
    min-height: 88px;
    padding-left: 13px;
  }

  .check-card {
    padding: 16px;
  }

  .check-card > p,
  .answer-grid {
    margin-left: 0;
  }

  .answer-grid {
    grid-template-columns: repeat(auto-fit, minmax(92px, 1fr));
  }

  .doctor-actions {
    flex-direction: column;
  }

  .doctor-contact-card,
  .doctor-feedback {
    display: flex;
    flex-direction: column;
    align-items: stretch;
  }

  .doctor-contact-links,
  .doctor-feedback__actions {
    flex-direction: column;
  }

  .doctor-contact-card__links {
    flex-direction: row;
    align-self: flex-start;
  }

  .doctor-button {
    width: 100%;
  }

  .doctor-stage__header--results {
    padding-right: 0;
  }

  .doctor-result-mark {
    position: static;
    width: 48px;
    height: 48px;
    margin-bottom: 16px;
  }
}

@media (max-width: 340px) {
  .choice-grid--platforms {
    grid-template-columns: 1fr;
  }

  .choice-card--compact {
    min-height: 74px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .setup-doctor * {
    scroll-behavior: auto !important;
    transition: none !important;
  }
}

.status-warning-banner {
  display: flex;
  gap: 16px;
  margin-bottom: 30px;
  padding: 16px 20px;
  border: 1px solid color-mix(in srgb, #ea580c 35%, var(--vp-c-divider));
  border-radius: 14px;
  background: color-mix(in srgb, #ea580c 8%, var(--vp-c-bg-soft));
  align-items: flex-start;
}

.status-warning-banner .warning-icon {
  width: 24px;
  height: 24px;
  fill: none;
  stroke: #ea580c;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  flex-shrink: 0;
  margin-top: 2px;
}

.status-warning-banner .warning-content strong {
  display: block;
  font-size: 15px;
  font-weight: 700;
  color: var(--vp-c-text-1);
  margin-bottom: 4px;
}

.status-warning-banner .warning-content p {
  margin: 0;
  font-size: 13.5px;
  line-height: 1.55;
  color: var(--vp-c-text-2);
}

.status-warning-banner .warning-content a {
  color: var(--vp-c-brand-1);
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.status-warning-banner .warning-content a:hover {
  color: var(--vp-c-brand-2);
  text-decoration: none;
}
</style>
