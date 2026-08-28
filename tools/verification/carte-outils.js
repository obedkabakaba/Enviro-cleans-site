/**
 * Exerce la carte dans son mode NORMAL — celui sans fond de plan.
 *
 * `carte-config.js` livre `pmtiles: ''` : tant que le fichier de fond n'est pas déposé,
 * tout le monde voit le repli SVG. Une recherche, une légende ou un plein écran qui
 * n'existeraient que dans le mode MapLibre seraient donc des fonctions décoratives —
 * annoncées, jamais rencontrées. Ce contrôle vérifie qu'elles fonctionnent ICI.
 *
 * Le mode MapLibre, lui, est vérifié par `carte-maplibre-reel.js`.
 */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
for (const v of ['HTTPS_PROXY','HTTP_PROXY','https_proxy','http_proxy']) delete process.env[v];

const API = process.env.API_LOCAL || 'http://localhost:4000';
const WEB = process.env.SITE_LOCAL || 'http://127.0.0.1:5500';
const PROD = 'https://enviro-cleans-api.onrender.com';
const CAPTURES = process.env.CAPTURES || '/tmp/captures-carte';

async function connexion(email) {
  const r = await fetch(`${API}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifiant: email,
      mot_de_passe: process.env.MOT_DE_PASSE || 'MotDePasse123!' }),
  });
  if (!r.ok) throw new Error(`${email} : HTTP ${r.status} ${await r.text()}`);
  return r.json();
}

(async () => {
  require('node:fs').mkdirSync(CAPTURES, { recursive: true });
  const nav = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const ops = await connexion('directeur_operations_commerciales@dev.local');
  const ctx = await nav.newContext({ viewport: { width: 1440, height: 1000 } });

  await ctx.route(`${PROD}/**`, async (route) => {
    const q = route.request();
    const rep = await fetch(q.url().replace(PROD, API), {
      method: q.method(), headers: q.headers(),
      body: ['GET','HEAD'].includes(q.method()) ? undefined : q.postData(),
    });
    await route.fulfill({ status: rep.status,
      headers: Object.fromEntries(rep.headers.entries()),
      body: Buffer.from(await rep.arrayBuffer()) });
  });

  await ctx.addInitScript((s) => {
    localStorage.setItem('ec.accessToken', s.accessToken || s.token);
    localStorage.setItem('ec.refreshToken', s.refreshToken || '');
    localStorage.setItem('ec.user', JSON.stringify(s.user || {}));
    localStorage.setItem('ec.permissions', JSON.stringify(s.permissions || []));
  }, ops);

  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', e => erreurs.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') erreurs.push(m.text()); });

  const constats = []; let echecs = 0;
  const v = async (nom, fn) => {
    try { await fn(); constats.push(`  ✓ ${nom}`); }
    catch (e) { constats.push(`  ✗ ${nom}\n      ${String(e.message).split('\n')[0]}`); echecs++; }
  };

  await page.goto(`${WEB}/direction-operations-commerciales.html`, { waitUntil: 'networkidle' });

  // ── Géolocalisation ──
  await page.click('.menu a[data-vue="geolocalisation"]');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${CAPTURES}/geolocalisation.png`, fullPage: true });

  await v('la vue Géolocalisation charge la couverture réelle', async () => {
    const t = await page.textContent('#contenu');
    assert.ok(!/Chargement/.test(t), 'restée en chargement');
    assert.match(t, /Couverture GPS/);
    const st = await page.textContent('#sousTitre');
    assert.match(st, /géolocalisé/, `sous-titre : ${st}`);
  });

  await v('le directeur voit la liste mais PAS la commande de correction', async () => {
    // location.audit oui, location.manage non : voir sans corriger.
    assert.equal((await page.$$('[data-gps]')).length, 0,
      'le directeur ne doit pas pouvoir corriger une position depuis son bureau');
    assert.match(await page.textContent('#contenu'), /acte de terrain/);
  });

  await v('les filtres de couverture fonctionnent', async () => {
    await page.click('[data-geo-filtre="avec_gps"]');
    await page.waitForTimeout(1500);
    const t = await page.textContent('#contenu');
    assert.ok(/DEMO-C/.test(t), `aucun client géolocalisé listé : ${t.slice(0,200)}`);
  });

  // ── Carte ──
  await page.click('.menu a[data-vue="carte"]');
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${CAPTURES}/carte.png`, fullPage: true });

  await v('la barre d’outils de la carte est rendue', async () => {
    assert.ok(await page.$('.carte-recherche'), 'champ de recherche absent');
    assert.ok(await page.$('.carte-compte'), 'compteur de points absent');
  });

  await v('la recherche cartographique trouve un client', async () => {
    await page.fill('.carte-recherche', 'DEMO-C0003');
    await page.waitForTimeout(700);
    const res = await page.textContent('.carte-resultats');
    assert.match(res, /DEMO-C0003/, `résultats : ${res.slice(0,160)}`);
  });

  await v('la recherche sans résultat le dit avec le terme cherché', async () => {
    await page.fill('.carte-recherche', 'zzzzintrouvable');
    await page.waitForTimeout(700);
    assert.match(await page.textContent('.carte-resultats'), /zzzzintrouvable/);
    await page.fill('.carte-recherche', '');
  });

  await v('l’absence de fond de plan est expliquée AVANT la carte, en clair', async () => {
    const note = await page.$('.carte-note-fond');
    assert.ok(note, 'aucune note n’explique l’absence de fond de plan');

    // Sous la carte, il faut faire défiler tout le cadre pour la lire : le premier
    // réflexe devient « la carte ne s’affiche même pas ».
    const avant = await page.evaluate(() => {
      const n = document.querySelector('.carte-note-fond');
      const svg = document.querySelector('.carte-hote svg');
      if (!n || !svg) return null;
      return n.compareDocumentPosition(svg) & Node.DOCUMENT_POSITION_FOLLOWING ? true : false;
    });
    assert.equal(avant, true, 'la note doit précéder la carte, pas la suivre');

    const texte = await note.textContent();
    assert.doesNotMatch(texte, /carte-config\.js/,
      'renvoyer un directeur vers un fichier JavaScript ne lui apprend rien d’actionnable');
    assert.match(texte, /extraire-carte-kinshasa/, 'la marche à suivre doit être nommée');
  });

  await v('le compteur annonce le nombre réel de points', async () => {
    const t = await page.textContent('.carte-compte');
    assert.match(t, /\d+ \/ \d+ point\(s\) affiché\(s\)/, `compteur : ${t}`);
  });

  await v('la legende masque et reaffiche une couche', async () => {
    const items = await page.$$('.carte-legende-item');
    assert.ok(items.length >= 2, `legende : ${items.length} entree(s)`);
    const avant = await page.textContent('.carte-compte');
    await page.click('.carte-legende-item[data-cat="incident"]');
    await page.waitForTimeout(400);
    const pendant = await page.textContent('.carte-compte');
    assert.notEqual(pendant, avant, `le compteur n'a pas bouge : ${pendant}`);
    assert.ok(await page.$('.carte-legende-item[data-cat="incident"].masquee'));
    await page.click('.carte-legende-item[data-cat="incident"]');
    await page.waitForTimeout(400);
    assert.equal(await page.textContent('.carte-compte'), avant);
  });

  await v('selectionner une tournee filtre les points', async () => {
    const opts = await page.$$eval('.carte-tournee option', (o) => o.map((x) => x.value));
    const id = opts.find((x) => x !== '');
    assert.ok(id, `selecteur de tournee vide : ${JSON.stringify(opts)}`);
    const total = await page.textContent('.carte-compte');
    await page.selectOption('.carte-tournee', id);
    await page.waitForTimeout(500);
    const filtre = await page.textContent('.carte-compte');
    const [aff, tot] = filtre.match(/(\d+) \/ (\d+)/).slice(1).map(Number);
    assert.ok(aff < tot, `la selection n'a rien filtre : ${filtre} (avant ${total})`);
  });

  await v('« Vue d’ensemble » remet tout', async () => {
    await page.click('.carte-ensemble');
    await page.waitForTimeout(500);
    const t = await page.textContent('.carte-compte');
    const [aff, tot] = t.match(/(\d+) \/ (\d+)/).slice(1).map(Number);
    assert.equal(aff, tot, `tout n'est pas revenu : ${t}`);
    assert.equal(await page.inputValue('.carte-tournee'), '');
  });

  await v('le plein écran s’active et se quitte', async () => {
    const b = await page.$('.carte-pleinecran');
    assert.ok(b, 'bouton plein écran absent');
    assert.equal(await b.isDisabled(), false, 'bouton plein écran désactivé');
    await b.click();
    await page.waitForTimeout(600);
    assert.equal(await page.evaluate(() => document.fullscreenElement !== null), true,
      'le plein écran ne s’est pas activé');
    assert.match(await page.textContent('.carte-pleinecran'), /Quitter/);
    await page.click('.carte-pleinecran');
    await page.waitForTimeout(600);
    assert.equal(await page.evaluate(() => document.fullscreenElement !== null), false,
      'on ne peut pas sortir du plein écran');
    assert.match(await page.textContent('.carte-pleinecran'), /^Plein écran$/);
  });

  await page.screenshot({ path: `${CAPTURES}/carte-outils.png`, fullPage: true });

  await v('aucune erreur JavaScript', async () => {
    const bruit = erreurs.filter(e => !/favicon|ERR_FAILED|net::|WebGL|SwiftShader|GroupMarkerNotSet/i.test(e));
    assert.deepEqual(bruit, []);
  });

  await ctx.close(); await nav.close();
  console.log(`\n── Carte et géolocalisation ──\n${constats.join('\n')}`);
  console.log(`\nCaptures : ${CAPTURES}`);
  process.exit(echecs > 0 ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
