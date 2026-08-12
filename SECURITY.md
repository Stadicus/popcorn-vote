# Security Policy

## Reporting a vulnerability

Please report security issues privately, not as a public issue:

**[Open a private security advisory](https://github.com/Stadicus/popcorn-vote/security/advisories/new)**
(GitHub → Security → Report a vulnerability)

This is a hobby project maintained in spare time. Expect a first reply within
about two weeks. There is no bug bounty, and there are no guaranteed fix
timelines, but every report is read, and credit is given in the release notes
unless you prefer otherwise.

## Supported versions

Only the current release receives fixes. `ghcr.io/stadicus/popcorn-vote:latest`
is the moving image tag.

## What this app is, security-wise

Read this before deciding whether a finding is a bug or the design.

Popcorn Vote is built for a handful of people who live in the same
household and already trust each other. Its protection model is deliberately
thin:

- **A single four-digit PIN, shared by the whole family.** It is not a password,
  and four digits are not much entropy. What stands behind it: the PIN is
  verified server-side, failed attempts are throttled per IP address with a
  growing delay plus a global fallback limit, and a device that got it right
  holds an HMAC-signed cookie. Changing the PIN signs every device out.
- **No user accounts, no per-person authentication.** Picking a person in the
  app is a convenience, not an identity. Anyone who knows the PIN can spend
  anyone's votes. Inside a family that is the point; treat it as a design
  constraint, not a vulnerability.
- **No transport security of its own.** The app speaks plain HTTP on port 3000
  and expects to sit behind a reverse proxy that terminates TLS. Exposing the
  container port directly to the internet is a misconfiguration.
- **All data lives in one SQLite file** in the mounted data directory, together
  with downloaded cover images and the nightly backups. Anyone with file access
  to that directory has everything.

### In scope

Anything that lets someone **without** the PIN get in or extract data:
authentication bypass, cookie forgery, defeating the brute-force throttle, path
traversal in the cover route, SQL injection, XSS or CSP bypass, SSRF through the
movie-database lookups, remote code execution, or a leak of the API keys or the
PIN into logs, error pages, or API responses.

### Out of scope

- One family member acting as another (see above, that is the design).
- Anything that requires knowing the PIN, unless it escalates beyond what a
  family member is meant to be able to do.
- Running the app without a reverse proxy, without TLS, or with the data
  directory readable by others.
- Weaknesses of the four-digit PIN as such. It is a known trade-off; a concrete
  attack that beats the throttling is very much in scope.
- Denial of service by hammering a self-hosted instance you control.

## For operators

Two things matter more than everything else in this file: put the app behind
HTTPS, and set a PIN that is not `1234`. Without a configured PIN the app stays
locked on purpose, only `/healthz` answers. Keep the container up to date;
`latest` is rebuilt on every release, and the [installation
example](docs/installation-example.md) shows one way to pull new versions
automatically.
