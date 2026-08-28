/**
 * Une journée SANS tournée n'est pas une journée sans clients géolocalisés.
 *
 * ── Le défaut que ce contrôle empêche ──
 *
 * Les cartes de direction ne montrent que les clients PROGRAMMÉS sur une tournée du jour
 * demandé. Un dimanche, un jour férié, une planification faite à la semaine, ou
 * simplement demain : zéro tournée, donc zéro point — et l'écran annonçait « aucun client
 * géolocalisé pour cette journée » alors que la base en contenait des centaines.
 *
 * Le message était faux, et il accusait la mauvaise chose : on cherchait un problème de
 * géolocalisation là où il n'y avait qu'un trou de planification.
 *
 * Ce contrôle demande délibérément une journée sans tournée — la situation la plus
 * fréquente en exploitation, et celle qu'un jeu de démonstration bien garni masque.
 */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
for (const v of ['HTTPS_PROXY','HTTP_PROXY','https_proxy','http_proxy']) delete process.env[v];
const API=process.env.API_LOCAL||'http://localhost:4000';
const WEB=process.env.SITE_LOCAL||'http://127.0.0.1:5500';
const PROD='https://enviro-cleans-api.onrender.com';
const CAPTURES='/tmp/captures-jour-vide';

(async () => {
  require('node:fs').mkdirSync(CAPTURES, { recursive: true });
  const nav = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader'] });

  const constats=[]; let echecs=0;
  const v = async (n,f)=>{ try{ await f(); constats.push(`  ✓ ${n}`);}
    catch(e){ constats.push(`  ✗ ${n}\n      ${String(e.message).split('\n')[0]}`); echecs++; } };

  async function connexion(id){
    const r=await fetch(`${API}/api/auth/login`,{method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({identifiant:id,mot_de_passe:'MotDePasse123!'})});
    if(!r.ok) throw new Error(`${id}: HTTP ${r.status}`);
    return r.json();
  }

  async function ouvrir(compte, page_, vue){
    const ctx=await nav.newContext({viewport:{width:1440,height:1100}});
    await ctx.route(`${PROD}/**`, async route=>{
      const q=route.request();
      const rep=await fetch(q.url().replace(PROD,API),{method:q.method(),headers:q.headers(),
        body:['GET','HEAD'].includes(q.method())?undefined:q.postData()});
      await route.fulfill({status:rep.status,headers:Object.fromEntries(rep.headers.entries()),
        body:Buffer.from(await rep.arrayBuffer())});
    });
    await ctx.addInitScript(s=>{
      localStorage.setItem('ec.accessToken', s.accessToken||s.token);
      localStorage.setItem('ec.refreshToken', s.refreshToken||'');
      localStorage.setItem('ec.user', JSON.stringify(s.user||{}));
      localStorage.setItem('ec.permissions', JSON.stringify(s.permissions||[]));
    }, compte);
    const p=await ctx.newPage();
    const err=[]; p.on('pageerror',e=>err.push(String(e)));
    p.on('console',m=>{ if(m.type()==='error') err.push(m.text()); });
    await p.goto(`${WEB}/${page_}`,{waitUntil:'networkidle'});
    return {ctx,p,err};
  }

  // ── PDG : « Terrain & carte clients », journée sans tournée ──
  const pdg = await connexion('pdg@dev.local');
  const A = await ouvrir(pdg,'pdg.html');
  await A.p.click('.menu a[data-vue="terrain"]');
  await A.p.waitForTimeout(3000);
  const ongletCarte = await A.p.$('text=Ouvrir la carte clients');
  if (ongletCarte) { await ongletCarte.click(); await A.p.waitForTimeout(3000); }
  await A.p.fill('#jourCartePdg','2026-09-15');
  await A.p.click('#actualiserCartePdg');
  await A.p.waitForTimeout(3500);
  await A.p.screenshot({path:`${CAPTURES}/pdg-jour-sans-tournee.png`,fullPage:true});

  await v('PDG — l’écran n’accuse plus la géolocalisation', async ()=>{
    const t = await A.p.textContent('#contenu');
    assert.doesNotMatch(t, /Aucun client géolocalisé pour cette journée/,
      'le message trompeur est encore affiché');
    assert.match(t, /Aucune tournée n’est planifiée/, 'la vraie cause n’est pas dite');
  });

  await v('PDG — le parc géolocalisé est annoncé, chiffré et étiqueté', async ()=>{
    const t = await A.p.textContent('#contenu');
    assert.match(t, /Clients géolocalisés \(parc\)/, 'le compteur du parc manque');
    assert.match(t, /40/, 'le nombre de clients géolocalisés n’apparaît pas');
    assert.match(t, /ce ne sont pas des arrêts programmés/,
      'le parc doit être distingué des arrêts programmés');
  });

  await v('PDG — la carte affiche réellement des points', async ()=>{
    const pts = await A.p.$$('#cartePdgKinshasa .carte-hote circle, #cartePdgKinshasa canvas');
    assert.ok(pts.length > 0, 'la carte est restée vide alors que 40 positions existent');
    const t = await A.p.textContent('.carte-compte');
    assert.match(t, /\d+ \/ \d+ point\(s\) affiché\(s\)/, `compteur : ${t}`);
  });

  await v('PDG — les journées qui portent des tournées sont nommées', async ()=>{
    assert.match(await A.p.textContent('#contenu'), /2026-08-2[0-9]|2026-08-30/);
  });

  await v('PDG — aucune erreur JavaScript', async ()=>{
    assert.deepEqual(A.err.filter(e=>!/favicon|net::|WebGL|SwiftShader/i.test(e)), []);
  });

  await A.ctx.close();

  // ── Direction opérations : même journée ──
  const ops = await connexion('directeur_operations_commerciales@dev.local');
  const B = await ouvrir(ops,'direction-operations-commerciales.html');
  await B.p.click('.menu a[data-vue="carte"]');
  await B.p.waitForTimeout(2500);
  await B.p.fill('#dateDebut','2026-09-15');
  await B.p.click('#appliquer');
  await B.p.waitForTimeout(3500);
  await B.p.screenshot({path:`${CAPTURES}/ops-jour-sans-tournee.png`,fullPage:true});

  await v('Opérations — le parc est affiché plutôt qu’un cadre vide', async ()=>{
    const t = await B.p.textContent('#contenu');
    assert.match(t, /Clients géolocalisés \(parc\)/);
  });

  await v('Opérations — aucune erreur JavaScript', async ()=>{
    assert.deepEqual(B.err.filter(e=>!/favicon|net::|WebGL|SwiftShader/i.test(e)), []);
  });

  await B.ctx.close(); await nav.close();
  console.log(`\n── Journée sans tournée ──\n${constats.join('\n')}`);
  console.log(`\nCaptures : ${CAPTURES}`);
  process.exit(echecs>0?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
