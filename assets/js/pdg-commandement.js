/**
 * Centre de commandement du PDG.
 *
 * Trois vues actionnables et courtes : aujourd'hui, directions, terrain. Les analyses
 * historiques restent dans pdg.html ; ce module ne recalcule aucun indicateur.
 */
window.PdgCommandement = (function () {
  'use strict';

  function creer(options) {
    var E = options.E;
    var contenu = options.contenu;
    var sousTitre = options.sousTitre;
    var periode = options.periode;
    var naviguer = options.naviguer;
    var permissions = [];
    var sequenceTerrain = 0;

    function autoriser(liste) {
      permissions = Array.isArray(liste) ? liste : [];
    }

    function peut(permission) {
      return permissions.indexOf(permission) !== -1;
    }

    function attr(v) {
      return E.echapper(String(v === null || v === undefined ? '' : v));
    }

    function nombre(v) {
      return E.nombre(v);
    }

    function valeurKpi(operations, code) {
      var ligne = ((operations && operations.kpi) || []).find(function (k) {
        return k.code === code;
      });
      return ligne ? ligne.valeur : null;
    }

    function urlAvecPeriode(chemin) {
      return chemin + periode();
    }

    function actionsPrincipales() {
      var nomination = peut('executive.appointment.manage')
        ? '<button class="action" data-pdg-nav="directions">Nommer un directeur</button>'
        : '';
      return '<div class="pdg-commandes">'
        + nomination
        + '<button class="action" data-pdg-nav="terrain" data-terrain-cible="carte">'
        + 'Voir la carte clients</button>'
        + '<button class="action" data-pdg-nav="approbations">Décider les approbations</button>'
        + '<button class="action secondaire" data-pdg-nav="strategie">Fixer un objectif</button>'
        + '<button class="action secondaire" data-pdg-nav="risques">Traiter un risque</button>'
        + '<a class="action secondaire pdg-lien-action" href="centre-analyse.html">'
        + 'Lancer une analyse</a>'
        + '</div>';
    }

    function brancherNavigation(racine) {
      (racine || contenu).querySelectorAll('[data-pdg-nav]').forEach(function (bouton) {
        bouton.addEventListener('click', function () {
          var vue = bouton.getAttribute('data-pdg-nav');
          var cible = bouton.getAttribute('data-terrain-cible');
          if (cible) sessionStorage.setItem('pdg_terrain_cible', cible);
          naviguer(vue);
        });
      });
    }

    function afficherErreur(err, cible) {
      E.afficherErreur(cible || contenu, err);
    }

    // ── Aujourd'hui ──────────────────────────────────────────────────────────

    function aujourdHui() {
      sequenceTerrain += 1;
      contenu.innerHTML = actionsPrincipales() + E.squelette(7);
      sousTitre.textContent = 'Ce qui appelle votre attention et vos commandes';
      brancherNavigation(contenu);

      Promise.allSettled([
        EnviroAPI.get(urlAvecPeriode('/api/pdg/terrain')),
        peut('executive.appointment.manage')
          ? EnviroAPI.get('/api/pdg/directions')
          : Promise.resolve({
            directions: [],
            resume: { total: 0, pourvues: 0, a_pourvoir: 0, invitations_en_attente: 0 },
          }),
        EnviroAPI.get('/api/pdg/approbations?statut=ouvertes&limite=5'),
      ]).then(function (resultats) {
        function valeur(index, repli) {
          return resultats[index].status === 'fulfilled' ? resultats[index].value : repli;
        }
        var terrain = valeur(0, {});
        var directions = valeur(1, {
          directions: [],
          resume: { total: null, pourvues: null, a_pourvoir: null, invitations_en_attente: null },
        });
        var approbations = valeur(2, { demandes: [], total: null });
        var ops = terrain.operations || {};
        var travailleurs = terrain.travailleurs || {};
        var marketing = terrain.marketing || {};
        var effectifs = travailleurs.effectifs || {};
        var agents = marketing.agents || {};
        var syntheseAgents = agents.synthese || {};
        var resumeCarte = terrain.carte || {};
        var demandes = approbations.demandes || [];
        var totalDemandes = approbations.total === null || approbations.total === undefined
          ? demandes.length : approbations.total;

        var alertes = [];
        if ((directions.resume || {}).a_pourvoir > 0) {
          alertes.push({
            niveau: 'attention',
            texte: nombre(directions.resume.a_pourvoir) + ' direction(s) sont à pourvoir.',
            action: 'directions',
            libelle: 'Nommer',
          });
        }
        if (totalDemandes > 0) {
          alertes.push({
            niveau: 'attention',
            texte: nombre(totalDemandes) + ' décision(s) attendent votre examen.',
            action: 'approbations',
            libelle: 'Examiner',
          });
        }
        if ((resumeCarte.incidents || []).length > 0) {
          alertes.push({
            niveau: 'alerte',
            texte: nombre(resumeCarte.incidents.length) + ' incident(s) terrain sont ouverts.',
            action: 'terrain',
            cible: 'carte',
            libelle: 'Voir le terrain',
          });
        }
        if (resultats.some(function (r) { return r.status === 'rejected'; })) {
          alertes.push({
            niveau: 'attention',
            texte: 'Certaines données sont temporairement indisponibles. Les autres restent affichées.',
            action: 'commandement',
            libelle: 'Actualiser',
          });
        }

        var lignesAlertes = alertes.length
          ? alertes.map(function (a) {
            return '<div class="pdg-alerte">'
              + '<span class="puce ' + a.niveau + '">' + (a.niveau === 'alerte' ? 'urgent' : 'à traiter') + '</span>'
              + '<span>' + attr(a.texte) + '</span>'
              + '<button class="action secondaire" data-pdg-nav="' + a.action + '"'
              + (a.cible ? ' data-terrain-cible="' + a.cible + '"' : '') + '>'
              + attr(a.libelle) + '</button></div>';
          }).join('')
          : '<div class="etat-vide">Aucune alerte de commandement avec les données disponibles.</div>';

        var cartesDirections = (directions.directions || []).map(function (d) {
          var titulaire = d.titulaire;
          return '<div class="pdg-direction-mini">'
            + '<strong>' + attr(d.libelle) + '</strong>'
            + (titulaire
              ? '<span>' + attr(titulaire.nom_complet) + '</span>'
                + '<small>' + attr(titulaire.invitation_requise
                  ? 'Invitation à finaliser' : 'Accès actif') + '</small>'
              : '<span class="puce attention">À pourvoir</span>')
            + '</div>';
        }).join('');

        contenu.innerHTML = actionsPrincipales()
          + E.grilleKpi([
            { nom: 'Tournées planifiées', valeur: valeurKpi(ops, 'tournees_planifiees') },
            {
              nom: 'Tournées réalisées',
              valeur: valeurKpi(ops, 'taux_realisation_tournees'),
              format: 'pourcent',
            },
            { nom: 'Arrêts cartographiés', valeur: resumeCarte.arrets_cartographies },
            { nom: 'Travailleurs actifs', valeur: effectifs.total_actifs },
            { nom: 'Agents marketing actifs', valeur: syntheseAgents.agents_actifs },
            { nom: 'Décisions en attente', valeur: totalDemandes },
          ])
          + E.panneau('À décider maintenant', lignesAlertes)
          + E.panneau('Vos directions',
            '<div class="pdg-direction-mini-grille">' + cartesDirections + '</div>',
            { sousTitre: nombre((directions.resume || {}).pourvues) + ' pourvue(s) sur '
              + nombre((directions.resume || {}).total) })
          + E.panneau('Terrain aujourd’hui',
            '<div class="pdg-resume-terrain">'
              + '<span><strong>' + nombre((resumeCarte.tournees || []).length)
              + '</strong> tournée(s) aujourd’hui</span>'
              + '<span><strong>' + nombre(resumeCarte.arrets_cartographies)
              + '</strong> clients placés sur la carte</span>'
              + '<span><strong>' + nombre(resumeCarte.arrets_sans_gps)
              + '</strong> arrêts sans coordonnées</span>'
              + '</div>',
            { sousTitre: terrain.note || '' });

        brancherNavigation(contenu);
      }).catch(function (err) {
        afficherErreur(err);
      });
    }

    // ── Directions ───────────────────────────────────────────────────────────

    function carteDirection(d) {
      var t = d.titulaire;
      var corps = '';
      if (!t) {
        corps = '<div class="etat-vide">Aucun titulaire actif.</div>'
          + (peut('executive.appointment.manage')
            ? '<button class="action" data-nommer="' + attr(d.code) + '">Nommer le directeur</button>'
            : '');
      } else {
        corps = '<div class="pdg-titulaire">'
          + '<strong>' + attr(t.nom_complet) + '</strong>'
          + '<span>' + attr(t.email || 'Sans e-mail') + ' · ' + attr(t.telephone || 'Sans téléphone') + '</span>'
          + '<span>Matricule ' + attr(t.matricule || '—') + ' · '
          + (t.invitation_requise
            ? '<span class="puce attention">Invitation à finaliser</span>'
            : '<span class="puce ok">Accès actif</span>') + '</span>'
          + (t.dernier_login_at
            ? '<small>Dernière connexion : ' + attr(E.dateHeure(t.dernier_login_at)) + '</small>'
            : '<small>Aucune connexion enregistrée</small>')
          + '</div>'
          + '<div class="pdg-actions-ligne">'
          + '<a class="action secondaire pdg-lien-action" href="' + attr(d.page) + '">Ouvrir cet espace</a>'
          + (peut('executive.appointment.manage')
            ? '<button class="action secondaire" data-reinviter="' + t.id + '">Réinviter</button>'
              + '<button class="action danger" data-statut-id="' + t.id
              + '" data-statut="suspendu">Suspendre</button>'
            : '')
          + '</div>';
      }
      if ((d.historique || []).length > 0) {
        corps += '<details class="pdg-historique"><summary>'
          + nombre(d.historique.length) + ' ancien(s) titulaire(s)</summary>'
          + d.historique.map(function (h) {
            return '<div><span>' + attr(h.nom_complet) + ' · ' + attr(h.statut) + '</span>'
              + (peut('executive.appointment.manage') && h.statut !== 'actif'
                ? '<button class="action secondaire" data-statut-id="' + h.id
                  + '" data-statut="actif">Réactiver</button>' : '')
              + '</div>';
          }).join('') + '</details>';
      }
      return '<article class="panneau pdg-direction-card">'
        + '<div class="panneau-entete"><div><h2>' + attr(d.libelle) + '</h2>'
        + '<div class="sous-titre">' + attr(d.fonction) + '</div></div>'
        + (d.a_pourvoir ? '<span class="puce attention">À pourvoir</span>' : '<span class="puce ok">Pourvue</span>')
        + '</div><div class="panneau-contenu">' + corps + '</div></article>';
    }

    function panneauInvitation(invitation) {
      if (!invitation || !invitation.lien) return '';
      return '<div class="panneau pdg-invitation">'
        + '<div class="panneau-entete"><div><h2>Accès sécurisé créé</h2>'
        + '<div class="sous-titre">Le lien est à usage unique et ne sera plus affichable ensuite.</div>'
        + '</div></div><div class="panneau-contenu">'
        + (invitation.email_envoye
          ? '<p><span class="puce ok">E-mail envoyé</span></p>'
          : '<p class="note">' + attr(invitation.avertissement || 'Copiez et transmettez ce lien.') + '</p>')
        + '<div class="pdg-copie"><input readonly value="' + attr(invitation.lien)
        + '" aria-label="Lien d’invitation"><button class="action" data-copier-invitation>Copier</button></div>'
        + '<small>Expiration : ' + attr(E.dateHeure(invitation.expires_at)) + '</small>'
        + '</div></div>';
    }

    function directions(invitation) {
      sequenceTerrain += 1;
      contenu.innerHTML = E.squelette(5);
      sousTitre.textContent = 'Nommer les titulaires et ouvrir leurs accès';

      EnviroAPI.get('/api/pdg/directions').then(function (d) {
        contenu.innerHTML = panneauInvitation(invitation)
          + E.grilleKpi([
            { nom: 'Directions', valeur: d.resume.total },
            { nom: 'Pourvues', valeur: d.resume.pourvues },
            { nom: 'À pourvoir', valeur: d.resume.a_pourvoir },
            { nom: 'Invitations à finaliser', valeur: d.resume.invitations_en_attente },
          ])
          + '<div id="formNominationPdg"></div>'
          + '<div class="pdg-direction-grille">'
          + (d.directions || []).map(carteDirection).join('')
          + '</div>';

        brancherDirections();
      }).catch(function (err) {
        afficherErreur(err);
      });
    }

    function ouvrirNomination(code) {
      var cible = document.getElementById('formNominationPdg');
      if (!cible) return;
      var direction = contenu.querySelector('[data-nommer="' + code + '"]');
      var carte = direction ? direction.closest('.pdg-direction-card') : null;
      var titre = carte ? carte.querySelector('h2').textContent : code;

      cible.innerHTML = '<div class="panneau pdg-formulaire">'
        + '<div class="panneau-entete"><div><h2>Nommer — ' + attr(titre) + '</h2>'
        + '<div class="sous-titre">Le titulaire recevra un lien pour définir lui-même son mot de passe.</div>'
        + '</div><button type="button" class="action secondaire" data-fermer-form>Fermer</button></div>'
        + '<form class="panneau-contenu" id="nominationPdg">'
        + '<div class="pdg-champs">'
        + '<label>Nom<input name="nom" required maxlength="100"></label>'
        + '<label>Post-nom<input name="post_nom" maxlength="100"></label>'
        + '<label>Prénom<input name="prenom" required maxlength="100"></label>'
        + '<label>Téléphone<input name="telephone" required maxlength="20" inputmode="tel"></label>'
        + '<label>E-mail<input name="email" type="email" required maxlength="150"></label>'
        + '<label>Date de prise de fonction<input name="date_embauche" type="date" required></label>'
        + '</div><div id="erreurNominationPdg"></div>'
        + '<button class="action" type="submit">Nommer et ouvrir l’accès</button>'
        + '</form></div>';
      cible.scrollIntoView({ behavior: 'smooth', block: 'start' });

      cible.querySelector('[data-fermer-form]').addEventListener('click', function () {
        cible.innerHTML = '';
      });
      cible.querySelector('form').addEventListener('submit', function (event) {
        event.preventDefault();
        var form = event.currentTarget;
        var bouton = form.querySelector('button[type="submit"]');
        var donnees = {};
        new FormData(form).forEach(function (v, k) { donnees[k] = String(v).trim(); });
        bouton.disabled = true;
        bouton.textContent = 'Création…';
        EnviroAPI.post('/api/pdg/directions/' + encodeURIComponent(code) + '/nomination', donnees)
          .then(function (resultat) {
            directions(resultat.invitation);
          }).catch(function (err) {
            var zone = document.getElementById('erreurNominationPdg');
            zone.innerHTML = '<div class="erreur">' + attr(err.message) + '</div>';
            bouton.disabled = false;
            bouton.textContent = 'Nommer et ouvrir l’accès';
          });
      });
    }

    function copierInvitation() {
      var champ = contenu.querySelector('.pdg-copie input');
      var bouton = contenu.querySelector('[data-copier-invitation]');
      if (!champ || !bouton) return;
      var fini = function () { bouton.textContent = 'Copié'; };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(champ.value).then(fini);
      } else {
        champ.select();
        document.execCommand('copy');
        fini();
      }
    }

    function brancherDirections() {
      contenu.querySelectorAll('[data-nommer]').forEach(function (b) {
        b.addEventListener('click', function () { ouvrirNomination(b.getAttribute('data-nommer')); });
      });
      contenu.querySelectorAll('[data-reinviter]').forEach(function (b) {
        b.addEventListener('click', function () {
          if (!window.confirm('Créer une nouvelle invitation ? L’ancienne sera révoquée.')) return;
          b.disabled = true;
          EnviroAPI.post('/api/pdg/directions/' + b.getAttribute('data-reinviter') + '/reinvitation', {})
            .then(function (r) { directions(r.invitation); })
            .catch(function (err) { window.alert(err.message); b.disabled = false; });
        });
      });
      contenu.querySelectorAll('[data-statut-id]').forEach(function (b) {
        b.addEventListener('click', function () {
          var statut = b.getAttribute('data-statut');
          if (!window.confirm('Passer cet accès au statut « ' + statut + ' » ?')) return;
          b.disabled = true;
          EnviroAPI.patch('/api/pdg/directions/' + b.getAttribute('data-statut-id') + '/statut', {
            statut: statut,
          }).then(function () { directions(); })
            .catch(function (err) { window.alert(err.message); b.disabled = false; });
        });
      });
      var copier = contenu.querySelector('[data-copier-invitation]');
      if (copier) copier.addEventListener('click', copierInvitation);
    }

    // ── Terrain ──────────────────────────────────────────────────────────────

    function shellTerrain() {
      contenu.innerHTML = '<div class="pdg-terrain-onglets">'
        + '<button class="action secondaire actif" data-terrain="resume">Résumé</button>'
        + '<button class="action secondaire" data-terrain="carte">Carte clients</button>'
        + '<button class="action secondaire" data-terrain="tournees">Tournées</button>'
        + '<button class="action secondaire" data-terrain="equipes">Travailleurs terrain</button>'
        + '<button class="action secondaire" data-terrain="marketing">Marketing & agents</button>'
        + '<button class="action secondaire" data-terrain="travailleurs">Tous les effectifs</button>'
        + '</div><div id="terrainPdgContenu"></div>';
      contenu.querySelectorAll('[data-terrain]').forEach(function (b) {
        b.addEventListener('click', function () {
          activerTerrain(b.getAttribute('data-terrain'));
        });
      });
    }

    function panneauTerrain() {
      return document.getElementById('terrainPdgContenu');
    }

    function activerTerrain(cible) {
      contenu.querySelectorAll('[data-terrain]').forEach(function (b) {
        b.classList.toggle('actif', b.getAttribute('data-terrain') === cible);
      });
      var appels = {
        resume: chargerResumeTerrain,
        carte: chargerCarteTerrain,
        tournees: chargerTourneesTerrain,
        equipes: chargerEquipesTerrain,
        marketing: chargerMarketingTerrain,
        travailleurs: chargerTravailleursTerrain,
      };
      var generation = ++sequenceTerrain;
      (appels[cible] || chargerResumeTerrain)(generation);
    }

    function terrain() {
      sousTitre.textContent = 'Tournées, travailleurs, marketing et clients sur la carte';
      shellTerrain();
      var cible = sessionStorage.getItem('pdg_terrain_cible') || 'resume';
      sessionStorage.removeItem('pdg_terrain_cible');
      activerTerrain(cible);
    }

    function chargerResumeTerrain(generation) {
      var cible = panneauTerrain();
      cible.innerHTML = E.squelette(6);
      EnviroAPI.get(urlAvecPeriode('/api/pdg/terrain')).then(function (d) {
        if (generation !== sequenceTerrain) return;
        var ops = d.operations || {};
        var marketing = d.marketing || {};
        var travailleurs = d.travailleurs || {};
        var carte = d.carte || {};
        var ag = (marketing.agents || {}).synthese || {};
        var eff = travailleurs.effectifs || {};
        cible.innerHTML = E.grilleKpi([
          { nom: 'Tournées planifiées', valeur: valeurKpi(ops, 'tournees_planifiees') },
          {
            nom: 'Taux de réalisation',
            valeur: valeurKpi(ops, 'taux_realisation_tournees'),
            format: 'pourcent',
          },
          { nom: 'Collectes effectuées', valeur: valeurKpi(ops, 'collectes_effectuees') },
          { nom: 'Travailleurs actifs', valeur: eff.total_actifs },
          { nom: 'Agents marketing actifs', valeur: ag.agents_actifs },
          { nom: 'Arrêts cartographiés', valeur: carte.arrets_cartographies },
        ])
          + E.avertissements([].concat(ops.avertissements || [], carte.avertissements || []))
          + E.panneau('Lecture correcte de la carte',
            '<p>' + attr(d.note) + '</p>'
            + '<button class="action" data-ouvrir-carte>Ouvrir la carte clients</button>');
        var bouton = cible.querySelector('[data-ouvrir-carte]');
        if (bouton) bouton.addEventListener('click', function () { activerTerrain('carte'); });
      }).catch(function (err) {
        if (generation === sequenceTerrain) afficherErreur(err, cible);
      });
    }

    function chargerCarteTerrain(generation, jour) {
      var cible = panneauTerrain();
      var suffixe = jour ? '?jour=' + encodeURIComponent(jour) : '';
      cible.innerHTML = E.squelette(5);
      EnviroAPI.get('/api/pdg/terrain/carte' + suffixe).then(function (d) {
        if (generation !== sequenceTerrain) return;
        var tournees = (d.tournees || []).map(function (t) {
          var progression = t.arrets > 0 ? Math.round(((t.traites + t.echecs) / t.arrets) * 100) : 0;
          return '<tr><td><strong>' + attr(t.nom || ('Tournée #' + t.id)) + '</strong></td>'
            + '<td>' + attr(t.zone) + '</td><td>' + attr(t.collecteur) + '</td>'
            + '<td>' + nombre(t.arrets) + '</td><td>' + nombre(t.traites) + '</td>'
            + '<td>' + nombre(t.echecs) + '</td><td>' + progression + ' %</td>'
            + '<td>' + attr(t.statut) + '</td></tr>';
        }).join('');
        cible.innerHTML = '<div class="pdg-jour-carte"><label>Journée'
          + '<input type="date" id="jourCartePdg" value="' + attr(d.jour) + '"></label>'
          + '<button class="action" id="actualiserCartePdg">Afficher</button></div>'
          + E.grilleKpi([
            { nom: 'Tournées du jour', valeur: (d.tournees || []).length },
            { nom: 'Clients géolocalisés', valeur: (d.arrets || []).length },
            { nom: 'Arrêts sans GPS', valeur: d.arrets_sans_gps },
            { nom: 'Incidents ouverts', valeur: (d.incidents || []).length },
            {
              nom: 'Position temps réel des camions',
              disponible: false,
              motif: (d.positions_vehicules || {}).motif,
            },
          ])
          + E.avertissements(d.avertissements)
          + E.panneau('Carte des clients programmés à Kinshasa', '<div id="cartePdgKinshasa"></div>', {
            sousTitre: 'Chaque point client vient de client_locations. Les incidents enregistrés '
              + 'apparaissent aussi ; aucun faux trajet GPS n’est ajouté.',
          })
          + E.panneau('Tournées du jour',
            E.tableau(['Tournée', 'Zone', 'Collecteur', 'Arrêts', 'Traités', 'Échecs',
              'Progression', 'Statut'], tournees, { vide: 'Aucune tournée ce jour.' }));

        document.getElementById('actualiserCartePdg').addEventListener('click', function () {
          var nouvelleGeneration = ++sequenceTerrain;
          chargerCarteTerrain(nouvelleGeneration, document.getElementById('jourCartePdg').value);
        });

        var points = (d.arrets || []).map(function (a) {
          return {
            latitude: a.latitude,
            longitude: a.longitude,
            libelle: a.client + ' — ' + (a.numero_abonne || ''),
            etat: a.statut,
            detail: (a.zone || '') + (a.heure_passage ? ' · passage ' + a.heure_passage : ''),
          };
        }).concat((d.incidents || []).filter(function (i) {
          return i.latitude !== null && i.longitude !== null;
        }).map(function (i) {
          return {
            latitude: i.latitude,
            longitude: i.longitude,
            libelle: i.titre,
            etat: 'incident',
            type: 'incident',
            detail: i.severite + ' · ' + (i.zone || ''),
          };
        }));

        CarteInteractive.afficher('cartePdgKinshasa', points, {
          tournees: (d.tournees || []).map(function (t) {
            return {
              nom: t.nom || ('Tournée ' + t.id),
              arrets: (d.arrets || []).filter(function (a) { return a.tournee_id === t.id; }),
            };
          }),
          motifVide: 'Aucun client géolocalisé pour cette journée.',
        });
      }).catch(function (err) {
        if (generation === sequenceTerrain) afficherErreur(err, cible);
      });
    }

    function chargerTourneesTerrain(generation, page, statut) {
      var cible = panneauTerrain();
      page = page || 1;
      statut = statut || '';
      cible.innerHTML = E.squelette(5);
      var url = urlAvecPeriode('/api/pdg/terrain/tournees');
      url += (url.indexOf('?') === -1 ? '?' : '&') + 'page=' + encodeURIComponent(page)
        + '&taille=25' + (statut ? '&statut=' + encodeURIComponent(statut) : '');
      EnviroAPI.get(url).then(function (d) {
        if (generation !== sequenceTerrain) return;
        var pagination = d.pagination || {};
        var lignes = (d.tournees || []).map(function (t) {
          return '<tr><td>' + attr(E.dateCourte(t.date_tournee)) + '</td>'
            + '<td><strong>' + attr(t.nom) + '</strong></td><td>' + attr(t.zone || '—') + '</td>'
            + '<td>' + attr(t.collecteur || '—') + '</td><td>' + attr(t.superviseur || '—') + '</td>'
            + '<td>' + nombre(t.clients) + '</td><td>' + nombre(t.effectuees) + '</td>'
            + '<td>' + nombre(t.echecs) + '</td><td>' + nombre(t.progression) + ' %</td>'
            + '<td>' + attr(t.statut) + '</td></tr>';
        }).join('');
        var statuts = [
          ['', 'Tous les statuts'],
          ['planifiee', 'Planifiées'],
          ['en_cours', 'En cours'],
          ['terminee', 'Terminées'],
          ['manquee', 'Manquées'],
          ['annulee', 'Annulées'],
        ];
        var commandes = '<div class="pdg-filtres-tournees"><label>Statut'
          + '<select id="statutTourneesPdg">'
          + statuts.map(function (option) {
            return '<option value="' + option[0] + '"' + (option[0] === statut ? ' selected' : '')
              + '>' + option[1] + '</option>';
          }).join('') + '</select></label>'
          + '<div class="pdg-pagination">'
          + '<button class="action secondaire" data-page-tournees="' + (pagination.page - 1) + '"'
          + (pagination.page <= 1 ? ' disabled' : '') + '>Précédente</button>'
          + '<span>Page ' + nombre(pagination.page) + ' sur ' + nombre(pagination.pages) + '</span>'
          + '<button class="action secondaire" data-page-tournees="' + (pagination.page + 1) + '"'
          + (pagination.page >= pagination.pages ? ' disabled' : '') + '>Suivante</button>'
          + '</div></div>';

        cible.innerHTML = commandes + E.grilleKpi([
          { nom: 'Tournées trouvées', valeur: (d.pagination || {}).total },
          {
            nom: 'Terminées (page)',
            valeur: (d.tournees || []).filter(function (t) { return t.statut === 'terminee'; }).length,
          },
          {
            nom: 'Manquées (page)',
            valeur: (d.tournees || []).filter(function (t) { return t.statut === 'manquee'; }).length,
          },
        ]) + E.panneau('Progression des tournées',
          E.tableau(['Date', 'Tournée', 'Zone', 'Collecteur', 'Superviseur', 'Clients',
            'Effectués', 'Échecs', 'Progression', 'Statut'], lignes, {
            vide: d.etat_vide || 'Aucune tournée sur la période.',
          }));
        cible.querySelector('#statutTourneesPdg').addEventListener('change', function (event) {
          var nouvelleGeneration = ++sequenceTerrain;
          chargerTourneesTerrain(nouvelleGeneration, 1, event.target.value);
        });
        cible.querySelectorAll('[data-page-tournees]').forEach(function (bouton) {
          bouton.addEventListener('click', function () {
            var nouvelleGeneration = ++sequenceTerrain;
            chargerTourneesTerrain(
              nouvelleGeneration,
              Number(bouton.getAttribute('data-page-tournees')),
              cible.querySelector('#statutTourneesPdg').value
            );
          });
        });
      }).catch(function (err) {
        if (generation === sequenceTerrain) afficherErreur(err, cible);
      });
    }

    function chargerEquipesTerrain(generation) {
      var cible = panneauTerrain();
      cible.innerHTML = E.squelette(4);
      EnviroAPI.get(urlAvecPeriode('/api/pdg/terrain/equipes')).then(function (d) {
        if (generation !== sequenceTerrain) return;
        var lignes = (d.collecteurs || []).map(function (c) {
          return '<tr><td><strong>' + attr(c.collecteur) + '</strong></td><td>' + attr(c.zone || '—') + '</td>'
            + '<td>' + nombre(c.tournees) + '</td><td>' + nombre(c.jours_travailles) + '</td>'
            + '<td>' + nombre(c.clients_total) + '</td><td>' + nombre(c.effectuees) + '</td>'
            + '<td>' + nombre(c.charge_moyenne) + '</td><td>' + nombre(c.pic_journalier) + '</td>'
            + '<td>' + (c.depassement ? '<span class="puce alerte">Dépassement</span>'
              : '<span class="puce ok">Dans la limite</span>') + '</td></tr>';
        }).join('');
        cible.innerHTML = E.grilleKpi([
          { nom: 'Collecteurs mobilisés', valeur: d.resume.collecteurs_mobilises },
          { nom: 'Dépassements de plafond', valeur: d.resume.depassements_plafond },
          { nom: 'Charge maximale', valeur: d.resume.charge_max },
        ]) + E.panneau('Travail des collecteurs',
          E.tableau(['Collecteur', 'Zone', 'Tournées', 'Jours', 'Clients', 'Effectués',
            'Moyenne/jour', 'Pic', 'Capacité'], lignes, {
            vide: d.etat_vide || 'Aucun collecteur mobilisé.',
          }));
      }).catch(function (err) {
        if (generation === sequenceTerrain) afficherErreur(err, cible);
      });
    }

    function chargerMarketingTerrain(generation) {
      var cible = panneauTerrain();
      cible.innerHTML = E.squelette(4);
      EnviroAPI.get(urlAvecPeriode('/api/pdg/terrain/marketing')).then(function (d) {
        if (generation !== sequenceTerrain) return;
        var bloc = d.agents || {};
        var s = bloc.synthese || {};
        var lignes = (bloc.par_agent || []).map(function (a) {
          return '<tr><td><strong>' + attr(a.agent) + '</strong></td>'
            + '<td>' + nombre(a.rapports) + '</td><td>' + nombre(a.valides) + '</td>'
            + '<td>' + nombre(a.en_attente) + '</td><td>' + nombre(a.rejetes) + '</td>'
            + '<td>' + nombre(a.clients_declares) + '</td><td>' + nombre(a.dossiers_constates) + '</td></tr>';
        }).join('');
        cible.innerHTML = E.grilleKpi([
          { nom: 'Agents actifs', valeur: s.agents_actifs },
          { nom: 'Rapports', valeur: s.rapports },
          { nom: 'À valider', valeur: s.en_attente_validation },
        ]) + E.avertissements(bloc.avertissements)
          + E.panneau('Travail des agents marketing',
            E.tableau(['Agent', 'Rapports', 'Validés', 'En attente', 'Rejetés',
              'Clients déclarés', 'Dossiers constatés'], lignes, {
              vide: 'Aucun rapport d’agent marketing sur la période.',
            }));
      }).catch(function (err) {
        if (generation === sequenceTerrain) afficherErreur(err, cible);
      });
    }

    function chargerTravailleursTerrain(generation) {
      var cible = panneauTerrain();
      cible.innerHTML = E.squelette(4);
      EnviroAPI.get('/api/pdg/terrain/travailleurs').then(function (d) {
        if (generation !== sequenceTerrain) return;
        var eff = d.effectifs || {};
        var dispo = d.disponibilite || {};
        var roles = (eff.par_role || []).map(function (r) {
          return '<tr><td><strong>' + attr(r.role_libelle || r.role) + '</strong></td>'
            + '<td>' + nombre(r.total) + '</td><td>' + nombre(r.actifs) + '</td>'
            + '<td>' + nombre(r.inactifs) + '</td></tr>';
        }).join('');
        var semaine = (dispo.semaine || []).map(function (j) {
          return '<tr><td><strong>' + attr(j.jour) + '</strong></td>'
            + '<td>' + nombre(j.employes_disponibles) + '</td>'
            + '<td>' + nombre(j.capacite_declaree) + '</td>'
            + '<td>' + (j.declare ? '<span class="puce ok">Déclaré</span>'
              : '<span class="puce attention">Non déclaré</span>') + '</td></tr>';
        }).join('');
        cible.innerHTML = E.grilleKpi([
          { nom: 'Personnel total', valeur: eff.total_personnel },
          { nom: 'Personnel actif', valeur: eff.total_actifs },
          { nom: 'Collecteurs actifs', valeur: dispo.collecteurs_actifs },
          { nom: 'Capacité théorique', valeur: dispo.capacite_theorique_max },
          { nom: 'Facteur limitant', valeur: dispo.facteur_limitant },
        ]) + E.avertissements(eff.avertissements)
          + E.panneau('Effectifs par rôle',
            E.tableau(['Rôle', 'Total', 'Actifs', 'Inactifs'], roles, {
              vide: 'Aucun effectif enregistré.',
            }))
          + E.panneau('Disponibilité déclarée',
            E.tableau(['Jour', 'Disponibles', 'Capacité', 'Saisie'], semaine, {
              vide: 'Aucune disponibilité enregistrée.',
            }), { sousTitre: d.note || '' });
      }).catch(function (err) {
        if (generation === sequenceTerrain) afficherErreur(err, cible);
      });
    }

    return {
      autoriser: autoriser,
      aujourdHui: aujourdHui,
      directions: directions,
      terrain: terrain,
    };
  }

  return { creer: creer };
}());
