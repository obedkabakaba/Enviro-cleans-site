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
