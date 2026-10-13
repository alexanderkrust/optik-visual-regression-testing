import { defineConfig } from 'vitepress'

const repo = 'https://github.com/alexanderkrust/optik-visual-regression-testing'

export default defineConfig({
  title: 'optik',
  description: 'Open-source, self-hosted visual regression testing',
  // Served by GitHub Pages under /<repository>/
  base: '/optik-visual-regression-testing/',
  cleanUrls: true,
  lastUpdated: true,
  // Notes for maintainers stay in the repository
  srcExclude: ['maintainers/**', 'README.md'],
  head: [['meta', { name: 'theme-color', content: '#4f46e5' }]],

  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/introduction', activeMatch: '/guide/' },
      { text: 'Adapters', link: '/adapters/', activeMatch: '/adapters/' },
      { text: 'Install & operate', link: '/install/kubernetes', activeMatch: '/(install|operations|upgrading|releases)' },
      { text: 'Enterprise', link: '/enterprise/editions', activeMatch: '/enterprise/' },
      { text: 'Reference', items: [
        { text: 'Configuration', link: '/install/configuration' },
        { text: 'API', link: '/reference/api' },
        { text: 'Releases and support', link: '/releases' },
        { text: 'Changelog', link: `${repo}/releases` },
      ] },
    ],

    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'How optik works', link: '/guide/introduction' },
          { text: 'Getting started', link: '/guide/getting-started' },
          { text: 'Reviewing changes', link: '/guide/reviewing' },
          { text: 'Branches and baselines', link: '/guide/branches' },
          { text: 'Suites, browsers and viewports', link: '/guide/suites-and-variants' },
          { text: 'Commit status in CI', link: '/guide/ci' },
          { text: 'Notifications', link: '/guide/notifications' },
          { text: 'Users and roles', link: '/guide/users-and-roles' },
        ],
      },
      {
        text: 'Adapters',
        items: [
          { text: 'Overview and API tokens', link: '/adapters/' },
          { text: 'Vitest', link: '/adapters/vitest' },
          { text: 'Playwright', link: '/adapters/playwright' },
          { text: 'Cypress', link: '/adapters/cypress' },
          { text: 'Storybook', link: '/adapters/storybook' },
          { text: 'TurboSnap', link: '/adapters/turbosnap' },
          { text: 'CLI upload', link: '/adapters/cli' },
          { text: 'Rendering container', link: '/adapters/renderer' },
        ],
      },
      {
        text: 'Install & operate',
        items: [
          { text: 'Docker', link: '/guide/getting-started' },
          { text: 'Kubernetes (Helm)', link: '/install/kubernetes' },
          { text: 'Without internet access', link: '/install/airgapped' },
          { text: 'Configuration', link: '/install/configuration' },
          { text: 'High availability, backup, restore', link: '/operations' },
          { text: 'Monitoring', link: '/install/monitoring' },
          { text: 'Upgrading', link: '/upgrading' },
          { text: 'Releases and support', link: '/releases' },
        ],
      },
      {
        text: 'Enterprise',
        items: [
          { text: 'Editions and license', link: '/enterprise/editions' },
          { text: 'Single sign-on', link: '/enterprise/sso' },
          { text: 'Provisioning with SCIM', link: '/enterprise/scim' },
          { text: 'Teams', link: '/enterprise/teams' },
          { text: 'Audit log', link: '/enterprise/audit-log' },
          { text: 'Storage and retention', link: '/enterprise/retention' },
        ],
      },
      {
        text: 'Security and privacy',
        items: [
          { text: 'Security', link: '/security/' },
          { text: 'Verifying releases', link: '/security/verifying-releases' },
          { text: 'Security whitepaper', link: '/security/whitepaper' },
          { text: 'Questionnaire answers', link: '/security/questionnaire' },
          { text: 'Penetration test', link: '/security/penetration-test' },
          { text: 'Privacy and accessibility', link: '/privacy' },
        ],
      },
      {
        text: 'Reference',
        items: [{ text: 'API', link: '/reference/api' }],
      },
    ],

    search: { provider: 'local' },
    outline: [2, 3],
    socialLinks: [{ icon: 'github', link: repo }],
    editLink: { pattern: `${repo}/edit/main/docs/:path`, text: 'Edit this page on GitHub' },
    footer: {
      message: 'Released under the Apache License 2.0. Enterprise features under the optik Enterprise License.',
    },
  },
})
