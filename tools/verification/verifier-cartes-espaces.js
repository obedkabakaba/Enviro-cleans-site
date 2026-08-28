#!/usr/bin/env node
/**
 * ════════════════════════════════════════
 * CARTES DES ESPACES — vérification de structure (§11)
 * ════════════════════════════════════════
 *
 * Trois régressions silencieuses, qu'aucune vérification de syntaxe ne verrait :
 *
 *   1. un conteneur de carte sans hauteur minimale. MapLibre dessine alors un canevas de
 *      zéro pixel et ne le corrige jamais seul : la page se charge, la carte est
 *      invisible, et rien dans la console ne le dit ;
 *   2. la perte de la libération d'instance. Les contextes WebGL s'accumulent à chaque
 *      aller-retour entre deux menus, jusqu'à ce que le navigateur commence à en
 *      détruire au hasard — la carte « marche », puis « ne marche plus » ;
 *   3. l'apparition d'une coordonnée inventée pour ce qui n'en a pas. C'est ce que le
 *      §11 interdit explicitement, et c'est la régression la plus coûteuse : un point
 *      faux se lit exactement comme un point vrai.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const racine = path.join(__dirname, '..', '..');
const lire = (p) => fs.readFileSync(path.join(racine, p), 'utf8');

const carte = lire('assets/js/carte-maplibre.js');
const vues = lire('assets/js/espace-carte.js');
const css = lire('assets/css/espace-direction.css');

assert.doesNotThrow(() => new Function(vues), 'espace-carte.js doit être valide');

// ── 1. Les conteneurs ont une hauteur ──
for (const id of ['carteMarketingKinshasa', 'carteDgaKinshasa']) {
  assert.ok(css.includes('#' + id),
    `#${id} n'a pas de hauteur minimale : la carte serait invisible sans aucune erreur`);
}
assert.match(css, /min-height:\s*420px/,
  'la hauteur minimale des cartes a disparu de la feuille partagée');

// ── 2. Le cycle de vie de l'instance ──
assert.match(carte, /libererConteneur\(el\);/,
  'la carte doit libérer l’instance précédente : sinon les contextes WebGL s’accumulent');
assert.match(carte, /new ResizeObserver/,
  'sans observateur de taille, une carte ouverte dans un menu masqué reste un carré vide');
assert.match(carte, /carte\.resize\(\)/,
  'l’équivalent MapLibre de invalidateSize() doit être appelé quand le conteneur grandit');
assert.match(carte, /attendreDimensions/,
  'la carte doit attendre que son conteneur ait des dimensions réelles');
assert.match(carte, /carte\.remove\(\)/,
  'l’instance précédente doit être réellement détruite');

// ── 3. Aucune coordonnée inventée ──
assert.match(vues, /Géolocalisation manquante/,
  'la liste des non-géolocalisés doit rester à l’écran');
assert.match(vues, /jamais placés à un point inventé|jamais placées sur la carte/,
  'l’écran doit dire pourquoi certaines entités ne sont pas placées');
assert.doesNotMatch(vues, /(latitude|longitude)\s*[:=]\s*(0|\d+\.\d+)\b/,
  'aucune coordonnée ne doit être écrite en dur dans les vues');
assert.doesNotMatch(vues, /centre[^\n]{0,30}(zone|commune)[^\n]{0,20}(coordonn|latitude)/i,
  'placer une entité au centre de sa zone revient à inventer un point');

// ── 4. Les deux espaces sont branchés ──
for (const [page, appel] of [
  ['direction-marketing.html', 'EspaceCarte.marketing'],
  ['direction-generale-adjointe.html', 'EspaceCarte.dga'],
]) {
  const html = lire(page);
  assert.match(html, /assets\/js\/carte-config\.js/, `${page} : carte-config.js absent`);
  assert.match(html, /assets\/js\/carte-maplibre\.js/, `${page} : carte-maplibre.js absent`);
  assert.match(html, /assets\/js\/espace-carte\.js/, `${page} : espace-carte.js absent`);
  assert.match(html, /data-vue="carte"/, `${page} : entrée de menu « carte » absente`);
  assert.ok(html.includes(appel), `${page} : la vue n'appelle pas ${appel}`);

  // Le module de vues dépend de CarteInteractive : l'ordre de chargement compte.
  assert.ok(
    html.indexOf('assets/js/carte-maplibre.js') < html.indexOf('assets/js/espace-carte.js'),
    `${page} : espace-carte.js doit être chargé après carte-maplibre.js`
  );
}

console.log('Cartes des espaces : hauteur, cycle de vie et absence de faux points vérifiés.');

// ── Les fonctions cartographiques attendues (§3 de la mission de clôture) ──
//
// Chacune correspond à un geste réel sur une carte de terrain. Les vérifier ici attrape
// la régression silencieuse : une couche retirée, une recherche débranchée, un
// regroupement désactivé — la carte s'affiche toujours, elle sert simplement moins.
const sourceCarte = lire('assets/js/carte-maplibre.js');

// Regroupement : sans lui, quatre cents clients d'une commune forment un amas illisible.
assert.match(sourceCarte, /cluster:\s*true/, 'le regroupement des marqueurs doit être activé');
assert.match(sourceCarte, /clusterMaxZoom/, 'le dégroupement au zoom doit être borné');
assert.match(sourceCarte, /point_count_abbreviated/,
  'un agrégat sans compteur ne dit pas combien de points il cache');
assert.match(sourceCarte, /getClusterExpansionZoom/,
  'cliquer un agrégat doit le dégrouper : sans cela, un amas est une impasse');

// Recherche, plein écran, recentrage.
assert.match(sourceCarte, /carte-recherche/, 'la recherche cartographique doit exister');
// Plein écran et vue d'ensemble sont dans la barre COMMUNE : placés dans les contrôles
// MapLibre, ils n'existeraient que lorsque le fichier de fond est déposé — c'est-à-dire
// jamais tant que `carte-config.js` n'est pas renseigné.
assert.match(sourceCarte, /class="carte-pleinecran"/, 'le plein écran doit être dans la barre');
assert.match(sourceCarte, /document\.exitFullscreen/, 'la SORTIE du plein écran doit exister');
assert.match(sourceCarte, /'fullscreenchange'/,
  'le libellé du bouton doit suivre une sortie par Échap');
assert.match(sourceCarte, /class="carte-ensemble"/, 'le retour à la vue globale doit exister');
assert.match(sourceCarte, /vueDEnsemble/, 'la vue globale doit recadrer aussi en mode fond de plan');
assert.match(sourceCarte, /Recentrer sans changer le zoom/, 'le recentrage doit exister');

// Couches et légende.
assert.match(sourceCarte, /CATEGORIES\s*=/, 'les couches métier doivent être déclarées');
for (const couche of ['client', 'prospect', 'incident', 'collecteur', 'vehicule',
  'collecte_reussie', 'collecte_manquee', 'zone']) {
  assert.ok(new RegExp(`\\b${couche}:\\s*\\{`).test(sourceCarte),
    `la couche « ${couche} » n'est pas déclarée`);
}
assert.match(sourceCarte, /carte-legende-item/, 'la légende doit être cliquable pour filtrer');

// Popups au CLIC : au survol, la bulle disparaît au moindre mouvement et ne se lit pas.
assert.match(sourceCarte, /closeButton:\s*true/,
  'la bulle ouverte au clic doit rester jusqu’à ce qu’on la ferme');
assert.match(sourceCarte, /c\.on\('click', 'arrets-point'/, 'le clic sur un point doit ouvrir sa fiche');

// Itinéraires : tracé, ordre des arrêts, sélection.
assert.match(sourceCarte, /tournees-trace/, 'le tracé des tournées doit exister');
assert.match(sourceCarte, /tournees-ordre/, 'l’ordre des arrêts doit pouvoir s’afficher');
assert.match(sourceCarte, /selectionnerTournee/, 'une tournée doit pouvoir être sélectionnée');

// Le compteur ne doit jamais mentir : masquer une couche recharge la source, sinon un
// agrégat continuerait de compter des points invisibles.
assert.match(sourceCarte, /getSource\('arrets'\)\.setData/,
  'masquer une couche doit recharger la source, sinon le compteur d’agrégat ment');

// ── La vue Géolocalisation et sa commande de correction ──
//
// La carte Marketing renvoyait vers une vue « Géolocalisation » de l'espace Opérations
// qui N'EXISTAIT PAS. Un renvoi vers un écran absent fait chercher, puis douter, puis
// renoncer.
const ops = lire('direction-operations-commerciales.html');
assert.match(ops, /data-vue="geolocalisation"/, 'la vue Géolocalisation doit exister');
assert.match(ops, /geolocalisation: vueGeolocalisation/, 'elle doit être routée');
assert.match(ops, /\/api\/locations\/stats\/coverage/, 'elle doit lire la couverture réelle');
assert.match(ops, /Session\.peut\('location\.manage'\)/,
  'la commande de correction doit dépendre de la permission, pas du rôle');
assert.match(ops, /modification_reason/,
  'corriger une position existante doit exiger un motif : sans lui, l’historique ne se relit pas');
assert.match(ops, /sortent de la région de\s*'\s*\+\s*'Kinshasa|sortent de la région de Kinshasa/,
  'des coordonnées hors région doivent être refusées : une inversion lat/lon place le '
  + 'client en Afrique de l’Ouest sans que rien ne le signale');

console.log('Fonctions cartographiques : regroupement, recherche, couches, plein écran, '
  + 'itinéraires et géolocalisation vérifiés.');
