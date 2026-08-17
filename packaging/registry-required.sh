#!/usr/bin/env bash
# Print true when a PR changes the effective image reference of store metadata.
set -euo pipefail

if [ "$#" -ne 2 ]; then
	echo "usage: $0 <base-sha> <head-sha>" >&2
	exit 2
fi

python3 - "$1" "$2" <<'PYTHON'
from pathlib import PurePosixPath
import json
import re
import subprocess
import sys

base, head = sys.argv[1:]

def git(*args, check=False):
    return subprocess.run(
        ['git', *args],
        check=check,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

for revision in (base, head):
    try:
        git('rev-parse', '--verify', f'{revision}^{{commit}}', check=True)
    except subprocess.CalledProcessError as error:
        detail = error.stderr.decode().strip()
        raise SystemExit(f'cannot resolve Git revision {revision!r}: {detail}')

def read(revision, path):
    result = git('show', f'{revision}:{path}')
    return result.stdout.decode() if result.returncode == 0 else None

def sibling_exists(revision, path, name):
    sibling = str(PurePosixPath(path).parent / name)
    return git('cat-file', '-e', f'{revision}:{sibling}').returncode == 0

def yaml_text(text):
    result = subprocess.run(
        ['node', 'packaging/yaml-to-json.mjs', '-'],
        input=text.encode(),
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        check=True,
    )
    return json.loads(result.stdout)

def effective(revision, path):
    text = read(revision, path)
    if text is None:
        return None

    if path.endswith('.xml') and re.search(r'<Container(?:\s|>)', text):
        match = re.search(r'<Repository>([^<]+)</Repository>', text)
        return ('recognized', match.group(1).strip() if match else '<invalid>')

    name = PurePosixPath(path).name
    if name == 'config.yaml' and re.search(r'(?m)^\s*slug:', text) and re.search(r'(?m)^\s*(?:image|version):', text):
        try:
            data = yaml_text(text)
            return ('recognized', f"{data.get('image', '<missing>')}:{data.get('version', '<missing>')}")
        except (subprocess.CalledProcessError, json.JSONDecodeError):
            return ('recognized', '<invalid>')

    if name == 'docker-compose.yml':
        try:
            data = yaml_text(text)
        except (subprocess.CalledProcessError, json.JSONDecodeError):
            if re.search(r'(?m)^\s*x-(?:casaos|umbrel):', text):
                return ('recognized', '<invalid>')
            return None
        casa = data.get('x-casaos') or {}
        is_umbrel = bool(data.get('x-umbrel')) or sibling_exists(revision, path, 'umbrel-app.yml')
        if casa:
            service = ((data.get('services') or {}).get(casa.get('main')) or {})
            return ('recognized', service.get('image', '<missing>'))
        if is_umbrel:
            services = data.get('services') or {}
            service = services.get('main') or next((v for k, v in services.items() if k != 'app_proxy'), {})
            return ('recognized', service.get('image', '<missing>'))

    if name == 'umbrel-app.yml':
        return ('recognized', '<manifest-no-image>')
    return None

changed = git('diff', '--name-only', '-z', base, head, check=True).stdout.decode().split('\0')
for path in filter(None, changed):
    before = effective(base, path)
    after = effective(head, path)
    if before == after:
        continue
    if before is not None or after is not None:
        # A manifest-only version edit cannot change what is pulled. Its paired
        # Compose file must still agree, which packaging/check.sh verifies.
        refs = {item[1] for item in (before, after) if item is not None}
        if refs <= {'<manifest-no-image>'}:
            continue
        print('true')
        raise SystemExit(0)

print('false')
PYTHON
