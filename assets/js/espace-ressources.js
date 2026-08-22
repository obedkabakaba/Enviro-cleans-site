/**
 * ════════════════════════════════════════
 * TABLEAUX ET FORMULAIRES DES ESPACES DE DIRECTION
 * ════════════════════════════════════════
 *
 * Rend un menu entièrement fonctionnel — liste, recherche, filtres, tri, pagination,
 * export CSV, création, modification, soumission au circuit d'approbation — à partir
 * d'une seule ligne d'appel :
 *
 *     EspaceRessources.monter({ cible: 'vueDepenses', ressource: 'finance/depenses' });
 *
 * ── Pourquoi le formulaire n'est pas écrit ici ──
 *
 * Le serveur renvoie la description de ses champs (nom, type, obligatoire, bornes,
 * valeurs acceptées) avec chaque liste. Le formulaire est construit à partir d'elle.
 *
 * Redéclarer les règles côté navigateur créerait deux copies de la même vérité, qui
 * divergeraient à la première évolution : l'utilisateur verrait passer côté écran ce que
 * le serveur refuse, ou l'inverse. Ici, ajouter un champ au registre suffit à le faire
 * apparaître dans l'écran, avec sa validation.
 *
 * La validation navigateur reste un CONFORT — elle évite un aller-retour. Le serveur
 * revalide tout, et c'est lui qui fait foi : les messages d'erreur affichés sont les
 * siens, champ par champ.
 *
 * ── Ce que l'écran ne fait jamais ──
 *
 * Proposer une action que le serveur refusera. `peut_ecrire` vient de la réponse : un
 * bouton « Créer » affiché à quelqu'un qui recevra un 403 est un écran qui ment.
 *
 * Chargement : après enviro-api.js et espace-direction.js. Aucun build, aucune
 * dépendance, compatible GitHub Pages et CSP stricte.
 */
(function (global) {
  'use strict';

  // Résolus à l'usage, pas au chargement : l'ordre des balises <script> n'est pas
  // garanti d'une page à l'autre, et une capture au chargement donnerait `undefined`
  // sur celles qui chargent ce fichier en premier — avec pour seul symptôme un
  // squelette qui ne se remplit jamais.
  function E() { return global.EspaceDirection; }
  function API() { return global.EnviroAPI; }

  var ETIQUETTES = {
    objet: 'Objet', categorie: 'Catégorie', montant: 'Montant', devise: 'Devise',
    intitule: 'Intitulé', nom: 'Nom', libelle: 'Libellé', description: 'Description',
    reference: 'Référence', code: 'Code', statut: 'Statut', prix: 'Prix',
    date_debut: 'Date de début', date_fin: 'Date de fin', echeance: 'Échéance',
    probabilite: 'Probabilité', impact: 'Impact', priorite: 'Priorité',
    progression: 'Progression (%)', telephone: 'Téléphone', email: 'Courriel',
    source: "Canal d'acquisition", canal: 'Canal', capex: 'Investissement (CAPEX)',
    opex_annuel: 'Charges annuelles (OPEX)', risque: 'Risque', actif: 'Actif',
  };

  function etiquette(nom, regle) {
    if (regle && regle.libelle) {
      return regle.libelle.charAt(0).toUpperCase() + regle.libelle.slice(1);
    }
    if (ETIQUETTES[nom]) return ETIQUETTES[nom];
    return nom.replace(/_id$/, '').replace(/_/g, ' ').replace(/^./, function (c) {
      return c.toUpperCase();
    });
  }

  /** Valeur affichable. `null` se lit « — », jamais « 0 » : une absence n'est pas un zéro. */
  function cellule(valeur, nom) {
    if (valeur === null || valeur === undefined || valeur === '') return '—';
    if (typeof valeur === 'boolean') return valeur ? 'oui' : 'non';
    if (/^\d{4}-\d{2}-\d{2}T/.test(String(valeur))) return E().dateCourte(valeur);
    if (/montant|prix|cout|capex|opex|budget|valeur_estimee|salaire/.test(nom || '')) {
      return E().montant(valeur);
    }
    return E().echapper(String(valeur));
  }

  // ════════════════════════════════════════
  // Champs de formulaire
  // ════════════════════════════════════════

  function champHtml(nom, regle, valeur) {
    var id = 'champ_' + nom;
    var requis = regle.requis ? ' required' : '';
    var v = valeur === null || valeur === undefined ? '' : String(valeur);
    var html = '<label class="champ" for="' + id + '">'
      + '<span>' + E().echapper(etiquette(nom, regle))
      + (regle.requis ? ' <em aria-hidden="true">*</em>' : '') + '</span>';

    if (regle.valeurs) {
      html += '<select id="' + id + '" name="' + nom + '"' + requis + '>'
        + '<option value="">—</option>'
        + regle.valeurs.map(function (o) {
          return '<option value="' + E().echapper(o) + '"'
            + (o === v ? ' selected' : '') + '>' + E().echapper(o) + '</option>';
        }).join('')
        + '</select>';
    } else if (regle.type === 'booleen') {
      html += '<select id="' + id + '" name="' + nom + '">'
        + '<option value="">—</option>'
        + '<option value="true"' + (v === 'true' ? ' selected' : '') + '>oui</option>'
        + '<option value="false"' + (v === 'false' ? ' selected' : '') + '>non</option>'
        + '</select>';
    } else if (regle.type === 'devise') {
      html += '<select id="' + id + '" name="' + nom + '"' + requis + '>'
        + '<option value="">—</option>'
        + ['CDF', 'USD'].map(function (d) {
          return '<option value="' + d + '"' + (d === v ? ' selected' : '') + '>' + d + '</option>';
        }).join('')
        + '</select>';
    } else if (regle.type === 'date') {
      html += '<input type="date" id="' + id + '" name="' + nom + '" value="'
        + E().echapper(v.slice(0, 10)) + '"' + requis + '>';
    } else if (regle.type === 'montant' || regle.type === 'entier' || regle.type === 'decimal') {
      var pas = regle.type === 'entier' ? '1' : '0.01';
      html += '<input type="number" step="' + pas + '" id="' + id + '" name="' + nom + '"'
        + (regle.min !== undefined ? ' min="' + regle.min + '"' : '')
        + (regle.max !== undefined ? ' max="' + regle.max + '"' : '')
        + ' value="' + E().echapper(v) + '"' + requis + ' inputmode="decimal">';
    } else if (regle.max && regle.max > 400) {
      html += '<textarea id="' + id + '" name="' + nom + '" maxlength="' + regle.max + '"'
        + requis + '>' + E().echapper(v) + '</textarea>';
    } else {
      var type = regle.type === 'email' ? 'email' : (regle.type === 'telephone' ? 'tel' : 'text');
      html += '<input type="' + type + '" id="' + id + '" name="' + nom + '"'
        + (regle.max ? ' maxlength="' + regle.max + '"' : '')
        + ' value="' + E().echapper(v) + '"' + requis + '>';
    }

    html += '<span class="erreur-champ" data-champ="' + nom + '"></span></label>';
    return html;
  }

  function lireFormulaire(form, champs) {
    var corps = {};
    Object.keys(champs).forEach(function (nom) {
      var el = form.elements[nom];
      if (!el) return;
      var v = el.value;
      if (v === '') return;              // champ laissé vide : on ne l'envoie pas
      if (champs[nom].type === 'booleen') corps[nom] = v === 'true';
      else corps[nom] = v;
    });
    return corps;
  }

  function afficherErreursChamps(form, champs) {
    form.querySelectorAll('.erreur-champ').forEach(function (el) { el.textContent = ''; });
    Object.keys(champs || {}).forEach(function (nom) {
      var el = form.querySelector('.erreur-champ[data-champ="' + nom + '"]');
      if (el) el.textContent = champs[nom];
    });
  }

  // ════════════════════════════════════════
  // Montage
  // ════════════════════════════════════════

  function monter(options) {
    var cible = typeof options.cible === 'string'
      ? document.getElementById(options.cible) : options.cible;
    if (!cible) return;

    var chemin = '/api/ressources/' + options.ressource;
    var etat = {
      page: 1,
      taille: options.taille || 20,
      q: '',
      filtres: {},
      tri: options.tri || '',
      selection: null,
      creation: false,
    };

    function charger() {
      cible.innerHTML = E().squelette(4);

      var params = ['page=' + etat.page, 'taille=' + etat.taille];
      if (etat.q) params.push('q=' + encodeURIComponent(etat.q));
      if (etat.tri) params.push('tri=' + encodeURIComponent(etat.tri));
      Object.keys(etat.filtres).forEach(function (k) {
        if (etat.filtres[k]) params.push(k + '=' + encodeURIComponent(etat.filtres[k]));
      });

      API().get(chemin + '?' + params.join('&'))
        .then(rendre)
        .catch(function (err) { E().afficherErreur(cible, err); });
    }

    function rendre(data) {
      var colonnes = (data.lignes[0] ? Object.keys(data.lignes[0]) : [])
        .filter(function (c) {
          return ['created_at', 'updated_at', 'payload', 'donnees_avant',
            'donnees_apres', 'flux_projetes', 'alignement_strategique',
            'benefices', 'conformite', 'tags'].indexOf(c) === -1;
        })
        .slice(0, 9);

      var html = '';

      // ── Barre d'outils ──
      html += '<div class="filtres" style="margin-bottom:14px">'
        + '<input type="text" id="rechercheRessource" placeholder="Rechercher…" value="'
        + E().echapper(etat.q) + '" aria-label="Rechercher">';

      Object.keys(data.champs).forEach(function () {});
      (options.filtres || []).forEach(function (f) {
        html += '<input type="text" id="filtre_' + f + '" placeholder="'
          + E().echapper(etiquette(f, null)) + '" value="'
          + E().echapper(etat.filtres[f] || '') + '" aria-label="Filtrer par ' + E().echapper(f) + '">';
      });

      html += '<button class="action secondaire" id="exportRessource">Exporter en CSV</button>';
      if (data.peut_ecrire) {
        html += '<button class="action" id="creerRessource">Nouveau — ' + E().echapper(data.libelle) + '</button>';
      }
      html += '</div>';

      // ── Totaux par devise ──
      if (data.totaux) {
        var cartes = data.totaux.par_devise.map(function (d) {
          return {
            libelle: 'Total ' + d.devise,
            valeur: E().montant(d.total) + ' ' + d.devise,
            detail: d.lignes + ' ligne(s)',
            definition: data.totaux.definition,
          };
        });
        if (data.totaux.sans_devise > 0) {
          cartes.push({
            libelle: 'Sans devise',
            valeur: data.totaux.sans_devise,
            detail: 'ligne(s) non totalisables',
            definition: "Ces lignes ne portent pas de devise : elles ne peuvent être "
              + "rattachées à aucun total sans supposer une unité.",
          });
        }
        if (cartes.length) html += E().grilleKpi(cartes);
      }

      // ── Tableau ──
      if (!data.lignes.length) {
        html += '<div class="etat-vide"><p>Aucune ligne.</p>'
          + (data.peut_ecrire
            ? '<p>Utilisez « Nouveau » pour créer la première.</p>'
            : '<p>Vous pouvez consulter cette liste, mais pas y écrire.</p>')
          + '</div>';
      } else {
        var entetes = colonnes.map(function (c) { return etiquette(c, null); });
        var lignes = data.lignes.map(function (l) {
          return '<tr data-id="' + l.id + '" tabindex="0" role="button" '
            + 'aria-label="Ouvrir la fiche ' + E().echapper(String(l.reference || l.code || l.id)) + '">'
            + colonnes.map(function (c) { return '<td>' + cellule(l[c], c) + '</td>'; }).join('')
            + '</tr>';
        }).join('');
        html += E().tableau(entetes, lignes);
      }

      // ── Pagination ──
      var p = data.pagination;
      html += '<div class="filtres" style="margin-top:12px;justify-content:space-between">'
        + '<span class="sous-titre">' + p.total + ' ligne(s) — page ' + p.page + ' sur ' + p.pages + '</span>'
        + '<span>'
        + '<button class="action secondaire" id="pagePrec"' + (p.page <= 1 ? ' disabled' : '') + '>Précédente</button> '
        + '<button class="action secondaire" id="pageSuiv"' + (p.page >= p.pages ? ' disabled' : '') + '>Suivante</button>'
        + '</span></div>';

      html += '<div id="panneauRessource"></div>';

      cible.innerHTML = html;
      brancher(data);
    }

    function brancher(data) {
      var recherche = document.getElementById('rechercheRessource');
      var minuteur = null;
      recherche.addEventListener('input', function () {
        clearTimeout(minuteur);
        minuteur = setTimeout(function () {
          etat.q = recherche.value.trim();
          etat.page = 1;
          charger();
        }, 350);
      });

      (options.filtres || []).forEach(function (f) {
        var el = document.getElementById('filtre_' + f);
        if (!el) return;
        el.addEventListener('change', function () {
          etat.filtres[f] = el.value.trim();
          etat.page = 1;
          charger();
        });
      });

      document.getElementById('pagePrec').addEventListener('click', function () {
        if (etat.page > 1) { etat.page -= 1; charger(); }
      });
      document.getElementById('pageSuiv').addEventListener('click', function () {
        etat.page += 1; charger();
      });

      document.getElementById('exportRessource').addEventListener('click', function () {
        exporter();
      });

      var boutonCreer = document.getElementById('creerRessource');
      if (boutonCreer) {
        boutonCreer.addEventListener('click', function () { formulaire(data, null); });
      }

      cible.querySelectorAll('tbody tr[data-id]').forEach(function (tr) {
        function ouvrir() { fiche(data, tr.getAttribute('data-id')); }
        tr.addEventListener('click', ouvrir);
        tr.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); ouvrir(); }
        });
      });
    }

    /**
     * Export CSV.
     *
     * Le fichier est produit par le SERVEUR, avec les mêmes filtres que la liste : il
     * contient donc toutes les lignes filtrées, pas seulement la page affichée. Un export
     * construit côté navigateur à partir de la page courante donnerait un fichier
     * silencieusement tronqué — le pire des deux mondes.
     */
    function exporter() {
      var params = ['export=csv'];
      if (etat.q) params.push('q=' + encodeURIComponent(etat.q));
      Object.keys(etat.filtres).forEach(function (k) {
        if (etat.filtres[k]) params.push(k + '=' + encodeURIComponent(etat.filtres[k]));
      });

      fetch(API().BASE_URL + chemin + '?' + params.join('&'), {
        headers: { Authorization: 'Bearer ' + API().Session.accessToken() },
      }).then(function (r) {
        if (!r.ok) throw new Error("L'export a échoué (" + r.status + ').');
        return r.blob();
      }).then(function (blob) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = options.ressource.replace('/', '-') + '.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }).catch(function (err) {
        alert(err.message);
      });
    }

    // ── Fiche : détail, historique des effets, actions ──
    function fiche(data, id) {
      var panneau = document.getElementById('panneauRessource');
      panneau.innerHTML = E().squelette(2);
      panneau.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

      API().get(chemin + '/' + id).then(function (d) {
        var l = d.ligne;
        var corps = '<dl class="fiche">';
        Object.keys(l).forEach(function (c) {
          if (['payload', 'donnees_avant', 'donnees_apres'].indexOf(c) !== -1) return;
          corps += '<dt>' + E().echapper(etiquette(c, null)) + '</dt><dd>' + cellule(l[c], c) + '</dd>';
        });
        corps += '</dl>';

        // Ce qui est arrivé à cette pièce, et quand. Répond à « pourquoi est-elle passée
        // à approuvée ? » sans ouvrir le journal technique.
        if (d.effets && d.effets.length) {
          corps += '<h3>Suites données</h3><ul class="liste-effets">'
            + d.effets.map(function (e) {
              var r = e.resultat || {};
              return '<li><strong>' + E().echapper(e.etat) + '</strong> — '
                + E().echapper(e.demande_objet || e.type)
                + (e.decided_at ? ' · décidé le ' + E().dateHeure(e.decided_at) : '')
                + (r.motif ? '<br><span class="sous-titre">' + E().echapper(r.motif) + '</span>' : '')
                + '</li>';
            }).join('') + '</ul>';
        }

        corps += '<div class="filtres" style="margin-top:14px">';
        if (d.peut_ecrire && d.modifiable) {
          corps += '<button class="action" id="modifierRessource">Modifier</button>';
        }
        if (d.peut_ecrire && data.passe_par_approbation && !l.approval_request_id) {
          corps += '<button class="action" id="soumettreRessource">Soumettre à approbation</button>';
        }
        if (d.peut_ecrire && !d.modifiable) {
          corps += '<span class="sous-titre">Cette pièce a été décidée sur son contenu : '
            + 'elle n’est plus modifiable.</span>';
        }
        corps += '<button class="action secondaire" id="fermerFiche">Fermer</button></div>';

        panneau.innerHTML = E().panneau(
          d.libelle + ' ' + E().echapper(String(l.reference || l.code || '#' + l.id)), corps
        );

        document.getElementById('fermerFiche').addEventListener('click', function () {
          panneau.innerHTML = '';
        });

        var bMod = document.getElementById('modifierRessource');
        if (bMod) bMod.addEventListener('click', function () { formulaire(data, l); });

        var bSoum = document.getElementById('soumettreRessource');
        if (bSoum) {
          bSoum.addEventListener('click', function () {
            bSoum.disabled = true;
            API().post(chemin + '/' + id + '/soumettre', {})
              .then(function (r) {
                alert(r.message + '\nNiveau requis : ' + r.demande.niveau_requis
                  + ' · ' + r.demande.nombre_etapes + ' étape(s).');
                charger();
              })
              .catch(function (err) { alert(err.message); bSoum.disabled = false; });
          });
        }
      }).catch(function (err) { E().afficherErreur(panneau, err); });
    }

    // ── Formulaire de création / modification ──
    function formulaire(data, ligne) {
      var panneau = document.getElementById('panneauRessource');
      var enModification = Boolean(ligne);

      var corps = '<form id="formRessource" novalidate><div class="grille-champs">'
        + Object.keys(data.champs).map(function (nom) {
          return champHtml(nom, data.champs[nom], ligne ? ligne[nom] : null);
        }).join('')
        + '</div>'
        + '<p class="sous-titre">Les champs marqués <em>*</em> sont obligatoires.'
        + (data.passe_par_approbation && !enModification
          ? ' Cette pièce sera créée en brouillon : elle ne produira d’effet qu’une fois '
            + 'soumise puis approuvée.'
          : '')
        + '</p>'
        + '<div class="filtres" style="margin-top:12px">'
        + '<button class="action" type="submit">' + (enModification ? 'Enregistrer' : 'Créer') + '</button>'
        + '<button class="action secondaire" type="button" id="annulerForm">Annuler</button>'
        + '<span class="erreur-globale" role="alert"></span>'
        + '</div></form>';

      panneau.innerHTML = E().panneau(
        (enModification ? 'Modifier ' : 'Nouveau — ') + data.libelle, corps
      );
      panneau.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

      var form = document.getElementById('formRessource');
      document.getElementById('annulerForm').addEventListener('click', function () {
        panneau.innerHTML = '';
      });

      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var bouton = form.querySelector('button[type=submit]');
        var globale = form.querySelector('.erreur-globale');
        globale.textContent = '';
        afficherErreursChamps(form, {});
        bouton.disabled = true;

        var corpsRequete = lireFormulaire(form, data.champs);
        var promesse = enModification
          ? API().appel(chemin + '/' + ligne.id, { method: 'PATCH', body: corpsRequete })
          : API().post(chemin, corpsRequete);

        promesse.then(function () {
          panneau.innerHTML = '';
          charger();
        }).catch(function (err) {
          bouton.disabled = false;
          // Les messages viennent du serveur : c'est lui qui valide, et lui seul sait
          // pourquoi il refuse.
          if (err.champs) {
            afficherErreursChamps(form, err.champs);
            globale.textContent = 'Corrigez les champs signalés.';
          } else {
            globale.textContent = err.message;
          }
        });
      });
    }

    charger();
    return { recharger: charger };
  }

  /**
   * Ajoute un bloc de gestion SOUS une vue d'analyse existante.
   *
   * Les écrans d'analyse déjà en place — répartitions, totaux par devise, alertes — sont
   * conservés tels quels : ils répondent à « où en est-on ? ». Le bloc de gestion répond
   * à « que fait-on ? ». Les remplacer par un tableau générique aurait fait perdre le
   * travail d'analyse au profit d'une liste brute.
   *
   * Le bloc est monté dans `#zoneGestion`, PAS dans la vue : les vues d'analyse
   * réécrivent `#contenu` entièrement lorsque leur requête aboutit, et un bloc ajouté
   * là serait effacé par la réponse — de façon intermittente, selon qui du réseau ou du
   * rendu arrive le premier. Le pire des défauts : celui qui ne se reproduit pas.
   *
   * @param {Element} _vue  ignoré, conservé pour la lisibilité de l'appel
   * @param {object}  options { ressource, titre, filtres, id }
   */
  function ajouterGestion(_vue, options) {
    var conteneur = document.getElementById('zoneGestion');
    if (!conteneur) return null;

    var bloc = document.createElement('section');
    bloc.className = 'panneau';
    bloc.innerHTML = '<h2>' + E().echapper(options.titre || 'Gestion') + '</h2>'
      + '<div id="' + (options.id || 'gestionRessource') + '"></div>';
    conteneur.appendChild(bloc);

    return monter({
      cible: options.id || 'gestionRessource',
      ressource: options.ressource,
      filtres: options.filtres,
      taille: options.taille,
    });
  }

  global.EspaceRessources = {
    monter: monter,
    ajouterGestion: ajouterGestion,
    etiquette: etiquette,
    cellule: cellule,
  };
}(typeof window !== 'undefined' ? window : this));
