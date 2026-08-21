/**
 * Tests du transport public (connexion et réveil Render).
 *
 * Exécution : node tools/test-api-public.cjs
 * Aucune dépendance : fetch, localStorage et le délai sont simulés.
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const SCRIPT = path.resolve(__dirname, '../assets/js/enviro-api.js');

function localStorageFactice() {
  const valeurs = new Map();
  return {
    getItem: (cle) => (valeurs.has(cle) ? valeurs.get(cle) : null),
    setItem: (cle, valeur) => valeurs.set(cle, String(valeur)),
    removeItem: (cle) => valeurs.delete(cle),
  };
}

function reponse(status, corps, type = 'application/json') {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: () => type },
    text: () => Promise.resolve(corps),
    json: () => Promise.resolve(JSON.parse(corps || '{}')),
  };
}

function chargerFetch(scenarios) {
  const appels = [];
  let index = 0;
  const fetch = (url, options) => {
    appels.push({ url, options });
    const scenario = scenarios[Math.min(index, scenarios.length - 1)];
    index += 1;
    return scenario instanceof Error ? Promise.reject(scenario) : Promise.resolve(scenario);
  };
  const stockage = localStorageFactice();
  const window = {
    fetch,
    localStorage: stockage,
    location: { replace: () => {} },
    setTimeout: (fn) => { fn(); return 1; },
  };
  const contexte = vm.createContext({
    window,
    fetch,
    localStorage: stockage,
    Promise,
    JSON,
    Object,
    console,
  });
  vm.runInContext(fs.readFileSync(SCRIPT, 'utf8'), contexte);
  return { api: window.EnviroAPI, appels };
}

async function principal() {
  console.log('\n  TRANSPORT PUBLIC — connexion multi-navigateur\n');

  {
    const { api, appels } = chargerFetch([
      reponse(503, '<h1>Service Unavailable</h1>', 'text/html'),
      reponse(200, '{"accessToken":"ok"}'),
    ]);
    const resultat = await api.appelPublic('/api/auth/login', {
      method: 'POST', body: { identifiant: 'x', mot_de_passe: 'y' },
    });
    assert.equal(resultat.ok, true);
    assert.equal(resultat.data.accessToken, 'ok');
    assert.equal(appels.length, 2, 'un 503 Render doit être retenté');
    console.log('  ok   une page HTML 503 est relue puis retentée');
  }

  {
    const { api, appels } = chargerFetch([
      new TypeError('connexion interrompue'),
      new TypeError('connexion interrompue'),
      reponse(200, '{"status":"ok"}'),
    ]);
    const resultat = await api.appelPublic('/api/health');
    assert.equal(resultat.ok, true);
    assert.equal(appels.length, 3, 'une rupture réseau transitoire doit être retentée');
    assert.equal(Object.keys(appels[0].options.headers).length, 0,
      'le réveil GET doit rester une requête CORS simple');
    console.log('  ok   deux ruptures réseau transitoires sont absorbées');
  }

  {
    const { api, appels } = chargerFetch([reponse(401, '{"message":"Refusé"}')]);
    const resultat = await api.appelPublic('/api/auth/login', {
      method: 'POST', body: { identifiant: 'x', mot_de_passe: 'faux' },
    });
    assert.equal(resultat.status, 401);
    assert.equal(resultat.data.message, 'Refusé');
    assert.equal(appels.length, 1, 'une erreur métier ne doit jamais être retentée');
    console.log('  ok   un 401 reste une réponse métier, sans rejeu');
  }

  {
    const { api, appels } = chargerFetch([new TypeError('CORS ou réseau')]);
    await assert.rejects(
      api.appelPublic('/api/auth/login', { method: 'POST', body: {} }),
      (err) => err && err.code === 'RESEAU_INDISPONIBLE'
    );
    assert.equal(appels.length, 3, 'le nombre de tentatives doit être borné');
    console.log('  ok   un échec permanent est borné et correctement classé');
  }

  console.log('\n  4 tests du transport public passent.\n');
}

principal().catch((err) => {
  console.error(err);
  process.exit(1);
});
