/**
 * ════════════════════════════════════════
 * PLAN DIRECTEUR — application installable, lisible hors connexion
 * ════════════════════════════════════════
 *
 * ── Les mêmes accès que l'API, y compris hors ligne ──
 *
 * Le plan n'est jamais livré avec le site : il vient de `/api/plan-directeur`, qui exige
 * une session ET `executive.plan.read`. L'application en garde UNE copie dans IndexedDB
 * pour la lecture sans réseau, et cette copie obéit à quatre règles :
 *
 *   1. Pas de session sur l'appareil (déconnexion, session expirée) → copie effacée.
 *   2. Le serveur répond 403 (permission retirée, compte suspendu) → copie effacée.
 *   3. Un autre compte se connecte sur le même téléphone → copie de l'ancien effacée.
 *   4. Pas de vérification réussie auprès du serveur depuis 30 jours → copie masquée
 *      jusqu'à la prochaine connexion en ligne. Un téléphone perdu ne garde pas le plan
 *      lisible indéfiniment.
 *
 * ── Ce que la copie hors ligne ne protège PAS ──
 *
 * Quelqu'un qui détient le téléphone déverrouillé, pendant les 30 jours, peut lire le
 * plan : c'est le prix de la lecture hors connexion. Le verrouillage de l'écran du
 * téléphone reste la première protection.
 *
 * ── Le contenu ──
 *
 * Le HTML reçu est produit par `planDirecteur.js` côté serveur, qui échappe tout le
 * texte du Markdown et refuse tout schéma porteur de script. Il est inséré tel quel.
 */
(function (global) {
  'use strict';

  var API = global.EnviroAPI;
  var BASE = 'ec-plan-directeur';
  var MAGASIN = 'plan';
  var CLE = 'courant';
  var VALIDITE_MS = 30 * 24 * 60 * 60 * 1000;

  var el = {
    statut: document.getElementById('statut'),
    ecran: document.getElementById('ecran'),
    contenu: document.getElementById('contenu'),
    menu: document.getElementById('menu'),
    voile: document.getElementById('voile'),
    sommaire: document.getElementById('sommaire'),
    ouvrir: document.getElementById('ouvrirMenu'),
    fermer: document.getElementById('fermerMenu'),
    installer: document.getElementById('installer'),
    aideIos: document.getElementById('aideIos'),
    actualiser: document.getElementById('actualiser'),
    deconnecter: document.getElementById('deconnecter'),
    note: document.getElementById('noteCopie'),
    pdf: document.getElementById('telechargerPdf'),
    word: document.getElementById('telechargerWord'),
  };

  var copieAffichee = null;

  // ── Stockage local (IndexedDB) ─────────────────────────────────────────────

  function ouvrirBase() {
    return new Promise(function (resolve, reject) {
      if (!global.indexedDB) { reject(new Error('IndexedDB indisponible')); return; }
      var req = global.indexedDB.open(BASE, 1);
      req.onupgradeneeded = function () { req.result.createObjectStore(MAGASIN); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function transaction(mode, action) {
    return ouvrirBase().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(MAGASIN, mode);
        var resultat = action(tx.objectStore(MAGASIN));
        tx.oncomplete = function () { db.close(); resolve(resultat && resultat.result); };
        tx.onerror = function () { db.close(); reject(tx.error); };
      });
    });
  }

  function lireCopie() {
    return transaction('readonly', function (s) { return s.get(CLE); }).catch(function () { return null; });
  }

  function ecrireCopie(copie) {
    return transaction('readwrite', function (s) { s.put(copie, CLE); });
  }

  function effacerCopie() {
    copieAffichee = null;
    return transaction('readwrite', function (s) { s.delete(CLE); }).catch(function () {});
  }

  // ── Affichage ──────────────────────────────────────────────────────────────

  function texte(chaine) {
    var d = document.createElement('div');
    d.textContent = chaine;
    return d.innerHTML;
  }

  function dateCourte(ms) {
    try {
      return new Date(ms).toLocaleString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
    }
  }

  function jourCourt(ms) {
    try { return new Date(ms).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }); }
    catch (e) { return new Date(ms).toISOString().slice(0, 10); }
  }

  function statut(message, ton) {
    el.statut.textContent = message;
    el.statut.dataset.ton = ton || 'neutre';
  }

  function afficherEcran(titre, message, actionHtml) {
    el.contenu.hidden = true;
    el.contenu.innerHTML = '';
    el.sommaire.innerHTML = '';
    el.pdf.hidden = true;
    el.word.hidden = true;
    el.ecran.innerHTML = '<div class="plan-carte">'
      + '<img src="assets/brand/logo-enviro-cleans.webp" alt="" width="56" height="51"/>'
      + '<h1>' + texte(titre) + '</h1><p>' + texte(message) + '</p>' + (actionHtml || '') + '</div>';
    el.ecran.hidden = false;
  }

  function lienConnexion() {
    return '<a class="plan-action plan-action-principale" href="espace-client.html?suite=plan-directeur.html">Se connecter</a>';
  }

  function afficherPlan(copie) {
    copieAffichee = copie;
    el.ecran.hidden = true;
    el.contenu.innerHTML = copie.html;
    el.contenu.hidden = false;
    el.pdf.hidden = false;
    el.word.hidden = false;

    el.sommaire.innerHTML = (copie.sommaire || []).map(function (s) {
      return '<li><a href="#' + encodeURIComponent(s.id) + '">' + texte(s.titre) + '</a></li>';
    }).join('');

    // Les schémas sont dessinés pour 760 unités de large : sur un téléphone, on les laisse
    // défiler horizontalement plutôt que de réduire leur texte à 5 px.
    Array.prototype.forEach.call(el.contenu.querySelectorAll('.plan-schema svg'), function (svg) {
      svg.setAttribute('focusable', 'false');
    });

    el.note.textContent = 'Copie enregistrée sur cet appareil, vérifiée le ' + dateCourte(copie.valideLe) + '.';
  }

  // ── Synchronisation avec le serveur ────────────────────────────────────────

  function estHorsLigne(err) {
    return !err || err.statut === undefined;
  }

  function synchroniser(copie, utilisateur) {
    statut('Vérification…', 'neutre');

    return API.get('/api/plan-directeur/version')
      .then(function (v) {
        if (copie && copie.version === v.version) return copie;
        statut('Téléchargement du plan…', 'neutre');
        return API.get('/api/plan-directeur').then(function (p) {
          return {
            version: p.version, titre: p.titre, sommaire: p.sommaire, html: p.html,
            utilisateurId: utilisateur && utilisateur.id,
          };
        });
      })
      .then(function (aJour) {
        aJour.valideLe = Date.now();
        return ecrireCopie(aJour).then(function () {
          if (!copieAffichee || copieAffichee.version !== aJour.version) afficherPlan(aJour);
          else el.note.textContent = 'Copie enregistrée sur cet appareil, vérifiée le ' + dateCourte(aJour.valideLe) + '.';
          copieAffichee = aJour;
          statut('À jour', 'bon');
        });
      })
      .catch(function (err) {
        if (err && err.statut === 403) {
          return effacerCopie().then(function () {
            statut('Accès refusé', 'alerte');
            afficherEcran('Accès au plan retiré',
              'Votre compte n’a pas (ou plus) le droit de lire le plan directeur. '
              + 'La copie de cet appareil a été effacée.', '');
          });
        }
        if (estHorsLigne(err)) {
          if (copieAffichee) {
            statut('Hors ligne · ' + jourCourt(copieAffichee.valideLe), 'attente');
          } else {
            statut('Hors ligne', 'attente');
            afficherEcran('Connexion internet nécessaire',
              'La première ouverture télécharge le plan. Ensuite, il reste lisible sans réseau.', '');
          }
          return null;
        }
        statut('Erreur serveur', 'alerte');
        if (!copieAffichee) {
          afficherEcran('Le plan n’a pas pu être chargé', err.message || 'Réessayez dans un instant.', '');
        }
        return null;
      });
  }

  function demarrer() {
    var token = API.Session.accessToken();
    var utilisateur = API.Session.user();

    return lireCopie().then(function (copie) {
      // Règle 1 : pas de session, pas de copie.
      if (!token) {
        return effacerCopie().then(function () {
          statut('Non connecté', 'neutre');
          afficherEcran('Plan directeur EnviroCleans',
            'Réservé à la direction. Connectez-vous avec votre compte EnviroCleans.', lienConnexion());
        });
      }

      // Règle 3 : la copie d'un autre compte n'est jamais montrée.
      if (copie && utilisateur && copie.utilisateurId && copie.utilisateurId !== utilisateur.id) {
        return effacerCopie().then(function () { return synchroniser(null, utilisateur); });
      }

      // Règle 4 : au-delà de 30 jours sans vérification, la copie est masquée.
      if (copie && Date.now() - copie.valideLe > VALIDITE_MS) {
        statut('Vérification requise', 'attente');
        afficherEcran('Reconnexion nécessaire',
          'Pour protéger le plan, il doit être vérifié en ligne au moins une fois tous les 30 jours.', '');
        return synchroniser(null, utilisateur);
      }

      if (copie) {
        afficherPlan(copie);
        statut('Copie du ' + jourCourt(copie.valideLe), 'attente');
      }
      return synchroniser(copie || null, utilisateur);
    });
  }

  // ── Téléchargement en PDF ou en Word ────────────────────────────────────────
  //
  // Les fichiers viennent de la même API, avec les mêmes droits : un compte sans
  // executive.plan.read reçoit un 403 et sa copie est effacée, comme pour le plan.
  // Hors connexion, le PDF reste possible : l'application imprime la copie locale
  // (« Enregistrer en PDF » dans la fenêtre d'impression du téléphone).

  var FORMATS = {
    pdf: { libelle: 'PDF', extension: 'pdf' },
    docx: { libelle: 'Word', extension: 'docx' },
  };

  function imprimerCopie() {
    basculerMenu(false);
    statut('Choisissez « Enregistrer en PDF »', 'attente');
    global.setTimeout(function () { global.print(); }, 300);
  }

  function telecharger(format) {
    var f = FORMATS[format];
    if (!navigator.onLine) {
      if (format === 'pdf') return imprimerCopie();
      statut('Le Word demande une connexion', 'attente');
      return;
    }

    statut('Téléchargement du ' + f.libelle + '…', 'neutre');
    // L'appel léger renouvelle la session si besoin avant le téléchargement lui-même.
    API.get('/api/plan-directeur/version')
      .then(function () {
        return fetch(API.BASE_URL + '/api/plan-directeur/fichier/' + format, {
          headers: { Authorization: 'Bearer ' + API.Session.accessToken() },
        });
      })
      .then(function (reponse) {
        if (reponse.status === 403) { var e = new Error('refus'); e.statut = 403; throw e; }
        if (!reponse.ok) throw new Error('Erreur ' + reponse.status);
        return reponse.blob();
      })
      .then(function (contenu) {
        var url = URL.createObjectURL(contenu);
        var lien = document.createElement('a');
        lien.href = url;
        lien.download = 'EnviroCleans-Plan-directeur-2027-2032.' + f.extension;
        document.body.appendChild(lien);
        lien.click();
        lien.remove();
        global.setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
        statut(f.libelle + ' téléchargé', 'bon');
      })
      .catch(function (err) {
        if (err && err.statut === 403) {
          return effacerCopie().then(function () {
            statut('Accès refusé', 'alerte');
            afficherEcran('Accès au plan retiré',
              'Votre compte n’a pas (ou plus) le droit de lire le plan directeur. '
              + 'La copie de cet appareil a été effacée.', '');
          });
        }
        if (estHorsLigne(err) && format === 'pdf') return imprimerCopie();
        statut('Téléchargement impossible', 'alerte');
        return null;
      });
  }

  el.pdf.addEventListener('click', function () { basculerMenu(false); telecharger('pdf'); });
  el.word.addEventListener('click', function () { basculerMenu(false); telecharger('docx'); });

  // ── Menu, installation, déconnexion ────────────────────────────────────────

  function basculerMenu(ouvert) {
    el.menu.hidden = !ouvert;
    el.voile.hidden = !ouvert;
    el.ouvrir.setAttribute('aria-expanded', ouvert ? 'true' : 'false');
  }

  el.ouvrir.addEventListener('click', function () { basculerMenu(el.menu.hidden); });
  el.fermer.addEventListener('click', function () { basculerMenu(false); });
  el.voile.addEventListener('click', function () { basculerMenu(false); });
  el.sommaire.addEventListener('click', function (e) {
    if (e.target.closest('a')) basculerMenu(false);
  });

  el.actualiser.addEventListener('click', function () {
    basculerMenu(false);
    synchroniser(copieAffichee, API.Session.user());
  });

  el.deconnecter.addEventListener('click', function () {
    effacerCopie().then(function () { API.deconnecter(); });
  });

  var invitation = null;
  global.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    invitation = e;
    el.installer.hidden = false;
  });
  el.installer.addEventListener('click', function () {
    if (!invitation) return;
    invitation.prompt();
    invitation.userChoice.then(function () { invitation = null; el.installer.hidden = true; });
  });

  var autonome = global.matchMedia && global.matchMedia('(display-mode: standalone)').matches;
  var ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (ios && !autonome && !navigator.standalone) el.aideIos.hidden = false;

  global.addEventListener('online', function () {
    if (API.Session.accessToken()) synchroniser(copieAffichee, API.Session.user());
  });
  global.addEventListener('offline', function () {
    if (copieAffichee) statut('Hors ligne · ' + jourCourt(copieAffichee.valideLe), 'attente');
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('plan-directeur-sw.js', { scope: './plan-directeur' })
      .catch(function () { /* sans service worker, la page marche en ligne */ });
  }

  demarrer();
}(window));
