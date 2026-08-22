/**
 * ════════════════════════════════════════
 * VALIDATION DE LA PALETTE DES GRAPHIQUES
 * ════════════════════════════════════════
 *
 * Une couleur de série ajoutée « parce qu'elle est jolie » suffit à rendre deux courbes
 * indiscernables — pour tout le monde sur un écran médiocre, et durablement pour les
 * 8 % d'hommes qui distinguent mal le rouge du vert. Le défaut ne se voit pas sur
 * l'écran de celui qui l'introduit : c'est précisément pour cela qu'il faut le mesurer.
 *
 * Trois contrôles, sur les deux thèmes :
 *
 *   1. **Contraste avec le fond du graphique.** Une série doit ressortir de son support.
 *      Seuil retenu : 3:1, le minimum WCAG pour un élément graphique porteur de sens.
 *
 *   2. **Distance entre séries adjacentes.** Deux séries voisines dans une légende ou
 *      empilées dans un histogramme se comparent directement : leur écart perceptuel
 *      doit être franc.
 *
 *   3. **Distance entre TOUTES les paires.** Sur une carte ou un nuage de points, les
 *      voisins ne sont pas ceux de la légende. Le seuil y est plus bas — on ne peut pas
 *      exiger autant de six couleurs deux à deux — mais il existe.
 *
 * La distance est calculée en CIE76 sur L*a*b*, qui approche la perception bien mieux
 * qu'une différence RVB : deux bleus très différents en RVB peuvent être indiscernables.
 */

const fs = require('node:fs');
const path = require('node:path');

const CSS = path.join(__dirname, '..', 'assets', 'css', 'espace-direction.css');

const SEUIL_CONTRASTE_FOND = 3.0;   // WCAG 1.4.11, éléments graphiques
const SEUIL_ADJACENTES = 25;        // ΔE CIE76 entre séries voisines
const SEUIL_TOUTES_PAIRES = 12;     // ΔE minimal entre deux séries quelconques

// ── Conversions ──────────────────────────────────────────────────────────────

function versRvb(hex) {
  const h = hex.replace('#', '').trim();
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16));
}

function luminance([r, v, b]) {
  const c = [r, v, b].map((x) => {
    const s = x / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

function contraste(a, b) {
  const la = luminance(versRvb(a));
  const lb = luminance(versRvb(b));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** sRGB → CIE L*a*b* (illuminant D65). */
function versLab(hex) {
  let [r, v, b] = versRvb(hex).map((x) => x / 255);
  [r, v, b] = [r, v, b].map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));

  const X = (r * 0.4124 + v * 0.3576 + b * 0.1805) / 0.95047;
  const Y = (r * 0.2126 + v * 0.7152 + b * 0.0722) / 1.0;
  const Z = (r * 0.0193 + v * 0.1192 + b * 0.9505) / 1.08883;

  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [f(X), f(Y), f(Z)];

  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function deltaE(a, b) {
  const [l1, a1, b1] = versLab(a);
  const [l2, a2, b2] = versLab(b);
  return Math.sqrt((l1 - l2) ** 2 + (a1 - a2) ** 2 + (b1 - b2) ** 2);
}

// ── Extraction des thèmes ────────────────────────────────────────────────────

/**
 * Le CSS déclare la palette claire sur `:root` nu, puis la redéfinit sous
 * `@media (prefers-color-scheme: dark)` — avec le garde `:not([data-theme="light"])` —
 * et sous `:root[data-theme="dark"]`. On lit les deux thèmes : une palette valide en
 * clair peut être illisible en sombre, et l'inverse.
 *
 * ── Pourquoi un vrai découpage ──
 *
 * Une première version découpait le fichier sur `/(?=@media|:root)/`. Un bloc
 * `@media (...) { :root:not([data-theme="light"]) { … } }` se retrouvait coupé en deux :
 * le morceau portant les couleurs perdait son contexte `@media`, était classé « clair »,
 * et écrasait la vraie palette claire. Les deux thèmes rapportaient alors des valeurs
 * IDENTIQUES — le contrôle validait deux fois le même, en annonçant qu'il en vérifiait
 * deux.
 *
 * On suit donc les accolades, en gardant trace de la règle englobante.
 */
function extraireThemes(css) {
  const themes = {
    clair: { nom: 'clair', series: {}, fond: null },
    sombre: { nom: 'sombre', series: {}, fond: null },
  };

  // Découpage en blocs { … } avec leur sélecteur et leur at-rule englobante.
  const blocs = [];
  let atRule = null;
  let profondeur = 0;
  let debutSelecteur = 0;
  let selecteur = '';
  let debutCorps = 0;

  for (let i = 0; i < css.length; i += 1) {
    const c = css[i];
    if (c === '{') {
      profondeur += 1;
      if (profondeur === 1) {
        selecteur = css.slice(debutSelecteur, i).trim();
        if (selecteur.startsWith('@')) { atRule = selecteur; debutSelecteur = i + 1; }
        else { debutCorps = i + 1; }
      } else if (profondeur === 2 && atRule) {
        selecteur = css.slice(debutSelecteur, i).trim();
        debutCorps = i + 1;
      }
    } else if (c === '}') {
      if ((profondeur === 1 && !atRule) || (profondeur === 2 && atRule)) {
        blocs.push({ atRule, selecteur, corps: css.slice(debutCorps, i) });
      }
      profondeur -= 1;
      if (profondeur === 0) atRule = null;
      debutSelecteur = i + 1;
    }
  }

  for (const bloc of blocs) {
    if (!/--serie-|--graphique-fond|--surface\s*:/.test(bloc.corps)) continue;

    // Sombre si l'at-rule le dit, OU si le sélecteur nomme explicitement le thème.
    const sombre = /prefers-color-scheme:\s*dark/.test(bloc.atRule || '')
      || /\[data-theme="dark"\]/.test(bloc.selecteur);
    // Un bloc qui vise explicitement le clair ne doit pas être compté comme neutre.
    const clairExplicite = /\[data-theme="light"\]/.test(bloc.selecteur)
      && !/:not\(\[data-theme="light"\]\)/.test(bloc.selecteur);

    const cibles = sombre ? ['sombre'] : (clairExplicite ? ['clair'] : ['clair', 'sombre']);
    // Un `:root` nu définit la base des DEUX thèmes : le sombre ne redéfinit que ce
    // qu'il change. Ne pas l'appliquer aux deux laisserait le sombre incomplet.

    for (const nom of cibles) {
      for (const m of bloc.corps.matchAll(/--serie-(\d+)\s*:\s*(#[0-9a-fA-F]{3,8})/g)) {
        themes[nom].series[Number(m[1])] = m[2];
      }
      const fond = (bloc.corps.match(/--graphique-fond\s*:\s*(#[0-9a-fA-F]{3,8})/)
        || bloc.corps.match(/--surface\s*:\s*(#[0-9a-fA-F]{3,8})/) || [])[1];
      if (fond) themes[nom].fond = fond;
    }
  }

  return Object.values(themes).filter((t) => Object.keys(t.series).length);
}

// ── Contrôles ────────────────────────────────────────────────────────────────

const css = fs.readFileSync(CSS, 'utf8');
const themes = extraireThemes(css);
const echecs = [];

if (!themes.length) {
  console.error('✗ Aucune palette --serie-N trouvée : le contrôle ne vérifie rien.');
  process.exit(1);
}

for (const theme of themes) {
  const numeros = Object.keys(theme.series).map(Number).sort((a, b) => a - b);
  const couleurs = numeros.map((n) => theme.series[n]);

  if (couleurs.length < 3) {
    echecs.push(`${theme.nom} : ${couleurs.length} série(s) seulement — palette incomplète.`);
    continue;
  }

  // 1. Contraste avec le fond
  if (theme.fond) {
    for (const [i, c] of couleurs.entries()) {
      const r = contraste(c, theme.fond);
      if (r < SEUIL_CONTRASTE_FOND) {
        echecs.push(
          `${theme.nom} : série ${numeros[i]} (${c}) contraste ${r.toFixed(2)}:1 avec le `
          + `fond ${theme.fond} — minimum ${SEUIL_CONTRASTE_FOND}:1. La série ne ressort pas.`
        );
      }
    }
  }

  // 2. Séries adjacentes
  for (let i = 0; i < couleurs.length - 1; i += 1) {
    const d = deltaE(couleurs[i], couleurs[i + 1]);
    if (d < SEUIL_ADJACENTES) {
      echecs.push(
        `${theme.nom} : séries ${numeros[i]} (${couleurs[i]}) et ${numeros[i + 1]} `
        + `(${couleurs[i + 1]}) — ΔE ${d.toFixed(1)}, minimum ${SEUIL_ADJACENTES}. `
        + 'Deux séries voisines dans une légende se comparent directement.'
      );
    }
  }

  // 3. Toutes les paires
  for (let i = 0; i < couleurs.length; i += 1) {
    for (let j = i + 1; j < couleurs.length; j += 1) {
      const d = deltaE(couleurs[i], couleurs[j]);
      if (d < SEUIL_TOUTES_PAIRES) {
        echecs.push(
          `${theme.nom} : séries ${numeros[i]} et ${numeros[j]} — ΔE ${d.toFixed(1)}, `
          + `minimum ${SEUIL_TOUTES_PAIRES}. Indiscernables sur une carte ou un nuage.`
        );
      }
    }
  }

  console.log(
    `${theme.nom} : ${couleurs.length} séries${theme.fond ? `, fond ${theme.fond}` : ''} — `
    + `ΔE adjacent minimal ${Math.min(...couleurs.slice(0, -1).map((c, i) => deltaE(c, couleurs[i + 1]))).toFixed(1)}`
  );
}

if (echecs.length) {
  console.error('\n✗ Palette non conforme :');
  for (const e of echecs) console.error(`  - ${e}`);
  process.exit(1);
}

console.log('\n✓ Palette conforme sur tous les thèmes.');
