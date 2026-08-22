/**
 * Vérifie la syntaxe du JavaScript embarqué dans chaque page HTML.
 *
 * Le site n'a pas de build : une parenthèse manquante dans `pdg.html` ne se voit qu'à
 * l'ouverture de la page, par l'utilisateur, sous la forme d'un écran vide. Aucun outil
 * ne l'attrape avant — sauf celui-ci.
 *
 * Chaque bloc <script> sans `src` est extrait et soumis à `new Function()`, qui analyse
 * sans exécuter. Les scripts externes sont ignorés : ils sont vérifiés séparément.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RACINE = path.join(__dirname, '..', '..');
const BLOC = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;

// Un bloc `type="application/json"` ou `type="text/template"` n'est pas du JavaScript.
const TYPE_NON_JS = /type\s*=\s*["'](?!text\/javascript|module|application\/javascript)/i;

let fichiers = 0;
let blocs = 0;
const echecs = [];

for (const nom of fs.readdirSync(RACINE).filter((f) => f.endsWith('.html'))) {
  const source = fs.readFileSync(path.join(RACINE, nom), 'utf8');
  fichiers += 1;

  let m;
  let index = 0;
  BLOC.lastIndex = 0;
  while ((m = BLOC.exec(source)) !== null) {
    index += 1;
    const balise = m[0].slice(0, m[0].indexOf('>') + 1);
    if (TYPE_NON_JS.test(balise)) continue;

    const code = m[1];
    if (!code.trim()) continue;
    blocs += 1;

    // Le numéro de ligne du bloc dans le fichier, pour que l'erreur soit situable.
    const ligne = source.slice(0, m.index).split('\n').length;

    try {
      // `new vm.Script` analyse sans exécuter — un module qui appelle `document` au
      // chargement ne doit pas faire échouer un contrôle de syntaxe.
      // eslint-disable-next-line no-new
      new vm.Script(code, { filename: `${nom}:${ligne}` });
    } catch (err) {
      echecs.push(`${nom} — bloc ${index} (ligne ${ligne}) : ${err.message}`);
    }
  }
}

if (echecs.length) {
  console.error('Erreurs de syntaxe :');
  for (const e of echecs) console.error(`  ✗ ${e}`);
  process.exit(1);
}

console.log(`✓ ${blocs} bloc(s) de script dans ${fichiers} page(s) — syntaxe valide.`);
