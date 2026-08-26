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

    function replier(motif) {
      // `sansNote` : le repli explique lui-même pourquoi il n'y a pas de fond. Laisser
      // les deux notes reviendrait à dire deux fois la même chose, à deux endroits.
      var opts = {};
      Object.keys(options).forEach(function (k) { opts[k] = options[k]; });
      opts.sansNote = Boolean(motif);
      el.innerHTML = window.G.carte(points, opts)
        + (motif
          ? '<div class="note">Fond de plan non affiché : ' + window.G.echapper(motif)
            + ' Les positions, les tournées et l’échelle ci-dessus restent exactes.</div>'
          : '');
      return { mode: 'svg', motif: motif || null };
    }

    if (!estConfiguree()) {
      return Promise.resolve(replier(
        'aucun fichier de fond n’est configuré (voir assets/js/carte-config.js).'
      ));
    }

    var utiles = (points || []).filter(function (p) {
      return Number.isFinite(Number(p.latitude)) && Number.isFinite(Number(p.longitude));
    });
    if (utiles.length === 0) return Promise.resolve(replier(null));

    el.innerHTML = '<div class="carte-hote"></div>';
    var hote = el.querySelector('.carte-hote');

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

      carte.on('load', function () {
        ajouterTournees(carte, options.tournees || []);
        ajouterPoints(carte, mods, utiles);
      });

      // Filet de sécurité : le contrôle préalable ne couvre pas tout — une tuile
      // corrompue en plein milieu, par exemple. Une seule fois, sinon MapLibre émet
      // une erreur par tuile et l'écran clignoterait.
      var replie = false;
      carte.on('error', function (e) {
        if (replie) return;
        replie = true;
        var message = (e && e.error && e.error.message) || 'erreur inconnue';
        try { carte.remove(); } catch (_) { /* déjà détruite */ }
        replier('le fond de plan n’a pas pu être rendu (' + message + ').');
      });

      // Le fond suit la bascule de thème. Sans cela, passer en sombre laisse une carte
      // blanche au milieu d'une page sombre — le défaut le plus visible qui soit, et
      // celui qu'on ne voit jamais en développant, parce qu'on ne bascule pas.
      var observateur = new MutationObserver(function () {
        var sombreMaintenant = themeSombre();
        if (sombreMaintenant === carte.__sombre) return;
        carte.__sombre = sombreMaintenant;
        try {
          carte.setStyle(construireStyle(mods), { diff: false });
          carte.once('styledata', function () {
            ajouterTournees(carte, options.tournees || []);
            ajouterPoints(carte, mods, utiles);
          });
        } catch (_) { /* le style précédent reste affiché : mieux qu'un cadre vide */ }
      });
      carte.__sombre = themeSombre();
      observateur.observe(document.documentElement, {
        attributes: true, attributeFilter: ['data-theme'],
      });
      carte.on('remove', function () { observateur.disconnect(); });

      var observateurTaille = suivreTaille(hote, carte, utiles);
      if (vivantes) vivantes.set(el, { carte: carte, observateurTaille: observateurTaille });
      carte.on('remove', function () {
        try { observateurTaille.disconnect(); } catch (_) { /* déjà libéré */ }
      });

      return { mode: 'maplibre', carte: carte };
    }).catch(function (err) {
      var m = err.message || '';
      if (m.indexOf('FOND:') === 0) return replier(m.slice(5));
      if (m.indexOf('MODULES:') === 0) {
        return replier('les modules cartographiques n’ont pas pu être chargés ('
          + m.slice(8) + ').');
      }
      return replier('erreur inattendue (' + m + ').');
    });
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

  function ajouterTournees(carte, tournees) {
    var traces = tournees.map(function (t, i) {
      var arrets = (t.arrets || []).filter(function (a) {
        return Number.isFinite(Number(a.latitude)) && Number.isFinite(Number(a.longitude));
      });
      if (arrets.length < 2) return null;
      return {
        type: 'Feature',
        properties: { nom: t.nom || ('Tournée ' + (i + 1)), couleur: teinteTournee(i) },
        geometry: {
          type: 'LineString',
          coordinates: arrets.map(function (a) {
            return [Number(a.longitude), Number(a.latitude)];
          }),
        },
      };
    }).filter(Boolean);

    if (traces.length === 0) return;

    carte.addSource('tournees', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: traces },
    });
    carte.addLayer({
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
  }

  /** Trois teintes au maximum : au-delà, elles cessent d'être distinguables. */
  function teinteTournee(i) {
    return ['#1f6b3a', '#eb6834', '#2a78d6'][i % 3];
  }

  function ajouterPoints(carte, mods, points) {
    carte.addSource('arrets', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: points.map(function (p) {
          return {
            type: 'Feature',
            properties: {
              libelle: p.libelle || 'Point',
              detail: p.detail || '',
              etat: p.etat || '',
              couleur: p.couleur || couleurEtat(p.etat),
              rayon: p.type === 'incident' ? 8 : 6,
            },
            geometry: {
              type: 'Point',
              coordinates: [Number(p.longitude), Number(p.latitude)],
            },
          };
        }),
      },
    });

    carte.addLayer({
      id: 'arrets-point',
      type: 'circle',
      source: 'arrets',
      paint: {
        'circle-radius': ['get', 'rayon'],
        'circle-color': ['get', 'couleur'],
        // L'anneau blanc détache le point du fond, quelle que soit la couleur dessous.
        'circle-stroke-width': 2,
        'circle-stroke-color': themeSombre() ? '#141f2e' : '#ffffff',
      },
    });

    var bulle = new mods.maplibregl.Popup({ closeButton: false, offset: 12 });

    carte.on('mouseenter', 'arrets-point', function (e) {
      carte.getCanvas().style.cursor = 'pointer';
      var p = e.features[0].properties;
      bulle.setLngLat(e.features[0].geometry.coordinates)
        .setHTML('<strong>' + window.G.echapper(p.libelle) + '</strong>'
          + (p.detail ? '<br>' + window.G.echapper(p.detail) : '')
          + (p.etat ? '<br><small>' + window.G.echapper(p.etat.replace(/_/g, ' ')) + '</small>' : ''))
        .addTo(carte);
    });
    carte.on('mouseleave', 'arrets-point', function () {
      carte.getCanvas().style.cursor = '';
      bulle.remove();
    });
  }

  return {
    estConfiguree: estConfiguree,
    afficher: afficher,
    couleurEtat: couleurEtat,
    // Exposée pour qu'une page qui démonte elle-même sa vue puisse libérer la carte
    // sans attendre le prochain appel à `afficher`.
    liberer: libererConteneur,
  };
}());
