# Fond de carte

Ce dossier reçoit `kinshasa.pmtiles` : le fond OpenStreetMap de Kinshasa, en un seul
fichier, servi par GitHub Pages depuis la **même origine** que les pages. Aucun CORS à
configurer, aucun compartiment, aucune clé d'API, aucun quota de tuiles.

Il est vide tant que le fond n'a pas été produit. La carte fonctionne quand même : elle
affiche les positions et les distances exactes, sans les rues — et le dit au-dessus
d'elle plutôt que de laisser croire à une panne.

## Le produire

**Sans ordinateur** — onglet *Actions* du dépôt, workflow **« Fond de carte »**,
*Run workflow*. Le fichier est extrait, vérifié, déposé ici et branché dans
`assets/js/carte-config.js` automatiquement. Fonctionne depuis un téléphone.

**Avec un ordinateur** — `bash tools/extraire-carte-kinshasa.sh`.

## Ce qu'il faut savoir avant

Le fichier reste dans l'historique du dépôt, définitivement. Le zoom maximal décide de sa
taille ; chaque niveau supplémentaire la multiplie par environ quatre. GitHub refuse
au-delà de 100 Mo, et le workflow s'arrête avant de commiter s'il en approche.

## Licence

Données © OpenStreetMap, sous licence ODbL. L'attribution est affichée sur la carte et
doit y rester.
