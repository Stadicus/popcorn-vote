import { type DB, metaGet, metaSet } from './db';

/**
 * Who is not there tonight, shared across every device.
 *
 * The evaluation page holds its own copy while somebody taps chips, but the
 * television has no way to learn about that: it polls `/api/tv` and would
 * otherwise keep counting every vote, crowning a movie that then does not win.
 * This is the one place all of them read from.
 *
 * A single row in `meta`, next to `last_credit_check` and the `pin_global_*`
 * entries, because it is a singleton and needs no schema of its own.
 *
 * Deliberately **not** an input to the rules. `evaluate()` and `freePick()`
 * write here and never read; they still count with the `absent` of their own
 * request. That keeps this from becoming a second, competing truth.
 */
const KEY = 'tonight_absent';

/**
 * How long an entry counts as tonight's.
 *
 * Without a limit the television would still dim movies next week for an
 * evening nobody ever confirmed. Twelve hours is the shortest span that safely
 * covers a real evening (chosen at seven, watched at eleven, confirmed the next
 * morning) while staying shorter than the gap to the next one. Six would cut a
 * long evening in half, twenty-four would carry the selection into the
 * following day.
 *
 * Deliberately not a clock time ("until 6 a.m."): that would hang on the
 * configured timezone and put a second time rule next to `schedule.ts`.
 */
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

interface Stored {
	absent: string[];
	at: string;
}

/**
 * Tonight's absent people, or an empty list.
 *
 * Never throws. It hangs off the TV poll and off loading two pages, so a
 * mangled row has to read as "everybody is here" rather than as a 500: the
 * worst case of getting this wrong is a board that counts every vote, which is
 * exactly what the app did before this existed.
 *
 * Filtered against the family as it is configured *now*. Somebody removed from
 * the configuration while the evening was running would otherwise come back as
 * a bare id nobody can untick: the chip row would not show them, the
 * confirmation would name the raw id, and `/api/evaluate` would refuse the whole
 * night with `rule.unknownPerson` from a screen that marks nobody as away.
 */
export function tonightAbsent(db: DB, members: { id: string }[]): string[] {
	const raw = metaGet(db, KEY);
	if (!raw) return [];

	let stored: unknown;
	try {
		stored = JSON.parse(raw);
	} catch {
		return [];
	}
	if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return [];

	const { absent, at } = stored as Partial<Stored>;
	if (!Array.isArray(absent) || absent.some((id) => typeof id !== 'string')) return [];

	const written = Date.parse(String(at));
	if (!Number.isFinite(written) || Date.now() - written > MAX_AGE_MS) return [];

	const known = new Set(members.map((m) => m.id));
	return (absent as string[]).filter((id) => known.has(id));
}

/**
 * Records who is away, with the moment it was recorded.
 *
 * The caller has validated the ids; nothing here checks them again. The
 * timestamp is what `tonightAbsent()` measures the age against, so every write
 * — including a write of the empty list — starts the twelve hours over.
 */
export function setTonightAbsent(db: DB, absent: string[]): void {
	metaSet(db, KEY, JSON.stringify({ absent, at: new Date().toISOString() } satisfies Stored));
}

/** The evening is over. `confirmWatched()` is the only caller. */
export function clearTonightAbsent(db: DB): void {
	metaSet(db, KEY, '');
}
