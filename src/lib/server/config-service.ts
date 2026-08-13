import fs from 'node:fs';
import path from 'node:path';
import { isMap, parseDocument, type Document, type Node } from 'yaml';
import { loadConfig, type ConfigUser } from './config';

export interface StoredUser {
	id: string;
	name: string;
	role: 'admin' | 'user';
	enabled: boolean;
	pin_hash: string;
}

export interface InitialSetup {
	pin: string;
	title: string;
	members: string[];
	tokenAmount: number;
	tokenWeekday: number;
	tokenHour: number;
	tokenCap: number;
	tokenStart: number;
	timezone: string;
	sources: string[];
	tmdbApiKey?: string;
	omdbApiKey?: string;
	interfaceLanguage: string;
	movieLanguage: string;
	movieFallbackLanguage: string;
	certificationCountry: string;
	trailerLanguages: string[];
}

const MEMBER_COLORS = ['#e63946', '#457b9d', '#2a9d8f', '#e9c46a', '#9b5de5', '#f4845f'];

function memberId(name: string, index: number, used: Set<string>): string {
	const base =
		name
			.toLowerCase()
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '') || `person-${index + 1}`;
	let id = base;
	let suffix = 2;
	while (used.has(id)) id = `${base}-${suffix++}`;
	used.add(id);
	return id;
}

function document(): { doc: Document<Node, true>; file: string } {
	// A write must resolve the path afresh: test instances and deployments may
	// select their data directory through the environment after another request
	// has populated the read cache.
	const config = loadConfig(true);
	const source = fs.existsSync(config.configFile) ? fs.readFileSync(config.configFile, 'utf8') : '';
	return { doc: parseDocument(source), file: config.configFile };
}

function save(doc: Document<Node, true>, file: string): void {
	fs.mkdirSync(path.dirname(file), { recursive: true });
	const temporary = `${file}.tmp-${process.pid}`;
	const descriptor = fs.openSync(temporary, 'w', 0o600);
	try {
		fs.writeFileSync(descriptor, doc.toString(), 'utf8');
		fs.fsyncSync(descriptor);
	} finally {
		fs.closeSync(descriptor);
	}
	fs.renameSync(temporary, file);
	const directory = fs.openSync(path.dirname(file), 'r');
	try {
		fs.fsyncSync(directory);
	} finally {
		fs.closeSync(directory);
	}
	loadConfig(true);
}

export function updateSettings(values: { title?: string; timezone?: string; sessionTimeout?: number }): void {
	const { doc, file } = document();
	if (values.title !== undefined) doc.set('title', values.title.trim());
	if (values.timezone !== undefined) doc.set('timezone', values.timezone.trim());
	if (values.sessionTimeout !== undefined) {
		if (!isMap(doc.get('security', true))) doc.set('security', doc.createNode({}));
		doc.setIn(['security', 'session_timeout'], values.sessionTimeout);
	}
	save(doc, file);
}

export function replaceUsers(users: StoredUser[]): void {
	const { doc, file } = document();
	doc.set('users', users);
	save(doc, file);
}

/** Writes the family and game choices made during the one-time browser setup. */
export function saveInitialSetup(values: InitialSetup): void {
	const { doc, file } = document();
	const usedIds = new Set<string>();
	doc.set('title', values.title.trim());
	doc.set('pin', values.pin);
	doc.set(
		'members',
		values.members.map((name, index) => ({
			id: memberId(name, index, usedIds),
			name: name.trim(),
			color: MEMBER_COLORS[index % MEMBER_COLORS.length],
			emoji: ''
		}))
	);
	doc.set('sources', values.sources);
	if (values.tmdbApiKey !== undefined) doc.set('tmdb_api_key', values.tmdbApiKey.trim());
	if (values.omdbApiKey !== undefined) doc.set('omdb_api_key', values.omdbApiKey.trim());
	if (!isMap(doc.get('language', true))) doc.set('language', doc.createNode({}));
	doc.setIn(['language', 'interface'], values.interfaceLanguage);
	doc.setIn(['language', 'primary'], values.movieLanguage);
	doc.setIn(['language', 'fallback'], values.movieFallbackLanguage);
	doc.setIn(['language', 'certification_country'], values.certificationCountry);
	doc.setIn(['language', 'trailer'], values.trailerLanguages.join(','));
	doc.set('timezone', values.timezone.trim());
	if (!isMap(doc.get('token', true))) doc.set('token', doc.createNode({}));
	doc.setIn(['token', 'amount'], values.tokenAmount);
	doc.setIn(['token', 'weekday'], values.tokenWeekday);
	doc.setIn(['token', 'hour'], values.tokenHour);
	doc.setIn(['token', 'cap'], values.tokenCap);
	doc.setIn(['token', 'start'], values.tokenStart);
	save(doc, file);
}

export function storedUsers(): StoredUser[] {
	return loadConfig().users.map((user: ConfigUser) => ({
		id: user.id,
		name: user.name,
		role: user.role,
		enabled: user.enabled,
		pin_hash: user.pinHash
	}));
}
