# App store packaging

One package per store, kept next to the application rather than in separate
repositories. Every package repeats the container's ports, volumes and
environment variables, so they drift the moment `docker-compose.yml` changes and
nobody remembers the copies. Here a single diff shows what has to follow.

**Source of truth is `docker-compose.yml` in the repository root.** When it
gains, loses or renames a variable, every package below has to be checked.

| Directory | Store | How it ships |
|---|---|---|
| `unraid/` | Unraid Community Applications | CA scans this repository and reads the XML directly. Nothing is submitted anywhere; the file here *is* the package. |
| `umbrel/` | Umbrel App Store | Pull request against `getumbrel/umbrel-apps`. What lives here is the source the PR is fed from. |
| `casaos/` | CasaOS / ZimaOS | Pull request against `IceWhaleTech/CasaOS-AppStore`. Must be tested on a real CasaOS instance before submitting. |

## Two rules every package follows

**No `ADDRESS_HEADER`.** The root `docker-compose.yml` sets
`ADDRESS_HEADER=x-forwarded-for`, which is right *behind a reverse proxy*: the
app then reads the client address out of that header. App store installs are
reached directly, and there the header is written by whoever is calling. Setting
it would let anyone hand the app a fresh address on every request and walk
straight through the brute-force brake on the PIN. Left unset, the app uses the
real socket address, which is what an app store install needs. Whoever puts a
proxy in front adds the variable themselves.

**Nothing is required up front.** The app starts with no configuration at all
and asks for PIN, members, both API keys and the languages in the browser. Keys
are still offered as optional fields, because entering them beforehand is
convenient, but no install is blocked on them. This is what Umbrel's app store
standard asks for: understandable from the browser after install, with no shell
and no file editing.

## Checking a package after changing the container

```sh
grep -E '^\s+[A-Z_]+:' docker-compose.yml          # variables the container knows
grep -o 'Target="[A-Z_]*"' packaging/unraid/*.xml  # variables the package sets
```
