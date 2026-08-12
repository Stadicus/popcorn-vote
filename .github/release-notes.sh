#!/usr/bin/env bash
#
# Prints the CHANGELOG section of one version — the text a GitHub release is
# published with. Used twice by release.yml: once before the image is built, so
# a missing section stops the deploy instead of following it, and once after, to
# create the release.
#
#   .github/release-notes.sh 1.3.0 [CHANGELOG.md]
#
# Exits non-zero with a reason on stderr when there is nothing to publish.
# Covered by release-notes.test.ts, which runs in the normal test suite.
set -euo pipefail

version=${1:?version missing}
changelog=${2:-CHANGELOG.md}
tag="v$version"

if [ ! -r "$changelog" ]; then
	echo "$changelog is not readable." >&2
	exit 1
fi

set +e
section=$(
	awk -v heading="## $tag" '
		BEGIN { n = length(heading) }
		# Windows line endings would otherwise make this "## v1.3.0\r", and the
		# heading would never be found.
		{ sub(/\r$/, "") }
		# Compared character by character, not as a pattern: a version may contain
		# dots and brackets without them being read as a regex.
		!found && substr($0, 1, n) == heading &&
			(length($0) == n || substr($0, n + 1, 1) ~ /[[:space:]]/) { found = 1; next }
		# Stop at the next second-level heading — any of them, not only one of the
		# form "## v1.2.3". Otherwise the section would run silently past a heading
		# such as "## Version 1.0.0" or "## [1.0.0]" and the release would get half
		# the history appended.
		#
		# Deliberately without bookkeeping over code blocks: that costs more than
		# it brings in. An unpaired code fence — the most common Markdown typo —
		# would tip the count over, and then the whole rest of the changelog would
		# hang on the notes again, without complaint and on a green run. This way
		# the brake can only apply too early, never too late, and for that somebody
		# would have to write "## " at the start of a line inside a code block.
		#
		# "###" and deeper do not trigger it: there is no space in third position
		# there.
		found && /^##[[:space:]]/ { exit }
		found { print }
		END { exit found ? 0 : 3 }
	' "$changelog"
)
status=$?
set -e

if [ "$status" -eq 3 ]; then
	echo "No section \"## $tag\" found in $changelog." >&2
	exit 1
fi
if [ "$status" -ne 0 ]; then
	echo "$changelog could not be read (awk exited with $status)." >&2
	exit 1
fi
# Checked without a pipe: `printf | grep -q` returns 141 for a long section (grep
# bows out after the first match, printf gets EPIPE), and with `pipefail` a full
# section from about 64 KB on would count as empty.
case $section in
	*[![:space:]]*) ;;
	# Reported separately: whoever reads "not found" goes looking for the heading
	# and is at a loss when it is right there.
	*)
		echo "The section \"## $tag\" in $changelog is empty." >&2
		exit 1
		;;
esac

printf '%s\n' "$section"
