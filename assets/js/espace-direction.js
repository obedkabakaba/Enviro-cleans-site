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

  /**
   * Bandeau d'avertissements.
   *
   * ── Pourquoi ils sont repliés au-delà de deux ──
   *
   * Ces avertissements disent ce qu'il ne faut PAS conclure de la donnée, et chacun est
   * utile. Mais sur une base encore peu remplie, le tableau de bord RH en produit seize.
   * Empilés en pleine largeur, ils repoussent les indicateurs sous la ligne de flottaison
   * et donnent à un écran parfaitement sain l'aspect d'une plateforme en panne — c'est
   * d'ailleurs ainsi qu'ils ont été rapportés : « des messages d'erreur partout ».
   *
   * Un avertissement qu'on ne lit plus ne sert à rien, et un mur qui fait peur est pire
   * qu'un mur ignoré. Au-delà de deux, ils sont donc regroupés dans un bloc dépliable :
   * le compte reste visible en permanence, le détail est à un clic. Rien n'est masqué,
   * rien n'est perdu — c'est l'ordre de lecture qui change.
   *
   * En dessous de trois, ils restent affichés tels quels : deux lignes ne noient rien.
   */
  function avertissements(liste, options) {
    if (!liste || liste.length === 0) return '';
    options = options || {};

    var uniques = liste.filter(function (a, i) { return liste.indexOf(a) === i; });
    var seuil = options.seuil || 3;

    if (uniques.length < seuil) {
      return uniques.map(function (a) {
        return '<div class="avertissement">' + echapper(a) + '</div>';
      }).join('');
    }

    return '<details class="avertissement replie">'
      + '<summary><strong>' + uniques.length + ' remarque(s) sur la qualité des données'
      + '</strong> — ce que ces chiffres ne disent pas</summary>'
      + '<ul>' + uniques.map(function (a) {
        return '<li>' + echapper(a) + '</li>';
      }).join('') + '</ul>'
      + '</details>';
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

      // La zone de gestion est vidée AVANT la vue : sans cela, le tableau de la vue
      // précédente resterait visible sous la nouvelle, et un formulaire à demi rempli
      // survivrait à un changement d'écran.
      var zone = document.getElementById('zoneGestion');
      if (zone) zone.innerHTML = '';

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


  /**
   * Export CSV.
   *
   * ── Pourquoi pas simplement `join(',')` ──
   *
   * Un nom de client contenant une virgule (« Kabila, Jean ») décalerait toutes les
   * colonnes suivantes, et le fichier s'ouvrirait de travers sans que rien ne le signale.
   * Chaque cellule est donc entourée de guillemets, et les guillemets internes doublés,
   * comme le veut la convention CSV.
   *
   * ── Le préfixe BOM ──
   *
   * Excel en configuration française ouvre un CSV UTF-8 sans BOM en interprétant les
   * octets comme du Latin-1 : « Ndjili » devient « NdjiliÂ ». Trois octets réglent le
   * problème, et leur absence est l'une des raisons les plus fréquentes pour lesquelles
   * un export « ne marche pas ».
   *
   * ── Le séparateur ──
   *
   * Point-virgule, et non virgule : c'est ce qu'attend Excel dans les locales où la
   * virgule est le séparateur décimal, ce qui est le cas ici.
   */
  function exporterCsv(nomFichier, entetes, lignes) {
    function cellule(v) {
      if (v === null || v === undefined) return '""';
      return '"' + String(v).replace(/"/g, '""') + '"';
    }

    var contenu = [entetes.map(cellule).join(';')]
      .concat(lignes.map(function (l) { return l.map(cellule).join(';'); }))
      .join('\r\n');

    var blob = new Blob(['\ufeff' + contenu], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var lien = document.createElement('a');
    lien.href = url;
    lien.download = nomFichier + '-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(lien);
    lien.click();
    document.body.removeChild(lien);
    URL.revokeObjectURL(url);
  }

  /**
   * Catalogue de rapports exportables.
   *
   * Chaque entrée nomme son endpoint et la façon d'en tirer un tableau. L'écran affiche
   * le catalogue, laisse choisir, charge, montre un aperçu, puis exporte CE QUI EST
   * AFFICHÉ — jamais un second appel dont le résultat pourrait différer de l'aperçu.
   */
  function vueRapports(options) {
    var cible = options.cible;
    var catalogue = options.catalogue;
    var sousTitre = options.sousTitre;

    var lignesCatalogue = catalogue.map(function (r, i) {
      return '<tr>'
        + '<td><strong>' + echapper(r.nom) + '</strong><br>'
        + '<small style="color:var(--texte-faible)">' + echapper(r.description) + '</small></td>'
        + '<td><code style="font-size:11px">' + echapper(r.chemin) + '</code></td>'
        + '<td><button class="action" data-rapport="' + i + '">Générer</button></td>'
        + '</tr>';
    }).join('');

    cible.innerHTML = panneau('Catalogue des rapports',
      tableau(['Rapport', 'Source', ''], lignesCatalogue,
        { vide: 'Aucun rapport déclaré pour cet espace.' }),
      { sousTitre: sousTitre || 'Chaque rapport est construit à partir des données '
        + 'réellement servies par l’API. L’export reprend l’aperçu affiché, à l’identique.' })
      + '<div id="apercuRapport"></div>';

    Array.prototype.forEach.call(cible.querySelectorAll('[data-rapport]'), function (b) {
      b.addEventListener('click', function () {
        genererRapport(catalogue[Number(b.getAttribute('data-rapport'))]);
      });
    });
  }

  function genererRapport(rapport) {
    var apercu = document.getElementById('apercuRapport');
    apercu.innerHTML = squelette(3);

    window.EnviroAPI.get(rapport.chemin).then(function (d) {
      var table = rapport.extraire(d);

      if (!table || !table.lignes || table.lignes.length === 0) {
        apercu.innerHTML = panneau(rapport.nom,
          '<div class="etat-vide">' + echapper(table && table.vide
            ? table.vide
            : 'Aucune donnée à exporter pour ce rapport.') + '</div>');
        return;
      }

      var corps = table.lignes.slice(0, 50).map(function (l) {
        return '<tr>' + l.map(function (c) {
          return '<td>' + echapper(c === null || c === undefined ? '—' : c) + '</td>';
        }).join('') + '</tr>';
      }).join('');

      apercu.innerHTML = panneau(rapport.nom,
        tableau(table.entetes, corps)
        + '<p class="meta" style="margin-top:12px">'
        + nombre(table.lignes.length) + ' ligne(s)'
        + (table.lignes.length > 50 ? ' — aperçu limité aux 50 premières, l’export les contient toutes' : '')
        + '</p>'
        + '<button class="action" id="telechargerCsv">Télécharger en CSV</button>');

      document.getElementById('telechargerCsv').addEventListener('click', function () {
        exporterCsv(rapport.fichier || 'rapport', table.entetes, table.lignes);
      });
    }).catch(function (err) { afficherErreur(apercu, err); });
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
    exporterCsv: exporterCsv,
    vueRapports: vueRapports,
  };
}(typeof window !== 'undefined' ? window : this));
