# Example: a complete installation

Step by step from an empty folder to the app on a phone, with Docker Compose and
a reverse proxy in front of it. Every name is a placeholder:
`popcornvote.example.com` is your domain, `8300` a free port on your server,
`/srv/popcorn-vote/data` a folder it may write to. What the individual settings
mean is explained in the [manual](../DOCUMENTATION.md); how to get the API keys
is in the [README](../README.md#quick-start-the-details-are-in-the-manual).

This is one way, not the way. Whatever runs Docker will do, a home server, a
network storage box, a mini PC, a rented machine. Graphical container managers
take the same compose file; where this guide says "run this", they say "paste
this into the editor and press Deploy".

The ready-made image covers both processor families: Intel and AMD
(`linux/amd64`) as well as the ARM chips in many network storage boxes and small
home servers (`linux/arm64`). Docker pulls whichever fits the machine, so the
`image:` line below works either way.

## 1. Preparation

1. **Get the access keys:** a TMDB key (v3, the 32-character "API key", not the
   long "read access token") and an OMDb key.
2. **Create the folder** the app is to keep its data in, for example
   `/srv/popcorn-vote/data`, and make it writable for UID/GID `1000`, the
   non-root user inside the container:

   ```sh
   sudo mkdir -p /srv/popcorn-vote/data
   sudo chown 1000:1000 /srv/popcorn-vote/data
   ```

   Everything the app ever writes lands there.
3. **Upload the `config.yaml`:** copy `config.example.yaml` from this repository,
   enter the family members (never change the `id` values afterwards!) and put it
   into that folder as `config.yaml`. The PIN and the API keys come as
   environment variables in a moment, not into the file.

## 2. Start the container

Put this `docker-compose.yml` next to the data folder (replacing the
placeholders) and start it with `docker compose up -d`:

```yaml
services:
  popcorn-vote:
    image: ghcr.io/stadicus/popcorn-vote:latest
    container_name: popcorn-vote
    ports:
      # Left: a free port on your server. On a machine with a public address,
      # write '127.0.0.1:8300:3000' instead, see the note below.
      - '8300:3000'
    volumes:
      - /srv/popcorn-vote/data:/data
    environment:
      PV_PIN: 'NNNN' # your four-digit family PIN
      TMDB_API_KEY: 'YOUR-TMDB-KEY'
      OMDB_API_KEY: 'YOUR-OMDB-KEY'
      # For the per-device PIN brake: the number of reverse proxies in front of
      # the app. One proxy = 1. Every further one in front of it (a Cloudflare
      # tunnel, Traefik, …) = +1, or the app sees every visitor with the same IP.
      ADDRESS_HEADER: x-forwarded-for
      XFF_DEPTH: '1'
      # Which header the proxy uses to say a visitor arrived over HTTPS. With it
      # the sign-in cookie is marked Secure for those visitors, while anyone
      # reaching the server directly on port 8300 over plain HTTP keeps a working
      # sign-in. Check that it really arrives, step 3 below says how.
      PROTOCOL_HEADER: x-forwarded-proto
    # Without a limit the log grows until the disk is full, Docker keeps
    # everything forever by default. Three files of ten megabytes is a few weeks
    # of ordinary operation.
    logging:
      driver: json-file
      options:
        max-size: '10m'
        max-file: '3'
    restart: unless-stopped
```

`docker ps` then shows the app's health check (`healthy` = `/healthz` answers);
graphical container managers show the same state as a green dot.

**On a machine that has a public address, bind the port to `127.0.0.1`.** Written
as `'8300:3000'`, Docker publishes the port on every interface and writes its own
firewall rule while doing so, so a host firewall configured the usual way does not
close it. On a rented server that puts the app on the open internet as plain HTTP
under `http://<server-ip>:8300`, beside the proxy rather than behind it, with the
PIN travelling in clear text. Worse, `ADDRESS_HEADER` is trusted on that path: a
visitor arriving directly can send `X-Forwarded-For` themselves and walk around
the per-IP wait after a wrong PIN with an address of their choosing.
`'127.0.0.1:8300:3000'` keeps the port on the machine, where the reverse proxy
reaches it and nobody else does; the direct `curl` in step 3 is then run over SSH
on the server itself.

On a home server behind a router that forwards nothing but 443, the plain
`'8300:3000'` is fine and gives the family a way in over the local network. That
is the case the rest of this guide is written for.

## 3. HTTPS through a reverse proxy

The app speaks plain HTTP on port 3000 and brings no certificate of its own.
Whatever already terminates TLS on your server does that job, Caddy, nginx,
Traefik, or the reverse proxy built into your server's administration interface.

1. **DNS:** point `popcornvote.example.com` at your connection with an A record or
   a CNAME (a fixed IP or a dynamic-DNS name). Forward port `443` to the server
   in your router.
2. **Reverse proxy:** send `https://popcornvote.example.com` to `localhost:8300`
   over plain HTTP, and let it forward `X-Forwarded-For` and
   `X-Forwarded-Proto`. With Caddy that is the whole configuration, headers
   included:

   ```
   popcornvote.example.com {
       reverse_proxy localhost:8300
   }
   ```

   `localhost` holds only where the proxy runs on the host itself. **A proxy that
   is a container of its own** reaches its own inside with that name, so it needs
   a shared network and the address the app has on it. Create the network once,
   outside either project:

   ```sh
   docker network create web
   ```

   Add it to the app's compose file from step 2, the service joins it, and the
   network is declared as one that already exists:

   ```yaml
   services:
     popcorn-vote:
       networks: [web]
       # … everything else stays as it is, ports: included

   networks:
     web:
       external: true
   ```

   Then do the same in the proxy's own compose file, and send it to
   `popcorn-vote:3000`, the service name from step 2, and the port *inside* the
   container, not the published one. Leave the `ports:` entry where it is either
   way: the header check further down this step goes through it, and on a home
   server it is the family's way in over the local network.

   Other proxies want the headers named explicitly, with nginx, for instance,
   `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;` and
   `proxy_set_header X-Forwarded-Proto $scheme;`.
3. **Certificate:** Caddy and Traefik fetch one from Let's Encrypt by themselves.
   Anything else wants one assigned, for example through `certbot`.
4. **Check that the protocol header arrives.** The container log names it at
   startup: with `PROTOCOL_HEADER` set, the `Configuration loaded` line carries
   `"source":{…,"HTTPS proof":"PROTOCOL_HEADER",…}`. If instead a line appears
   saying cookies are not marked `Secure`, the variable never reached the
   container, and if a proxy is nevertheless forwarding its protocol, a warning
   says exactly that on the first request that writes a cookie. The reverse case
  , the variable set, the header never arriving, cannot be reported: a request
   without the header is what a direct visit on port 8300 looks like too, and
   the two are indistinguishable. That is what the two calls below are for.

   Whether the proxy really sends the header shows on a cookie. `/api/language`
   is open without a PIN and sets one, so it can be asked through the proxy and
   directly, and the two answers compared, `Secure` appears only on the first.
   **The second call has to run on the server itself**, over SSH on a rented
   machine, where step 2 bound that port to `127.0.0.1`; on a home server with
   the port open on the network, `http://<server-ip>:8300` from any machine on it
   does just as well:

   ```sh
   curl -si -X POST https://popcornvote.example.com/api/language \
     -H 'Content-Type: application/json' -d '{"language":"de"}' | grep -i set-cookie
   # → set-cookie: pv_lang=de; …; HttpOnly; Secure; SameSite=Lax

   curl -si -X POST http://127.0.0.1:8300/api/language \
     -H 'Content-Type: application/json' -d '{"language":"de"}' | grep -i set-cookie
   # → set-cookie: pv_lang=de; …; HttpOnly; SameSite=Lax      (no Secure, as intended)
   ```

   If the first answer carries no `Secure` either, the header is not arriving .
   or it arrives saying `http`, because TLS already ended one hop further out
   and an inner proxy overwrites the header with its own scheme. The log can
   tell the two apart only when the arriving value still carries `https` in
   front (a chain that appends rather than overwrites, `https, http`); a clean
   overwrite looks exactly like a direct visit and stays silent, so the two
   calls above remain the reliable check.

   Should the proxy not offer to forward it, set it by hand
   (`X-Forwarded-Proto: https`). If that is not possible either, remove
   `PROTOCOL_HEADER` again and leave it at no proof at all, the sign-in works
   everywhere then, the cookie simply carries no `Secure` flag. **Do not reach
   for `ORIGIN=https://…` here:** it counts every request as HTTPS, including
   the ones on port 8300, and locks the local way in out again.

## 4. Test it

```sh
curl https://popcornvote.example.com/healthz   # → {"status":"ok"}
```

Then open the address on a phone, enter the PIN, pick a person and choose
**"Add to Home Screen"**, done.

## 5. Optional: automatic updates

A label-scoped [Watchtower](https://containrrr.dev/watchtower/) pulls new
versions automatically without touching the other containers on the server: add
the label under `popcorn-vote:` in the compose file above …

This only reaches an image pulled from a registry. An image built on the machine
itself, the ARM case from the top of this page, is updated by building it
again; Watchtower has nothing to pull for it and will quietly do nothing.

Worth knowing: Watchtower recreates the container with **the settings it already
has**. A new image therefore brings new code, but never new entries from a newer
`docker-compose.yml`, a variable or a log limit added there only takes effect
once you bring the stack up again yourself.

```yaml
    labels:
      com.centurylinklabs.watchtower.enable: 'true'
```

… and run Watchtower alongside it. The block below opens with `services:` of its
own, so it belongs in a second compose file rather than pasted under the first .
two of that key in one file is where `docker compose up` stops:

```yaml
services:
  watchtower:
    image: containrrr/watchtower:1.7.1
    container_name: watchtower
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    environment:
      WATCHTOWER_LABEL_ENABLE: 'true' # ONLY containers with the label above
      WATCHTOWER_CLEANUP: 'true'
      WATCHTOWER_SCHEDULE: '0 0 5 * * *' # daily at 05:00
    restart: unless-stopped
```

Whoever would rather update by hand runs `docker compose pull && docker compose
up -d` and skips this section entirely.

## 6. Backups

The app's entire state lives in a single folder (`/srv/popcorn-vote/data`): the
database, the `config.yaml` and the last 14 nightly backup versions. Point
whatever already backs up the server at that folder, nothing else is needed.
