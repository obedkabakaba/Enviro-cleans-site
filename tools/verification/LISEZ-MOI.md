# Contrôles frontend

Des scripts qui pilotent un vrai navigateur. Le cahier des charges (§24) demande des
contrôles de « liens, routes, syntaxe JavaScript, protections de rôle, appels API,
responsive et thème » : les voici, exécutables.

## Prérequis

Une API et un serveur statique en local, plus un jeu de données :

```bash
cd ../Enviro-cleans-bakend
bash tools/base-locale.sh                   # base + migrations + démonstration
COMPTES_DEV=je-confirme npm run comptes:dev # un compte par rôle
AMORCER_CIRCUITS=je-confirme \
  npm run circuits:amorcer                  # les 21 circuits, joués par de vrais comptes
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

## `carte-repli.js`

Vérifie que la carte **ne casse jamais** quand le fond de plan manque. Il simule un
fichier `.pmtiles` absent (404) et contrôle que :

- le contrôle préalable détecte l'absence **avant** de télécharger 1,2 Mo de modules ;
- la carte SVG s'affiche à la place, avec ses points et ses tournées ;
- la note dit la vraie cause — « fichier introuvable », pas « erreur de chargement ».

C'est le scénario le plus probable en exploitation : quelqu'un renomme le fichier,
le compartiment repasse en privé, ou l'URL change. La vue doit continuer de servir.

## `carte-style.js`

Contrôle que l'API de style de Protomaps est utilisée correctement — `namedFlavor` en
clair et en sombre, `layers()` produisant des couches toutes rattachées à la bonne
source. Un style invalide échouerait silencieusement par un fond gris.

## `redirection-par-role.js`

Se connecte **réellement** depuis `espace-client.html`, avec chaque rôle, et vérifie où
l'on atterrit et combien de menus s'affichent.

C'est le contrôle qui manquait : le PDG pouvait être redirigé vers l'ancienne page
consolidée sans que rien ne le signale — l'espace existait, les tests passaient, et
personne ne voyait que la porte d'entrée ne menait pas au bon endroit.

Il couvre aussi la table de repli de la page de connexion, qui ne connaissait aucun des
sept nouveaux rôles : un backend plus ancien que la page envoyait alors un directeur
vers `dashboard.html`, c'est-à-dire l'espace **client**.

## `parcours-circuits.js`

La preuve que les circuits métier fonctionnent **devant un utilisateur**, contre la pile
complète : PostgreSQL, l'API, les pages, Chromium.

Les contrôles statiques lisent le code ; les tests d'intégration exercent le serveur. Ni
les uns ni les autres ne disent si un directeur, devant son écran, voit le bouton et si
le clic écrit quelque chose. Ce script le dit.

Il vérifie quatre choses, et chacune a déjà manqué :

- **la file « Décisions attendues » affiche des pièces réelles**, nommées — une
  permission sans écran pour l'exercer n'est pas une fonctionnalité ;
- **un clic écrit RÉELLEMENT en base** : l'état est relu par l'API avant et après, et le
  script échoue si l'écran a montré un succès que le serveur n'a pas écrit ;
- **la pièce traitée sort de la file** — sans le rechargement après commande, le compteur
  mentirait et l'on cliquerait deux fois ;
- **les neuf états de tournée sont nommés en clair** — « brouillon » affiché tel quel
  ressemble à une panne plutôt qu'à une étape.

```bash
API_LOCALE=http://localhost:4000 \
WEB_LOCALE=http://127.0.0.1:5500 \
CAPTURES=/tmp/captures-circuits \
node tools/verification/parcours-circuits.js
```

Le script **relaie lui-même** les appels vers l'API de production (codée en dur dans
`enviro-api.js`) vers la pile locale : aucune requête ne part vers la vraie production
pendant une vérification.

Il dépose deux captures d'écran dans `CAPTURES` : la file des décisions du PDG avant et
après une commande, et la vue des tournées avec ses filtres d'état.
