#!/usr/bin/env bash

# Classify a NUL-delimited list of paths changed by one main commit. The
# marketing website lives in this repository for convenient publishing, but it
# is not part of the application image and must not start an app release.

set -euo pipefail

seen=false
website_only=true

while IFS= read -r -d '' path; do
	seen=true
	case "$path" in
		docs/website/* | docs/website-src/* | .prettierignore | .github/no-german-characters.sh) ;;
		*) website_only=false ;;
	esac
done

# Be conservative for an empty or malformed diff: building unnecessarily is
# safer than silently suppressing an application release.
if "$seen" && "$website_only"; then
	echo website-only
else
	echo app
fi
