# Popcorn Vote specification

## 1. Purpose

Popcorn Vote is a self-hosted web app for planning family movie nights. Family
members suggest films, place shared weekly votes, and evaluate the list to pick
a winner. Watched films move to an archive where they can be rated.

The app is designed for a small, trusted household. It runs in Docker, stores
its data locally, and may be used on a home network or behind an HTTPS reverse
proxy.

## 2. Votes and film lifecycle

- Each configured member receives votes on the configured weekday and hour.
  Unused votes accumulate up to the configured cap.
- A member can add or remove votes from any proposed film while it is on the
  list. A vote belongs to the member, not to the device.
- Evaluation selects a film with the highest number of votes. A tie is resolved
  randomly. Votes on the selected film are spent; all other votes remain.
- A film can also be selected as a free pick. Its votes expire.
- After watching, the selected film is rated and archived. It can be proposed
  again without removing the archive entry.
- Films can be deleted, restored from the bin, or permanently removed.

## 3. Film data

Film suggestions can be searched through TMDB or entered manually. TMDB provides
titles, covers, descriptions, metadata and trailers. If configured, OMDb adds
the IMDb rating; otherwise the app shows TMDB's rating when available.

Movie data language is configured separately from the interface language.
`language.primary` accepts a language code, `latin`, or `original`; fallback,
certification-country and trailer-language settings refine the result. Existing
film records retain the metadata they were created with.

## 4. Interface

The responsive interface is optimised for phones and also works on tablets and
desktops. It follows the device light/dark preference and is installable as a
web app.

The interface is available in English, German, Spanish, French, Brazilian
Portuguese, Italian, Polish, Turkish and Japanese. An instance has a configurable
default; every device can choose another supported language or return to the app
default.

The main screens are:

- film list with voting controls and person selection;
- proposal and movie-detail pages;
- evaluation, archive, activity log and recycle bin;
- settings, import/export and installation help;
- a TV view for showing the current candidates and winner.

The TV view can use fullscreen where supported. On compatible installed Android
apps it can also open in Chrome for browser-based casting.

## 5. Access and security

The app uses one shared four-digit PIN. A successful entry creates a signed
device cookie; changing the PIN invalidates all such cookies. Failed attempts
are throttled per sender address with an installation-wide fallback limit.

The PIN is suitable only for a trusted household. Public deployments must use
HTTPS via a reverse proxy. A local-network HTTP deployment is supported, but its
traffic, including the PIN, is readable on that network.

## 6. Data, backups and operations

All persistent state lives in `/data`: the SQLite database, downloaded covers,
configuration and backups. A nightly backup is created at the configured hour;
the default keeps 14 copies. CSV import and export cover the active list and
archive.

Configuration can come from `config.yaml` or environment variables. Environment
variables take precedence when valid. `config.example.yaml` is the authoritative
list of supported settings and defaults. Invalid and unknown values are reported
in the container log.

The health endpoint is `GET /healthz`. Unexpected request failures are logged
with a short reference that is also shown to the user.

## 7. Technology

The application uses SvelteKit, TypeScript and SQLite. It is packaged as a
Docker image and exposes HTTP on port 3000. It does not manage TLS itself.

## 8. Constraints

- No user accounts or per-person authentication.
- No hosted database or external application backend.
- No automatic migration of user configuration beyond supported current keys.
- No guarantees for third-party movie metadata, trailers or ratings.
