/**
 * ════════════════════════════════════════
 * CARTE INTERACTIVE — FOND OPENSTREETMAP AUTO-HÉBERGÉ
 * ════════════════════════════════════════
 *
 * Affiche les arrêts, les tournées et les incidents sur un vrai fond de plan, lu depuis
 * un unique fichier `.pmtiles` posé sur Supabase Storage. Pas de serveur de tuiles, pas
 * de clé d'API, pas de quota, aucun prestataire à qui rendre des comptes.
 *
 * ── Trois principes ──
 *
 * 1. **Le fond de carte est un confort, pas une dépendance.** Sans URL configurée, sans
 *    réseau, ou si le fichier est injoignable, on retombe sur la carte SVG — positions
 *    et tournées exactes, sans fond. La vue ne tombe jamais en panne parce qu'un
 *    fichier de 80 Mo n'a pas répondu.
 *
 * 2. **Rien n'est chargé tant que la carte n'est pas ouverte.** MapLibre pèse 1,2 Mo.
 *    Le charger sur les sept espaces pour une vue que six d'entre eux n'ont pas serait
 *    une taxe permanente. Les modules sont donc importés à la demande, une seule fois,
 *    et mémorisés.
 *
 * 3. **Les données métier ne viennent jamais du fond de carte.** Les points sont vos
 *    coordonnées, les tracés vos tournées. Le fond ne fait que donner des repères.
 */

window.CarteInteractive = (function () {
  'use strict';

  var modules = null;
  var chargementEnCours = null;

  /**
   * Les cartes vivantes, indexées par conteneur.
   *
   * ── Le défaut que ce registre corrige ──
   *
   * Le routeur des espaces remplace `innerHTML` à chaque changement de vue. Le DOM de la
   * carte disparaissait donc, mais l'instance MapLibre, elle, restait vivante : son
   * contexte WebGL, ses écouteurs et son MutationObserver de thème n'étaient jamais
   * libérés. Un navigateur plafonne le nombre de contextes WebGL simultanés — autour de
   * seize. Au bout d'une quinzaine d'allers-retours entre deux menus, le plus ancien
   * contexte était détruit d'office par le navigateur et la carte cessait de s'afficher,
   * sans message et sans erreur en console.
   *
   * Le symptôme est particulièrement trompeur : la carte « marche », puis « ne marche
   * plus », sans que rien n'ait changé — et elle remarche après un rechargement de page.
   */
  var vivantes = typeof WeakMap === 'function' ? new WeakMap() : null;

  /** Détruit proprement la carte déjà posée dans ce conteneur, s'il y en a une. */
  function libererConteneur(el) {
    if (!vivantes || !vivantes.has(el)) return;
    var precedente = vivantes.get(el);
    vivantes.delete(el);
    try { precedente.observateurTaille.disconnect(); } catch (_) { /* déjà libéré */ }
    try { precedente.carte.remove(); } catch (_) { /* déjà détruite */ }
  }

  /**
   * Attend que le conteneur ait des dimensions réelles.
   *
   * Une carte instanciée dans un conteneur de taille nulle — un onglet encore masqué,
   * un panneau replié, une vue rendue avant sa mise en page — produit un canevas 0 × 0
   * qui ne se répare jamais tout seul. MapLibre ne relit pas la taille de son conteneur
   * de lui-même.
   *
   * On attend donc, sur quelques images, que la mise en page ait eu lieu. Passé ce
   * délai on instancie quand même : l'observateur de taille posé juste après rattrapera
   * la carte dès qu'elle deviendra visible.
   */
  function attendreDimensions(el, essaisRestants) {
    if (el.offsetWidth > 0 && el.offsetHeight > 0) return Promise.resolve(true);
    if (essaisRestants <= 0) return Promise.resolve(false);
    return new Promise(function (resoudre) {
      requestAnimationFrame(function () {
        resoudre(attendreDimensions(el, essaisRestants - 1));
      });
    });
  }

  /**
   * Redimensionne la carte quand son conteneur change de taille.
   *
   * C'est l'équivalent MapLibre de `map.invalidateSize()` de Leaflet, et c'est ce qui
   * rend la carte utilisable dans un menu : au moment où la vue devient visible, le
   * conteneur passe de 0 à sa taille réelle, et la carte se réajuste au lieu de rester
   * un carré vide.
   */
  function suivreTaille(el, carte, utiles) {
    if (typeof ResizeObserver !== 'function') {
      return { disconnect: function () {} };
    }
    var derniereLargeur = 0;
    var observateur = new ResizeObserver(function () {
      if (el.offsetWidth === 0 || el.offsetHeight === 0) return;
      try {
        carte.resize();
        // Le premier passage de 0 à une taille réelle est aussi le moment où le cadrage
        // initial n'a rien pu calculer : on le rejoue une fois.
        if (derniereLargeur === 0 && utiles && utiles.length > 0) {
          carte.fitBounds(bornes(utiles), { padding: 40, maxZoom: 15, animate: false });
        }
        derniereLargeur = el.offsetWidth;
      } catch (_) { /* carte détruite entre-temps */ }
    });
    observateur.observe(el);
    return observateur;
  }

  function config() {
    return window.ENVIRO_CARTE || {};
  }

  function estConfiguree() {
    var c = config();
    return typeof c.pmtiles === 'string' && c.pmtiles.trim().length > 0;
  }

  /** Charge un script classique (IIFE) une seule fois. */
  function chargerScript(src) {
    return new Promise(function (resoudre, rejeter) {
      if (document.querySelector('script[data-carto="' + src + '"]')) return resoudre();
      var el = document.createElement('script');
      el.src = src;
      el.setAttribute('data-carto', src);
      el.onload = function () { resoudre(); };
      el.onerror = function () { rejeter(new Error('Chargement impossible : ' + src)); };
      document.head.appendChild(el);
    });
  }

  function chargerCss(href) {
    if (document.querySelector('link[data-carto="' + href + '"]')) return;
    var el = document.createElement('link');
    el.rel = 'stylesheet';
    el.href = href;
    el.setAttribute('data-carto', href);
    document.head.appendChild(el);
  }

  /**
   * Importe MapLibre, pmtiles et le style de base — une seule fois.
   *
   * `maplibre-gl.mjs` résout ses deux compagnons relativement à sa propre URL : les
   * trois fichiers doivent rester côte à côte dans `assets/vendor/carto/`.
   */
  function chargerModules() {
    if (modules) return Promise.resolve(modules);
    if (chargementEnCours) return chargementEnCours;

    chargerCss('assets/vendor/carto/maplibre-gl.css');

    chargementEnCours = Promise.all([
      import('../vendor/carto/maplibre-gl.mjs'),
      chargerScript('assets/vendor/carto/pmtiles.js'),
      chargerScript('assets/vendor/carto/basemaps.js'),
    ]).then(function (resultats) {
      var maplibregl = resultats[0].default || resultats[0];
      if (!window.pmtiles || !window.basemaps) {
        throw new Error('pmtiles ou basemaps non disponibles après chargement.');
      }
      // Le protocole `pmtiles://` n'est enregistré qu'une fois pour la page.
      var protocole = new window.pmtiles.Protocol();
      maplibregl.addProtocol('pmtiles', protocole.tile);
      modules = { maplibregl: maplibregl, pmtiles: window.pmtiles, basemaps: window.basemaps };
      return modules;
    }).catch(function (err) {
      chargementEnCours = null;
      throw err;
    });

    return chargementEnCours;
  }

  function themeSombre() {
    return document.documentElement.dataset.theme === 'dark';
  }

  /** Style MapLibre : fond Protomaps + couches métier vides, remplies ensuite. */
  function construireStyle(mods) {
    var c = config();
    var flaveur = themeSombre()
      ? ((c.flaveur && c.flaveur.sombre) || 'dark')
      : ((c.flaveur && c.flaveur.clair) || 'light');

    return {
      version: 8,
      glyphs: c.glyphs || undefined,
      sources: {
        protomaps: {
          type: 'vector',
          url: 'pmtiles://' + c.pmtiles,
          attribution: '© <a href="https://www.openstreetmap.org/copyright" '
            + 'target="_blank" rel="noopener">OpenStreetMap</a>',
        },
      },
      layers: mods.basemaps.layers('protomaps', mods.basemaps.namedFlavor(flaveur), {
        lang: 'fr',
      }),
    };
  }

  /** Les couleurs d'état, identiques à celles de la carte SVG. */
  var COULEURS = {
    effectue: '#2e9b52', valide: '#2e9b52',
    a_venir: '#3f6fd8', absent: '#e08a1e',
    probleme: '#d9534f', rejete: '#d9534f', incident: '#d9534f',
  };

  function couleurEtat(etat) { return COULEURS[etat] || '#1f6b3a'; }

  // ════════════════════════════════════════
  // CATÉGORIES — ce que la carte sait distinguer
  // ════════════════════════════════════════
  //
  // Une couche unique fond tout : les clients, les prospects, les incidents et les
  // collectes manquées se lisent alors comme la même chose. Or ce sont précisément ces
  // différences qu'on vient chercher sur une carte.
  //
  // La catégorie est DÉDUITE de ce que l'appelant fournit déjà — quatre écrans passent
  // des points, et leur imposer un champ de plus aurait signifié quatre modifications
  // pour un seul besoin. Un appelant peut néanmoins la déclarer, et elle fait alors foi.

  var CATEGORIES = {
    client:           { libelle: 'Clients',            couleur: '#1f6b3a', rayon: 6 },
    prospect:         { libelle: 'Prospects',          couleur: '#7c4dbd', rayon: 6 },
    collecte_reussie: { libelle: 'Collectes réussies', couleur: '#2e9b52', rayon: 6 },
    collecte_manquee: { libelle: 'Collectes manquées', couleur: '#e08a1e', rayon: 7 },
    incident:         { libelle: 'Incidents',          couleur: '#d9534f', rayon: 8 },
    collecteur:       { libelle: 'Collecteurs',        couleur: '#3f6fd8', rayon: 7 },
    vehicule:         { libelle: 'Véhicules',          couleur: '#0f8f9e', rayon: 7 },
    zone:             { libelle: 'Zones et quartiers', couleur: '#8a8f98', rayon: 5 },
  };

  function categorieDe(p) {
    if (p.categorie && CATEGORIES[p.categorie]) return p.categorie;
    if (p.type && CATEGORIES[p.type]) return p.type;
    if (p.etat === 'incident') return 'incident';
    if (/^\s*prospect\b/i.test(p.libelle || p.nom || '')) return 'prospect';
    if (p.etat === 'effectue' || p.etat === 'valide') return 'collecte_reussie';
    if (['absent', 'probleme', 'rejete', 'manquee'].indexOf(p.etat) !== -1) return 'collecte_manquee';
    return 'client';
  }

  function libelleDe(p) { return p.libelle || p.nom || 'Point'; }

  /** GeoJSON à partir des points, catégorie et couleur comprises. */
  function versGeoJson(points) {
    return {
      type: 'FeatureCollection',
      features: points.map(function (p, i) {
        var cat = categorieDe(p);
        return {
          type: 'Feature',
          id: i + 1,
          properties: {
            idx: i,
            libelle: libelleDe(p),
            detail: p.detail || '',
            etat: p.etat || '',
            categorie: cat,
            couleur: p.couleur || CATEGORIES[cat].couleur,
            rayon: CATEGORIES[cat].rayon,
            tournee_id: p.tournee_id === undefined || p.tournee_id === null ? '' : String(p.tournee_id),
            ordre: p.ordre === undefined || p.ordre === null ? '' : String(p.ordre),
          },
          geometry: { type: 'Point', coordinates: [Number(p.longitude), Number(p.latitude)] },
        };
      }),
    };
  }

  // ════════════════════════════════════════
  // Contrôles maison
  // ════════════════════════════════════════

  /**
   * Un bouton dans la barre de contrôles MapLibre.
   *
   * MapLibre fournit le zoom, la boussole, l'échelle et le plein écran. Il ne fournit
   * pas « revenir à la vue d'ensemble » — et c'est pourtant le geste le plus fréquent
   * une fois qu'on s'est perdu dans un quartier.
   */
  function boutonCarte(titre, symbole, action) {
    return {
      onAdd: function () {
        var d = document.createElement('div');
        d.className = 'maplibregl-ctrl maplibregl-ctrl-group';
        var b = document.createElement('button');
        b.type = 'button';
        b.title = titre;
        b.setAttribute('aria-label', titre);
        b.style.cssText = 'font-size:15px;line-height:29px;';
        b.textContent = symbole;
        b.addEventListener('click', action);
        d.appendChild(b);
        this._el = d;
        return d;
      },
      onRemove: function () {
        if (this._el && this._el.parentNode) this._el.parentNode.removeChild(this._el);
      },
    };
  }

  // ════════════════════════════════════════
  // BARRE D'OUTILS — commune aux deux modes
  // ════════════════════════════════════════
  //
  // ── Pourquoi elle ne vit pas dans le mode MapLibre ──
  //
  // `pmtiles` n'est pas configuré par défaut : le repli SVG est donc le mode NORMAL tant
  // que le fichier de fond n'a pas été déposé. Une recherche qui n'existerait que dans
  // le mode MapLibre serait une fonction décorative — annoncée, et jamais rencontrée.
  //
  // Les deux modes exposent la même interface minimale — `rendre(points)` et
  // `allerA(point)` — et cette fonction pilote l'un ou l'autre sans savoir lequel.
  function monterOutils(vue, contexte) {
    var c = contexte || {};
    var el = c.el;
    if (!el) return vue;

    var barre = el.querySelector('.carte-outils');
    var zoneLegende = el.querySelector('.carte-legende');
    if (!barre || !zoneLegende) return vue;

    var tous = c.points || [];
    var tournees = c.tournees || [];
    var ech = window.G.echapper;
    var etat = { masquees: {}, tournee: null };

    /** Les points que les filtres courants laissent passer. */
    function retenus() {
      return tous.filter(function (p) {
        var cat = categorieDe(p);
        if (etat.masquees[cat]) return false;
        // Les incidents restent visibles même quand une tournée est sélectionnée :
        // c'est souvent l'incident qui explique la tournée qu'on regarde.
        if (etat.tournee !== null && cat !== 'incident'
            && String(p.tournee_id) !== String(etat.tournee)) return false;
        return true;
      });
    }

    function appliquer() {
      var pts = retenus();
      if (typeof vue.rendre === 'function') vue.rendre(pts);
      var compteur = barre.querySelector('.carte-compte');
      if (compteur) {
        compteur.textContent = pts.length + ' / ' + tous.length + ' point(s) affiché(s)';
      }
      rendreLegende();
    }

    function rendreLegende() {
      var comptes = {};
      tous.forEach(function (p) {
        var k = categorieDe(p);
        comptes[k] = (comptes[k] || 0) + 1;
      });

      // Seules les catégories RÉELLEMENT présentes : afficher « Véhicules (0) » sur une
      // carte qui n'en a jamais laisserait croire à une couche vide plutôt qu'à une
      // donnée absente.
      var presentes = Object.keys(CATEGORIES).filter(function (k) { return comptes[k]; });
      if (presentes.length <= 1) { zoneLegende.innerHTML = ''; return; }

      zoneLegende.innerHTML = '<div class="carte-legende-items">'
        + presentes.map(function (k) {
          var masquee = Boolean(etat.masquees[k]);
          return '<button type="button" class="carte-legende-item' + (masquee ? ' masquee' : '')
            + '" data-cat="' + ech(k) + '" aria-pressed="' + (!masquee) + '">'
            + '<span class="pastille" style="background:' + CATEGORIES[k].couleur + '"></span>'
            + ech(CATEGORIES[k].libelle) + ' <small>(' + comptes[k] + ')</small></button>';
        }).join('')
        + '</div><p class="meta">Cliquez une entrée pour masquer ou réafficher sa couche.</p>';

      Array.prototype.forEach.call(zoneLegende.querySelectorAll('[data-cat]'), function (b) {
        b.addEventListener('click', function () {
          var k = b.getAttribute('data-cat');
          etat.masquees[k] = !etat.masquees[k];
          appliquer();
        });
      });
    }

    var html = '<div class="carte-barre">'
      + '<input type="search" class="carte-recherche" placeholder="Rechercher un client, '
      + 'un prospect, une zone…" aria-label="Rechercher sur la carte">';

    if (tournees.length > 0) {
      html += '<select class="carte-tournee" aria-label="Filtrer par tournée">'
        + '<option value="">Toutes les tournées</option>'
        + tournees.map(function (t, i) {
          var id = t.id === undefined ? i : t.id;
          // Ce que le superviseur a besoin de lire AVANT de choisir : qui conduit, avec
          // quoi, combien d'arrêts, où ça en est.
          var bouts = [t.nom || ('Tournée ' + id)];
          if (t.collecteur) bouts.push(t.collecteur);
          if (t.vehicule) bouts.push(t.vehicule);
          if (t.clients !== undefined && t.clients !== null) bouts.push(t.clients + ' arrêt(s)');
          if (t.statut) bouts.push(String(t.statut).replace(/_/g, ' '));
          if (t.progression !== undefined && t.progression !== null) bouts.push(t.progression + ' %');
          return '<option value="' + ech(String(id)) + '">' + ech(bouts.join(' · ')) + '</option>';
        }).join('')
        + '</select>';
    }

    // Vue d'ensemble et plein écran vivent DANS la barre, pas dans les contrôles
    // MapLibre : sinon ils n'existeraient que lorsque le fichier de fond est déposé,
    // c'est-à-dire jamais pour l'instant. Le recentrage, lui, reste un contrôle de la
    // carte : recentrer une image fixe ne veut rien dire.
    html += '<button type="button" class="carte-ensemble">Vue d’ensemble</button>'
      + '<button type="button" class="carte-pleinecran" aria-pressed="false">Plein écran</button>'
      + '<span class="carte-compte"></span></div>'
      + '<div class="carte-resultats" hidden></div>';
    barre.innerHTML = html;

    var champ = barre.querySelector('.carte-recherche');
    var resultats = barre.querySelector('.carte-resultats');

    champ.addEventListener('input', function () {
      var q = champ.value.trim().toLowerCase();
      if (q.length < 2) { resultats.hidden = true; resultats.innerHTML = ''; return; }

      var trouves = tous.map(function (p, i) { return { p: p, i: i }; })
        .filter(function (x) {
          return (libelleDe(x.p) + ' ' + (x.p.detail || '') + ' ' + (x.p.zone || ''))
            .toLowerCase().indexOf(q) !== -1;
        })
        .slice(0, 12);

      resultats.hidden = false;
      resultats.innerHTML = trouves.length === 0
        // Un état vide qui REPREND le terme cherché : « aucun résultat » tout court
        // laisse croire à une panne quand on a simplement fait une faute de frappe.
        ? '<p class="meta">Aucun point ne correspond à « ' + ech(champ.value) + ' ».</p>'
        : '<ul class="compact">' + trouves.map(function (x) {
          return '<li><button type="button" class="lien-inline" data-aller="' + x.i + '">'
            + ech(libelleDe(x.p)) + '</button>'
            + (x.p.detail ? ' <small>' + ech(x.p.detail) + '</small>' : '') + '</li>';
        }).join('') + '</ul>';

      Array.prototype.forEach.call(resultats.querySelectorAll('[data-aller]'), function (b) {
        b.addEventListener('click', function () {
          if (typeof vue.allerA === 'function') {
            vue.allerA(tous[Number(b.getAttribute('data-aller'))]);
          }
          resultats.hidden = true;
          champ.value = '';
        });
      });
    });

    var selecteur = barre.querySelector('.carte-tournee');
    if (selecteur) {
      selecteur.addEventListener('change', function () {
        etat.tournee = selecteur.value === '' ? null : selecteur.value;
        if (typeof vue.selectionnerTournee === 'function') vue.selectionnerTournee(etat.tournee);
        appliquer();
      });
    }

    // ── Vue d'ensemble ──
    //
    // Tout réafficher : couches remasquées, tournée désélectionnée, cadrage global. Ce
    // n'est pas un simple `fitBounds` — après vingt minutes de filtres, ce qu'on veut
    // c'est revoir la journée entière, pas recadrer sur trois points restants.
    barre.querySelector('.carte-ensemble').addEventListener('click', function () {
      etat.masquees = {};
      etat.tournee = null;
      if (selecteur) selecteur.value = '';
      if (typeof vue.selectionnerTournee === 'function') vue.selectionnerTournee(null);
      appliquer();
      if (typeof vue.vueDEnsemble === 'function') vue.vueDEnsemble();
    });

    // ── Plein écran ──
    //
    // L'API navigateur, appliquée au conteneur entier : la barre reste donc accessible
    // en plein écran, ce qui n'aurait pas été le cas en n'agrandissant que l'hôte. La
    // sortie est gérée par le même bouton ET par Échap — d'où l'écoute de
    // `fullscreenchange` plutôt qu'un état maintenu à la main, qui aurait menti après
    // une sortie au clavier.
    var boutonPlein = barre.querySelector('.carte-pleinecran');
    var pleinPossible = typeof el.requestFullscreen === 'function'
      && (document.fullscreenEnabled !== false);
    if (!pleinPossible) {
      boutonPlein.disabled = true;
      boutonPlein.title = 'Ce navigateur n’autorise pas le plein écran sur cette page.';
    } else {
      boutonPlein.addEventListener('click', function () {
        if (document.fullscreenElement === el) {
          if (document.exitFullscreen) document.exitFullscreen();
        } else {
          var r = el.requestFullscreen();
          // Un refus du navigateur (permission, iframe sans `allowfullscreen`) doit se
          // voir : sans cela le bouton semble simplement ne rien faire.
          if (r && typeof r.catch === 'function') {
            r.catch(function () {
              boutonPlein.disabled = true;
              boutonPlein.title = 'Le navigateur a refusé le plein écran pour cette page.';
            });
          }
        }
      });
      document.addEventListener('fullscreenchange', function () {
        if (!el.isConnected) return;
        var actif = document.fullscreenElement === el;
        el.classList.toggle('carte-en-plein-ecran', actif);
        boutonPlein.textContent = actif ? 'Quitter le plein écran' : 'Plein écran';
        boutonPlein.setAttribute('aria-pressed', String(actif));
      });
    }

    appliquer();
    return vue;
  }

  /**
   * Affiche la carte dans un conteneur.
   *
   * En cas d'échec — à n'importe quelle étape — le repli SVG est rendu dans le MÊME
   * conteneur, accompagné d'une note qui dit ce qui a échoué. L'utilisateur ne se
   * retrouve jamais devant un rectangle vide.
   */
  function afficher(conteneur, points, options) {
    options = options || {};
    var el = typeof conteneur === 'string' ? document.getElementById(conteneur) : conteneur;
    if (!el) return Promise.resolve({ mode: 'aucun-conteneur' });

    // Toute reconstruction commence par libérer la précédente : sans cela, les contextes
    // WebGL s'accumulent jusqu'à ce que le navigateur commence à en détruire au hasard.
    libererConteneur(el);

    // ── Le repli GARDE la barre d'outils ──
    //
    // La première version remplaçait `el.innerHTML` en entier : recherche, légende et
    // filtres disparaissaient avec le fond de plan. Or `pmtiles` n'est pas configuré par
    // défaut — le repli est donc le mode NORMAL tant que le fichier de fond n'est pas
    // déposé, et ces fonctions n'auraient jamais servi à personne. Une fonction qui
    // n'existe que lorsqu'un fichier absent est présent est une fonction décorative.
    //
    // Le repli ne remplit donc que l'hôte, et expose la même interface que le mode
    // MapLibre : `rendre(points)` et `allerA(point)`. La barre pilote l'un ou l'autre
    // sans savoir lequel.
    function replier(motif) {
      // ── La raison passe AVANT la carte ──
      //
      // Elle était placée sous le rendu : sur un téléphone, il fallait faire défiler tout
      // le cadre pour apprendre pourquoi on regardait des points dans le vide. Le premier
      // réflexe est alors « la carte ne s'affiche même pas », et le vrai manque — un
      // fichier de fond jamais déposé — reste invisible.
      var noteRepli = motif
        ? '<div class="note carte-note-fond">Fond de plan non affiché : '
          + window.G.echapper(motif)
          + ' Les positions, les tournées et l’échelle ci-dessous restent exactes.</div>'
        : '';

      function dessiner(pts) {
        var opts = {};
        Object.keys(options).forEach(function (k) { opts[k] = options[k]; });
        opts.sansNote = Boolean(motif);
        hote.innerHTML = noteRepli + window.G.carte(pts, opts);
      }

      dessiner(points);

      return {
        mode: 'svg',
        motif: motif || null,
        rendre: dessiner,
        allerA: function (p) {
          // Sans fond de plan, « aller à » ne peut pas déplacer une vue : on nomme le
          // point sous la carte plutôt que de faire semblant de s'y rendre.
          var note = el.querySelector('.carte-point-vise');
          if (!note) {
            note = document.createElement('p');
            note.className = 'meta carte-point-vise';
            hote.appendChild(note);
          }
          note.textContent = 'Point visé : ' + libelleDe(p) + ' — '
            + Number(p.latitude).toFixed(5) + ', ' + Number(p.longitude).toFixed(5)
            + '. Sans fond de plan, la vue ne peut pas s’y déplacer.';
        },
      };
    }

    var utiles = (points || []).filter(function (p) {
      return Number.isFinite(Number(p.latitude)) && Number.isFinite(Number(p.longitude));
    });
    var tournees = options.tournees || [];

    // La coquille est montée AVANT tout : barre d'outils, hôte, légende. Les deux modes
    // — fond de plan ou repli — remplissent le même hôte, et la barre les pilote tous
    // les deux. C'est ce qui rend recherche, couches et légende utilisables même sans
    // fichier de fond.
    el.innerHTML = ''
      + '<div class="carte-outils"></div>'
      + '<div class="carte-hote"></div>'
      + '<div class="carte-legende"></div>';
    var hote = el.querySelector('.carte-hote');
    var barreOutils = el.querySelector('.carte-outils');
    var zoneLegende = el.querySelector('.carte-legende');

    // Aucun point : ni carte ni barre n'ont de sens. `G.carte` rend l'état vide, qui
    // dit ce qui manque et comment le renseigner.
    if (utiles.length === 0) {
      hote.innerHTML = window.G.carte(points, options);
      return Promise.resolve({ mode: 'vide' });
    }

    if (!estConfiguree()) {
      // Le contexte est OBLIGATOIRE : sans lui, `monterOutils` rend la vue telle quelle
      // et la barre reste vide. C'est justement le chemin le plus emprunté — tant que
      // le fichier de fond n'est pas déposé, tout le monde passe par ici.
      // Le motif s'adresse à qui lit l'écran, pas au développeur : renvoyer un
      // directeur vers un fichier JavaScript ne lui apprend rien d'actionnable.
      return Promise.resolve(monterOutils(
        replier('le fond OpenStreetMap n’a jamais été installé. Il se produit en une '
          + 'commande et se dépose une fois pour toutes — voir tools/extraire-carte-'
          + 'kinshasa.sh. Aucun abonnement ni clé d’API n’est nécessaire.'),
        { el: el, points: utiles, tournees: tournees }
      ));
    }

    /**
     * Le fichier est-il réellement lisible ?
     *
     * Seize octets suffisent à le savoir. Ce contrôle préalable coûte une requête
     * minuscule et remplace une détection par MOTIF sur les messages d'erreur de
     * MapLibre — qui, elle, casse silencieusement au premier changement de version :
     * un fichier absent renvoie « Bad response code: 404 », pas le mot « pmtiles ».
     *
     * Il distingue aussi les trois causes réelles, là où l'écouteur d'erreur les
     * confond : fichier absent, compartiment privé, ou CORS non autorisé.
     */
    function verifierArchive() {
      return fetch(config().pmtiles, {
        method: 'GET',
        headers: { Range: 'bytes=0-15' },
        cache: 'no-store',
      }).then(function (rep) {
        if (rep.status === 404) throw new Error('fichier introuvable (404).');
        if (rep.status === 403 || rep.status === 401) {
          throw new Error('accès refusé (' + rep.status + ') — le compartiment Supabase '
            + 'doit être public.');
        }
        if (!rep.ok && rep.status !== 206) {
          throw new Error('réponse inattendue (' + rep.status + ').');
        }
        return true;
      }).catch(function (err) {
        // `fetch` rejette sans statut quand CORS bloque : c'est la cause la plus
        // fréquente après le dépôt, et la plus difficile à deviner sans le dire.
        if (err instanceof TypeError) {
          throw new Error('requête bloquée par CORS. Autorisez l’origine du site dans '
            + 'la configuration Storage de Supabase.');
        }
        throw err;
      });
    }

    // Deux échecs distincts, deux messages distincts : dire « les modules n'ont pas pu
    // être chargés » quand c'est le FICHIER qui manque envoie chercher le problème au
    // mauvais endroit.
    return verifierArchive().catch(function (err) {
      throw new Error('FOND:' + err.message);
    }).then(function () {
      return chargerModules().catch(function (err) {
        throw new Error('MODULES:' + err.message);
      });
    }).then(function (mods) {
      // Vingt images, soit environ un tiers de seconde : assez pour laisser la vue se
      // mettre en page, trop peu pour se voir.
      return attendreDimensions(hote, 20).then(function () { return mods; });
    }).then(function (mods) {
      var carte = new mods.maplibregl.Map({
        container: hote,
        style: construireStyle(mods),
        // Le cadrage part des points eux-mêmes : la carte s'ouvre toujours sur les
        // données du jour, jamais sur un centre figé qui pourrait ne rien contenir.
        bounds: bornes(utiles),
        fitBoundsOptions: { padding: 40, maxZoom: 15 },
        attributionControl: { compact: true },
      });

      carte.addControl(new mods.maplibregl.NavigationControl({ showCompass: false }), 'top-left');
      carte.addControl(new mods.maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

      // Plein écran et vue d'ensemble sont dans la barre d'outils, commune aux deux
      // modes : les dupliquer ici donnerait deux boutons pour le même geste, dont un
      // seul existerait sans fond de plan.
      var vueGlobale = bornes(utiles);
      carte.addControl(boutonCarte('Recentrer sans changer le zoom', '◎', function () {
        carte.easeTo({ center: centreDe(vueGlobale) });
      }), 'top-right');

      var bulle = null;

      /**
       * Ce que le mode MapLibre offre à la barre d'outils.
       *
       * Trois verbes, les mêmes que le repli SVG. La barre ne sait pas lequel des deux
       * modes elle pilote — c'est ce qui garantit que recherche, couches et légende se
       * comportent pareil avec ou sans fond de plan.
       */
      var vueMapLibre = {
        mode: 'maplibre',

        rendre: function (pts) {
          if (!carte.getSource('arrets')) return;
          // La source est rechargée avec les seuls points retenus : sans cela, un
          // agrégat continuerait de compter des points masqués, et le compteur
          // mentirait — ce qui est pire que pas de compteur du tout.
          carte.getSource('arrets').setData(versGeoJson(pts));
        },

        allerA: function (p) {
          carte.easeTo({
            center: [Number(p.longitude), Number(p.latitude)],
            zoom: Math.max(carte.getZoom(), 16),
          });
          ouvrirBulle(mods, carte, p);
        },

        selectionnerTournee: function (id) {
          if (!carte.getLayer('tournees-trace')) return;

          carte.setFilter('tournees-trace', id === null
            ? ['!=', ['get', 'id'], '__aucune__']
            : ['==', ['get', 'id'], String(id)]);

          if (carte.getLayer('tournees-ordre')) {
            // Les numéros n'apparaissent qu'une tournée sélectionnée : les afficher tous
            // ferait un brouillard de chiffres sur une carte qui compte des centaines
            // d'arrêts.
            carte.setFilter('tournees-ordre', id === null
              ? ['==', ['get', 'ordre'], '__jamais__']
              : ['==', ['get', 'tournee_id'], String(id)]);
          }

          // Sans le cadrage, « sélectionner » ne ferait que griser le reste de l'écran
          // sans amener l'œil où il faut regarder.
          if (id !== null) {
            var arrets = utiles.filter(function (p) {
              return String(p.tournee_id) === String(id);
            });
            if (arrets.length > 0) carte.fitBounds(bornes(arrets), { padding: 60, maxZoom: 16 });
          }
        },

        // Le cadrage global. La barre remet les filtres à zéro de son côté ; ici on ne
        // s'occupe que de la caméra.
        vueDEnsemble: function () {
          carte.fitBounds(vueGlobale, { padding: 40, maxZoom: 15 });
        },
      };

      // La barre partagée est montée UNE FOIS la carte prête : elle appelle
      // `rendre()` d'emblée, et celui-ci a besoin de la source « arrets ».
      carte.on('load', function () {
        ajouterPoints(carte, mods, utiles);
        ajouterTournees(carte, tournees, utiles);
        monterOutils(vueMapLibre, { el: el, points: utiles, tournees: tournees });
      });
      function ouvrirBulle(m, c, p) {
        if (bulle) bulle.remove();
        // `closeButton: true` : la bulle ouverte au CLIC doit rester, et se fermer quand
        // on le décide. Une bulle qui disparaît au moindre mouvement de souris ne se lit
        // pas — c'est ce que faisait la version au survol.
        bulle = new m.maplibregl.Popup({ closeButton: true, maxWidth: '320px', offset: 12 })
          .setLngLat([Number(p.longitude), Number(p.latitude)])
          .setHTML(contenuBulle(p))
          .addTo(c);
      }

      function contenuBulle(p) {
        var ech = window.G.echapper;
        var cat = categorieDe(p);
        var lignes = [];
        if (p.detail) lignes.push(ech(p.detail));
        if (p.etat) lignes.push('État : ' + ech(String(p.etat).replace(/_/g, ' ')));
        if (p.ordre !== undefined && p.ordre !== null && p.ordre !== '') {
          lignes.push('Arrêt n° ' + ech(String(p.ordre)));
        }
        if (p.heure_passage) lignes.push('Passage : ' + ech(p.heure_passage));
        if (p.zone) lignes.push('Zone : ' + ech(p.zone));
        if (p.collecteur) lignes.push('Collecteur : ' + ech(p.collecteur));

        return '<strong>' + ech(libelleDe(p)) + '</strong>'
          + '<br><small style="color:' + CATEGORIES[cat].couleur + '">'
          + ech(CATEGORIES[cat].libelle) + '</small>'
          + (lignes.length ? '<br>' + lignes.join('<br>') : '')
          + '<br><small>' + Number(p.latitude).toFixed(5) + ', '
          + Number(p.longitude).toFixed(5) + '</small>';
      }

      function ajouterPoints(c, m, pts) {
        // ── Regroupement ──
        //
        // Quatre cents clients dans une commune produisent un amas illisible où l'on ne
        // distingue ni les positions ni les états. MapLibre agrège côté source : le
        // compteur est donc EXACT, et non une estimation de rendu.
        c.addSource('arrets', {
          type: 'geojson',
          data: versGeoJson(pts),
          cluster: true,
          // Au-delà du zoom 14, on est à l'échelle de la rue : chaque point doit se voir.
          clusterMaxZoom: 14,
          clusterRadius: 45,
        });

        c.addLayer({
          id: 'arrets-cluster',
          type: 'circle',
          source: 'arrets',
          filter: ['has', 'point_count'],
          paint: {
            // Trois paliers : la taille dit l'ordre de grandeur sans qu'on ait à lire.
            'circle-color': ['step', ['get', 'point_count'], '#3f6fd8', 25, '#2a56a8', 100, '#1b3c78'],
            'circle-radius': ['step', ['get', 'point_count'], 16, 25, 22, 100, 30],
            'circle-stroke-width': 2,
            'circle-stroke-color': themeSombre() ? '#141f2e' : '#ffffff',
          },
        });

        c.addLayer({
          id: 'arrets-cluster-nombre',
          type: 'symbol',
          source: 'arrets',
          filter: ['has', 'point_count'],
          layout: {
            'text-field': ['get', 'point_count_abbreviated'],
            'text-size': 12,
            'text-allow-overlap': true,
          },
          paint: { 'text-color': '#ffffff' },
        });

        c.addLayer({
          id: 'arrets-point',
          type: 'circle',
          source: 'arrets',
          filter: ['!', ['has', 'point_count']],
          paint: {
            'circle-radius': ['get', 'rayon'],
            'circle-color': ['get', 'couleur'],
            // L'anneau blanc détache le point du fond, quelle que soit la couleur dessous.
            'circle-stroke-width': 2,
            'circle-stroke-color': themeSombre() ? '#141f2e' : '#ffffff',
          },
        });

        // ── Dégroupement au clic ──
        //
        // Cliquer un agrégat zoome jusqu'au niveau où il se sépare. C'est le seul geste
        // qui rende le regroupement utilisable : sans lui, un amas de quatre cents points
        // est une impasse.
        c.on('click', 'arrets-cluster', function (e) {
          var f = c.queryRenderedFeatures(e.point, { layers: ['arrets-cluster'] })[0];
          c.getSource('arrets').getClusterExpansionZoom(f.properties.cluster_id)
            .then(function (zoom) {
              c.easeTo({ center: f.geometry.coordinates, zoom: zoom });
            })
            .catch(function () {
              // Une version plus ancienne de MapLibre passe par un rappel. On dégrade
              // proprement plutôt que de laisser le clic sans effet.
              c.easeTo({ center: f.geometry.coordinates, zoom: Math.min(c.getZoom() + 2, 17) });
            });
        });

        c.on('click', 'arrets-point', function (e) {
          var idx = Number(e.features[0].properties.idx);
          ouvrirBulle(m, c, pts[idx] || {
            latitude: e.lngLat.lat, longitude: e.lngLat.lng,
            libelle: e.features[0].properties.libelle,
          });
        });

        ['arrets-point', 'arrets-cluster'].forEach(function (couche) {
          c.on('mouseenter', couche, function () { c.getCanvas().style.cursor = 'pointer'; });
          c.on('mouseleave', couche, function () { c.getCanvas().style.cursor = ''; });
        });
      }

      function ajouterTournees(c, liste, pts) {
        var traces = liste.map(function (t, i) {
          var id = t.id === undefined ? i : t.id;
          var arrets = (t.arrets || []).filter(function (a) {
            return Number.isFinite(Number(a.latitude)) && Number.isFinite(Number(a.longitude));
          });
          if (arrets.length < 2) return null;
          return {
            type: 'Feature',
            properties: {
              id: String(id),
              nom: t.nom || ('Tournée ' + (i + 1)),
              couleur: teinteTournee(i),
            },
            geometry: {
              type: 'LineString',
              coordinates: arrets.map(function (a) {
                return [Number(a.longitude), Number(a.latitude)];
              }),
            },
          };
        }).filter(Boolean);

        if (traces.length === 0) return;

        c.addSource('tournees', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: traces },
        });
        c.addLayer({
          id: 'tournees-trace',
          type: 'line',
          source: 'tournees',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': ['get', 'couleur'],
            'line-width': 3,
            'line-opacity': 0.85,
          },
        });

        // ── L'ordre des arrêts ──
        //
        // Un tracé dit par où le camion passe ; il ne dit pas dans quel SENS. Les numéros
        // n'apparaissent qu'une tournée sélectionnée : les afficher tous ferait un
        // brouillard de chiffres sur une carte qui en compte plusieurs centaines.
        var numerotes = pts.filter(function (p) {
          return p.ordre !== undefined && p.ordre !== null && p.ordre !== '';
        });
        if (numerotes.length === 0) return;

        c.addSource('arrets-ordre', { type: 'geojson', data: versGeoJson(numerotes) });
        c.addLayer({
          id: 'tournees-ordre',
          type: 'symbol',
          source: 'arrets-ordre',
          filter: ['==', ['get', 'ordre'], '__jamais__'],
          layout: {
            'text-field': ['get', 'ordre'],
            'text-size': 11,
            'text-offset': [0, -1.3],
            'text-allow-overlap': false,
          },
          paint: {
            'text-color': themeSombre() ? '#e7edf5' : '#1b2430',
            'text-halo-color': themeSombre() ? '#141f2e' : '#ffffff',
            'text-halo-width': 1.5,
          },
        });
      }

      // ── Toutes les erreurs ne se valent pas ──
      //
      // La première version repliait la carte à la PREMIÈRE erreur, quelle qu'elle soit.
      // Or les polices de libellés sont servies par un hôte externe (voir `glyphs` dans
      // `carte-config.js`) : un réseau qui le bloque émettait une erreur de glyphe, et la
      // carte entière disparaissait. Le fichier de configuration promet exactement
      // l'inverse — « la carte s'affiche quand même, sans les noms de rues ».
      //
      // La règle : une erreur AVANT que le style soit chargé est fatale — il n'y a rien
      // à l'écran à préserver. Après, l'échec d'une ressource isolée (police, sprite,
      // tuile) dégrade la carte sans la détruire ; on le DIT sous la carte plutôt que de
      // le taire, mais les points et les tournées restent affichés.
      var replie = false;
      var degradations = [];
      carte.on('error', function (e) {
        if (replie) return;
        var message = (e && e.error && e.error.message) || 'erreur inconnue';
        var styleReady = false;
        try { styleReady = carte.isStyleLoaded(); } catch (_) { styleReady = false; }

        if (!styleReady) {
          replie = true;
          try { carte.remove(); } catch (_) { /* déjà détruite */ }
          monterOutils(
            replier('le fond de plan n’a pas pu être rendu (' + message + ').'),
            { el: el, points: utiles, tournees: tournees }
          );
          return;
        }

        // Une note par CAUSE, pas une par tuile : MapLibre réémet la même erreur à
        // chaque requête, et l'on afficherait sinon quarante lignes identiques.
        var cause = /glyph|font/i.test(message) ? 'les noms de rues ne sont pas affichés '
            + '(les polices de libellés ne sont pas joignables)'
          : /sprite|icon/i.test(message) ? 'certaines icônes du fond manquent'
          : 'une partie du fond de plan n’a pas pu être chargée';
        if (degradations.indexOf(cause) !== -1) return;
        degradations.push(cause);

        var note = el.querySelector('.carte-degradation');
        if (!note) {
          note = document.createElement('div');
          note.className = 'note carte-degradation';
          el.insertBefore(note, el.querySelector('.carte-legende'));
        }
        note.textContent = 'Fond de plan incomplet : ' + degradations.join(' ; ')
          + '. Les positions, les tournées et l’échelle restent exactes.';
      });

      // Le fond suit la bascule de thème. Sans cela, passer en sombre laisse une carte
      // blanche au milieu d'une page sombre — le défaut le plus visible qui soit, et
      // celui qu'on ne voit jamais en développant, parce qu'on ne bascule pas.
      var observateur = new MutationObserver(function () {
        try {
          carte.setStyle(construireStyle(mods));
          carte.once('styledata', function () {
            ajouterPoints(carte, mods, utiles);
            ajouterTournees(carte, tournees, utiles);
            // La barre est remontée : elle réapplique d'elle-même les filtres courants
            // en appelant `rendre()`. Sans ce remontage, basculer le thème rétablirait
            // silencieusement les couches que l'utilisateur venait de masquer.
            monterOutils(vueMapLibre, { el: el, points: utiles, tournees: tournees });
          });
        } catch (_) { /* la carte a été retirée entre-temps */ }
      });
      observateur.observe(document.documentElement, {
        attributes: true, attributeFilter: ['data-theme'],
      });

      suivreTaille(el, carte, utiles);
      vivantes.set(el, { carte: carte, observateur: observateur });

      return { mode: 'maplibre', points: utiles.length, tournees: tournees.length };
    }).catch(function (err) {
      var brut = String(err.message || err);
      var motif = brut;
      if (brut.indexOf('FOND:') === 0) motif = brut.slice(5);
      else if (brut.indexOf('MODULES:') === 0) {
        motif = 'les modules cartographiques n’ont pas pu être chargés (' + brut.slice(8) + ').';
      }
      // Le repli garde sa barre : c'est précisément quand le fond manque que chercher un
      // client dans une liste de quatre cents points devient indispensable.
      return monterOutils(replier(motif), { el: el, points: utiles, tournees: tournees });
    });
  }

  function centreDe(b) {
    return [(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2];
  }

  function bornes(points) {
    var lats = points.map(function (p) { return Number(p.latitude); });
    var lons = points.map(function (p) { return Number(p.longitude); });
    var sud = Math.min.apply(null, lats); var nord = Math.max.apply(null, lats);
    var ouest = Math.min.apply(null, lons); var est = Math.max.apply(null, lons);
    // Un point unique n'a pas d'étendue : on ouvre une fenêtre autour de lui.
    if (nord - sud < 0.002) { sud -= 0.004; nord += 0.004; }
    if (est - ouest < 0.002) { ouest -= 0.004; est += 0.004; }
    return [[ouest, sud], [est, nord]];
  }

  /** Trois teintes au maximum : au-delà, elles cessent d'être distinguables. */
  function teinteTournee(i) {
    return ['#1f6b3a', '#eb6834', '#2a78d6'][i % 3];
  }

  return {
    estConfiguree: estConfiguree,
    afficher: afficher,
    couleurEtat: couleurEtat,
    categorieDe: categorieDe,
    CATEGORIES: CATEGORIES,
    // Exposée pour qu'une page qui démonte elle-même sa vue puisse libérer la carte
    // sans attendre le prochain appel à `afficher`.
    liberer: libererConteneur,
    /**
     * L'instance MapLibre vivante d'un conteneur, ou `null` en repli SVG.
     *
     * Elle sert au diagnostic — inspecter les couches, les filtres et le regroupement
     * depuis la console — et aux contrôles de navigateur, qui doivent pouvoir vérifier
     * que le regroupement forme RÉELLEMENT des agrégats plutôt que se contenter de lire
     * la configuration déclarée.
     */
    instance: function (conteneur) {
      var el = typeof conteneur === 'string' ? document.getElementById(conteneur) : conteneur;
      if (!el || !vivantes || !vivantes.has(el)) return null;
      return vivantes.get(el).carte;
    },
  };
}());
