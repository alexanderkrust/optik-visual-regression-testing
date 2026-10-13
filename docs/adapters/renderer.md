# Rendering container

The same page renders slightly differently on macOS, Windows and Linux, and with different browser versions and installed fonts — enough for a snapshot taken on a laptop to differ from one taken in CI. The **optik-renderer** image pins all of it: Playwright's browsers (Chromium, Firefox, WebKit) in an exact version, a fixed set of fonts with `sans-serif`, `system-ui`, `Helvetica`, `Segoe UI` … mapped to them, grayscale anti-aliasing without hinting, and UTC. Tests connect to its browsers over Playwright's browser server; pages on `localhost` (your dev server, the Storybook build) stay reachable from inside the container.

The image is tagged with the Playwright version it runs — client and server must match (`npx playwright --version`). Published tags never change.

```bash
docker run --rm -p 127.0.0.1:3100:3000 ghcr.io/alexanderkrust/optik-renderer:1.59.1
export OPTIK_RENDERER=ws://127.0.0.1:3100/
```

- **Storybook:** `optik storybook --docker` starts and stops the matching container by itself; or set `OPTIK_RENDERER` / `--renderer`.
- **Playwright:**

  ```ts
  import { optikConfig, rendererConnectOptions } from '@optik/playwright'
  export default defineConfig({
    ...optikConfig({ token: process.env.OPTIK_TOKEN! }),
    use: { connectOptions: rendererConnectOptions() }, // the container when OPTIK_RENDERER is set, else local browsers
  })
  ```

- **Vitest browser mode:**

  ```ts
  import { optik, rendererConnectOptions } from '@optik/vitest'
  provider: playwright({ connectOptions: rendererConnectOptions() }),
  ```

- **CI** (GitHub Actions) — a service container next to the job:

  ```yaml
  services:
    renderer:
      image: ghcr.io/alexanderkrust/optik-renderer:1.59.1
      ports: ['3100:3000']
  env:
    OPTIK_RENDERER: ws://localhost:3100/
  ```

Notes:

- The image is `linux/amd64` only — Chromium renders some details differently on ARM. On Apple Silicon, Docker Desktop runs it emulated (turn on *Use Rosetta* in its settings); expect rendering to take a few times longer than with local browsers.
- Switching to the renderer changes how everything looks once: accept those changes in one review, after that laptops and CI agree.
- Another Playwright version: build the image yourself — `docker build --platform linux/amd64 --build-arg PLAYWRIGHT_VERSION=1.60.0 -t optik-renderer https://github.com/alexanderkrust/optik-visual-regression-testing.git#main:docker/renderer` — and use it with `OPTIK_RENDERER_IMAGE=optik-renderer` (for `--docker`) or `docker run`.
