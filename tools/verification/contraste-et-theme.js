/** Contraste + bascule de thème + débordement, sur les sept espaces. */
const { chromium } = require('playwright');
const API_PROD='https://enviro-cleans-api.onrender.com', API_LOCAL='http://localhost:4000';
const CIBLES=[['pdg.html','+243810000000'],['direction-financiere.html','+243810000002'],
  ['direction-rh.html','+243810000003'],['direction-operations-commerciales.html','+243810000005'],
  ['centre-technique.html','+243810000006']];

/**
 * Compose une couleur semi-transparente sur son fond.
 *
 * Sans cette composition, une pastille `rgba(58,181,74,.14)` est traitée comme un vert
 * plein : le texte vert posé dessus tombe à 1,00:1 et le contrôle hurle au défaut, alors
 * qu'à l'écran le fond est presque blanc et le contraste parfaitement bon. C'est le
 * faux positif classique de ce genre de mesure — et il décrédibilise le contrôle entier.
 */
function rgba(c){const n=(c||'').match(/[\d.]+/g);if(!n)return null;
  return {r:+n[0],g:+n[1],b:+n[2],a:n.length>3?+n[3]:1};}
function composer(dessus,dessous){
  if(!dessus)return dessous;
  if(dessus.a>=1||!dessous)return dessus;
  return {r:dessus.r*dessus.a+dessous.r*(1-dessus.a),
          g:dessus.g*dessus.a+dessous.g*(1-dessus.a),
          b:dessus.b*dessus.a+dessous.b*(1-dessus.a),a:1};}
function lum(c){const o=typeof c==='string'?rgba(c):c;
  const [r,g,b]=[o.r,o.g,o.b].map(v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);});
  return 0.2126*r+0.7152*g+0.0722*b;}
function ratio(a,b){const l1=lum(a),l2=lum(b);return (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05);}

(async()=>{
  const nav=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  let echecs=0;
  for(const theme of ['light','dark']){
    for(const largeur of [1440,390]){
      for(const [page_,tel] of CIBLES){
        const ctx=await nav.newContext({viewport:{width:largeur,height:900},colorScheme:theme});
        const page=await ctx.newPage();
        await page.route(`${API_PROD}/**`,async r=>{const q=r.request();
          try{const rep=await fetch(q.url().replace(API_PROD,API_LOCAL),{method:q.method(),headers:q.headers(),
            body:['GET','HEAD'].includes(q.method())?undefined:q.postData()});
            await r.fulfill({status:rep.status,headers:{'content-type':'application/json','access-control-allow-origin':'*'},body:await rep.text()});
          }catch(e){await r.abort();}});
        const j=await(await fetch(`${API_LOCAL}/api/auth/login`,{method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({identifiant:tel,mot_de_passe:'MotDePasse123!'})})).json();
        await page.addInitScript(t=>{localStorage.setItem('ec.accessToken',t.accessToken);
          localStorage.setItem('ec.refreshToken',t.refreshToken);
          localStorage.setItem('ec.permissions',JSON.stringify(t.permissions||[]));},j);
        await page.goto(`http://127.0.0.1:5500/${page_}`,{waitUntil:'networkidle'});
        await page.waitForTimeout(500);

        const m=await page.evaluate(()=>{
          const ech=[];
          document.querySelectorAll('body *').forEach(el=>{
            if(el.children.length>0) return;
            const t=(el.textContent||'').trim();
            if(!t||t.length<2) return;
            const st=getComputedStyle(el);
            if(parseFloat(st.fontSize)>=24||st.visibility==='hidden'||st.display==='none') return;
            // On remonte la pile des fonds jusqu'à un fond OPAQUE, en conservant tous
            // les calques traversés : c'est leur composition qui donne la couleur
            // réellement vue.
            const calques=[];let n=el;
            while(n){const f=getComputedStyle(n).backgroundColor;
              const m2=(f||'').match(/[\d.]+/g);
              if(m2){const a=m2.length>3?+m2[3]:1;
                if(a>0)calques.push(f);
                if(a>=1)break;}
              n=n.parentElement;}
            ech.push({c:st.color,calques:calques,g:parseFloat(st.fontWeight)>=700,
              s:parseFloat(st.fontSize),t:t.slice(0,26),
              sel:el.tagName.toLowerCase()+'.'+(el.className||'').toString().slice(0,22)});
          });
          const contenu=el=>{let n=el;while(n&&n!==document.documentElement){
            const ox=getComputedStyle(n).overflowX;
            if(['auto','scroll','hidden','clip'].includes(ox))return true;n=n.parentElement;}return false;};
          let bord=0,fautif=null;
          document.querySelectorAll('body *').forEach(el=>{
            const r=el.getBoundingClientRect();
            if(r.width<=0||contenu(el))return;
            if(r.right>bord){bord=r.right;fautif=el.tagName.toLowerCase()+'.'+(el.className||'').toString().slice(0,26);}
          });
          return {ech,deborde:bord>document.documentElement.clientWidth+1,bord:Math.round(bord),fautif};
        });

        let pire=99,pireEl=null;
        m.ech.forEach(e=>{
          if(!e.calques||e.calques.length===0)return;
          // Du plus profond au plus proche : chaque calque se compose sur le résultat.
          let fond=null;
          for(let i=e.calques.length-1;i>=0;i--) fond=composer(rgba(e.calques[i]),fond);
          if(!fond)return;
          const r=ratio(composer(rgba(e.c),fond),fond);
          const seuil=(e.s>=18.66&&e.g)||e.s>=24?3:4.5;
          if(r<seuil&&r<pire){pire=r;pireEl=e;}
        });
        const ok=pire===99&&!m.deborde;
        if(!ok)echecs++;
        console.log(`${ok?'✓':'✗'} ${theme.padEnd(5)} ${String(largeur).padEnd(5)} ${page_.padEnd(38)}`
          +(pire!==99?` contraste ${pire.toFixed(2)}:1 sur « ${pireEl.t} » (${pireEl.sel})`:'')
          +(m.deborde?`  ⚠ ${m.fautif} atteint ${m.bord}px`:''));
        await ctx.close();
      }
    }
  }
  // La bascule de thème doit avoir un effet — elle n'en avait aucun avant ce lot.
  for(const os of ['light','dark']){
    const ctx=await nav.newContext({viewport:{width:1280,height:800},colorScheme:os});
    const page=await ctx.newPage();
    await page.goto('http://127.0.0.1:5500/pdg.html',{waitUntil:'domcontentloaded'});
    const avant=await page.evaluate(()=>getComputedStyle(document.body).backgroundColor);
    const b=await page.$('.theme-toggle');
    if(b){await b.click();await page.waitForTimeout(300);}
    const apres=await page.evaluate(()=>getComputedStyle(document.body).backgroundColor);
    const bascule=avant!==apres;
    if(!bascule)echecs++;
    console.log(`${bascule?'✓':'✗'} bascule du thème depuis un système en ${os} : ${avant} → ${apres}`);
    await ctx.close();
  }
  await nav.close();
  console.log(echecs===0?'\n✓ contraste, responsive et bascule de thème conformes':`\n✗ ${echecs} échec(s)`);
  process.exit(echecs===0?0:1);
})();
