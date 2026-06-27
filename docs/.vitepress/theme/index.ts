import DefaultTheme from 'vitepress/theme'
import { h } from 'vue'
import MermaidDiagram from './MermaidDiagram.vue'
import P2PGenerator from './components/P2PGenerator.vue'
import AskAI from './components/AskAI.vue'
import SiteFooter from './SiteFooter.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  Layout: () => h(DefaultTheme.Layout, null, {
    'layout-bottom': () => [h(SiteFooter), h(AskAI)]
  }),
  enhanceApp({ app }) {
    app.component('MermaidDiagram', MermaidDiagram)
    app.component('P2PGenerator', P2PGenerator)
  }
}
