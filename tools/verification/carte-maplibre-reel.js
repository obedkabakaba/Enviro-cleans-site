/**
 * Exerce le mode MapLibre RÉEL — pas le repli.
 *
 * Le fond de plan est une archive PMTiles minimale mais VALIDE (en-tête v3, répertoire
 * vide) : elle passe le contrôle préalable et le décodage de la bibliothèque pmtiles,
 * sans qu'aucune tuile ne soit à télécharger. C'est ce qui permet de vérifier le
 * regroupement, les bulles et la sélection de tournée dans un vrai rendu WebGL, sur une
 * machine hors ligne.
 */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
for (const v of ['HTTPS_PROXY','HTTP_PROXY','https_proxy','http_proxy']) delete process.env[v];

const API = process.env.API_LOCAL || 'http://localhost:4000';
const WEB = process.env.SITE_LOCAL || 'http://127.0.0.1:5500';
const PROD = 'https://enviro-cleans-api.onrender.com';
const PMTILES = 'https://fond-de-controle.local/kinshasa.pmtiles';
const CAPTURES = process.env.CAPTURES || '/tmp/captures-maplibre';

/**
 * Une archive PMTiles v3 minimale mais VALIDE, construite en mémoire.
 *
 * En-tête de 127 octets, répertoire racine vide, métadonnées vides, aucune tuile. Elle
 * est acceptée par la bibliothèque `pmtiles` et par le contrôle préalable de
 * `carte-maplibre.js`, ce qui fait démarrer le vrai moteur MapLibre. Aucune tuile n'est
 * donc téléchargée : le contrôle n'a besoin d'aucun réseau, et le dépôt n'a pas à porter
 * un binaire de plusieurs mégaoctets pour se vérifier lui-même.
 */
function archivePmtiles() {
  const HEADER = 127;
  const racine = Buffer.from([0]);        // varint : zéro entrée
  const meta = Buffer.from('{"vector_layers":[]}');
  const h = Buffer.alloc(HEADER);
  h.write('PMTiles', 0, 'ascii');
  h[7] = 3;                                // version du format
  h.writeBigUInt64LE(BigInt(HEADER), 8);            // décalage du répertoire racine
  h.writeBigUInt64LE(BigInt(racine.length), 16);
  h.writeBigUInt64LE(BigInt(HEADER + racine.length), 24);  // décalage des métadonnées
  h.writeBigUInt64LE(BigInt(meta.length), 32);
  const fin = BigInt(HEADER + racine.length + meta.length);
  h.writeBigUInt64LE(fin, 40); h.writeBigUInt64LE(0n, 48); // répertoires feuilles : aucun
  h.writeBigUInt64LE(fin, 56); h.writeBigUInt64LE(0n, 64); // données de tuiles : aucune
  h.writeBigUInt64LE(0n, 72); h.writeBigUInt64LE(0n, 80); h.writeBigUInt64LE(0n, 88);
  h[96] = 1;  // groupées
  h[97] = 1;  // compression interne : aucune
  h[98] = 1;  // compression des tuiles : aucune
  h[99] = 1;  // type de tuile : MVT
  h[100] = 0; h[101] = 14;                 // zooms minimal et maximal
  h.writeInt32LE(Math.round(15.15 * 1e7), 102);   // emprise : Kinshasa
  h.writeInt32LE(Math.round(-4.55 * 1e7), 106);
  h.writeInt32LE(Math.round(15.45 * 1e7), 110);
  h.writeInt32LE(Math.round(-4.25 * 1e7), 114);
  h[118] = 12;
  h.writeInt32LE(Math.round(15.30 * 1e7), 119);
  h.writeInt32LE(Math.round(-4.33 * 1e7), 123);
  return Buffer.concat([h, racine, meta]);
}

const ARCHIVE = archivePmtiles();

(async () => {
  require('node:fs').mkdirSync(CAPTURES, { recursive: true });
  const nav = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  });

  const r = await fetch(`${API}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identifiant: process.env.COMPTE || 'directeur_operations_commerciales@dev.local',
      mot_de_passe: process.env.MOT_DE_PASSE || 'MotDePasse123!',
    }),
  });
  if (!r.ok) throw new Error(`connexion : HTTP ${r.status} ${await r.text()}`);
  const ops = await r.json();

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

  // Le fond est servi depuis le disque, en honorant `Range` : c'est exactement ce que
  // fait Supabase Storage, et c'est ce dont pmtiles a besoin pour lire l'en-tête.
  await ctx.route(`${PMTILES}*`, async (route) => {
    const plage = route.request().headers()['range'];
    const m = plage && /bytes=(\d+)-(\d*)/.exec(plage);
    if (!m) {
      return route.fulfill({ status: 200, body: ARCHIVE,
        headers: { 'content-type': 'application/octet-stream',
          'access-control-allow-origin': '*', 'accept-ranges': 'bytes' } });
    }
    const debut = Number(m[1]);
    const fin = m[2] === '' ? ARCHIVE.length - 1 : Math.min(Number(m[2]), ARCHIVE.length - 1);
    return route.fulfill({ status: 206, body: ARCHIVE.subarray(debut, fin + 1),
      headers: { 'content-type': 'application/octet-stream',
        'access-control-allow-origin': '*', 'accept-ranges': 'bytes',
        'content-range': `bytes ${debut}-${fin}/${ARCHIVE.length}` } });
  });

  await ctx.addInitScript(([s, url]) => {
    localStorage.setItem('ec.accessToken', s.accessToken || s.token);
    localStorage.setItem('ec.refreshToken', s.refreshToken || '');
    localStorage.setItem('ec.user', JSON.stringify(s.user || {}));
    localStorage.setItem('ec.permissions', JSON.stringify(s.permissions || []));
    // `carte-config.js` est chargé APRÈS ce script : on repose la valeur une fois la
    // page prête, sinon le fichier l'écraserait.
    document.addEventListener('DOMContentLoaded', () => {
      if (window.ENVIRO_CARTE) window.ENVIRO_CARTE.pmtiles = url;
    });
  }, [ops, PMTILES]);

  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', e => erreurs.push(String(e)));

  const constats = []; let echecs = 0;
  const v = async (nom, fn) => {
    try { await fn(); constats.push(`  ✓ ${nom}`); }
    catch (e) { constats.push(`  ✗ ${nom}\n      ${String(e.message).split('\n')[0]}`); echecs++; }
  };

  await page.goto(`${WEB}/direction-operations-commerciales.html`, { waitUntil: 'networkidle' });
  await page.click('.menu a[data-vue="carte"]');
  await page.waitForTimeout(9000);
  await page.screenshot({ path: `${CAPTURES}/maplibre.png`, fullPage: true });

  await v('le mode MapLibre est réellement actif (pas le repli)', async () => {
    assert.ok(await page.$('.maplibregl-canvas'), 'aucune toile MapLibre : la carte a replié');
    const note = await page.$('.carte-hote .note');
    assert.equal(note, null, `note de repli présente : ${note && await note.textContent()}`);
  });

  await v('les couches de regroupement existent', async () => {
    const couches = await page.evaluate(() => {
      const c = CarteInteractive.instance('carteDuJour');
      return c ? c.getStyle().layers.map(l => l.id) : null;
    });
    assert.ok(couches, 'carte non exposée');
    for (const id of ['arrets-cluster', 'arrets-cluster-nombre', 'arrets-point',
      'tournees-trace', 'tournees-ordre']) {
      assert.ok(couches.includes(id), `couche ${id} absente — ${couches.join(', ')}`);
    }
  });

  await v('la source regroupe vraiment (cluster: true)', async () => {
    const src = await page.evaluate(() => {
      const s = CarteInteractive.instance('carteDuJour').getStyle().sources.arrets;
      return { cluster: s.cluster, rayon: s.clusterRadius, zoomMax: s.clusterMaxZoom };
    });
    assert.equal(src.cluster, true, 'la source n’est pas regroupée');
    assert.ok(src.rayon > 0, `rayon de regroupement : ${src.rayon}`);
  });

  await v('des agrégats sont formés au zoom d’ensemble', async () => {
    const n = await page.evaluate(() => {
      const c = CarteInteractive.instance('carteDuJour');
      return c.querySourceFeatures('arrets', { filter: ['has', 'point_count'] }).length;
    });
    assert.ok(n > 0, `aucun agrégat formé sur ${40} points groupés`);
  });

  await v('le dégroupement au zoom rend les points unitaires', async () => {
    // `querySourceFeatures` ne voit que les tuiles du viewport : il faut donc CENTRER
    // sur un arrêt connu, sinon le zoom 18 tombe sur une zone vide et le contrôle
    // échouerait pour une raison qui n'a rien à voir avec le dégroupement.
    const cible = await page.evaluate(() => {
      const f = CarteInteractive.instance('carteDuJour')
        .querySourceFeatures('arrets', { filter: ['has', 'point_count'] })[0];
      return f ? f.geometry.coordinates : null;
    });
    assert.ok(cible, 'aucun agrégat sur lequel zoomer');
    await page.evaluate((c) => CarteInteractive.instance('carteDuJour')
      .jumpTo({ center: c, zoom: 17 }), cible);
    await page.waitForTimeout(2500);
    const r = await page.evaluate(() => {
      const c = CarteInteractive.instance('carteDuJour');
      return {
        unitaires: c.querySourceFeatures('arrets', { filter: ['!', ['has', 'point_count']] }).length,
        agregats: c.querySourceFeatures('arrets', { filter: ['has', 'point_count'] }).length,
      };
    });
    assert.ok(r.unitaires > 0, `zoom 17 sur un agrégat : aucun point unitaire`);
    assert.equal(r.agregats, 0,
      `${r.agregats} agrégat(s) survivent au-delà de clusterMaxZoom (14)`);
  });

  await v('les polices absentes dégradent la carte sans la détruire', async () => {
    // `glyphs` pointe vers un hôte externe, injoignable ici : la carte doit RESTER.
    assert.ok(await page.$('.maplibregl-canvas'), 'la carte a été détruite');
    const note = await page.$('.carte-degradation');
    if (note) assert.match(await note.textContent(), /restent exactes/);
  });

  await v('la barre d’outils pilote aussi le mode MapLibre', async () => {
    assert.ok(await page.$('.carte-recherche'), 'barre absente en mode MapLibre');
    const t = await page.textContent('.carte-compte');
    assert.match(t, /\d+ \/ \d+ point\(s\) affiché\(s\)/, `compteur : ${t}`);
  });

  await v('sélectionner une tournée filtre la source et le tracé', async () => {
    const opts = await page.$$eval('.carte-tournee option', o => o.map(x => x.value));
    const id = opts.find(x => x !== '');
    await page.selectOption('.carte-tournee', id);
    await page.waitForTimeout(1200);
    const f = await page.evaluate(() => ({
      trace: CarteInteractive.instance('carteDuJour').getFilter('tournees-trace'),
      ordre: CarteInteractive.instance('carteDuJour').getFilter('tournees-ordre'),
    }));
    assert.ok(JSON.stringify(f.trace).includes(id), `filtre du tracé : ${JSON.stringify(f.trace)}`);
    assert.ok(JSON.stringify(f.ordre).includes(id), `filtre des numéros : ${JSON.stringify(f.ordre)}`);
  });

  await v('« Vue d’ensemble » recadre et remet les filtres', async () => {
    await page.click('.carte-ensemble');
    await page.waitForTimeout(1500);
    assert.equal(await page.inputValue('.carte-tournee'), '');
    const f = await page.evaluate(() => CarteInteractive.instance('carteDuJour').getFilter('tournees-ordre'));
    assert.ok(JSON.stringify(f).includes('__jamais__'), `numéros toujours filtrés : ${JSON.stringify(f)}`);
  });

  await v('la recherche amène la vue sur le point', async () => {
    const avant = await page.evaluate(() => CarteInteractive.instance('carteDuJour').getCenter());
    await page.fill('.carte-recherche', 'DEMO-C0003');
    await page.waitForTimeout(800);
    await page.click('.carte-resultats [data-aller]');
    await page.waitForTimeout(1500);
    const apres = await page.evaluate(() => CarteInteractive.instance('carteDuJour').getCenter());
    assert.notDeepEqual(apres, avant, 'la vue n’a pas bougé');
    assert.ok(await page.$('.maplibregl-popup'), 'aucune bulle ouverte sur le point visé');
    assert.ok(await page.$('.maplibregl-popup-close-button'), 'bulle sans bouton de fermeture');
  });

  await page.screenshot({ path: `${CAPTURES}/maplibre-outils.png`, fullPage: true });

  await v('aucune erreur JavaScript', async () => {
    const bruit = erreurs.filter(e => !/favicon|ERR_FAILED|net::|WebGL|SwiftShader|GroupMarkerNotSet/i.test(e));
    assert.deepEqual(bruit, []);
  });

  await ctx.close(); await nav.close();
  console.log(`\n── Mode MapLibre (fond de plan réel) ──\n${constats.join('\n')}`);
  console.log(`\nCaptures : ${CAPTURES}`);
  process.exit(echecs > 0 ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
