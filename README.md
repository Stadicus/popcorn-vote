# Popcorn Vote

[![CI](https://github.com/Stadicus/popcorn-vote/actions/workflows/ci.yml/badge.svg)](https://github.com/Stadicus/popcorn-vote/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**No more arguing about who gets to pick the film.**

> **Project status:** a family project, shared publicly so that others can build
> it themselves. No support and no pull requests for now; feature requests are
> welcome —
> [details at the bottom](#project-status).

Popcorn Vote is a small, self-hosted web app for family movie night.

Website (work in progress): <https://popcornvote.org>
Everyone suggests films, everyone gets one vote a week and puts it
on the film they want. Whoever saves up can later place several votes on the
same film — so eventually even the one film only a single person is longing for
gets its turn. Before movie night somebody presses **Evaluate**: the most votes
win, a wheel of fortune settles a tie, and the winner is announced with a
burst of popcorn.
Then you watch it, rate it with stars and it goes into the archive — your
family's film diary.

| Suggest a film | The film list | The winner |
|---|---|---|
| <img src="docs/screenshots/movie-search.png" alt="Searching for a film on a phone" width="220"> | <img src="docs/screenshots/movie-list.png" alt="Film list with votes on a phone" width="220"> | <img src="docs/screenshots/winner.png" alt="Winner announcement on a phone" width="220"> |

| Movie night | The tie wheel | Archive |
|---|---|---|
| <img src="docs/screenshots/movie-night.png" alt="Current standings before evaluating movie night" width="220"> | <img src="docs/screenshots/tie-wheel.png" alt="Wheel of fortune resolving a tie" width="220"> | <img src="docs/screenshots/archive.png" alt="Archive with watched and rated films" width="220"> |

| Settings | |
|---|---|
| <img src="docs/screenshots/settings.png" alt="More menu with interface language settings" width="220"> | |

**▶ Video demo (MP4, 4 MB)** — click the preview to play.

<a href="docs/screenshots/popcorn-vote-v1.mp4"><img src="docs/screenshots/video-preview.png" alt="Video demo: click to play the complete screen recording" width="220"></a>

## What the app does

- **Suggest films, data included:** Type a title, check the match in the
  preview, then add it with one button. The app fetches the poster, description,
  runtime, genre, IMDb rating and trailer from TMDB and OMDb.

- **Vote fairly:** Everyone starts with three votes, gets one more each week and
  can save up to five. Votes can be moved at any time and are visible to
  everyone.

- **Reveal the winner:** The most votes win; a wheel of fortune resolves a tie.
  The result is recorded in the log, so nobody can doubt the wheel.

- **Choose for tonight:** A movie on the list can be chosen directly, without a
  vote. Its votes expire, with a clear warning before the choice is made.

- **Keep a rated archive:** Rate watched movies from 1 to 5 stars in half steps,
  change a rating at any time, or use **Suggest again** to put a film back on
  the list.

- **Use one PIN for the whole family:** Every device enters a four-digit family
  PIN once and stays signed in afterwards. Whoever guesses wrong has to wait
  longer and longer (a brute-force brake). This is a house key, not a safe:
  everyone shares the same four digits, and whoever knows them can spend other
  people's votes too. Inside one family that is exactly the point — whoever
  puts the app on the internet should know it beforehand ([SECURITY.md](SECURITY.md)
  says what the app protects and what it does not).

- **Choose from nine interface languages:** English, German, Spanish, French, Brazilian
  Portuguese, Italian, Polish, Turkish and Japanese, switchable per device.
  Without configuration the interface speaks English.

- **Install it like a real app:** Install it on a phone with its own icon; it
  automatically follows light and dark mode and is built to be used with a thumb.

- **Keep everything at home:** All persistent state lives in one folder on your
  own machine: the SQLite database, configuration, covers and backups. No
  third-party provider, no account, no advertising. A nightly automatic backup
  keeps the last 14 states by default.

- **Adjust it to your family:** The amount, weekday and hour of the weekly
  credit, the cap, the language of the film data, the timezone and the backup
  are all configurable — without a line of code.

## The documentation

| Document | Who is it for? |
|---|---|
| **[DOCUMENTATION.md](DOCUMENTATION.md)** | The full manual for everyone: how to use it, the rules of the game, the technology explained without jargon, setup step by step, maintenance and troubleshooting. **Start here!** |
| [SPECIFICATION.md](SPECIFICATION.md) | The complete functional specification — every rule, every edge case, every technical decision. |
| [docs/installation-example.md](docs/installation-example.md) | An example walkthrough: step by step from an empty folder to the app on a phone (Docker Compose, reverse proxy, HTTPS, auto-updates). |
| [SECURITY.md](SECURITY.md) | What the app protects, what it explicitly does not, and how to report a vulnerability. |
| This README | The quick overview and the short path to a running instance. |

## Quick start (the details are in the manual)

1. **Create two free access keys:**
   [TMDB](https://www.themoviedb.org/settings/api) (film data and trailers) and
   [OMDb](https://www.omdbapi.com/apikey.aspx) (IMDb rating).
2. **Copy `config.example.yaml` into the data directory as `config.yaml`** and
   adjust it: family members, PIN, and the hour of the weekly credit if you like.
3. **Start the container** — most easily with the ready-made image through
   [`docker-compose.yml`](docker-compose.yml), or directly:

   ```sh
   docker run -d --name popcorn-vote \
     -p 3000:3000 \
     -v popcorn-vote-data:/data \
     -e PV_PIN=1234 \
     -e PV_MEMBERS=Anna,Ben,Carla,David \
     -e TMDB_API_KEY=your-tmdb-key \
     -e OMDB_API_KEY=your-omdb-key \
     -e ADDRESS_HEADER=x-forwarded-for -e XFF_DEPTH=1 \
     --restart unless-stopped \
     ghcr.io/stadicus/popcorn-vote:latest
   ```

   Building it yourself works too, of course:

   ```sh
   docker build -t popcorn-vote .

   docker run -d --name popcorn-vote \
     -p 3000:3000 \
     -v popcorn-vote-data:/data \
     -e PV_PIN=1234 \
     -e TMDB_API_KEY=your-tmdb-key \
     -e OMDB_API_KEY=your-omdb-key \
     -e ADDRESS_HEADER=x-forwarded-for \
     -e XFF_DEPTH=1 \
     -e PROTOCOL_HEADER=x-forwarded-proto \
     --restart unless-stopped \
     popcorn-vote
   ```

   (`ADDRESS_HEADER`/`XFF_DEPTH` make sure the app sees the real sender IP behind
   a proxy — important for the per-IP PIN brake. `PROTOCOL_HEADER` names the header
   the proxy uses to say a visitor came over HTTPS; the sign-in cookie is then
   marked `Secure` for those visitors and left unmarked for anyone reaching the
   app directly over plain HTTP, so both ways in keep working. Without a proxy in
   front, leave it out — see "Over plain HTTP on the local network" below.)

   **`-p 3000:3000` publishes the port on every interface**, which is what you
   want on a home network and what you do not want on a machine with a public
   address. There, write `-p 127.0.0.1:3000:3000`: the proxy in step 4 still
   reaches the app, nobody else does, and step 4 is then really the only way in.
   Docker writes its own firewall rule when it publishes a port, so a host
   firewall set up the usual way will not close it for you — and on that direct
   path `ADDRESS_HEADER` is believed as it stands, so a visitor can pick the
   address the PIN brake counts against.

   For a quick try without a `config.yaml`, everything also works through
   environment variables: `PV_MEMBERS=Anna,Ben,Carla,David`,
   `PV_START_TOKENS=3`, `PV_SOURCES=Netflix,Google,Server` (see
   `.env.example` and `config.example.yaml` for all settings).

4. **Put a reverse proxy in front of it** (HTTPS is mandatory if the app is
   reachable from the internet). The app speaks plain HTTP on port 3000 and
   brings no certificate of its own; whatever terminates TLS on your server does
   that job — Caddy, nginx, Traefik, or the proxy your server's administration
   interface already offers. With Caddy the whole thing is two lines:

   ```
   popcornvote.your-domain.com {
       reverse_proxy localhost:3000
   }
   ```

   `localhost` because the proxy runs on the same machine as the container —
   which is also what makes the `127.0.0.1` binding above work. A proxy on a
   different machine wants that machine's address instead, and then the port
   cannot be bound to the loopback.

5. Open the address on a phone, enter the PIN, pick a person, suggest the first
   film — and do not forget **"Add to Home Screen"**.

Worth knowing: **without a configured PIN the app stays locked** (only the health
address `/healthz` answers). That is deliberate — an app reachable from the
internet must never accidentally stand open.

### Over plain HTTP on the local network

Running it without HTTPS is supported and needs no configuration — on a home
network reached by IP address or mDNS name there is no certificate to be had, and
that is the case the default setting is written for. Leave `PROTOCOL_HEADER` and
`ORIGIN` unset and the app marks no cookie `Secure`, which is what a browser
needs in order to keep you signed in over plain HTTP.

What it costs, stated plainly: **the PIN travels the local network in clear
text**, as does everything else. That is acceptable on a network the family
controls. It is not acceptable on one reachable from the internet — put HTTPS in
front of it there, and set `PROTOCOL_HEADER` with it.

Two things worth knowing when both ways in exist at once:

- **Reach the app over HTTP by IP or mDNS name, not by the HTTPS hostname.** A
  browser will not let a plain-HTTP page overwrite a cookie it already holds as
  `Secure` for that same hostname. A device that signed in through
  `https://popcornvote.example.com` and later opens
  `http://popcornvote.example.com:3000` can therefore not sign in there —
  `http://192.168.1.50:3000` or `http://popcorn.local:3000` has no existing
  secure cookie
  and works.
- **`ORIGIN=https://…` is the wrong tool for a mixed installation.** It counts
  every request as HTTPS, including the ones arriving on the container's port
  over plain HTTP, and locks that path out. Use it only where the container
  cannot be reached except through the proxy.
- **The rising wait after a wrong PIN cannot tell direct visitors apart.** With
  `ADDRESS_HEADER` set, the sender address comes from the proxy — and a request
  that reaches the container directly carries no such header, so every direct
  device shares one wait. Worse, that way in is not sealed off from the other:
  the installation-wide brake counts failures from anywhere, so hammering the
  direct port eventually makes the whole family wait, and a direct request that
  brings the address header along is believed as it stands. Keep the container's
  port on a network you control; the waits are only as trustworthy as that
  network is.

## Updating

Every configuration key and every environment variable is documented in
[`config.example.yaml`](config.example.yaml) and [`.env.example`](.env.example);
The [changelog](CHANGELOG.md) describes the current release. A key the app does not know is not read, and the
setting keeps its default.

## The technology in one sentence

SvelteKit (Svelte 5, TypeScript) with the Node adapter, SQLite as the single
data file, shipped as one Docker container for linux/amd64 — no separate
database, no user accounts, timezone Europe/Berlin by default for the credit and
the backup. The ready-made image does not run on ARM devices yet (Raspberry Pi,
Apple Silicon, ARM servers); whoever needs one builds it with `docker build` for
the time being.

## For developers

```sh
npm install
DATA_DIR=./data PV_PIN=1234 npm run dev   # development server
npm test                                   # unit tests (Vitest)
npm run test:e2e                           # end-to-end tests (Playwright)
npm run check                              # type checking
npm run build                              # production build
```

All the game-rule logic lives in `src/lib/server/game.ts` and the PIN protection
in `src/lib/server/auth.ts`; both are fully covered by tests (the `*.test.ts`
files beside them). On a first start without a `config.yaml` the app runs with
two demo people (a PIN still has to be set).

The code, its comments and the commit messages are English. The translated
interface lives in the catalogues in `messages/`; adding a language is a JSON
file plus an entry in `src/lib/i18n/locales.ts` and `src/lib/i18n/catalogues.ts`.

## Project status

This app plans one family's movie night. It is public because it might be useful
to others too — not because it is meant to become a product. What that means for
outsiders:

- **No support.** Whoever self-hosts it, self-hosts it. The
  [DOCUMENTATION.md](DOCUMENTATION.md) answers almost everything; beyond that
  there is no assurance that anyone will answer.
- **Feature requests are welcome.** Please open an issue with the problem you
  are trying to solve and your proposed approach. What gets built is still
  decided by what is needed at one kitchen table, so a request is not a promise
  that it will be implemented.
- **No pull requests for now.** Contributions are not currently expected, not
  even well-meant ones — submitted PRs will probably sit there. Save yourself
  the work until this says something else.
- **Security reports, on the other hand, very much yes.** How to report and the
  threat model are in [SECURITY.md](SECURITY.md).
- **Forks are welcome.** MIT licence: take the code, rebuild it, rename it, run
  it. That is exactly why it is here.

## Film data

Posters, descriptions, runtimes, genres and trailers come from
[TMDB](https://www.themoviedb.org), the IMDb ratings through the
[OMDb API](https://www.omdbapi.com). Both services are free for private use and
each needs its own access key.

[<img src="static/tmdb.svg" alt="TMDB" width="120">](https://www.themoviedb.org)

> This product uses TMDB and the TMDB APIs but is not endorsed, certified, or
> otherwise approved by TMDB.

The screenshots and video in this repository include TMDB film posters solely
to demonstrate the app; they are third-party content, not MIT-licensed. See
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Licence

[MIT](LICENSE) – © 2026 Stadicus
