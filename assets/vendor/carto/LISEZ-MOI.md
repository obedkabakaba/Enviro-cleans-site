# Bibliothèques cartographiques embarquées

Fichiers copiés depuis npm, **épinglés et servis localement** — jamais depuis un CDN.
Le cahier des charges (§22) l'exige : « une version épinglée et locale ou une stratégie
fiable compatible CSP ». Un CDN ajouterait une dépendance réseau externe à un écran
d'exploitation, et une politique de sécurité de contenu stricte le bloquerait.

| Fichier | Paquet | Version | Licence |
|---|---|---|---|
| `maplibre-gl.mjs` | maplibre-gl | 6.4.1 | BSD-3-Clause |
| `maplibre-gl-shared.mjs` | maplibre-gl | 6.4.1 | BSD-3-Clause |
| `maplibre-gl-worker.mjs` | maplibre-gl | 6.4.1 | BSD-3-Clause |
| `maplibre-gl.css` | maplibre-gl | 6.4.1 | BSD-3-Clause |
| `pmtiles.js` | pmtiles | 4.5.0 | BSD-3-Clause |
| `basemaps.js` | @protomaps/basemaps | 5.7.2 | BSD-3-Clause |

## Ne séparez pas ces fichiers

`maplibre-gl.mjs` résout `maplibre-gl-shared.mjs` et `maplibre-gl-worker.mjs`
**relativement à sa propre URL** (`import.meta.url`). Les trois doivent rester dans le
même dossier, sous ces noms exacts. Déplacer l'un des deux autres casse le rendu avec une
erreur de chargement de module difficile à relier à la cause.

## Poids, et pourquoi le chargement est différé

1,2 Mo au total. C'est pourquoi `carte-maplibre.js` ne les charge **qu'à l'ouverture de
la vue carte**, jamais au chargement d'une page. Les six autres espaces ne paient rien.

## Mise à jour

```bash
npm install maplibre-gl@<version> pmtiles@<version> @protomaps/basemaps@<version>
cp node_modules/maplibre-gl/dist/maplibre-gl{,-shared,-worker}.mjs assets/vendor/carto/
cp node_modules/maplibre-gl/dist/maplibre-gl.css assets/vendor/carto/
cp node_modules/pmtiles/dist/pmtiles.js assets/vendor/carto/
cp node_modules/@protomaps/basemaps/dist/basemaps.js assets/vendor/carto/
```

Puis mettez à jour le tableau ci-dessus, et rouvrez la vue carte : c'est le seul écran
concerné.
