import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { loadConfig } from './config';
import { replaceUsers, storedUsers, updateSettings } from './config-service';

let directory: string;
let previousConfig: string | undefined;
let previousDataDir: string | undefined;

beforeEach(() => {
	directory = fs.mkdtempSync(path.join(os.tmpdir(), 'popcorn-config-service-'));
	previousConfig = process.env.PV_CONFIG;
	previousDataDir = process.env.DATA_DIR;
	process.env.PV_CONFIG = path.join(directory, 'config.yaml');
	process.env.DATA_DIR = directory;
});

afterEach(() => {
	if (previousConfig === undefined) delete process.env.PV_CONFIG;
	else process.env.PV_CONFIG = previousConfig;
	if (previousDataDir === undefined) delete process.env.DATA_DIR;
	else process.env.DATA_DIR = previousDataDir;
	fs.rmSync(directory, { recursive: true, force: true });
	loadConfig(true);
});

describe('writable configuration', () => {
	it('creates a readable config atomically and never stores a clear-text PIN', () => {
		replaceUsers([{ id: 'anna', name: 'Anna', role: 'admin', enabled: true, pin_hash: 'scrypt$salt$hash' }]);
		const file = process.env.PV_CONFIG!;
		const source = fs.readFileSync(file, 'utf8');
		expect(source).toContain('pin_hash: scrypt$salt$hash');
		expect(source).not.toMatch(/^pin:/m);
		expect(fs.existsSync(`${file}.tmp-${process.pid}`)).toBe(false);
		expect(storedUsers()).toMatchObject([{ id: 'anna', role: 'admin' }]);
	});

	it('preserves settings outside the UI-owned subset', () => {
		fs.writeFileSync(process.env.PV_CONFIG!, 'token:\n  cap: 9\nsources:\n  - Cinema\n');
		loadConfig(true);
		updateSettings({ title: 'Family Cinema', timezone: 'Europe/Zurich', sessionTimeout: 3600 });
		const raw = parse(fs.readFileSync(process.env.PV_CONFIG!, 'utf8'));
		expect(raw).toMatchObject({
			title: 'Family Cinema',
			timezone: 'Europe/Zurich',
			security: { session_timeout: 3600 },
			token: { cap: 9 },
			sources: ['Cinema']
		});
	});
});
