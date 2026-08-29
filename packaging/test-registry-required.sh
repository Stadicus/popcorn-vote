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

# A binary file in the diff (a gallery image, say) is not metadata and must not
# break the decision. Built as a detached commit so the test needs no fixture.
blob=$(printf '\377\330\377\340JFIF' | git hash-object -w --stdin)
index=$(mktemp)
trap 'rm -f "$index"' EXIT
GIT_INDEX_FILE=$index git read-tree HEAD
GIT_INDEX_FILE=$index git update-index --add --cacheinfo "100644,$blob,docs/store-gallery.jpg"
tree=$(GIT_INDEX_FILE=$index git write-tree)
commit=$(GIT_AUTHOR_NAME=test GIT_AUTHOR_EMAIL=test@example.invalid \
	GIT_COMMITTER_NAME=test GIT_COMMITTER_EMAIL=test@example.invalid \
	git commit-tree "$tree" -p HEAD -m "binary fixture")
test "$(bash packaging/registry-required.sh HEAD "$commit")" = false

echo "registry validation decision fails closed"
