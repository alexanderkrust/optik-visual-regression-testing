# optik — web UI and API in one image, served on one port.
#
#   docker build -t optik .
#   docker run -p 3000:3000 -e DATABASE_URL=postgresql://… -v optik-data:/data optik

ARG NODE_IMAGE=node:22-alpine

# ── Build ────────────────────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS build
WORKDIR /repo
RUN corepack enable

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml turbo.json ./
COPY packages ./packages
COPY apps/api ./apps/api
COPY apps/web ./apps/web
RUN pnpm install --frozen-lockfile \
      --filter @optik/api... --filter @optik/web...

RUN pnpm --filter @optik/shared --filter @optik/core build \
 && pnpm --filter @optik/web build \
 && pnpm --filter @optik/api build

# Self-contained API package with production dependencies only
RUN pnpm --filter @optik/api deploy --prod /out/api \
 && cd /out/api && npx prisma generate

# ── Runtime ──────────────────────────────────────────────────────────────────
FROM ${NODE_IMAGE}
RUN apk add --no-cache openssl tini
WORKDIR /app

COPY --from=build /out/api ./api
COPY --from=build /repo/apps/web/build ./web/build
COPY docker/entrypoint.sh /usr/local/bin/optik-entrypoint

# Set by the release workflow. Licenses unlock releases built within their
# update period, so the build date is part of the image, not configuration.
ARG OPTIK_VERSION=dev
ARG OPTIK_RELEASE_DATE=
RUN printf '{"version":"%s","date":"%s"}\n' "$OPTIK_VERSION" "$OPTIK_RELEASE_DATE" > /app/release.json
ENV NODE_ENV=production \
    PORT=3000 \
    STORAGE_DIR=/data \
    OPTIK_WEB_DIR=/app/web/build

RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=5 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/api/health" || exit 1

ENTRYPOINT ["/sbin/tini", "--", "optik-entrypoint"]
