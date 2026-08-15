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

Umbrel (`getumbrel/umbrel-apps`) and CasaOS (`IceWhaleTech/CasaOS-AppStore`) are
planned and not packaged yet. Both take the package as a pull request against
the store's own repository; what would live here is the source those PRs are fed
from. CasaOS additionally requires the package to be tested on a real CasaOS
instance before submitting.

## How the Unraid package reaches users

Community Applications reads the XML out of this repository, so the file here
*is* the package and updating it updates the listing. Getting into the CA
catalogue in the first place is a separate, one-time step: the repository has to
be submitted at `ca.unraid.net/submit`, where a scan validates the templates and
a moderator reviews the entry. Only users who paste the raw repository URL into
Unraid's Docker tab by hand can install it without that, and almost nobody finds
an app that way.

`unraid/ca_profile.xml` carries the maintainer profile CA shows next to the app.
The convention places it at the root of the registered template repository, and
whether CA finds it one directory down is the open question of this packaging —
to be answered by the submission scan, not by guessing. If the scan does not see
it, the file moves to the repository root; the template itself is unaffected
either way.

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
bash packaging/check.sh         # static: names, port, data path, XML
bash packaging/test-install.sh  # runs the container the way a store would
```

`check.sh` compares what the packages set against `docker-compose.yml` and the
application source. It verifies exactly four things, and nothing beyond them:
XML well-formedness, that every variable name a package sets is read somewhere
in `src/`, that the port and data path match the compose file, and that no
package sets `ADDRESS_HEADER`.

`test-install.sh` needs Docker and no Unraid. It creates the data directory with
the ownership a store would give it, starts the container as the package
describes, and checks what somebody who clicked install actually gets: that it
stays up, answers `/healthz`, reports healthy, lands on the setup wizard, can
complete setup, then stops offering it, survives an update and a restart, works
on another host port, and comes back from a copied data directory. Two runs may
overlap; names, ports and temporary files carry the PID.

Umbrel commonly runs on a Raspberry Pi, so the arm64 half of the image is worth
the same attention:

```sh
docker run --privileged --rm tonistiigi/binfmt --install arm64
PLATFORM=linux/arm64 bash packaging/test-install.sh
```
