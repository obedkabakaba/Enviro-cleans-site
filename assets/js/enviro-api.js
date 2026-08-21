/**
 * ════════════════════════════════════════
 * CLIENT API PARTAGÉ — Enviro Cleans
 * ════════════════════════════════════════
 *
 * Avant ce fichier, chaque espace embarquait sa propre copie de la logique d'appel API,
 * avec sa PROPRE clé de stockage :
 *
 *     espace-client.html → accessToken        dashboard.html    → accessToken
 *     gestionnaire.html  → gestAccessToken    superviseur.html  → supAccessToken
 *     collecteur.html    → colAccessToken     admin*.html       → admAccessToken
 *
 * Conséquence (audit §4.4) : la « connexion unique » n'existait pas. Se connecter depuis
 * espace-client.html écrivait `accessToken`, que gestionnaire.html ne lisait jamais —
 * chaque espace devait donc reproposer un formulaire de connexion.
 *
 * Ce module unifie le stockage sous UNE clé, tout en migrant automatiquement les anciennes
 * (voir `migrerAnciennesCles`) pour ne déconnecter personne au déploiement.
 *
 * Chargement : <script src="assets/js/enviro-api.js"></script> — aucun build, aucune
 * dépendance externe, compatible GitHub Pages et CSP stricte.
 */
(function (global) {
  'use strict';

  var BASE_URL = 'https://enviro-cleans-api.onrender.com';

  var CLES = {
    access: 'ec.accessToken',
    refresh: 'ec.refreshToken',
    user: 'ec.user',
    permissions: 'ec.permissions',
  };

  // Anciennes clés, par espace. Lues une seule fois puis effacées.
  var ANCIENNES = [
    { access: 'accessToken', refresh: 'refreshToken', user: 'user' },
    { access: 'gestAccessToken', refresh: 'gestRefreshToken', user: 'gestUser' },
    { access: 'supAccessToken', refresh: 'supRefreshToken', user: 'supUser' },
    { access: 'colAccessToken', refresh: 'colRefreshToken', user: 'colUser' },
    { access: 'admAccessToken', refresh: 'admRefreshToken', user: 'admUser' },
  ];

  /**
   * Reprend une session ouverte sous une ancienne clé et la recopie vers la nouvelle.
   *
   * ── Pourquoi COPIER et non DÉPLACER ──
   * Les six espaces existants (gestionnaire.html, superviseur.html, collecteur.html,
   * admin*.html, dashboard.html) lisent encore leur propre clé et n'utilisent pas ce
   * module. Supprimer les anciennes clés ici déconnecterait un gestionnaire déjà
   * connecté dès qu'il ouvrirait une page chargeant ce script.
   *
   * Les deux jeux de clés coexistent donc pendant la transition. La purge n'aura lieu
   * qu'une fois les six pages passées à EnviroAPI — c'est la phase de contraction,
   * documentée dans HANDOVER_ESPACES_DIRECTION.md.
   */
  function reprendreAncienneSession() {
    if (localStorage.getItem(CLES.access)) return;

    for (var i = 0; i < ANCIENNES.length; i += 1) {
      var jeu = ANCIENNES[i];
      var token = localStorage.getItem(jeu.access);
      if (!token) continue;

      localStorage.setItem(CLES.access, token);
      if (localStorage.getItem(jeu.refresh)) {
        localStorage.setItem(CLES.refresh, localStorage.getItem(jeu.refresh));
      }
      if (localStorage.getItem(jeu.user)) {
        localStorage.setItem(CLES.user, localStorage.getItem(jeu.user));
      }
      return;
    }
  }

  reprendreAncienneSession();

  /**
   * Propage un token renouvelé vers les anciennes clés DÉJÀ présentes.
   *
   * Sans cela, une page historique continuerait d'envoyer un access token expiré
   * après que ce module l'a renouvelé — et l'utilisateur serait déconnecté malgré
   * une session valide. On ne CRÉE jamais une ancienne clé : on met seulement à jour
   * celles qui existent déjà.
   */
  function propagerVersAnciennesCles(accessToken, refreshToken) {
    ANCIENNES.forEach(function (jeu) {
      if (localStorage.getItem(jeu.access)) {
        localStorage.setItem(jeu.access, accessToken);
        if (refreshToken) localStorage.setItem(jeu.refresh, refreshToken);
      }
    });
  }

  // ── Session ────────────────────────────────────────────────────────────────
  var Session = {
    accessToken: function () { return localStorage.getItem(CLES.access); },
    refreshToken: function () { return localStorage.getItem(CLES.refresh); },

    user: function () {
      try { return JSON.parse(localStorage.getItem(CLES.user) || 'null'); } catch (e) { return null; }
    },

    permissions: function () {
      try { return JSON.parse(localStorage.getItem(CLES.permissions) || '[]'); } catch (e) { return []; }
    },

    /** `true` si la permission est accordée. Confort d'affichage UNIQUEMENT. */
    peut: function (code) { return Session.permissions().indexOf(code) !== -1; },

    enregistrer: function (data) {
      if (data.accessToken) localStorage.setItem(CLES.access, data.accessToken);
      if (data.refreshToken) localStorage.setItem(CLES.refresh, data.refreshToken);
      if (data.user) localStorage.setItem(CLES.user, JSON.stringify(data.user));
      if (data.permissions) localStorage.setItem(CLES.permissions, JSON.stringify(data.permissions));

      // Tant que les six espaces historiques lisent leur propre clé, ils doivent
      // recevoir le token à jour, sinon ils se déconnecteraient tout seuls.
      if (data.accessToken) propagerVersAnciennesCles(data.accessToken, data.refreshToken);
    },

    effacer: function () {
      Object.keys(CLES).forEach(function (k) { localStorage.removeItem(CLES[k]); });
      ANCIENNES.forEach(function (jeu) {
        localStorage.removeItem(jeu.access);
        localStorage.removeItem(jeu.refresh);
        localStorage.removeItem(jeu.user);
      });
    },
  };

  // ── Appels API ─────────────────────────────────────────────────────────────
  var renouvellementEnCours = null;

  function attendre(delaiMs) {
    return new Promise(function (resolve) { global.setTimeout(resolve, delaiMs); });
  }

  /**
   * Lit aussi bien une réponse JSON qu'une page HTML/textuelle renvoyée par l'hébergeur.
   * Render peut répondre temporairement 502/503 avec du HTML pendant le réveil du service ;
   * appeler directement `response.json()` transformait alors cette réponse en fausse
   * « impossibilité de contacter le serveur ».
   */
  function lireReponsePublique(reponse) {
    return reponse.text().then(function (texte) {
      var data = null;
      if (texte) {
        try { data = JSON.parse(texte); } catch (e) { data = { message: texte }; }
      }
      return {
        ok: reponse.ok,
        status: reponse.status,
        data: data || {},
      };
    });
  }

  /**
   * Appel public tolérant au réveil de Render.
   *
   * Une connexion peut arriver pendant que l'instance gratuite redémarre. Les erreurs
   * réseau et les 502/503/504 sont donc retentées deux fois. Les réponses métier (400,
   * 401, 403, 429…) ne le sont jamais : elles doivent rester visibles telles quelles.
   */
  function appelPublic(chemin, options) {
    options = options || {};
    var nombreTentatives = options.nombreTentatives || 3;
    var corps = options.body === undefined ? undefined : JSON.stringify(options.body);
    var entetes = options.headers || (corps === undefined ? {} : { 'Content-Type': 'application/json' });

    function tenter(numero) {
      return fetch(BASE_URL + chemin, {
        method: options.method || 'GET',
        headers: entetes,
        body: corps,
        cache: 'no-store',
      })
        .then(lireReponsePublique)
        .then(function (resultat) {
          var transitoire = [502, 503, 504].indexOf(resultat.status) !== -1;
          if (transitoire && numero < nombreTentatives) {
            return attendre(numero * 900).then(function () { return tenter(numero + 1); });
          }
          return resultat;
        })
        .catch(function (cause) {
          if (numero < nombreTentatives) {
            return attendre(numero * 900).then(function () { return tenter(numero + 1); });
          }
          var erreur = new Error('RESEAU_INDISPONIBLE');
          erreur.code = 'RESEAU_INDISPONIBLE';
          erreur.cause = cause;
          throw erreur;
        });
    }

    return tenter(1);
  }

  /** Réveille l'API en arrière-plan dès l'ouverture de la page de connexion. */
  function reveiller() {
    return appelPublic('/api/health', { nombreTentatives: 2 })
      .then(function (resultat) { return resultat.ok; })
      .catch(function () { return false; });
  }

  /**
   * Renouvelle l'access token. Mutualisé : si dix appels expirent en même temps,
   * un seul renouvellement part et les autres attendent son résultat.
   */
  function renouveler() {
    if (renouvellementEnCours) return renouvellementEnCours;

    var refresh = Session.refreshToken();
    if (!refresh) return Promise.reject(new Error('SESSION_EXPIREE'));

    renouvellementEnCours = fetch(BASE_URL + '/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: refresh }),
    })
      .then(function (r) {
        if (!r.ok) throw new Error('SESSION_EXPIREE');
        return r.json();
      })
      .then(function (data) {
        Session.enregistrer(data);
        return data.accessToken;
      })
      .then(function (token) {
        renouvellementEnCours = null;
        return token;
      }, function (err) {
        renouvellementEnCours = null;
        throw err;
      });

    return renouvellementEnCours;
  }

  /**
   * Appel API authentifié.
   *
   * - 401 → tente UN renouvellement, rejoue l'appel, puis déconnecte si ça échoue.
   * - 403 → remonte l'erreur avec les permissions manquantes renvoyées par le backend.
   */
  function appel(chemin, options) {
    options = options || {};

    function envoyer(token) {
      var entetes = Object.assign(
        { 'Content-Type': 'application/json' },
        options.headers || {}
      );
      if (token) entetes.Authorization = 'Bearer ' + token;

      return fetch(BASE_URL + chemin, {
        method: options.method || 'GET',
        headers: entetes,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
    }

    return envoyer(Session.accessToken()).then(function (reponse) {
      if (reponse.status !== 401) return traiter(reponse);

      return renouveler()
        .then(function (nouveauToken) { return envoyer(nouveauToken).then(traiter); })
        .catch(function () {
          Session.effacer();
          rediriger('espace-client.html?expire=1');
          throw new Error('Session expirée. Reconnectez-vous.');
        });
    });
  }

  function traiter(reponse) {
    var typeContenu = reponse.headers.get('content-type') || '';

    if (typeContenu.indexOf('application/json') === -1) {
      if (!reponse.ok) throw new Error('Erreur ' + reponse.status);
      return reponse.text();
    }

    return reponse.json().then(function (corps) {
      if (reponse.ok) return corps;

      var err = new Error(corps.message || 'Erreur ' + reponse.status);
      err.statut = reponse.status;
      err.permissionsRequises = corps.permissions_requises || null;
      throw err;
    });
  }

  function rediriger(page) {
    // `replace` plutôt que `href` : la page protégée ne doit pas rester dans l'historique.
    global.location.replace(page);
  }

  var API = {
    BASE_URL: BASE_URL,
    CLES: CLES,
    Session: Session,
    appel: appel,
    appelPublic: appelPublic,
    reveiller: reveiller,
    get: function (chemin) { return appel(chemin); },
    post: function (chemin, body) { return appel(chemin, { method: 'POST', body: body }); },
    put: function (chemin, body) { return appel(chemin, { method: 'PUT', body: body }); },
    supprimer: function (chemin) { return appel(chemin, { method: 'DELETE' }); },
    rediriger: rediriger,

    /** Déconnexion globale : révoque le refresh token côté serveur puis nettoie. */
    deconnecter: function () {
      var refresh = Session.refreshToken();
      var fin = function () { Session.effacer(); rediriger('espace-client.html'); };

      if (!refresh) return fin();

      return fetch(BASE_URL + '/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: refresh }),
      }).then(fin).catch(fin);
    },
  };

  global.EnviroAPI = API;
}(window));
