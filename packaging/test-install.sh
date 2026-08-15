#!/usr/bin/env bash
# Installs the container the way an app store would, and checks that a person
# who clicked "install" actually gets somewhere.
#
# The interesting part is not the app, it is the ownership. App stores bind-mount
# a host directory they created themselves, and the image runs as the
# unprivileged user `node`. Unraid creates appdata as nobody:users (99:100), so
# without a matching --user the container cannot write its own data directory
# and dies with EACCES /data/covers, restarting forever. That failure is
# invisible in the XML and invisible in CI; only a real container shows it.
#
# Needs Docker. Nothing else, and no Unraid.
set -uo pipefail
NAME=pv-store-test
PORT=${PORT:-3999}
DIR=$(mktemp -d)
UIDGID=${UIDGID:-99:100}          # Unraid appdata default
# Set but empty must stay empty: that is how the broken case is reproduced, so
# `${EXTRA:-default}` would be wrong here — it fills in on empty as well.
if [ -z "${EXTRA+isset}" ]; then EXTRA="--user 99:100"; fi   # what the template passes as ExtraParams
IMAGE=${IMAGE:-ghcr.io/stadicus/popcorn-vote:latest}
# Umbrel commonly runs on a Raspberry Pi, so the arm64 half of the image matters
# as much as the amd64 one. Emulation makes every step roughly five times
# slower, hence the generous waits above:
#   docker run --privileged --rm tonistiigi/binfmt --install arm64
#   PLATFORM=linux/arm64 bash packaging/test-install.sh
PLATFORM=${PLATFORM:-}
[ -n "$PLATFORM" ] && PLATFORM_ARG="--platform $PLATFORM" || PLATFORM_ARG=""
fail=0

cleanup() { docker rm -f "$NAME" "$NAME-alt" "$NAME-copy" >/dev/null 2>&1; docker run --rm -v "$DIR":/x alpine rm -rf /x/. >/dev/null 2>&1; rmdir "$DIR" 2>/dev/null; }
trap cleanup EXIT

echo "image:      $IMAGE"
echo "data dir:   $DIR (owned $UIDGID, as an app store would create it)"
echo "extra args: ${EXTRA:-<none>}"
echo "platform:   ${PLATFORM:-native}"
echo

docker run --rm -v "$DIR":/x alpine chown "$UIDGID" /x >/dev/null 2>&1
docker rm -f "$NAME" >/dev/null 2>&1
# shellcheck disable=SC2086
docker run -d --name "$NAME" $PLATFORM_ARG $EXTRA -p "$PORT":3000 -v "$DIR":/data "$IMAGE" >/dev/null 2>&1

for _ in $(seq 1 20); do
	sleep 1
	status=$(docker ps -a --filter "name=$NAME" --format '{{.Status}}')
	case "$status" in
		Up*) break ;;
		Restarting*|Exited*) break ;;
	esac
done

echo "container:  $status"
case "$status" in
	Up*) echo "  OK    running" ;;
	*)   echo "  FAIL  not running"; docker logs "$NAME" 2>&1 | tail -6; fail=1 ;;
esac

if [ "$fail" = 0 ]; then
	code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "http://localhost:$PORT/healthz")
	[ "$code" = "200" ] && echo "  OK    /healthz 200" || { echo "  FAIL  /healthz $code"; fail=1; }

	# The whole point of an app store package: a browser lands on something
	# actionable, with no shell and no file editing.
	url=$(curl -sL -o /tmp/pv-store-page.html -w '%{url_effective}' --max-time 10 "http://localhost:$PORT/")
	if grep -q 'setup-tmdb-key' /tmp/pv-store-page.html; then
		echo "  OK    first run lands on the setup wizard ($url)"
	else
		echo "  FAIL  no setup wizard at $url"; fail=1
	fi

	# Written as the store's user, so the operator can back the directory up.
	owner=$(docker run --rm -v "$DIR":/x alpine stat -c '%u:%g' /x/popcornvote.sqlite 2>/dev/null)
	[ "$owner" = "${UIDGID/:/:}" ] && echo "  OK    database owned $owner" || { echo "  FAIL  database owned $owner, expected $UIDGID"; fail=1; }

	# Stores show this state to their users, and compose can be told to wait for
	# it, so an app that serves fine while reporting unhealthy is a real defect.
	# It was one: the check asked for `localhost`, which also resolves to ::1
	# inside the container while the server binds IPv4 only.
	health=""
	for _ in $(seq 1 24); do
		sleep 5
		health=$(docker inspect --format '{{.State.Health.Status}}' "$NAME" 2>/dev/null)
		[ "$health" = "healthy" ] || [ "$health" = "unhealthy" ] && break
	done
	if [ "$health" = "healthy" ]; then
		echo "  OK    docker health check reports healthy"
	elif [ -z "$health" ]; then
		echo "  OK    image defines no health check, nothing to report"
	else
		echo "  FAIL  docker health check reports $health"
		docker inspect --format '{{(index .State.Health.Log 0).Output}}' "$NAME" 2>/dev/null | head -1
		fail=1
	fi
fi


# ---------------------------------------------------------------------------
# Beyond the first start: what a store puts the container through afterwards.
# ---------------------------------------------------------------------------
if [ "$fail" = 0 ]; then
	echo
	echo "after the first start"

	# Completing setup is the point of the whole package: if this fails, the
	# install is a dead end no matter how cleanly the container came up.
	setup=$(curl -s -o /tmp/pv-setup.json -w '%{http_code}' --max-time 20 \
		-X POST "http://localhost:$PORT/api/setup" \
		-H 'content-type: application/json' \
		-d '{"title":"Test Family","pin":"1234","confirmPin":"1234","members":["Anna","Ben"],"sources":["Server"],"tokenAmount":1,"tokenCap":5,"tokenStart":3,"tokenWeekday":1,"tokenHour":18,"timezone":"Europe/Berlin","interfaceLanguage":"en","movieLanguage":"en-US","movieFallbackLanguage":"en-US","certificationCountry":"DE","trailerLanguages":["en-US"],"tmdbApiKey":"dummy-key-for-this-test-only","omdbApiKey":""}')
	if [ "$setup" = "200" ]; then
		echo "  OK    setup completes through the API ($setup)"
	else
		echo "  FAIL  setup answered $setup: $(head -c 200 /tmp/pv-setup.json)"; fail=1
	fi

	# Having been set up, the app must stop offering setup — otherwise a second
	# visitor could walk in and configure it again.
	after=$(curl -sL -o /dev/null -w '%{url_effective}' --max-time 15 "http://localhost:$PORT/")
	case "$after" in
		*/setup) echo "  FAIL  still lands on the setup wizard after setup"; fail=1 ;;
		*)       echo "  OK    first run is over, no longer offers setup ($after)" ;;
	esac

	# An update replaces the container and keeps the directory. This is the one
	# operation every user performs sooner or later, and the one that loses data
	# when a package gets the volume wrong.
	docker rm -f "$NAME" >/dev/null 2>&1
	# shellcheck disable=SC2086
	docker run -d --name "$NAME" $PLATFORM_ARG $EXTRA -p "$PORT":3000 -v "$DIR":/data "$IMAGE" >/dev/null 2>&1
	for _ in $(seq 1 20); do
		sleep 2
		[ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://localhost:$PORT/healthz")" = "200" ] && break
	done
	survived=$(curl -sL -o /dev/null -w '%{url_effective}' --max-time 15 "http://localhost:$PORT/")
	case "$survived" in
		*/setup) echo "  FAIL  configuration lost when the container was replaced"; fail=1 ;;
		*)       echo "  OK    survives replacing the container (an update)" ;;
	esac

	# SQLite keeps -wal and -shm beside the database. A hard restart has to leave
	# a consistent file behind, not a half-written one.
	docker restart "$NAME" >/dev/null 2>&1
	for _ in $(seq 1 20); do
		sleep 2
		code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://localhost:$PORT/healthz")
		[ "$code" = "200" ] && break
	done
	[ "$code" = "200" ] && echo "  OK    survives a restart" || { echo "  FAIL  unhealthy after restart ($code)"; fail=1; }

	# Stores let people pick their own host port, and nothing in the app may
	# assume the one from the template.
	docker rm -f "$NAME-alt" >/dev/null 2>&1
	# shellcheck disable=SC2086
	docker run -d --name "$NAME-alt" $PLATFORM_ARG $EXTRA -p 39997:3000 -v "$DIR":/data "$IMAGE" >/dev/null 2>&1
	for _ in $(seq 1 20); do
		sleep 2
		alt=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://localhost:39997/healthz)
		[ "$alt" = "200" ] && break
	done
	docker rm -f "$NAME-alt" >/dev/null 2>&1
	[ "$alt" = "200" ] && echo "  OK    works on a different host port" || { echo "  FAIL  broken on a different host port ($alt)"; fail=1; }

	# Unraid users back up appdata by copying it. A copy has to start elsewhere.
	COPY=$(mktemp -d)
	docker run --rm -v "$DIR":/from -v "$COPY":/to alpine sh -c 'cp -a /from/. /to/ && chown -R 99:100 /to' >/dev/null 2>&1
	docker rm -f "$NAME-copy" >/dev/null 2>&1
	# shellcheck disable=SC2086
	docker run -d --name "$NAME-copy" $PLATFORM_ARG $EXTRA -p 39996:3000 -v "$COPY":/data "$IMAGE" >/dev/null 2>&1
	for _ in $(seq 1 20); do
		sleep 2
		cp_url=$(curl -sL -o /dev/null -w '%{url_effective}' --max-time 5 http://localhost:39996/ 2>/dev/null)
		[ -n "$cp_url" ] && [ "$cp_url" != "http://localhost:39996/" ] && break
	done
	case "$cp_url" in
		*/setup) echo "  FAIL  a copied data directory comes up unconfigured"; fail=1 ;;
		"")      echo "  FAIL  a copied data directory does not answer"; fail=1 ;;
		*)       echo "  OK    a copied data directory keeps its configuration (backup restore)" ;;
	esac
	docker rm -f "$NAME-copy" >/dev/null 2>&1
	docker run --rm -v "$COPY":/x alpine rm -rf /x/. >/dev/null 2>&1; rmdir "$COPY" 2>/dev/null
fi

echo
[ "$fail" = 0 ] && echo "store install works" || echo "STORE INSTALL BROKEN"
exit "$fail"
