/**
 * ════════════════════════════════════════
 * BARRE DE COMMANDES — les transitions d'état à l'écran
 * ════════════════════════════════════════
 *
 * Rend les actions qu'une pièce accepte RÉELLEMENT, telles que le serveur les calcule.
 *
 * ── Pourquoi les boutons ne sont pas écrits dans la page ──
 *
 * Une liste de boutons codée à l'écran finit toujours par diverger du serveur : on ajoute
 * une étape au circuit et l'écran continue de proposer l'ancienne, ou l'inverse. Les
 * actions viennent donc de `GET …/actions`, qui applique la machine à états, les
 * permissions et la séparation des tâches — et renvoie, pour chaque action refusée, LE
 * MOTIF du refus.
 *
 * Un bouton grisé sans explication est une impasse : l'utilisateur ne sait ni pourquoi,
 * ni quoi faire. Le motif est donc affiché sous la barre, en clair.
 *
 * ── Ce que cette barre ne fait jamais ──
 *
 * Elle n'affiche pas de succès qu'elle n'a pas obtenu. Rien n'est mis à jour localement :
 * après chaque commande, la pièce est RECHARGÉE depuis l'API. C'est ce qui fait
 * apparaître un conflit 409 au bon moment — quand quelqu'un d'autre a fait avancer la
 * pièce entre l'affichage et le clic.
 *
 * Aucun build, aucune dépendance, compatible GitHub Pages et CSP stricte.
 */
(function (global) {
  'use strict';

  function E() { return global.EspaceDirection; }
  function API() { return global.EnviroAPI; }

  var LIBELLES_SAISIE = {
    motif: 'Motif',
    motif_refus: 'Motif du refus',
    motif_rejet: 'Motif du rejet',
    motif_perte: 'Motif de la perte',
    motif_fin: 'Motif',
    mode_paiement: 'Mode de paiement',
    beneficiaire: 'Bénéficiaire',
    reference_paiement: 'Référence du paiement',
    assigne_a: 'Assigner à (identifiant)',
    cause_racine: 'Cause racine',
    action_corrective: 'Action corrective',
    sanction: 'Sanction',
    blocage: 'Nature du blocage',
    prochaine_action_le: 'Date de la prochaine action',
    prochaine_etape: 'Suite donnée',
    date_fin: 'Date de fin',
  };

  var TYPES_SAISIE = {
    prochaine_action_le: 'date',
    date_fin: 'date',
    assigne_a: 'number',
  };

  function libelleSaisie(champ) {
    return LIBELLES_SAISIE[champ] || champ.replace(/_/g, ' ');
  }

  /**
   * Monte la barre de commandes d'une pièce.
   *
   * @param options.cible      élément ou identifiant où rendre la barre
   * @param options.ressource  clé du circuit, ex. « finance/depenses »
   * @param options.id         identifiant de la pièce
   * @param options.apres      appelée après une commande réussie (pour recharger l'écran)
   */
  function barre(options) {
    var cible = typeof options.cible === 'string'
      ? document.getElementById(options.cible) : options.cible;
    if (!cible) return;

    var chemin = '/api/ressources/' + options.ressource + '/' + options.id;

    function charger() {
      cible.innerHTML = '<p class="sous-titre">Chargement des commandes…</p>';

      API().get(chemin + '/actions')
        .then(rendre)
        .catch(function (err) {
          // Un circuit sans machine déclarée n'est pas une panne : la pièce se gère au
          // formulaire, comme avant. On le dit sans alarmer.
          if (err && /inconnu/i.test(err.message || '')) {
            cible.innerHTML = '';
            return;
          }
          E().afficherErreur(cible, err);
        });
    }

    function rendre(vue) {
      var possibles = vue.actions.filter(function (a) { return a.autorise; });
      var refusees = vue.actions.filter(function (a) { return !a.autorise; });

      var html = '<div class="commandes">'
        + '<p class="sous-titre">État : <strong>'
        + E().echapper(String(vue.etat || '—').replace(/_/g, ' ')) + '</strong></p>';

      if (vue.actions.length === 0) {
        html += '<p class="etat-vide">Aucune action possible depuis cet état : '
          + 'le circuit est terminé.</p></div>';
        cible.innerHTML = html;
        return;
      }

      html += '<div class="filtres" style="margin-top:10px">';
      possibles.forEach(function (a, i) {
        html += '<button class="action' + (a.sensible ? '' : ' secondaire')
          + '" data-vers="' + E().echapper(a.vers) + '" data-i="' + i + '">'
          + E().echapper(a.libelle) + '</button> ';
      });
      refusees.forEach(function (a) {
        html += '<button class="action secondaire" disabled title="'
          + E().echapper(a.motif || '') + '">' + E().echapper(a.libelle) + '</button> ';
      });
      html += '</div>';

      // Les motifs en clair : une infobulle ne se lit pas sur mobile, et un bouton grisé
      // muet laisse l'utilisateur sans issue.
      if (refusees.length) {
        html += '<ul class="compact" style="margin-top:10px">'
          + refusees.map(function (a) {
            return '<li><strong>' + E().echapper(a.libelle) + '</strong> — '
              + E().echapper(a.motif || 'non disponible') + '</li>';
          }).join('') + '</ul>';
      }

      html += '<div id="saisieCommande"></div>'
        + '<p class="meta" id="messageCommande"></p></div>';

      cible.innerHTML = html;

      cible.querySelectorAll('[data-vers]').forEach(function (b) {
        b.addEventListener('click', function () {
          demarrer(possibles[Number(b.getAttribute('data-i'))], b);
        });
      });
    }

    /**
     * Une action qui exige des informations ouvre un formulaire ; les autres partent
     * directement, après confirmation si elles engagent.
     */
    function demarrer(action, bouton) {
      var zone = document.getElementById('saisieCommande');
      var message = document.getElementById('messageCommande');
      message.textContent = '';

      if (!action.saisie_requise.length) {
        if (action.sensible && !global.confirm(
          action.libelle + ' — cette action produit un effet qui ne se défait pas '
          + 'simplement. Confirmer ?'
        )) return;
        envoyer(action, {}, bouton);
        return;
      }

      zone.innerHTML = '<form class="formulaire" id="formCommande">'
        + '<p class="sous-titre">' + E().echapper(action.libelle)
        + ' — informations requises</p>'
        + action.saisie_requise.map(function (champ) {
          var type = TYPES_SAISIE[champ] || 'text';
          var long = ['motif', 'motif_refus', 'motif_rejet', 'motif_perte',
            'cause_racine', 'action_corrective', 'blocage', 'sanction'].indexOf(champ) !== -1;
          return '<label>' + E().echapper(libelleSaisie(champ))
            + (long
              ? '<textarea name="' + E().echapper(champ) + '" rows="3" required></textarea>'
              : '<input type="' + type + '" name="' + E().echapper(champ) + '" required>')
            + '</label>';
        }).join('')
        + '<div class="filtres">'
        + '<button type="submit" class="action">' + E().echapper(action.libelle) + '</button> '
        + '<button type="button" class="action secondaire" id="annulerCommande">Annuler</button>'
        + '</div></form>';

      document.getElementById('annulerCommande').addEventListener('click', function () {
        zone.innerHTML = '';
      });

      document.getElementById('formCommande').addEventListener('submit', function (ev) {
        ev.preventDefault();
        var saisie = {};
        action.saisie_requise.forEach(function (c) {
          saisie[c] = ev.target.elements[c].value;
        });
        if (action.sensible && !global.confirm(
          action.libelle + ' — cette action produit un effet qui ne se défait pas '
          + 'simplement. Confirmer ?'
        )) return;
        envoyer(action, saisie, ev.target.querySelector('button[type=submit]'));
      });
    }

    function envoyer(action, saisie, bouton) {
      // Protection contre le double clic : deux décaissements pour un seul geste, ce
      // sont deux sorties d'argent — et le serveur les refusera, mais l'écran ne doit
      // pas les proposer.
      if (bouton.disabled) return;
      var texte = bouton.textContent;
      bouton.disabled = true;
      bouton.textContent = 'En cours…';

      var message = document.getElementById('messageCommande');

      API().post(chemin + '/transitions', { vers: action.vers, saisie: saisie })
        .then(function (r) {
          var zone = document.getElementById('saisieCommande');
          if (zone) zone.innerHTML = '';
          if (message) {
            message.textContent = r.message
              + (r.effet && r.effet.resume ? ' — ' + r.effet.resume : '');
          }
          // Rechargement depuis l'API : l'écran doit montrer l'état RÉEL, pas celui
          // qu'on espérait obtenir.
          charger();
          if (typeof options.apres === 'function') options.apres(r);
        })
        .catch(function (err) {
          // Le message du serveur est rédigé pour être lu : « Séparation des
          // responsabilités : vous êtes déjà intervenu sur cette pièce ». Le remplacer
          // par un générique priverait l'utilisateur de la seule information utile.
          if (message) {
            message.innerHTML = '<span class="erreur">' + E().echapper(err.message) + '</span>';
          }
          bouton.disabled = false;
          bouton.textContent = texte;
        });
    }

    charger();
  }

  /** Les circuits que ce compte peut piloter. Sert à masquer ce qui n'est pas ouvert. */
  function circuits() {
    return API().get('/api/ressources/circuits').then(function (d) { return d.circuits; });
  }

  global.EspaceCommandes = { barre: barre, circuits: circuits };
}(typeof window !== 'undefined' ? window : this));
