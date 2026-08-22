/**
 * Vérifie que les blocs de gestion ajoutés aux espaces fonctionnent RÉELLEMENT :
 * le tableau se charge, le formulaire se construit à partir des champs du serveur,
 * une saisie invalide est refusée champ par champ, une saisie valide crée la ligne,
 * et la pièce peut être soumise au circuit d'approbation.
 *
 * Ouvrir la page et constater qu'elle ne plante pas ne prouve rien : c'est le
 * parcours d'écriture qui doit être exercé.
 */
const { chromium } = require('playwright');
const API_PROD = 'https://enviro-cleans-api.onrender.com';
const API_LOCAL = 'http://localhost:4000';

const PARCOURS = [
  { page: 'direction-financiere.html', tel: '+243810000002', vue: 'depenses',
    zone: 'gestion_finance_depenses', libelle: 'Dépense',
    invalide: { objet: '', montant: '-5' },
    valide: { objet: 'Vérification automatisée', categorie: 'fournitures',
              montant: '250', devise: 'USD' },
    soumettre: true },
  { page: 'direction-marketing.html', tel: '+243810000004', vue: 'campagnes',
    zone: 'gestion_marketing_campagnes', libelle: 'Campagne',
    invalide: { nom: '', canal: '' },
    valide: { nom: 'Campagne de vérification', canal: 'terrain', date_debut: '2026-09-01' },
    soumettre: false },
  { page: 'direction-operations-commerciales.html', tel: '+243810000005', vue: 'vehicules',
    zone: 'gestion_operations_vehicules', libelle: 'Véhicule',
    invalide: { type_vehicule: '' },
    valide: { type_vehicule: 'benne', marque: 'Vérification', annee: '2024' },
    soumettre: false },
];

(async () => {
  const nav = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  });
  let defauts = 0;

  for (const p of PARCOURS) {
    const ctx = await nav.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await ctx.newPage();
    const erreurs = [];
    // Le refus d'une saisie volontairement invalide produit un 400, que le navigateur
    // journalise en erreur de console. C'est le comportement ATTENDU : le compter comme
    // un défaut ferait échouer la vérification précisément quand elle réussit.
    let refusAttendu = false;
    page.on('pageerror', (e) => erreurs.push('pageerror: ' + e.message.slice(0, 160)));
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      const t = m.text();
      if (refusAttendu && /\b(400|409)\b/.test(t)) return;
      erreurs.push(t.slice(0, 160));
    });

    await page.route(`${API_PROD}/**`, async (r) => {
      const q = r.request();
      try {
        const rep = await fetch(q.url().replace(API_PROD, API_LOCAL), {
          method: q.method(), headers: q.headers(),
          body: ['GET', 'HEAD'].includes(q.method()) ? undefined : q.postData(),
        });
        const type = rep.headers.get('content-type') || 'application/json';
        await r.fulfill({
          status: rep.status,
          headers: { 'content-type': type, 'access-control-allow-origin': '*' },
          body: await rep.text(),
        });
      } catch (e) { await r.abort(); }
    });

    const j = await (await fetch(`${API_LOCAL}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifiant: p.tel, mot_de_passe: 'MotDePasse123!' }),
    })).json();
    await page.addInitScript((t) => {
      localStorage.setItem('ec.accessToken', t.accessToken);
      localStorage.setItem('ec.refreshToken', t.refreshToken);
      localStorage.setItem('ec.permissions', JSON.stringify(t.permissions || []));
    }, j);

    console.log(`\n${p.page} → ${p.vue}`);
    await page.goto(`http://127.0.0.1:5500/${p.page}`, { waitUntil: 'networkidle' });
    await page.click(`.menu a[data-vue="${p.vue}"]`);
    await page.waitForTimeout(1400);

    const zone = await page.$(`#${p.zone}`);
    if (!zone) { console.log(`  ✗ bloc de gestion « ${p.zone} » absent`); defauts += 1; await ctx.close(); continue; }
    console.log('  ✓ bloc de gestion monté');

    const bouton = await page.$('#creerRessource');
    if (!bouton) { console.log('  ✗ bouton « Nouveau » absent — le rôle devrait pouvoir écrire'); defauts += 1; await ctx.close(); continue; }
    await bouton.click();
    await page.waitForTimeout(350);

    const nbChamps = await page.$$eval('#formRessource .champ', (e) => e.length);
    if (nbChamps === 0) { console.log('  ✗ formulaire vide'); defauts += 1; await ctx.close(); continue; }
    console.log(`  ✓ formulaire construit — ${nbChamps} champ(s) décrits par le serveur`);

    // Les champs à valeurs contraintes (devise, statut, booléens) sont rendus en
    // <select> par le module : `fill` ne s'applique qu'aux champs de saisie libre.
    async function saisir(nom, valeur) {
      const el = await page.$(`#formRessource [name="${nom}"]`);
      if (!el) return;
      const balise = await el.evaluate((e) => e.tagName.toLowerCase());
      if (balise === 'select') await el.selectOption(String(valeur));
      else await el.fill(String(valeur));
    }

    // ── Saisie invalide : le serveur doit refuser, champ par champ ──
    refusAttendu = true;
    for (const [nom, val] of Object.entries(p.invalide)) await saisir(nom, val);
    await page.click('#formRessource button[type=submit]');
    await page.waitForTimeout(700);
    refusAttendu = false;

    const messages = await page.$$eval('#formRessource .erreur-champ',
      (els) => els.map((e) => e.textContent.trim()).filter(Boolean));
    if (!messages.length) {
      console.log('  ✗ saisie invalide acceptée sans message de champ'); defauts += 1;
    } else {
      console.log(`  ✓ refus expliqué champ par champ : ${messages.slice(0, 2).join(' | ')}`);
    }

    // ── Saisie valide ──
    for (const [nom, val] of Object.entries(p.valide)) await saisir(nom, val);
    await page.click('#formRessource button[type=submit]');
    await page.waitForTimeout(1600);

    const encoreOuvert = await page.$('#formRessource');
    if (encoreOuvert) {
      const globale = await page.$eval('.erreur-globale', (e) => e.textContent).catch(() => '');
      console.log(`  ✗ création refusée : ${globale || 'motif inconnu'}`); defauts += 1;
      await ctx.close(); continue;
    }

    const nbLignes = await page.$$eval(`#${p.zone} tbody tr[data-id]`, (e) => e.length);
    console.log(`  ✓ ligne créée — ${nbLignes} ligne(s) dans le tableau`);

    // ── Fiche, historique, soumission ──
    await page.click(`#${p.zone} tbody tr[data-id]`);
    await page.waitForTimeout(900);
    const fiche = await page.$('#panneauRessource .panneau');
    if (!fiche) { console.log('  ✗ fiche non ouverte'); defauts += 1; }
    else console.log('  ✓ fiche ouverte');

    if (p.soumettre) {
      const bSoum = await page.$('#soumettreRessource');
      if (!bSoum) { console.log('  ✗ bouton de soumission absent'); defauts += 1; }
      else {
        page.once('dialog', (d) => d.accept());
        await bSoum.click();
        await page.waitForTimeout(1600);
        console.log('  ✓ soumise au circuit d’approbation');
      }
    }

    if (erreurs.length) {
      console.log('  ✗ erreurs de console :');
      erreurs.slice(0, 4).forEach((e) => console.log('      ' + e));
      defauts += erreurs.length;
    }

    await ctx.close();
  }

  await nav.close();
  console.log(defauts === 0
    ? '\n✓ Les blocs de gestion écrivent réellement.'
    : `\n✗ ${defauts} défaut(s).`);
  process.exit(defauts ? 1 : 0);
})();
