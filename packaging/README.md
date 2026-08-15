# App store packaging

One package per store, kept next to the application rather than in separate
repositories. Every package repeats the container's port, data path and
environment variables, so they drift the moment `docker-compose.yml` changes and
nobody remembers the copies. Here a single diff shows what has to follow, and
`check.sh` fails when it does not.

**Source of truth is `docker-compose.yml` in the repository root.** When it
gains, loses or renames a variable, or moves the port or the data path, every
package below has to be checked.

| Directory | Store | Status |
|---|---|---|
| `unraid/` | Unraid Community Applications | shipped |
| `umbrel/` | Umbrel App Store | [submitted](https://github.com/getumbrel/umbrel-apps/pull/5994) |

CasaOS (`IceWhaleTech/CasaOS-AppStore`) is planned and not packaged yet. It also
takes the package as a pull request against the store's own repository, and
additionally requires it to be tested on a real CasaOS instance before
submitting.

## How the Unraid package reaches users

Community Applications reads the XML out of this repository, so the file here
*is* the package: **updating it updates the listing, with nothing to submit
again.** Getting into the CA catalogue was a separate, one-time step, and it is
done — the repository was submitted at `ca.unraid.net/submit` on 2026-08-15 and
auto-approved, so the app appears once the next CA build publishes. Without that
submission only users who paste the raw repository URL into Unraid's Docker tab
by hand could have installed it, and almost nobody finds an app that way.

From here on the catalogue follows `main`. A change to `unraid/popcorn-vote.xml`
reaches users on the next CA build, and a broken change reaches them just as
fast — which is what `check.sh` and `test-install.sh` are for.

### The `not_unraid_application` warning is expected

CA scans **every** `*.xml` file in the repository and counts each one that is not
an app template. This repository contains `docs/website/sitemap.xml`, the
generated sitemap of the project website, so the scan reports
`not_unraid_application: 1`. That is the warning working as intended, not a
defect in the package: the scan passes with no hard errors, one valid app, and a
pullable image.

It cannot be removed while the packaging lives here. The sitemap has to keep its
name for search engines and has to stay in the repository because the web server
pulls it from there. Only a separate, template-only repository would silence it,
which is the trade the monorepo deliberately makes. If the count ever rises,
check whether a new XML file was added rather than assuming the package broke.

`unraid/ca_profile.xml` carries the maintainer profile CA shows next to the app.
Convention places it at the root of a template repository, but the submission
scan finds it here as well: it reported "ca_profile.xml found and Profile
content extracted" with the file at `packaging/unraid/`. No move needed.

## How the Umbrel package reaches users

Umbrel keeps its catalogue in `getumbrel/umbrel-apps`, so unlike the Unraid
template the two files here are only the *source* of the package. They reach
users as a pull request against that repository, and **every later change needs
another one** — nothing in this repository updates the listing.

The image is pinned by digest, because a tag can be moved to a different image
after the store reviewed it. Umbrel's own linter refuses `latest` for that
reason. A release therefore runs in this order: publish the image, read the
digest of the multi-arch index, then update `umbrel/docker-compose.yml`. The
digest of a single architecture would leave everyone on the other one unable to
install.

`app_proxy` is the container Umbrel puts in front of every app. Two of its
settings decide whether this one works at all:

- `PROXY_AUTH_ADD: "false"` turns the Umbrel login off for this app, on purpose
  and not for convenience. The family votes from their own phones, while the
  Umbrel password belongs to whoever runs the server; leaving the login in front
  would mean handing that password to the children.
- `APP_HOST` has to be the container name Umbrel builds out of the app id,
  `popcorn-vote_main_1`. Anything else and visitors get a blank page rather than
  an error.

The manifest's `port:` is the host port Umbrel reserves for the app, and it has
to be free across the entire catalogue — not merely across the other `port:`
fields, but across every port any app's compose file publishes. Checking only
the manifests suggested 3009 was free; it is taken by a compose service, and
3019 was chosen after collecting both.

## Two rules every package follows

**No `ADDRESS_HEADER`.** The root `docker-compose.yml` offers
`ADDRESS_HEADER=x-forwarded-for` (commented out), which is right *behind a
reverse proxy*: the app then reads the client address out of that header. App
store installs are reached directly, and there the header is written by whoever
is calling. Setting it would let anyone hand the app a fresh address on every
request and walk straight through the brute-force brake on the PIN. Left unset,
the app uses the real socket address, which is what an app store install needs.
Whoever puts a proxy in front adds the variable themselves.

**Nothing is required up front.** The app starts with no configuration at all
and asks for PIN, members, both API keys and the languages in the browser. Keys
are still offered as optional fields, because entering them beforehand is
convenient, but no install is blocked on them. This is what Umbrel's app store
standard asks for: understandable from the browser after install, with no shell
and no file editing.

## Checking a package

```sh
bash packaging/check.sh         # static: names, port, data path, XML, YAML
bash packaging/test-install.sh  # runs the container the way a store would
```

`check.sh` compares what the packages set against `docker-compose.yml` and the
application source. It verifies exactly this, and nothing beyond it: that the
XML and the YAML parse, that every variable name a package sets is read
somewhere in `src/`, that port and data path match the compose file, and that no
package sets `ADDRESS_HEADER`. For the Umbrel package it additionally checks
what only that store has: that the image is pinned to a digest, that its
tag and the manifest version match `package.json`, that `APP_HOST` matches the
app id, and that the data stays under `${APP_DATA_DIR}`, which is the only place
Umbrel backs up and removes with the app.

`test-install.sh` needs Docker and no Unraid. It creates the data directory with
the ownership a store would give it, starts the container as the package
describes, and checks what somebody who clicked install actually gets: that it
stays up, answers `/healthz`, reports healthy, lands on the setup wizard, can
complete setup, then stops offering it, survives an update and a restart, works
on another host port, and comes back from a copied data directory. Two runs may
overlap; names, ports and temporary files carry the PID.

The ownership is the point of the test, and the two stores do not agree on it:
Unraid creates appdata as `99:100`, Umbrel as `1000:1000`. The defaults above are
Unraid's, so the Umbrel package deserves its own pass:

```sh
UIDGID=1000:1000 EXTRA='--user 1000:1000' bash packaging/test-install.sh
```

Umbrel commonly runs on a Raspberry Pi, so the arm64 half of the image is worth
the same attention:

```sh
docker run --privileged --rm tonistiigi/binfmt --install arm64
PLATFORM=linux/arm64 bash packaging/test-install.sh
```

Emulation makes every step roughly five times slower, and `IMAGE=` picks which
build is under test — a locally built `popcorn-vote:dev` before a release, the
published digest after one.
