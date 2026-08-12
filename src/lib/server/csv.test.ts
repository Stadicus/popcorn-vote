import { describe, it, expect } from 'vitest';
import { createDb } from './db';
import { archiveCsv, listCsv, parseImportCsv, toCsv } from './csv';

describe('CSV export', () => {
	it('gets quotes, semicolons and the BOM right', () => {
		const csv = toCsv([
			['Titel', 'Jahr'],
			['Der "große" Film; Teil 2', 1999]
		]);
		expect(csv.startsWith('\uFEFF')).toBe(true); // BOM for Excel
		expect(csv).toContain('"Der ""große"" Film; Teil 2";"1999"');
	});

	it('defuses a cell a spreadsheet would otherwise run as a formula', () => {
		// A title is free text, and the quoting here is CSV syntax that Excel and
		// LibreOffice read straight past. The leading apostrophe is what marks the
		// rest as text.
		const csv = toCsv([['=HYPERLINK("http://evil.example")', '+1', '-1', '@x', 'Vaiana']]);
		expect(csv).toContain(`"'=HYPERLINK(""http://evil.example"")";"'+1";"'-1";"'@x";"Vaiana"`);
	});

	it('defuses a cell that opens with a tab or a line break', () => {
		// Nothing writes a title like this today, because every path that stores one
		// trims it first. The list covers them anyway, so the guarantee does not
		// depend on every later path remembering to trim.
		expect(toCsv([['\t=1+1']])).toContain(`"'\t=1+1"`);
		expect(toCsv([['\n=1+1']])).toContain(`"'\n=1+1"`);
		expect(toCsv([['\r=1+1']])).toContain(`"'\r=1+1"`);
	});

	it('leaves ordinary values and numbers alone', () => {
		expect(toCsv([['Vaiana', 2016, null]])).toContain('"Vaiana";"2016";""');
	});

	it('exports list and archive with a header row', () => {
		const db = createDb(':memory:');
		db.prepare(
			"INSERT INTO movies (status, title, year, proposed_by, created_at, watched_at) VALUES ('archived', 'Vaiana', 2016, 'anna', datetime('now'), '2026-08-01T20:00:00.000Z')"
		).run();
		db.prepare(
			"INSERT INTO movies (status, title, year, proposed_by, created_at) VALUES ('list', 'Insider', 1999, 'ben', datetime('now'))"
		).run();
		db.prepare(
			"INSERT INTO ratings (movie_id, person_id, stars, rated_at) VALUES (1, 'anna', 4.5, datetime('now'))"
		).run();

		const archive = archiveCsv(db);
		expect(archive).toContain('"Title";"Year";"Watched on"');
		expect(archive).toContain('"Vaiana"');
		expect(archive).toContain('"2026-08-01"');
		expect(archive).toContain('4,5'); // German decimal notation

		const list = listCsv(db);
		// The header is pinned because it carries the word the family reads: since
		// 2.6.0 the column is called "Votes", while everything behind it still says
		// token. Without this line the two halves could be tidied into one another
		// unnoticed.
		expect(list).toContain('"Title";"Year";"Votes"');
		expect(list).toContain('"Insider"');
		expect(list).toContain('"ben"');
	});
});

describe('CSV import', () => {
	it('reads semicolon and comma files with and without a header row', () => {
		expect(parseImportCsv('Title;Year\r\nVaiana;2016\r\nInsider;1999')).toEqual([
			{ title: 'Vaiana', year: 2016 },
			{ title: 'Insider', year: 1999 }
		]);
		expect(parseImportCsv('Vaiana,2016\nInsider,')).toEqual([
			{ title: 'Vaiana', year: 2016 },
			{ title: 'Insider', year: null }
		]);
	});

	it('treats only the English header as a header row', () => {
		expect(parseImportCsv('Titel;Jahr\r\nVaiana;2016')).toEqual([
			{ title: 'Titel', year: null },
			{ title: 'Vaiana', year: 2016 }
		]);
	});

	it('copes with quotes, a BOM and blank lines', () => {
		expect(parseImportCsv('﻿"Der ""große"" Film; Teil 2";2001\n\n')).toEqual([
			{ title: 'Der "große" Film; Teil 2', year: 2001 }
		]);
	});

	it('ignores nonsensical years', () => {
		expect(parseImportCsv('Vaiana;abc')).toEqual([{ title: 'Vaiana', year: null }]);
		expect(parseImportCsv('Vaiana;12')).toEqual([{ title: 'Vaiana', year: null }]);
	});

	it('reads back the apostrophe the export puts in front of a formula', () => {
		// The price of defusing the cell: a title that really does begin with '='
		// carries the apostrophe into the list when its own export is imported
		// again. It costs one tap to correct, and is worth it.
		expect(parseImportCsv(`"'=1+1";2016`)).toEqual([{ title: "'=1+1", year: 2016 }]);
	});
});
