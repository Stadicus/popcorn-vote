/// <reference types="@sveltejs/kit" />
import { build, files, version } from '$service-worker';

const CACHE = `pv-${version}`;
const ASSETS = [...build, ...files];
const OFFLINE = '/offline.html';

self.addEventListener('install', (event) => {
	const e = event as ExtendableEvent;
	e.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('activate', (event) => {
	const e = event as ExtendableEvent;
	e.waitUntil(
		caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
	);
});

self.addEventListener('fetch', (event) => {
	const e = event as FetchEvent;
	if (e.request.method !== 'GET') return;
	const url = new URL(e.request.url);
	if (url.origin === location.origin && ASSETS.includes(url.pathname)) {
		e.respondWith(
			caches.open(CACHE).then((cache) => cache.match(e.request).then((hit) => hit ?? fetch(e.request)))
		);
		return;
	}

	if (e.request.mode === 'navigate') {
		e.respondWith(
			fetch(e.request).catch(async () => {
				const cache = await caches.open(CACHE);
				return (await cache.match(OFFLINE)) ?? Response.error();
			})
		);
	}
});
