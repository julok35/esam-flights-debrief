/* Service worker Debrief drone ESAM : toute l'appli en cache à l'installation, servie depuis le cache (le terrain est
 * souvent sans réseau). Nouvelle version de l'appli : nouveau nom de cache, l'ancien est supprimé. */
var V = 'esam-debrief-v1.3.2';
var SHELL = [
  './',
  'index.html',
  'app.css',
  'manifest.webmanifest',
  'questionnaire.json',
  'logo.png',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-192.png',
  'icon-maskable-512.png',
  'js/app.js',
  'js/cloud.js',
  'js/config.js',
  'js/exporter.js',
  'js/form.js',
  'js/geo.js',
  'js/history.js',
  'js/importer.js',
  'js/markdown.js',
  'js/model.js',
  'js/stats.js',
  'js/store.js',
  'js/sync.js',
  'js/util.js',
  'js/version.js',
  'js/view.js',
  'vendor/fonts/fonts.css',
  'vendor/fonts/anton-latin.woff2',
  'vendor/fonts/anton-latin-ext.woff2',
  'vendor/fonts/montserrat-latin.woff2',
  'vendor/fonts/montserrat-latin-ext.woff2'
];
self.addEventListener('install', function (e) {
  e.waitUntil(
    caches
      .open(V)
      .then(function (c) {
        return c.addAll(
          SHELL.map(function (u) {
            return new Request(u, { cache: 'reload' });
          })
        );
      })
      .then(function () {
        return self.skipWaiting();
      })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches
      .keys()
      .then(function (ks) {
        return Promise.all(
          ks
            .filter(function (k) {
              return k !== V;
            })
            .map(function (k) {
              return caches.delete(k);
            })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

// Cache d'abord (appli seulement : les appels à Supabase, d'une autre origine, passent directement au réseau) : versions cohérentes entre fichiers, ouverture instantanée sans réseau. Les mises à jour arrivent
// avec un nouveau sw.js (nouveau V), que le navigateur vérifie à chaque ouverture avec du réseau.
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  var nav = req.mode === 'navigate';
  e.respondWith(
    caches.match(nav ? 'index.html' : req, { cacheName: V, ignoreSearch: true }).then(function (hit) {
      return hit || fetch(req);
    })
  );
});
