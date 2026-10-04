# Étude de végétation — première zone

Base : main, 5d9b1027c4b245d04bf33c3ad8a22d3a549cb578. Branche : feat/lush-environment.

Trois géométries originales procédurales (aucun asset externe) : buisson, fougère,
herbe haute. Six massifs, 216 plantes maximum, trois instanced meshes et vent léger.
Le mode réduit conserve les buissons et divise les petites plantes par deux.

## Aperçu isolé

Depuis web : `npx vite --config vite.lush.config.js`.
Build : `npx vite build --config vite.lush.config.js` (dist-lush/).
La scène est un décor d'étude simplifié, pas une capture de la carte actuelle.
Même composant et mêmes géométries que le jeu. Avant/après, trois caméras,
vent, mode léger, compteur FPS indicatif. L'accès privé est assuré par Sites.

## Dans le jeu

Ajouter `?lush=1` à l'URL. La zone se situe autour de x=-21, z=7.
Le terrain réel est échantillonné. Maisons, route, chemin d'accès, chemins peints
et biome cimetière sont exclus. Plantes décoratives sans collision ni récolte.
Pas d'activation par défaut avant validation visuelle dans le jeu.

## Fusion avec la forge

La seule intégration au jeu est l'import et le montage du composant dans
OutdoorNeighborhood.jsx. Les nouveaux modules sont autonomes. Aucun changement
aux sauvegardes, à l'inventaire, aux recettes ou aux interactions de la forge.
Conserver le montage dans le groupe de détails extérieurs et les layers d'éclairage.

Les vercel.json à la racine et dans web désactivent uniquement l'auto-déploiement
Vercel de feat/lush-environment pour que la prévisualisation passe par Sites privé.

## Validation

363 tests passent, dont 3 nouveaux (déterminisme/passage, exclusions/terrain,
géométrie/budget). Builds du jeu et de l'aperçu réussis.
Le rendu WebGL et la fluidité sur téléphone restent à valider visuellement.
Graphify non exécuté : graphe absent, outils Graphify/PowerShell indisponibles ici.
