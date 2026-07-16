<script setup lang="ts">
import { useData, withBase } from 'vitepress'
import { siteRoutes } from '../routes.mts'

const { frontmatter } = useData()

const linkGroups = [
  {
    id: 'footer-get-started',
    title: 'Get started',
    links: [
      { text: 'Quick Start', href: siteRoutes.quickStart },
      { text: 'Overview', href: siteRoutes.overview },
      { text: 'Features', href: siteRoutes.features },
      { text: 'Glossary', href: siteRoutes.glossary }
    ]
  },
  {
    id: 'footer-configure',
    title: 'Configure',
    links: [
      { text: 'Addons', href: siteRoutes.addons },
      { text: 'Settings', href: siteRoutes.settings },
      { text: 'Integrations', href: siteRoutes.integrations },
      { text: 'Debrid', href: siteRoutes.debrid }
    ]
  },
  {
    id: 'footer-help',
    title: 'Help',
    links: [
      { text: 'Troubleshooting', href: siteRoutes.troubleshooting },
      { text: 'FAQ', href: siteRoutes.faq },
      { text: 'Official Links', href: siteRoutes.officialLinks }
    ]
  }
]

function backToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
</script>

<template>
  <footer v-if="frontmatter.layout === 'home'" class="site-footer" aria-label="Site footer">
    <div class="site-footer__inner">
      <div class="site-footer__grid">
        <section class="site-footer__brand" aria-labelledby="footer-brand-title">
          <a class="site-footer__wordmark" :href="withBase(siteRoutes.home)">
            <img :src="withBase('/logo.png')" alt="" width="38" height="38" />
            <span id="footer-brand-title">Nuvio <small>Wiki</small></span>
          </a>
          <p>
            The unofficial, community-maintained hub for Nuvio guides and
            troubleshooting. Built by people who use the app every day.
          </p>
          <div class="site-footer__socials" aria-label="Community links">
            <a :href="withBase(siteRoutes.officialLinks)" aria-label="Official links">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18" />
              </svg>
            </a>
            <a href="https://discord.gg/nuvio" target="_blank" rel="noreferrer" aria-label="Nuvio Discord">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M20 15.5c0 2.5-2.7 4.5-6 4.5h-2l-4 2v-2.8c-2.4-1-4-2.9-4-5.2 0-3.3 3.6-6 8-6s8 2.7 8 6v1.5Z" />
              </svg>
            </a>
            <a href="https://github.com/haaihond/Nuvio-Wiki" target="_blank" rel="noreferrer" aria-label="Nuvio Wiki on GitHub">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-2c-2.8.6-3.4-1.2-3.4-1.2-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 0 1.6 1 1.6 1 .9 1.6 2.4 1.1 2.9.9.1-.7.4-1.1.7-1.4-2.3-.3-4.6-1.1-4.6-5A3.9 3.9 0 0 1 6.7 8.5c-.1-.3-.4-1.3.1-2.7 0 0 .9-.3 2.8 1.1a9.6 9.6 0 0 1 5.1 0c2-1.4 2.8-1.1 2.8-1.1.6 1.4.2 2.4.1 2.7a3.9 3.9 0 0 1 1 2.7c0 3.9-2.3 4.7-4.6 5 .4.3.7 1 .7 2V21c0 .3.2.6.7.5A10 10 0 0 0 12 2Z" />
              </svg>
            </a>
          </div>
        </section>

        <nav
          v-for="group in linkGroups"
          :key="group.id"
          class="site-footer__links"
          :aria-labelledby="group.id"
        >
          <h2 :id="group.id">{{ group.title }}</h2>
          <a v-for="link in group.links" :key="link.href" :href="withBase(link.href)">
            {{ link.text }}
          </a>
        </nav>
      </div>

      <div class="site-footer__bottom">
        <p>
          &copy; 2026 Nuvio Wiki <span aria-hidden="true">&middot;</span>
          Created by
          <a href="https://github.com/haaihond" target="_blank" rel="noreferrer">haaihond</a>
          and
          <a href="https://github.com/sappy-69" target="_blank" rel="noreferrer">sappy</a>
        </p>
        <p class="site-footer__contribute">
          <span aria-hidden="true">&#9829;</span>
          Free &amp; open source -
          <a
            href="https://github.com/haaihond/Nuvio-Wiki/blob/main/CONTRIBUTING.md"
            target="_blank"
            rel="noreferrer"
          >consider contributing</a>
        </p>
        <button type="button" aria-label="Back to top" @click="backToTop">
          <span aria-hidden="true">&uarr;</span>
        </button>
      </div>
    </div>
  </footer>
</template>

<style scoped>
.site-footer {
  position: relative;
  z-index: 30;
  border-top: 1px solid var(--vp-c-divider);
  background: color-mix(in srgb, var(--vp-c-bg-alt) 90%, var(--vp-c-bg));
}

.site-footer__inner {
  width: min(100% - 48px, 1180px);
  margin: 0 auto;
  padding: 56px 0 28px;
}

.site-footer__grid {
  display: grid;
  grid-template-columns: minmax(220px, 1.35fr) repeat(3, minmax(130px, 1fr));
  gap: 48px;
}

.site-footer__wordmark {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  color: var(--vp-c-text-1);
  font-size: 19px;
  font-weight: 750;
  letter-spacing: -0.02em;
}

.site-footer__wordmark img {
  width: 38px;
  height: 38px;
}

.site-footer__wordmark small {
  color: var(--vp-c-text-2);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.site-footer__brand p {
  max-width: 270px;
  margin: 18px 0 24px;
  color: var(--vp-c-text-2);
  font-size: 14px;
  line-height: 1.7;
}

.site-footer__socials {
  display: flex;
  gap: 10px;
}

.site-footer__socials a {
  display: inline-grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border: 1px solid transparent;
  border-radius: 9px;
  color: var(--vp-c-text-3);
  transition: border-color 0.2s ease, color 0.2s ease, background 0.2s ease;
}

.site-footer__socials a:hover {
  border-color: var(--vp-c-divider);
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-brand-1);
}

.site-footer__socials svg {
  width: 19px;
  height: 19px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.site-footer__socials a:last-child svg {
  fill: currentColor;
  stroke: none;
}

.site-footer__links {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
}

.site-footer__links h2 {
  margin: 2px 0 8px;
  color: var(--vp-c-text-3);
  font-size: 12px;
  font-weight: 750;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.site-footer__links a {
  color: var(--vp-c-text-2);
  font-size: 14px;
  transition: color 0.2s ease;
}

.site-footer__links a:hover {
  color: var(--vp-c-brand-1);
}

.site-footer__bottom {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto 46px;
  align-items: center;
  gap: 28px;
  margin-top: 48px;
  padding-top: 24px;
  border-top: 1px solid var(--vp-c-divider);
}

.site-footer__bottom p {
  margin: 0;
  color: var(--vp-c-text-2);
  font-size: 13px;
}

.site-footer__bottom p > span {
  margin: 0 4px;
}

.site-footer__bottom a {
  color: var(--vp-c-text-1);
  font-weight: 650;
}

.site-footer__bottom a:hover {
  color: var(--vp-c-brand-1);
}

.site-footer__contribute > span {
  color: #ff3b6b;
}

.site-footer__bottom button {
  display: grid;
  width: 46px;
  height: 46px;
  place-items: center;
  border: 2px solid var(--vp-c-brand-1);
  border-radius: 50%;
  background: transparent;
  color: var(--vp-c-text-1);
  font: inherit;
  font-size: 21px;
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease, transform 0.2s ease;
}

.site-footer__bottom button:hover {
  background: var(--vp-c-brand-1);
  color: var(--vp-c-white);
  transform: translateY(-2px);
}

.site-footer a:focus-visible,
.site-footer button:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 3px;
}

@media (max-width: 900px) {
  .site-footer__grid {
    grid-template-columns: minmax(220px, 1.3fr) repeat(2, minmax(130px, 1fr));
  }

  .site-footer__links:last-child {
    grid-column: 2;
  }

  .site-footer__bottom {
    grid-template-columns: 1fr 46px;
  }

  .site-footer__contribute {
    grid-column: 1;
    grid-row: 2;
  }

  .site-footer__bottom button {
    grid-column: 2;
    grid-row: 1 / span 2;
  }
}

@media (max-width: 640px) {
  .site-footer__inner {
    width: min(100% - 36px, 1180px);
    padding: 28px 0 20px;
  }

  .site-footer__grid {
    grid-template-columns: repeat(3, 1fr);
    gap: 20px 16px;
  }

  .site-footer__brand {
    grid-column: 1 / -1;
  }

  .site-footer__brand p {
    margin: 10px 0 14px;
    font-size: 13px;
    line-height: 1.55;
  }

  .site-footer__links {
    gap: 6px;
  }

  .site-footer__links h2 {
    margin: 0 0 4px;
    font-size: 11px;
  }

  .site-footer__links a {
    font-size: 13px;
  }

  .site-footer__links:last-child {
    grid-column: auto;
  }

  .site-footer__bottom {
    margin-top: 20px;
    padding-top: 16px;
    gap: 12px;
  }

  .site-footer__bottom p {
    font-size: 12px;
  }
}

@media (max-width: 420px) {
  .site-footer__grid {
    grid-template-columns: repeat(3, 1fr);
    gap: 18px 12px;
  }

  .site-footer__bottom {
    grid-template-columns: 1fr 40px;
  }

  .site-footer__links:last-child {
    grid-column: auto;
  }

  .site-footer__contribute {
    grid-column: 1;
    grid-row: 2;
  }

  .site-footer__bottom button {
    grid-column: 2;
    grid-row: 1 / span 2;
    width: 40px;
    height: 40px;
    font-size: 18px;
  }
}
</style>
