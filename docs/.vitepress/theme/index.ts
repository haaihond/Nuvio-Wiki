import DefaultTheme from 'vitepress/theme'
import { h } from 'vue'
import BackToTop from './BackToTop.vue'
import PlatformBadge from './PlatformBadge.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  Layout: () => h(DefaultTheme.Layout, null, {
    'doc-after': () => h(BackToTop)
  }),
  enhanceApp({ app }) {
    app.component('BackToTop', BackToTop)
    app.component('PlatformBadge', PlatformBadge)
  }
}
