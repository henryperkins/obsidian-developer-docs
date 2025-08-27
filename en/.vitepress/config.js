import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Obsidian Developer Docs',
  description: 'Documentation for Obsidian plugin and theme development',
  ignoreDeadLinks: true,
  
  themeConfig: {
    logo: '/Assets/logo.svg',
    
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Plugins', link: '/Plugins/Getting started/Build a plugin' },
      { text: 'Themes', link: '/Themes/App themes/Build a theme' },
      { text: 'Reference', link: '/Reference/TypeScript API/' }
    ],

    sidebar: [
      {
        text: 'Getting Started',
        items: [
          { text: 'Home', link: '/' },
          { text: 'Developer Policies', link: '/Developer policies' }
        ]
      },
      {
        text: 'Plugins',
        collapsed: false,
        items: [
          {
            text: 'Getting Started',
            collapsed: false,
            items: [
              { text: 'Build a plugin', link: '/Plugins/Getting started/Build a plugin' },
              { text: 'Anatomy of a plugin', link: '/Plugins/Getting started/Anatomy of a plugin' },
              { text: 'Development workflow', link: '/Plugins/Getting started/Development workflow' },
              { text: 'Mobile development', link: '/Plugins/Getting started/Mobile development' },
              { text: 'Use React in your plugin', link: '/Plugins/Getting started/Use React in your plugin' },
              { text: 'Use Svelte in your plugin', link: '/Plugins/Getting started/Use Svelte in your plugin' }
            ]
          },
          {
            text: 'User Interface',
            collapsed: true,
            items: [
              { text: 'About user interface', link: '/Plugins/User interface/About user interface' },
              { text: 'Commands', link: '/Plugins/User interface/Commands' },
              { text: 'Context menus', link: '/Plugins/User interface/Context menus' },
              { text: 'HTML elements', link: '/Plugins/User interface/HTML elements' },
              { text: 'Icons', link: '/Plugins/User interface/Icons' },
              { text: 'Modals', link: '/Plugins/User interface/Modals' },
              { text: 'Ribbon actions', link: '/Plugins/User interface/Ribbon actions' },
              { text: 'Settings', link: '/Plugins/User interface/Settings' },
              { text: 'Status bar', link: '/Plugins/User interface/Status bar' },
              { text: 'Views', link: '/Plugins/User interface/Views' },
              { text: 'Workspace', link: '/Plugins/User interface/Workspace' }
            ]
          },
          {
            text: 'Editor',
            collapsed: true,
            items: [
              { text: 'Editor', link: '/Plugins/Editor/Editor' },
              { text: 'Editor extensions', link: '/Plugins/Editor/Editor extensions' },
              { text: 'Decorations', link: '/Plugins/Editor/Decorations' },
              { text: 'State fields', link: '/Plugins/Editor/State fields' },
              { text: 'State management', link: '/Plugins/Editor/State management' },
              { text: 'View plugins', link: '/Plugins/Editor/View plugins' },
              { text: 'Viewport', link: '/Plugins/Editor/Viewport' },
              { text: 'Markdown post processing', link: '/Plugins/Editor/Markdown post processing' }
            ]
          },
          {
            text: 'Guides',
            collapsed: true,
            items: [
              { text: 'Optimizing plugin load time', link: '/Plugins/Guides/Optimizing plugin load time' },
              { text: 'Understanding deferred views', link: '/Plugins/Guides/Understanding deferred views' }
            ]
          },
          {
            text: 'Releasing',
            collapsed: true,
            items: [
              { text: 'Plugin guidelines', link: '/Plugins/Releasing/Plugin guidelines' },
              { text: 'Submission requirements', link: '/Plugins/Releasing/Submission requirements for plugins' },
              { text: 'Submit your plugin', link: '/Plugins/Releasing/Submit your plugin' },
              { text: 'Beta-testing plugins', link: '/Plugins/Releasing/Beta-testing plugins' },
              { text: 'Release with GitHub Actions', link: '/Plugins/Releasing/Release your plugin with GitHub Actions' }
            ]
          },
          { text: 'Events', link: '/Plugins/Events' },
          { text: 'Vault', link: '/Plugins/Vault' }
        ]
      },
      {
        text: 'Themes',
        collapsed: false,
        items: [
          {
            text: 'App Themes',
            items: [
              { text: 'Build a theme', link: '/Themes/App themes/Build a theme' },
              { text: 'Embed fonts and images', link: '/Themes/App themes/Embed fonts and images in your theme' },
              { text: 'Theme guidelines', link: '/Themes/App themes/Theme guidelines' },
              { text: 'Submit your theme', link: '/Themes/App themes/Submit your theme' },
              { text: 'Release with GitHub Actions', link: '/Themes/App themes/Release your theme with GitHub Actions' }
            ]
          },
          {
            text: 'Publish Themes',
            items: [
              { text: 'About Publish themes', link: '/Themes/Obsidian Publish themes/About Obsidian Publish themes' },
              { text: 'Build a Publish theme', link: '/Themes/Obsidian Publish themes/Build a Publish theme' },
              { text: 'Best practices', link: '/Themes/Obsidian Publish themes/Best practices for Publish themes' }
            ]
          }
        ]
      },
      {
        text: 'Reference',
        collapsed: false,
        items: [
          { text: 'Manifest', link: '/Reference/Manifest' },
          { text: 'Versions', link: '/Reference/Versions' },
          {
            text: 'CSS Variables',
            items: [
              { text: 'About styling', link: '/Reference/CSS variables/About styling' },
              { text: 'CSS variables', link: '/Reference/CSS variables/CSS variables' }
            ]
          },
          {
            text: 'TypeScript API',
            link: '/Reference/TypeScript API/',
            collapsed: true
          }
        ]
      }
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/obsidianmd/obsidian-developer-docs' }
    ],

    search: {
      provider: 'local'
    }
  },

  head: [
    ['link', { rel: 'icon', href: '/favicon.ico' }]
  ],

  markdown: {
    lineNumbers: false
  }
})
