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

- **Named accounts with four-digit PINs.** Four digits are not much entropy.
	PINs are stored as salted scrypt hashes, failed attempts are throttled per IP
	address with a growing delay plus a global fallback limit, and a signed cookie
	remembers a successful login. Changing an account PIN invalidates its cookies.
- **Accounts are access roles, not voting identities.** Picking a person in the
	app remains a convenience. An authenticated family member can spend anyone's
	votes; inside a trusted household that is the point.
- **No transport security of its own.** The app speaks plain HTTP on port 3000
  and expects to sit behind a reverse proxy that terminates TLS. Exposing the
  container port directly to the internet is a misconfiguration.
- **All data lives in one SQLite file** in the mounted data directory, together
  with downloaded cover images and the nightly backups. Anyone with file access
  to that directory has everything.

### In scope

Anything that lets someone **without a valid account PIN** get in or extract data:
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
HTTPS, and do not choose `1234` as a PIN. Without an account, only first-run
setup and `/healthz` answer. Keep the container up to date;
`latest` is rebuilt on every release, and the [installation
example](docs/installation-example.md) shows one way to pull new versions
automatically.
