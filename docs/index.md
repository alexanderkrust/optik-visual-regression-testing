---
layout: home

hero:
  name: optik
  text: Self-hosted visual regression testing
  tagline: Open source and self-hosted — an alternative to Chromatic. Screenshots from your tests, compared with approved baselines, reviewed in pull requests.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: How it works
      link: /guide/introduction
    - theme: alt
      text: GitHub
      link: https://github.com/alexanderkrust/optik-visual-regression-testing

features:
  - title: Your tests, your tools
    details: Adapters for Vitest, Playwright and Cypress, Storybook without test code, and a CLI for everything else.
    link: /adapters/
  - title: Reviews where the code is
    details: Commit statuses for GitHub, GitLab, Bitbucket and Azure DevOps that turn green as soon as changes are accepted — no CI re-run.
    link: /guide/ci
  - title: Baselines that follow git
    details: Each branch compares against the state it was branched from; merges carry accepted changes over.
    link: /guide/branches
  - title: Identical screenshots everywhere
    details: A rendering container with pinned browsers and fonts, so laptops and CI agree pixel for pixel.
    link: /adapters/renderer
  - title: Fast on large Storybooks
    details: TurboSnap renders only the stories a change can affect — and never skips an unreviewed change.
    link: /adapters/turbosnap
  - title: Ready for the enterprise
    details: Single sign-on, SCIM, teams, an append-only audit log, retention, high availability, air-gapped installs — no telemetry.
    link: /enterprise/editions
---
