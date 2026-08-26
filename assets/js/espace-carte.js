/**
 * ════════════════════════════════════════
 * VUES CARTOGRAPHIQUES — Marketing et DGA (§11)
 * ════════════════════════════════════════
 *
 * Deux cartes, deux lectures d'un même territoire.
 *
 *   Marketing — où les campagnes produisent des ABONNÉS, et non des intentions.
 *   DGA       — ce qui BLOQUE, et où.
 *
 * Elles partagent le rendu, les états vides et la façon de traiter les absences ; elles
 * ne partagent ni leurs données ni leur propos.
 *
 * ── La règle qui gouverne ces deux écrans ──
 *
 * Ce qui n'a pas de coordonnées n'est pas placé. Ni au centre de sa zone, ni « à peu
 * près ». Un point faux se lit exactement comme un point vrai, et personne ne rouvre la
 * question ensuite. Ce qui manque est donc COMPTÉ et LISTÉ, à côté de la carte, avec de
 * quoi le corriger.
 *
 * ── Pourquoi la carte est reconstruite à chaque affichage ──
 *
 * Le routeur des espaces vide `#contenu` à chaque changement de vue. `CarteInteractive`
 * libère l'instance précédente avant d'en poser une nouvelle : sans cela les contextes
 * WebGL s'accumulent et le navigateur finit par en détruire au hasard — la carte cesse
 * alors de s'afficher, sans message.
 */
(function (global) {
  'use strict';

  var ED = global.EspaceDirection;
  var API = global.EnviroAPI;
  var e = ED.echapper;

  /** Le routeur pose « Chargement… » ; c'est à la vue de le remplacer une fois chargée. */
  function sousTitre(texte) {
    var el = document.getElementById('sousTitre');
    if (el) el.textContent = texte;
  }

  /** Bandeau de couverture : combien sont placés, combien ne peuvent pas l'être. */
  function couverture(c) {
    if (!c) return '';
    return ED.grilleKpi([
      { nom: 'Convertis sur la période', valeur: c.convertis_periode },
      { nom: 'Placés sur la carte', valeur: c.places },
      { nom: 'Sans coordonnées', valeur: c.sans_gps },
      { nom: 'Prospects relevés', valeur: c.prospects_places },
      {
        nom: 'Taux de géolocalisation',
        valeur: c.taux_geolocalisation,
        format: 'pourcent',
        // `null` doit se lire « aucune donnée », jamais « 0 % » : sans converti sur la
        // période, le taux n'existe pas — il ne vaut pas zéro.
        base: c.taux_geolocalisation === null ? 'Aucun converti sur la période' : null,
        formule: 'clients convertis géolocalisés ÷ clients convertis',
        sources: ['subscribers', 'client_locations'],
      },
    ]);
  }

  function listeSansGps(lignes) {
    var corps = (lignes || []).map(function (l) {
      return '<tr>'
        + '<td>' + e(l.numero_abonne || '—') + '</td>'
        + '<td>' + e(l.client || '—') + '</td>'
        + '<td>' + e(l.zone || '—') + '</td>'
        + '<td>' + e(l.commune || '—') + '</td>'
        + '<td>' + e(l.source_acquisition || 'non renseignée') + '</td>'
        + '</tr>';
    }).join('');

    return ED.panneau('Géolocalisation manquante',
      ED.tableau(['N° abonné', 'Client', 'Zone', 'Commune', 'Source'], corps,
        { vide: 'Tous les clients de la période sont géolocalisés.' }),
      { sousTitre: 'Ces clients ne figurent pas sur la carte : aucune coordonnée ne leur '
        + 'est attribuée, et aucune ne leur sera inventée. Corrigez la position depuis '
        + 'l’espace Opérations, vue « Géolocalisation ».' });
  }

  // ════════════════════════════════════════
  // Marketing
  // ════════════════════════════════════════

  function vueMarketing(cible, periode) {
    var el = typeof cible === 'string' ? document.getElementById(cible) : cible;
    el.innerHTML = ED.squelette(5);

    var params = [];
    if (periode && periode.debut) params.push('debut=' + encodeURIComponent(periode.debut));
    if (periode && periode.fin) params.push('fin=' + encodeURIComponent(periode.fin));

    API.get('/api/direction-marketing/terrain/carte'
      + (params.length ? '?' + params.join('&') : '')
    ).then(function (d) {
      var parZone = (d.prospects_par_zone || []).map(function (z) {
        return '<tr>'
          + '<td>' + e(z.zone) + '</td>'
          + '<td>' + e(z.commune) + '</td>'
          + '<td>' + ED.nombre(z.total) + '</td>'
          + '<td>' + ED.nombre(z.ouverts) + '</td>'
          + '<td>' + ED.nombre(z.convertis) + '</td>'
          + '<td>' + ED.nombre(z.releves) + '</td>'
          + '</tr>';
      }).join('');

      // Deux couches, une seule carte. Les prospects relevés et les clients convertis
      // sont distingués par leur libellé : les fondre en une couche unique ferait
      // paraître le portefeuille plus fourni qu'il n'est.
      var points = (d.points || []).concat(
        (d.points_prospects || []).map(function (p) {
          return {
            id: 'prospect-' + p.id,
            latitude: p.latitude,
            longitude: p.longitude,
            nom: 'Prospect — ' + p.nom,
            etat: p.etat,
            detail: p.detail,
          };
        })
      );

      sousTitre(ED.nombre(d.couverture.places) + ' client(s) et '
        + ED.nombre(d.couverture.prospects_places) + ' prospect(s) placés · période du '
        + ED.dateCourte(d.periode.debut) + ' au ' + ED.dateCourte(d.periode.fin));

      el.innerHTML = couverture(d.couverture)
        + ED.panneau('Clients et prospects — carte de Kinshasa',
          '<div id="carteMarketingKinshasa"></div>',
          { sousTitre: 'Les clients convertis sont placés à leurs coordonnées réelles. '
            + 'Un prospect n’apparaît que si sa position a été RELEVÉE sur le terrain — '
            + 'jamais au centre de sa zone.' })
        + ED.panneau('Prospects par zone',
          ED.tableau(['Zone', 'Commune', 'Prospects', 'Ouverts', 'Convertis', 'Position relevée'],
            parZone, { vide: 'Aucun prospect enregistré sur la période.' }),
          { sousTitre: 'La colonne « position relevée » dit ce que la carte montre '
            + 'réellement de chaque zone. Les prospects sans position y sont comptés, '
            + 'jamais posés au centre de la zone.' })
        + listeSansGps(d.geolocalisation_manquante)
        + '<p class="meta">' + e(d.note) + '</p>';

      global.CarteInteractive.afficher('carteMarketingKinshasa', points, {
        motifVide: 'Aucun client converti ni prospect relevé sur cette période.',
      });
    }).catch(function (err) { ED.afficherErreur(el, err); });
  }

  // ════════════════════════════════════════
  // DGA
  // ════════════════════════════════════════

  function vueDga(cible, jour) {
    var el = typeof cible === 'string' ? document.getElementById(cible) : cible;
    el.innerHTML = ED.squelette(5);

    API.get('/api/dga/terrain/carte' + (jour ? '?jour=' + encodeURIComponent(jour) : ''))
      .then(function (d) {
        var r = d.resume || {};

        var blocages = (d.blocages || []).map(function (b) {
          return '<tr' + (b.en_retard ? ' style="background:rgba(220,38,38,.07)"' : '') + '>'
            + '<td><strong>' + e(b.reference || '—') + '</strong><br>'
            + '<small>' + e(b.intitule || '') + '</small></td>'
            + '<td>' + e(b.blocage || '—') + '</td>'
            + '<td>' + e(b.direction || '—') + '</td>'
            + '<td>' + e(b.responsable || '—') + '</td>'
            + '<td>' + ED.dateCourte(b.echeance)
            + (b.en_retard ? '<br><small style="color:var(--danger,#dc2626)">en retard</small>' : '')
            + '</td>'
            + '<td>' + e(b.priorite || '—') + '</td>'
            + '<td>' + ED.pourcent(b.progression) + '</td>'
            + '</tr>';
        }).join('');

        var tournees = (d.tournees_en_difficulte || []).map(function (t) {
          return '<tr>'
            + '<td>' + e(t.nom || ('Tournée ' + t.id)) + '</td>'
            + '<td>' + e(t.zone || '—') + '</td>'
            + '<td>' + e(t.statut || '—') + '</td>'
            + '<td>' + ED.nombre(t.traites) + ' / ' + ED.nombre(t.arrets) + '</td>'
            + '<td>' + ED.nombre(t.echecs) + '</td>'
            + '</tr>';
        }).join('');

        sousTitre(ED.nombre(r.blocages_ouverts) + ' action(s) bloquée(s), dont '
          + ED.nombre(r.blocages_en_retard) + ' en retard · ' + ED.dateCourte(d.jour));

        el.innerHTML = ED.grilleKpi([
          { nom: 'Incidents ouverts', valeur: r.incidents_ouverts },
          { nom: 'Tournées du jour', valeur: r.tournees_du_jour },
          { nom: 'Actions bloquées', valeur: r.blocages_ouverts },
          { nom: 'Blocages en retard', valeur: r.blocages_en_retard },
        ])
          + ED.panneau('Incidents ouverts — carte de Kinshasa',
            '<div id="carteDgaKinshasa"></div>',
            { sousTitre: 'Les incidents sont placés à leurs coordonnées réelles. '
              + ED.nombre(d.incidents_sans_position) + ' incident(s) sans coordonnées ne '
              + 'sont pas placés — ils sont comptés ici plutôt que posés au hasard.' })
          + ED.panneau('Ce qui bloque',
            ED.tableau(['Action', 'Blocage', 'Direction', 'Responsable', 'Échéance',
              'Priorité', 'Avancement'], blocages,
              { vide: 'Aucune action en blocage. C’est un bon résultat, pas une absence '
                + 'de données : la requête a bien tourné.' }),
            { sousTitre: 'Un blocage n’est pas un lieu mais une décision en attente : '
              + 'ces actions sont listées, jamais placées sur la carte.' })
          + ED.panneau('Tournées en difficulté',
            ED.tableau(['Tournée', 'Zone', 'Statut', 'Traités', 'Échecs'], tournees,
              { vide: 'Aucune tournée en difficulté aujourd’hui.' }))
          + '<p class="meta">' + e(d.note) + '</p>';

        global.CarteInteractive.afficher('carteDgaKinshasa', d.points || [], {
          motifVide: 'Aucun incident ouvert avec coordonnées.',
        });
      }).catch(function (err) { ED.afficherErreur(el, err); });
  }

  global.EspaceCarte = {
    marketing: vueMarketing,
    dga: vueDga,
  };
}(window));
