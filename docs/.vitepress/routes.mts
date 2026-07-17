export const siteRoutes = {
  home: '/',
  quickStart: '/quick-start',
  overview: '/overview',
  features: '/features',
  glossary: '/glossary',
  installation: '/installation/',
  androidTV: '/installation/android-tv',
  androidMobile: '/installation/android-mobile',
  ios: '/installation/ios',
  webos: '/installation/webos',
  addons: '/integrations/addons',
  settings: '/settings/',
  player: '/settings/player',
  profiles: '/settings/profiles',
  collections: '/settings/collections',
  uiCustomization: '/settings/ui-and-customization',
  integrations: '/integrations/',
  debrid: '/integrations/debrid',
  metadataTracking: '/integrations/tmdb-mdblist-trakt',
  trakt: '/integrations/trakt',
  troubleshooting: '/troubleshooting',
  faq: '/faq',
  officialLinks: '/official-links',
  tools: '/tools',
  configurationProfiles: '/setup/',
  setupDoctor: '/tools/setup-doctor',
  status: '/status'
} as const

export type SiteRoute = (typeof siteRoutes)[keyof typeof siteRoutes]

// Keep old public URLs working when a document is renamed or moved.
export const legacyRouteRedirects = {
  '/addons': siteRoutes.addons,
  '/nl/addons': '/nl/integrations/addons',
  '/integrations/imdb-mdblist-trakt': siteRoutes.metadataTracking
} satisfies Record<string, string>
