# optik-renderer — browsers and fonts pinned, so screenshots are identical on
# every machine: a developer's laptop, CI, a colleague's Mac.
#
# Playwright's browser server: clients connect over WebSocket and get Chromium,
# Firefox or WebKit from this image. Client and server need the same
# Playwright version — the image tag is that version.
#
#   docker build --platform linux/amd64 --build-arg PLAYWRIGHT_VERSION=1.59.1 -t optik-renderer:1.59.1 docker/renderer
#   docker run --rm --platform linux/amd64 -p 127.0.0.1:3100:3000 optik-renderer:1.59.1
#   OPTIK_RENDERER=ws://127.0.0.1:3100/ npx optik storybook
#
# Only linux/amd64: Chromium renders slightly differently on ARM, so Apple
# Silicon runs this image emulated (Rosetta) to match CI pixel for pixel.

ARG PLAYWRIGHT_VERSION=1.59.1
FROM mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble

ARG PLAYWRIGHT_VERSION
# Web fonts aside, pages render with these system fonts
RUN apt-get update \
 && apt-get install -y --no-install-recommends fonts-dejavu-core fonts-noto-core \
 && rm -rf /var/lib/apt/lists/*
COPY fonts.conf /etc/fonts/local.conf
RUN fc-cache -f

# The browser server of exactly this Playwright version
WORKDIR /opt/optik-renderer
RUN npm init -y >/dev/null \
 && npm install --omit=dev --no-audit --no-fund "playwright@${PLAYWRIGHT_VERSION}" \
 && npm cache clean --force

# Dates and times as rendered by pages that don't set them
ENV TZ=Etc/UTC LANG=C.UTF-8

USER pwuser
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(() => process.exit(0), () => process.exit(1))"
CMD ["node", "node_modules/playwright/cli.js", "run-server", "--host", "0.0.0.0", "--port", "3000"]

LABEL org.opencontainers.image.title="optik-renderer" \
      org.opencontainers.image.description="Pinned browsers and fonts for identical screenshots with optik" \
      org.opencontainers.image.version="${PLAYWRIGHT_VERSION}"
