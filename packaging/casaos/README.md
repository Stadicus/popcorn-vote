# CasaOS package source

`docker-compose.template.yml` is the reviewed source for the CasaOS package.
Every release materializes `docker-compose.yml` from it as a directly
importable package pinned to that release's image digest.

The result supports direct import through CasaOS **Install a customised app**
and is also shaped for a later contribution to the official CasaOS/ZimaOS app
store. A real CasaOS install test is required before any upstream submission,
and submission needs separate authorization.

The default host port is 3000 and can be edited in CasaOS. Persistent state
lives below `/DATA/AppData/$AppID/data`. The package exposes no other port,
mount, capability, or privileged mode. Complete the unauthenticated first-run
wizard immediately on a trusted LAN; never forward the plain-HTTP port from a
router, and use a VPN for remote access.
