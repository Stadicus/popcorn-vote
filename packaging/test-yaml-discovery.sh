#!/usr/bin/env bash
# Prove that YAML validation reaches nested files such as HA translations.
set -euo pipefail

cd "$(dirname "$0")/.."
fixture_root=$(mktemp -d)
mkdir -p "$fixture_root/home-assistant/translations"
fixture="$fixture_root/home-assistant/translations/invalid.yaml"
cleanup() {
	rm -f "$fixture"
	rmdir "$fixture_root/home-assistant/translations" "$fixture_root/home-assistant" "$fixture_root"
}
trap cleanup EXIT

printf 'translation: [unterminated\n' > "$fixture"
if output=$(bash packaging/validate-yaml.sh "$fixture_root"); then
	echo "YAML validator accepted malformed nested YAML" >&2
	exit 1
fi

grep -Fq $'FAIL\t'"$fixture" <<<"$output" || {
	echo "YAML validator failed without reporting the nested fixture" >&2
	printf '%s\n' "$output" >&2
	exit 1
}

missing_root="$fixture_root/does-not-exist"
if missing_output=$(bash packaging/validate-yaml.sh "$missing_root"); then
	echo "YAML validator accepted a missing root" >&2
	exit 1
fi
grep -Fq $'FAIL\t'"$missing_root" <<<"$missing_output" || {
	echo "YAML validator did not report the missing root" >&2
	exit 1
}

echo "nested package YAML is validated"
