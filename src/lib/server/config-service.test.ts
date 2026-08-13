import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { loadConfig } from './config';
import { replaceUsers, saveInitialSetup, storedUsers, updateSettings } from './config-service';

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

	it('stores a complete initial family setup with stable, unique member ids', () => {
		saveInitialSetup({
			pin: '2611',
			title: 'Friday films',
			members: ['Ana', 'Ana', 'Béla'],
			interfaceLanguage: 'de',
			movieLanguage: 'latin',
			movieFallbackLanguage: 'de-DE',
			certificationCountry: 'CH',
			trailerLanguages: ['original', 'de', 'en'],
			tokenAmount: 2,
			tokenWeekday: 5,
			tokenHour: 19,
			tokenCap: 7,
			tokenStart: 4,
			timezone: 'Europe/Zurich',
			sources: ['Cinema', 'Home']
		});
		const raw = parse(fs.readFileSync(process.env.PV_CONFIG!, 'utf8'));
		expect(raw).toMatchObject({
			pin: '2611',
			title: 'Friday films',
			members: [
				{ id: 'ana', name: 'Ana' },
				{ id: 'ana-2', name: 'Ana' },
				{ id: 'bela', name: 'Béla' }
			],
			token: { amount: 2, weekday: 5, hour: 19, cap: 7, start: 4 },
			timezone: 'Europe/Zurich',
			sources: ['Cinema', 'Home']
		});
	});

	it.each(['security: broken\n', 'security: null\n'])(
		'repairs a non-map security section when saving settings: %s',
		(source) => {
			fs.writeFileSync(process.env.PV_CONFIG!, `${source}title: Before\n`);
			loadConfig(true);
			expect(() => updateSettings({ title: 'After', sessionTimeout: 7200 })).not.toThrow();
			const raw = parse(fs.readFileSync(process.env.PV_CONFIG!, 'utf8'));
			expect(raw).toMatchObject({ title: 'After', security: { session_timeout: 7200 } });
		}
	);
});
