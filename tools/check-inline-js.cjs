const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const files = fs.readdirSync(root).filter((name) => name.endsWith('.html')).sort();
const failures = [];
let checked = 0;

for (const file of files) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  const pattern = /<script([^>]*)>([\s\S]*?)<\/script>/gi;
  let match;
  let index = 0;
  while ((match = pattern.exec(html))) {
    index += 1;
    const attributes = match[1];
    const source = match[2].trim();
    if (!source || /\bsrc\s*=/.test(attributes) || /type\s*=\s*["']application\/(?:json|ld\+json)/i.test(attributes)) continue;
    checked += 1;
    try {
      new vm.Script(source, { filename: `${file}:inline-script-${index}` });
    } catch (error) {
      failures.push(error.message);
    }
  }
}

// Tous les scripts partagés, pas seulement ceux du thème. Une erreur de syntaxe dans un
// module chargé par plusieurs espaces les casse tous d'un coup, et ne se verrait sinon
// qu'à l'ouverture d'une page dans un navigateur.
for (const file of [
  'assets/js/theme-init.js',
  'assets/js/theme.js',
  'assets/js/enviro-api.js',
  'assets/js/enviro-auth.js',
  'assets/js/enviro-session-compat.js',
  'assets/js/espace-direction.js',
]) {
  if (!fs.existsSync(path.join(root, file))) continue;
  checked += 1;
  try {
    new vm.Script(fs.readFileSync(path.join(root, file), 'utf8'), { filename: file });
  } catch (error) {
    failures.push(error.message);
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`Validated ${checked} JavaScript blocks.`);
