import { defineConfig, type DefaultTheme } from 'vitepress'
import { generateSidebar } from 'vitepress-sidebar'
import {
  englishLocale,
  localeLink,
  localeRoot,
  wikiLocales,
  type WikiLocale
} from './i18n/locales.mts'
import { mermaidDiagrams } from './markdown/mermaidDiagrams.mts'
import { platformBadges } from './markdown/platformBadges.mts'
import { validateSiteRoutes, writeLegacyRedirects } from './routeSafety.mts'
import { siteRoutes } from './routes.mts'

const base = process.env.VITEPRESS_BASE || '/'

validateSiteRoutes()

function buildNav(locale: WikiLocale): DefaultTheme.NavItem[] {
  const labels = locale.labels
  const nav: DefaultTheme.NavItem[] = [
    { text: labels.getStarted, link: localeLink(locale, siteRoutes.quickStart) },
    {
      text: labels.configure,
      items: [
        { text: labels.addons, link: localeLink(locale, siteRoutes.addons) },
        { text: labels.settings, link: localeLink(locale, siteRoutes.settings) },
        { text: labels.player, link: localeLink(locale, siteRoutes.player) },
        { text: labels.integrations, link: localeLink(locale, siteRoutes.integrations) },
        { text: labels.debrid, link: localeLink(locale, siteRoutes.debrid) },
        { text: labels.metadataTracking, link: localeLink(locale, siteRoutes.metadataTracking) }
      ]
    },
    {
      text: labels.help,
      items: [
        { text: labels.troubleshooting, link: localeLink(locale, siteRoutes.troubleshooting) },
        { text: labels.faq, link: localeLink(locale, siteRoutes.faq) },
        { text: labels.features, link: localeLink(locale, siteRoutes.features) }
      ]
    }
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

function cleanSidebarLinks(items: any[] | undefined) {
  if (!items) return
  for (const item of items) {
    if (item.text) {
      item.text = item.text.replace(/\[[^\]]*\]/g, '').trim()
    }
    if (item.link) {
      if (item.link.endsWith('/index.md')) {
        item.link = item.link.slice(0, -'/index.md'.length)
      } else if (item.link.endsWith('.md')) {
        item.link = item.link.slice(0, -3)
      } else if (item.link === 'index.md') {
        item.link = '/'
      }
      if (item.link.endsWith('/') && item.link.length > 1) {
        item.link = item.link.slice(0, -1)
      }
    }
    if (item.items) {
      cleanSidebarLinks(item.items)
    }
  }
}

function buildSidebar(locale: WikiLocale): DefaultTheme.SidebarItem[] {
  const isRoot = locale.key === 'root'
  const scanStartPath = isRoot ? '' : locale.key
  const otherLocaleKeys = wikiLocales
    .map(l => l.key)
    .filter(k => k !== locale.key)
  const excludeByGlobPattern = otherLocaleKeys.map(k => `${k}/**`)

  const sidebar = generateSidebar({
    documentRootPath: 'docs',
    scanStartPath,
    resolvePath: isRoot ? '/' : `/${locale.key}/`,
    basePath: isRoot ? '/' : `/${locale.key}/`,
    useTitleFromFileHeading: true,
    useTitleFromFrontmatter: true,
    useFolderTitleFromIndexFile: true,
    useFolderLinkFromIndexFile: true,
    collapsed: false,
    excludeByGlobPattern
  })

  const sidebarItems = sidebar as DefaultTheme.SidebarItem[]
  cleanSidebarLinks(sidebarItems)
  return sidebarItems
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
  buildEnd: async (siteConfig) => {
    await writeLegacyRedirects(siteConfig.outDir, base)
  },
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
