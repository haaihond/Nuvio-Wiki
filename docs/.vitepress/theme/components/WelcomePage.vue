<script setup lang="ts">
import { withBase } from 'vitepress'
import { siteRoutes } from '../../routes.mts'
</script>

<template>
  <main class="nuvio-welcome">
    <section class="welcome-hero" aria-labelledby="welcome-title">
      <div class="welcome-hero__copy">
        <h1 id="welcome-title">Nuvio Wiki</h1>
        <p class="welcome-hero__headline">Everything you wanted to know about Nuvio, and some stuff you don't.</p>
        <p class="welcome-hero__intro">
          The unofficial hub for Nuvio, with comprehensive guides and troubleshooting
          for users on all platforms.
        </p>
        <div class="welcome-actions">
          <a class="welcome-button welcome-button--primary" :href="withBase(siteRoutes.tools)">
            Tools
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M4 10h11M11 6l4 4-4 4" />
            </svg>
          </a>
          <a class="welcome-button welcome-button--secondary" :href="withBase(siteRoutes.quickStart)">
            Quick Start Guide
          </a>
          <a class="welcome-button welcome-button--secondary" :href="withBase(siteRoutes.officialLinks)">
            Links &amp; Resources
          </a>
        </div>
      </div>

      <aside class="start-panel" aria-labelledby="start-panel-title">
        <div class="start-panel__bar">
          <span class="window-dot window-dot--red"></span>
          <span class="window-dot window-dot--yellow"></span>
          <span class="window-dot window-dot--green"></span>
          <span class="start-panel__label">Important</span>
        </div>
        <div class="start-panel__body">
          <p class="start-panel__eyebrow">FREE &amp; OPEN SOURCE</p>
          <h2 id="start-panel-title">Nuvio is free and open source.</h2>
          <p>
            FOSS software plays a vital role in the world, and it is up to the users
            to keep these projects running.
          </p>
          <a class="start-panel__support" href="https://tapframe.space/contribute" target="_blank" rel="noopener">
            Please consider donating to keep free and open source projects running
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 4h9v9M16 4 6 14" /></svg>
          </a>
        </div>
      </aside>
    </section>

    <section class="welcome-guides" aria-labelledby="guide-heading">
      <div class="section-heading">
        <p>NUVIO WIKI</p>
        <h2 id="guide-heading">Browse the Wiki.</h2>
      </div>

      <div class="guide-grid">
        <a class="guide-card guide-card--cyan" :href="withBase(siteRoutes.quickStart)">
          <span class="guide-card__icon-wrap">
            <svg class="guide-card__icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M14 5c2.8-2.8 5.5-2 5.5-2s.8 2.7-2 5.5l-5.4 5.4-3-3L14 5Z" />
              <path d="m9.1 10.9-3.7.8-2.3 2.3 5.2.8.8 5.2 2.3-2.3.8-3.8M15.5 6.5h.01" />
            </svg>
          </span>
          <h3>Quick Start Guide</h3>
          <p>Get Nuvio installed and configure your first addons in 10 minutes.</p>
        </a>

        <a class="guide-card guide-card--blue" :href="withBase(siteRoutes.overview)">
          <span class="guide-card__icon-wrap">
            <svg class="guide-card__icon" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" />
            </svg>
          </span>
          <h3>General Overview</h3>
          <p>A general overview of Nuvio, how it works, and its architecture.</p>
        </a>

        <a class="guide-card guide-card--purple" :href="withBase(siteRoutes.features)">
          <span class="guide-card__icon-wrap">
            <svg class="guide-card__icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM17 14v6m-3-3h6" />
            </svg>
          </span>
          <h3>Features</h3>
          <p>Profiles, custom layouts, collections, offline downloads, and tracking integrations.</p>
        </a>

        <a class="guide-card guide-card--yellow" :href="withBase(siteRoutes.installation)">
          <span class="guide-card__icon-wrap">
            <svg class="guide-card__icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 20h14" />
            </svg>
          </span>
          <h3>Installation Guides</h3>
          <p>Installation guides for Android TV, Android Mobile, iOS, WebOS, and Tizen.</p>
        </a>

        <a class="guide-card guide-card--green" :href="withBase(siteRoutes.addons)">
          <span class="guide-card__icon-wrap">
            <svg class="guide-card__icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9 4h3v3a2 2 0 1 0 4 0V4h4v5h-3a2 2 0 1 0 0 4h3v7h-7v-3a2 2 0 1 0-4 0v3H4v-7h3a2 2 0 1 0 0-4H4V4h5Z" />
            </svg>
          </span>
          <h3>Addons Guide</h3>
          <p>Nuvio is empty by default. Learn how addons work and how to install them.</p>
        </a>

        <a class="guide-card guide-card--pink" :href="withBase(siteRoutes.integrations)">
          <span class="guide-card__icon-wrap">
            <svg class="guide-card__icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="m9.5 14.5 5-5M7.5 16.5l-1 1a3.5 3.5 0 0 1-5-5l3-3a3.5 3.5 0 0 1 5 0M16.5 7.5l1-1a3.5 3.5 0 0 1 5 5l-3 3a3.5 3.5 0 0 1-5 0" />
            </svg>
          </span>
          <h3>Integrations</h3>
          <p>Connect third-party services like Trakt, Real-Debrid, Premiumize, TorBox, and TMDB.</p>
        </a>

        <a class="guide-card guide-card--orange" :href="withBase(siteRoutes.settings)">
          <span class="guide-card__icon-wrap">
            <svg class="guide-card__icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 7h10M18 7h2M4 17h2m4 0h10M14 4v6M6 14v6" />
            </svg>
          </span>
          <h3>Settings Breakdown</h3>
          <p>A complete breakdown of settings and preferences for Mobile and Android TV.</p>
        </a>

        <a class="guide-card guide-card--violet" :href="withBase(siteRoutes.player)">
          <span class="guide-card__icon-wrap">
            <svg class="guide-card__icon" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="9" /><path d="m10 8 6 4-6 4V8Z" />
            </svg>
          </span>
          <h3>Nuvio Player Settings</h3>
          <p>Configure playback engines, subtitles, and hardware acceleration.</p>
        </a>

        <a class="guide-card guide-card--teal" :href="withBase(siteRoutes.glossary)">
          <span class="guide-card__icon-wrap">
            <svg class="guide-card__icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5v-16ZM20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5v-16Z" />
            </svg>
          </span>
          <h3>Glossary of Terms</h3>
          <p>Definitions for addons, plugins, manifests, debrid, metadata, catalogs, and more.</p>
        </a>

        <a class="guide-card guide-card--red" :href="withBase(siteRoutes.troubleshooting)">
          <span class="guide-card__icon-wrap">
            <svg class="guide-card__icon" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3" />
              <path d="m5.6 5.6 4.3 4.3m4.2 4.2 4.3 4.3m0-12.8-4.3 4.3m-4.2 4.2-4.3 4.3" />
            </svg>
          </span>
          <h3>Troubleshooting Guide</h3>
          <p>Find solutions to common issues with Nuvio, grouped by category.</p>
        </a>

        <a class="guide-card guide-card--indigo" :href="withBase(siteRoutes.faq)">
          <span class="guide-card__icon-wrap">
            <svg class="guide-card__icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 18.5 4.5 21v-5A8.5 8.5 0 1 1 8 19.5" /><path d="M9.5 9a2.5 2.5 0 1 1 4 2c-1 .7-1.5 1.2-1.5 2M12 16h.01" />
            </svg>
          </span>
          <h3>FAQ</h3>
          <p>Answers to frequently asked questions about Nuvio, supported platforms, addons, and playback.</p>
        </a>

        <a class="guide-card guide-card--sky" :href="withBase(siteRoutes.officialLinks)">
          <span class="guide-card__icon-wrap">
            <svg class="guide-card__icon" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18" />
            </svg>
          </span>
          <h3>Official Links &amp; Resources</h3>
          <p>Official download links, websites, communities, and source code repositories.</p>
        </a>
      </div>
    </section>

    <section class="community-note" aria-labelledby="community-heading">
      <div class="community-note__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M8 12.5 10.5 15 16 9.5" /><circle cx="12" cy="12" r="9" /></svg>
      </div>
      <div class="community-note__copy">
        <p>DISCLAIMER</p>
        <h2 id="community-heading">This is NOT an official Nuvio wiki.</h2>
        <span>This project is community-maintained and is not affiliated with the official Nuvio development team.</span>
      </div>
      <div class="community-note__actions">
        <a href="https://github.com/haaihond/Nuvio-Wiki-Website/blob/main/CONTRIBUTING.md" target="_blank" rel="noopener">
          Contributing Guide
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 4h9v9M16 4 6 14" /></svg>
        </a>
        <a :href="withBase(siteRoutes.officialLinks)">Official links</a>
      </div>
    </section>

    <div class="enjoyment-note">
      If you need something to help you get through this, here is a
      <a href="https://www.youtube.com/watch?v=ChBg4aowzX8" target="_blank" rel="noopener">1-hour Subway Surfers video</a>
      for your enjoyment.
    </div>

    <section class="developer-support" aria-labelledby="developer-support-heading">
      <div class="section-heading">
        <div>
          <p>SUPPORT</p>
          <h2 id="developer-support-heading">Support the Developers</h2>
        </div>
        <span>If you would like to support some of the developers of Nuvio:</span>
      </div>
      <div class="developer-grid">
        <a href="https://ko-fi.com/skoruppa" target="_blank" rel="noopener"><strong>skoruppa</strong><span>Support on Ko-fi</span></a>
        <a href="https://ko-fi.com/halibiram" target="_blank" rel="noopener"><strong>halibiram</strong><span>Support on Ko-fi</span></a>
        <a href="https://ko-fi.com/edoedac" target="_blank" rel="noopener"><strong>𝔈𝔡𝔬</strong><span>Support on Ko-fi</span></a>
        <a href="https://ko-fi.com/haaihond" target="_blank" rel="noopener"><strong>Hond</strong><span>Support on Ko-fi</span></a>
      </div>
    </section>

    <section class="contribution-note" aria-labelledby="contribution-heading">
      <h2 id="contribution-heading">Contribution</h2>
      <p>
        Contributions are vital! Please see the
        <a href="https://github.com/sappy-69/Nuvio-Wiki/blob/main/CONTRIBUTING.md" target="_blank" rel="noopener">Contributing Guide</a>
        to help improve these docs.
      </p>
    </section>
  </main>
</template>

<style scoped>
:global(.VPHome:has(.nuvio-welcome)) {
  margin-bottom: 0;
  padding-bottom: 0;
  background: var(--vp-c-bg);
}

.nuvio-welcome {
  width: min(calc(100% - 48px), 1340px);
  margin: 0 auto;
  padding: 90px 0 96px;
  color: var(--vp-c-text-1);
}

.welcome-hero {
  display: grid;
  grid-template-columns: minmax(0, 1.55fr) minmax(360px, 0.85fr);
  align-items: center;
  gap: clamp(56px, 7vw, 104px);
  min-height: 430px;
}

.section-heading > p,
.developer-support .section-heading p,
.community-note__copy > p,
.start-panel__eyebrow {
  margin: 0;
  color: var(--vp-c-text-3);
  font-size: 11px;
  font-weight: 750;
  letter-spacing: 0.14em;
  line-height: 1.4;
  text-transform: uppercase;
}

.welcome-hero h1 {
  margin: 0;
  color: var(--vp-c-text-1);
  font-size: clamp(4.4rem, 8vw, 7rem);
  font-weight: 760;
  letter-spacing: -0.075em;
  line-height: 0.9;
  opacity: 0;
  animation: nuvioFadeInUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.welcome-hero__headline {
  margin: 24px 0 0;
  color: var(--vp-c-text-1);
  font-size: clamp(1.9rem, 3.25vw, 2.8rem);
  font-weight: 650;
  letter-spacing: -0.052em;
  line-height: 1.02;
  opacity: 0;
  animation: nuvioFadeInUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.08s forwards;
}

.welcome-hero__intro {
  max-width: 720px;
  margin: 22px 0 0;
  color: var(--vp-c-text-2);
  font-size: clamp(16px, 1.6vw, 20px);
  line-height: 1.65;
  opacity: 0;
  animation: nuvioFadeInUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.16s forwards;
}

.welcome-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 32px;
  opacity: 0;
  animation: nuvioFadeInUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.24s forwards;
}

.welcome-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 50px;
  padding: 0 22px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  font-size: 14px;
  font-weight: 700;
  text-decoration: none;
  transition: border-color 0.18s ease, background 0.18s ease, color 0.18s ease, transform 0.18s ease;
}

.welcome-button svg,
.community-note__actions svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
}

.welcome-button--primary {
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-1);
  color: #fff;
}

.welcome-button--primary:hover {
  border-color: var(--vp-c-brand-2);
  background: var(--vp-c-brand-2);
  color: #fff;
  transform: translateY(-1px);
}

.welcome-button--secondary {
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
}

.welcome-button--secondary:hover {
  border-color: color-mix(in srgb, var(--vp-c-text-1) 28%, var(--vp-c-divider));
  background: var(--vp-c-bg-elv);
  color: var(--vp-c-text-1);
}

.start-panel {
  overflow: hidden;
  border: 1px solid var(--vp-c-divider);
  border-radius: 11px;
  background: color-mix(in srgb, var(--vp-c-bg-alt) 78%, var(--vp-c-bg));
  box-shadow: 0 18px 50px rgba(10, 24, 43, 0.08);
  opacity: 0;
  animation: nuvioFadeInUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.32s forwards;
}

.dark .start-panel {
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.26);
}

.start-panel__bar {
  display: flex;
  align-items: center;
  gap: 9px;
  height: 46px;
  padding: 0 18px;
  border-bottom: 1px solid var(--vp-c-divider);
  background: color-mix(in srgb, var(--vp-c-bg-soft) 72%, transparent);
}

.window-dot {
  width: 11px;
  height: 11px;
  border-radius: 50%;
}

.window-dot--red { background: #ff5f57; }
.window-dot--yellow { background: #febc2e; }
.window-dot--green { background: #28c840; }

.start-panel__label {
  margin-left: 8px;
  color: var(--vp-c-text-3);
  font-family: var(--vp-font-family-mono);
  font-size: 12px;
}

.start-panel__body {
  padding: 28px 26px 24px;
}

.start-panel__eyebrow {
  color: var(--vp-c-brand-1);
}

.start-panel h2 {
  margin: 8px 0 10px;
  border: 0;
  color: var(--vp-c-text-1);
  font-size: 23px;
  font-weight: 700;
  letter-spacing: -0.025em;
}

.start-panel__body > p:not(.start-panel__eyebrow) {
  margin: 0;
  color: var(--vp-c-text-2);
  font-size: 14px;
  line-height: 1.6;
}

.start-panel__support {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin-top: 24px;
  color: var(--vp-c-brand-1);
  font-size: 14px;
  font-weight: 700;
  text-decoration: none;
}

.start-panel__support svg {
  width: 17px;
  height: 17px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.7;
  transition: transform 0.18s ease;
}

.start-panel__support:hover svg { transform: translate(1px, -1px); }

.start-list {
  margin: 24px 0 0;
  padding: 0;
  list-style: none;
}

.start-list li {
  margin: 0;
  border-top: 1px solid var(--vp-c-divider);
}

.start-list a {
  display: grid;
  grid-template-columns: 30px 1fr 18px;
  align-items: center;
  gap: 10px;
  padding: 14px 2px;
  color: var(--vp-c-text-1);
  font-size: 13px;
  font-weight: 650;
  text-decoration: none;
}

.start-list a > span {
  color: var(--vp-c-text-3);
  font-family: var(--vp-font-family-mono);
  font-size: 11px;
}

.start-list svg {
  width: 17px;
  height: 17px;
  fill: none;
  stroke: var(--vp-c-text-3);
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.6;
  transition: stroke 0.18s ease, transform 0.18s ease;
}

.start-list a:hover { color: var(--vp-c-brand-1); }
.start-list a:hover svg { stroke: var(--vp-c-brand-1); transform: translate(1px, -1px); }

.welcome-guides {
  margin-top: 92px;
}

.section-heading {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 24px;
}

.section-heading h2 {
  margin: 7px 0 0;
  border: 0;
  font-size: clamp(1.75rem, 3vw, 2.35rem);
  letter-spacing: -0.04em;
  line-height: 1.15;
}

.guide-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.guide-card {
  --card-accent: var(--vp-c-brand-1);
  display: flex;
  min-height: 220px;
  flex-direction: column;
  padding: 20px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 11px;
  background: color-mix(in srgb, var(--vp-c-bg-alt) 76%, var(--vp-c-bg));
  color: var(--vp-c-text-1);
  text-decoration: none;
  transition: border-color 0.18s ease, background 0.18s ease, transform 0.18s ease;
}

.guide-card--cyan { --card-accent: #05a8c7; }
.guide-card--yellow { --card-accent: #d5a400; }
.guide-card--purple { --card-accent: #a64cff; }
.guide-card--green { --card-accent: #10ad76; }
.guide-card--blue { --card-accent: #3987ff; }
.guide-card--red { --card-accent: #f0445f; }
.guide-card--pink { --card-accent: #e85d9e; }
.guide-card--orange { --card-accent: #e77934; }
.guide-card--violet { --card-accent: #8b6cff; }
.guide-card--teal { --card-accent: #20a99a; }
.guide-card--indigo { --card-accent: #667eea; }
.guide-card--sky { --card-accent: #2f9dd1; }

.guide-card:hover {
  border-color: color-mix(in srgb, var(--card-accent) 55%, var(--vp-c-divider));
  background: color-mix(in srgb, var(--card-accent) 4%, var(--vp-c-bg-alt));
  color: var(--vp-c-text-1);
  transform: translateY(-2px);
}

.guide-card__icon-wrap {
  display: grid;
  width: 40px;
  height: 40px;
  margin-bottom: 20px;
  place-items: center;
  border-radius: 7px;
  background: color-mix(in srgb, var(--card-accent) 10%, var(--vp-c-bg-soft));
}

.guide-card__icon {
  width: 22px;
  height: 22px;
  fill: none;
  stroke: var(--card-accent);
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
}

.guide-card h3 {
  margin: 0 0 9px;
  color: var(--vp-c-text-1);
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.guide-card p {
  margin: 0;
  color: var(--vp-c-text-2);
  font-size: 13px;
  line-height: 1.55;
}

.guide-card__link {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: auto;
  padding-top: 20px;
  color: var(--vp-c-text-2);
  font-size: 12px;
  font-weight: 700;
}

.guide-card__link b {
  color: var(--card-accent);
  font-size: 15px;
  transition: transform 0.18s ease;
}

.guide-card:hover .guide-card__link b { transform: translateX(3px); }

.community-note {
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr) auto;
  align-items: center;
  gap: 22px;
  margin-top: 64px;
  padding: 28px 30px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 11px;
  background: var(--vp-c-bg-soft);
}

.community-note__icon {
  display: grid;
  width: 52px;
  height: 52px;
  place-items: center;
  border: 1px solid color-mix(in srgb, var(--vp-c-brand-1) 22%, var(--vp-c-divider));
  border-radius: 10px;
  background: var(--vp-c-bg);
  color: var(--vp-c-brand-1);
}

.community-note__icon svg {
  width: 25px;
  height: 25px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
}

.community-note__copy h2 {
  margin: 4px 0 2px;
  border: 0;
  font-size: 18px;
  letter-spacing: -0.025em;
}

.community-note__copy span {
  color: var(--vp-c-text-2);
  font-size: 13px;
}

.community-note__actions {
  display: flex;
  align-items: center;
  gap: 18px;
}

.community-note__actions a {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--vp-c-text-1);
  font-size: 13px;
  font-weight: 700;
  text-decoration: none;
}

.community-note__actions a:hover { color: var(--vp-c-brand-1); }

.developer-support {
  margin-top: 72px;
}

.developer-support .section-heading > span {
  max-width: 420px;
  color: var(--vp-c-text-2);
  font-size: 14px;
  line-height: 1.6;
  text-align: right;
}

.developer-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.developer-grid a {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 5px;
  padding: 18px 20px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  background: color-mix(in srgb, var(--vp-c-bg-alt) 76%, var(--vp-c-bg));
  color: var(--vp-c-text-1);
  text-decoration: none;
  transition: border-color 0.18s ease, transform 0.18s ease;
}

.developer-grid a:hover {
  border-color: color-mix(in srgb, var(--vp-c-brand-1) 48%, var(--vp-c-divider));
  color: var(--vp-c-text-1);
  transform: translateY(-2px);
}

.developer-grid strong {
  overflow: hidden;
  font-size: 15px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.developer-grid span {
  color: var(--vp-c-text-3);
  font-size: 12px;
}

.contribution-note {
  margin-top: 36px;
  padding-top: 28px;
  border-top: 1px solid var(--vp-c-divider);
}

.contribution-note h2 {
  margin: 0 0 8px;
  border: 0;
  font-size: 18px;
  letter-spacing: -0.02em;
}

.contribution-note p {
  margin: 0;
  color: var(--vp-c-text-2);
  font-size: 14px;
  line-height: 1.7;
}

.contribution-note a {
  color: var(--vp-c-brand-1);
  font-weight: 700;
  text-decoration: none;
}

.nuvio-welcome a:focus-visible {
  border-radius: 6px;
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 4px;
}

@media (max-width: 980px) {
  .nuvio-welcome { padding-top: 64px; }
  .welcome-hero { grid-template-columns: 1fr; gap: 56px; }
  .start-panel { width: min(100%, 620px); }
  .guide-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .community-note { grid-template-columns: 52px 1fr; }
  .community-note__actions { grid-column: 2; }
  .developer-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 640px) {
  .nuvio-welcome {
    width: min(calc(100% - 40px), 1340px);
    padding: 54px 0 72px;
  }

  .welcome-hero { gap: 30px; min-height: 0; }
  .welcome-hero h1 {
    font-size: 48px;
    letter-spacing: -0.055em;
    line-height: 0.98;
  }
  .welcome-hero__headline {
    margin-top: 14px;
    font-size: 28px;
    letter-spacing: -0.045em;
    line-height: 1.08;
  }
  .welcome-hero__intro { margin-top: 17px; font-size: 16px; line-height: 1.65; }
  .welcome-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-top: 26px;
  }
  .welcome-button { min-height: 46px; padding: 0 12px; font-size: 13px; }
  .welcome-button:first-child { grid-column: 1 / -1; }
  .start-panel__bar { height: 42px; padding: 0 16px; }
  .start-panel__body { padding: 22px 20px 20px; }
  .start-panel h2 { font-size: 21px; }
  .welcome-guides { margin-top: 58px; }
  .section-heading { margin-bottom: 18px; }
  .guide-grid { grid-template-columns: 1fr; }
  .guide-card { min-height: 0; padding: 20px; }
  .guide-card__icon-wrap { margin-bottom: 16px; }
  .community-note { grid-template-columns: 1fr; gap: 16px; margin-top: 48px; padding: 24px; }
  .community-note__actions { grid-column: 1; flex-wrap: wrap; }
  .developer-support { margin-top: 52px; }
  .developer-support .section-heading { align-items: start; flex-direction: column; }
  .developer-support .section-heading > span { text-align: left; }
  .developer-grid { grid-template-columns: 1fr; }
}

@media (max-width: 420px) {
  .nuvio-welcome {
    width: min(calc(100% - 36px), 1340px);
  }
}

@media (max-width: 360px) {
  .welcome-actions {
    grid-template-columns: 1fr;
  }

  .welcome-button {
    grid-column: 1 !important;
  }
}

.enjoyment-note {
  margin-top: 48px;
  color: var(--vp-c-text-2);
  font-size: 14px;
  line-height: 1.6;
  text-align: center;
}

.enjoyment-note a {
  color: var(--vp-c-brand-1);
  font-weight: 700;
  text-decoration: none;
  transition: color 0.18s ease;
}

.enjoyment-note a:hover {
  color: var(--vp-c-brand-2);
  text-decoration: underline;
}

@keyframes nuvioFadeInUp {
  from {
    opacity: 0;
    transform: translateY(16px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .welcome-hero h1,
  .welcome-hero__headline,
  .welcome-hero__intro,
  .welcome-actions,
  .start-panel {
    opacity: 1 !important;
    transform: none !important;
    animation: none !important;
  }
}
</style>
