/**
 * ════════════════════════════════════════
 * ESPACE DOCUMENTAIRE — le parcours du §17 à l'écran
 * ════════════════════════════════════════
 *
 * Une vue, branchable dans n'importe quel espace de direction par une entrée de menu et
 * une ligne dans la table des vues :
 *
 *     <a href="#" data-vue="documents" data-permission="document.read">Documents</a>
 *     …
 *     documents: function () { EspaceDocuments.vue(contenu); },
 *
 * ── Ce que cet écran refuse de faire ──
 *
 * Il ne propose jamais une action que le serveur refusera. Les boutons viennent de
 * `actions[]`, calculé côté serveur par la machine à états, et chacun porte SON motif de
 * refus quand il est grisé. Un bouton grisé sans explication est une impasse ; un bouton
 * actif qui répond 403 est un mensonge.
 *
 * ── Les trois choses qui ne doivent jamais disparaître de l'écran ──
 *
 *   1. les données obligatoires manquantes, parce qu'elles bloquent l'approbation ;
 *   2. les citations juridiques sans source, pour la même raison ;
 *   3. le filigrane et le statut, parce qu'un brouillon exporté circule.
 *
 * Aucun build, aucune dépendance, compatible GitHub Pages et CSP stricte.
 */
(function (global) {
  'use strict';

  var ED = global.EspaceDirection;
  var API = global.EnviroAPI;

  var e = ED.echapper;

  var etat = {
    cible: null,
    documentId: null,
    catalogue: null,
    filtre: { statut: '', type: '', q: '' },
  };

  /**
   * La mention exigée au mot près par le §17.
   *
   * Écrite en une seule chaîne, et non recomposée à l'affichage : coupée en deux
   * morceaux concaténés, elle devient invisible aux contrôles du dépôt et peut dériver
   * du libellé que le serveur appose sur le document exporté. Les deux doivent dire
   * exactement la même chose.
   */
  var MENTION_JURISTE = 'À faire vérifier par un juriste compétent en droit congolais.';

  /**
   * Met à jour le sous-titre de l'écran.
   *
   * Le routeur pose « Chargement… » AVANT d'appeler la vue, et compte sur elle pour le
   * remplacer. Une vue qui ne le fait pas laisse l'écran afficher « Chargement… » sous
   * un contenu entièrement chargé — l'utilisateur attend quelque chose qui est déjà là.
   */
  function sousTitre(texte) {
    var el = document.getElementById('sousTitre');
    if (el) el.textContent = texte;
  }

  var LIBELLE_STATUT = {
    brouillon: 'Brouillon',
    en_revision: 'En révision',
    corrections_demandees: 'Corrections demandées',
    approuve: 'Approuvé',
    signe: 'Signé',
    archive: 'Archivé',
  };

  function pastille(statut) {
    return '<span class="etiquette etiquette-' + e(statut) + '">'
      + e(LIBELLE_STATUT[statut] || statut) + '</span>';
  }

  // ════════════════════════════════════════
  // Vue principale : la liste
  // ════════════════════════════════════════

  function vue(cible) {
    etat.cible = typeof cible === 'string' ? document.getElementById(cible) : cible;
    etat.documentId = null;
    etat.cible.innerHTML = ED.squelette(4);

    API.get('/api/documents/catalogue').then(function (cat) {
      etat.catalogue = cat;
      return listerEtRendre();
    }).catch(function (err) { ED.afficherErreur(etat.cible, err); });
  }

  function listerEtRendre() {
    var params = [];
    if (etat.filtre.statut) params.push('statut=' + encodeURIComponent(etat.filtre.statut));
    if (etat.filtre.type) params.push('type=' + encodeURIComponent(etat.filtre.type));
    if (etat.filtre.q) params.push('q=' + encodeURIComponent(etat.filtre.q));
    params.push('taille=50');

    return API.get('/api/documents?' + params.join('&')).then(function (d) {
      rendreListe(d);
    });
  }

  function rendreListe(d) {
    var cat = etat.catalogue;

    var optionsType = ['<option value="">Tous les types</option>'].concat(
      (cat.types || []).map(function (t) {
        return '<option value="' + e(t.code) + '"'
          + (etat.filtre.type === t.code ? ' selected' : '') + '>' + e(t.libelle) + '</option>';
      })
    ).join('');

    var optionsStatut = ['', 'brouillon', 'en_revision', 'corrections_demandees',
      'approuve', 'signe', 'archive'].map(function (s) {
      return '<option value="' + e(s) + '"' + (etat.filtre.statut === s ? ' selected' : '') + '>'
        + (s ? e(LIBELLE_STATUT[s]) : 'Tous les statuts') + '</option>';
    }).join('');

    var lignes = (d.lignes || []).map(function (l) {
      var manquantes = (l.donnees_manquantes || []).length;
      return '<tr>'
        + '<td><a href="#" data-doc="' + e(l.id) + '"><strong>' + e(l.reference) + '</strong></a><br>'
        + '<small style="color:var(--texte-faible)">' + e(l.titre) + '</small></td>'
        + '<td>' + e((cat.types.find(function (t) { return t.code === l.type_document; }) || {}).libelle
          || l.type_document) + '</td>'
        + '<td>' + pastille(l.statut) + '</td>'
        + '<td>' + ED.nombre(l.version_courante) + '</td>'
        + '<td>' + (manquantes > 0
          ? '<span style="color:var(--alerte,#b45309)">' + manquantes + ' manquante(s)</span>'
          : '<span style="color:var(--texte-faible)">complet</span>') + '</td>'
        + '<td>' + (Number(l.commentaires_ouverts) > 0
          ? ED.nombre(l.commentaires_ouverts) : '—') + '</td>'
        + '<td>' + ED.dateCourte(l.updated_at) + '</td>'
        + '</tr>';
    }).join('');

    var alerteIdentite = '';
    if (cat.identite_societe_incomplete && cat.identite_societe_incomplete.length > 0) {
      // Une information, pas une panne : les documents restent rédigeables, ils ne
      // peuvent simplement pas être finalisés.
      alerteIdentite = '<div class="avertissement">'
        + '<strong>Identité d’Envirocleans incomplète.</strong> '
        + e(cat.identite_societe_incomplete.join(', '))
        + ' — ces mentions doivent figurer sur un contrat. Renseignez les variables '
        + 'SOCIETE_* côté serveur. En attendant, les documents contractuels restent des '
        + 'brouillons : la donnée manquante bloque la version finale.'
        + '</div>';
    }

    sousTitre(ED.nombre(d.total) + ' document(s) — domaines ouverts : '
      + (cat.domaines_lisibles || []).join(', '));

    etat.cible.innerHTML = alerteIdentite
      + '<div class="barre-actions">'
      + '<select id="docFiltreType">' + optionsType + '</select> '
      + '<select id="docFiltreStatut">' + optionsStatut + '</select> '
      + '<input type="search" id="docRecherche" placeholder="Référence ou titre" value="'
      + e(etat.filtre.q) + '"> '
      + (cat.peut_rediger ? '<button class="action" id="docNouveau">Nouveau document</button>' : '')
      + '</div>'
      + ED.panneau('Documents',
        ED.tableau(['Référence', 'Type', 'Statut', 'Version', 'Données', 'Remarques', 'Modifié'],
          lignes, { vide: 'Aucun document. Créez-en un depuis un modèle de la bibliothèque.' }),
        { sousTitre: ED.nombre(d.total) + ' document(s) — vous ne voyez que les domaines '
          + 'ouverts à votre direction : ' + e((cat.domaines_lisibles || []).join(', ')) })
      + '<div id="docDetail"></div>';

    brancherListe();
  }

  function brancherListe() {
    var t = document.getElementById('docFiltreType');
    var s = document.getElementById('docFiltreStatut');
    var q = document.getElementById('docRecherche');
    var n = document.getElementById('docNouveau');

    if (t) t.addEventListener('change', function () { etat.filtre.type = t.value; listerEtRendre(); });
    if (s) s.addEventListener('change', function () { etat.filtre.statut = s.value; listerEtRendre(); });
    if (q) {
      q.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') { etat.filtre.q = q.value; listerEtRendre(); }
      });
    }
    if (n) n.addEventListener('click', formulaireCreation);

    Array.prototype.forEach.call(etat.cible.querySelectorAll('[data-doc]'), function (a) {
      a.addEventListener('click', function (ev) {
        ev.preventDefault();
        ouvrir(Number(a.getAttribute('data-doc')));
      });
    });
  }

  // ════════════════════════════════════════
  // Création
  // ════════════════════════════════════════

  function formulaireCreation() {
    var detail = document.getElementById('docDetail');
    detail.innerHTML = ED.squelette(3);

    API.get('/api/documents/modeles').then(function (modeles) {
      var actifs = modeles.filter(function (m) { return m.statut === 'actif'; });

      if (actifs.length === 0) {
        detail.innerHTML = ED.panneau('Nouveau document',
          '<div class="etat-vide">Aucun modèle actif dans votre domaine. '
          + 'Un modèle doit être créé puis activé avant de pouvoir produire un document — '
          + 'c’est la validation humaine qui le rend utilisable.</div>');
        return;
      }

      var options = actifs.map(function (m) {
        return '<option value="' + e(m.id) + '">' + e(m.titre) + ' — ' + e(m.code)
          + ' v' + e(m.version) + '</option>';
      }).join('');

      detail.innerHTML = ED.panneau('Nouveau document',
        '<form id="docForm" class="formulaire">'
        + '<label>Modèle<select name="template_id" required>' + options + '</select></label>'
        + '<label>Titre <small>(facultatif — celui du modèle sinon)</small>'
        + '<input type="text" name="titre" maxlength="200"></label>'
        + '<fieldset><legend>Rattacher à une donnée réelle <small>(facultatif)</small></legend>'
        + '<p class="meta">Les valeurs seront chargées depuis la base : identité du client, '
        + 'de l’employé, du fournisseur, montant et devise de l’offre, zone. Rien n’est '
        + 'inventé — ce qui manque restera signalé comme manquant.</p>'
        + '<label>N° d’abonné (client)<input type="number" name="subscriber_id" min="1"></label>'
        + '<label>Employé (identifiant utilisateur)<input type="number" name="employee_user_id" min="1"></label>'
        + '<label>Fournisseur<input type="number" name="supplier_id" min="1"></label>'
        + '<label>Offre<input type="number" name="plan_id" min="1"></label>'
        + '<label>Zone<input type="number" name="zone_id" min="1"></label>'
        + '</fieldset>'
        + '<div class="barre-actions">'
        + '<button type="submit" class="action">Créer le brouillon</button> '
        + '<button type="button" class="action secondaire" id="docAnnuler">Annuler</button>'
        + '</div>'
        + '<p class="meta" id="docFormMsg"></p>'
        + '</form>');

      document.getElementById('docAnnuler').addEventListener('click', function () {
        detail.innerHTML = '';
      });

      document.getElementById('docForm').addEventListener('submit', function (ev) {
        ev.preventDefault();
        soumettreCreation(ev.target);
      });
    }).catch(function (err) { ED.afficherErreur(detail, err); });
  }

  function soumettreCreation(form) {
    var bouton = form.querySelector('button[type=submit]');
    var msg = document.getElementById('docFormMsg');

    // Protection contre le double clic : deux documents créés pour un seul geste sont
    // deux références consommées et un doublon à ranger.
    if (bouton.disabled) return;
    bouton.disabled = true;
    bouton.textContent = 'Création…';
    msg.textContent = '';

    var contexte = {};
    ['subscriber_id', 'employee_user_id', 'supplier_id', 'plan_id', 'zone_id']
      .forEach(function (champ) {
        var v = form.elements[champ].value;
        if (v) contexte[champ] = Number(v);
      });

    API.post('/api/documents', {
      template_id: Number(form.elements.template_id.value),
      titre: form.elements.titre.value || null,
      contexte: contexte,
    }).then(function (r) {
      ouvrir(r.document.id);
      listerEtRendre();
    }).catch(function (err) {
      msg.innerHTML = '<span class="erreur">' + e(err.message) + '</span>';
      bouton.disabled = false;
      bouton.textContent = 'Créer le brouillon';
    });
  }

  // ════════════════════════════════════════
  // Détail
  // ════════════════════════════════════════

  function ouvrir(id) {
    etat.documentId = id;
    var detail = document.getElementById('docDetail');
    detail.innerHTML = ED.squelette(6);

    API.get('/api/documents/' + id).then(function (v) { rendreDetail(v); })
      .catch(function (err) { ED.afficherErreur(detail, err); });
  }

  function rendreDetail(v) {
    var d = v.document;
    var detail = document.getElementById('docDetail');

    var blocs = [];

    // ── Ce qui bloque, en tête : c'est ce qui décide de la suite ──
    var manquantes = d.donnees_manquantes || [];
    if (manquantes.length > 0) {
      blocs.push('<div class="avertissement"><strong>'
        + manquantes.length + ' donnée(s) obligatoire(s) manquante(s) :</strong> '
        + e(manquantes.join(', '))
        + ' — tant qu’elles manquent, le document ne peut pas être approuvé, et l’export '
        + 'porte le filigrane « brouillon ».</div>');
    }

    if (v.citations_orphelines && v.citations_orphelines.length > 0) {
      blocs.push('<div class="avertissement"><strong>Référence(s) juridique(s) sans source :</strong> '
        + e(v.citations_orphelines.join(' ; '))
        + ' — déclarez la source ci-dessous (texte, organisme, lien, date de consultation), '
        + 'ou retirez la citation du texte. Un contrat qui vise un texte non vérifié est '
        + 'contestable.</div>');
    }

    if (v.mention_juriste) {
      blocs.push('<div class="avertissement">' + e(MENTION_JURISTE)
        + ' Une ou plusieurs références citées ne sont pas confirmées.</div>');
    }

    if (v.ruptures_chaine && v.ruptures_chaine.length > 0) {
      blocs.push('<div class="erreur"><strong>Intégrité de l’historique compromise :</strong> '
        + e(v.ruptures_chaine.map(function (r) {
          return 'version ' + r.version + ' — ' + r.motif;
        }).join(' ; ')) + '</div>');
    }

    // ── En-tête ──
    blocs.push(ED.panneau(d.reference + ' — ' + d.titre,
      '<div class="grille-kpi">'
      + '<div class="kpi"><div class="libelle">Statut</div><div class="valeur" style="font-size:19px">'
      + pastille(d.statut) + '</div></div>'
      + '<div class="kpi"><div class="libelle">Version</div><div class="valeur">'
      + ED.nombre(d.version_courante) + '</div></div>'
      + '<div class="kpi"><div class="libelle">Rédigé par</div><div class="valeur" style="font-size:15px">'
      + e([d.redacteur_prenom, d.redacteur_nom].filter(Boolean).join(' ') || '—')
      + '</div></div>'
      + '<div class="kpi"><div class="libelle">Approuvé par</div><div class="valeur" style="font-size:15px">'
      + e([d.approbateur_prenom, d.approbateur_nom].filter(Boolean).join(' ') || '—')
      + '</div><div class="base">' + ED.dateCourte(d.approuve_le) + '</div></div>'
      + '</div>'
      + (v.filigrane
        ? '<p class="meta"><strong>Ce document s’exporte avec le filigrane « '
          + e(v.filigrane) + ' ».</strong></p>'
        : '')
      + (d.genere_par_ia
        ? '<p class="meta">Une version au moins a été rédigée avec assistance automatique. '
          + 'La mention figure sur le document exporté.</p>'
        : ''),
      { sousTitre: 'Modèle ' + e(d.template_code || '—') + ' v' + e(d.template_version || '—') }));

    // ── Actions : exactement celles que le serveur accepterait ──
    blocs.push(ED.panneau('Actions', boutonsActions(v)));

    // ── Corps ──
    blocs.push(ED.panneau('Texte',
      '<textarea id="docCorps" rows="20" spellcheck="true"'
      + (peutEditer(d) ? '' : ' readonly') + '>' + e(v.corps) + '</textarea>'
      + (peutEditer(d)
        ? '<div class="barre-actions">'
          + '<input type="text" id="docMotif" placeholder="Motif de la modification" maxlength="200"> '
          + '<button class="action" id="docEnregistrer">Enregistrer une version</button> '
          + '<button class="action secondaire" id="docRafraichir">Recharger les données réelles</button> '
          + '<button class="action secondaire" id="docRediger">Brouillon assisté</button>'
          + '</div>'
          + '<p class="meta" id="docCorpsMsg"></p>'
        : '<p class="meta">Un document « ' + e(LIBELLE_STATUT[d.statut] || d.statut)
          + ' » ne se modifie pas. Rouvrez-le pour correction : la réouverture est tracée.</p>')));

    blocs.push(panneauVersions(v));
    blocs.push(panneauReferences(v));
    blocs.push(panneauCommentaires(v));
    blocs.push(panneauExport(d));

    detail.innerHTML = blocs.join('');
    brancherDetail(v);
  }

  function peutEditer(d) {
    return ['brouillon', 'en_revision', 'corrections_demandees'].indexOf(d.statut) !== -1;
  }

  function boutonsActions(v) {
    if (!v.actions || v.actions.length === 0) {
      return '<div class="etat-vide">Aucune action possible depuis cet état.</div>';
    }
    return '<div class="barre-actions">' + v.actions.map(function (a) {
      // Le motif de refus est porté par le bouton lui-même : un bouton grisé muet est
      // une impasse pour celui qui le voit.
      return '<button class="action' + (a.autorise ? '' : ' secondaire')
        + '" data-transition="' + e(a.vers) + '"'
        + (a.autorise ? '' : ' disabled title="' + e(a.motif || '') + '"')
        + '>' + e(a.libelle) + '</button>';
    }).join(' ') + '</div>'
      + '<ul class="compact" style="margin-top:10px">'
      + v.actions.filter(function (a) { return !a.autorise && a.motif; }).map(function (a) {
        return '<li><strong>' + e(a.libelle) + '</strong> — ' + e(a.motif) + '</li>';
      }).join('') + '</ul>';
  }

  function panneauVersions(v) {
    var lignes = (v.versions || []).map(function (ver) {
      return '<tr>'
        + '<td>' + ED.nombre(ver.version) + '</td>'
        + '<td>' + e(ver.origine === 'ia' ? 'assistée' : 'humaine') + '</td>'
        + '<td>' + e([ver.auteur_prenom, ver.auteur_nom].filter(Boolean).join(' ') || '—') + '</td>'
        + '<td>' + e(ver.motif || '—') + '</td>'
        + '<td>' + ED.dateHeure(ver.created_at) + '</td>'
        + '<td><code style="font-size:11px">' + e(String(ver.empreinte).slice(0, 12)) + '…</code></td>'
        + '</tr>';
    }).join('');

    var options = (v.versions || []).map(function (ver) {
      return '<option value="' + e(ver.version) + '">v' + e(ver.version) + '</option>';
    }).join('');

    return ED.panneau('Versions',
      ED.tableau(['#', 'Origine', 'Auteur', 'Motif', 'Date', 'Empreinte'], lignes,
        { vide: 'Aucune version.' })
      + (v.versions && v.versions.length > 1
        ? '<div class="barre-actions">Comparer '
          + '<select id="docVerA">' + options + '</select> à '
          + '<select id="docVerB">' + options + '</select> '
          + '<button class="action secondaire" id="docComparer">Comparer</button></div>'
          + '<div id="docDiff"></div>'
        : ''),
      { sousTitre: 'Chaque version est chaînée à la précédente par son empreinte. '
        + 'Modifier ou supprimer une version passée casse la chaîne, et la base le refuse.' });
  }

  function panneauReferences(v) {
    var lignes = (v.references || []).map(function (r) {
      return '<tr>'
        + '<td><strong>' + e(r.texte) + '</strong></td>'
        + '<td>' + e(r.organisme || '—') + '</td>'
        + '<td>' + (r.source_url
          ? '<a href="' + e(r.source_url) + '" target="_blank" rel="noopener noreferrer">source</a>'
          : '—') + '</td>'
        + '<td>' + ED.dateCourte(r.consulte_le) + '</td>'
        + '<td>' + e(r.niveau_confiance) + '</td>'
        + '<td>' + (r.verifie_par_juriste
          ? 'oui'
          : '<span style="color:var(--alerte,#b45309)">non</span>') + '</td>'
        + '</tr>';
    }).join('');

    return ED.panneau('Références juridiques',
      ED.tableau(['Texte', 'Organisme', 'Source', 'Consultée le', 'Confiance', 'Vérifiée'],
        lignes, { vide: 'Aucune référence déclarée.' })
      + (peutEditer(v.document)
        ? '<form id="docRefForm" class="formulaire">'
          + '<label>Intitulé exact du texte<input type="text" name="texte" required maxlength="250" '
          + 'placeholder="Loi n° 015/2002 portant Code du travail"></label>'
          + '<label>Organisme<input type="text" name="organisme" maxlength="160" '
          + 'placeholder="Journal Officiel de la RDC"></label>'
          + '<label>Lien vers la source<input type="url" name="source_url" required '
          + 'placeholder="https://…"></label>'
          + '<label>Date du texte<input type="date" name="date_texte"></label>'
          + '<label>Date de consultation<input type="date" name="consulte_le" required></label>'
          + '<label>Niveau de confiance<select name="niveau_confiance">'
          + '<option value="faible">faible</option><option value="moyen">moyen</option>'
          + '<option value="eleve">élevé</option></select></label>'
          + '<button type="submit" class="action">Déclarer la référence</button>'
          + '<p class="meta" id="docRefMsg"></p>'
          + '</form>'
        : ''),
      { sousTitre: 'Une citation juridique du texte doit correspondre à une référence '
        + 'déclarée ici, avec sa source et sa date de consultation. Sans cela, '
        + 'l’approbation est refusée.' });
  }

  function panneauCommentaires(v) {
    var lignes = (v.commentaires || []).map(function (c) {
      return '<tr' + (c.resolu ? ' style="opacity:.55"' : '') + '>'
        + '<td>' + e(c.corps) + (c.ancrage ? '<br><small>« ' + e(c.ancrage) + ' »</small>' : '') + '</td>'
        + '<td>' + e([c.auteur_prenom, c.auteur_nom].filter(Boolean).join(' ') || '—') + '</td>'
        + '<td>' + ED.dateCourte(c.created_at) + '</td>'
        + '<td>' + (c.resolu ? 'résolu'
          : '<button class="action secondaire" data-resoudre="' + e(c.id) + '">Résoudre</button>')
        + '</td></tr>';
    }).join('');

    return ED.panneau('Révision',
      ED.tableau(['Commentaire', 'Auteur', 'Date', ''], lignes,
        { vide: 'Aucun commentaire.' })
      + '<form id="docCommentForm" class="formulaire">'
      + '<label>Commentaire<textarea name="corps" rows="3" required maxlength="4000"></textarea></label>'
      + '<label>Passage visé <small>(facultatif)</small>'
      + '<input type="text" name="ancrage" maxlength="200"></label>'
      + '<button type="submit" class="action">Commenter</button>'
      + '<p class="meta" id="docCommentMsg"></p>'
      + '</form>',
      { sousTitre: v.commentaires_ouverts > 0
        ? v.commentaires_ouverts + ' commentaire(s) non résolu(s) — l’approbation est bloquée tant qu’il en reste.'
        : 'Aucun commentaire ouvert.' });
  }

  function panneauExport(d) {
    return ED.panneau('Export',
      '<div class="barre-actions">'
      + '<button class="action" data-export="pdf">Télécharger en PDF</button> '
      + '<button class="action" data-export="docx">Télécharger en DOCX</button>'
      + '</div>'
      + '<p class="meta" id="docExportMsg">'
      + (['approuve', 'signe'].indexOf(d.statut) === -1
        ? 'Le fichier portera le filigrane « brouillon » : un document non approuvé ne '
          + 'doit pas pouvoir circuler en se faisant passer pour un texte validé.'
        : 'Le fichier porte la référence, la version et l’empreinte, pour rattacher un '
          + 'exemplaire papier à sa version exacte.')
      + '</p>');
  }

  // ════════════════════════════════════════
  // Branchements du détail
  // ════════════════════════════════════════

  function brancherDetail(v) {
    var id = etat.documentId;
    var detail = document.getElementById('docDetail');

    Array.prototype.forEach.call(detail.querySelectorAll('[data-transition]'), function (b) {
      if (b.disabled) return;
      b.addEventListener('click', function () { transiter(b, b.getAttribute('data-transition')); });
    });

    var enregistrer = document.getElementById('docEnregistrer');
    if (enregistrer) {
      enregistrer.addEventListener('click', function () {
        appelBouton(enregistrer, 'docCorpsMsg',
          API.post('/api/documents/' + id + '/versions', {
            corps: document.getElementById('docCorps').value,
            motif: document.getElementById('docMotif').value || null,
          }), 'Version enregistrée.');
      });
    }

    var rafraichir = document.getElementById('docRafraichir');
    if (rafraichir) {
      rafraichir.addEventListener('click', function () {
        appelBouton(rafraichir, 'docCorpsMsg',
          API.post('/api/documents/' + id + '/donnees', {}),
          'Données rechargées depuis la base.');
      });
    }

    var rediger = document.getElementById('docRediger');
    if (rediger) rediger.addEventListener('click', function () { brouillonAssiste(rediger); });

    var comparer = document.getElementById('docComparer');
    if (comparer) {
      comparer.addEventListener('click', function () {
        var a = document.getElementById('docVerA').value;
        var b = document.getElementById('docVerB').value;
        var zone = document.getElementById('docDiff');
        zone.innerHTML = ED.squelette(3);
        API.get('/api/documents/' + id + '/comparaison?de=' + a + '&vers=' + b)
          .then(function (diff) { zone.innerHTML = rendreDiff(diff); })
          .catch(function (err) { ED.afficherErreur(zone, err); });
      });
    }

    var refForm = document.getElementById('docRefForm');
    if (refForm) {
      refForm.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var corps = {};
        ['texte', 'organisme', 'source_url', 'date_texte', 'consulte_le', 'niveau_confiance']
          .forEach(function (c) { if (ev.target.elements[c].value) corps[c] = ev.target.elements[c].value; });
        appelBouton(ev.target.querySelector('button'), 'docRefMsg',
          API.post('/api/documents/' + id + '/references', corps), 'Référence déclarée.');
      });
    }

    var commentForm = document.getElementById('docCommentForm');
    if (commentForm) {
      commentForm.addEventListener('submit', function (ev) {
        ev.preventDefault();
        appelBouton(ev.target.querySelector('button'), 'docCommentMsg',
          API.post('/api/documents/' + id + '/commentaires', {
            corps: ev.target.elements.corps.value,
            ancrage: ev.target.elements.ancrage.value || null,
          }), 'Commentaire ajouté.');
      });
    }

    Array.prototype.forEach.call(detail.querySelectorAll('[data-resoudre]'), function (b) {
      b.addEventListener('click', function () {
        appelBouton(b, 'docCommentMsg',
          API.post('/api/documents/' + id + '/commentaires/' + b.getAttribute('data-resoudre') + '/resoudre', {}),
          'Commentaire résolu.');
      });
    });

    Array.prototype.forEach.call(detail.querySelectorAll('[data-export]'), function (b) {
      b.addEventListener('click', function () { telecharger(b, b.getAttribute('data-export')); });
    });

    void v;
  }

  function rendreDiff(diff) {
    var couleur = {
      ajoute: 'background:rgba(22,163,74,.14)',
      retire: 'background:rgba(220,38,38,.14);text-decoration:line-through',
      inchange: '',
    };
    var signe = { ajoute: '+', retire: '−', inchange: ' ' };

    return ED.panneau('Différences v' + diff.de + ' → v' + diff.vers,
      '<pre style="white-space:pre-wrap;font-size:12.5px;line-height:1.55">'
      + diff.lignes.map(function (l) {
        return '<span style="display:block;' + couleur[l.type] + '">'
          + signe[l.type] + ' ' + e(l.texte || ' ') + '</span>';
      }).join('') + '</pre>',
      { sousTitre: diff.ajoutees + ' ligne(s) ajoutée(s), ' + diff.retirees + ' retirée(s)' });
  }

  /**
   * Un appel déclenché par un bouton.
   *
   * Désactive pendant l'appel (double clic), affiche le message du serveur tel quel, et
   * RECHARGE le document après succès : l'écran doit montrer l'état réel, pas celui qu'on
   * espérait obtenir.
   */
  function appelBouton(bouton, cibleMsg, promesse, succes) {
    if (bouton.disabled) return;
    var texte = bouton.textContent;
    bouton.disabled = true;
    bouton.textContent = 'En cours…';

    var msg = document.getElementById(cibleMsg);
    if (msg) msg.textContent = '';

    promesse.then(function () {
      if (msg) msg.textContent = succes;
      ouvrir(etat.documentId);
      listerEtRendre();
    }).catch(function (err) {
      if (msg) msg.innerHTML = '<span class="erreur">' + e(err.message) + '</span>';
      bouton.disabled = false;
      bouton.textContent = texte;
    });
  }

  function transiter(bouton, vers) {
    var corps = {};

    if (vers === 'signe') {
      var mode = global.prompt(
        'Mode de signature (manuscrite, electronique_externe…).\n\n'
        + 'La plateforme ENREGISTRE une signature ; elle ne la produit pas.'
      );
      if (!mode) return;
      corps.signe_mode = mode;
    }

    if (['archive', 'corrections_demandees', 'brouillon'].indexOf(vers) !== -1) {
      var motif = global.prompt('Motif (facultatif) :');
      if (motif) corps.motif = motif;
    }

    if (bouton.disabled) return;
    var texte = bouton.textContent;
    bouton.disabled = true;
    bouton.textContent = 'En cours…';

    API.post('/api/documents/' + etat.documentId + '/transitions',
      Object.assign({ vers: vers }, corps))
      .then(function () { ouvrir(etat.documentId); listerEtRendre(); })
      .catch(function (err) {
        bouton.disabled = false;
        bouton.textContent = texte;
        global.alert(err.message);
      });
  }

  function brouillonAssiste(bouton) {
    var msg = document.getElementById('docCorpsMsg');
    bouton.disabled = true;
    bouton.textContent = 'Rédaction…';
    msg.textContent = 'Le brouillon est produit puis affiché. Rien n’est enregistré tant '
      + 'que vous n’avez pas relu et cliqué sur « Enregistrer une version ».';

    var instructions = global.prompt('Consignes pour la rédaction (facultatif) :') || null;

    API.post('/api/documents/' + etat.documentId + '/rediger', {
      instructions: instructions,
      reprendre_texte: true,
    }).then(function (r) {
      document.getElementById('docCorps').value = r.corps;
      document.getElementById('docMotif').value = 'Brouillon assisté, relu avant enregistrement';

      var notes = [];
      if (r.citations_a_justifier && r.citations_a_justifier.length > 0) {
        notes.push('<strong>Références citées, à justifier avant approbation :</strong> '
          + e(r.citations_a_justifier.join(' ; ')));
      }
      if (r.marqueurs_restants && r.marqueurs_restants.length > 0) {
        notes.push('<strong>Marqueurs restés en place :</strong> '
          + e(r.marqueurs_restants.join(', ')) + ' — c’est voulu : ces données manquent.');
      }
      if (r.points_a_verifier) {
        notes.push('<strong>Points à vérifier :</strong><br>' + e(r.points_a_verifier));
      }
      notes.push('Relisez le texte, puis enregistrez-le comme version.');

      msg.innerHTML = notes.join('<br>');
      bouton.disabled = false;
      bouton.textContent = 'Brouillon assisté';
    }).catch(function (err) {
      // « non configuré » et « budget épuisé » ne sont pas des pannes : le message du
      // serveur dit quoi faire, et la rédaction manuelle reste disponible.
      msg.innerHTML = '<span class="erreur">' + e(err.message) + '</span>';
      bouton.disabled = false;
      bouton.textContent = 'Brouillon assisté';
    });
  }

  /**
   * Téléchargement d'un export.
   *
   * `EnviroAPI` analyse les réponses en JSON ; un PDF n'en est pas un. L'appel se fait
   * donc en `fetch` direct, avec le jeton, et le fichier passe par un blob.
   */
  function telecharger(bouton, format) {
    var msg = document.getElementById('docExportMsg');
    var texte = bouton.textContent;
    bouton.disabled = true;
    bouton.textContent = 'Préparation…';

    fetch(API.BASE_URL + '/api/documents/' + etat.documentId + '/export/' + format, {
      headers: { Authorization: 'Bearer ' + API.Session.accessToken() },
    }).then(function (r) {
      if (!r.ok) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          throw new Error(j.message || ('Export impossible (' + r.status + ').'));
        });
      }
      var nom = 'document.' + format;
      var cd = r.headers.get('Content-Disposition') || '';
      var trouve = /filename="([^"]+)"/.exec(cd);
      if (trouve) nom = trouve[1];
      return r.blob().then(function (b) { return { blob: b, nom: nom }; });
    }).then(function (f) {
      var url = URL.createObjectURL(f.blob);
      var lien = document.createElement('a');
      lien.href = url;
      lien.download = f.nom;
      document.body.appendChild(lien);
      lien.click();
      document.body.removeChild(lien);
      URL.revokeObjectURL(url);
      bouton.disabled = false;
      bouton.textContent = texte;
    }).catch(function (err) {
      msg.innerHTML = '<span class="erreur">' + e(err.message) + '</span>';
      bouton.disabled = false;
      bouton.textContent = texte;
    });
  }

  global.EspaceDocuments = {
    vue: vue,
    ouvrir: ouvrir,
    LIBELLE_STATUT: LIBELLE_STATUT,
    MENTION_JURISTE: MENTION_JURISTE,
  };
}(window));
