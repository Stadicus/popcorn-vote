#!/usr/bin/env bash
# Materialize store-discoverable metadata only after the release image exists.
set -euo pipefail

if [ "$#" -ne 2 ]; then
	echo "usage: HA_TESTED_ARCH=amd64|aarch64 $0 <version> <manifest-list-digest>" >&2
	exit 2
fi

version=$1
digest=$2
tested_arch=${HA_TESTED_ARCH:-}
image=ghcr.io/stadicus/popcorn-vote

[[ $version =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "invalid version: $version" >&2; exit 2; }
[[ $digest =~ ^sha256:[0-9a-f]{64}$ ]] || { echo "invalid digest: $digest" >&2; exit 2; }
case $tested_arch in
	amd64) untested_arch=aarch64 ;;
	aarch64) untested_arch=amd64 ;;
	*) echo "HA_TESTED_ARCH must name the Home Assistant OS device-tested family: amd64 or aarch64" >&2; exit 2 ;;
esac

cd "$(dirname "$0")/.."
test "$(node -p "require('./package.json').version")" = "$version" || {
	echo "package.json does not contain version $version" >&2
	exit 1
}

inspect=$(docker buildx imagetools inspect "$image:$version@$digest")
for platform in linux/amd64 linux/arm64; do
	grep -q "Platform:[[:space:]]*$platform" <<<"$inspect" || {
		echo "$image:$version@$digest is missing $platform" >&2
		exit 1
	}
	done

image_json=$(docker buildx imagetools inspect --format '{{json .Image}}' "$image:$version@$digest")
IMAGE_JSON=$image_json python3 - "$version" <<'PYTHON'
import json
import os
import sys

version = sys.argv[1]
images = json.loads(os.environ['IMAGE_JSON'])
for platform, expected_arch in [('linux/amd64', 'amd64'), ('linux/arm64', 'aarch64')]:
    config = images[platform]['config']
    labels = config.get('Labels') or {}
    expected = {
        'io.hass.version': version,
        'io.hass.type': 'app',
        'io.hass.arch': expected_arch,
    }
    for key, value in expected.items():
        if labels.get(key) != value:
            raise SystemExit(f'{platform} label {key} is {labels.get(key)!r}, expected {value!r}')
    if config.get('User') not in (None, '', '0', 'root'):
        raise SystemExit(f'{platform} starts as {config.get("User")!r}; the ownership entrypoint cannot adopt /data')
PYTHON

render() {
	local source=$1 target=$2
	sed \
		-e "s/__VERSION__/$version/g" \
		-e "s/__DIGEST__/$digest/g" \
		-e "s/__RELEASE_DATE__/$(date -u +%F)/g" \
		-e "s/__HA_TESTED_ARCH__/$tested_arch/g" \
		-e "s/__HA_UNTESTED_ARCH__/$untested_arch/g" \
		"$source" > "$target"
}

render packaging/home-assistant/repository.template.yaml repository.yaml
render packaging/home-assistant/config.template.yaml packaging/home-assistant/config.yaml
render packaging/home-assistant/README.template.md packaging/home-assistant/README.md
render packaging/home-assistant/DOCS.template.md packaging/home-assistant/DOCS.md
render packaging/home-assistant/CHANGELOG.template.md packaging/home-assistant/CHANGELOG.md
cp static/icon-512.png packaging/home-assistant/icon.png
cp static/icon-512.png packaging/home-assistant/logo.png
render packaging/casaos/docker-compose.template.yml packaging/casaos/docker-compose.yml

python3 - "$version" "$digest" <<'PYTHON'
from pathlib import Path
import re
import sys

version, digest = sys.argv[1:]
manifest = Path('packaging/umbrel/umbrel-app.yml')
compose = Path('packaging/umbrel/docker-compose.yml')
manifest.write_text(re.sub(r'(?m)^version: "[^"]+"$', f'version: "{version}"', manifest.read_text()))
compose.write_text(re.sub(
    r'(?m)^(\s*image: ghcr\.io/stadicus/popcorn-vote:)[^@\s]+@sha256:[0-9a-f]{64}$',
    rf'\g<1>{version}@{digest}',
    compose.read_text(),
))
PYTHON

for package in home-assistant casaos; do
	grep -qx "$package" packaging/required-packages.txt || printf '%s\n' "$package" >> packaging/required-packages.txt
done

bash packaging/check.sh
echo "Release metadata for $version is materialized and locally validated."
echo "Review and test it; this script does not commit, push, submit, or publish anything."
