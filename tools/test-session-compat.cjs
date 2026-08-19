/**
 * Test du pontage de session (assets/js/enviro-session-compat.js).
 *
 * Ce script est la garantie que le passage de l'access token de 24 h à 2 h ne
 * déconnecte PAS les six espaces historiques, dont aucun n'implémente le
 * renouvellement. Le vérifier à la main en production n'est pas une option :
 * le symptôme n'apparaîtrait que deux heures après le déploiement.
 *
 * Exécution :  node tools/test-session-compat.cjs
 *
 * Aucune dépendance : on simule localStorage et fetch, et on charge le script du
 * navigateur dans un contexte `window` factice.
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const BASE_URL = 'https://enviro-cleans-api.onrender.com';
const SCRIPT = path.resolve(__dirname, '../assets/js/enviro-session-compat.js');

let echecs = 0;
const suite = [];

/** Enregistre un test. L'exécution est séquentielle et attend les fonctions async. */
function test(nom, fn) {
  suite.push({ nom, fn });
}

async function executerSuite() {
  for (const { nom, fn } of suite) {
    try {
      // `await` même sur une fonction synchrone : sans lui, un échec asynchrone
      // deviendrait un rejet non géré et le test serait compté comme réussi.
      await fn();
      console.log(`  ok   ${nom}`);
    } catch (err) {
      echecs += 1;
      console.error(`  FAIL ${nom}\n       ${err.message}`);
    }
  }
}

/** localStorage minimal, suffisant pour ce script. */
function creerLocalStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    _dump: () => Object.fromEntries(store),
  };
}

/**
 * Charge le script dans un contexte isolé et retourne le `window` factice.
 * `reponses` est une fonction (url, options) → { status, json }.
 */
function chargerScript(localStorage, reponses) {
  const appels = [];

  const fauxFetch = (ressource, options) => {
    const url = typeof ressource === 'string' ? ressource : ressource.url;
    appels.push({ url, options });
    const r = reponses(url, options);
    return Promise.resolve({
      status: r.status,
      ok: r.status >= 200 && r.status < 300,
      json: () => Promise.resolve(r.json || {}),
    });
  };

  const window = { fetch: fauxFetch, localStorage, Headers, Object, Promise, JSON };
  const contexte = vm.createContext({ window, localStorage, Headers, console, Promise, JSON, Object });

  vm.runInContext(fs.readFileSync(SCRIPT, 'utf8'), contexte);
  return { window, appels };
}

console.log('\n  PONTAGE DE SESSION — pages historiques\n');

test('le script s’installe et détecte la clé de la page', () => {
  const ls = creerLocalStorage({ gestAccessToken: 'vieux', gestRefreshToken: 'refresh-1' });
  const { window } = chargerScript(ls, () => ({ status: 200 }));

  assert.equal(window.EnviroSessionCompat.actif, true);
  assert.deepEqual(
    Array.from(window.EnviroSessionCompat.clesDetectees()),
    ['gestAccessToken']
  );
});

test('les appels hors API Enviro Cleans ne sont pas interceptés', async () => {
  const ls = creerLocalStorage({ gestAccessToken: 'vieux', gestRefreshToken: 'refresh-1' });
  const { window, appels } = chargerScript(ls, () => ({ status: 401 }));

  await window.fetch('https://exemple.test/autre-chose');
  assert.equal(appels.length, 1, 'un 401 externe ne doit pas déclencher de renouvellement');
});

test('RÉGRESSION : un 401 déclenche le renouvellement et rejoue la requête', async () => {
  const ls = creerLocalStorage({ gestAccessToken: 'expire', gestRefreshToken: 'refresh-1' });

  let premierAppel = true;
  const { window, appels } = chargerScript(ls, (url) => {
    if (url.includes('/api/auth/refresh')) {
      return { status: 200, json: { accessToken: 'neuf', refreshToken: 'refresh-2' } };
    }
    if (premierAppel) { premierAppel = false; return { status: 401 }; }
    return { status: 200, json: { ok: true } };
  });

  const reponse = await window.fetch(BASE_URL + '/api/gestionnaire/dashboard', {
    headers: { Authorization: 'Bearer expire' },
  });

  assert.equal(reponse.status, 200, 'la requête rejouée doit réussir');

  const urls = appels.map((a) => a.url);
  assert.equal(urls.length, 3, `attendu 3 appels (401, refresh, rejeu), obtenu ${urls.length}`);
  assert.ok(urls[1].includes('/api/auth/refresh'), 'le 2e appel doit être le renouvellement');

  // Le token neuf doit être écrit dans la clé que la page lit réellement.
  assert.equal(ls.getItem('gestAccessToken'), 'neuf', 'la page doit recevoir le token renouvelé');
  assert.equal(ls.getItem('gestRefreshToken'), 'refresh-2');

  // Et l'en-tête du rejeu doit porter le nouveau token, pas l'ancien.
  const entetesRejeu = appels[2].options.headers;
  assert.equal(entetesRejeu.get('Authorization'), 'Bearer neuf');
});

test('aucune clé n’est CRÉÉE pour un espace que la page n’utilise pas', async () => {
  const ls = creerLocalStorage({ gestAccessToken: 'expire', gestRefreshToken: 'refresh-1' });

  let premier = true;
  const { window } = chargerScript(ls, (url) => {
    if (url.includes('/api/auth/refresh')) {
      return { status: 200, json: { accessToken: 'neuf', refreshToken: 'refresh-2' } };
    }
    if (premier) { premier = false; return { status: 401 }; }
    return { status: 200 };
  });

  await window.fetch(BASE_URL + '/api/gestionnaire/dashboard');

  const cles = Array.from(Object.keys(ls._dump())).sort();
  assert.deepEqual(cles, ['gestAccessToken', 'gestRefreshToken'],
    `des clés parasites ont été créées : ${cles.join(', ')}`);
});

test('sans refresh token, le 401 d’origine est rendu tel quel', async () => {
  const ls = creerLocalStorage({ gestAccessToken: 'expire' }); // pas de refresh
  const { window } = chargerScript(ls, () => ({ status: 401 }));

  const reponse = await window.fetch(BASE_URL + '/api/gestionnaire/dashboard');
  assert.equal(reponse.status, 401, 'la page doit voir le 401 et appliquer sa propre déconnexion');
});

test('un refresh token refusé ne boucle pas', async () => {
  const ls = creerLocalStorage({ gestAccessToken: 'expire', gestRefreshToken: 'perime' });

  let appelsRefresh = 0;
  const { window } = chargerScript(ls, (url) => {
    if (url.includes('/api/auth/refresh')) { appelsRefresh += 1; return { status: 401 }; }
    return { status: 401 };
  });

  const reponse = await window.fetch(BASE_URL + '/api/gestionnaire/dashboard');
  assert.equal(reponse.status, 401);
  assert.equal(appelsRefresh, 1, 'un seul renouvellement doit être tenté');
});

test('la connexion et le renouvellement ne s’auto-interceptent pas', async () => {
  const ls = creerLocalStorage({});
  const { window, appels } = chargerScript(ls, () => ({ status: 401 }));

  await window.fetch(BASE_URL + '/api/auth/login', { method: 'POST' });
  assert.equal(appels.length, 1, 'un login refusé ne doit pas déclencher de renouvellement');
});

executerSuite().then(() => {
  if (echecs > 0) {
    console.error(`\n  ${echecs} test(s) en échec.\n`);
    process.exit(1);
  }
  console.log(`\n  ${suite.length} tests du pontage de session passent.\n`);
});
