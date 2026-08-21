# Contrôles frontend

Deux scripts qui pilotent un vrai navigateur. Le cahier des charges (§24) demande des
contrôles de « liens, routes, syntaxe JavaScript, protections de rôle, appels API,
responsive et thème » : les voici, exécutables.

## Prérequis

Une API et un serveur statique en local, plus un jeu de données :

```bash
cd ../Enviro-cleans-bakend
bash tools/base-locale.sh                   # base + migrations + démonstration
COMPTES_DEV=je-confirme npm run comptes:dev # un compte par rôle
npm start &                                 # API sur :4000

cd ../Enviro-cleans-site
python3 -m http.server 5500 --bind 127.0.0.1 &

npm --prefix /tmp/verif install playwright  # ou toute installation de Playwright
```

## `parcourir-les-espaces.js`

Ouvre les sept espaces, **avec le rôle qui leur correspond**, clique sur chaque entrée
de menu et vérifie qu'aucune vue n'affiche de bloc d'erreur, qu'aucun appel API ne
répond en 4xx/5xx, et qu'aucune erreur de console n'apparaît.

C'est aussi le contrôle des permissions : un menu réservé qui s'afficherait pour un rôle
qui n'y a pas droit produirait un 403 visible ici.

## `contraste-et-theme.js`

Mesure le contraste réel de chaque texte — **en composant les fonds semi-transparents**,
sans quoi une pastille teintée à 14 % est prise pour un aplat et le contrôle rapporte
des défauts qui n'existent pas.

Vérifie aussi qu'aucun élément ne déborde horizontalement (en ignorant ce qui défile
légitimement dans son propre conteneur), et que **le bouton de bascule du thème a un
effet réel** — il n'en avait aucun sur ces pages avant août 2026, et rien ne le
signalait.
