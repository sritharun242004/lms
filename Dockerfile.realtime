# Socket.IO realtime server for Mentor Connect LMS.
# Runs under tsx directly so we do not depend on a compiled dist/ that would
# also require compiling packages/shared (which currently ships raw TS).
FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/realtime/package.json ./apps/realtime/
COPY packages/shared/package.json ./packages/shared/

RUN npm ci --workspaces --include-workspace-root

COPY apps/realtime ./apps/realtime
COPY packages/shared ./packages/shared

ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000

CMD ["npx", "tsx", "apps/realtime/src/server.ts"]
