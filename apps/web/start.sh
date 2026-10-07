#!/bin/sh
# Production entrypoint for the web image.
#
# App Runner runs a configured StartCommand WITHOUT a shell, so "a && b" cannot
# be expressed there. This script is the single command that does both steps:
#   1. apply pending, forward-only Prisma migrations with the runtime DATABASE_URL
#   2. replace this process with the Next.js server
#
# `set -e` means a failed migration exits non-zero BEFORE the server starts, so the
# health check fails and App Runner rolls back to the previous image instead of
# serving new code against an old schema.
set -e

echo "[start] applying pending migrations"
npx --no-install prisma migrate deploy

echo "[start] migrations complete; starting web server"
exec npx --no-install next start
