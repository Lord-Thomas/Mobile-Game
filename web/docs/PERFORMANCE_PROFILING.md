# Profilage des performances

Le projet possède déjà plusieurs couches de diagnostic complémentaires :

- `RenderStatsProbe` mesure les FPS, les frametimes médian/P95/P99, le 1 % low,
  les draw calls, les triangles et les ressources Three.js ;
- `perfDiagnostics` corrèle les frames lentes avec les long tasks, les chargements
  d'assets, les commits React et les transitions de zone ;
- `FrameScheduler` mesure le coût CPU des tâches de jeu qui lui sont enregistrées ;
- `loadTiming` détaille le chargement initial, le réseau, les assets et le warmup
  des shaders.

Le rapport de benchmark rassemble ces données dans un seul JSON versionné.
Il classe aussi les hitches à partir de 25, 40 et 60 ms, conserve les huit plus
coûteux et ajoute leurs signaux proches (long tasks, commits React, assets,
transitions et spans significatifs). Cela rend visibles les micro-saccades qui
restent sous le seuil historique de 100 ms utilisé pour les captures de freeze.

## Faire une mesure reproductible

1. Ouvrir le jeu avec `?debug=1`.
2. Se placer dans une scène et ne plus déplacer la caméra.
3. Choisir les éléments à afficher dans le panneau de diagnostic.
4. Cliquer sur **Lancer une mesure**.
5. Attendre les 2 secondes de stabilisation et les 15 secondes de mesure.
6. Utiliser **Copier JSON** ou **Télécharger** sur le résultat.

La collecte est suspendue lorsque l'onglet est masqué afin que le ralentissement
automatique des onglets en arrière-plan ne soit pas enregistré comme un freeze.
Le scheduler est remis à zéro après les 2 secondes de stabilisation et les
diagnostics sont filtrés entre le début et la fin de la mesure. Le rapport
indique aussi explicitement si sa capacité de rétention a tronqué des événements.

Le mode debug active automatiquement les diagnostics de frames et les métriques
du scheduler. Pour obtenir en plus les journaux détaillés dans la console, utiliser
`?debug=1&perfdiag=deep`.

La console expose également :

```js
window.__gameProfiler.snapshot('extérieur complet')
window.__gameProfiler.latest()
window.__gameProfiler.history()
window.__perfDiagnostics.summary()
window.__perfDiagnostics.transitionSummary()
```

## Comparer deux versions

Conserver les mêmes conditions : appareil, navigateur, résolution, DPR, niveau de
qualité, position, caméra et durée de chauffe. Faire au moins trois mesures et
comparer en priorité :

- P95 et P99 de frametime ;
- 1 % low ;
- pire frame ;
- draw calls et triangles ;
- textures, géométries et programmes ;
- tâches CPU du scheduler ;
- temps GPU moyen/P95/P99 lorsque l'extension WebGL2 est disponible ;
- début, pic, fin et delta des ressources Three.js ;
- freezes et long tasks corrélés.
- hitches à 25/40/60 ms et leurs `nearbySignals`.

La mémoire GPU exacte n'est pas exposée par Three.js. Les compteurs de textures,
géométries et programmes servent donc à détecter les tendances et les fuites, pas
à annoncer un nombre précis de mégaoctets GPU.
