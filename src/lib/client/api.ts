import { invalidateAll } from '$app/navigation';
import type { MessageKey } from '$lib/i18n/catalogues';
import type { Translate } from '$lib/i18n/translate';

export interface ApiResult<T = Record<string, unknown>> {
	ok: boolean;
	data?: T;
	error?: string;
	errorKey?: MessageKey;
	reference?: string;
	keyProblem?: boolean;
}

export function errorText(result: ApiResult<unknown>, t: Translate): string {
	const text = result.error ?? (result.errorKey ? t(result.errorKey) : '');
	if (!result.reference) return text;
	return text ? `${text} ${t('error.reference', { reference: result.reference })}` : text;
}

export function redirectIfUnauthorized(res: Response): boolean {
	if (res.status === 401) {
		window.location.assign('/pin');
		return true;
	}
	return false;
}

export async function call<T = Record<string, unknown>>(
	url: string,
	options: { method?: string; body?: unknown; refresh?: boolean } = {}
): Promise<ApiResult<T>> {
	try {
		const res = await fetch(url, {
			method: options.method ?? 'POST',
			headers: options.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
			body: options.body !== undefined ? JSON.stringify(options.body) : undefined
		});
		if (res.status === 401) {
			window.location.assign('/pin');
			return { ok: false, errorKey: 'auth.required' };
		}
		const data = (await res.json().catch(() => ({}))) as T & {
			error?: string;
			reference?: string;
			keyProblem?: boolean;
		};
		if (!res.ok) {
			const reference = typeof data.reference === 'string' ? data.reference : undefined;
			return data.error
				? { ok: false, error: data.error, reference, keyProblem: data.keyProblem === true }
				: { ok: false, errorKey: 'error.unexpected', reference };
		}
		if (options.refresh !== false) await invalidateAll();
		return { ok: true, data };
	} catch {
		return { ok: false, errorKey: 'error.offline' };
	}
}
