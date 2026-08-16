#!/usr/bin/env node
// One YAML parser for shell/Python packaging checks. The `yaml` package is an
// application dependency installed by `npm ci`, unlike an implicit system-wide
// PyYAML installation that varies between CI runner images.
import { readFileSync } from 'node:fs';
import YAML from 'yaml';

const source = process.argv[2];
if (!source) {
	console.error('usage: yaml-to-json.mjs <file|->');
	process.exit(2);
}

const text = readFileSync(source === '-' ? 0 : source, 'utf8');
process.stdout.write(JSON.stringify(YAML.parse(text) ?? {}));
