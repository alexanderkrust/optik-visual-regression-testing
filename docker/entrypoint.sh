#!/bin/sh
# Applies pending database migrations, then starts optik.
set -e
cd /app/api

# DATABASE_URL may come from a Docker / Kubernetes secret file
if [ -z "$DATABASE_URL" ] && [ -n "$DATABASE_URL_FILE" ]; then
  DATABASE_URL="$(cat "$DATABASE_URL_FILE")"
  export DATABASE_URL
fi
if [ -z "$DATABASE_URL" ]; then
  echo "optik: DATABASE_URL is not set" >&2
  exit 1
fi

node node_modules/prisma/build/index.js migrate deploy
exec node dist/main.js
