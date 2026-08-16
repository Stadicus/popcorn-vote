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
cd "$(dirname "$0")/.." || exit 1
fail=0
note() { printf '  %-6s %s\n' "$1" "$2"; }

required_packages=$(sed '/^[[:space:]]*#/d;/^[[:space:]]*$/d' packaging/required-packages.txt)

required() {
	grep -qx "$1" <<<"$required_packages"
}

version_not_newer() {
	local candidate=$1 current=$2
	[[ $candidate =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || return 1
	[[ $current =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || return 1
	[ "$(printf '%s\n%s\n' "$candidate" "$current" | sort -V | tail -1)" = "$current" ]
}

echo "Store discovery and shipped-package presence"
# Recognition deliberately follows store semantics rather than only canonical
# paths. A fixture that accidentally looks like an app is dangerous precisely
# because the store scanner would publish it too.
recognized=$(
	git ls-files -co --exclude-standard -z -- '*.xml' 'config.yaml' '*/config.yaml' 'docker-compose.yml' '*/docker-compose.yml' 'umbrel-app.yml' '*/umbrel-app.yml' |
	while IFS= read -r -d '' f; do
		f=./$f
		case "$f" in
			*.xml)
				# Recognition is intentionally more tolerant than validation: a
				# malformed Container must be caught here and then fail the XML check,
				# not disappear from the scanner merely because parsing failed.
				grep -Eq '<Container([[:space:]>])' "$f" && printf '%s\n' "$f"
				;;
			*/config.yaml)
				# As above, recognize the shape without requiring valid YAML. The
				# canonical package validator is responsible for parsing it later.
				if grep -Eq '^[[:space:]]*slug:' "$f" && grep -Eq '^[[:space:]]*(image|version):' "$f"; then
					printf '%s\n' "$f"
				fi
				;;
		*/docker-compose.yml | */umbrel-app.yml)
			if grep -Eq '(^|[[:space:]])x-casaos:|(^|[[:space:]])x-umbrel:|umbrel-app' "$f" ||
				{ [ "${f##*/}" = docker-compose.yml ] && [ -e "${f%/*}/umbrel-app.yml" ]; }; then
				printf '%s\n' "$f"
			fi
			;;
		esac
	done
)

while IFS= read -r f; do
	[ -n "$f" ] || continue
	case "$f" in
		./packaging/unraid/popcorn-vote.xml) package=unraid ;;
		./packaging/home-assistant/config.yaml) package=home-assistant ;;
		./packaging/umbrel/umbrel-app.yml | ./packaging/umbrel/docker-compose.yml) package=umbrel ;;
		./packaging/casaos/docker-compose.yml) package=casaos ;;
		*) note FAIL "$f is store-discoverable outside a canonical package path"; fail=1; continue ;;
	esac
	if required "$package"; then
		note OK "$f belongs to shipped package $package"
	else
		note FAIL "$f is publishable but $package is missing from required-packages.txt"
		fail=1
	fi
done <<<"$recognized"

for package in unraid home-assistant umbrel casaos; do
	case "$package" in
		unraid) files='packaging/unraid/popcorn-vote.xml packaging/unraid/ca_profile.xml' ;;
		home-assistant) files='repository.yaml packaging/home-assistant/config.yaml' ;;
		umbrel) files='packaging/umbrel/umbrel-app.yml packaging/umbrel/docker-compose.yml' ;;
		casaos) files='packaging/casaos/docker-compose.yml' ;;
	esac
	missing=""
	for f in $files; do [ -e "$f" ] || missing="$missing $f"; done
	if required "$package"; then
		if [ -z "$missing" ]; then
			note OK "$package required files exist"
		else
			note FAIL "$package is shipped but missing:$missing"
			fail=1
		fi
	elif [ "$missing" = " $files" ]; then
		note SKIP "$package has not shipped"
	elif [ -n "$missing" ]; then
		note FAIL "$package is partially present but missing:$missing"
		fail=1
	fi
done

echo
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
echo "Unraid image and privilege contract"
unraid=packaging/unraid/popcorn-vote.xml
if grep -q '<Repository>ghcr.io/stadicus/popcorn-vote:latest</Repository>' "$unraid"; then
	note OK "Unraid follows the moving latest tag"
else
	note FAIL "Unraid must use ghcr.io/stadicus/popcorn-vote:latest so installed containers receive updates"
	fail=1
fi
if grep -q '<ExtraParams>--user 99:100</ExtraParams>' "$unraid"; then
	note OK "Unraid keeps its nobody:users runtime identity"
else
	note FAIL "Unraid must start as 99:100 to match appdata ownership"
	fail=1
fi
if grep -q '<Privileged>false</Privileged>' "$unraid" && grep -q '<Network>bridge</Network>' "$unraid"; then
	note OK "Unraid is unprivileged on a bridge network"
else
	note FAIL "Unraid must stay unprivileged and off the host network"
	fail=1
fi

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
if [ -d node_modules/yaml ] && node packaging/yaml-to-json.mjs packaging/umbrel/umbrel-app.yml >/dev/null 2>&1; then
	have_yaml=1
fi
if [ "$have_yaml" = 0 ]; then
	note FAIL "node_modules/yaml is unavailable, so no YAML package can be read (run npm ci)"
	fail=1
else
	for f in packaging/*/*.yml packaging/*/*.yaml; do
		[ -e "$f" ] || continue
		if node packaging/yaml-to-json.mjs "$f" >/dev/null 2>&1; then
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
	note SKIP "needs node_modules/yaml, see above"
else
	umbrel_facts=$(python3 - <<'PYTHON' 2>/dev/null
import json, shlex, subprocess

def yaml_file(path):
    return json.loads(subprocess.check_output(['node', 'packaging/yaml-to-json.mjs', path]))

manifest = yaml_file('packaging/umbrel/umbrel-app.yml')
compose = yaml_file('packaging/umbrel/docker-compose.yml')
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
			if [ -n "$u_image_tag" ] && [ "$u_image_tag" = "$u_version" ]; then
				note OK "image tag $u_image_tag matches the Umbrel manifest"
			else
				note FAIL "image tag is ${u_image_tag:-none}, Umbrel manifest says ${u_version:-none}"
				fail=1
			fi

			# Store metadata intentionally lags package.json between image publication
			# and the reviewed metadata bump. Equality here would make the release
			# workflow impossible precisely during that supported window.
			if [ -n "$u_version" ] && version_not_newer "$u_version" "$u_package_version"; then
				note OK "manifest version $u_version is not newer than package.json $u_package_version"
			else
				note FAIL "manifest version ${u_version:-none} is invalid or newer than package.json ${u_package_version:-none}"
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
echo "Prepared metadata templates"
if template_result=$(python3 - <<'PYTHON' 2>&1
from pathlib import Path
import json
import re
import subprocess

def require(condition, message):
    if not condition:
        raise ValueError(message)

def yaml_file(path):
    return json.loads(subprocess.check_output(['node', 'packaging/yaml-to-json.mjs', str(path)]))

def version(value):
    require(isinstance(value, str) and re.fullmatch(r'\d+\.\d+\.\d+', value), f'invalid version: {value!r}')
    return tuple(map(int, value.split('.')))

def validate_ha(data, expected_version):
    require(data.get('version') == expected_version, 'Home Assistant version drifted')
    require(data.get('slug') == 'popcorn_vote', 'Home Assistant slug drifted')
    require(data.get('image') == 'ghcr.io/stadicus/popcorn-vote', 'Home Assistant image repository drifted')
    require(set(data.get('arch') or []) == {'amd64', 'aarch64'}, 'Home Assistant architectures are incomplete')
    require((data.get('ports') or {}).get('3000/tcp') == 3000, 'Home Assistant port is not 3000/tcp -> 3000')
    require(data.get('webui') == 'http://[HOST]:[PORT:3000]', 'Home Assistant webui does not follow the effective port')
    require(str(data.get('watchdog', '')).endswith('/healthz'), 'Home Assistant watchdog is not /healthz')
    require(data.get('backup') == 'cold', 'Home Assistant backup must be cold')
    require(data.get('stage') == 'experimental', 'Home Assistant must remain experimental')
    require('options' not in data and 'schema' not in data, 'Home Assistant setup must stay in the browser wizard')
    for key in ('ingress', 'host_network', 'hassio_api', 'homeassistant_api', 'docker_api', 'full_access'):
        require(not data.get(key, False), f'Home Assistant must not enable {key}')
    for key in ('privileged', 'devices', 'map'):
        require(not data.get(key), f'Home Assistant must not request {key}')

def validate_casa(data, expected_version):
    meta = data.get('x-casaos') or {}
    services = data.get('services') or {}
    main_name = meta.get('main')
    main = services.get(main_name) or {}
    require(main_name == 'popcorn-vote', 'CasaOS main service drifted')
    require(main.get('image') == f'ghcr.io/stadicus/popcorn-vote:{expected_version}', 'CasaOS image is not version-pinned')
    require(set(meta.get('architectures') or []) == {'amd64', 'arm64'}, 'CasaOS architectures are incomplete')
    require(meta.get('category') == 'Media', 'CasaOS category must use the official Media spelling')
    require(str(meta.get('port_map')) == '3000', 'CasaOS web port is not 3000')
    require(meta.get('version') == expected_version, 'CasaOS version drifted')
    require(any(isinstance(p, dict) and p.get('target') == 3000 and str(p.get('published')) == '3000' for p in main.get('ports') or []), 'CasaOS port mapping drifted')
    require('/DATA/AppData/$AppID/data:/data' in (main.get('volumes') or []), 'CasaOS data mount drifted')
    require(not main.get('user'), 'CasaOS must use the root-then-drop entrypoint path')
    require(not main.get('privileged', False), 'CasaOS must not be privileged')
    require(main.get('network_mode') != 'host', 'CasaOS must not use host networking')
    for key in ('cap_add', 'devices'):
        require(not main.get(key), f'CasaOS must not request {key}')

ha_template = yaml_file('packaging/home-assistant/config.template.yaml')
validate_ha(ha_template, '__VERSION__')
casa_template = yaml_file('packaging/casaos/docker-compose.template.yml')
validate_casa(casa_template, '__VERSION__')

application_version = json.loads(Path('package.json').read_text())['version']
store_versions = []
umbrel = yaml_file('packaging/umbrel/umbrel-app.yml')
store_versions.append(umbrel.get('version'))

ha_path = Path('packaging/home-assistant/config.yaml')
if ha_path.exists():
    ha = yaml_file(ha_path)
    validate_ha(ha, ha.get('version'))
    require(version(ha['version']) <= version(application_version), 'Home Assistant is newer than package.json')
    store_versions.append(ha['version'])
    repository = yaml_file('repository.yaml')
    require(repository.get('name') and repository.get('url') and repository.get('maintainer'), 'repository.yaml is incomplete')
    for name in ('README.md', 'DOCS.md', 'CHANGELOG.md', 'icon.png', 'logo.png'):
        require((ha_path.parent / name).exists(), f'Home Assistant is missing {name}')
    for name in ('README.md', 'DOCS.md', 'CHANGELOG.md'):
        require('__' not in (ha_path.parent / name).read_text(), f'Home Assistant {name} contains an unresolved placeholder')

casa_path = Path('packaging/casaos/docker-compose.yml')
if casa_path.exists():
    casa = yaml_file(casa_path)
    casa_version = (casa.get('x-casaos') or {}).get('version')
    validate_casa(casa, casa_version)
    require(version(casa_version) <= version(application_version), 'CasaOS is newer than package.json')
    store_versions.append(casa_version)

require(len(set(store_versions)) == 1, f'versioned store packages disagree: {store_versions}')
print('templates and any published YAML metadata satisfy the Home Assistant and CasaOS contracts')
PYTHON
); then
	note OK "$template_result"
else
	note FAIL "$template_result"
	fail=1
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
echo "Published package image references"
registry_refs=$(python3 - <<'PYTHON' 2>/dev/null
from pathlib import Path
import json
import re
import subprocess

def yaml_file(path):
    return json.loads(subprocess.check_output(['node', 'packaging/yaml-to-json.mjs', str(path)]))

refs = []
unraid = Path('packaging/unraid/popcorn-vote.xml')
if unraid.exists():
    match = re.search(r'<Repository>([^<]+)</Repository>', unraid.read_text())
    if match:
        refs.append(('unraid', match.group(1)))

ha = Path('packaging/home-assistant/config.yaml')
if ha.exists():
    data = yaml_file(ha)
    if data.get('image') and data.get('version'):
        refs.append(('home-assistant', f"{data['image']}:{data['version']}"))

umbrel = Path('packaging/umbrel/docker-compose.yml')
if umbrel.exists():
    data = yaml_file(umbrel)
    image = ((data.get('services') or {}).get('main') or {}).get('image')
    if image:
        refs.append(('umbrel', image))

casaos = Path('packaging/casaos/docker-compose.yml')
if casaos.exists():
    data = yaml_file(casaos)
    services = data.get('services') or {}
    main_name = (data.get('x-casaos') or {}).get('main')
    image = (services.get(main_name) or {}).get('image') if main_name else None
    if image:
        refs.append(('casaos', image))

for package, ref in refs:
    print(f'{package}|{ref}')
PYTHON
)

while IFS='|' read -r package ref; do
	[ -n "$package" ] || continue
	inspect=""
	if command -v docker >/dev/null 2>&1; then
		inspect=$(docker buildx imagetools inspect "$ref" 2>/dev/null)
	fi
	if [ -z "$inspect" ]; then
		if [ "${PACKAGING_REGISTRY_REQUIRED:-0}" = 1 ]; then
			note FAIL "$package image $ref could not be inspected while registry validation is required"
			fail=1
		else
			note SKIP "$package image $ref is unreachable; this run does not publish a package reference"
		fi
		continue
	fi

	note OK "$package image resolves: $ref"
	for platform in linux/amd64 linux/arm64; do
		if grep -q "Platform:[[:space:]]*$platform" <<<"$inspect"; then
			note OK "$package image contains $platform"
		else
			note FAIL "$package image is missing $platform"
			fail=1
		fi
	done

	if [ "$package" = home-assistant ]; then
		ha_version=${ref##*:}
		image_json=$(docker buildx imagetools inspect --format '{{json .Image}}' "$ref" 2>/dev/null || true)
		if IMAGE_JSON=$image_json python3 - "$ha_version" <<'PYTHON'
import json
import os
import sys

version = sys.argv[1]
images = json.loads(os.environ['IMAGE_JSON'])
for platform, expected_arch in [('linux/amd64', 'amd64'), ('linux/arm64', 'aarch64')]:
    config = images[platform]['config']
    labels = config.get('Labels') or {}
    expected = {'io.hass.version': version, 'io.hass.type': 'app', 'io.hass.arch': expected_arch}
    if any(labels.get(key) != value for key, value in expected.items()):
        raise SystemExit(1)
    if config.get('User') not in (None, '', '0', 'root'):
        raise SystemExit(1)
PYTHON
		then
			note OK "home-assistant image labels and root entrypoint are valid on both architectures"
		else
			note FAIL "home-assistant image labels or root entrypoint are invalid"
			fail=1
		fi
	fi
done <<<"$registry_refs"

echo
[ "$fail" = 0 ] && echo "packages consistent" || echo "PACKAGE DRIFT — see FAIL above"
exit "$fail"
