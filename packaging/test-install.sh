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
fail=0

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1; docker run --rm -v "$DIR":/x alpine rm -rf /x/. >/dev/null 2>&1; rmdir "$DIR" 2>/dev/null; }
trap cleanup EXIT

echo "image:      $IMAGE"
echo "data dir:   $DIR (owned $UIDGID, as an app store would create it)"
echo "extra args: ${EXTRA:-<none>}"
echo

docker run --rm -v "$DIR":/x alpine chown "$UIDGID" /x >/dev/null 2>&1
docker rm -f "$NAME" >/dev/null 2>&1
# shellcheck disable=SC2086
docker run -d --name "$NAME" $EXTRA -p "$PORT":3000 -v "$DIR":/data "$IMAGE" >/dev/null 2>&1

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
fi

echo
[ "$fail" = 0 ] && echo "store install works" || echo "STORE INSTALL BROKEN"
exit "$fail"
