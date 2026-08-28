/**
 * ════════════════════════════════════════
 * FOND DE CARTE — CONFIGURATION
 * ════════════════════════════════════════
 *
 * Le seul fichier à modifier après avoir produit `kinshasa.pmtiles`
 * (voir `tools/extraire-carte-kinshasa.sh`).
 *
 * Tant que `pmtiles` est vide, la carte fonctionne SANS fond de plan : les positions,
 * les tournées et l'échelle restent exactes. Ce n'est pas un mode dégradé accidentel,
 * c'est le comportement par défaut assumé — la plateforme ne dépend d'aucun service
 * cartographique pour fonctionner.
 */

window.ENVIRO_CARTE = {
  /**
   * URL du fichier .pmtiles.
   *
   * ── Deux façons de le servir ──
   *
   * 1. **Depuis ce dépôt** (le plus simple). GitHub Pages gère les requêtes par plage
   *    HTTP, et le fichier est alors servi depuis la MÊME origine que la page : aucun
   *    CORS à configurer, aucun compartiment, aucune clé.
   *
   *        pmtiles: 'assets/cartes/kinshasa.pmtiles'
   *
   *    GitHub refuse les fichiers de plus de 100 Mo ; le script d'extraction vérifie la
   *    taille et le dit avant que vous n'engagiez quoi que ce soit.
   *
   * 2. **Depuis Supabase Storage.** Le compartiment doit être PUBLIC et autoriser
   *    l'origine du site : le navigateur lit le fichier par plages HTTP, ce qui exige
   *    une réponse CORS correcte.
   *
   *        pmtiles: 'https://xxxx.supabase.co/storage/v1/object/public/cartes/kinshasa.pmtiles'
   *
   * Produire le fichier : `bash tools/extraire-carte-kinshasa.sh`. Une seule commande,
   * un seul binaire à installer, aucun abonnement ni clé d'API.
   */
  pmtiles: '',

  /**
   * Polices des libellés (noms de rues et de communes).
   *
   * ── Le compromis, énoncé clairement ──
   *
   * MapLibre a besoin de fichiers de police pour DESSINER du texte. Par défaut, cette
   * URL pointe vers l'hébergement public de Protomaps : c'est le seul appel externe de
   * toute la plateforme. S'il est bloqué — politique de sécurité stricte, réseau coupé —
   * la carte s'affiche quand même, **sans les noms de rues**. La géométrie, vos points
   * et vos tournées ne dépendent pas de ce fichier.
   *
   * Pour supprimer cette dernière dépendance : téléchargez
   * https://github.com/protomaps/basemaps-assets (dossier `fonts`), déposez-le à côté
   * du .pmtiles, et pointez cette URL dessus. Vous serez alors totalement autonome.
   */
  glyphs: 'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf',

  /** Teinte du fond. `light` ou `dark` sont choisis automatiquement selon le thème. */
  flaveur: { clair: 'light', sombre: 'dark' },
};
