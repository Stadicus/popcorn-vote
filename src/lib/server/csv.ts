import type { DB } from './db';
import { archiveMovies, listMovies } from './views';

/**
 * CSV in the Excel dialect: semicolon as the separator, CRLF, UTF-8 with a BOM
 * (otherwise Excel renders non-ASCII characters wrongly).
 */
export function toCsv(rows: (string | number | null)[][]): string {
	const escape = (value: string | number | null) => {
		const text = String(value ?? '');
		// A cell opening with one of these is a formula to Excel and LibreOffice,
		// and the quotes below are CSV syntax that does not stop them reading it as
		// one. A leading apostrophe does: it marks the rest as text. The line breaks
		// are in the list because no title should have to be trimmed elsewhere for
		// this to hold.
		const safe = /^[=+\-@\t\r\n]/.test(text) ? "'" + text : text;
		return '"' + safe.replace(/"/g, '""') + '"';
	};
	return '\uFEFF' + rows.map((row) => row.map(escape).join(';')).join('\r\n') + '\r\n';
}

export function archiveCsv(db: DB): string {
	const rows: (string | number | null)[][] = [
		['Title', 'Year', 'Watched on', 'Average', 'Ratings', 'Genre', 'Suggested by']
	];
	for (const m of archiveMovies(db)) {
		rows.push([
			m.title,
			m.year,
			m.watchedAt ? m.watchedAt.slice(0, 10) : null,
			m.average != null ? String(m.average).replace('.', ',') : null,
			m.ratings.map((r) => `${r.personId}: ${String(r.stars).replace('.', ',')}`).join(', '),
			m.genres,
			m.proposedBy
		]);
	}
	return toCsv(rows);
}

export function listCsv(db: DB): string {
	const rows: (string | number | null)[][] = [['Title', 'Year', 'Votes', 'Suggested by', 'Source', 'Genre']];
	for (const m of listMovies(db)) {
		rows.push([m.title, m.year, m.tokens, m.proposedBy, m.sourceHint, m.genres]);
	}
	return toCsv(rows);
}

export interface ImportRow {
	title: string;
	year: number | null;
}

/** The heading that counts as a header row rather than as a film title. */
const HEADER_TITLE = 'title';

/**
 * Tolerant CSV import: semicolon or comma as the separator, an optional header
 * row ("Title…"), first column the title, second optionally the year.
 */
export function parseImportCsv(text: string): ImportRow[] {
	const lines = text
		.replace(/^\uFEFF/, '')
		.split(/\r?\n/)
		.map((l) => l.trim())
		.filter((l) => l.length > 0);
	if (lines.length === 0) return [];

	const sep = (lines[0].match(/;/g) ?? []).length >= (lines[0].match(/,/g) ?? []).length ? ';' : ',';
	const rows: ImportRow[] = [];
	for (const [index, line] of lines.entries()) {
		const cells = splitCsvLine(line, sep);
		const title = (cells[0] ?? '').trim();
		if (!title) continue;
		if (index === 0 && title.toLowerCase() === HEADER_TITLE) continue; // header row
		const year = Number((cells[1] ?? '').trim());
		rows.push({ title, year: Number.isInteger(year) && year > 1800 && year < 2200 ? year : null });
	}
	return rows;
}

function splitCsvLine(line: string, sep: string): string[] {
	const cells: string[] = [];
	let current = '';
	let quoted = false;
	for (let i = 0; i < line.length; i++) {
		const ch = line[i];
		if (quoted) {
			if (ch === '"' && line[i + 1] === '"') {
				current += '"';
				i++;
			} else if (ch === '"') {
				quoted = false;
			} else {
				current += ch;
			}
		} else if (ch === '"') {
			quoted = true;
		} else if (ch === sep) {
			cells.push(current);
			current = '';
		} else {
			current += ch;
		}
	}
	cells.push(current);
	return cells;
}
