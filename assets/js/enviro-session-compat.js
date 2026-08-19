/**
 * ════════════════════════════════════════
 * COMPATIBILITÉ DE SESSION — pages historiques
 * ════════════════════════════════════════
 *
 * Pontage temporaire pour les six espaces qui n'utilisent pas encore `enviro-api.js` :
 * gestionnaire.html, superviseur.html, collecteur.html, admin.html, administrateur.html,
 * dashboard.html.
 *
 * ── Le problème qu'il résout ──
 * L'access token est passé de 24 h à 2 h (il n'est pas révocable, sa seule protection est
 * sa durée de vie). Or AUCUNE de ces pages n'implémente le renouvellement : vérifié, elles
 * ne contiennent pas un seul appel à `/api/auth/refresh`. Sans ce script, tout le personnel
 * serait déconnecté toutes les deux heures — une régression franche d'un flux qui marche.
 *
 * ── Ce qu'il fait ──
 * Il enveloppe `window.fetch`. Sur une réponse 401 venant de l'API Enviro Cleans, il
 * renouvelle le token une fois, met à jour la clé de stockage utilisée par la page, puis
 * rejoue la requête. La page n'a rien à savoir de tout cela.
 *
 * ── Installation ──
 * Une seule ligne, AVANT le script de la page :
 *
 *     <script src="assets/js/enviro-session-compat.js"></script>
 *
 * ── Durée de vie ──
 * Ce fichier est destiné à DISPARAÎTRE. Quand une page passe à `EnviroAPI.appel()`, qui
 * gère nativement le renouvellement, retirez la ligne correspondante. Quand les six pages
 * sont migrées, supprimez ce fichier.
 */
(function (global) {
  'use strict';

  var BASE_URL = 'https://enviro-cleans-api.onrender.com';

  // Jeux de clés possibles, par ordre de recherche. La page utilise l'un d'eux ;
  // on découvre lequel plutôt que de le déduire du nom de fichier, plus fragile.
  var JEUX = [
    { access: 'ec.accessToken', refresh: 'ec.refreshToken' },
    { access: 'gestAccessToken', refresh: 'gestRefreshToken' },
    { access: 'supAccessToken', refresh: 'supRefreshToken' },
    { access: 'colAccessToken', refresh: 'colRefreshToken' },
    { access: 'admAccessToken', refresh: 'admRefreshToken' },
    { access: 'accessToken', refresh: 'refreshToken' },
  ];

  /** Tous les jeux de clés actuellement présents : la page peut en avoir plusieurs. */
  function jeuxPresents() {
    return JEUX.filter(function (j) { return localStorage.getItem(j.access); });
  }

  function refreshTokenDisponible() {
    for (var i = 0; i < JEUX.length; i += 1) {
      var t = localStorage.getItem(JEUX[i].refresh);
      if (t) return t;
    }
    return null;
  }

  /** Écrit le nouveau token dans TOUTES les clés déjà présentes, sans en créer. */
  function diffuser(accessToken, refreshToken) {
    jeuxPresents().forEach(function (j) {
      localStorage.setItem(j.access, accessToken);
      if (refreshToken) localStorage.setItem(j.refresh, refreshToken);
    });
  }

  var fetchOriginal = global.fetch.bind(global);
  var renouvellementEnCours = null;

  /** Mutualisé : dix appels expirés en même temps ne déclenchent qu'un renouvellement. */
  function renouveler() {
    if (renouvellementEnCours) return renouvellementEnCours;

    var refresh = refreshTokenDisponible();
    if (!refresh) return Promise.reject(new Error('SESSION_EXPIREE'));

    renouvellementEnCours = fetchOriginal(BASE_URL + '/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: refresh }),
    })
      .then(function (r) {
        if (!r.ok) throw new Error('SESSION_EXPIREE');
        return r.json();
      })
      .then(function (data) {
        diffuser(data.accessToken, data.refreshToken);
        return data.accessToken;
      })
      .finally(function () { renouvellementEnCours = null; });

    return renouvellementEnCours;
  }

  function estAppelApi(ressource) {
    var url = typeof ressource === 'string' ? ressource : (ressource && ressource.url) || '';
    return url.indexOf(BASE_URL) === 0;
  }

  /** Réécrit l'en-tête Authorization d'une requête déjà construite. */
  function avecNouveauToken(options, token) {
    var copie = Object.assign({}, options || {});
    var entetes = new Headers((options && options.headers) || {});
    entetes.set('Authorization', 'Bearer ' + token);
    copie.headers = entetes;
    return copie;
  }

  global.fetch = function (ressource, options) {
    // Tout ce qui ne vise pas l'API Enviro Cleans passe sans être touché.
    if (!estAppelApi(ressource)) return fetchOriginal(ressource, options);

    // Le renouvellement lui-même ne doit pas se réenclencher sur son propre 401.
    var url = typeof ressource === 'string' ? ressource : ressource.url;
    if (url.indexOf('/api/auth/refresh') !== -1 || url.indexOf('/api/auth/login') !== -1) {
      return fetchOriginal(ressource, options);
    }

    return fetchOriginal(ressource, options).then(function (reponse) {
      if (reponse.status !== 401) return reponse;

      return renouveler()
        .then(function (token) { return fetchOriginal(ressource, avecNouveauToken(options, token)); })
        .catch(function () {
          // Renouvellement impossible : la session est réellement finie. On rend le 401
          // d'origine, que la page traite déjà avec sa propre logique de déconnexion.
          return reponse;
        });
    });
  };

  // Exposé pour diagnostic : `EnviroSessionCompat.actif` doit valoir true sur les pages
  // historiques. Utile pour vérifier l'installation depuis la console.
  global.EnviroSessionCompat = {
    actif: true,
    clesDetectees: function () { return jeuxPresents().map(function (j) { return j.access; }); },
  };
}(window));
