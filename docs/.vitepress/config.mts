import { defineConfig, type DefaultTheme } from 'vitepress'
import {
  englishLocale,
  localeLink,
  localeRoot,
  wikiLocales,
  type WikiLocale
} from './i18n/locales.mts'
import { mermaidDiagrams } from './markdown/mermaidDiagrams.mts'
import { platformBadges } from './markdown/platformBadges.mts'

const base = process.env.VITEPRESS_BASE || '/'

function buildNav(locale: WikiLocale): DefaultTheme.NavItem[] {
  const labels = locale.labels
  const nav: DefaultTheme.NavItem[] = [
    { text: labels.getStarted, link: localeLink(locale, '/quick-start') },
    {
      text: labels.configure,
      items: [
        { text: labels.addons, link: localeLink(locale, '/addons/') },
        { text: labels.settings, link: localeLink(locale, '/settings/') },
        { text: labels.player, link: localeLink(locale, '/settings/player') },
        { text: labels.integrations, link: localeLink(locale, '/integrations/') },
        { text: labels.debrid, link: localeLink(locale, '/integrations/debrid') },
        { text: labels.metadataTracking, link: localeLink(locale, '/integrations/imdb-mdblist-trakt') }
      ]
    },
    {
      text: labels.help,
      items: [
        { text: labels.troubleshooting, link: localeLink(locale, '/troubleshooting') },
        { text: labels.faq, link: localeLink(locale, '/faq') },
        { text: labels.features, link: localeLink(locale, '/features') }
      ]
    },
    { text: labels.linksAndResources, link: localeLink(locale, '/official-links') }
  ]

  if (wikiLocales.length === 1) {
    nav.push({
      text: englishLocale.label,
      items: [
        { text: 'English (default)', link: '/' },
        {
          text: 'Help translate',
          link: 'https://github.com/haaihond/Nuvio-Wiki-Website/blob/main/TRANSLATING.md'
        }
      ]
    })
  }

  return nav
}

function buildSidebar(locale: WikiLocale): DefaultTheme.SidebarItem[] {
  const labels = locale.labels

  return [
    {
      text: labels.gettingStarted,
      items: [
        { text: labels.welcome, link: localeRoot(locale) },
        { text: labels.quickStart, link: localeLink(locale, '/quick-start') },
        { text: labels.overview, link: localeLink(locale, '/overview') },
        { text: labels.features, link: localeLink(locale, '/features') },
        { text: labels.glossary, link: localeLink(locale, '/glossary') }
      ]
    },
    {
      text: labels.installation,
      collapsed: false,
      items: [
        { text: labels.choosePlatform, link: localeLink(locale, '/installation/') },
        { text: labels.androidTV, link: localeLink(locale, '/installation/android-tv') },
        { text: labels.androidMobile, link: localeLink(locale, '/installation/android-mobile') },
        { text: labels.ios, link: localeLink(locale, '/installation/ios') },
        { text: labels.webos, link: localeLink(locale, '/installation/webos') }
      ]
    },
    {
      text: labels.configure,
      collapsed: false,
      items: [
        { text: labels.addons, link: localeLink(locale, '/addons/') },
        { text: labels.settings, link: localeLink(locale, '/settings/') },
        { text: labels.player, link: localeLink(locale, '/settings/player') },
        { text: labels.profiles, link: localeLink(locale, '/settings/profiles') },
        { text: labels.collections, link: localeLink(locale, '/settings/collections') },
        { text: labels.integrations, link: localeLink(locale, '/integrations/') },
        { text: labels.debrid, link: localeLink(locale, '/integrations/debrid') },
        { text: labels.metadataTracking, link: localeLink(locale, '/integrations/imdb-mdblist-trakt') }
      ]
    },
    {
      text: labels.help,
      collapsed: false,
      items: [
        { text: labels.troubleshooting, link: localeLink(locale, '/troubleshooting') },
        { text: labels.faq, link: localeLink(locale, '/faq') },
        { text: labels.officialLinks, link: localeLink(locale, '/official-links') }
      ]
    }
  ]
}

const locales = Object.fromEntries(
  wikiLocales.map((locale) => [
    locale.key,
    {
      label: locale.label,
      lang: locale.lang,
      dir: locale.dir,
      link: localeRoot(locale),
      ...(locale.key === 'root'
        ? {}
        : {
            themeConfig: {
              nav: buildNav(locale),
              sidebar: buildSidebar(locale),
              ...locale.themeConfig
            }
          })
    }
  ])
)

export default defineConfig({
  lang: 'en-US',
  title: 'Nuvio Wiki',
  titleTemplate: ':title | Nuvio Wiki',
  description: 'Community-maintained guides for installing, configuring, and using Nuvio.',
  base,
  cleanUrls: true,
  lastUpdated: true,
  locales,
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: `${base}favicon.svg` }],
    ['script', { type: 'module', src: `${base}sidebar-scroll.js?v=20260617e` }],
    ['meta', { name: 'theme-color', content: '#0877f9' }],
    ['meta', { property: 'og:title', content: 'Nuvio Wiki' }],
    ['meta', { property: 'og:description', content: 'Community-maintained guides for installing, configuring, and using Nuvio.' }],
    ['meta', { property: 'og:type', content: 'website' }]
  ],

  themeConfig: {
    i18nRouting: false,
    langMenuLabel: 'Change language',
    logo: {
      light: '/logo.svg',
      dark: '/logo.svg',
      alt: 'Nuvio Wiki'
    },
    siteTitle: 'Nuvio Wiki',

    nav: buildNav(englishLocale),

    search: {
      provider: 'local',
      options: {
        detailedView: true,
        translations: {
          button: {
            buttonText: 'Search the wiki',
            buttonAriaLabel: 'Search the wiki'
          },
          modal: {
            displayDetails: 'Display detailed list',
            resetButtonTitle: 'Reset search',
            backButtonTitle: 'Close search',
            noResultsText: 'No pages found for',
            footer: {
              selectText: 'to select',
              selectKeyAriaLabel: 'enter',
              navigateText: 'to navigate',
              navigateUpKeyAriaLabel: 'up arrow',
              navigateDownKeyAriaLabel: 'down arrow',
              closeText: 'to close',
              closeKeyAriaLabel: 'escape'
            }
          }
        }
      }
    },

    sidebar: buildSidebar(englishLocale),

    socialLinks: [
      { icon: 'discord', link: 'https://discord.gg/nuvio' },
      { icon: 'github', link: 'https://github.com/haaihond/Nuvio-Wiki-Website' }
    ],

    editLink: {
      pattern: 'https://github.com/haaihond/Nuvio-Wiki-Website/edit/main/docs/:path',
      text: 'Edit this page on GitHub'
    },

    outline: {
      level: [2, 3],
      label: 'On this page'
    },

    docFooter: {
      prev: 'Previous page',
      next: 'Next page'
    },

    lastUpdated: {
      text: 'Updated',
      formatOptions: {
        dateStyle: 'medium'
      }
    },

    footer: {
      message: 'Community-maintained and not affiliated with the official Nuvio development team.',
      copyright: 'Nuvio Wiki · Created by haaihond and sappy'
    }
  },

  markdown: {
    lineNumbers: true,
    config(md) {
      mermaidDiagrams(md)
      platformBadges(md)
    },
    theme: {
      light: 'github-light',
      dark: 'github-dark'
    }
  },

  vite: {
    server: {
      proxy: {
        '/api/aiostreams': {
          target: 'https://aiostreamsfortheweebsstable.midnightignite.me',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/aiostreams/, '/api/v1')
        }
      }
    },
    esbuild: {
      target: 'esnext'
    },
    optimizeDeps: {
      esbuildOptions: {
        target: 'esnext'
      }
    },
    build: {
      target: 'esnext'
    }
  }
})
