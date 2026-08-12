# Changelog

## v1.1.0 Account settings

- Added browser-based first-run setup and administrator-managed user accounts
  with individual PINs, roles and activation controls.
- Added settings for the instance name, timezone and automatic session timeout,
  while keeping environment-managed values read-only.
- Added server-enforced session expiry, safer atomic configuration updates and
  a fail-closed setup gate for existing data stores.
- Added complete setup and settings translations for all supported languages.
- Existing sessions need to sign in once after updating because authenticated
  cookies now carry a signed issue time.

## v1.0.0 Initial release

- Family movie-night planning with shared votes, movie suggestions, evaluation,
  archive and ratings.
- TMDB and optional OMDb metadata, CSV import/export, nightly backups and a
  Docker-based deployment.
- A PIN-protected, multilingual, installable web app with an optional TV view.
