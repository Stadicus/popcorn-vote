import fs from 'node:fs';
import path from 'node:path';
import { parseDocument, type Document, type Node } from 'yaml';
import { loadConfig, type ConfigUser } from './config';

export interface StoredUser {
	id: string;
	name: string;
	role: 'admin' | 'user';
	enabled: boolean;
	pin_hash: string;
}

function document(): { doc: Document<Node, true>; file: string } {
	const config = loadConfig();
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
	if (values.sessionTimeout !== undefined) doc.setIn(['security', 'session_timeout'], values.sessionTimeout);
	save(doc, file);
}

export function replaceUsers(users: StoredUser[]): void {
	const { doc, file } = document();
	doc.set('users', users);
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
