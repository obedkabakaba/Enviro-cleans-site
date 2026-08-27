#!/usr/bin/env node
/**
 * ════════════════════════════════════════
 * PREUVE NAVIGATEUR — les circuits, dans un vrai navigateur
 * ════════════════════════════════════════
 *
 * Les contrôles statiques lisent le code ; les tests d'intégration exercent le serveur.
 * Ni les uns ni les autres ne disent si un directeur, devant son écran, VOIT le bouton et
 * si le clic écrit quelque chose. C'est ce que fait ce script, contre la pile complète :
 * PostgreSQL, l'API, les pages statiques, Chromium.
 *
 * ── Ce qu'il vérifie, et pourquoi chacun a déjà manqué ──
 *
 *   1. La file « Décisions attendues » affiche des pièces réelles. Une permission sans
 *      écran pour l'exercer n'est pas une fonctionnalité : la direction générale pouvait
 *      prononcer une sanction disciplinaire par l'API et par personne à l'écran.
 *
 *   2. Un clic écrit RÉELLEMENT en base. Un écran qui affiche un succès sans écriture est
 *      la pire des régressions : elle ne se voit qu'au moment où quelqu'un cherche la
 *      pièce et ne la trouve pas.
 *
 *   3. La pièce traitée SORT de la file. Sans le rechargement après commande, le
 *      compteur mentirait et l'on cliquerait deux fois.
 *
 *   4. Les états de préparation des tournées sont visibles et nommés. « brouillon »
 *      affiché tel quel ressemble à une panne plutôt qu'à une étape.
 *
 * Usage : API sur :4011, pages sur :4012, puis
 *   node tools/verification/parcours-circuits.js
 */

const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

const API = process.env.API_LOCALE || 'http://localhost:4011';
const WEB = process.env.WEB_LOCALE || 'http://127.0.0.1:4012';
const PROD = 'https://enviro-cleans-api.onrender.com';
const MOT_DE_PASSE = process.env.MOT_DE_PASSE_DEV || 'MotDePasse123!';
const CAPTURES = process.env.CAPTURES || '/tmp/captures-circuits';

// Le mandataire du conteneur intercepterait les requêtes vers localhost et renverrait
// un 403 qui ressemble à une panne de l'API. On l'écarte pour ce script seulement.
for (const v of ['HTTPS_PROXY', 'HTTP_PROXY', 'https_proxy', 'http_proxy']) delete process.env[v];

async function connexion(email) {
  const r = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifiant: email, mot_de_passe: MOT_DE_PASSE }),
  });
  if (!r.ok) throw new Error(`Connexion ${email} : HTTP ${r.status} — ${await r.text()}`);
  return r.json();
}

/**
 * Ouvre une page avec la session déjà posée.
 *
 * Passer par le formulaire de connexion à chaque page testerait l'authentification
 * trois fois et le reste zéro fois. Les clés sont celles que `enviro-api.js` lit
 * réellement (`ec.*`) — les inventer donnerait une page déconnectée qui « marche ».
 */
async function ouvrir(navigateur, session, page_) {
  const contexte = await navigateur.newContext({ viewport: { width: 1440, height: 1000 } });

  // ── Rediriger l'API de production vers la pile locale ──
  //
  // Les pages portent l'URL de production en dur. `route.continue({ url })` refuse de
  // changer de protocole (https → http) ; on relaie donc la requête nous-mêmes et on
  // renvoie la réponse telle quelle. C'est aussi ce qui garantit qu'AUCUNE requête ne
  // part vers la vraie production pendant une vérification.
  await contexte.route(`${PROD}/**`, async (route) => {
    const requete = route.request();
    const reponse = await fetch(requete.url().replace(PROD, API), {
      method: requete.method(),
      headers: requete.headers(),
      body: ['GET', 'HEAD'].includes(requete.method()) ? undefined : requete.postData(),
    });
    const corps = Buffer.from(await reponse.arrayBuffer());
    await route.fulfill({
      status: reponse.status,
      headers: Object.fromEntries(reponse.headers.entries()),
      body: corps,
    });
  });

  await contexte.addInitScript(([jetons, base]) => {
    localStorage.setItem('ec.accessToken', jetons.accessToken || jetons.token);
    localStorage.setItem('ec.refreshToken', jetons.refreshToken || '');
    localStorage.setItem('ec.user', JSON.stringify(jetons.user || {}));
    localStorage.setItem('ec.permissions', JSON.stringify(jetons.permissions || []));
    void base;
  }, [session, WEB]);

  const page = await contexte.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text()); });

  await page.goto(`${WEB}/${page_}`, { waitUntil: 'networkidle' });
  return { contexte, page, erreurs };
}

async function allerA(page, vue) {
  await page.click(`.menu a[data-vue="${vue}"]`);
  await page.waitForTimeout(1200);
}

async function principal() {
  const navigateur = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox'],
  });

  const constats = [];
  let echecs = 0;

  const verifier = async (nom, fn) => {
    try {
      await fn();
      constats.push(`  ✓ ${nom}`);
    } catch (err) {
      constats.push(`  ✗ ${nom}\n      ${err.message.split('\n')[0]}`);
      echecs += 1;
    }
  };

  const pdg = await connexion('pdg@dev.local');
  const ops = await connexion('directeur_operations_commerciales@dev.local');

  // ── 1. La file des décisions attendues ──────────────────────────────────
  const vuePdg = await ouvrir(navigateur, pdg, 'pdg.html');
  await allerA(vuePdg.page, 'decisions');
  await vuePdg.page.screenshot({ path: path.join(CAPTURES, 'pdg-decisions.png'), fullPage: true });

  let pieceCliquee = null;

  await verifier('la file des décisions attendues affiche des pièces réelles', async () => {
    const texte = await vuePdg.page.textContent('#fileDecisions');
    assert.ok(!/Chargement/.test(texte), 'la file est restée en chargement');
    assert.ok(/attendent votre décision/.test(texte),
      `la file ne montre aucune pièce — contenu : ${texte.slice(0, 200)}`);

    const boutons = await vuePdg.page.$$('#fileDecisions [data-circuit]');
    assert.ok(boutons.length > 0, 'aucune pièce cliquable dans la file');

    // Les étiquettes doivent nommer la pièce, pas afficher un numéro nu.
    const premiere = await boutons[0].textContent();
    assert.ok(!/^#\d+$/.test(premiere.trim()),
      `l'étiquette « ${premiere} » n'aide personne à décider`);
  });

  await verifier('un clic ouvre la barre de commandes du circuit', async () => {
    const bouton = await vuePdg.page.$('#fileDecisions [data-circuit]');
    pieceCliquee = {
      circuit: await bouton.getAttribute('data-circuit'),
      id: await bouton.getAttribute('data-id'),
    };
    await bouton.click();
    await vuePdg.page.waitForTimeout(1200);

    const barre = await vuePdg.page.textContent('#commandesFile');
    assert.ok(/État\s*:/.test(barre), `la barre ne s'est pas ouverte — ${barre.slice(0, 160)}`);
    assert.ok((await vuePdg.page.$$('#commandesFile [data-vers]')).length > 0,
      'aucune commande proposée sur la pièce');
  });

  // ── 2. Un clic écrit réellement en base ─────────────────────────────────
  await verifier('une commande exécutée depuis l’écran écrit RÉELLEMENT en base', async () => {
    const avant = await fetch(
      `${API}/api/ressources/${pieceCliquee.circuit}/${pieceCliquee.id}/actions`,
      { headers: { Authorization: `Bearer ${pdg.accessToken || pdg.token}` } }
    ).then((r) => r.json());

    const bouton = await vuePdg.page.$('#commandesFile [data-vers]');
    const vise = await bouton.getAttribute('data-vers');

    vuePdg.page.on('dialog', (d) => d.accept());
    await bouton.click();
    await vuePdg.page.waitForTimeout(600);

    // Certaines commandes ouvrent un formulaire de saisie : on le remplit.
    const champs = await vuePdg.page.$$('#saisieCommande [name]');
    for (const champ of champs) {
      const type = await champ.getAttribute('type');
      await champ.fill(type === 'date' ? '2026-12-31'
        : type === 'number' ? '1' : 'Vérification navigateur');
    }
    if (champs.length > 0) {
      await vuePdg.page.click('#formCommande button[type=submit]');
    }
    await vuePdg.page.waitForTimeout(2000);

    const apres = await fetch(
      `${API}/api/ressources/${pieceCliquee.circuit}/${pieceCliquee.id}/actions`,
      { headers: { Authorization: `Bearer ${pdg.accessToken || pdg.token}` } }
    ).then((r) => r.json());

    assert.notEqual(apres.etat, avant.etat,
      `l'état n'a pas bougé en base (« ${avant.etat} ») : l'écran a montré un succès `
      + 'que le serveur n\'a pas écrit');
    assert.equal(apres.etat, vise,
      `la base porte « ${apres.etat} » alors que le bouton visait « ${vise} »`);
  });

  await verifier('la pièce traitée sort de la file', async () => {
    await vuePdg.page.waitForTimeout(800);
    const restant = await vuePdg.page.$(
      `#fileDecisions [data-circuit="${pieceCliquee.circuit}"][data-id="${pieceCliquee.id}"]`
    );
    assert.equal(restant, null,
      'la pièce traitée est encore proposée : le compteur ment et l’on cliquerait deux fois');
  });

  await vuePdg.page.screenshot({ path: path.join(CAPTURES, 'pdg-apres-commande.png'), fullPage: true });

  await verifier('aucune erreur JavaScript sur l’espace PDG', async () => {
    const bruit = vuePdg.erreurs.filter((e) => !/favicon|ERR_FAILED|net::/i.test(e));
    assert.deepEqual(bruit, []);
  });

  await vuePdg.contexte.close();

  // ── 3. Le cycle de vie des tournées, à l'écran ──────────────────────────
  const vueOps = await ouvrir(navigateur, ops, 'direction-operations-commerciales.html');
  await allerA(vueOps.page, 'tournees');
  await vueOps.page.waitForTimeout(1000);

  await verifier('les neuf états de tournée sont proposés en filtre, nommés en clair', async () => {
    const libelles = await vueOps.page.$$eval('[data-statut-tournee]',
      (els) => els.map((e) => e.textContent.trim()));
    for (const attendu of ['Brouillon', 'Validée', 'Planifiée', 'Clôturée', 'Reportée']) {
      assert.ok(libelles.includes(attendu),
        `« ${attendu} » absent des filtres — présents : ${libelles.join(', ')}`);
    }
  });

  await verifier('un plan en préparation est visible de la direction', async () => {
    await vueOps.page.click('[data-statut-tournee="validee"]');
    await vueOps.page.waitForTimeout(1500);
    const texte = await vueOps.page.textContent('#contenu');
    assert.ok(/Validée/.test(texte),
      'aucune tournée validée à l’écran alors que le jeu de démonstration en a produit une');
  });

  await verifier('ouvrir une tournée propose ses commandes de circuit', async () => {
    const ligne = await vueOps.page.$('[data-tournee]');
    assert.ok(ligne, 'aucune tournée cliquable');
    await ligne.click();
    await vueOps.page.waitForTimeout(1500);
    const barre = await vueOps.page.textContent('#commandesTournee');
    assert.ok(/État\s*:/.test(barre), `la barre ne s'est pas ouverte — ${barre.slice(0, 160)}`);
  });

  await vueOps.page.screenshot({ path: path.join(CAPTURES, 'operations-tournees.png'), fullPage: true });

  await verifier('aucune erreur JavaScript sur l’espace Opérations', async () => {
    const bruit = vueOps.erreurs.filter((e) => !/favicon|ERR_FAILED|net::/i.test(e));
    assert.deepEqual(bruit, []);
  });

  await vueOps.contexte.close();
  await navigateur.close();

  console.log(`\n── Preuve navigateur ──\n${constats.join('\n')}`);
  console.log(`\nCaptures : ${CAPTURES}`);

  if (echecs > 0) {
    console.log(`\n❌ ${echecs} vérification(s) en échec.\n`);
    process.exit(1);
  }
  console.log('\n✅ Les circuits fonctionnent dans un vrai navigateur, contre la pile complète.\n');
}

require('node:fs').mkdirSync(CAPTURES, { recursive: true });
principal().catch((err) => { console.error(err); process.exit(1); });
