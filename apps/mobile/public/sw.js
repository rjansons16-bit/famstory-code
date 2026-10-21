/*
 * FamStory's service worker - what lets a browser install the web app as an
 * app of its own, on a computer or a phone (lib/install.ts registers it).
 *
 * It keeps NOTHING. No page, no photograph, no answer from the server is
 * cached here, on purpose: the family and its events come from the server on
 * every launch, and a copy on the device would leave a removed member holding
 * everything they could once see (CLAUDE.md, "Persisted state is
 * credentials"). Every request goes to the network exactly as if this file
 * were not here.
 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// A fetch handler is what browsers look for before they offer to install. It
// answers nothing itself, so the browser fetches every request as usual.
self.addEventListener('fetch', () => {});
