import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => ({ locale: locals.locale });
