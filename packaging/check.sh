#!/usr/bin/env bash
# Checks the app store packages against the container they install.
#
# A package repeats the port, the data path and the variable names that live in
# docker-compose.yml, and none of that fails loudly when it drifts: the
# container ignores a variable it does not know, and a wrong port only produces
# a link that does not answer. Run this after touching docker-compose.yml, the
# packages, or any environment variable.
#
# What is verified is exactly what is printed below and nothing beyond it.
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
		note FAIL "$f"
		fail=1
	fi
done

echo
echo "Variable names known to the application"
# A `while read` at the end of a pipe runs in a subshell, so `fail=1` set inside
# it would be lost on the way out. An earlier version worked around that with a
# marker file at a fixed path in /tmp, which let two runs at once hand each
# other's verdict around. A here-string keeps the loop in this shell instead.
targets=$(grep -ho 'Target="[A-Z_][A-Z_]*"' packaging/*/*.xml 2>/dev/null | sed 's/Target="//;s/"//' | sort -u)
while read -r v; do
	[ -n "$v" ] || continue
	# Whole word: a substring match would accept PV_TIMEZONE merely because
	# PV_TIMEZONE_OFFSET exists, which is the very drift being hunted here.
	if grep -rqw -- "$v" src/ 2>/dev/null; then
		note OK "$v"
	else
		note FAIL "$v is set by a package but read nowhere in src/"
		fail=1
	fi
done <<<"$targets"

echo
echo "Port and data path match the container"
# Both are hardcoded in the template and neither is a variable name, so the
# check above would never notice them drifting apart from the compose file.
compose_port=$(grep -oE "^[[:space:]]+- '[0-9]+:[0-9]+'" docker-compose.yml | grep -oE ":[0-9]+'" | tr -d ":'" | head -1)
compose_path=$(grep -oE '^[[:space:]]+- popcorn-vote-data:/[a-z]+' docker-compose.yml | sed 's|.*:||' | head -1)
for f in packaging/*/*.xml; do
	[ -e "$f" ] || continue
	grep -q '<Container' "$f" || continue
	tmpl_port=$(grep -oE 'Type="Port"' "$f" >/dev/null 2>&1 && grep -oE 'Target="[0-9]+"' "$f" | grep -oE '[0-9]+' | head -1)
	tmpl_path=$(grep -oE 'Target="/[a-z]+"' "$f" | sed 's/Target="//;s/"//' | head -1)
	if [ -n "$compose_port" ] && [ "$tmpl_port" = "$compose_port" ]; then
		note OK "port $tmpl_port matches docker-compose.yml"
	else
		note FAIL "$f uses port ${tmpl_port:-none}, docker-compose.yml uses ${compose_port:-none}"
		fail=1
	fi
	if [ -n "$compose_path" ] && [ "$tmpl_path" = "$compose_path" ]; then
		note OK "data path $tmpl_path matches docker-compose.yml"
	else
		note FAIL "$f mounts ${tmpl_path:-none}, docker-compose.yml uses ${compose_path:-none}"
		fail=1
	fi
done

echo
echo "ADDRESS_HEADER must not be set by a package"
# Right behind a reverse proxy, wrong for a direct install: the app would read
# the client address from a header the caller writes, and the brute-force brake
# on the PIN could be walked straight through. Only package files are searched;
# this script and the README name the variable in order to explain its absence.
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
