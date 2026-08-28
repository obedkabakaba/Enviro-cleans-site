/** Vérifie que basemaps.layers() et namedFlavor() existent et produisent un style valide. */
const { chromium } = require('playwright');
(async()=>{
  const nav=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  const page=await (await nav.newContext()).newPage();
  page.on('pageerror',e=>console.log('[pageerror]',e.message.slice(0,200)));
  const SITE_LOCAL = process.env.SITE_LOCAL || 'http://127.0.0.1:5500';
  await page.goto(`${SITE_LOCAL}/direction-operations-commerciales.html`,{waitUntil:'domcontentloaded'});
  const r = await page.evaluate(async () => {
    const s=document.createElement('script'); s.src='assets/vendor/carto/basemaps.js';
    await new Promise((ok,ko)=>{s.onload=ok;s.onerror=ko;document.head.appendChild(s);});
    const out={ api: Object.keys(window.basemaps).slice(0,20) };
    try{
      const flaveur = window.basemaps.namedFlavor('light');
      out.flaveurOk = !!flaveur;
      out.flaveurCles = Object.keys(flaveur||{}).slice(0,8);
      const couches = window.basemaps.layers('protomaps', flaveur, { lang:'fr' });
      out.nbCouches = Array.isArray(couches) ? couches.length : null;
      out.premiere = couches && couches[0] ? { id:couches[0].id, type:couches[0].type, source:couches[0].source } : null;
      out.sourcesReferencees = [...new Set((couches||[]).map(c=>c.source).filter(Boolean))];
      out.sourceLayers = [...new Set((couches||[]).map(c=>c['source-layer']).filter(Boolean))].slice(0,10);
      const flaveurSombre = window.basemaps.namedFlavor('dark');
      out.sombreOk = !!flaveurSombre;
    }catch(e){ out.erreur = e.message; }
    return out;
  });
  console.log(JSON.stringify(r,null,1));
  await nav.close();
})();
