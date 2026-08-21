/** Connexion réelle depuis espace-client.html, pour chaque rôle : où atterrit-on ? */
const { chromium } = require('playwright');
const API_PROD='https://enviro-cleans-api.onrender.com', API_LOCAL='http://localhost:4000';

const ROLES = [
  ['pdg', '+243810000000', 'pdg.html'],
  ['dga', '+243810000001', 'direction-generale-adjointe.html'],
  ['directeur_financier', '+243810000002', 'direction-financiere.html'],
  ['directeur_rh', '+243810000003', 'direction-rh.html'],
  ['directeur_marketing', '+243810000004', 'direction-marketing.html'],
  ['directeur_operations_commerciales', '+243810000005', 'direction-operations-commerciales.html'],
  ['administrateur_technique', '+243810000006', 'centre-technique.html'],
];

(async()=>{
  const nav=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  let echecs=0;
  for(const [role, tel, attendu] of ROLES){
    const ctx=await nav.newContext({viewport:{width:1440,height:900}});
    const page=await ctx.newPage();
    await page.route(`${API_PROD}/**`, async r=>{
      const q=r.request();
      try{const rep=await fetch(q.url().replace(API_PROD,API_LOCAL),{method:q.method(),headers:q.headers(),
        body:['GET','HEAD'].includes(q.method())?undefined:q.postData()});
        await r.fulfill({status:rep.status,headers:{'content-type':'application/json','access-control-allow-origin':'*'},body:await rep.text()});
      }catch(e){await r.abort();}});

    await page.goto('http://127.0.0.1:5500/espace-client.html',{waitUntil:'networkidle'});
    await page.fill('#identifiant', tel);
    await page.fill('#pwdInput', 'MotDePasse123!');
    await page.click('#loginBtn');
    await page.waitForTimeout(2500);

    const arrivee = page.url().split('/').pop().split('?')[0];
    const menus = await page.$$eval('.menu a[data-vue]', els =>
      els.filter(e => getComputedStyle(e).display !== 'none').length).catch(()=>0);
    const ok = arrivee === attendu;
    if(!ok) echecs++;
    console.log(`${ok?'✓':'✗'} ${role.padEnd(34)} → ${arrivee.padEnd(38)} ${menus} menu(s) visible(s)`);
    await ctx.close();
  }
  await nav.close();
  console.log(echecs===0 ? '\n✓ chaque rôle atterrit dans son espace' : `\n✗ ${echecs} redirection(s) incorrecte(s)`);
  process.exit(echecs===0?0:1);
})();
