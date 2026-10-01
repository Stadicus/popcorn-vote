import { describe, it, expect } from 'vitest';
import { splitList } from './list';

describe('splitList()', () => {
	it('splits at a Latin comma', () => {
		expect(splitList('Netflix, Google,Server')).toEqual(['Netflix', ' Google', 'Server']);
	});

	it('splits at an Arabic comma as well, and at both mixed', () => {
		expect(splitList('ar، en،original')).toEqual(['ar', ' en', 'original']);
		expect(splitList('نتفليكس، Google, Server')).toEqual(['نتفليكس', ' Google', ' Server']);
	});

	it('leaves trimming and empty parts to the caller', () => {
		expect(splitList('')).toEqual(['']);
		expect(splitList('a,،')).toEqual(['a', '', '']);
	});
});
