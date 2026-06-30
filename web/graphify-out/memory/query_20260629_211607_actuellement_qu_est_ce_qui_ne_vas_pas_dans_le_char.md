---
type: "query"
date: "2026-06-29T21:16:07.293676+00:00"
question: "Actuellement qu'est ce qui ne vas pas dans le chargment de mon jeu / transition maison -> extérieur ?"
contributor: "graphify"
source_nodes: ["ShaderWarmupGate", "OutdoorNeighborhood", "loadTiming", "MapObjectPlaceables", "SmallMushroomEnemy"]
---

# Q: Actuellement qu'est ce qui ne vas pas dans le chargment de mon jeu / transition maison -> extérieur ?

## Answer

Expanded from original query via vocab: loading, transition, house, outdoor, neighborhood, shader, warmup, timing, long, main, thread, glb. Diagnostic: initial asset batch is locked immediately so it does not really wait for scene assets; outdoorContentStage can advance while outdoorContentMounted is false, then many outdoor stages mount together when outdoorTransitionPrimed becomes true; map object preloading is not ahead-of-time because preloadMapObjects becomes true at the same time as showMapObjects and MapObjectPlaceables preloads in an effect after mount; enemies still use FBX while smaller GLB versions exist, and 41 generated enemy slots can mount at outdoor stage 5; outside shader warmup is query-param gated, so later outdoor content is not warmed by default.

## Source Nodes

- ShaderWarmupGate
- OutdoorNeighborhood
- loadTiming
- MapObjectPlaceables
- SmallMushroomEnemy