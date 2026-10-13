# Storybook

Every story becomes a snapshot — no test code needed:

```bash
npm install -D @optik/cli playwright && npx playwright install chromium
npx storybook build
OPTIK_TOKEN=optik_… npx optik storybook          # ./storybook-static, or a URL like http://localhost:6006
```

optik serves the build, opens each story in Chromium (`iframe.html?id=…`), waits until Storybook reports it rendered — play functions included — and for web fonts and images, then screenshots the story's root element. Snapshots are named `Title/Story` (e.g. `Components/Button/Primary`) in the suite `storybook`. To keep screenshots identical between runs, animations and transitions are stopped, the caret is hidden and `prefers-reduced-motion` is set.

Per story, component or globally (in `.storybook/preview`), with `parameters`:

```ts
export const Clock: Story = {
  parameters: {
    optik: {
      disable: true,   // no snapshot of this story
      delay: 300,      // wait after rendering, e.g. for a chart that animates in JavaScript
      fullPage: true,  // the whole page instead of the story's root — for modals in a portal (default with layout: 'fullscreen')
      viewports: ['375x667', 1280], // instead of --viewports; a number is a width (with the height of the first --viewports)
    },
  },
}
```

Coming from Chromatic? `chromatic: { disableSnapshot, delay, viewports }` are honoured as well.

| Option | Default | |
|---|---|---|
| `--browsers` | `chromium` | `chromium`, `firefox` and/or `webkit` — install them with `npx playwright install` |
| `--viewports` | `1280x720` | e.g. `375x667,768x1024,1280x720` |
| `--concurrency` | `4` | Stories rendered in parallel, per browser |
| `--timeout` | `30` | Seconds a story may take to render |
| `--docker` / `--renderer`, `OPTIK_RENDERER` | — | Render in the [optik-renderer container](/adapters/renderer) |
| `--only-changed` | off | [TurboSnap](/adapters/turbosnap): only stories affected by changes |

Exit codes as for `optik upload`; a story that fails to render (an error, or the timeout) exits with `2`, after the other stories were uploaded. Supports Storybook 7 and later (`index.json`) and 6.4+ (`stories.json`).
