#!/usr/bin/env bash
# Prepare store metadata that can follow a release immediately. Home Assistant
# stays separate because it requires a real HA OS device acceptance test.
set -euo pipefail

if [ "$#" -ne 2 ]; then
	echo "usage: RELEASE_DATE=YYYY-MM-DD $0 <version> <manifest-list-digest>" >&2
	exit 2
fi

version=$1
digest=$2
release_date=${RELEASE_DATE:-$(date -u +%F)}
image=ghcr.io/stadicus/popcorn-vote

[[ $version =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "invalid version: $version" >&2; exit 2; }
[[ $digest =~ ^sha256:[0-9a-f]{64}$ ]] || { echo "invalid digest: $digest" >&2; exit 2; }
[[ $release_date =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || { echo "invalid release date: $release_date" >&2; exit 2; }

cd "$(dirname "$0")/.."
test "$(node -p "require('./package.json').version")" = "$version" || {
	echo "package.json does not contain version $version" >&2
	exit 1
}

inspection=$(docker buildx imagetools inspect "$image:$version")
tag_digest=$(awk '/^Digest:[[:space:]]+sha256:/{print $2; exit}' <<<"$inspection")
if [ "$tag_digest" != "$digest" ]; then
	echo "$image:$version resolves to ${tag_digest:-no manifest-list digest}, not $digest" >&2
	exit 1
fi
for platform in linux/amd64 linux/arm64; do
	grep -q "Platform:[[:space:]]*$platform" <<<"$inspection" || {
		echo "$image:$version is missing $platform" >&2
		exit 1
	}
done

python3 - "$version" "$digest" "$release_date" <<'PYTHON'
from pathlib import Path
import re
import sys

version, digest, release_date = sys.argv[1:]

manifest = Path('packaging/umbrel/umbrel-app.yml')
manifest_text, version_count = re.subn(
    r'(?m)^version: "[^"]+"$', f'version: "{version}"', manifest.read_text(), count=1
)
if version_count != 1:
    raise SystemExit('Umbrel manifest version field did not match exactly once')
release_notes = (
    f'Updates Popcorn Vote to version {version}. '
    f'See the full release notes at https://github.com/Stadicus/popcorn-vote/releases/tag/v{version}.'
)
manifest_text, notes_count = re.subn(
    r'(?m)^releaseNotes:.*$', f'releaseNotes: "{release_notes}"', manifest_text, count=1
)
if notes_count != 1:
    raise SystemExit('Umbrel releaseNotes field did not match exactly once')
manifest.write_text(manifest_text)

compose = Path('packaging/umbrel/docker-compose.yml')
compose_text, image_count = re.subn(
    r'(?m)^(\s*image: ghcr\.io/stadicus/popcorn-vote:)[^@\s]+@sha256:[0-9a-f]{64}$',
    rf'\g<1>{version}@{digest}',
    compose.read_text(),
    count=1,
)
if image_count != 1:
    raise SystemExit('Umbrel image field did not match exactly once')
compose.write_text(compose_text)

casa = (Path('packaging/casaos/docker-compose.template.yml').read_text()
    .replace('__VERSION__', version)
    .replace('__DIGEST__', digest)
    .replace('__RELEASE_DATE__', release_date))
if re.search(r'__[A-Z_]+__', casa):
    raise SystemExit('CasaOS template contains an unresolved placeholder')
Path('packaging/casaos/docker-compose.yml').write_text(casa)

required = Path('packaging/required-packages.txt')
if 'casaos' not in required.read_text().splitlines():
    required.write_text(required.read_text().rstrip() + '\ncasaos\n')
PYTHON

bash packaging/check.sh
echo "Umbrel and CasaOS metadata prepared for $version at $digest."
