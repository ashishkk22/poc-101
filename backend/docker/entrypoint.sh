#!/bin/sh
# Applies migrations before the API starts serving. `migrate deploy` is the
# production mechanism — `db push` is never used here.
set -e

if [ "${RUN_MIGRATIONS:-false}" = "true" ]; then
  echo "[entrypoint] applying database migrations"
  pnpm exec prisma migrate deploy
fi

exec "$@"
