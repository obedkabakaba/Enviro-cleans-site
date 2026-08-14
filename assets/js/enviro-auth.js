/**
 * ════════════════════════════════════════
 * GARDE D'AUTHENTIFICATION PARTAGÉE
 * ════════════════════════════════════════
 *
 * Chaque page protégée déclare le rôle (ou la permission) qu'elle exige, et cette garde
 * revalide auprès du backend via `/api/auth/me` à chaque chargement.
 *
 * Usage, en tête de page :
 *
 *     <script src="assets/js/enviro-api.js"></script>
 *     <script src="assets/js/enviro-auth.js"></script>
 *     <script>
 *       EnviroAuth.proteger({ roles: ['superviseur'] }).then(function (ctx) {
 *         // ctx.user, ctx.role, ctx.permissions — la page peut démarrer
 *       });
 *     </script>
 *
 * ── Ce que cette garde N'EST PAS ──
 * Elle empêche d'AFFICHER une page, pas d'accéder aux données : un utilisateur peut
 * toujours appeler l'API directement. La seule protection réelle est côté backend
 * (`authenticate` + `authorizePermission`). Cette garde évite les écrans cassés et les
 * fuites d'interface, rien de plus.
 *
 * Elle remplace notamment `acces-personnel.html`, dont la « protection » consistait à
 * comparer une saisie au littéral 'MAJOR' en JavaScript visible dans la source, puis à
 * afficher une liste de liens — les pages cibles restant accessibles par URL directe
 * (audit §S1).
 */
(function (global) {
  'use strict';

  var PAGE_CONNEXION = 'espace-client.html';

  function afficherBlocage(titre, message, action) {
    document.documentElement.innerHTML =
      '<head><meta charset="utf-8"><title>' + titre + ' — Enviro Cleans</title>'
      + '<link rel="stylesheet" href="assets/css/site-refresh.css"></head>'
      + '<body style="display:flex;align-items:center;justify-content:center;min-height:100vh;'
      + 'margin:0;padding:24px;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;'
      + 'background:#0f1b2d;color:#fff;text-align:center">'
      + '<div style="max-width:420px">'
      + '<h1 style="font-size:20px;margin:0 0 12px">' + titre + '</h1>'
      + '<p style="opacity:.8;line-height:1.6;font-size:14px;margin:0 0 20px">' + message + '</p>'
      + (action || '')
      + '</div></body>';
  }

  var EnviroAuth = {
    /**
     * @param {object} exigences
     *   @param {string[]} [exigences.roles]        rôles admis pour cette page
     *   @param {string[]} [exigences.permissions]  permissions requises (toutes)
     * @returns {Promise<{user, role, permissions, espace}>}
     */
    proteger: function (exigences) {
      exigences = exigences || {};

      if (!global.EnviroAPI) {
        return Promise.reject(new Error('enviro-api.js doit être chargé avant enviro-auth.js.'));
      }

      if (!global.EnviroAPI.Session.accessToken()) {
        global.EnviroAPI.rediriger(PAGE_CONNEXION + '?suite=' + encodeURIComponent(location.pathname.split('/').pop()));
        return new Promise(function () {}); // ne résout jamais : la page est en train de partir
      }

      return global.EnviroAPI.get('/api/auth/me')
        .then(function (data) {
          var role = data.role || (data.user && data.user.Role && data.user.Role.code);
          var permissions = data.permissions || [];

          // Le backend fait autorité : on rafraîchit la session locale à chaque chargement,
          // pour qu'un changement de rôle prenne effet sans reconnexion.
          global.EnviroAPI.Session.enregistrer({ user: data.user, permissions: permissions });

          if (exigences.roles && exigences.roles.indexOf(role) === -1) {
            var destination = data.espace && data.espace.page;
            afficherBlocage(
              'Espace non autorisé',
              'Votre rôle (' + role + ') ne donne pas accès à cette page.',
              destination
                ? '<a href="' + destination + '" style="color:#3ab54a;font-weight:700">Aller vers votre espace</a>'
                : ''
            );
            return new Promise(function () {});
          }

          if (exigences.permissions) {
            var manquantes = exigences.permissions.filter(function (p) {
              return permissions.indexOf(p) === -1;
            });
            if (manquantes.length > 0) {
              afficherBlocage(
                'Permissions insuffisantes',
                'Cette page requiert : ' + manquantes.join(', ') + '.',
                ''
              );
              return new Promise(function () {});
            }
          }

          return { user: data.user, role: role, permissions: permissions, espace: data.espace };
        })
        .catch(function (err) {
          if (err && err.statut === 403) {
            afficherBlocage('Compte désactivé', err.message || 'Ce compte n’est plus actif.', '');
            return new Promise(function () {});
          }
          global.EnviroAPI.Session.effacer();
          global.EnviroAPI.rediriger(PAGE_CONNEXION + '?expire=1');
          return new Promise(function () {});
        });
    },

    /** Masque les éléments porteurs de `data-permission` non accordée. Confort, pas sécurité. */
    appliquerPermissionsAuDOM: function (permissions) {
      var noeuds = document.querySelectorAll('[data-permission]');
      Array.prototype.forEach.call(noeuds, function (el) {
        var requise = el.getAttribute('data-permission');
        if (permissions.indexOf(requise) === -1) el.style.display = 'none';
      });
    },
  };

  global.EnviroAuth = EnviroAuth;
}(window));
