#!/usr/bin/env node
/**
 * ════════════════════════════════════════
 * ESPACE DOCUMENTAIRE — vérification de structure
 * ════════════════════════════════════════
 *
 * Ce que ce contrôle attrape, et qu'aucune vérification de syntaxe ne verrait :
 *
 *   - un espace de direction où le module est chargé mais où l'entrée de menu manque,
 *     ou l'inverse — l'écran existe et personne ne peut y aller ;
 *   - un bouton d'action qui ne viendrait plus de `actions[]`, donc que le serveur
 *     refuserait ;
 *   - la disparition d'un des trois avertissements qui ne doivent jamais quitter
 *     l'écran : données manquantes, citations sans source, filigrane.
 *
 * Ce sont des régressions silencieuses : la page se charge, elle est simplement devenue
 * inutile ou mensongère.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const racine = path.join(__dirname, '..', '..');
const ui = fs.readFileSync(path.join(racine, 'assets/js/espace-documents.js'), 'utf8');

assert.doesNotThrow(() => new Function(ui), 'espace-documents.js doit être syntaxiquement valide');

// ── Les six espaces branchés ──
const ESPACES = [
  'direction-rh.html',
  'direction-financiere.html',
  'direction-marketing.html',
  'direction-operations-commerciales.html',
  'direction-generale-adjointe.html',
  'pdg.html',
];

for (const page of ESPACES) {
  const html = fs.readFileSync(path.join(racine, page), 'utf8');

  assert.match(html, /assets\/js\/espace-documents\.js/,
    `${page} : le module documentaire n'est pas chargé`);
  assert.match(html, /data-vue="documents"/,
    `${page} : entrée de menu « documents » absente — l'écran existe et personne ne peut y aller`);
  assert.match(html, /data-permission="document\.read"/,
    `${page} : l'entrée de menu doit être masquée sans la permission`);
  assert.match(html, /documents: function \(\) \{ EspaceDocuments\.vue\(elContenu\); \}/,
    `${page} : la vue n'est pas routée`);

  // Le module doit être chargé APRÈS la boîte à outils dont il dépend.
  assert.ok(
    html.indexOf('assets/js/espace-direction.js') < html.indexOf('assets/js/espace-documents.js'),
    `${page} : espace-documents.js doit être chargé après espace-direction.js`
  );
}

// ── Le parcours du §17 est réellement appelé ──
for (const chemin of [
  '/api/documents/catalogue',
  '/api/documents/modeles',
  "'/api/documents/' + id + '/versions'",
  "'/api/documents/' + id + '/donnees'",
  "'/api/documents/' + id + '/references'",
  "'/api/documents/' + id + '/commentaires'",
  "'/api/documents/' + etat.documentId + '/transitions'",
  "'/api/documents/' + etat.documentId + '/rediger'",
  "'/api/documents/' + etat.documentId + '/export/'",
]) {
  assert.ok(ui.includes(chemin), `endpoint absent de l'écran : ${chemin}`);
}

// ── Les boutons viennent du serveur, pas d'une liste écrite en dur ──
assert.match(ui, /v\.actions\.map/,
  'les actions doivent venir de `actions[]`, calculé par la machine à états côté serveur');
assert.match(ui, /a\.autorise \? '' : ' disabled title="'/,
  'un bouton refusé doit porter son motif : un bouton grisé muet est une impasse');

// ── Les trois avertissements qui ne doivent jamais disparaître ──
assert.match(ui, /donnée\(s\) obligatoire\(s\) manquante\(s\)/,
  'les données manquantes doivent rester affichées : elles bloquent l’approbation');
assert.match(ui, /Référence\(s\) juridique\(s\) sans source/,
  'les citations orphelines doivent rester affichées');
assert.match(ui, /filigrane/,
  'le filigrane doit être annoncé : un brouillon exporté circule');
assert.ok(ui.includes('juriste compétent en droit congolais'),
  'la mention du juriste doit figurer à l’écran');

// ── Le double clic est bridé partout où il crée quelque chose ──
assert.match(ui, /if \(bouton\.disabled\) return;/,
  'les actions doivent se protéger du double clic');

// ── Rien n’est enregistré à la place de l’humain ──
assert.match(ui, /Rien n’est enregistré tant/,
  'la rédaction assistée doit dire explicitement qu’elle n’enregistre pas');
assert.doesNotMatch(ui, /signature[^\n]{0,40}(automatique|générée)/i,
  'la plateforme enregistre une signature, elle ne la produit pas');

// ── Tout ce qui vient de l’API est échappé ──
assert.ok(ui.includes('var e = ED.echapper;'),
  'l’échappement HTML doit être en place');

console.log(`Espace documentaire : ${ESPACES.length} espaces branchés, parcours et garde-fous vérifiés.`);
