#!/usr/bin/env bash
# Checks the app store packages against the application they install.
#
# A package repeats ports, volumes and variable names that live somewhere else,
# and nothing fails when a name drifts: the container simply ignores what it does
# not know, and the setting silently has no effect. Run this after touching
# docker-compose.yml, the packages, or any environment variable.
set -uo pipefail
cd "$(dirname "$0")/.."
fail=0
note() { printf '  %-6s %s\n' "$1" "$2"; }

echo "XML well-formedness"
for f in packaging/*/*.xml; do
	[ -e "$f" ] || continue
	if python3 -c "import xml.dom.minidom,sys;xml.dom.minidom.parse(sys.argv[1])" "$f" 2>/dev/null; then
		note OK "$f"
	else
		note FAIL "$f"; fail=1
	fi
done

echo
echo "Variable names known to the application"
for f in packaging/*/*.xml; do
	[ -e "$f" ] || continue
	grep -o 'Target="[A-Z_][A-Z_]*"' "$f" | sed 's/Target="//;s/"//' | sort -u | while read -r v; do
		# Searched across the whole server tree: LOG_LEVEL lives in log.ts, the
		# PV_* ones in config.ts, so config.ts alone would report false misses.
		if grep -rq -- "$v" src/ 2>/dev/null; then
			note OK "$v"
		else
			note FAIL "$v is set by $f but read nowhere in src/"
			echo "DRIFT" >> /tmp/pv-pkg-drift
		fi
	done
done
[ -f /tmp/pv-pkg-drift ] && { fail=1; rm -f /tmp/pv-pkg-drift; }

echo
echo "ADDRESS_HEADER must not be set by a package"
# Right behind a reverse proxy, wrong for a direct install: the app would read
# the client address from a header the caller writes, and the brute-force brake
# on the PIN could be walked straight through.
# Only package files, never the prose: this check and the README both name the
# variable in order to explain why it is absent.
hits=$(grep -rl 'ADDRESS_HEADER' packaging/*/ 2>/dev/null | tr '\n' ' ')
if [ -n "$hits" ]; then
	note FAIL "found in: $hits"
	fail=1
else
	note OK "absent from all packages"
fi

echo
[ "$fail" = 0 ] && echo "packages consistent" || echo "PACKAGE DRIFT — see FAIL above"
exit "$fail"
