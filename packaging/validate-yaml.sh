#!/usr/bin/env bash
# Parse every YAML file below a directory and report one result per file.
set -uo pipefail

root=${1:-packaging}
fail=0
file_list=$(mktemp)
# shellcheck disable=SC2317 # Invoked indirectly by trap.
cleanup() {
	rm -f "$file_list"
}
trap cleanup EXIT

if [ ! -d "$root" ] || [ ! -r "$root" ]; then
	printf 'FAIL\t%s (YAML root is not a readable directory)\n' "$root"
	exit 1
fi

if ! find "$root" -type f \( -name '*.yml' -o -name '*.yaml' \) -print0 > "$file_list"; then
	printf 'FAIL\t%s (YAML traversal failed)\n' "$root"
	exit 1
fi

while IFS= read -r -d '' file; do
	if node packaging/yaml-to-json.mjs "$file" >/dev/null 2>&1; then
		printf 'OK\t%s\n' "$file"
	else
		printf 'FAIL\t%s\n' "$file"
		fail=1
	fi
done < "$file_list"

exit "$fail"
