# Distribution Packaging Plan

## Status

Reviewed implementation plan, now in execution. Home Assistant is the first
remaining delivery target; Unraid and Umbrel are already present, while CasaOS
follows on the same container contract.

### Execution update — 2026-08-15

The repository advanced after this plan was approved: release `v1.2.0` merged as
PR #22, then the Umbrel package merged as PR #23 and was submitted upstream as
`getumbrel/umbrel-apps#5994`. Both are now baseline, not work for this branch.
They landed before the runtime merge prescribed below, so `v1.2.0` must not be
retroactively advertised as the Home Assistant-compatible image. The next
release containing the entrypoint and `io.hass.*` labels becomes the first image
eligible for Home Assistant and CasaOS metadata. Umbrel 1.2.0 remains compatible
through its explicit `user: "1000:1000"`; its next metadata bump follows that
new release in the usual publish-then-metadata order.

The three-step bootstrap sequence below remains the design record for why image
publication must precede versioned store metadata. Its `v1.2.0` references
describe the originally approved sequence; this execution update supersedes
them where the live repository has already moved on.

### Existing baseline (not net-new work)

**The Unraid packaging is already merged to `main`.** Pull request
[#18](https://github.com/Stadicus/popcorn-vote/pull/18) ("Unraid Community
Applications Template") was squash-merged as commit `0bf3f08` on
2026-08-15. Two further pull requests merged alongside it — #19
(`ADDRESS_HEADER` safe default and startup notice) and #20 (container health
check fix) — both consistent with the rules below. There is no open branch left
to amend: everything below is a correction to `main`, delivered as ordinary
follow-up pull requests.

**The baseline is `main`'s current state, deliberately not a fixed commit.** The
packaging work moved five times during this plan's review (`41f406e` →
`17b87d7` → `b3ccd8c` → `4c0f87a` → `b29cc0f`, then merged as `0bf3f08`).
Pinning a SHA here produced a stale, wrong plan three review rounds running. The
rule instead:

- Implementation reads `main` at the moment it starts and builds on it.
- Everything this plan prescribes is stated against the **role** of each file,
  not a snapshot of its content. Where a correction names current content,
  verify it still applies before changing it.
- Nothing already on `main` may be dropped by a correction. When a correction
  and a newer commit collide, the newer commit wins on facts about the platform,
  this plan wins on the packaging contract — and the collision is worth a note
  in the pull request that resolves it.

These files are on `main` today, by role:

| File | Role | This plan's disposition |
| --- | --- | --- |
| `packaging/README.md` | Store-package overview | Extend (Phase 2, Phase 3) |
| `packaging/check.sh` | Metadata validation | Extend in place (Phase 5) |
| `packaging/test-install.sh` | Store-install test against a real container | Keep, extend only on contract change (Phase 5) |
| `packaging/unraid/popcorn-vote.xml` | Unraid CA template | Correct in place (Phase 3), keep `ExtraParams` |
| `packaging/unraid/ca_profile.xml` | Maintainer profile | Keep; the CA submission scan found and parsed it in place |

**Unraid is already shipped.** The repository was submitted through the
Community Applications portal on 2026-08-15 and auto-approved. The scan found
the nested template and extracted the maintainer profile from
`packaging/unraid/ca_profile.xml`; these two discovery questions are therefore
closed by observed platform behavior. The template deliberately follows
`:latest` and starts as `99:100`, so it does not depend on the root-owned-mount
migration introduced for the other stores. The scan result and delivery path
are recorded in `packaging/README.md`, "How the Unraid package reaches users".

Two things on `main` are load-bearing for this plan and must survive every
correction it prescribes:

- **The Unraid uid fix.** Unraid creates appdata directories as `nobody:users`
  (99:100) while the image runs as `node`, so without
  `<ExtraParams>--user 99:100</ExtraParams>` the container cannot write `/data`
  and crash-loops on `EACCES /data/covers`. See "Container user on Unraid" in
  Phase 3.
- **`packaging/test-install.sh`.** It has grown past the original ownership check
  and now exercises the full store-install journey against a real container —
  health polling, first-run setup through the API, restart and update
  persistence, host-port change, and backup/restore. Treat its current coverage
  as the reference when reading Phase 5, and read the file rather than this
  description before changing it.

Implementation builds on `main`. Those files are an existing baseline to be
reviewed against this plan and corrected in place — not recreated and not
superseded by a parallel implementation. Where this plan and the merged files
disagree on the packaging contract, this plan wins; where they disagree on a
platform fact, the merged file wins unless this plan cites a source (see the
collision rule above). The two rules already codified in `packaging/README.md`
(no `ADDRESS_HEADER` in package defaults, nothing required from the user before
the first-run wizard) are part of the Shared Container Contract below. Every
other file named in this document is still net-new.

PR #18 left two discovery questions open; the later submission scan resolved
both successfully without moving either file. Wiring `packaging/check.sh` into
CI remains part of Phase 5.

## Objective

Make Popcorn Vote installable through common home-server application stores
without creating platform-specific application forks or independent runtime
images. Every package must run the published multi-architecture image and keep
the existing browser-based first-run setup.

The first Home Assistant release must be reachable directly on the local network
at `http://homeassistant.local:3000` (or the host IP and selected port). It must
not depend on Home Assistant Ingress, Home Assistant authentication, or access to
the Home Assistant or Supervisor APIs.

## Scope

### Included

- A common packaging layout for Home Assistant, Unraid, Umbrel, and CasaOS.
- Home Assistant repository metadata and a complete first installable app.
- Container startup changes needed for a Supervisor-owned `/data` mount.
- Store metadata for Unraid, Umbrel, and CasaOS.
- Documentation for installation, updates, backups, network access, and
  platform submission.
- Automated checks that keep package metadata aligned with the application.
- Multi-architecture publication for `linux/amd64` and `linux/arm64`.

### Excluded from the first delivery

- Home Assistant Ingress and sidebar embedding.
- Home Assistant authentication or API integration.
- Automatic router configuration or public port forwarding.
- TLS termination inside the Popcorn Vote container.
- A second platform-specific Popcorn Vote image.
- Automatic submission to third-party stores.

Ingress remains separate because the application currently uses root-relative
API and asset URLs and ships a service worker. Supporting the dynamic
`X-Ingress-Path` requires an application-level design and browser testing beyond
packaging work.

## Repository Layout

```text
repository.yaml

packaging/
  README.md            # on main — extend
  check.sh             # on main — extend in place
  test-install.sh      # on main — keep, extend only on contract change
  home-assistant/
    config.yaml
    README.md
    DOCS.md
    CHANGELOG.md
    icon.png
    logo.png
    translations/
      de.yaml
      en.yaml
  unraid/
    popcorn-vote.xml   # on main — correct in place, keep ExtraParams
    ca_profile.xml     # on main — location and schema accepted by the CA scan
  umbrel/
    umbrel-app.yml
    docker-compose.yml
  casaos/
    docker-compose.yml
```

One file is an intentional exception to the packaging directory because the
consuming platform requires it at the root of the Git repository:

- `repository.yaml` — Home Assistant requires it at the root of the repository
  added to the app store. Recursive discovery of the app below it is confirmed
  in Phase 2, "Platform facts (verified)".
No package files should be placed in the existing untracked
`family-movie-night/` directory, and implementation must not modify or add that
directory to version control.

## Shared Container Contract

Every package must use the following values unless a platform forces a naming
translation:

| Property | Value |
| --- | --- |
| Image | `ghcr.io/stadicus/popcorn-vote` |
| Immutable release tag | Version from `package.json` |
| Moving convenience tag | `latest` — referenced only by the Unraid template (documented exception, Phase 3) |
| Image reference form | Home Assistant and CasaOS: `ghcr.io/stadicus/popcorn-vote:<version>`; Umbrel additionally pins `@sha256:<manifest-list digest>`; Unraid: `:latest` |
| Container port | `3000/tcp` |
| Persistent path | `/data` |
| Health endpoint | `/healthz` |
| Architectures | `linux/amd64`, `linux/arm64` |
| Default access | Local network only |
| First-run configuration | Popcorn Vote browser wizard |

The packaged defaults must not set `ADDRESS_HEADER`, `XFF_DEPTH`,
`PROTOCOL_HEADER`, or `ORIGIN` when the application is exposed directly on a
trusted local network. Platform documentation may explain how to set the proxy
variables when a user deliberately puts a trusted reverse proxy in front of the
application.

TMDB and optional OMDb keys remain part of the Popcorn Vote first-run wizard.
They must not be duplicated as mandatory store options.

## Phase 1: Container Runtime Compatibility

1. Add a small POSIX-compatible container entrypoint.
2. When started as root, ensure that `DATA_DIR` exists and that the application
   user can read and write it.
3. Drop privileges to the existing `node` user before starting Node.js.
4. When the operator explicitly starts the container as a non-root user, avoid
   attempting privileged ownership changes and execute the application directly.
5. Preserve the existing command, environment variables, exposed port, volume,
   and health check behavior for Docker and Docker Compose users.
6. Add only the minimal privilege-dropping dependency required by the final
   Alpine image.

The resulting Node.js process must not run as root. Startup must also work with
a newly created root-owned bind mount, which approximates the directory supplied
by the Home Assistant Supervisor.

### Threat model

This phase changes the image's default security posture and must document that
change explicitly before implementation:

a. **What changes.** The Dockerfile currently ends with `USER node`, so today the
   container never starts as root for any consumer. Phase 1 removes that
   directive: the container starts as root by default for every existing Docker
   and Docker Compose user, and drops privileges inside the entrypoint.

b. **What the entrypoint may do while root.** Exactly two operations: create
   `DATA_DIR` if it is missing, and adjust its ownership so the `node` user can
   read and write it. The ownership operation is specified precisely, because
   the choice has both a correctness and a blast-radius consequence: a
   non-recursive `chown` on a pre-existing, populated, root-owned directory
   leaves its contents unwritable, while an unconditional recursive `chown`
   traverses whatever the operator mounted and makes the root window
   proportional to the mount size rather than constant. The entrypoint therefore
   `chown`s `DATA_DIR` itself on every start, and runs a recursive pass **at most
   once ever**, gated on a sentinel file — `${DATA_DIR}/.ownership-migrated` —
   that it writes after the first successful pass, never before it. The trigger is the sentinel's absence, not an ownership
   probe of the directory contents: on Home Assistant the Supervisor writes a
   root-owned `/data/options.json` that coexists with Popcorn Vote data (see
   Phase 2), so "contents not owned by `node`" is true in every normal install
   and would re-trigger the recursive pass on every start. The recursive pass
   must additionally **skip platform-owned files** — at minimum
   `/data/options.json`, which the application is required to ignore anyway and
   which the Supervisor rewrites at will. It must not follow symlinks out of
   `DATA_DIR` when descending. Nothing else
   runs as root — no package installation, no network access, no reading or
   writing outside `DATA_DIR`, no execution of user-supplied content. The
   entrypoint then `exec`s the application through the privilege-drop helper.

c. **Blast radius and fail-closed rule.** The root window is the time between
   container start and the `exec`: a few milliseconds on every start, plus a
   single recursive pass on the very first start after the entrypoint is
   introduced. The sentinel is what makes "once" enforceable rather than
   aspirational — without it the pass would recur on every start on Home
   Assistant. On Unraid the window does not exist at all, because the container
   starts non-root (see Phase 3, "Container user on Unraid"). A compromise of the
   entrypoint script or the privilege-drop helper in that window yields root
   inside the container, which on the Home Assistant Supervisor and on default
   Docker means root over the mounted `/data` and any capability the runtime
   grants the container. The entrypoint must therefore fail closed: if the
   privilege drop cannot be performed, it exits non-zero and the application does
   not start. Falling through and running Node.js as root is forbidden. The
   acceptance criterion "the application process does not run as root after
   initialization" is verified in CI (Phase 5 smoke test step 5).

d. **Why root-then-drop over the alternatives.** The constraint that forces it
   is **Home Assistant specifically**: the Supervisor creates and owns the
   `/data` mount, the package cannot choose the uid the container runs as, and
   the user has no host shell to fix ownership. Three alternatives were
   considered and rejected for that case: keeping `USER node` and documenting a
   host-side `chown` (impossible — no host shell, Supervisor-owned mount); a
   PUID/PGID convention (still requires a root window to change ownership, and
   adds two user-facing options the Home Assistant package explicitly does not
   want); and an init-container pattern (not expressible in a Home Assistant app
   or an Unraid Community Applications template, both of which describe a single
   container). Root-then-drop is the pattern the Home Assistant ecosystem itself
   uses.

   The criterion for skipping root-then-drop is narrower than "the package can
   set a uid": it is **the platform supplies a uid convention the mount already
   follows**. Unraid is the only case — it creates appdata as `nobody:users`, so
   the template's `--user 99:100` matches an ownership that already exists, the
   container starts non-root, and the entrypoint execs directly (see Phase 3,
   "Container user on Unraid").

   Umbrel and CasaOS technically permit a Compose `user:` directive, but neither
   publishes a uid convention for the app-data directory it creates, so any value
   the package picked would be arbitrary and would recreate exactly the
   unwritable-mount problem this phase exists to solve. They therefore keep
   root-then-drop, as does Home Assistant, which cannot set a uid at all. Phase 5
   maps each platform to its path explicitly; this criterion and that mapping
   must stay in agreement.

e. **LAN exposure model, shared by all four stores.** The container serves plain
   HTTP on the local network with no platform authentication in front of it, by
   design (see Objective). Consequences that the package documentation must
   state: any device on the LAN can reach the application; between installation
   and completed first-run setup the setup wizard is unauthenticated, so whoever
   reaches it first can claim the instance — users must complete setup
   immediately after install and on a trusted network; traffic is unencrypted, so
   the port must never be forwarded from the router, and remote access goes
   through a VPN.

## Phase 2: Home Assistant Package

### Repository metadata

Add root-level `repository.yaml` with the repository name, project URL, and
maintainer information required by Home Assistant.

### App configuration

Create `packaging/home-assistant/config.yaml` with at least the following design:

- name `Popcorn Vote` and a stable `popcorn_vote` slug;
- version matching the immutable image tag, bumped only after that tag is
  pullable (see Phase 4, Release ordering);
- `amd64` and `aarch64` architecture declarations;
- generic multi-architecture image name
  `ghcr.io/stadicus/popcorn-vote`;
- `3000/tcp` published as host port 3000 by default and editable through the
  Home Assistant network settings;
- `webui: http://[HOST]:[PORT:3000]`;
- watchdog URL ending in `/healthz`;
- automatic boot as an application service;
- `backup: cold` for a consistent SQLite snapshot;
- no options schema because setup belongs to Popcorn Vote;
- experimental stage for the initial release;
- no Ingress, host network, Home Assistant API, Supervisor API, devices,
  privileged capabilities, or unrelated directory mappings.

The Home Assistant `/data/options.json` file may coexist with Popcorn Vote data.
Popcorn Vote reads its own `/data/config.yaml` explicitly and must ignore the
Supervisor file.

### Platform facts (verified)

Two load-bearing platform behaviours carry the repository layout and the Phase 4
release workflow changes. Both are resolved against the current official Home
Assistant developer documentation
(<https://developers.home-assistant.io/docs/apps/configuration/>, checked
2026-08-15) rather than assumed:

1. **Recursive app discovery — supported.** The Supervisor scans an app
   repository recursively for `config.yaml`, so
   `packaging/home-assistant/config.yaml` is discovered two directory levels
   deep even though the repository root also carries the full application tree.
   The layout in the Repository Layout section therefore stands. One
   check remains, because it is repository-specific rather than a platform
   question: no other `config.yaml` in the tree (application fixtures, packaging
   files, test data) may be misdetectable as a second app. If a collision
   exists, resolve it by narrowing the conflicting filename, not by moving the
   app.

   This is **not** a one-time implementation check. A fixture added six months
   from now would re-create the collision silently, and the Supervisor would
   publish it as a second app. `packaging/check.sh` therefore enforces it as a
   standing invariant: any store-discoverable file (see "recognized package
   file" in Phase 5) outside the canonical package paths is a hard failure. The
   fix is always to rename or reshape the offending file, never to suppress the
   check.

2. **Generic multi-architecture image — supported, labels required.** The
   Supervisor accepts a single generic multi-architecture manifest image
   (`ghcr.io/stadicus/popcorn-vote`) without the `{arch}` naming scheme. Because
   this image is built by the project's own release workflow rather than by
   `home-assistant/builder`, the `io.hass.version`, `io.hass.type`, and
   `io.hass.arch` labels are **required**, not optional. The Phase 4 label work
   is therefore unconditional. The per-architecture `{arch}` naming scheme is
   not a fallback for this plan: supporting Supervisor versions old enough to
   need it is not a requirement of this delivery, and the first release targets
   current Home Assistant OS.

Where this plan asserts a platform requirement, the assertion carries its source.
Implementation applies the same standard to the Unraid claims it acts on
(the absence of an architecture field in the template schema and update behavior
through a moving tag). The successful submission scan recorded in
`packaging/README.md` is the observed source for nested template and maintainer
profile discovery.

### Presentation and documentation

- Provide an app icon and logo derived from existing project artwork.
- Provide English and German network descriptions.
- Explain installation of the custom repository and opening the web UI.
- Document `homeassistant.local`, direct IP, and custom host-port access.
- State that users must not forward the direct HTTP port from their router.
- Recommend a VPN for remote access.
- Explain that plain HTTP on a trusted LAN does not provide transport
  encryption and that reliable PWA installation generally requires HTTPS.
- Document startup, update, backup, restore, and uninstall behavior.
- Document the ownership self-heal and how to re-arm it. The entrypoint adopts
  `/data` once and records that in `/data/.ownership-migrated`; it does not run
  again while that marker exists. If `/data` contents are replaced or re-owned
  from outside the container — copying a backup in as root on plain Docker is
  the realistic case — the application fails with permission errors and the
  self-heal stays off silently. The fix is one line for the user: delete
  `/data/.ownership-migrated` and restart, which re-runs the one-time migration.
  This belongs in the Docker/Compose documentation as well, not only in the
  Home Assistant app docs.
- State explicitly that the first release does not support Ingress.
- Add a `home-assistant/` row to the store-package table in the existing
  top-level `packaging/README.md`, which today carries a single `unraid/` row
  (status `shipped`). The row describes how this package ships — discovered by a
  custom Home Assistant repository scan, not submitted as a pull request to an
  upstream store — consistent with how the `unraid/` row describes its delivery
  mechanism. Umbrel and CasaOS get their rows when their packages land.

## Phase 3: Remaining Platform Packages

### Unraid

`packaging/unraid/popcorn-vote.xml` (Community Applications template),
`packaging/unraid/ca_profile.xml` (maintainer profile), `packaging/README.md`,
`packaging/check.sh`, and `packaging/test-install.sh` already exist on branch
`main` (squash commit `0bf3f08`) — see "Existing baseline" in the Status
section. Implementation corrects them in place through ordinary follow-up pull
requests, against `main` as it stands at that moment.

**Preserve the uid fix.** The corrections below touch the same template the
branch already fixed. `<ExtraParams>--user 99:100</ExtraParams>` and its
explanatory comment must survive the rewrite unchanged — see "Container user on
Unraid" below. A "correct in place" pass that silently drops it reintroduces the
`EACCES` crash-loop that fix removed.

Required corrections to the committed baseline:

- **Moving tag — deliberate Unraid exception, keep `:latest`.**
  `packaging/unraid/popcorn-vote.xml` sets
  `<Repository>ghcr.io/stadicus/popcorn-vote:latest</Repository>`, and it keeps
  it. Unraid's update model is structurally different from the other three
  stores: dockerMan copies the template to the user's flash drive at install
  time and detects updates by comparing the local against the remote digest of
  the **referenced tag**. A repo-side tag bump therefore never reaches an
  existing install, and a pinned immutable tag never changes digest — every
  Unraid user would be frozen at the version they installed, with no update
  indicator. Home Assistant, Umbrel, and CasaOS propagate updates through store
  metadata refresh, so pinning is correct there and stays mandatory. This is why
  effectively every mature Community Applications template (linuxserver, binhex,
  hotio) references a moving tag. The exception is recorded in the Shared
  Container Contract table and scoped out of the Phase 5 pinning check.
- **Profile location and schema — verified.** The Community Applications
  submission scan reported that `ca_profile.xml` was found and its profile
  content extracted at `packaging/unraid/ca_profile.xml`. Keep the accepted
  location and `<Maintainer>` schema.
- **Architecture handling.** The public Unraid Community Applications template
  XML schema has no architecture field, so the template cannot declare supported
  CPU architectures. Multi-architecture compatibility comes from the published
  image's OCI manifest instead: document `linux/amd64` and `linux/arm64` in the
  template's description prose and in `packaging/README.md`, and verify the claim
  by inspecting the published manifest (Phase 5) rather than by validating a
  non-existent XML field.

The template must additionally:

- use the published image at the moving `latest` tag, per the documented
  Unraid exception above — not a pinned release tag;
- expose container port 3000 with a configurable host port;
- map a user-selected persistent directory to `/data`;
- link to the project documentation, source, icon, and support location;
- describe the optional environment variables without requiring them;
- avoid privileged mode and unnecessary host paths;
- default to a local-network Web UI URL.

- **Container user on Unraid — keep `--user 99:100`.** The template passes
  `<ExtraParams>--user 99:100</ExtraParams>`, and it keeps it. This is a
  deliberate decision, not an accident of the baseline: Unraid creates appdata
  as `nobody:users` (99:100), and every other container on that share follows
  the same convention, so the operator's backup tooling and file access keep
  working. `packaging/test-install.sh` encodes this as a contract by asserting
  that `popcornvote.sqlite` ends up owned `99:100`.

  Consequence for Phase 1: on Unraid the container starts as 99:100, which is
  non-root, so it takes Phase 1 step 4's direct-exec path. The entrypoint
  performs no ownership change and there is no root window on Unraid at all —
  the mount is already owned by the user the process runs as. Root-then-drop is
  required for Home Assistant, where the Supervisor owns the `/data` mount and
  the package cannot choose the uid. It is not required only where the platform
  supplies a uid convention the mount already follows — Unraid alone. Umbrel and
  CasaOS permit a Compose `user:` directive but publish no such convention, so
  they keep root-then-drop; see Phase 1(d). Removing the flag would make the entrypoint `chown`
  a user's appdata directory to uid 1000, against Unraid convention and against
  what `test-install.sh` asserts.

- **Template discovery — verified.** The submission scan accepted the nested
  `packaging/unraid/popcorn-vote.xml`. Keep its path and `TemplateURL`.

Keep the successful discovery result and update mechanism recorded in
`packaging/README.md`.

The external submission step is the Community Applications submission portal at
<https://ca.unraid.net/submit>, which is the current source of truth (checked
2026-08-15; see also the official starter repository
<https://github.com/unraid/unraid-community-apps-starter>). The procedure is
Validate, then Scan, then submit the repository through the portal — not a
forum post or a direct appFeed registration with a maintainer, which is the
obsolete process. `packaging/README.md` on `main` already documents this portal flow — that
correction landed upstream and needs no repeat. Verify it still reads correctly
when extending the file. Performing the submission itself requires explicit
authorization under Autonomous Execution Boundaries.

### Umbrel

Create `packaging/umbrel/umbrel-app.yml` and its matching
`packaging/umbrel/docker-compose.yml` as review-ready sources for an upstream
`getumbrel/umbrel-apps` contribution.

The pair must:

- pin the image by multi-architecture digest, not by tag alone: image references
  take the form `ghcr.io/stadicus/popcorn-vote:<version>@sha256:<digest>`, where
  the digest is that of the multi-architecture manifest list (not of a single
  architecture's image). Umbrel's upstream review expects digest-pinned images;
  an immutable version tag on its own does not satisfy it;
- use Umbrel's expected app-network and Web UI conventions;
- persist `/data` in the platform-provided app data directory;
- expose only the application HTTP port;
- include health checking where supported;
- contain no secrets or sample API keys.

Do not open an upstream pull request without explicit authorization.

### CasaOS

Create `packaging/casaos/docker-compose.yml` using the CasaOS Compose extension
metadata expected by its application installer.

It must:

- use the same immutable image release as the Home Assistant and Umbrel
  packages — pinned to the version tag, not `latest` (the moving-tag exception
  is Unraid's alone);
- provide title, description, icon, Web UI, architecture, and category metadata;
- publish a configurable host port for container port 3000;
- persist the platform's application data directory at `/data`;
- avoid elevated privileges and unrelated mounts.

Document whether the file is intended for direct Compose import, a custom app
store, or a later upstream submission.

## Phase 4: Versioning and Publication

Versioned store packages must point to an image tag that already exists or is
published as part of the same controlled release. They must not claim that a
moving `latest` image is an immutable store release. This applies to Home
Assistant, Umbrel, and CasaOS. The Unraid template is the one documented
exception (Phase 3): it deliberately references the moving tag, because that is
how Unraid delivers updates at all, and it therefore does not advertise a
version at all.

Because `v1.2.0` already exists and its image lacks the planned Home Assistant
runtime metadata, the first supported Home Assistant and CasaOS packages ship
with `v1.3.0`. Umbrel remains on its already-submitted `v1.2.0` metadata until
that same release exists, then moves to the v1.3.0 manifest-list digest alongside
the other two stores. The bootstrap sequence below makes that binding rather
than provisional: no new store-discoverable metadata reaches `main` before the
image is published.

The `io.hass.*` labels are **required** for this image, because it is built by
the project's own release workflow rather than by `home-assistant/builder` — see
Phase 2, "Platform facts (verified)", item 2. This label work is unconditional.

Implementation must update the release workflow so each architecture build
receives:

- the application version as the Home Assistant build version;
- `amd64` for `linux/amd64` and `aarch64` for `linux/arm64` as the Home Assistant
  architecture label;
- the existing source commit argument used for the displayed application
  version.

The final architecture-specific images must then carry valid Home Assistant image
labels before they are combined into the generic multi-architecture manifest.
Ordinary Docker consumers continue to use the same image.

### Release ordering

The release procedure must never advertise a store version before its image tag
can be pulled. Because the store metadata lives on `main` in the same repository
the release workflow publishes from, the mechanism is fixed here, as one ordered
sequence, rather than left to implementation. With v1.2.0 now the baseline, the
first release bootstraps in two repository merges around one publication:

1. **Runtime and release-preparation merge.** Merge the Phase 1 entrypoint
   change, the Phase 4 release workflow and v1.3.0 version changes, and the Phase
   5 checks to `main` — but **not** the store-discoverable metadata for the
   platforms that have not shipped yet. Non-discoverable metadata templates may
   land here because no store scanner treats their filenames as packages.

   Note the starting point, which is no longer a clean slate: **the Unraid
   packaging is already on `main`** (squash commit `0bf3f08`, see "Existing
   baseline"). `packaging/README.md`, `packaging/check.sh`,
   `packaging/test-install.sh`, `packaging/unraid/popcorn-vote.xml`, and
   `packaging/unraid/ca_profile.xml` are merged, uncorrected. The split below
   therefore governs only what is still net-new:

   | File | Merge | Reason |
   | --- | --- | --- |
   | `packaging/check.sh` extensions | step 1 | Validation tooling, discovered by no store |
   | `packaging/test-install.sh` changes | step 1 | Store-install test, discovered by no store |
   | `packaging/README.md` extensions | step 1 | Documentation, discovered by no store |
   | Dockerfile, entrypoint, `release.yml`, `ci.yml` | step 1 | Runtime and workflow, no store metadata |
   | `packaging/unraid/*` corrections | step 1 | Already on `main`; corrections make it *less* wrong, so they must not wait |
   | `repository.yaml` | step 3 | Root file the Home Assistant Supervisor scans |
   | `packaging/home-assistant/config.yaml` | step 3 | The app definition itself |
   | `packaging/umbrel/*`, `packaging/casaos/*` | step 3 | Pinned to the published tag/digest |

   The Unraid corrections deliberately sit in step 1 rather than step 3. Holding
   them back would leave the already-merged, already-live template uncorrected
   for longer with nothing gained: Unraid advertises no version (it pins
   `:latest` by design), so correcting it cannot advertise an unpublished image.
   The step-1/step-3 boundary exists to stop a **version claim** reaching a store
   before its image is pullable — Unraid makes no such claim.

   After step 1, no store that advertises a version can discover a Popcorn Vote
   package, which is what prevents the plan's own contradiction of advertising
   `v1.1.0` — an image that predates the entrypoint and the `io.hass.*` labels
   and must never be referenced by a versioned store package.
2. **Publish.** Run the separately authorized release workflow. It builds both
   architectures with the new labels and
   combines them with `imagetools create` into the multi-architecture manifest,
   publishing `ghcr.io/stadicus/popcorn-vote:1.3.0` and refreshing `:latest`.
   The workflow makes a retried, best-effort inspection of the resulting
   manifest-list digest, recording it in the job summary and a machine-readable
   `release-metadata-1.3.0` artifact for step 3. Registry-read, summary, or
   artifact-service failures cannot veto the GitHub release after the immutable
   image tag exists.
3. **Metadata merge.** Only now merge the store metadata, pinned to the verified
   `1.3.0` tag and — for Umbrel — its manifest-list digest. Discovery and
   advertisement begin at this merge, at which point the referenced image is
   already pullable.

Every subsequent release repeats steps 2 and 3 in that order: publish first,
then bump the store metadata in a **separate pull request opened after the
release workflow run has succeeded**. The bump is not an automated commit pushed
by the workflow — the release is started manually today, and an automated
push-to-`main` step would add a second, unreviewed write path to the branch. The
follow-up pull request is the chosen mechanism.

Consequences that implementation must respect:

- **`package.json` is ahead of the store metadata between steps 2 and 3.** That
  is the normal steady state, not a drift error. The Phase 5 consistency check
  must therefore not compare package metadata against `package.json`. It compares
  each package file's image reference against the registry: the referenced tag
  (and digest, where pinned) must resolve. A store metadata version behind
  `package.json` passes; a store metadata version whose image does not resolve
  fails.
- **The publication gate fails closed.** Ordinary pull-request runs of
  `packaging/check.sh` may skip registry-dependent checks when the registry is
  unreachable (see Phase 5). Publication merges must not: they run the registry
  checks in a required, non-skipping mode, so a registry outage turns the pull
  request red instead of waving it through. Whether red actually *blocks* the
  merge depends on the required-status-check configuration described in Phase 5
  — the active ruleset does not yet require that check, so until it is added the
  block is the operator declining to merge red, not the platform refusing it.
  The trigger is mechanical, not a label —
  it is any pull request that adds or changes the effective image reference of a
  recognized package file (Phase 5), which covers the step-3 bootstrap merge and
  every routine version bump after it alike.
- The release must not silently fall back to `latest` for any store that pins
  (Home Assistant, Umbrel, CasaOS). Unraid's deliberate exception is documented
  in Phase 3.

### Rollback and remediation

Home Assistant offers no downgrade path for apps from a custom repository, so a
defective release cannot be undone by reverting metadata:

- Published version tags are never moved, retagged, or deleted. Repointing a tag
  would change what already-installed users receive on their next update and
  breaks the immutability the Shared Container Contract promises.
- A defective release is remediated only by publishing a fixed higher patch
  version and bumping the store metadata to it, following the release ordering
  above.
- The package documentation (Phase 2) must tell users how to recover in the
  meantime: update to the fixed version once published, or restore the Home
  Assistant backup taken before the update.

## Phase 5: Automated Verification

### Metadata checks

`packaging/check.sh` is already on `main` and covers four checks today: XML
well-formedness; that environment-variable names used in the templates are known
to the application; that the port and data path match the container (derived
from `docker-compose.yml`); and that `ADDRESS_HEADER` is absent from package
defaults. Extend that script in place — do not add a second, competing
validation script. Read the file for its current coverage before assuming this
list is complete.

Checks still missing from `packaging/check.sh` and to be added:

- required files exist, including root-level `repository.yaml` once Home
  Assistant ships, and required platform fields are present. Unraid requires
  the scan-accepted `packaging/unraid/ca_profile.xml`;
- package versions across the store files agree with each other and are never
  newer than `package.json`. This is deliberately not an equality check against
  `package.json`: between steps 2 and 3 of the Phase 4 release ordering the store
  metadata lags by design, and a lagging-but-resolvable version must pass;
- image repository names are identical across all packages;
- image references are pinned for Home Assistant, Umbrel, and CasaOS: none of
  them references the moving `latest` tag, and the Umbrel package additionally
  references a multi-architecture manifest digest. The Unraid template is
  exempt by design and is instead checked for the opposite: that it does
  reference the moving tag, so the exception cannot be silently lost in a later
  edit;
- the image reference named in each package file resolves in the registry
  (enforces the Phase 4 release ordering);
- container ports are 3000 and persistent container paths are `/data` — already
  covered today by the compose-derived check, to be extended to every package
  format rather than written anew;
- health endpoints use `/healthz` where the platform supports them;
- architecture coverage: for Home Assistant and any other format with an
  architecture field, that `amd64` and `aarch64` are declared in the platform's
  spelling; for Unraid, which has no architecture field in its template schema,
  that the published image's OCI manifest list contains `linux/amd64` and
  `linux/arm64`;
- no package enables privileged mode, host networking, or broad host mounts;
- Home Assistant Ingress and API access remain disabled;
- no store-discoverable file exists outside the canonical package paths. This
  is the standing form of the Phase 2 collision check: any file matching the
  "recognized package file" definition below — an app-shaped `config.yaml`, a
  `<Container>`-rooted XML, a Compose file carrying store metadata — that sits
  outside `packaging/<store>/` (or a documented root exception) is a hard
  failure. It runs on every pull request, not once at implementation time, so a
  fixture added later cannot silently become a second discoverable app;
- no placeholder credentials or real secrets are present.

Where package formats are YAML, parse them as YAML rather than matching text.
Keep platform-specific semantic checks separate from the cross-platform
invariants so failures identify the actual contract that drifted.

`packaging/check.sh` is not wired into CI today. Wiring it in is in scope for
this implementation: add it as a job or step in `.github/workflows/ci.yml` so it
runs on every pull request, resolving the open question left in PR #18.

**A red check must actually block.** `main` has an active repository ruleset
requiring pull requests and preventing deletion and non-fast-forward updates,
but it does not yet require a status check. A failing `ci.yml` job therefore
still stops nothing by itself. That matters here more than for an ordinary lint
failure: the fail-closed registry gate below is the only thing standing between
a registry outage and store metadata advertising an image nobody proved exists,
and this plan's own standard for that gate is mechanical enforcement, not a
remembered convention.

Wiring `check.sh` into CI therefore includes a uniquely named
**`Packaging publication gate`** job for pull requests. Its skip-allowed push
counterpart is named `Packaging branch validation`, so a ruleset cannot confuse
the two event modes. Make `Packaging publication gate` a required status check
on `main`. Configuring that ruleset entry is an operator action and falls under
Autonomous Execution Boundaries: propose it, do not apply it unasked.

Until that protection exists, the honest statement of the guarantee is weaker
and the plan says so rather than overclaiming: a failed registry check **fails
the pull request's checks, and the operator must not merge it red**. Every
"blocks the merge" phrasing in Phase 4 and below is conditional on the required
status check being configured.

Two skip rules keep this from deadlocking the Phase 4 bootstrap. Both are
load-bearing, because `.github/workflows/release.yml` blocks publication on a
successful `ci.yml` conclusion for the release commit — a red `ci.yml` on `main`
makes step 2 unreachable and the release impossible:

- **Absent package files are an explicit SKIP, not a failure.** Between Phase 4
  step 1 and step 3, `repository.yaml`, `packaging/home-assistant/config.yaml`,
  and the Umbrel and CasaOS files are deliberately not on `main`. Every
  per-package check — required files and
  fields, pinning, the inverted Unraid moving-tag check, port and path checks —
  therefore reports SKIP with a named reason when its package or metadata file is
  wholly absent, and fails only on content that is present but malformed. A
  package that exists must be correct; a package that does not exist yet is not
  an error. This is what keeps `ci.yml` green on `main` between steps 1 and 3 so
  that the release gate passes for step 2.
- **Registry-dependent checks skip on an unreachable registry.** Image reference
  resolution and manifest inspection degrade to a skip with an explicit message,
  so ordinary pull requests do not fail on network conditions. The one exception
  is the metadata-merge pull request of Phase 4 step 3, where those same checks
  run in a required, non-skipping mode, so a registry outage turns that pull
  request red. It blocks the merge once the required status check above is
  configured on `main`; until then it is the operator who must not merge red.

  That exception needs a mechanical trigger, not a convention: `ci.yml` runs
  `packaging/check.sh` identically on every pull request and cannot otherwise
  tell which one is a publication merge. The trigger is the diff itself: the
  registry checks run as required, and may not skip, whenever a pull request
  **adds or changes the effective image reference of any recognized package
  file** — required or not, first publication or later bump.

  **"Recognized package file" is defined by store discovery semantics, not by a
  path list.** A fixed list of canonical paths would be exactly the wrong shape,
  because the stores do not read paths — they scan. A file is a recognized
  package file if a store scanner would treat it as a package:

  - any YAML anywhere in the tree shaped like a Home Assistant app `config.yaml`
    (a `slug` plus an `image` or `version` key) — the Supervisor scans
    recursively;
  - any XML anywhere in the tree with a Community Applications `<Container>`
    root — the CA scan indexes the repository, not one directory;
  - any Compose file anywhere in the tree carrying Umbrel or CasaOS store
    metadata.

  Discovery is what creates the risk, so discovery is what defines the scope. A
  fixture or test-data `config.yaml` that happens to be app-shaped is recognized
  precisely because the Supervisor would recognize it too.

  "Effective image reference" is deliberately broader than the image string. For
  Home Assistant the pulled tag comes from `config.yaml`'s separate `version:`
  field, so that field is part of the reference; for Umbrel it includes the
  `@sha256:` digest; for Unraid it is the `<Repository>` element. A change to any
  of them is a change to what users would pull.

  The trigger keys on the **package file**, not on the required-packages list,
  and that is the point. Keying it on list membership left two holes:

  - a later release bumps only a version or digest of a package that is already
    on the list, adding no list entry; and
  - a pull request adds a whole new package file without its list entry, so the
    package is neither newly-required nor already-required.

  Both publish an image reference no one proved resolvable. Keying on the file
  closes both, and the required-packages list keeps its own separate job
  (absent-file SKIP vs. FAIL, below).

  The two rules reinforce each other through one invariant: **a package file
  present in the tree must have a required-packages entry.** `packaging/check.sh`
  enforces that directly — a package file without its entry is a hard failure,
  not a skip — so the second hole above cannot even be merged, quite apart from
  the registry trigger catching it. Both conditions are computable from the diff
  against the merge base, so neither needs a human to remember a flag. One
  implementation detail matters: `ci.yml`'s `actions/checkout` steps use the
  default shallow fetch, which need not contain the merge base. The job that
  computes this diff must fetch enough history (or use the pull-request base SHA
  the event payload provides) — otherwise the diff silently comes out empty and
  the trigger never fires, which fails open.

  Push-event runs use ordinary skip-allowed registry mode. The image reference
  was proven in the pull request; a transient registry failure on the post-merge
  `main` run is recoverable by rerunning CI and must not permanently block the
  manual release gate. Direct pushes to `main` are excluded by the required
  branch-protection rule below.

**The absent-file SKIP must expire.** A permanent may-be-absent rule is a
checking hole: once a package has shipped, a deleted or renamed
`repository.yaml` or `packaging/home-assistant/config.yaml` would keep merging
green forever and break store discovery for every installed user. Log output is
not a mitigation — nobody reads a green run. `packaging/check.sh` therefore
carries an explicit **required-packages list**, versioned with the tree:

- A package **absent from the tree and absent from the list** is SKIP — it has
  not shipped yet.
- A package **present in the tree must be on the list.** A package file without
  its list entry is a hard failure, never a skip. This is the invariant the
  registry trigger above leans on, and it is what stops a new package from being
  merged into a publishable state while unlisted.
- **Seeding.** The change that introduces the presence invariant must seed the
  list, in the same commit, with every package already shipped in the tree at
  that moment. Today that is the Unraid package: `packaging/unraid/*` is on
  `main` (commit `0bf3f08`) and never passes through a step-3 metadata merge, so
  without seeding, the step-1 pull request that adds the list mechanism would
  hard-fail its own new check and leave `ci.yml` red on `main` — blocking the
  release gate the whole bootstrap depends on. Unraid is therefore
  FAIL-if-absent from step 1 onward.
- The Phase 4 step-3 metadata merge adds each **net-new** package it ships to the
  list **in the same commit** that adds the package files, flipping it to
  **FAIL-if-absent**. That path governs Home Assistant, Umbrel, and CasaOS.
- The same-commit rule binds the step-3 **merge diff against `main`**, not a
  branch's commit history: a development branch that already carries a package
  file must carry its list entry alongside it, and both migrate into the step-3
  pull request together. Otherwise the presence invariant would hard-fail every
  intermediate commit on the implementing branch.
- After the flip, a missing required file is a hard CI failure, not a skip.

This keeps `ci.yml` green between steps 1 and 3 without leaving the checks
toothless afterwards. The registry skip stays unconditional, because a registry
outage is an environment fault rather than a repository state — except in the
step-3 merge, where it is required as described above.

Both skip paths must print what was skipped and why.

### Container smoke test

Extend CI to:

`packaging/test-install.sh` is already on `main` and has grown into
a full store-install journey test: it creates a data directory owned `99:100` the
way an app store would, starts the container with `--user 99:100`, and asserts
that it comes up, serves `/healthz`, lands on the setup wizard, completes
first-run setup through the API, stops offering setup afterwards, survives
restart and update with its data intact, follows a changed host port, and
restores from backup. Read the file for its current coverage before changing it.

Keep it as its own script rather than folding it into the sequence below. The
two overlap in steps but not in contract: `test-install.sh` exercises a
**platform-supplied uid on a platform-owned directory** — the Phase 1 step-4
direct-exec path — while the sequence below exercises a **root-owned directory
the entrypoint must adopt**, the Phase 1 step-2/3 path.

Which platform takes which path: **Unraid** is the only one that selects a uid
explicitly, through the template's `--user 99:100`, so it is the step-4 case and
`test-install.sh` is its test. **Home Assistant** cannot select one at all — the
Supervisor owns the mount — so it is the step-2/3 case. **Umbrel and CasaOS**
neither require nor set a Compose `user` in their package formats, so they take
the step-2/3 root-then-drop path by default; the plan does not add a `user`
directive for them, because there is no ownership problem to solve where the
platform lets the container create its own data directory. The overlap
in assertions (setup, restart, persistence) is deliberate: the same journey has
to hold on both paths, and a regression on one path is invisible from the other.
Where an assertion is genuinely identical, factor it into a shared helper both
scripts call rather than deleting it from either.

Extend `test-install.sh` only where the store contract changes.

`test-install.sh` defaults `IMAGE` to the published
`ghcr.io/stadicus/popcorn-vote:latest`. CI must override it with the production
image built in the same run — otherwise a pull request tests the previously
published image and its own regression merges green. The registry default stays
for local use, where testing the published image is the point.

Run the sequence below for **both** published architectures, each on a native
runner: `linux/amd64` on `ubuntu-latest` and `linux/arm64` on `ubuntu-24.04-arm`.
This matches `.github/workflows/release.yml`, which already builds one
architecture per native runner precisely because better-sqlite3's musl source
compile takes a multiple of the time under emulation — a cost the smoke test
would otherwise pay on every pull request while verifying less than a native run
does. QEMU via `docker/setup-qemu-action` is the fallback only if native ARM64
runners are unavailable to CI. Building both architectures but exercising only
one leaves the ARM64 image unverified, and ARM64 is the architecture most Home
Assistant OS installations actually run.

1. Build the production image.
2. Create an isolated root-owned data directory.
3. Start the image with that directory mounted at `/data`.
4. Wait for `/healthz` and fail with container logs on timeout.
5. Verify that the running Node.js process is not root.
6. Complete first-run setup through the existing setup API using test values.
7. Confirm that configuration and SQLite state were written under `/data`.
8. Restart the container against the same directory.
9. Confirm health and persistence after restart.
10. Remove only the explicitly named test container and temporary directory,
    for each architecture run.

### Existing project checks

Run the established secret scan, formatting, linting, Svelte checks, unit tests
with coverage, production build, browser tests appropriate to the change,
container build, and image security scan. Both release architectures must still
build successfully.

## Phase 6: Home Assistant OS Acceptance Test

Before declaring the Home Assistant package stable, test it on an actual Home
Assistant OS installation:

1. Add the Git repository as a custom app repository.
2. Confirm that Popcorn Vote appears once with the expected icon, documentation,
   version, and experimental status.
3. Install and start the app on the available architecture family, and record
   which one it was.
4. Open it through the Home Assistant Web UI button.
5. Open it from a second LAN device using the hostname or IP and mapped port.
6. Complete first-run setup, including a test TMDB key.
7. Restart the app and Home Assistant and verify persistence.
8. Change the host port in Home Assistant and verify the Web UI link and direct
   access.
9. Create and restore a Home Assistant backup containing the app.
10. Confirm the installed app configuration has `init: false` and the app
    container's PID 1 is the Node.js process running as uid 1000, not root.
11. Inspect logs for permission, health, architecture, and shutdown errors.
12. Verify that no Home Assistant or Supervisor token is available to the app
    unless the platform injects one independently of requested permissions.

Device testing on both architecture families is not realistic for the first
release, so the completion criterion is narrowed rather than faked: full Home
Assistant OS acceptance is required on **at least one** architecture family, and
the other family is covered by the Phase 5 container smoke test, which runs
natively on both architectures.
The untested family stays explicitly outstanding — the app remains at
`experimental` stage, and the app documentation and CHANGELOG name which
architecture family has had a device test and which has not. Promotion out of
`experimental` requires a device test on the remaining family.

If no Home Assistant OS test instance is available to the autonomous
implementation environment, all local and CI work may still complete, but the
plan must report the device test as outstanding rather than infer success.

## Acceptance Criteria

The work is complete when:

- all package definitions satisfy the shared container contract;
- Popcorn Vote is installable from the custom Home Assistant repository, device-
  tested on at least one architecture family and verified by the native Phase 5
  smoke test on the other, with the untested family named as outstanding and the
  app kept at `experimental` stage until it is covered;
- the Home Assistant Web UI button resolves to the effective host port;
- family members can access the application from the LAN without Home Assistant
  accounts;
- first-run setup, restart, update, and backup restore preserve `/data`;
- the application process does not run as root after initialization;
- no package exposes more privileges, ports, or host paths than required;
- normal Docker and Docker Compose installations remain compatible;
- CI and the actual Home Assistant OS acceptance test pass;
- external submission instructions are complete and no new external submission
  occurs without approval; the already-approved Unraid submission remains the
  recorded baseline.

## Autonomous Execution Boundaries

The implementation agent may autonomously inspect and edit repository files,
build images locally, run tests, and prepare review-ready packaging artifacts.
It must preserve unrelated working-tree changes, especially the existing
untracked `family-movie-night/` directory.

Committing, pushing, opening a pull request, publishing images or releases,
adding a repository to a real Home Assistant installation, submitting files to
Unraid, Umbrel, or CasaOS, and configuring branch protection or a
required-status-check ruleset on `main` all require the corresponding explicit
authorization and credentials. The branch-protection change in particular may be
proposed with the exact settings it needs (see Phase 5, "A red check must
actually block") but must not be applied unasked — it changes who can merge what
in this repository. When unavailable, the agent must finish all safe local work and
report the exact remaining external action.

## Review Questions

External review should pay particular attention to:

1. Whether a root-only ownership adjustment followed by an immediate privilege
   drop is acceptable for all target platforms.
2. Whether Home Assistant `cold` backup is the preferred SQLite consistency
   tradeoff for this application.
3. Whether the narrowed acceptance rule is the right trade — device test on one
   architecture family, native CI smoke test on the other, `experimental` stage
   until the second family is device-tested — or whether the release should be
   withheld until both families have passed a device test.
4. Whether the release ordering fixed in Phase 4 — store metadata carries the
   last released version until the multi-arch manifest is published, then a
   follow-up bump — is narrow and explicit enough given the manual release
   workflow, or whether the bump must be automated and gated in the workflow
   itself.
5. Whether the two Phase 2 platform facts (recursive app discovery from
   `packaging/home-assistant/`, and a generic multi-architecture image without
   the `{arch}` naming scheme, with `io.hass.*` labels required) are read
   correctly from the current documentation, and whether dropping the
   per-architecture `{arch}` fallback is acceptable given the Supervisor
   versions users actually run.
6. Whether the Unraid corrections are complete and correctly scoped: the
   scan-accepted nested `ca_profile.xml`, architecture support
   documented in prose plus verified against the OCI manifest rather than
   declared in the template XML, and the deliberate `:latest` exception for
   Unraid alone — including whether a dedicated moving `stable` tag would be
   preferable to `latest` for that purpose.
7. Whether the Phase 1 threat model correctly weighs removing `USER node` — the
   image's current hardening default — against the Supervisor-owned `/data`
   mount that motivates it.
