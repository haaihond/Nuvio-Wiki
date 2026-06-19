import DefaultTheme from 'vitepress/theme'
import { h } from 'vue'
import BackToTop from './BackToTop.vue'
import MermaidDiagram from './MermaidDiagram.vue'
import P2PGenerator from './components/P2PGenerator.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  Layout: () => h(DefaultTheme.Layout, null, {
    'doc-after': () => h(BackToTop)
  }),
  enhanceApp({ app }) {
    app.component('BackToTop', BackToTop)
    app.component('MermaidDiagram', MermaidDiagram)
    app.component('P2PGenerator', P2PGenerator)
  }
}
