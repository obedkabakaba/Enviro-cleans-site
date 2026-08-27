#!/usr/bin/env node
/**
 * ════════════════════════════════════════
 * BARRE DE COMMANDES — vérification de structure
 * ════════════════════════════════════════
 *
 * Trois régressions qu'aucune vérification de syntaxe ne verrait :
 *
 *   1. des boutons d'action écrits en dur dans la page. Ils divergent toujours du
 *      serveur : on ajoute une étape au circuit et l'écran propose encore l'ancienne ;
 *   2. la perte du motif de refus. Un bouton grisé muet est une impasse — l'utilisateur
 *      ne sait ni pourquoi, ni quoi faire ;
 *   3. la disparition du rechargement après commande. L'écran afficherait alors l'état
 *      qu'on espérait, pas celui que le serveur a réellement écrit.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const racine = path.join(__dirname, '..', '..');
const lire = (p) => fs.readFileSync(path.join(racine, p), 'utf8');

const cmd = lire('assets/js/espace-commandes.js');
const res = lire('assets/js/espace-ressources.js');

assert.doesNotThrow(() => new Function(cmd), 'espace-commandes.js doit être valide');

// ── Les actions viennent du serveur ──
assert.match(cmd, /\/actions/, 'la barre doit demander les actions au serveur');
assert.match(cmd, /vue\.actions\.filter/,
  'les boutons doivent être calculés depuis `actions[]`, pas écrits en dur');
assert.match(cmd, /transitions/, 'la commande doit poster sur /transitions');

// ── Le motif de refus reste lisible ──
assert.match(cmd, /a\.motif/, 'le motif de refus doit être rendu');
assert.match(cmd, /ul class="compact"/,
  'les motifs doivent apparaître en clair, pas seulement en infobulle : '
  + 'une infobulle ne se lit pas sur mobile');

// ── Anti-double-clic et rechargement ──
assert.match(cmd, /if \(bouton\.disabled\) return;/,
  'la barre doit se protéger du double clic : deux décaissements, ce sont deux sorties');
assert.match(cmd, /charger\(\);/, 'l’écran doit être rechargé depuis l’API après succès');

// ── Confirmation des actions qui engagent ──
assert.match(cmd, /a\.sensible|action\.sensible/,
  'les actions à effet doivent demander confirmation');

// ── Aucun succès simulé ──
assert.doesNotMatch(cmd, /innerHTML\s*=\s*['"`][^'"`]*succès/i,
  'aucun succès ne doit être affiché sans réponse du serveur');

// ── La fiche monte la barre et la garde ouverte ──
assert.match(res, /EspaceCommandes\.barre/, 'la fiche doit monter la barre de commandes');
assert.match(res, /commandesRessource/, 'le conteneur doit exister dans la fiche');
assert.match(res, /fiche\(data, id\)/,
  'après une commande, la fiche doit être rouverte : elle est effacée par le rendu de la '
  + 'liste, et l’utilisateur la verrait disparaître au moment où il vient d’agir dessus');

// ── Les six espaces chargent le module ──
const ESPACES = ['direction-financiere.html', 'direction-rh.html', 'direction-marketing.html',
  'direction-operations-commerciales.html', 'direction-generale-adjointe.html', 'pdg.html'];

for (const page of ESPACES) {
  const html = lire(page);
  assert.match(html, /assets\/js\/espace-commandes\.js/, `${page} : module absent`);
  assert.ok(
    html.indexOf('assets/js/espace-ressources.js') < html.indexOf('assets/js/espace-commandes.js'),
    `${page} : espace-commandes.js doit être chargé après espace-ressources.js`
  );
}

// ── Le circuit des tournées est réellement branché (migration 026) ──
//
// L'espace Opérations n'avait aucune commande : la liste des tournées était une
// consultation, et le cycle de vie déclaré côté serveur ne menait à aucun bouton. Trois
// choses doivent tenir ensemble, et deux sur trois ne servent à rien.
const ops = lire('direction-operations-commerciales.html');

assert.match(ops, /ressource: 'operations\/tournees'/,
  'la liste des tournées doit monter la barre de commandes du circuit');
assert.match(ops, /id="commandesTournee"/,
  'le conteneur de la barre doit exister dans la vue des tournées');
assert.match(ops, /apres: function \(\) \{ vueTournees\(page\); \}/,
  'après une commande, la liste doit être rechargée depuis l’API : sans cela l’écran '
  + 'montrerait l’état espéré, pas celui que le serveur a écrit');

// Les neuf états doivent être nommés en clair. Un statut brut affiché tel quel
// (« cloturee ») laisse l'utilisateur deviner, et « brouillon » ressemble alors à une
// panne plutôt qu'à une étape.
for (const etat of ['brouillon', 'validee', 'planifiee', 'en_cours', 'terminee',
  'cloturee', 'manquee', 'reportee', 'annulee']) {
  assert.ok(new RegExp(`${etat}:\\s*'`).test(ops),
    `direction-operations-commerciales.html : l'état « ${etat} » n'a pas de libellé lisible`);
}

// Les champs que le serveur exige aux transitions des tournées doivent avoir un libellé,
// sinon le formulaire demande « observations_cloture » à un directeur.
for (const champ of ['motif_report', 'report_vers_date', 'motif_annulation',
  'observations_cloture']) {
  assert.ok(cmd.indexOf(`${champ}:`) !== -1,
    `espace-commandes.js : le champ « ${champ} » n'a pas de libellé lisible`);
}

console.log(`Barre de commandes : ${ESPACES.length} espaces branchés, circuit des tournées `
  + 'branché, garde-fous vérifiés.');
