import DefaultTheme from 'vitepress/theme'
import { h } from 'vue'
import MermaidDiagram from './MermaidDiagram.vue'
import P2PGenerator from './components/P2PGenerator.vue'
import WelcomePage from './components/WelcomePage.vue'
import NuvioSidebar from './components/NuvioSidebar.vue'
import MobileNavigation from './components/MobileNavigation.vue'
import NuvioQuickstart from './components/NuvioQuickstart.vue'
import NuvioTraktBridge from './components/NuvioTraktBridge.vue'
import NuvioToolsContainer from './components/NuvioToolsContainer.vue'
import NuvioProfileTransfer from './components/NuvioProfileTransfer.vue'
import './custom.css'
import './nuvio-shell.css'
import './mobile-shell.css'

export default {
  extends: DefaultTheme,
  Layout: () => h(DefaultTheme.Layout, null, {
    'layout-top': () => [h(NuvioSidebar), h(MobileNavigation)]
  }),
  enhanceApp({ app }) {
    app.component('MermaidDiagram', MermaidDiagram)
    app.component('P2PGenerator', P2PGenerator)
    app.component('WelcomePage', WelcomePage)
    app.component('NuvioQuickstart', NuvioQuickstart)
    app.component('NuvioTraktBridge', NuvioTraktBridge)
    app.component('NuvioToolsContainer', NuvioToolsContainer)
    app.component('NuvioProfileTransfer', NuvioProfileTransfer)
  }
}
