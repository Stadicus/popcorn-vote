#!/usr/bin/env bash
# Exercises the root-owned mount path used by Home Assistant and Compose stores
# that do not declare a platform uid.
# Unraid's explicit --user 99:100 path stays covered by test-install.sh.
set -uo pipefail

run=$$
name=pv-root-store-test-$run
port=${PORT:-$((4200 + run % 80))}
image=${IMAGE:-popcorn-vote:ci}
data_dir=$(mktemp -d)
response=$(mktemp)
fail=0

# shellcheck disable=SC2317 # Invoked indirectly by trap.
cleanup() {
	docker rm -f "$name" >/dev/null 2>&1
	docker run --rm -v "$data_dir":/x alpine:3.22 rm -rf /x/. >/dev/null 2>&1
	rmdir "$data_dir" 2>/dev/null
	rm -f "$response"
}
trap cleanup EXIT

ok() { printf '  OK    %s\n' "$1"; }
bad() { printf '  FAIL  %s\n' "$1"; fail=1; }

wait_for_health() {
	local code=""
	for _ in $(seq 1 30); do
		code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "http://127.0.0.1:$port/healthz" 2>/dev/null)
		[ "$code" = 200 ] && return 0
		[ "$(docker inspect --format '{{.State.Running}}' "$name" 2>/dev/null)" = true ] || return 1
		sleep 1
	done
	return 1
}

echo "root-owned app-store mount"
echo "image:    $image"
echo "data dir: $data_dir"

# options.json belongs to the Home Assistant Supervisor and remains root-only.
# The other file represents restored application data that must be adopted.
docker run --rm -v "$data_dir":/x alpine:3.22 \
	sh -c 'touch /x/options.json /x/restored-data && chmod 600 /x/options.json'

if docker run --rm -e DATA_DIR=/ "$image" true >/dev/null 2>&1; then
	bad 'unsafe DATA_DIR=/ was accepted'
else
	ok 'unsafe DATA_DIR=/ is rejected'
fi

ln -s /data/sentinel-target "$data_dir/.ownership-migrated"
if docker run --rm -v "$data_dir":/data "$image" true >/dev/null 2>&1 || [ -e "$data_dir/sentinel-target" ]; then
	bad 'symbolic-link ownership marker was accepted'
else
	ok 'symbolic-link ownership marker is rejected without following it'
fi
rm -f "$data_dir/.ownership-migrated"

if ! docker run -d --name "$name" -p "$port":3000 -v "$data_dir":/data "$image" >/dev/null; then
	bad 'container did not start'
elif wait_for_health; then
	ok '/healthz answers on a root-owned mount'
else
	bad 'container did not become healthy'
	docker logs "$name" 2>&1 | tail -10
fi

if [ "$fail" = 0 ]; then
	pid_uid=$(docker exec "$name" sh -c "awk '/^Uid:/{print \$2}' /proc/1/status")
	if [ "$pid_uid" = 1000 ]; then
		ok 'PID 1 runs as node (uid 1000)'
	else
		bad "PID 1 runs as uid ${pid_uid:-unknown}"
	fi

	owners=$(docker run --rm -v "$data_dir":/x alpine:3.22 \
		sh -c "stat -c '%u:%g' /x/.ownership-migrated /x/restored-data /x/options.json" 2>/dev/null)
	expected=$(printf '1000:1000\n1000:1000\n0:0')
	if [ "$owners" = "$expected" ]; then
		ok 'app data is adopted while options.json stays root-owned'
	else
		bad "unexpected ownership: $(printf '%s' "$owners" | tr '\n' ' ')"
	fi

	setup_code=$(curl -s -o "$response" -w '%{http_code}' --max-time 20 \
		-X POST "http://127.0.0.1:$port/api/setup" \
		-H 'content-type: application/json' \
		-d '{"title":"Root Mount Test","pin":"1234","confirmPin":"1234","members":["Anna","Ben"],"sources":["Server"],"tokenAmount":1,"tokenCap":5,"tokenStart":3,"tokenWeekday":1,"tokenHour":18,"timezone":"Europe/Zurich","interfaceLanguage":"en","movieLanguage":"en-US","movieFallbackLanguage":"en-US","certificationCountry":"CH","trailerLanguages":["en-US"],"tmdbApiKey":"dummy-key-for-this-test-only","omdbApiKey":""}')
	if [ "$setup_code" = 200 ]; then
		ok 'first-run setup completes'
	else
		bad "setup answered $setup_code: $(head -c 200 "$response")"
	fi
fi

if [ "$fail" = 0 ]; then
	docker restart "$name" >/dev/null
	if wait_for_health; then
		url=$(curl -sL -o /dev/null -w '%{url_effective}' --max-time 10 "http://127.0.0.1:$port/")
		case "$url" in
			*/setup) bad 'configuration was lost on restart' ;;
			*) ok 'configuration and ownership migration survive restart' ;;
		esac
	else
		bad 'container did not recover after restart'
	fi
fi

if [ "$fail" = 0 ]; then
	# A manual restore can replace files as root while the migration marker from
	# the backup survives. The documented recovery is to remove that marker and
	# restart, which must adopt the restored files again.
	docker rm -f "$name" >/dev/null
	docker run --rm -v "$data_dir":/x alpine:3.22 \
		sh -c 'chown 0:0 /x/config.yaml /x/popcornvote.sqlite && rm /x/.ownership-migrated'
	docker run -d --name "$name" -p "$port":3000 -v "$data_dir":/data "$image" >/dev/null
	if wait_for_health; then
		restored_owners=$(docker run --rm -v "$data_dir":/x alpine:3.22 \
			sh -c "stat -c '%u:%g' /x/config.yaml /x/popcornvote.sqlite" 2>/dev/null)
		expected=$(printf '1000:1000\n1000:1000')
		if [ "$restored_owners" = "$expected" ]; then
			ok 'removing the marker re-arms ownership recovery after a restore'
		else
			bad "restored files were not adopted: $(printf '%s' "$restored_owners" | tr '\n' ' ')"
		fi
	else
		bad 'container did not recover after re-arming ownership migration'
	fi
fi

echo
[ "$fail" = 0 ] && echo 'root-owned app-store install works' || echo 'ROOT-OWNED APP-STORE INSTALL BROKEN'
exit "$fail"
