/**
 * ════════════════════════════════════════
 * PLAN DIRECTEUR — service worker (lecture hors connexion)
 * ════════════════════════════════════════
 *
 * Ce fichier ne garde que la COQUILLE de l'application : la page, ses styles, ses
 * scripts, ses icônes. Rien qui soit secret — tout cela est déjà public sur le site.
 *
 * Le CONTENU du plan (salaires, montants, siège) n'est jamais mis en cache ici. Il vit
 * dans IndexedDB, géré par `assets/js/plan-directeur.js`, qui sait l'effacer quand le
 * serveur répond que l'accès a été retiré. Un cache de service worker, lui, survivrait à
 * la révocation : c'est pour cela que les appels à l'API ne sont pas interceptés.
 *
 * Stratégie : réseau d'abord, cache en secours. En ligne, une correction déployée est vue
 * tout de suite ; hors ligne, la dernière coquille connue s'ouvre.
 *
 * Portée : enregistré avec `scope: './plan-directeur'`, il ne contrôle que cette page et
 * n'intercepte aucun autre espace du site.
 */

var CACHE = 'ec-plan-coquille-v1';

var COQUILLE = [
  'plan-directeur.html',
  'plan-directeur.webmanifest',
  'assets/css/site-refresh.css',
  'assets/css/plan-directeur.css',
  'assets/js/theme-init.js',
  'assets/js/theme.js',
  'assets/js/enviro-api.js',
  'assets/js/plan-directeur.js',
  'assets/brand/favicon.png',
  'assets/brand/logo-enviro-cleans.webp',
  'assets/brand/plan-icone-192.png',
  'assets/brand/plan-icone-512.png',
  'assets/brand/plan-icone-apple-180.png',
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE)
      .then(function (cache) { return cache.addAll(COQUILLE); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (cles) {
        return Promise.all(cles
          .filter(function (cle) { return cle.indexOf('ec-plan-coquille-') === 0 && cle !== CACHE; })
          .map(function (cle) { return caches.delete(cle); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

/** Chemin relatif au dossier du service worker, sans paramètres : « plan-directeur.html ». */
function cheminLocal(url) {
  var base = new URL('./', self.location.href).pathname;
  var chemin = new URL(url).pathname;
  return chemin.indexOf(base) === 0 ? chemin.slice(base.length) : null;
}

self.addEventListener('fetch', function (event) {
  var requete = event.request;
  if (requete.method !== 'GET') return;

  var url = new URL(requete.url);
  // L'API (autre origine) n'est jamais interceptée : voir l'en-tête de ce fichier.
  if (url.origin !== self.location.origin) return;

  var chemin = cheminLocal(requete.url);
  if (chemin === null || COQUILLE.indexOf(chemin) === -1) return;

  event.respondWith(
    fetch(requete)
      .then(function (reponse) {
        if (reponse && reponse.ok) {
          var copie = reponse.clone();
          caches.open(CACHE).then(function (cache) { cache.put(chemin, copie); });
        }
        return reponse;
      })
      .catch(function () {
        return caches.match(chemin).then(function (enCache) {
          return enCache || Response.error();
        });
      })
  );
});
