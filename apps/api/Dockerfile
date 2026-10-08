FROM node:20-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm@9
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/shared ./packages/shared
COPY packages/core ./packages/core
COPY apps/api ./apps/api
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @optik/api exec prisma generate
RUN pnpm --filter @optik/api build

FROM node:20-alpine
WORKDIR /app
RUN npm install -g pnpm@9
COPY --from=builder /app/pnpm-workspace.yaml /app/package.json ./
COPY --from=builder /app/packages/shared ./packages/shared
COPY --from=builder /app/packages/core ./packages/core
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
RUN pnpm install --prod --frozen-lockfile
RUN pnpm --filter @optik/api exec prisma generate
EXPOSE 3001
CMD ["sh", "-c", "node apps/api/dist/main"]
