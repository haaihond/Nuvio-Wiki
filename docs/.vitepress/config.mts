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
        ...(locale.key === 'root'
          ? [{ text: 'Setup Doctor', link: siteRoutes.setupDoctor }]
          : []),
        { text: labels.troubleshooting, link: localeLink(locale, siteRoutes.troubleshooting) },
        { text: labels.faq, link: localeLink(locale, siteRoutes.faq) },
        { text: labels.features, link: localeLink(locale, siteRoutes.features) }
      ]
    }
  ]

  if (locale.key === 'root') {
    nav.push({
      text: 'Resources',
      items: [
        { text: 'Tools', link: siteRoutes.tools },
        { text: 'Service status', link: siteRoutes.status },
        { text: 'Official links', link: siteRoutes.officialLinks }
      ]
    })
  }

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
      let link = item.link
      if (!link.startsWith('/')) {
        link = '/' + link
      }
      if (link.endsWith('/index.md')) {
        link = link.slice(0, -'/index.md'.length)
      } else if (link.endsWith('.md')) {
        link = link.slice(0, -3)
      } else if (link === 'index.md' || link === '/index.md') {
        link = '/'
      }
      if (link.endsWith('/') && link.length > 1) {
        link = link.slice(0, -1)
      }
      item.link = link
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
  const excludeByGlobPattern = [
    ...otherLocaleKeys.map(k => `${k}/**`),
    ...(isRoot ? ['tools/**'] : [])
  ]

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
    excludeByGlobPattern,
    manualSortFileNameByPriority: [
      'overview.md',
      'features.md',
      'quick-start.md',
      'installation',
      'integrations',
      'settings',
      'tools.md',
      'status.md',
      'glossary.md',
      'troubleshooting.md',
      'faq.md',
      'official-links.md',
      'android-tv.md',
      'android-mobile.md',
      'ios.md',
      'webos.md',
      'addons.md',
      'debrid.md',
      'tmdb-mdblist-trakt.md',
      'trakt.md',
      'player.md',
      'ui-and-customization.md',
      'profiles.md',
      'collections.md',
      'badges.md'
    ]
  })

  const sidebarItems = sidebar as DefaultTheme.SidebarItem[]
  cleanSidebarLinks(sidebarItems)

  if (isRoot) {
    const helpLinks = new Set([siteRoutes.troubleshooting, siteRoutes.faq])
    const remainingItems = sidebarItems.filter((item) => !item.link || !helpLinks.has(item.link))
    const helpSourceItems = sidebarItems.filter((item) => item.link && helpLinks.has(item.link))
    const normalizedSettingsRoute = siteRoutes.settings.replace(/\/$/, '')
    const settingsIndex = remainingItems.findIndex((item) => item.link?.replace(/\/$/, '') === normalizedSettingsRoute)
    const insertAt = settingsIndex >= 0 ? settingsIndex + 1 : remainingItems.length

    remainingItems.splice(insertAt, 0, {
      text: 'Help',
      collapsed: false,
      items: [
        { text: 'Setup Doctor', link: siteRoutes.setupDoctor },
        ...helpSourceItems
      ]
    })

    return remainingItems
  }

  return sidebarItems
}

const locales = {
  ...Object.fromEntries(
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
  ),
  translate: {
    label: 'Help translate',
    link: 'https://github.com/haaihond/Nuvio-Wiki-Website/blob/main/TRANSLATING.md',
    lang: 'en-US'
  }
}

export default defineConfig({
  lang: 'en-US',
  title: 'Nuvio Wiki',
  titleTemplate: ':title | Nuvio Wiki',
  description: 'Community-maintained guides for installing, configuring, and using Nuvio.',
  base,
  sitemap: {
    hostname: 'https://nuvio.wiki'
  },
  cleanUrls: true,
  lastUpdated: true,
  locales,
  buildEnd: async (siteConfig) => {
    await writeLegacyRedirects(siteConfig.outDir, base)
  },
  head: [
    ['link', { rel: 'icon', type: 'image/png', href: `${base}logo.png` }],
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
      light: '/logo.png',
      dark: '/logo.png',
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
    headers: {
      level: [2, 3]
    },
    config(md) {
      mermaidDiagrams(md, { base })
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
        },
        '/api/ai': {
          target: 'http://localhost:3001',
          changeOrigin: true
        },
        '/api/trakt': {
          target: 'http://localhost:3001',
          changeOrigin: true
        },
        '/api/status': {
          target: 'http://localhost:3001',
          changeOrigin: true
        },
        '/api/setup-doctor': {
          target: 'http://localhost:3001',
          changeOrigin: true
        },
        '/api/admin': {
          target: 'http://localhost:3001',
          changeOrigin: true
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
      target: 'esnext',
      chunkSizeWarningLimit: 3000,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('P2PGenerator')) return 'p2p-generator'
          }
        }
      }
    }
  }
})
