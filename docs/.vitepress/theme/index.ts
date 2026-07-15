import DefaultTheme from 'vitepress/theme'
import { defineAsyncComponent, h } from 'vue'
import WelcomePage from './components/WelcomePage.vue'
import NuvioSidebar from './components/NuvioSidebar.vue'
import MobileNavigation from './components/MobileNavigation.vue'
import './custom.css'
import './nuvio-shell.css'
import './mobile-shell.css'

export default {
  extends: DefaultTheme,
  Layout: () => h(DefaultTheme.Layout, null, {
    'layout-top': () => [h(NuvioSidebar), h(MobileNavigation)]
  }),
  enhanceApp({ app }) {
    app.component('P2PGenerator', defineAsyncComponent(() => import('./components/P2PGenerator.vue')))
    app.component('WelcomePage', WelcomePage)
    app.component('NuvioQuickstart', defineAsyncComponent(() => import('./components/NuvioQuickstart.vue')))
    app.component('NuvioTraktBridge', defineAsyncComponent(() => import('./components/NuvioTraktBridge.vue')))
    app.component('NuvioToolsContainer', defineAsyncComponent(() => import('./components/NuvioToolsContainer.vue')))
    app.component('NuvioProfileTransfer', defineAsyncComponent(() => import('./components/NuvioProfileTransfer.vue')))
  }
}
