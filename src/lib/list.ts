/**
 * Comma-separated input, from a form field or an environment variable.
 *
 * An Arabic keyboard types "،" (U+060C) where a Latin one types ",", and nobody
 * switching the layout for one character should find their sources arriving as
 * a single entry. Both separate. The parts are returned as typed; trimming and
 * dropping empty ones is up to the caller, as it was with `split(',')`.
 */
export function splitList(value: string): string[] {
	return value.split(/[,،]/);
}
