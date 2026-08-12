# Popcorn Vote – a single container. For now it is published for
# linux/amd64 only; these instructions build it on any architecture Docker runs
# on.
# Build:  docker build -t popcorn-vote .
FROM node:22-alpine AS build
WORKDIR /app
# better-sqlite3 is compiled from source on Alpine (musl)
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# Commit id for the version display. Render passes its environment variables as
# build arguments; the GitHub workflows explicitly pass GITHUB_SHA. Without
# these ARGs the build would see neither, and every image would show the same
# bare version number. An ARG is already available to the following RUN as an
# environment variable, so an extra ENV would be decoration. If both values are
# missing, the suffix simply falls away (see vite.config.ts).
ARG RENDER_GIT_COMMIT=""
ARG GITHUB_SHA=""
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine

# On the final stage, or they would describe the build stage and never reach the
# published image. `image.source` is the one that does more than describe: it is
# what links the package on GHCR to its repository, so the package page carries
# the README instead of standing there bare. No version label, it would have to
# be passed in as a build argument and could then disagree with the tag, and a
# tag that lies about its version is worse than no label.
LABEL org.opencontainers.image.title="Popcorn Vote" \
      org.opencontainers.image.description="Self-hosted voting on film suggestions for family movie night." \
      org.opencontainers.image.source="https://github.com/Stadicus/popcorn-vote" \
      org.opencontainers.image.licenses="MIT"

WORKDIR /app
ENV NODE_ENV=production \
    DATA_DIR=/data \
    PORT=3000
COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx && \
    mkdir -p /data && chown node:node /data
VOLUME /data
EXPOSE 3000
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
    CMD wget -qO- http://localhost:3000/healthz > /dev/null || exit 1
CMD ["node", "build/index.js"]
