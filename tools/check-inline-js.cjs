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

for (const file of ['assets/js/theme-init.js', 'assets/js/theme.js']) {
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
