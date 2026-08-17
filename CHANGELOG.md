# Changelog

## v1.3.0 App-store runtime and release preparation

- Made the production image adopt a root-owned `/data` mount once and then
  replace itself with the unprivileged `node` process. This enables managed
  app-store storage without changing the existing explicit `--user` path used
  by Unraid and Umbrel.
- Added the Home Assistant image labels to both native release architectures and
  CI checks that verify the labels, non-root application process, first-run
  setup, restart, update, port change, backup restore, and both supported data
  ownership paths.
- Prepared non-discoverable Home Assistant and CasaOS package templates plus a
  fail-closed materializer that accepts only a pullable multi-architecture image
  with matching Home Assistant labels. After this release, one reviewed metadata
  update can publish both packages and move Umbrel to the same manifest digest.
- Strengthened package discovery, version-lag, image pinning, architecture,
  privilege, and registry gates. Store metadata may intentionally remain one
  release behind the application, but it cannot point at an unavailable image.
- Gave the strict pull-request publication check an unambiguous status name,
  added CodeQL to the exact-commit release gate, and made each successful image
  publication report its manifest digest in a best-effort summary and JSON
  artifact.

## v1.2.0 Reliable health, a safer default, and the first app store

- Fixed the container health check, which reported every installation as
  unhealthy while the application was serving requests normally. It asked for
  `localhost`, which resolves to `::1` as well as `127.0.0.1` inside the
  container, while the server listens on IPv4 only. `docker ps` showed
  `(unhealthy)` permanently, monitoring alerted on a healthy app, and
  `depends_on: condition: service_healthy` could never be satisfied.
- Changed `ADDRESS_HEADER` to be off by default. It makes the app read the
  client address from a forwarding header, which is right behind a reverse
  proxy and wrong on a directly reachable installation, where the caller writes
  that header and can pick the address the per-IP PIN brake counts against.
  **Whoever runs the app behind a reverse proxy has to uncomment
  `ADDRESS_HEADER` and `XFF_DEPTH` in `docker-compose.yml` after updating**,
  otherwise every visitor counts as the proxy and the brake locks the whole
  household out together. The app now logs at startup which of the two it is
  doing.
- Added an Unraid Community Applications package, so the app can be installed
  from the Unraid app store. It lives in `packaging/` alongside a consistency
  check and an install test that runs the container the way a store does.
- Completed the ARM64 documentation: the ready-made image has been published for
  `linux/amd64` and `linux/arm64` for a while, but one installation guide still
  claimed otherwise and sent ARM and NAS owners into an unnecessary local build.
- Added a star request to the project website and narrowed the CodeQL scan to
  the source, which had been reporting findings in bundled dependency code.

## v1.1.0 Family setup and public website

- Added a multilingual first-run wizard for new installations. It configures
  family members, one shared family PIN, voting rules, scheduling, viewing
  sources, timezone, TMDB and optional OMDb keys, and movie-language defaults.
- Added settings for the instance name, timezone and automatic session timeout,
  while keeping environment-managed values read-only.
- Added server-enforced session expiry, safer atomic configuration updates and
  a fail-closed setup gate that protects existing data stores.
- Added immediate PIN validation with accessible error focus, responsive setup
  styling and complete setup translations for all supported languages.
- Added the multilingual Popcorn Vote website, live-demo entry points and a
  media kit with reusable project assets.
- Strengthened release, security and browser-test automation, including WebKit,
  coverage reporting, CodeQL and multi-architecture container publishing.
- Existing sessions need to enter the shared family PIN once after updating
  because authenticated cookies now carry a signed issue time.

## v1.0.0 Initial release

- Family movie-night planning with shared votes, movie suggestions, evaluation,
  archive and ratings.
- TMDB and optional OMDb metadata, CSV import/export, nightly backups and a
  Docker-based deployment.
- A PIN-protected, multilingual, installable web app with an optional TV view.
