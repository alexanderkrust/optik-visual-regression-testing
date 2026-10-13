# TurboSnap

With `--only-changed`, optik renders only the stories that the files changed since the last accepted run can affect — the others keep their baselines. Large Storybooks get fast, and a change to one component doesn't cost a run of the whole library:

```bash
npx storybook build --stats-json        # writes the module graph: storybook-static/preview-stats.json
npx optik storybook --only-changed
#  TurboSnap: 2 of 140 stories affected by 1 changed file since 4c1e9a2
```

How it decides:

1. **The base** is the newest run on an ancestor of the current commit in the same suite that was captured with the same settings (browsers, viewports, renderer or local browsers, Playwright version), had no stories that failed to render, and has **no open or rejected changes** — an unreviewed change is never skipped, it keeps showing up until it is accepted.
2. **Changed files:** everything that differs from the base commit, committed or not, including new files. In CI, fetch the history (`fetch-depth: 0` for actions/checkout).
3. **Affected stories:** Storybook's module graph is followed from each changed file to the story files that import it, directly or through other modules — also across packages of a monorepo. Files outside the graph (tests, docs, the backend) affect no story.

All stories are captured when there is no base, the base commit isn't in the local history, the graph is missing, or a change can affect any story: `package.json`, a lockfile, Storybook's configuration (`.storybook/`), or a file the configuration imports (global styles, decorators). The CLI says which.

| Option | Default | |
|---|---|---|
| `--only-changed` | off | Turn TurboSnap on |
| `--stats-file` | `<build>/preview-stats.json` | Needed with a Storybook URL |
| `--storybook-dir` | current directory | Where Storybook was built, if it's elsewhere |
| `--config-dir` | `<storybook-dir>/.storybook` | Storybook's config directory, if it's elsewhere |

The skipped stories don't appear in the run; the summary counts them (`7 unaffected stories (TurboSnap)`). Changes outside JavaScript modules that a story still shows — images in `staticDirs`, fonts loaded by URL — aren't in the graph: run without `--only-changed` after such changes (or regularly, e.g. on the default branch).
