# Audit du runtime et des boucles de frame

État constaté le 27 août 2026. Ce document décrit l'existant ; il ne prescrit
aucune modification visuelle ou de gameplay.

## Socle déjà en place

- `FrameScheduler` ordonne des tâches par phase, conserve leur ordre
  d'enregistrement, mesure leur coût en mode debug et met en quarantaine une
  tâche qui lève une exception.
- `GameFrameSchedulerDriver` exécute le scheduler tôt dans la frame et y
  raccorde le registre central des mixeurs d'animation.
- `MobSpatialIndexSystem`, `MobActivitySystem` et `mobStreaming` fournissent
  déjà index spatial, niveaux d'activité et résidence pour les monstres.
- Le rapport de performance réunit frametimes, charge de rendu, tâches du
  scheduler et diagnostics corrélés sur une même fenêtre.

Le scheduler actuel est un ordonnanceur de callbacks. Ce n'est pas encore une
simulation à pas fixe, un système de budgets par frame, ni un scheduler global
auquel toute animation devrait obligatoirement appartenir.

## Couverture constatée

L'inventaire statique contient 86 appels à `useFrame` dans 17 fichiers. Une
part importante se trouve encore dans `App.jsx`. Les autres fichiers sont :

- effets : `ParticleEffect`, `ShaderGroundRing`, `ShaderGroundZone`,
  `ShaderShell` ;
- monde : `BiomeAmbientEffects`, `CloudSky`, `LootDrops`,
  `MapObjectPlaceables`, `OutdoorNeighborhood`, `QuestNpcInteraction`,
  `TerrainGroundCover`, `InstancedTreeBatch`, `ProceduralTree` ;
- gameplay et outils : `SlimeBossSystem`, `MapEditorTool` ;
- infrastructure : `GameFrameSchedulerDriver`.

Les inscriptions via `useGameFrameTask` apparaissent dans quatre composants de
`App.jsx`, `SlimeProceduralModel`, `MobActivitySystem` et
`MobSpatialIndexSystem`. Le registre des mixeurs est inscrit directement par le
driver.

Un `useFrame` direct n'est pas un défaut en soi. Les mises à jour purement
visuelles liées à la caméra ou aux uniforms peuvent légitimement rester près du
rendu. Une migration n'a de valeur que si elle apporte un ordre déterministe,
une fréquence réduite, une mesure utile ou un budget contrôlé.

## Classification à faire avant toute migration

Pour chaque boucle, relever son coût P95/P99, sa fréquence nécessaire et ses
dépendances, puis la classer :

1. critique : déplacement du joueur, collisions, combat, réseau et état qui
   influence les règles du jeu ;
2. simulation secondaire : IA, spawners, loot et interactions distantes ;
3. visuel : shaders, particules, ciel, végétation et effets d'ambiance ;
4. préparation ou streaming : création de ressources, montage progressif et
   chargement d'assets ;
5. outil ou diagnostic : éditeur, sondes et affichages debug.

Cette classification doit précéder toute centralisation. Les catégories 1 et 2
sont les candidates naturelles à un ordre explicite ou à une cadence maîtrisée.
Les catégories 3 à 5 demandent des stratégies différentes et ne doivent pas
être déplacées mécaniquement dans le scheduler.

## Prochain point de décision

Avec le benchmark désormais isolé, la prochaine étape sûre est de produire une
mesure de référence immobile puis une mesure en déplacement dans la même zone.
À partir de ces rapports, on choisira une seule cible mesurée et une expérience
A/B réversible. Aucun chantier de rendu, de streaming, de cache ou de migration
des boucles ne doit être engagé sans cette comparaison et sans validation de la
direction retenue.
