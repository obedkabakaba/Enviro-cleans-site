/**
 * ════════════════════════════════════════
 * BOÎTE À OUTILS DES ESPACES DE DIRECTION
 * ════════════════════════════════════════
 *
 * Les fonctions que chaque espace de direction réécrivait à l'identique : échappement
 * HTML, formatage des nombres, cartes d'indicateur, squelettes de chargement, routage
 * du menu latéral.
 *
 * ── Pourquoi les mutualiser ──
 *
 * `echapper()` en particulier. Recopiée dans chaque page, elle finit tôt ou tard par être
 * oubliée à un endroit — et c'est précisément là que passera un nom de client contenant
 * une apostrophe ou un chevron. Une seule implémentation, chargée partout.
 *
 * `nombre()` porte l'autre règle centrale de ces écrans : `null` se lit « — », jamais
 * « 0 ». Un indicateur non mesuré et un indicateur nul sont deux informations opposées,
 * et les confondre transforme une absence de donnée en constat.
 *
 * Chargement : <script src="assets/js/espace-direction.js"></script>, après enviro-api.js.
 * Aucun build, aucune dépendance, compatible GitHub Pages et CSP stricte.
 */
(function (global) {
  'use strict';

  var ENTITES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

  /** Échappement HTML. Toute valeur venant de l'API passe par ici, sans exception. */
  function echapper(v) {
    if (v === null || v === undefined) return '';
    return String(v).replace(/[&<>"']/g, function (c) { return ENTITES[c]; });
  }

  /**
   * Formate un nombre.
   * `null` et `undefined` produisent « — », jamais « 0 » : une donnée absente n'est pas
   * une donnée nulle.
   */
  function nombre(v) {
    if (v === null || v === undefined) return '—';
    if (typeof v === 'number') return v.toLocaleString('fr-FR');
    var n = Number(v);
    return Number.isFinite(n) ? n.toLocaleString('fr-FR') : echapper(v);
  }

  /**
   * Formate un montant.
   *
   * Aucune devise n'est ajoutée : `payments.montant` n'en porte pas. Écrire « USD » ou
   * « CDF » ici serait une invention, et une invention qu'on ne remarquerait pas.
   */
  function montant(v) {
    if (v === null || v === undefined) return '—';
    var n = Number(v);
    if (!Number.isFinite(n)) return echapper(v);
    return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /** Pourcentage. `null` = non mesuré. */
  function pourcent(v) {
    if (v === null || v === undefined) return '—';
    var n = Number(v);
    return Number.isFinite(n) ? n.toLocaleString('fr-FR') + ' %' : echapper(v);
  }

  function dateCourte(v) {
    if (!v) return '—';
    var d = new Date(v);
    return isNaN(d.getTime()) ? echapper(v) : d.toLocaleDateString('fr-FR');
  }

  function dateHeure(v) {
    if (!v) return '—';
    var d = new Date(v);
    return isNaN(d.getTime()) ? echapper(v) : d.toLocaleString('fr-FR');
  }

  /** Barres de chargement, largeur dégressive pour ne pas ressembler à un tableau. */
  function squelette(lignes) {
    var html = '';
    for (var i = 0; i < (lignes || 4); i += 1) {
      html += '<div class="squelette" style="margin-bottom:9px;width:'
        + (100 - i * 9) + '%"></div>';
    }
    return html;
  }

  /**
   * Carte d'indicateur.
   *
   * Trois états distincts, et c'est tout l'intérêt de cette fonction :
   *   - `disponible: false`      → « Non mesuré » + motif, en petit et grisé ;
   *   - valeur `null`            → « Aucune donnée » ;
   *   - valeur présente          → le chiffre.
   *
   * Les deux premiers ne doivent JAMAIS produire un zéro.
   */
  function carteKpi(k) {
    if (k.disponible === false) {
      return '<div class="kpi non-mesure">'
        + '<div class="libelle">' + echapper(k.nom) + '</div>'
        + '<div class="valeur">Non mesuré</div>'
        + '<div class="motif">' + echapper(k.motif || k.motif_indisponible || '') + '</div>'
        + '</div>';
    }

    var infoBulle = [
      k.definition,
      k.formule ? 'Formule : ' + k.formule : '',
      k.sources && k.sources.length ? 'Sources : ' + k.sources.join(', ') : '',
      k.note ? '⚠ ' + k.note : '',
    ].filter(Boolean).join('\n\n');

    var corps;
    if (k.valeur === null || k.valeur === undefined) {
      corps = '<span style="color:var(--texte-faible);font-size:17px">Aucune donnée</span>';
    } else if (k.format === 'montant') {
      corps = montant(k.valeur);
    } else if (k.format === 'pourcent') {
      corps = pourcent(k.valeur);
    } else {
      corps = nombre(k.valeur)
        + (k.unite ? '<span class="unite">' + echapper(k.unite) + '</span>' : '');
    }

    return '<div class="kpi">'
      + (infoBulle ? '<span class="info" title="' + echapper(infoBulle) + '">i</span>' : '')
      + '<div class="libelle">' + echapper(k.nom) + '</div>'
      + '<div class="valeur">' + corps + '</div>'
      + (k.base ? '<div class="base">' + echapper(k.base) + '</div>' : '')
      + '</div>';
  }

  function grilleKpi(cartes) {
    return '<div class="grille-kpi">' + cartes.map(carteKpi).join('') + '</div>';
  }

  /** Bandeau d'avertissements. Vide s'il n'y en a pas — pas de cadre décoratif. */
  function avertissements(liste) {
    if (!liste || liste.length === 0) return '';
    return liste.map(function (a) {
      return '<div class="avertissement">' + echapper(a) + '</div>';
    }).join('');
  }

  /** Liste, avec état vide explicite plutôt qu'une section qui disparaît. */
  function listeOuVide(items, vide) {
    if (!items || items.length === 0) {
      return '<p class="meta" style="color:var(--texte-faible)">' + echapper(vide) + '</p>';
    }
    return '<ul class="compact">' + items.map(function (i) {
      return '<li>' + echapper(i) + '</li>';
    }).join('') + '</ul>';
  }

  function panneau(titre, corps, options) {
    options = options || {};
    return '<div class="panneau"><header><h2>' + echapper(titre) + '</h2>'
      + (options.sousTitre
        ? '<small style="color:var(--texte-faible)">' + echapper(options.sousTitre) + '</small>'
        : '')
      + '</header><div class="corps">' + corps + '</div></div>';
  }

  function tableau(entetes, lignesHtml, options) {
    options = options || {};
    if (!lignesHtml) {
      return '<div class="etat-vide">' + echapper(options.vide || 'Aucune donnée.') + '</div>';
    }
    return '<div class="table-wrap"><table><thead><tr>'
      + entetes.map(function (e) { return '<th>' + echapper(e) + '</th>'; }).join('')
      + '</tr></thead><tbody>' + lignesHtml + '</tbody></table></div>';
  }

  /**
   * Routage du menu latéral.
   *
   * `vues` associe une clé de `data-vue` à sa fonction de rendu. Retourne `allerA` pour
   * que la page puisse changer de vue elle-même (après une action, par exemple).
   */
  function router(vues, titres, options) {
    options = options || {};
    var elTitre = document.getElementById(options.titreId || 'titreVue');
    var elSousTitre = document.getElementById(options.sousTitreId || 'sousTitre');
    var liens = document.querySelectorAll('.menu a');

    function allerA(vue) {
      if (!vues[vue]) vue = Object.keys(vues)[0];

      if (elTitre) elTitre.textContent = titres[vue] || vue;
      if (elSousTitre) elSousTitre.textContent = 'Chargement…';

      Array.prototype.forEach.call(liens, function (a) {
        a.classList.toggle('actif', a.getAttribute('data-vue') === vue);
      });

      vues[vue]();
    }

    Array.prototype.forEach.call(liens, function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        allerA(a.getAttribute('data-vue'));
      });
    });

    return allerA;
  }

  /**
   * Affiche une erreur de chargement dans la zone de contenu.
   *
   * Le message de l'API est affiché tel quel : il est rédigé pour être lu par un humain
   * (« budget épuisé », « permission requise »), et le remplacer par un générique
   * priverait l'utilisateur de la seule information utile.
   */
  function afficherErreur(cible, err) {
    var el = typeof cible === 'string' ? document.getElementById(cible) : cible;
    if (!el) return;
    el.innerHTML = '<div class="erreur">'
      + echapper(err && err.message ? err.message : 'Erreur inattendue.') + '</div>';
  }

  global.EspaceDirection = {
    echapper: echapper,
    nombre: nombre,
    montant: montant,
    pourcent: pourcent,
    dateCourte: dateCourte,
    dateHeure: dateHeure,
    squelette: squelette,
    carteKpi: carteKpi,
    grilleKpi: grilleKpi,
    avertissements: avertissements,
    listeOuVide: listeOuVide,
    panneau: panneau,
    tableau: tableau,
    router: router,
    afficherErreur: afficherErreur,
  };
}(typeof window !== 'undefined' ? window : this));
