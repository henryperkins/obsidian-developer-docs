import DefaultTheme from 'vitepress/theme'
import { h } from 'vue'
import AutoRAGSearch from './AutoRAGSearch.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  // Inject the AutoRAG search trigger into the navbar
  Layout() {
    return h(DefaultTheme.Layout, null, {
      'nav-bar-content-after': () => h(AutoRAGSearch)
    })
  },
  enhanceApp({ app }) {
    app.component('AutoRAGSearch', AutoRAGSearch)
  }
}
