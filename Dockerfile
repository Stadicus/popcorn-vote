# Popcorn Vote – a single container, published for linux/amd64 and linux/arm64.
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

# Home Assistant app labels. Release builds pass both values explicitly for
# each architecture before the images are joined into one manifest. Empty
# defaults keep ordinary local Docker builds possible without pretending that a
# development image is a released Home Assistant app.
ARG BUILD_VERSION=""
ARG BUILD_ARCH=""

# On the final stage, or they would describe the build stage and never reach the
# published image. `image.source` is the one that does more than describe: it is
# what links the package on GHCR to its repository, so the package page carries
# the README instead of standing there bare. No version label, it would have to
# be passed in as a build argument and could then disagree with the tag, and a
# tag that lies about its version is worse than no label.
LABEL org.opencontainers.image.title="Popcorn Vote" \
      org.opencontainers.image.description="Self-hosted voting on film suggestions for family movie night." \
      org.opencontainers.image.source="https://github.com/Stadicus/popcorn-vote" \
      org.opencontainers.image.licenses="MIT" \
      io.hass.version="$BUILD_VERSION" \
      io.hass.type="app" \
      io.hass.arch="$BUILD_ARCH"

WORKDIR /app
ENV NODE_ENV=production \
    DATA_DIR=/data \
    PORT=3000
COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY docker-entrypoint.sh /usr/local/bin/popcorn-vote-entrypoint
RUN apk add --no-cache su-exec && \
    rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx && \
    chmod 0755 /usr/local/bin/popcorn-vote-entrypoint && \
    mkdir -p /data && chown node:node /data
VOLUME /data
EXPOSE 3000
# App stores create the persistent mount before the container starts, often as
# root. The entrypoint adopts that mount once and immediately replaces itself
# with the application as `node`. An explicit Docker --user remains respected:
# that path never starts as root and performs no ownership changes.
ENTRYPOINT ["popcorn-vote-entrypoint"]
# 127.0.0.1 rather than localhost: the server binds 0.0.0.0, which is IPv4 only,
# while `localhost` also resolves to ::1 in the container and busybox wget tries
# that first. The check then answers "connection refused" for an application
# that is serving perfectly well, and every container reports unhealthy.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
    CMD wget -qO- http://127.0.0.1:3000/healthz > /dev/null || exit 1
CMD ["node", "build/index.js"]
