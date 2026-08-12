import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// `release-notes.sh` decides whether a release goes out and with what text — and
// whether an image is built at all. Until now it ran untested, because it is not
// application code. That is exactly what makes it dangerous: a mistake in it
// only shows up when a release comes out wrong, or does not come out at all.
//
// The example files sit ready in testdata/, as with config.test.ts — no test
// writes to the file system.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, 'release-notes.sh');
const TESTDATA = path.join(HERE, 'testdata');

function notes(version: string, file: string): string {
	return execFileSync(SCRIPT, [version, path.join(TESTDATA, file)], { encoding: 'utf8' });
}

/** Runs it and returns the error text instead of throwing it. */
function error(version: string, file: string): string {
	try {
		notes(version, file);
		return '';
	} catch (err) {
		return String((err as { stderr?: Buffer }).stderr ?? '');
	}
}

describe('release-notes.sh', () => {
	it('cuts out exactly one section', () => {
		const text = notes('2.0.0', 'normal.md');
		expect(text).toContain('Two.');
		// Sub-headings belong to it, the next version does not.
		expect(text).toContain('### Teil');
		expect(text).not.toContain('One.');
		// The heading itself stays out, it carries only number and date.
		expect(text).not.toContain('## v2.0.0');
	});

	it('reports a version without a section', () => {
		expect(error('9.9.9', 'normal.md')).toContain('No section');
	});

	// Otherwise you go looking for the heading that is visibly right there.
	it('tells an empty section apart from a missing one', () => {
		const text = error('2.0.0', 'empty.md');
		expect(text).toContain('is empty');
		expect(text).not.toContain('No section');
	});

	// The most common Markdown typo: a code fence that is not paired. The example
	// file therefore has exactly ONE fence line — with a pair, a parity count
	// would be in balance and this test would prove nothing. Bookkeeping over code
	// blocks would tip over here and append the whole rest of the changelog to the
	// release notes, without complaint and on a green run.
	it('does not run into the next version at an unpaired code fence', () => {
		const text = notes('2.0.0', 'unpaired-fence.md');
		expect(text).toContain('Nachher');
		expect(text).not.toContain('MARKER-FROM-THE-PREVIOUS-VERSION');
	});

	// Not every heading is called "## v1.2.3". If the script braked only on that
	// form, it would run silently past "## Version 1.0.0".
	it('stops at every second-level heading, not only at versions', () => {
		const text = notes('2.0.0', 'other-heading.md');
		expect(text).toContain('Two.');
		expect(text).not.toContain('MARKER-FROM-THE-PREVIOUS-VERSION');
	});

	it('does not confuse v1.3.1 with v1.3.10', () => {
		expect(notes('1.3.1', 'prefix.md')).toContain('One.');
		expect(notes('1.3.1', 'prefix.md')).not.toContain('Ten.');
		expect(notes('1.3.10', 'prefix.md')).toContain('Ten.');
	});

	it('copes with Windows line endings and a tab after the version', () => {
		const text = notes('2.0.0', 'crlf-tab.md');
		expect(text).toContain('Text.');
		// The carriage returns really have to be gone, or they end up in the
		// published release text.
		expect(text).not.toContain('\r');
	});

	it('reports an unreadable file', () => {
		expect(error('2.0.0', 'does-not-exist.md')).toContain('is not readable');
	});

	// The real changelog is the file that counts: every published version has to
	// have its section, or its release run fails.
	it('finds the section of the current version in the real CHANGELOG', async () => {
		const { version } = JSON.parse(
			await import('node:fs/promises').then((fs) =>
				fs.readFile(path.join(HERE, '..', 'package.json'), 'utf8')
			)
		);
		const text = execFileSync(SCRIPT, [version, path.join(HERE, '..', 'CHANGELOG.md')], {
			encoding: 'utf8'
		});
		expect(text.trim().length).toBeGreaterThan(0);
	});
});
