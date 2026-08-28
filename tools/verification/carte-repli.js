/**
 * Exerce le chemin MapLibre : import dynamique, chargement de pmtiles et basemaps,
 * enregistrement du protocole, construction du style — puis vérifie que l'échec de
 * lecture du .pmtiles produit bien le repli SVG, et non un cadre vide.
 */
const { chromium } = require('playwright');
const API_PROD='https://enviro-cleans-api.onrender.com';
const API_LOCAL=process.env.API_LOCAL||'http://localhost:4000';
const SITE_LOCAL=process.env.SITE_LOCAL||'http://127.0.0.1:5500';

(async()=>{
  const nav=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  const ctx=await nav.newContext({viewport:{width:1440,height:1000}});
  const page=await ctx.newPage();
  const journal=[];
  page.on('console',m=>journal.push(`[${m.type()}] ${m.text().slice(0,150)}`));
  page.on('pageerror',e=>journal.push(`[pageerror] ${e.message.slice(0,150)}`));

  await page.route(`${API_PROD}/**`, async r=>{
    const q=r.request();
    try{const rep=await fetch(q.url().replace(API_PROD,API_LOCAL),{method:q.method(),headers:q.headers(),
      body:['GET','HEAD'].includes(q.method())?undefined:q.postData()});
      await r.fulfill({status:rep.status,headers:{'content-type':'application/json','access-control-allow-origin':'*'},body:await rep.text()});
    }catch(e){await r.abort();}});

  // Le fichier de fond n'existe pas : c'est précisément ce qu'on teste.
  await page.route('**/kinshasa.pmtiles*', r => r.fulfill({ status: 404, body: 'absent' }));

  const j=await(await fetch(`${API_LOCAL}/api/auth/login`,{method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({identifiant:'+243810000005',mot_de_passe:'MotDePasse123!'})})).json();
  await page.addInitScript(t=>{localStorage.setItem('ec.accessToken',t.accessToken);
    localStorage.setItem('ec.refreshToken',t.refreshToken);
    localStorage.setItem('ec.permissions',JSON.stringify(t.permissions||[]));},j);

  // On configure une URL comme le ferait le client après l'extraction.
  await page.addInitScript(()=>{
    window.addEventListener('DOMContentLoaded',()=>{
      if(window.ENVIRO_CARTE) window.ENVIRO_CARTE.pmtiles =
        'https://exemple.supabase.co/storage/v1/object/public/cartes/kinshasa.pmtiles';
    });
  });

  await page.goto(`${SITE_LOCAL}/direction-operations-commerciales.html`,{waitUntil:'networkidle'});
  await page.click('.menu a[data-vue="carte"]');
  // Capturer le message d'erreur réellement émis par MapLibre.
  await page.evaluate(()=>{ window.__erreursCarte=[]; });
  await page.waitForTimeout(4000);
  const erreursCarte = await page.evaluate(()=>window.__erreursCarte||[]);
  console.log('erreurs MapLibre capturées :', JSON.stringify(erreursCarte,null,1).slice(0,600));

  const etat = await page.evaluate(()=>({
    configuree: window.CarteInteractive && window.CarteInteractive.estConfiguree(),
    maplibreCharge: !!document.querySelector('link[data-carto*="maplibre-gl.css"]'),
    pmtilesCharge: typeof window.pmtiles !== 'undefined',
    basemapsCharge: typeof window.basemaps !== 'undefined',
    hote: !!document.querySelector('.carte-hote'),
    svgRepli: !!document.querySelector('#carteDuJour .graphique svg'),
    note: (document.querySelector('#carteDuJour .note')||{}).textContent || null,
  }));

  console.log('URL configurée .................', etat.configuree ? 'oui' : 'NON');
  console.log('CSS MapLibre chargé ............', etat.maplibreCharge ? 'oui' : 'non');
  console.log('module pmtiles chargé ..........', etat.pmtilesCharge ? 'oui' : 'non');
  console.log('module basemaps chargé .........', etat.basemapsCharge ? 'oui' : 'non');
  console.log('repli SVG affiché ..............', etat.svgRepli ? 'oui' : 'NON');
  console.log('note de repli ..................', etat.note ? etat.note.trim().slice(0,120) : '—');
  const graves = journal.filter(l=>l.startsWith('[pageerror]'));
  console.log('erreurs de page ................', graves.length ? graves.join(' | ') : 'aucune');
  await page.screenshot({path:'/home/user/.local-verif/carte-maplibre-echec.png'});
  await nav.close();
})();
