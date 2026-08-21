/**
 * ════════════════════════════════════════
 * GRAPHIQUES DES ESPACES DE DIRECTION
 * ════════════════════════════════════════
 *
 * SVG écrit à la main, sans aucune dépendance : rien à télécharger, rien à épingler,
 * rien qu'une politique de sécurité de contenu puisse bloquer, et le thème suit les
 * jetons CSS du châssis sans une ligne de JavaScript.
 *
 * ── Les règles que ce fichier applique, et pourquoi ──
 *
 * 1. **La couleur vient en dernier, et elle a un métier.** Une grandeur prend la rampe
 *    séquentielle (une teinte, plus c'est foncé plus c'est grand). Des séries distinctes
 *    prennent la palette catégorielle, dans un ORDRE FIXE — jamais recyclé, jamais
 *    généré. Un état prend les couleurs de statut, réservées.
 *
 * 2. **Trois séries au maximum sur un donut, six sur des barres.** Ce n'est pas un
 *    choix esthétique : les formes où deux couleurs quelconques peuvent se toucher
 *    (donut, nuage de points, carte) sont validées sur TOUTES les paires, et aucune
 *    combinaison de plus de trois teintes ne franchit le seuil de distinction sous
 *    daltonisme. Au-delà, `Autres` regroupe la queue.
 *
 * 3. **Le texte ne porte jamais la couleur d'une série.** L'identité vient de la
 *    pastille posée à côté du texte. Un jaune parfaitement lisible en aplat est
 *    illisible en caractères sur fond blanc.
 *
 * 4. **Chaque graphique embarque son tableau.** C'est la contrepartie explicite des
 *    deux réserves de la palette (voir le CSS), et la seule façon qu'un lecteur qui ne
 *    distingue pas deux teintes accède quand même aux valeurs.
 *
 * 5. **Jamais deux axes verticaux.** Deux grandeurs d'échelles différentes font deux
 *    graphiques, ou une base 100 commune. Un double axe laisse choisir au dessinateur
 *    l'endroit où les courbes se croisent, ce qui revient à choisir la conclusion.
 *
 * 6. **Rien n'est inventé pour faire joli.** Une série sans donnée n'est pas tracée à
 *    zéro : elle produit un état vide nommé. C'est la règle de toute la plateforme.
 */

window.G = (function () {
  'use strict';

  var SERIES = ['var(--serie-1)', 'var(--serie-2)', 'var(--serie-3)',
    'var(--serie-4)', 'var(--serie-5)', 'var(--serie-6)'];
  var SEQUENTIEL = ['var(--sequentiel-1)', 'var(--sequentiel-2)', 'var(--sequentiel-3)',
    'var(--sequentiel-4)', 'var(--sequentiel-5)'];

  /** Plafond des formes « toutes paires ». Voir la règle 2 de l'en-tête. */
  var MAX_TOUTES_PAIRES = 3;
  /** Plafond des formes « paires adjacentes ». */
  var MAX_ADJACENTES = 6;

  var compteur = 0;
  function id(prefixe) { compteur += 1; return prefixe + '-' + compteur; }

  function echapper(v) {
    return String(v === null || v === undefined ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function nombre(v, decimales) {
    if (v === null || v === undefined || v === '' || Number.isNaN(Number(v))) return '—';
    return Number(v).toLocaleString('fr-FR', {
      minimumFractionDigits: decimales || 0, maximumFractionDigits: decimales === undefined ? 1 : decimales,
    });
  }

  /**
   * Bloc « aucune donnée ».
   *
   * Un graphique vide ne se dessine pas avec des axes nus et une zone blanche : cela
   * ressemble à un chargement qui n'a jamais fini. Il se remplace par une phrase qui dit
   * ce qui manque.
   */
  function vide(motif) {
    return '<div class="etat-vide" style="padding:22px 14px">'
      + echapper(motif || 'Aucune donnée à représenter.') + '</div>';
  }

  /** Enveloppe commune : titre, figure accessible, légende, tableau. */
  function figure(options) {
    var aria = echapper(options.resume || options.titre || 'Graphique');
    return '<div class="graphique">'
      + (options.titre ? '<div class="titre-graphique">' + echapper(options.titre) + '</div>' : '')
      + (options.sousTitre ? '<div class="sous-titre-graphique">' + echapper(options.sousTitre) + '</div>' : '')
      // `max-width` à la largeur du viewBox : sans elle, le SVG s'étire à la largeur du
      // panneau et agrandit TOUT — y compris le texte, qui passe de 11 px à 26 px sur un
      // écran large. Le graphique reste donc à sa taille de conception au maximum, et ne
      // fait que rétrécir sur les écrans étroits.
      + '<svg role="img" aria-label="' + aria + '" viewBox="0 0 ' + options.largeur + ' '
      + options.hauteur + '" preserveAspectRatio="xMidYMid meet"'
      + ' style="max-width:' + options.largeur + 'px">' + options.svg + '</svg>'
      + (options.legende || '')
      + (options.tableau || '')
      + '</div>';
  }

  /** Légende. Toujours présente à partir de deux séries ; absente pour une seule. */
  function legende(entrees) {
    if (!entrees || entrees.length < 2) return '';
    return '<div class="legende">' + entrees.map(function (e) {
      return '<span><i style="background:' + e.couleur + '"></i>' + echapper(e.libelle) + '</span>';
    }).join('') + '</div>';
  }

  /** Tableau de données replié — obligatoire, voir règle 4. */
  function tableauDonnees(colonnes, lignes) {
    if (!lignes || lignes.length === 0) return '';
    return '<details class="donnees-graphique"><summary>Voir les données</summary>'
      + '<div class="table-wrap"><table><thead><tr>'
      + colonnes.map(function (c) { return '<th>' + echapper(c) + '</th>'; }).join('')
      + '</tr></thead><tbody>'
      + lignes.map(function (l) {
        return '<tr>' + l.map(function (c) { return '<td>' + echapper(c) + '</td>'; }).join('') + '</tr>';
      }).join('')
      + '</tbody></table></div></details>';
  }

  /**
   * Replie la queue d'une liste au-delà du plafond de la forme.
   *
   * Ne génère JAMAIS une teinte supplémentaire : au-delà du plafond validé, une
   * couleur de plus est indistinguable d'une existante sous daltonisme et casse la
   * garantie du jeu entier.
   */
  function plafonner(items, max, cleValeur) {
    if (items.length <= max) return { visibles: items, autres: null };
    var tries = items.slice().sort(function (a, b) {
      return Number(b[cleValeur] || 0) - Number(a[cleValeur] || 0);
    });
    var tete = tries.slice(0, max);
    var queue = tries.slice(max);
    var somme = queue.reduce(function (s, i) { return s + Number(i[cleValeur] || 0); }, 0);
    return {
      visibles: tete,
      autres: { libelle: 'Autres (' + queue.length + ')', valeur: somme, detail: queue },
    };
  }

  // ════════════════════════════════════════
  // Infobulle partagée
  // ════════════════════════════════════════

  var infobulle = null;
  function bulle() {
    if (!infobulle) {
      infobulle = document.createElement('div');
      infobulle.className = 'infobulle-graphique';
      document.body.appendChild(infobulle);
    }
    return infobulle;
  }

  function montrerBulle(evt, contenu) {
    var b = bulle();
    b.innerHTML = contenu;
    b.style.opacity = '1';
    var r = b.getBoundingClientRect();
    var x = evt.clientX + 14;
    var y = evt.clientY - r.height - 10;
    // La bulle ne sort jamais de la fenêtre : sinon l'information visée est
    // précisément celle qu'on ne peut pas lire.
    if (x + r.width > window.innerWidth - 8) x = evt.clientX - r.width - 14;
    if (y < 8) y = evt.clientY + 18;
    b.style.left = Math.max(8, x) + 'px';
    b.style.top = y + 'px';
  }

  function cacherBulle() { if (infobulle) infobulle.style.opacity = '0'; }

  /**
   * Branche les infobulles sur un conteneur fraîchement injecté.
   *
   * Appelée une fois après chaque rendu de vue. La délégation évite d'attacher un
   * écouteur par barre — sur une vue à trois cents marques, cela compte.
   */
  function activerInfobulles(racine) {
    var cible = racine || document;
    if (cible.dataset && cible.dataset.infobullesActives === '1') return;
    if (cible.dataset) cible.dataset.infobullesActives = '1';

    cible.addEventListener('mouseover', function (e) {
      var marque = e.target.closest('[data-bulle]');
      if (marque) montrerBulle(e, marque.getAttribute('data-bulle'));
    });
    cible.addEventListener('mousemove', function (e) {
      var marque = e.target.closest('[data-bulle]');
      if (marque) montrerBulle(e, marque.getAttribute('data-bulle'));
    });
    cible.addEventListener('mouseout', function (e) {
      if (e.target.closest('[data-bulle]')) cacherBulle();
    });
    // Le défilement déplace la marque sous une bulle en position fixe : la cacher est
    // plus honnête que de la laisser pointer ailleurs.
    window.addEventListener('scroll', cacherBulle, { passive: true });
  }

  function bulleHtml(titre, lignes) {
    return echapper(titre) === '' ? '' : '<strong>' + echapper(titre) + '</strong>'
      + (lignes || []).map(function (l) {
        return '<div class="ligne">'
          + (l.couleur ? '<i style="background:' + l.couleur + '"></i>' : '')
          + echapper(l.texte) + '</div>';
      }).join('');
  }

  return {
    SERIES: SERIES,
    SEQUENTIEL: SEQUENTIEL,
    MAX_TOUTES_PAIRES: MAX_TOUTES_PAIRES,
    MAX_ADJACENTES: MAX_ADJACENTES,
    echapper: echapper,
    nombre: nombre,
    vide: vide,
    figure: figure,
    legende: legende,
    tableauDonnees: tableauDonnees,
    plafonner: plafonner,
    activerInfobulles: activerInfobulles,
    bulleHtml: bulleHtml,
    id: id,
  };
}());

// ════════════════════════════════════════
// LES FORMES
// ════════════════════════════════════════

(function (G) {
  'use strict';

  var E = G.echapper;
  var N = G.nombre;

  /**
   * ── Donut : une part dans un tout ──
   *
   * Forme « toutes paires » : les segments se touchent en anneau et n'importe lesquels
   * peuvent voisiner. Plafond à trois teintes plus « Autres ».
   *
   * L'écart de 2 px entre segments est tracé dans la couleur du fond, pas au trait :
   * un contour ajouterait de l'encre qui n'est pas de la donnée, et l'écart suffit à
   * séparer deux teintes voisines.
   */
  G.donut = function (segments, options) {
    options = options || {};
    var utiles = (segments || []).filter(function (s) { return Number(s.valeur) > 0; });
    if (utiles.length === 0) return G.vide(options.motifVide);

    var reduit = G.plafonner(utiles, G.MAX_TOUTES_PAIRES, 'valeur');
    var parts = reduit.visibles.slice();
    if (reduit.autres) parts.push(reduit.autres);

    var total = parts.reduce(function (s, p) { return s + Number(p.valeur); }, 0);
    if (total <= 0) return G.vide(options.motifVide);

    var T = 200; var C = T / 2; var R = 78; var EPAISSEUR = 26;
    var rayonMoyen = R - EPAISSEUR / 2;
    var circonference = 2 * Math.PI * rayonMoyen;
    // 2 px d'écart converti en fraction de tour.
    var ecart = parts.length > 1 ? (2 / circonference) * 360 : 0;

    var angle = -90;
    var arcs = parts.map(function (p, i) {
      var part = Number(p.valeur) / total;
      var etendue = part * 360;
      var a0 = angle + (ecart / 2);
      var a1 = angle + etendue - (ecart / 2);
      angle += etendue;
      if (a1 <= a0) return '';

      var couleur = (reduit.autres && i === parts.length - 1)
        ? 'var(--texte-faible)' : G.SERIES[i];
      var rad = function (a) { return (a * Math.PI) / 180; };
      var x0 = C + rayonMoyen * Math.cos(rad(a0));
      var y0 = C + rayonMoyen * Math.sin(rad(a0));
      var x1 = C + rayonMoyen * Math.cos(rad(a1));
      var y1 = C + rayonMoyen * Math.sin(rad(a1));
      var grand = (a1 - a0) > 180 ? 1 : 0;

      var bulle = G.bulleHtml(p.libelle, [
        { couleur: couleur, texte: N(p.valeur) + (options.unite ? ' ' + options.unite : '')
          + ' · ' + N(part * 100, 1) + ' %' },
      ]);

      return '<path d="M ' + x0.toFixed(2) + ' ' + y0.toFixed(2)
        + ' A ' + rayonMoyen + ' ' + rayonMoyen + ' 0 ' + grand + ' 1 '
        + x1.toFixed(2) + ' ' + y1.toFixed(2) + '"'
        + ' fill="none" stroke="' + couleur + '" stroke-width="' + EPAISSEUR + '"'
        + ' data-bulle="' + E(bulle) + '"></path>';
    }).join('');

    var centre = options.valeurCentre !== undefined
      ? '<text x="' + C + '" y="' + (C - 2) + '" text-anchor="middle" class="valeur"'
        + ' style="font-size:24px">' + E(options.valeurCentre) + '</text>'
        + '<text x="' + C + '" y="' + (C + 16) + '" text-anchor="middle"'
        + ' style="font-size:11px">' + E(options.libelleCentre || '') + '</text>'
      : '<text x="' + C + '" y="' + (C - 2) + '" text-anchor="middle" class="valeur"'
        + ' style="font-size:24px">' + N(total) + '</text>'
        + '<text x="' + C + '" y="' + (C + 16) + '" text-anchor="middle"'
        + ' style="font-size:11px">' + E(options.libelleCentre || 'Total') + '</text>';

    return G.figure({
      titre: options.titre,
      sousTitre: options.sousTitre,
      resume: (options.titre || 'Répartition') + ' — '
        + parts.map(function (p) {
          return p.libelle + ' ' + N((Number(p.valeur) / total) * 100, 1) + ' %';
        }).join(', '),
      largeur: T,
      hauteur: T,
      svg: arcs + centre,
      legende: G.legende(parts.map(function (p, i) {
        return {
          libelle: p.libelle + ' — ' + N(p.valeur) + ' (' + N((Number(p.valeur) / total) * 100, 1) + ' %)',
          couleur: (reduit.autres && i === parts.length - 1) ? 'var(--texte-faible)' : G.SERIES[i],
        };
      })),
      tableau: G.tableauDonnees(
        [options.colonneLibelle || 'Catégorie', options.colonneValeur || 'Valeur', 'Part'],
        utiles.map(function (p) {
          return [p.libelle, N(p.valeur), N((Number(p.valeur) / total) * 100, 1) + ' %'];
        })
      ),
    });
  };

  /**
   * ── Barres horizontales : comparer des grandeurs ──
   *
   * Une seule teinte (rampe séquentielle) : ce sont des grandeurs, pas des identités.
   * Colorer chaque barre d'une couleur différente dépenserait le canal de l'identité à
   * ré-encoder ce que la longueur montre déjà.
   *
   * Barres à 18 px, extrémité arrondie à 4 px du côté de la donnée, carrée sur la ligne
   * de base — l'œil lit la longueur depuis un départ franc.
   */
  G.barres = function (items, options) {
    options = options || {};
    var utiles = (items || []).filter(function (i) {
      return i.valeur !== null && i.valeur !== undefined;
    });
    if (utiles.length === 0) return G.vide(options.motifVide);

    var LARGEUR = 520;
    var EPAISSEUR = 18;
    var PAS = 30;
    var LIBELLE = options.largeurLibelle || 150;
    var VALEUR = 74;
    var hauteur = utiles.length * PAS + 6;
    var zone = LARGEUR - LIBELLE - VALEUR;

    var max = options.max !== undefined
      ? Number(options.max)
      : Math.max.apply(null, utiles.map(function (i) { return Number(i.valeur) || 0; }));
    if (!(max > 0)) max = 1;

    var corps = utiles.map(function (item, index) {
      var v = Number(item.valeur) || 0;
      var largeur = Math.max((v / max) * zone, v > 0 ? 3 : 0);
      var y = index * PAS + 4;
      var couleur = item.couleur || options.couleur || 'var(--serie-1)';
      var bulle = G.bulleHtml(item.libelle, [{
        couleur: couleur,
        texte: N(v) + (options.unite ? ' ' + options.unite : '')
          + (item.detail ? ' · ' + item.detail : ''),
      }]);

      // Le libellé est tronqué visuellement mais jamais rogné par la barre : la valeur
      // complète reste dans l'infobulle et dans le tableau.
      var texte = String(item.libelle);
      var coupe = texte.length > 24 ? texte.slice(0, 23) + '…' : texte;

      return '<text x="0" y="' + (y + EPAISSEUR / 2 + 4) + '">' + E(coupe) + '</text>'
        + '<rect x="' + LIBELLE + '" y="' + y + '" width="' + zone + '" height="' + EPAISSEUR + '"'
        + ' fill="var(--surface-2)" rx="3"></rect>'
        + (largeur > 0
          ? '<rect x="' + LIBELLE + '" y="' + y + '" width="' + largeur.toFixed(1) + '"'
            + ' height="' + EPAISSEUR + '" fill="' + couleur + '" rx="4"'
            + ' data-bulle="' + E(bulle) + '"></rect>'
          : '')
        + '<text x="' + (LARGEUR - 2) + '" y="' + (y + EPAISSEUR / 2 + 4) + '"'
        + ' text-anchor="end" class="valeur">' + N(v)
        + (options.uniteCourte ? ' ' + E(options.uniteCourte) : '') + '</text>';
    }).join('');

    return G.figure({
      titre: options.titre,
      sousTitre: options.sousTitre,
      resume: (options.titre || 'Comparaison') + ' — '
        + utiles.map(function (i) { return i.libelle + ' ' + N(i.valeur); }).join(', '),
      largeur: LARGEUR,
      hauteur: hauteur,
      svg: corps,
      tableau: G.tableauDonnees(
        [options.colonneLibelle || 'Libellé', options.colonneValeur || 'Valeur'],
        utiles.map(function (i) { return [i.libelle, N(i.valeur)]; })
      ),
    });
  };

  /**
   * ── Courbe : une évolution dans le temps ──
   *
   * Trait de 2 px, jointures rondes. Les points ne sont marqués que s'il y en a peu :
   * un marqueur sur chacun de trente points transforme la courbe en collier.
   *
   * Jamais deux axes verticaux (voir règle 5) : deux grandeurs d'échelles différentes
   * produisent deux appels à cette fonction.
   */
  G.courbe = function (series, options) {
    options = options || {};
    var jeux = (series || []).filter(function (s) {
      return s.points && s.points.length > 0;
    }).slice(0, G.MAX_ADJACENTES);
    if (jeux.length === 0) return G.vide(options.motifVide);

    var LARGEUR = 560; var HAUTEUR = 190;
    var MG = 46; var MD = 12; var MH = 12; var MB = 30;
    var zoneL = LARGEUR - MG - MD;
    var zoneH = HAUTEUR - MH - MB;

    var toutes = jeux.reduce(function (acc, s) { return acc.concat(s.points); }, []);
    var valeurs = toutes.map(function (p) { return Number(p.y); })
      .filter(function (v) { return !Number.isNaN(v); });
    if (valeurs.length === 0) return G.vide(options.motifVide);

    var max = options.max !== undefined ? Number(options.max) : Math.max.apply(null, valeurs);
    var min = options.min !== undefined ? Number(options.min) : Math.min.apply(null, valeurs);
    // L'axe part de zéro dès que les valeurs sont positives : tronquer la base exagère
    // visuellement des écarts faibles, et c'est la déformation la plus courante.
    if (min > 0 && !options.baseNonNulle) min = 0;
    if (max === min) max = min + 1;

    var nbPoints = Math.max.apply(null, jeux.map(function (s) { return s.points.length; }));
    var x = function (i) {
      return MG + (nbPoints <= 1 ? zoneL / 2 : (i / (nbPoints - 1)) * zoneL);
    };
    var y = function (v) { return MH + zoneH - ((Number(v) - min) / (max - min)) * zoneH; };

    // Grille : quatre lignes, valeurs arrondies, trait plein d'un pas au-dessus du fond.
    var grille = '';
    for (var g = 0; g <= 4; g += 1) {
      var vg = min + ((max - min) * g) / 4;
      var yg = y(vg);
      grille += '<line class="grille-ligne" x1="' + MG + '" y1="' + yg.toFixed(1)
        + '" x2="' + (LARGEUR - MD) + '" y2="' + yg.toFixed(1) + '"></line>'
        + '<text x="' + (MG - 7) + '" y="' + (yg + 3.5).toFixed(1) + '" text-anchor="end">'
        + N(vg, Math.abs(max - min) < 10 ? 1 : 0) + '</text>';
    }

    var traces = jeux.map(function (s, si) {
      var couleur = s.couleur || G.SERIES[si];
      var d = s.points.map(function (p, i) {
        return (i === 0 ? 'M ' : 'L ') + x(i).toFixed(1) + ' ' + y(p.y).toFixed(1);
      }).join(' ');

      var aire = (jeux.length === 1 && options.aire)
        ? '<path d="' + d + ' L ' + x(s.points.length - 1).toFixed(1) + ' '
          + (MH + zoneH) + ' L ' + x(0).toFixed(1) + ' ' + (MH + zoneH) + ' Z"'
          + ' fill="' + couleur + '" opacity="0.1"></path>'
        : '';

      var marqueurs = s.points.length <= 14 ? s.points.map(function (p, i) {
        var bulle = G.bulleHtml(p.x, jeux.map(function (autre, ai) {
          var pt = autre.points[i];
          return {
            couleur: autre.couleur || G.SERIES[ai],
            texte: autre.nom + ' : ' + (pt ? N(pt.y) : '—')
              + (options.unite ? ' ' + options.unite : ''),
          };
        }));
        return '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(p.y).toFixed(1) + '" r="4"'
          + ' fill="' + couleur + '" stroke="var(--graphique-fond)" stroke-width="2"'
          + ' data-bulle="' + E(bulle) + '"></circle>';
      }).join('') : '';

      return aire
        + '<path d="' + d + '" fill="none" stroke="' + couleur + '" stroke-width="2"'
        + ' stroke-linejoin="round" stroke-linecap="round"></path>'
        + marqueurs;
    }).join('');

    // Étiquettes de l'axe des abscisses : au plus six, sinon elles se chevauchent.
    var reference = jeux[0].points;
    var pas = Math.max(1, Math.ceil(reference.length / 6));
    var abscisses = reference.map(function (p, i) {
      if (i % pas !== 0 && i !== reference.length - 1) return '';
      return '<text x="' + x(i).toFixed(1) + '" y="' + (HAUTEUR - 10)
        + '" text-anchor="middle">' + E(p.x) + '</text>';
    }).join('');

    var colonnes = [options.colonneX || 'Période'].concat(jeux.map(function (s) { return s.nom; }));
    var lignesTableau = reference.map(function (p, i) {
      return [p.x].concat(jeux.map(function (s) {
        return s.points[i] ? N(s.points[i].y) : '—';
      }));
    });

    return G.figure({
      titre: options.titre,
      sousTitre: options.sousTitre,
      resume: (options.titre || 'Évolution') + ' — ' + jeux.length + ' série(s), '
        + reference.length + ' point(s), de ' + N(min) + ' à ' + N(max),
      largeur: LARGEUR,
      hauteur: HAUTEUR,
      svg: grille
        + '<line class="axe" x1="' + MG + '" y1="' + (MH + zoneH) + '" x2="'
        + (LARGEUR - MD) + '" y2="' + (MH + zoneH) + '"></line>'
        + traces + abscisses,
      legende: G.legende(jeux.map(function (s, i) {
        return { libelle: s.nom, couleur: s.couleur || G.SERIES[i] };
      })),
      tableau: G.tableauDonnees(colonnes, lignesTableau),
    });
  };

  /**
   * ── Entonnoir : des étapes ordonnées ──
   *
   * Les étapes d'un entonnoir sont ORDINALES — inverser deux étapes changerait le sens.
   * Elles prennent donc une rampe d'une seule teinte, du clair au foncé, pour que l'œil
   * voie l'ordre dans la couleur. Une palette catégorielle suggérerait des catégories
   * interchangeables.
   */
  G.entonnoir = function (etapes, options) {
    options = options || {};
    var utiles = (etapes || []).filter(function (e) {
      return e.valeur !== null && e.valeur !== undefined;
    });
    if (utiles.length === 0) return G.vide(options.motifVide);

    var LARGEUR = 460; var PAS = 42; var EPAISSEUR = 28;
    var LIBELLE = 168;
    var zone = LARGEUR - LIBELLE - 86;
    var hauteur = utiles.length * PAS;
    var max = Number(utiles[0].valeur) || 1;
    if (max <= 0) max = 1;

    var corps = utiles.map(function (etape, i) {
      var v = Number(etape.valeur) || 0;
      var largeur = Math.max((v / max) * zone, v > 0 ? 4 : 0);
      var y = i * PAS + 4;
      // Rampe séquentielle inversée : la première étape, la plus large, est la plus claire.
      var couleur = G.SEQUENTIEL[Math.min(i, G.SEQUENTIEL.length - 1)];
      var precedent = i > 0 ? Number(utiles[i - 1].valeur) : null;
      var taux = (precedent && precedent > 0) ? (v / precedent) * 100 : null;

      var bulle = G.bulleHtml(etape.libelle, [
        { couleur: couleur, texte: N(v) + (options.unite ? ' ' + options.unite : '') },
      ].concat(taux !== null
        ? [{ texte: 'Passage depuis l’étape précédente : ' + N(taux, 1) + ' %' }] : []));

      return '<text x="0" y="' + (y + EPAISSEUR / 2 + 4) + '">'
        + E(etape.libelle.length > 26 ? etape.libelle.slice(0, 25) + '…' : etape.libelle)
        + '</text>'
        + (largeur > 0
          ? '<rect x="' + LIBELLE + '" y="' + y + '" width="' + largeur.toFixed(1) + '"'
            + ' height="' + EPAISSEUR + '" fill="' + couleur + '" rx="4"'
            + ' data-bulle="' + E(bulle) + '"></rect>'
          : '')
        + '<text x="' + (LIBELLE + largeur + 8) + '" y="' + (y + EPAISSEUR / 2 + 4)
        + '" class="valeur">' + N(v) + '</text>'
        + (taux !== null
          ? '<text x="' + (LARGEUR - 2) + '" y="' + (y + EPAISSEUR / 2 + 4)
            + '" text-anchor="end" style="font-size:10.5px">' + N(taux, 1) + ' %</text>'
          : '');
    }).join('');

    return G.figure({
      titre: options.titre,
      sousTitre: options.sousTitre,
      resume: (options.titre || 'Entonnoir') + ' — '
        + utiles.map(function (e) { return e.libelle + ' ' + N(e.valeur); }).join(', '),
      largeur: LARGEUR,
      hauteur: hauteur,
      svg: corps,
      tableau: G.tableauDonnees(
        ['Étape', 'Volume', 'Passage'],
        utiles.map(function (e, i) {
          var prec = i > 0 ? Number(utiles[i - 1].valeur) : null;
          return [e.libelle, N(e.valeur),
            (prec && prec > 0) ? N((Number(e.valeur) / prec) * 100, 1) + ' %' : '—'];
        })
      ),
    });
  };

  /**
   * ── Ligne de vie : une tendance minuscule, dans une cellule ──
   *
   * Sans axe, sans étiquette, sans infobulle : elle accompagne un chiffre, elle ne le
   * remplace pas. La valeur exacte est le chiffre posé à côté.
   */
  G.sparkline = function (valeurs, options) {
    options = options || {};
    var v = (valeurs || []).map(Number).filter(function (n) { return !Number.isNaN(n); });
    if (v.length < 2) return '';

    var L = options.largeur || 80; var H = options.hauteur || 22;
    var max = Math.max.apply(null, v); var min = Math.min.apply(null, v);
    if (max === min) { max = min + 1; }

    var d = v.map(function (n, i) {
      var x = (i / (v.length - 1)) * (L - 2) + 1;
      var y = H - 2 - ((n - min) / (max - min)) * (H - 4);
      return (i === 0 ? 'M ' : 'L ') + x.toFixed(1) + ' ' + y.toFixed(1);
    }).join(' ');

    return '<svg class="sparkline" width="' + L + '" height="' + H + '" viewBox="0 0 '
      + L + ' ' + H + '" role="img" aria-label="Tendance sur ' + v.length
      + ' points, de ' + N(v[0]) + ' à ' + N(v[v.length - 1]) + '">'
      + '<path d="' + d + '" fill="none" stroke="' + (options.couleur || 'var(--serie-1)')
      + '" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"></path>'
      + '</svg>';
  };

  /**
   * ── Jauge : une valeur contre une cible ──
   *
   * Une seule mesure et sa limite. Un camembert à deux parts dirait la même chose en
   * moins lisible ; la barre garde la proportion et laisse la place au chiffre.
   */
  G.jauge = function (valeur, options) {
    options = options || {};
    if (valeur === null || valeur === undefined) {
      return '<div class="kpi-motif">' + E(options.motifVide || 'Non mesuré.') + '</div>';
    }
    var v = Number(valeur);
    var cible = options.cible !== undefined ? Number(options.cible) : 100;
    var max = Math.max(v, cible) * 1.05;
    var part = max > 0 ? Math.min(v / max, 1) : 0;
    var partCible = max > 0 ? Math.min(cible / max, 1) : 0;

    var atteinte = cible > 0 ? (v / cible) * 100 : null;
    var couleur = options.inverse
      ? (v <= cible ? 'var(--ok)' : 'var(--alerte)')
      : (v >= cible ? 'var(--ok)' : (v >= cible * 0.85 ? 'var(--attention)' : 'var(--alerte)'));

    var L = 240; var H = 10;
    return '<div class="graphique">'
      + '<svg role="img" viewBox="0 0 ' + L + ' ' + (H + 16) + '" preserveAspectRatio="none"'
      + ' aria-label="' + E(options.titre || 'Valeur') + ' : ' + N(v)
      + ' pour une cible de ' + N(cible) + '">'
      + '<rect x="0" y="0" width="' + L + '" height="' + H + '" rx="5" fill="var(--surface-2)"></rect>'
      + '<rect x="0" y="0" width="' + (part * L).toFixed(1) + '" height="' + H
      + '" rx="5" fill="' + couleur + '"></rect>'
      // Le repère de cible est un trait, pas une seconde barre : il marque une limite,
      // il ne se compare pas en longueur.
      + '<line x1="' + (partCible * L).toFixed(1) + '" y1="-2" x2="'
      + (partCible * L).toFixed(1) + '" y2="' + (H + 2) + '" stroke="var(--texte-doux)"'
      + ' stroke-width="1.5"></line>'
      + '</svg>'
      + '<div class="sous-titre-graphique" style="margin-top:5px">'
      + 'Cible ' + N(cible) + (options.unite ? ' ' + E(options.unite) : '')
      + (atteinte !== null ? ' · atteinte ' + N(atteinte, 0) + ' %' : '')
      + '</div></div>';
  };
}(window.G));

// ════════════════════════════════════════
// CARTE
// ════════════════════════════════════════

(function (G) {
  'use strict';

  var E = G.echapper;
  var N = G.nombre;

  /**
   * ── Carte des arrêts et des tournées ──
   *
   * ── Ce que cette carte EST ──
   *
   * Une projection des coordonnées réelles de `client_locations` et des incidents, à
   * l'échelle, avec les tournées tracées dans l'ordre de passage. Les positions
   * relatives sont exactes : deux points proches à l'écran sont proches sur le terrain.
   *
   * ── Ce qu'elle N'EST PAS, et ce qu'il faudrait pour l'avoir ──
   *
   * Elle n'a pas de fond de plan — ni rues, ni fleuve, ni limites de communes. Trois
   * choses manquent pour cela, et aucune n'est du code :
   *
   *   1. **Un fournisseur de tuiles cartographiques** pour l'image de fond (rues ou
   *      satellite). C'est un service tiers, avec ses conditions et parfois son coût.
   *   2. **Le tracé des 24 communes de Kinshasa** en GeoJSON, pour colorer les communes
   *      selon un indicateur. C'est un fichier de données à obtenir puis à verser au
   *      dépôt ; il n'existe nulle part dans la plateforme aujourd'hui.
   *   3. Rien d'autre : les coordonnées des clients, les zones et les communes SONT
   *      déjà en base et alimentent cette carte.
   *
   * Dessiner un fond approximatif « qui ressemble à Kinshasa » serait pire que pas de
   * fond : un fleuve au mauvais endroit ferait douter des points, qui, eux, sont justes.
   *
   * ── La projection ──
   *
   * Équirectangulaire, avec correction du cosinus de la latitude. À l'échelle d'une
   * ville, la déformation est négligeable ; à l'échelle d'un pays elle ne le serait pas.
   */
  G.carte = function (points, options) {
    options = options || {};
    var utiles = (points || []).filter(function (p) {
      return Number.isFinite(Number(p.latitude)) && Number.isFinite(Number(p.longitude));
    });
    if (utiles.length === 0) {
      return G.vide(options.motifVide
        || 'Aucun point géolocalisé à afficher. Les coordonnées se saisissent depuis '
          + 'la fiche client ou sont relevées sur le terrain.');
    }

    var L = 620; var H = 400; var MARGE = 26;

    var lats = utiles.map(function (p) { return Number(p.latitude); });
    var lons = utiles.map(function (p) { return Number(p.longitude); });
    var latMin = Math.min.apply(null, lats); var latMax = Math.max.apply(null, lats);
    var lonMin = Math.min.apply(null, lons); var lonMax = Math.max.apply(null, lons);

    // Un point unique n'a pas d'étendue : on ouvre une fenêtre arbitraire autour de lui
    // plutôt que de diviser par zéro.
    if (latMax - latMin < 0.0005) { latMin -= 0.002; latMax += 0.002; }
    if (lonMax - lonMin < 0.0005) { lonMin -= 0.002; lonMax += 0.002; }

    var cosLat = Math.cos(((latMin + latMax) / 2) * Math.PI / 180);
    var etendueX = (lonMax - lonMin) * cosLat;
    var etendueY = latMax - latMin;
    var echelle = Math.min((L - 2 * MARGE) / etendueX, (H - 2 * MARGE) / etendueY);
    var decalageX = (L - etendueX * echelle) / 2;
    var decalageY = (H - etendueY * echelle) / 2;

    var projX = function (lon) { return decalageX + (Number(lon) - lonMin) * cosLat * echelle; };
    var projY = function (lat) { return H - decalageY - (Number(lat) - latMin) * echelle; };

    // Tournées : polylignes reliant les arrêts dans l'ordre de passage.
    var traces = '';
    if (options.tournees && options.tournees.length) {
      traces = options.tournees.slice(0, G.MAX_TOUTES_PAIRES).map(function (t, ti) {
        var arrets = (t.arrets || []).filter(function (a) {
          return Number.isFinite(Number(a.latitude)) && Number.isFinite(Number(a.longitude));
        });
        if (arrets.length < 2) return '';
        var d = arrets.map(function (a, i) {
          return (i === 0 ? 'M ' : 'L ') + projX(a.longitude).toFixed(1) + ' '
            + projY(a.latitude).toFixed(1);
        }).join(' ');
        return '<path d="' + d + '" fill="none" stroke="' + G.SERIES[ti] + '"'
          + ' stroke-width="2" stroke-linejoin="round" stroke-linecap="round"'
          + ' opacity="0.75"></path>';
      }).join('');
    }

    var COULEURS_ETAT = {
      effectue: 'var(--ok)', valide: 'var(--ok)',
      a_venir: 'var(--info)', absent: 'var(--attention)',
      probleme: 'var(--alerte)', rejete: 'var(--alerte)',
      incident: 'var(--alerte)',
    };

    var marques = utiles.map(function (p) {
      var couleur = p.couleur || COULEURS_ETAT[p.etat] || 'var(--serie-1)';
      var r = p.type === 'incident' ? 6 : 4.5;
      var bulle = G.bulleHtml(p.libelle || 'Point', [
        { couleur: couleur, texte: p.detail || (p.etat ? 'État : ' + p.etat : '') },
        { texte: Number(p.latitude).toFixed(5) + ', ' + Number(p.longitude).toFixed(5) },
      ]);
      return '<circle cx="' + projX(p.longitude).toFixed(1) + '" cy="'
        + projY(p.latitude).toFixed(1) + '" r="' + r + '" fill="' + couleur + '"'
        + ' stroke="var(--graphique-fond)" stroke-width="2"'
        + ' data-bulle="' + E(bulle) + '"></circle>';
    }).join('');

    // Échelle : un segment dont la longueur réelle est calculée, pas décorative.
    var kmParDegre = 111.32;
    var largeurKm = etendueX * kmParDegre;
    var pasKm = largeurKm > 20 ? 5 : (largeurKm > 8 ? 2 : 1);
    var pxParKm = ((L - 2 * MARGE) / largeurKm);
    var echelleSvg = '<g transform="translate(' + MARGE + ',' + (H - 12) + ')">'
      + '<line x1="0" y1="0" x2="' + (pasKm * pxParKm).toFixed(1) + '" y2="0"'
      + ' stroke="var(--texte-doux)" stroke-width="2"></line>'
      + '<text x="' + (pasKm * pxParKm + 6).toFixed(1) + '" y="4">' + pasKm + ' km</text></g>';

    var etats = {};
    utiles.forEach(function (p) {
      var cle = p.etat || 'point';
      etats[cle] = (etats[cle] || 0) + 1;
    });

    return G.figure({
      titre: options.titre,
      sousTitre: options.sousTitre
        || 'Positions réelles, à l’échelle. Sans fond de plan : voir la note sous la carte.',
      resume: 'Carte de ' + utiles.length + ' point(s) géolocalisé(s)'
        + (options.tournees ? ' et ' + options.tournees.length + ' tournée(s)' : ''),
      largeur: L,
      hauteur: H,
      svg: '<rect x="0" y="0" width="' + L + '" height="' + H + '" rx="10"'
        + ' fill="var(--surface-2)"></rect>' + traces + marques + echelleSvg,
      legende: G.legende(Object.keys(etats).map(function (cle) {
        return {
          libelle: cle.replace(/_/g, ' ') + ' — ' + etats[cle],
          couleur: COULEURS_ETAT[cle] || 'var(--serie-1)',
        };
      })),
      tableau: G.tableauDonnees(
        ['Point', 'État', 'Latitude', 'Longitude'],
        utiles.slice(0, 200).map(function (p) {
          return [p.libelle || '—', p.etat || '—',
            Number(p.latitude).toFixed(5), Number(p.longitude).toFixed(5)];
        })
      ),
    })
    + (options.sansNote ? '' : '<div class="note" style="margin-top:10px">Carte sans fond de plan. Les positions '
      + 'et les distances sont exactes ; les rues, le fleuve et les limites de communes '
      + 'ne sont pas représentés. Les afficher demande un fournisseur de tuiles '
      + 'cartographiques et le tracé GeoJSON des communes de Kinshasa — deux éléments '
      + 'externes à la plateforme.</div>');
  };

  /**
   * ── Répartition par commune, sans géométrie ──
   *
   * Le substitut honnête d'une carte choroplèthe tant que le GeoJSON des communes
   * manque : mêmes données, même rampe séquentielle, mais rangées en grille plutôt que
   * dessinées à leur forme réelle. Personne ne peut confondre cela avec une carte.
   */
  G.grilleCommunes = function (communes, options) {
    options = options || {};
    var utiles = (communes || []).filter(function (c) {
      return c.valeur !== null && c.valeur !== undefined;
    });
    if (utiles.length === 0) return G.vide(options.motifVide);

    var max = Math.max.apply(null, utiles.map(function (c) { return Number(c.valeur) || 0; }));
    if (!(max > 0)) max = 1;

    var cases = utiles.map(function (c) {
      var v = Number(c.valeur) || 0;
      var niveau = Math.min(Math.floor((v / max) * G.SEQUENTIEL.length), G.SEQUENTIEL.length - 1);
      var fond = G.SEQUENTIEL[niveau];
      // Le texte posé DANS un aplat coloré est le seul cas où il ne porte pas un jeton
      // de texte : il prend le blanc ou l'encre selon la clarté du fond.
      var encre = niveau >= 3 ? '#ffffff' : 'var(--texte)';
      var bulle = G.bulleHtml(c.libelle, [
        { couleur: fond, texte: N(v) + (options.unite ? ' ' + options.unite : '') },
      ].concat(c.detail ? [{ texte: c.detail }] : []));

      return '<div class="case-commune" style="background:' + fond + ';color:' + encre + '"'
        + ' data-bulle="' + E(bulle) + '">'
        + '<span class="nom">' + E(c.libelle) + '</span>'
        + '<span class="val">' + N(v) + '</span></div>';
    }).join('');

    return '<div class="graphique">'
      + (options.titre ? '<div class="titre-graphique">' + E(options.titre) + '</div>' : '')
      + '<div class="sous-titre-graphique">'
      + E(options.sousTitre || 'Rangées par ordre décroissant. Ce n’est pas une carte : '
        + 'les communes ne sont pas à leur emplacement réel.') + '</div>'
      + '<div class="grille-communes" role="img" aria-label="'
      + E((options.titre || 'Répartition') + ' par commune') + '">' + cases + '</div>'
      + G.tableauDonnees([options.colonneLibelle || 'Commune', options.colonneValeur || 'Valeur'],
        utiles.map(function (c) { return [c.libelle, N(c.valeur)]; }))
      + '</div>';
  };
}(window.G));

/**
 * Active les infobulles une fois pour toute la page.
 *
 * La délégation est posée sur `document` : elle couvre donc les graphiques injectés plus
 * tard, à chaque changement de vue, sans qu'aucune vue ait à s'en occuper. C'est aussi
 * ce qui évite d'attacher un écouteur par marque — une vue à trois cents barres en
 * créerait trois cents.
 */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function () {
    window.G.activerInfobulles(document);
  });
} else {
  window.G.activerInfobulles(document);
}
