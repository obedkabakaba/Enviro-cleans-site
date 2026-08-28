#!/usr/bin/env bash
#
# ════════════════════════════════════════
# EXTRAIRE LE FOND DE CARTE DE KINSHASA
# ════════════════════════════════════════
#
# Produit un fichier `kinshasa.pmtiles` : le fond de carte OpenStreetMap de Kinshasa,
# en UN SEUL fichier, à déposer sur Supabase Storage. Le navigateur le lit ensuite
# directement par plages HTTP — pas de serveur de tuiles, pas de clé d'API, pas de quota.
#
# ── À exécuter UNE FOIS, sur votre machine ──
#
# Pas en production, pas dans un déploiement. C'est une extraction ponctuelle, à refaire
# une ou deux fois par an si vous voulez un fond à jour.
#
# ── Ce que le script NE fait PAS ──
#
# Il ne télécharge pas la planète. `pmtiles extract` ne récupère que les octets
# correspondant à la zone demandée, directement depuis la construction distante.
#
# Il ne dépose rien sur Supabase : le versement se fait à la main, ou avec la commande
# affichée à la fin. Un script qui téléverse tout seul demanderait vos identifiants.
#
# ── Prérequis ──
#
#   pmtiles   https://github.com/protomaps/PMTiles/releases  (un seul binaire)
#
# Usage :
#   bash tools/extraire-carte-kinshasa.sh [zoom_max] [construction_source]

set -euo pipefail

ZOOM_MAX="${1:-15}"

# ── Emprise de Kinshasa ──
#
# Volontairement large : elle couvre la ville de Ngaliema à l'ouest jusqu'à la Nsele à
# l'est, et englobe les communes d'expansion (Ndjili, Masina, Nsele) autant que le
# centre. Serrer l'emprise ferait gagner quelques mégaoctets et couperait la carte
# exactement là où l'entreprise compte se développer.
OUEST="15.15"
SUD="-4.52"
EST="15.75"
NORD="-4.20"

# La construction quotidienne de Protomaps. L'URL est un paramètre parce qu'elle porte
# une date : le script VÉRIFIE qu'elle répond avant de lancer l'extraction, plutôt que
# d'échouer au milieu avec un message incompréhensible.
SOURCE="${2:-https://build.protomaps.com/$(date -u -d 'yesterday' +%Y%m%d).pmtiles}"

SORTIE="kinshasa.pmtiles"

echo "── Vérifications ────────────────────────────────────────────────"
if ! command -v pmtiles >/dev/null 2>&1; then
  cat >&2 <<'AIDE'
REFUS : la commande `pmtiles` est introuvable.

Installez-la depuis https://github.com/protomaps/PMTiles/releases
(un seul binaire, rien à compiler), puis relancez ce script.
AIDE
  exit 1
fi
echo "   pmtiles : $(command -v pmtiles)"

echo "   source  : $SOURCE"
if ! curl -sS -f -r 0-1023 -o /dev/null "$SOURCE" 2>/dev/null; then
  cat >&2 <<AIDE

REFUS : la construction source ne répond pas.

  $SOURCE

Deux causes possibles :
  1. la construction de cette date n'existe pas encore ou plus — essayez une autre :
       bash tools/extraire-carte-kinshasa.sh $ZOOM_MAX https://build.protomaps.com/AAAAMMJJ.pmtiles
  2. vous êtes derrière un réseau qui bloque ce domaine.

La liste des constructions disponibles est publiée sur https://docs.protomaps.com
(section « Basemap Downloads »). Vérifiez-y l'URL courante : elle porte une date, et
ce script suppose celle d'hier par défaut.
AIDE
  exit 1
fi
echo "   la source répond."

echo
echo "── Extraction ───────────────────────────────────────────────────"
echo "   emprise  : $OUEST,$SUD → $EST,$NORD  (Kinshasa, Nsele et Ndjili compris)"
echo "   zoom max : $ZOOM_MAX"
echo "   Seuls les octets de cette emprise sont téléchargés."
echo

pmtiles extract "$SOURCE" "$SORTIE" \
  --bbox="$OUEST,$SUD,$EST,$NORD" \
  --maxzoom="$ZOOM_MAX"

TAILLE=$(du -h "$SORTIE" | cut -f1)
OCTETS=$(wc -c < "$SORTIE")
echo
echo "✓ $SORTIE produit — $TAILLE"
echo

# ── La taille décide de la voie de dépôt ──
#
# GitHub refuse tout fichier de plus de 100 Mo. Le découvrir au moment du `git push`,
# après avoir commité un binaire, coûte une manipulation d'historique désagréable. On
# tranche donc ici, tant que le fichier n'est engagé nulle part.
LIMITE_GITHUB=$((100 * 1000 * 1000))

echo "── Et maintenant ────────────────────────────────────────────────"

if [ "$OCTETS" -lt "$LIMITE_GITHUB" ]; then
cat <<AIDE
VOIE 1 — GitHub Pages (la plus simple, recommandée)

Votre site est déjà servi par GitHub Pages, qui gère les requêtes par plage HTTP : c'est
tout ce dont pmtiles a besoin. Le fichier étant servi depuis la MÊME origine que la page,
il n'y a aucun CORS à configurer, aucun compartiment à créer, aucune clé à gérer.

  mkdir -p assets/cartes
  mv $SORTIE assets/cartes/

Puis dans assets/js/carte-config.js :

      window.ENVIRO_CARTE = {
        pmtiles: 'assets/cartes/kinshasa.pmtiles',
      };

Puis :

  git add assets/cartes/kinshasa.pmtiles assets/js/carte-config.js
  git commit -m "Fond de carte OpenStreetMap de Kinshasa"
  git push

Le fichier pèse $TAILLE, sous la limite de 100 Mo de GitHub. Il alourdit le dépôt de
façon permanente : c'est le prix d'un fond de carte sans dépendance externe, et il se
paie une fois.
AIDE
else
cat <<AIDE
Le fichier pèse $TAILLE — au-dessus de la limite de 100 Mo de GitHub. Deux options :

  a) Relancez avec un zoom maximal plus bas (14 reste à l'échelle de la rue) :
         bash tools/extraire-carte-kinshasa.sh 14
     Chaque niveau de zoom en moins divise la taille par environ quatre.

  b) Utilisez la voie Supabase ci-dessous.
AIDE
fi

cat <<AIDE

VOIE 2 — Supabase Storage

1. Déposez le fichier dans Supabase → Storage, dans un compartiment PUBLIC
   (nommez-le « cartes » par exemple).

2. Le compartiment doit autoriser les requêtes par plage et l'origine de votre site.
   Dans Supabase → Storage → Configuration, ajoutez l'origine :
       https://obedkabakaba.github.io

3. Copiez l'URL publique du fichier, puis renseignez-la dans
   assets/js/carte-config.js :

       window.ENVIRO_CARTE = {
         pmtiles: 'https://VOTRE-PROJET.supabase.co/storage/v1/object/public/cartes/kinshasa.pmtiles',
       };

── Dans les deux cas ────────────────────────────────────────────

Rouvrez « Carte en direct » (opérations) ou « Terrain & carte clients » (PDG). Sans URL,
ou si le fichier est injoignable, la carte reste celle d'aujourd'hui — points et tournées
exacts, sans les rues. Rien ne casse, et la note sous la carte dit laquelle des trois
causes s'applique : fichier absent, accès refusé, ou origine non autorisée.

Les noms de rues viennent d'un second fichier, les polices de libellés, servies par
défaut depuis protomaps.github.io. Si votre réseau le bloque, la carte s'affiche sans les
noms — et le dit — au lieu de disparaître.

Rappel de licence : les données sont sous ODbL. L'attribution « © OpenStreetMap »
est affichée sur la carte, et elle doit y rester.
AIDE
