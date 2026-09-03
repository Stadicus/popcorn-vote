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
| `home-assistant/` | Home Assistant custom app repository | prepared for v1.3.0 |
| `casaos/` | CasaOS direct import / later app-store contribution | materialized for v1.3.0; upstream submission pending |

Home Assistant metadata remains in non-discoverable templates until its required
Home Assistant OS device test has passed. CasaOS v1.3.0 is materialized for
direct import, while an official store submission still requires a real CasaOS
install test and separate authorization. `prepare-release-metadata.sh` verifies
the multi-architecture image and can render the full coordinated metadata set
after the Home Assistant gate passes. It never commits, pushes, submits, or
publishes anything.
The release workflow uses a retried, best-effort post-publication inspection to
write that digest to its job summary and the machine-readable
`release-metadata-<version>` artifact. This avoids manual transcription from raw
manifest output without letting a transient registry read, summary write, or
artifact-service outage orphan an already-published image tag.

Every new release also runs `prepare-store-update.sh` and opens a draft PR that
updates Umbrel to the published manifest digest and materializes the matching
CasaOS direct-import file. The repository secret `RELEASE_PR_TOKEN` must contain
a fine-grained token with Contents and Pull requests read/write access. A
personal token is required because GitHub suppresses follow-up CI for branches
and pull requests created by the workflow's own `GITHUB_TOKEN`; the release gate
fails before publication when this token is absent. Home Assistant is excluded
from this automatic PR until its separate HA OS device-acceptance gate passes.

The CasaOS result supports direct Compose import and is also shaped for a later
pull request to `IceWhaleTech/CasaOS-AppStore`. Test it on a real CasaOS instance
before submitting; any upstream submission requires separate authorization.

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
bash packaging/check.sh                  # static package contracts
bash packaging/test-registry-required.sh # registry gate fails closed
bash packaging/test-yaml-discovery.sh    # nested YAML stays covered
bash packaging/test-install.sh           # exercises a store installation
```

`check.sh` compares what the packages set against `docker-compose.yml` and the
application source. It verifies exactly this, and nothing beyond it: that the
XML and the YAML parse, that every variable name a package sets is read
somewhere in `src/`, that port and data path match the compose file, and that no
package sets `ADDRESS_HEADER`. For the Umbrel package it additionally checks
what only that store has: that the image is pinned to a digest, that its tag
matches the manifest version, that the store version is not newer than
`package.json`, that `APP_HOST` matches the app id, and that the data stays under
`${APP_DATA_DIR}`, which is the only place Umbrel backs up and removes with the
app. A store version behind `package.json` is expected between publishing an
image and merging its reviewed metadata update.

`test-install.sh` needs Docker and no Unraid. It creates the data directory with
the ownership a store would give it, starts the container as the package
describes, and checks what somebody who clicked install actually gets: that it
stays up, answers `/healthz`, reports healthy, lands on the setup wizard, can
complete setup, then stops offering it, survives an update and a restart, works
on another host port, and comes back from a copied data directory. Two runs may
overlap; names, ports and temporary files carry the PID.

The ownership is the point of the test. Unraid creates appdata as `99:100`, so
its template explicitly runs the container as that user. Umbrel hands the
committed `data/` directory to the app owned by `1000:1000` (umbreld clones the
app store with `chown -R 1000:1000` and copies the package with
`rsync --archive`), so its package runs the container as `1000:1000`, which is
the image's own `node` user; CI exercises exactly that with
`EXTRA='--user 1000:1000'`. Home Assistant and CasaOS create the mount as root,
so those packages start the image entrypoint as root once; the entrypoint adopts
the mount and then replaces itself with the application as uid 1000.
`test-root-owned-install.sh` covers that path. It leaves a platform-owned
`options.json` alone and records `/data/.ownership-migrated`; if files are later
copied into that directory as root, remove the marker and restart to repeat the
migration.

CI runs both install paths natively on AMD64 and ARM64. For a local ARM64 check,
run the scripts on an ARM64 host. QEMU is a slower fallback when no such host is
available:

```sh
docker run --privileged --rm tonistiigi/binfmt --install arm64
PLATFORM=linux/arm64 IMAGE=popcorn-vote:ci bash packaging/test-install.sh
```

Emulation makes every step roughly five times slower, and `IMAGE=` picks which
build is under test — a locally built `popcorn-vote:dev` before a release, the
published digest after one.
