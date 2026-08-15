#!/usr/bin/env bash
# Checks the app store packages against the container they install.
#
# A package repeats the port, the data path and the variable names that live in
# docker-compose.yml, and none of that fails loudly when it drifts: the
# container ignores a variable it does not know, and a wrong port only produces
# a link that does not answer. Run this after touching docker-compose.yml, the
# packages, or any environment variable.
#
# What is verified is exactly what is printed below and nothing beyond it.
set -uo pipefail
cd "$(dirname "$0")/.."
fail=0
note() { printf '  %-6s %s\n' "$1" "$2"; }

echo "XML well-formedness"
for f in packaging/*/*.xml; do
	[ -e "$f" ] || continue
	if python3 -c "import xml.dom.minidom,sys;xml.dom.minidom.parse(sys.argv[1])" "$f" 2>/dev/null; then
		note OK "$f"
	else
		note FAIL "$f"
		fail=1
	fi
done

echo
echo "Variable names known to the application"
# A `while read` at the end of a pipe runs in a subshell, so `fail=1` set inside
# it would be lost on the way out. An earlier version worked around that with a
# marker file at a fixed path in /tmp, which let two runs at once hand each
# other's verdict around. A here-string keeps the loop in this shell instead.
targets=$(grep -ho 'Target="[A-Z_][A-Z_]*"' packaging/*/*.xml 2>/dev/null | sed 's/Target="//;s/"//' | sort -u)
while read -r v; do
	[ -n "$v" ] || continue
	# Whole word: a substring match would accept PV_TIMEZONE merely because
	# PV_TIMEZONE_OFFSET exists, which is the very drift being hunted here.
	if grep -rqw -- "$v" src/ 2>/dev/null; then
		note OK "$v"
	else
		note FAIL "$v is set by a package but read nowhere in src/"
		fail=1
	fi
done <<<"$targets"

echo
echo "Port and data path match the container"
# Both are hardcoded in the template and neither is a variable name, so the
# check above would never notice them drifting apart from the compose file.
compose_port=$(grep -oE "^[[:space:]]+- '[0-9]+:[0-9]+'" docker-compose.yml | grep -oE ":[0-9]+'" | tr -d ":'" | head -1)
compose_path=$(grep -oE '^[[:space:]]+- popcorn-vote-data:/[a-z]+' docker-compose.yml | sed 's|.*:||' | head -1)
for f in packaging/*/*.xml; do
	[ -e "$f" ] || continue
	grep -q '<Container' "$f" || continue
	tmpl_port=$(grep -oE 'Type="Port"' "$f" >/dev/null 2>&1 && grep -oE 'Target="[0-9]+"' "$f" | grep -oE '[0-9]+' | head -1)
	tmpl_path=$(grep -oE 'Target="/[a-z]+"' "$f" | sed 's/Target="//;s/"//' | head -1)
	if [ -n "$compose_port" ] && [ "$tmpl_port" = "$compose_port" ]; then
		note OK "port $tmpl_port matches docker-compose.yml"
	else
		note FAIL "$f uses port ${tmpl_port:-none}, docker-compose.yml uses ${compose_port:-none}"
		fail=1
	fi
	if [ -n "$compose_path" ] && [ "$tmpl_path" = "$compose_path" ]; then
		note OK "data path $tmpl_path matches docker-compose.yml"
	else
		note FAIL "$f mounts ${tmpl_path:-none}, docker-compose.yml uses ${compose_path:-none}"
		fail=1
	fi
done

echo
echo "YAML well-formedness"
have_yaml=0
python3 -c "import yaml" 2>/dev/null && have_yaml=1
if [ "$have_yaml" = 0 ]; then
	note FAIL "python3 has no PyYAML, so no YAML package can be read (pip install pyyaml)"
	fail=1
else
	for f in packaging/*/*.yml; do
		[ -e "$f" ] || continue
		if python3 -c "import yaml,sys;yaml.safe_load(open(sys.argv[1]))" "$f" 2>/dev/null; then
			note OK "$f"
		else
			note FAIL "$f"
			fail=1
		fi
	done
fi

echo
echo "Umbrel package matches the container"
# The Unraid template repeats port and path as XML attributes; the Umbrel
# package repeats the same two facts across two YAML files, and adds two more
# that only it has: a pinned image digest and the container name its proxy
# resolves. None of them fail loudly either. A wrong APP_HOST gives the visitor
# a blank page, an unpinned image gives them a different build than the one that
# was reviewed.
if [ ! -d packaging/umbrel ]; then
	note SKIP "no packaging/umbrel directory"
elif [ "$have_yaml" = 0 ]; then
	note SKIP "needs PyYAML, see above"
else
	umbrel_facts=$(python3 - <<'PYTHON' 2>/dev/null
import json, shlex, yaml

manifest = yaml.safe_load(open('packaging/umbrel/umbrel-app.yml')) or {}
compose = yaml.safe_load(open('packaging/umbrel/docker-compose.yml')) or {}
package = json.load(open('package.json'))

services = compose.get('services') or {}
proxy = (services.get('app_proxy') or {}).get('environment') or {}
main = services.get('main') or {}
volumes = main.get('volumes') or []
environment = main.get('environment') or {}
if isinstance(environment, list):
    environment = dict(e.split('=', 1) if '=' in e else (e, '') for e in environment)

for key, value in [
    ('u_id', manifest.get('id', '')),
    ('u_version', manifest.get('version', '')),
    ('u_app_host', proxy.get('APP_HOST', '')),
    ('u_app_port', proxy.get('APP_PORT', '')),
    ('u_image', main.get('image', '')),
    ('u_mount', volumes[0] if volumes else ''),
    ('u_env', ' '.join(sorted(environment))),
    ('u_package_version', package.get('version', '')),
]:
    print(f'{key}={shlex.quote(str(value))}')
PYTHON
	)
	if [ -z "$umbrel_facts" ]; then
		note FAIL "packaging/umbrel could not be read"
		fail=1
	else
		eval "$umbrel_facts"

		if [ -n "$compose_port" ] && [ "$u_app_port" = "$compose_port" ]; then
			note OK "APP_PORT $u_app_port matches docker-compose.yml"
		else
			note FAIL "APP_PORT is ${u_app_port:-none}, docker-compose.yml uses ${compose_port:-none}"
			fail=1
		fi

		u_mount_target=${u_mount##*:}
		u_mount_source=${u_mount%:*}
		if [ -n "$compose_path" ] && [ "$u_mount_target" = "$compose_path" ]; then
			note OK "data path $u_mount_target matches docker-compose.yml"
		else
			note FAIL "mounts ${u_mount_target:-none}, docker-compose.yml uses ${compose_path:-none}"
			fail=1
		fi

		# Umbrel hands every app one directory under this variable and backs up
		# and removes exactly that. An absolute path here would put the family's
		# database outside all of it.
		case $u_mount_source in
		'${APP_DATA_DIR}'/*)
			note OK 'data lives under ${APP_DATA_DIR}'
			;;
		*)
			note FAIL "host side is ${u_mount_source:-none}, must start with \${APP_DATA_DIR}/"
			fail=1
			;;
		esac

		# Umbrel names containers <app id>_<service>_1, and the proxy in front
		# resolves that name and nothing else.
		if [ -n "$u_id" ] && [ "$u_app_host" = "${u_id}_main_1" ]; then
			note OK "APP_HOST $u_app_host matches the app id"
		else
			note FAIL "APP_HOST is ${u_app_host:-none}, app id ${u_id:-none} makes it ${u_id:-?}_main_1"
			fail=1
		fi

		# A tag can be moved to another image after the store reviewed it, a
		# digest cannot.
		case $u_image in
		*@sha256:*) note OK "image is pinned to a digest" ;;
		*)
			note FAIL "image ${u_image:-none} is not pinned to a digest"
			fail=1
			;;
		esac

		u_image_ref=${u_image%%@*}
		u_image_tag=${u_image_ref##*/}
		case $u_image_tag in
		*:*) u_image_tag=${u_image_tag##*:} ;;
		*) u_image_tag="" ;;
		esac
		if [ -n "$u_image_tag" ] && [ "$u_image_tag" = "$u_package_version" ]; then
			note OK "image tag $u_image_tag matches package.json"
		else
			note FAIL "image tag is ${u_image_tag:-none}, package.json says ${u_package_version:-none}"
			fail=1
		fi

		if [ -n "$u_version" ] && [ "$u_version" = "$u_package_version" ]; then
			note OK "manifest version $u_version matches package.json"
		else
			note FAIL "manifest version is ${u_version:-none}, package.json says ${u_package_version:-none}"
			fail=1
		fi

		# Umbrel needs the bind-mount source to exist in the repository, and
		# the root .gitignore has a `data/` rule that swallows it. Git never
		# descends into an ignored directory, so the package looks complete
		# here and arrives at the store one directory short.
		if ! git -C . rev-parse --git-dir >/dev/null 2>&1; then
			note SKIP "not a git checkout, cannot tell whether data/ is tracked"
		elif git ls-files --error-unmatch packaging/umbrel/data >/dev/null 2>&1; then
			note OK "the data directory is tracked by git"
		else
			note FAIL "packaging/umbrel/data/ is not tracked (the data/ rule in .gitignore)"
			fail=1
		fi

		# Same rule the XML templates follow: whatever a package hands the
		# container has to be a variable the application reads.
		for v in $u_env; do
			if grep -rqw -- "$v" src/ 2>/dev/null; then
				note OK "$v"
			else
				note FAIL "$v is set by the Umbrel package but read nowhere in src/"
				fail=1
			fi
		done
	fi
fi

echo
echo "ADDRESS_HEADER must not be set by a package"
# Right behind a reverse proxy, wrong for a direct install: the app would read
# the client address from a header the caller writes, and the brute-force brake
# on the PIN could be walked straight through. Only package files are searched;
# this script and the README name the variable in order to explain its absence.
hits=$(grep -rl 'ADDRESS_HEADER' packaging/*/ 2>/dev/null | tr '\n' ' ')
if [ -n "$hits" ]; then
	note FAIL "found in: $hits"
	fail=1
else
	note OK "absent from all packages"
fi

echo
[ "$fail" = 0 ] && echo "packages consistent" || echo "PACKAGE DRIFT — see FAIL above"
exit "$fail"
