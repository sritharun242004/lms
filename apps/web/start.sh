#!/bin/sh
# Production entrypoint for the web image.
#
# App Runner runs a configured StartCommand WITHOUT a shell, so "a && b" cannot
# be expressed there. This script is the single command that does both steps:
#   1. apply pending, forward-only Prisma migrations
#   2. replace this process with the Next.js server
#
# `set -e` means a failed migration exits non-zero BEFORE the server starts, so the
# health check fails and App Runner rolls back to the previous image instead of
# serving new code against an old schema.
set -e

# Migrations take a Postgres advisory lock. Through Neon's PgBouncer pooler
# ("-pooler" host, transaction mode) that lock can time out and fail the deploy, so
# migrations use the direct endpoint: DIRECT_URL when set, otherwise DATABASE_URL
# with "-pooler" removed from the host. The app itself keeps using DATABASE_URL.
MIGRATE_URL="${DIRECT_URL:-$(printf '%s' "$DATABASE_URL" | sed 's/-pooler\./\./')}"

# A suspended Neon database can take a few seconds to wake; retry before giving up.
attempt=1
until DATABASE_URL="$MIGRATE_URL" npx --no-install prisma migrate deploy; do
  if [ "$attempt" -ge 3 ]; then
    echo "[start] migrations failed after $attempt attempts" >&2
    exit 1
  fi
  echo "[start] migrate attempt $attempt failed; retrying in ${MIGRATE_RETRY_DELAY:-5}s" >&2
  attempt=$((attempt + 1))
  sleep "${MIGRATE_RETRY_DELAY:-5}"
done

echo "[start] migrations complete; starting web server"
exec npx --no-install next start
