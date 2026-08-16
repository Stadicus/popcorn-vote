# Popcorn Vote for Home Assistant

## Install and set up

Add `https://github.com/Stadicus/popcorn-vote` as a custom app repository in
Home Assistant, select **Popcorn Vote**, install it, and start it. Open the web
interface immediately and complete the browser wizard with the first
administrator, family members, voting rules, and the TMDB and optional OMDb
keys.

The initial wizard is unauthenticated. Install only on a trusted network and
finish setup before another device can claim the instance. Afterwards Popcorn
Vote protects access with its own rate-limited PIN accounts; Home Assistant
accounts are neither required nor accepted by the app.

## Network access

The default address is `http://homeassistant.local:3000`. You can also use the
Home Assistant host's IP address, for example `http://192.168.1.20:3000`. If you
change the host port in the app's **Network** settings, use that port instead;
the **Open Web UI** button follows the effective mapping automatically.

The app serves plain HTTP directly to the LAN. Any device on that LAN can reach
it, traffic is not encrypted, and Home Assistant Ingress is not supported in
this release. Never forward this port from the router. Use a VPN for remote
access. Reliable PWA installation generally needs HTTPS, which can be supplied
by a trusted reverse proxy outside this package.

## Start, update, backup, and restore

The app starts automatically after Home Assistant. Updates appear when this
custom repository publishes a newer package version. Home Assistant stops the
app for a cold backup so its SQLite database and related files form one
consistent snapshot. Restore that backup through Home Assistant before starting
the app again. Uninstalling removes the app; keep a backup first if the family
history should survive.

The container adopts the Supervisor-owned `/data` directory once, leaves
`/data/options.json` under Supervisor ownership, and records completion in
`/data/.ownership-migrated`. If data is restored outside Home Assistant and
copied in as root, remove that marker and restart the container to re-run the
one-time ownership migration. Normal Home Assistant backup restore needs no
manual ownership action.

Published images are tested natively on AMD64 and ARM64. This experimental
package additionally completed a Home Assistant OS device test on
`__HA_TESTED_ARCH__`; `__HA_UNTESTED_ARCH__` remains the outstanding device
family. Promotion from experimental waits for that second device test.

If an update is defective, restore the backup taken before it and install the
next fixed version when available. Published image tags are immutable and are
never silently repointed to older content.
