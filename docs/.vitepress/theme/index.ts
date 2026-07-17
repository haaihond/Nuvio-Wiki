import DefaultTheme from 'vitepress/theme-without-fonts'
import { defineAsyncComponent, h } from 'vue'
import WelcomePage from './components/WelcomePage.vue'
import NuvioSidebar from './components/NuvioSidebar.vue'
import MobileNavigation from './components/MobileNavigation.vue'
import PageFeedback from './components/PageFeedback.vue'
import './fonts.css'
import './custom.css'
import './nuvio-shell.css'
import './mobile-shell.css'

export default {
  extends: DefaultTheme,
  Layout: () => h(DefaultTheme.Layout, null, {
    'layout-top': () => [h(NuvioSidebar), h(MobileNavigation)],
    'doc-footer-before': () => h(PageFeedback)
  }),
  enhanceApp({ app }) {
    app.component('P2PGenerator', defineAsyncComponent(() => import('./components/P2PGenerator.vue')))
    app.component('WelcomePage', WelcomePage)
    app.component('NuvioQuickstart', defineAsyncComponent(() => import('./components/NuvioQuickstart.vue')))
    app.component('NuvioTraktBridge', defineAsyncComponent(() => import('./components/NuvioTraktBridge.vue')))
    app.component('NuvioToolsContainer', defineAsyncComponent(() => import('./components/NuvioToolsContainer.vue')))
    app.component('NuvioProfileTransfer', defineAsyncComponent(() => import('./components/NuvioProfileTransfer.vue')))
    app.component('NuvioConfigurationProfiles', defineAsyncComponent(() => import('./components/NuvioConfigurationProfiles.vue')))
  }
}
