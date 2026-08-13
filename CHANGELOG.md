# Changelog

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
