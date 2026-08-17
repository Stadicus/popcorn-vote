#!/bin/sh
# Make an app-store-owned data mount usable, then permanently drop privileges.
# No application code or user-supplied command is ever run as root.
set -eu

if [ "$(id -u)" -ne 0 ]; then
	exec "$@"
fi

if ! command -v su-exec >/dev/null 2>&1; then
	echo "Cannot drop privileges: su-exec is not installed." >&2
	exit 1
fi

data_dir=${DATA_DIR:-/data}
sentinel="$data_dir/.ownership-migrated"

case "$data_dir" in
	"" | /)
		echo "Refusing to manage an unsafe DATA_DIR: '${data_dir:-<empty>}'" >&2
		exit 1
		;;
	/*) ;;
	*)
		echo "DATA_DIR must be an absolute path: $data_dir" >&2
		exit 1
		;;
esac

if [ -L "$data_dir" ]; then
	echo "Refusing to manage a DATA_DIR that is a symbolic link: $data_dir" >&2
	exit 1
fi

if [ -L "$sentinel" ]; then
	echo "Refusing to use a symbolic-link ownership marker: $sentinel" >&2
	exit 1
fi

mkdir -p "$data_dir"
chown node:node "$data_dir"

if [ ! -e "$sentinel" ]; then
	# find does not follow symlinks by default; -xdev also prevents a nested
	# mount from widening this one-time ownership migration. options.json belongs
	# to the Home Assistant Supervisor and the application deliberately ignores it.
	find "$data_dir" -xdev \
		-path "$data_dir/options.json" -prune -o \
		-exec chown -h node:node {} +
	: > "$sentinel"
	chown node:node "$sentinel"
fi

exec su-exec node:node "$@"
