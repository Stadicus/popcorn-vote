#!/usr/bin/env bash
#
# Trips the build when a physical CSS direction reappears in the interface.
#
#   .github/no-physical-css.sh
#
# The layout is written in logical properties (`margin-inline-start`,
# `inset-inline-end`, `text-align: start`), so that a right-to-left language
# mirrors it without a stylesheet of its own. A `margin-left` looks right in
# every left-to-right language and is only wrong in Arabic, where nobody on the
# team reads along, which is why a script watches for it.
#
# **Be honest about its reach: it matches property names, nothing else.** A
# `translateX()`, a `justify-content: flex-end` or an absolutely placed SVG
# walk straight past it. The visual check in a right-to-left language stays the
# real gate.
set -euo pipefail

# Svelte files are scanned whole, not just their <style> block: a hit outside of
# it is not expected in this repository and would be reported all the same.
roots=(src)

# Every root has to exist, or a rename would quietly shrink what is scanned and
# this script would still report success.
for root in "${roots[@]}"; do
	if [ ! -e "$root" ]; then
		echo "$0: '$root' does not exist, the scan would silently cover less." >&2
		exit 1
	fi
done

# `left:` and `right:` count only at the start of a declaration, so that prose
# in a comment ("top right: the circles …") does not trip.
pattern='(margin|padding|border)-(left|right)|text-align\s*:\s*(left|right)|\bfloat\s*:|(?:^|[{;])\s*(left|right)\s*:'

# `grep` exits 1 for "no match" and 2 for a real error. Only the first is fine;
# swallowing both would turn a broken scan into a green run.
set +e
hits=$(grep -rnPI --include='*.svelte' --include='*.css' "$pattern" "${roots[@]}")
status=$?
set -e
if [ "$status" -gt 1 ]; then
	echo "$0: grep failed with $status, the scan did not complete." >&2
	exit 1
fi

# A deliberate physical direction carries `/* physical-ok: <reason> */` on the
# same line: symmetric offsets, centring with translateX(-50%), decoration.
hits=$(printf '%s\n' "$hits" | { grep -vP '/\*\s*physical-ok:\s*\S' || true; } | { grep -v '^$' || true; })

if [ -n "$hits" ]; then
	echo "Physical CSS directions found where the layout should be logical:" >&2
	printf '%s\n' "$hits" >&2
	echo >&2
	echo "Use the logical property (margin-inline-start, inset-inline-end, text-align: start, …)." >&2
	echo "If the direction is deliberate, add /* physical-ok: <reason> */ on the same line." >&2
	exit 1
fi

echo "No physical CSS directions found."
