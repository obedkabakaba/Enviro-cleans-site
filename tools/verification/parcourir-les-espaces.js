/** Ouvre chaque vue de chaque espace, avec le bon rôle, et rapporte tout défaut. */
const { chromium } = require('playwright');
const API_PROD='https://enviro-cleans-api.onrender.com', API_LOCAL='http://localhost:4000';

const ESPACES = [
  ['pdg.html', '+243810000000'],
  ['direction-generale-adjointe.html', '+243810000001'],
  ['direction-financiere.html', '+243810000002'],
  ['direction-rh.html', '+243810000003'],
  ['direction-marketing.html', '+243810000004'],
  ['direction-operations-commerciales.html', '+243810000005'],
  ['centre-technique.html', '+243810000006'],
];

(async () => {
  const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  let defauts = 0, vues = 0;

  for (const [page_, tel] of ESPACES) {
    const ctx = await nav.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await ctx.newPage();
    const erreursConsole = [];
    page.on('console', m => { if (m.type() === 'error') erreursConsole.push(m.text().slice(0, 150)); });
    page.on('pageerror', e => erreursConsole.push('pageerror: ' + e.message.slice(0, 150)));

    const echecsReseau = [];
    await page.route(`${API_PROD}/**`, async r => {
      const q = r.request();
      try {
        const rep = await fetch(q.url().replace(API_PROD, API_LOCAL), {
          method: q.method(), headers: q.headers(),
          body: ['GET','HEAD'].includes(q.method()) ? undefined : q.postData() });
        if (rep.status >= 400) echecsReseau.push(`${rep.status} ${q.url().replace(API_PROD,'')}`);
        await r.fulfill({ status: rep.status,
          headers: { 'content-type':'application/json', 'access-control-allow-origin':'*' },
          body: await rep.text() });
      } catch (e) { echecsReseau.push('abort ' + q.url()); await r.abort(); }
    });

    const j = await (await fetch(`${API_LOCAL}/api/auth/login`, { method:'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ identifiant: tel, mot_de_passe: 'MotDePasse123!' }) })).json();
    await page.addInitScript(t => {
      localStorage.setItem('ec.accessToken', t.accessToken);
      localStorage.setItem('ec.refreshToken', t.refreshToken);
      localStorage.setItem('ec.permissions', JSON.stringify(t.permissions || []));
    }, j);

    await page.goto(`http://127.0.0.1:5500/${page_}`, { waitUntil: 'networkidle' });
    const liens = await page.$$eval('.menu a[data-vue]', els => els.map(e => e.getAttribute('data-vue')));
    console.log(`\n${page_}  (${liens.length} vues)`);

    for (const vue of liens) {
      const l = await page.$(`.menu a[data-vue="${vue}"]`);
      if (!l) continue;
      await l.click();
      await page.waitForTimeout(750);
      vues += 1;
      const etat = await page.evaluate(() => {
        // Un panneau qui ne rend RIEN est le défaut le plus discret qui soit : la page
        // paraît complète, la section est titrée, et elle est creuse. C'est exactement ce
        // qui est arrivé au cockpit du PDG — trois domaines sur quatre calculés par le
        // backend puis jetés parce que le frontend cherchait une clé absente.
        // Un état vide EXPLICITE ne compte pas : il dit ce qui manque, c'est légitime.
        const panneauxCreux = [];
        document.querySelectorAll('.panneau').forEach((p) => {
          const corps = p.querySelector('.corps') || p;
          const texte = (corps.textContent || '').trim();
          const aDuContenu = corps.querySelector(
            'table, svg, .kpi, .etat-vide, .signal, .bloc, ul, .avertissement, .note');
          if (!aDuContenu && texte.length < 3) {
            const titre = (p.querySelector('h2') || {}).textContent || '(sans titre)';
            panneauxCreux.push(titre.trim().slice(0, 40));
          }
        });
        return {
          erreurs: Array.from(document.querySelectorAll('.erreur')).map(e => e.textContent.trim().slice(0,110)),
          graphiques: document.querySelectorAll('.graphique svg').length,
          vides: document.querySelectorAll('.etat-vide').length,
          panneauxCreux,
        };
      });
      if (etat.erreurs.length) {
        defauts += 1;
        console.log(`  ✗ ${vue} — ${etat.erreurs[0]}`);
      } else if (etat.panneauxCreux.length) {
        defauts += 1;
        console.log(`  ✗ ${vue} — panneau(x) sans contenu : ${etat.panneauxCreux.join(', ')}`);
      } else {
        console.log(`  ✓ ${vue}${etat.graphiques ? '  · ' + etat.graphiques + ' graphique(s)' : ''}`);
      }
    }
    if (echecsReseau.length) { defauts += 1; console.log(`  ⚠ réseau : ${[...new Set(echecsReseau)].join(', ')}`); }
    if (erreursConsole.length) { defauts += 1; console.log(`  ⚠ console : ${[...new Set(erreursConsole)].slice(0,3).join(' | ')}`); }
    await ctx.close();
  }

  await nav.close();
  console.log(`\n${vues} vues parcourues · ${defauts === 0 ? '✓ aucun défaut' : '✗ ' + defauts + ' défaut(s)'}`);
  process.exit(defauts === 0 ? 0 : 1);
})();
