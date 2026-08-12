import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const output = resolve(here, '../website');
const template = await readFile(resolve(here, 'index.html'), 'utf8');
const catalogue = JSON.parse(await readFile(resolve(here, 'messages.json'), 'utf8'));
const overrides = JSON.parse(await readFile(resolve(here, 'overrides.json'), 'utf8'));
const locales = Object.entries(catalogue.locales);
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const fail = (message) => {
	throw new Error(`Invalid website catalogue: ${message}`);
};
const sourceMessages = catalogue.messages.en;
if (!Array.isArray(sourceMessages) || sourceMessages.length === 0)
	fail('English source messages are missing');
if (new Set(sourceMessages).size !== sourceMessages.length) fail('English source messages must be unique');

const slugs = new Set();
for (const [locale, details] of locales) {
	if (!details.name || !details.slug || !details.ogLocale) fail(`${locale} has incomplete metadata`);
	if (slugs.has(details.slug)) fail(`duplicate URL slug: ${details.slug}`);
	slugs.add(details.slug);
	if (!catalogue.languageLabel[locale]) fail(`${locale} has no language-menu label`);
	const messages = catalogue.messages[locale];
	if (!Array.isArray(messages) || messages.length !== sourceMessages.length)
		fail(`${locale} must contain exactly ${sourceMessages.length} messages`);
	messages.forEach((message, index) => {
		if (typeof message !== 'string' || !message.trim()) fail(`${locale} message ${index} is empty`);
	});
	for (const [index, message] of Object.entries(overrides[locale] ?? {})) {
		if (!/^\d+$/.test(index) || Number(index) >= sourceMessages.length)
			fail(`${locale} override index ${index} is invalid`);
		if (typeof message !== 'string' || !message.trim()) fail(`${locale} override ${index} is empty`);
	}
}
for (const locale of Object.keys(overrides)) {
	if (!catalogue.locales[locale]) fail(`overrides exist for unknown locale ${locale}`);
}
sourceMessages.forEach((message, index) => {
	const pattern = new RegExp(escapeRegExp(message).replace(/\s+/g, '\\s+'));
	if (!pattern.test(template)) fail(`English source message ${index} does not occur in the template`);
});

const nativeName = (locale) => catalogue.locales[locale].name;
const urlSlug = (locale) => catalogue.locales[locale].slug;
const localeUrl = (locale) => `https://popcornvote.org/${urlSlug(locale)}/`;

const hreflangLinks = locales
	.map(([locale]) => `<link rel="alternate" hreflang="${locale}" href="${localeUrl(locale)}" />`)
	.concat('<link rel="alternate" hreflang="x-default" href="https://popcornvote.org/" />')
	.join('\n\t\t');

const languageMenu = (currentLocale) => {
	const label = catalogue.languageLabel[currentLocale];
	const items = locales
		.map(([locale]) => {
			const current = locale === currentLocale ? ' aria-current="page"' : '';
			return `<li><a href="/${urlSlug(locale)}/" hreflang="${locale}" lang="${locale}" data-language="${locale}"${current}><span>${nativeName(locale)}</span><span class="language-code">${locale}</span></a></li>`;
		})
		.join('');
	return `<details class="language-menu"><summary aria-label="${label}"><span aria-hidden="true">◎</span><span lang="${currentLocale}">${nativeName(currentLocale)}</span></summary><ul class="language-options">${items}</ul></details>`;
};

const translate = (html, locale) => {
	const replacements = catalogue.messages.en
		.map((english, index) => [english, overrides[locale]?.[index] ?? catalogue.messages[locale][index]])
		.filter(([english, localized]) => english && localized && english !== localized)
		.sort(([a], [b]) => b.length - a.length);
	let localized = html;
	for (const [english, translation] of replacements) {
		const pattern = new RegExp(escapeRegExp(english).replace(/\s+/g, '\\s+'), 'g');
		localized = localized.replace(pattern, () => translation);
	}
	return localized;
};

for (const [locale, details] of locales) {
	let html = translate(template, locale)
		.replaceAll('{{HTML_LANG}}', locale)
		.replaceAll('{{CANONICAL_URL}}', localeUrl(locale))
		.replaceAll('{{HREFLANG_LINKS}}', hreflangLinks)
		.replaceAll('{{OG_LOCALE}}', details.ogLocale)
		.replaceAll(
			'{{OG_LOCALE_ALTERNATES}}',
			locales
				.filter(([other]) => other !== locale)
				.map(([, other]) => `<meta property="og:locale:alternate" content="${other.ogLocale}" />`)
				.join('\n\t\t')
		)
		.replaceAll('{{LANGUAGE_MENU}}', languageMenu(locale));
	if (/{{[A-Z_]+}}/.test(html)) fail(`${locale} output contains an unresolved placeholder`);

	const languageScript = `
		<script>
			document.querySelectorAll('[data-language]').forEach((link) =>
				link.addEventListener('click', () => {
					try { localStorage.setItem('pv_website_language', link.dataset.language); } catch {}
				})
			);
			document.addEventListener('click', (event) => {
				document.querySelectorAll('.language-menu[open]').forEach((menu) => {
					if (!menu.contains(event.target)) menu.removeAttribute('open');
				});
			});
		</script>`;
	html = html.replace('</body>', `${languageScript}\n\t</body>`);

	const directory = resolve(output, details.slug);
	await mkdir(directory, { recursive: true });
	await writeFile(resolve(directory, 'index.html'), html);
}

const gatewayLinks = locales
	.map(
		([locale]) =>
			`<a href="/${urlSlug(locale)}/" hreflang="${locale}" lang="${locale}" data-language="${locale}">${nativeName(locale)}</a>`
	)
	.join('\n\t\t\t');

const gateway = `<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<meta name="robots" content="index, follow" />
		<meta name="theme-color" content="#ffbe36" />
		<meta name="description" content="Choose your language for Popcorn Vote, the free, self-hosted family movie night voting app." />
		<title>Popcorn Vote — Choose your language</title>
		<link rel="canonical" href="https://popcornvote.org/" />
		${hreflangLinks}
		<link rel="icon" href="/assets/favicon-32.png" sizes="32x32" type="image/png" />
		<meta property="og:type" content="website" />
		<meta property="og:site_name" content="Popcorn Vote" />
		<meta property="og:url" content="https://popcornvote.org/" />
		<meta property="og:title" content="Popcorn Vote: Fairer Family Movie Nights" />
		<meta property="og:description" content="Suggest films, save votes, settle ties with a wheel, and keep a shared film diary — all on your own server." />
		<meta property="og:image" content="https://popcornvote.org/assets/social-preview.png" />
		<meta property="og:image:width" content="1280" />
		<meta property="og:image:height" content="640" />
		<meta property="og:image:alt" content="Popcorn Vote preview with a popcorn bucket and voting symbols." />
		<meta name="twitter:card" content="summary_large_image" />
		<meta name="twitter:title" content="Popcorn Vote: Fairer Family Movie Nights" />
		<meta name="twitter:description" content="Self-hosted voting for family movie night." />
		<meta name="twitter:image" content="https://popcornvote.org/assets/social-preview.png" />
		<meta name="twitter:image:alt" content="Popcorn Vote preview with a popcorn bucket and voting symbols." />
		<style>
			:root { color-scheme: light; font-family: system-ui, sans-serif; color: #101923; background: #f7f4ed; }
			body { min-height: 100vh; margin: 0; display: grid; place-items: center; }
			main { width: min(680px, calc(100% - 2rem)); text-align: center; }
			.mark { font-size: 4rem; }
			h1 { margin: .4rem 0; font-size: clamp(2.5rem, 8vw, 5rem); letter-spacing: -.05em; }
			p { color: #59636c; }
			.languages { display: flex; flex-wrap: wrap; justify-content: center; gap: .65rem; margin-top: 2rem; }
			a { min-height: 44px; display: inline-flex; align-items: center; padding: .5rem 1rem; border: 1px solid #c9c1b5; border-radius: 999px; color: inherit; background: #fffdf8; font-weight: 700; text-decoration: none; }
			a:hover { border-color: #c75d09; }
			a:focus-visible { outline: 3px solid #08736f; outline-offset: 3px; }
		</style>
		<script>
			(() => {
				const supported = ${JSON.stringify(Object.fromEntries(locales.map(([locale, details]) => [locale.toLowerCase(), details.slug])))};
				let saved = null;
				try { saved = localStorage.getItem('pv_website_language'); } catch {}
				const browserLanguages = navigator.languages || [navigator.language];
				const requested = saved ? [saved, ...browserLanguages] : browserLanguages;
				for (const candidate of requested) {
					const normalized = candidate.toLowerCase();
					const exact = supported[normalized];
					const base = normalized.split('-')[0];
					const fallback = base === 'pt' ? supported['pt-br'] : supported[base];
					const slug = exact || fallback;
					if (slug) { location.replace('/' + slug + '/'); return; }
				}
			})();
		</script>
	</head>
	<body>
		<main>
			<div class="mark" aria-hidden="true">🍿</div>
			<h1 translate="no">Popcorn Vote</h1>
			<p>Choose your language · Sprache wählen · Elige tu idioma · Choisissez votre langue</p>
			<nav class="languages" aria-label="Language">
			${gatewayLinks}
			</nav>
		</main>
		<script>
			document.querySelectorAll('[data-language]').forEach((link) =>
				link.addEventListener('click', () => {
					try { localStorage.setItem('pv_website_language', link.dataset.language); } catch {}
				})
			);
		</script>
	</body>
</html>
`;

await writeFile(resolve(output, 'index.html'), gateway);

const sitemapAlternates = locales
	.map(([locale]) => `\t\t<xhtml:link rel="alternate" hreflang="${locale}" href="${localeUrl(locale)}" />`)
	.concat('\t\t<xhtml:link rel="alternate" hreflang="x-default" href="https://popcornvote.org/" />')
	.join('\n');
const sitemapUrls = [
	['https://popcornvote.org/', sitemapAlternates],
	...locales.map(([locale]) => [localeUrl(locale), sitemapAlternates])
]
	.map(([url, alternates]) => `\t<url>\n\t\t<loc>${url}</loc>\n${alternates}\n\t</url>`)
	.join('\n');
await writeFile(
	resolve(output, 'sitemap.xml'),
	`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${sitemapUrls}\n</urlset>\n`
);

console.log(`Generated ${locales.length} localized pages, the language gateway, and sitemap.xml.`);
