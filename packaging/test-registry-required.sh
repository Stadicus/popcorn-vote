#!/usr/bin/env bash
# Regression checks for the PR registry-validation decision.
set -euo pipefail

cd "$(dirname "$0")/.."

test "$(bash packaging/registry-required.sh HEAD HEAD)" = false

for base in refs/heads/definitely-missing-registry-base refs/heads/also-missing-registry-base; do
	if bash packaging/registry-required.sh "$base" HEAD >/dev/null 2>&1; then
		echo "registry gate accepted missing revision $base" >&2
		exit 1
	fi
done

if bash packaging/registry-required.sh HEAD refs/heads/definitely-missing-registry-head >/dev/null 2>&1; then
	echo "registry gate accepted a missing head revision" >&2
	exit 1
fi

echo "registry validation decision fails closed"
