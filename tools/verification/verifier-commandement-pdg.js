#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const racine = path.join(__dirname, '..', '..');
const html = fs.readFileSync(path.join(racine, 'pdg.html'), 'utf8');
const ui = fs.readFileSync(path.join(racine, 'assets/js/pdg-commandement.js'), 'utf8');

assert.doesNotThrow(() => new Function(ui), 'pdg-commandement.js doit être syntaxiquement valide');
assert.match(html, /data-vue="commandement"/);
assert.match(html, /data-vue="directions"/);
assert.match(html, /data-vue="terrain"/);
assert.match(html, /assets\/js\/carte-config\.js/);
assert.match(html, /assets\/js\/carte-maplibre\.js/);
assert.match(html, /assets\/js\/pdg-commandement\.js/);
assert.match(ui, /\/api\/pdg\/directions\/.*\/nomination/);
assert.match(ui, /\/api\/pdg\/terrain\/carte/);
assert.match(ui, /\/api\/pdg\/terrain\/tournees/);
assert.match(ui, /data-page-tournees/);
assert.match(ui, /Promise\.allSettled/);
assert.match(ui, /CarteInteractive\.afficher\('cartePdgKinshasa'/);
assert.match(ui, /positions_vehicules/);
assert.match(ui, /disponible:\s*false/);
assert.doesNotMatch(ui, /position[^\n]{0,30}(invent|simul|estim)/i);

const scriptsInline = Array.from(html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi))
  .map((m) => m[1])
  .filter((source) => source.trim());
scriptsInline.forEach((source, i) => {
  assert.doesNotThrow(() => new Function(source), 'script inline #' + i);
});

console.log('Commandement PDG : structure, carte et scripts vérifiés.');
