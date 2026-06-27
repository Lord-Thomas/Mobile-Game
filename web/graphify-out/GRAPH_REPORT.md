# Graph Report - C:\Users\thoma\Documents\New project\web  (2026-06-26)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 1375 nodes · 2512 edges · 83 communities (61 shown, 22 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 17 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `9570d822`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 64|Community 64]]
- [[_COMMUNITY_Community 65|Community 65]]
- [[_COMMUNITY_Community 66|Community 66]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 68|Community 68]]
- [[_COMMUNITY_Community 69|Community 69]]
- [[_COMMUNITY_Community 70|Community 70]]
- [[_COMMUNITY_Community 71|Community 71]]
- [[_COMMUNITY_Community 72|Community 72]]
- [[_COMMUNITY_Community 73|Community 73]]
- [[_COMMUNITY_Community 74|Community 74]]
- [[_COMMUNITY_Community 75|Community 75]]
- [[_COMMUNITY_Community 76|Community 76]]
- [[_COMMUNITY_Community 77|Community 77]]
- [[_COMMUNITY_Community 78|Community 78]]
- [[_COMMUNITY_Community 81|Community 81]]

## God Nodes (most connected - your core abstractions)
1. `getTerrainHeight()` - 65 edges
2. `App()` - 34 edges
3. `getCache()` - 21 edges
4. `h()` - 18 edges
5. `x()` - 18 edges
6. `normalizeParticlePreset()` - 17 edges
7. `ExceptionInfo()` - 16 edges
8. `O()` - 16 edges
9. `ExceptionInfo` - 14 edges
10. `now()` - 14 edges

## Surprising Connections (you probably didn't know these)
- `cloneLoadedModel()` --calls--> `clone()`  [INFERRED]
  src/tools/ThumbnailTool.jsx → public/basis/basis_transcoder.js
- `preRun()` --calls--> `callRuntimeCallbacks()`  [INFERRED]
  public/basis/basis_transcoder.js → public/draco/draco_decoder.js
- `initRuntime()` --calls--> `callRuntimeCallbacks()`  [INFERRED]
  public/basis/basis_transcoder.js → public/draco/draco_decoder.js
- `h()` --calls--> `ma()`  [INFERRED]
  public/draco/draco_wasm_wrapper.js → public/draco/draco_decoder.js
- `q()` --calls--> `ma()`  [INFERRED]
  public/draco/draco_wasm_wrapper.js → public/draco/draco_decoder.js

## Import Cycles
- None detected.

## Communities (83 total, 22 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.01
Nodes (64): AVOIDANCE_ANGLES, BAG_ITEM_DEFS, ballSkins, BASE_SCENE_BACKGROUND, BASE_SCENE_FOG, CAMERA_SETTINGS, CAT_OFFSETS, CHARACTER_BASE_COLORS (+56 more)

### Community 1 - "Community 1"
Cohesion: 0.06
Nodes (64): asColor(), asEnum(), asNumber(), asVec3(), BUILTIN_PARTICLE_PRESETS, clamp(), DEFAULT_EMITTER, DEFAULT_PARTICLE_PRESET (+56 more)

### Community 2 - "Community 2"
Cohesion: 0.05
Nodes (47): ColorField(), controlBase, PRESETS, styles, toHex(), addCurrentTreeToLibrary(), deleteTreeFromLibrary(), getTreeEditorState() (+39 more)

### Community 3 - "Community 3"
Cohesion: 0.09
Nodes (50): isSupabaseConfigured, connectColyseusVisitSession(), getColyseusConnectionLabel(), getColyseusUrl(), getDefaultColyseusUrl(), connectMultiplayerSession(), connectOnlinePresence(), createSessionFromRequest() (+42 more)

### Community 4 - "Community 4"
Cohesion: 0.06
Nodes (22): AttributeOctahedronTransform(), AttributeQuantizationTransform(), AttributeTransformData(), castObject(), Decoder(), DecoderBuffer(), destroy(), DracoFloat32Array() (+14 more)

### Community 5 - "Community 5"
Cohesion: 0.06
Nodes (30): clone(), createEditableObjectInstance(), defaultEditableObjects, generateSeats(), generateSingleSeat(), objectCatalog, rugCatalog, rugImageModules (+22 more)

### Community 6 - "Community 6"
Cohesion: 0.11
Nodes (25): A(), B(), ba(), C(), D(), E(), f(), G() (+17 more)

### Community 7 - "Community 7"
Cohesion: 0.06
Nodes (29): buildGeometry(), buildMaterial(), mulberry32(), ParticleEffect(), randomUnitVector(), tmpBase, tmpDir, tmpRandom (+21 more)

### Community 8 - "Community 8"
Cohesion: 0.04
Nodes (44): dependencies, @anthropic-ai/sdk, colyseus, colyseus.js, @colyseus/schema, @colyseus/tools, @dgreenheck/ez-tree, react (+36 more)

### Community 9 - "Community 9"
Cohesion: 0.06
Nodes (13): addOnPreRun(), craftInvokerFunction(), createJsInvoker(), destructor(), getPointee(), newFunc(), onComplete(), preRun() (+5 more)

### Community 10 - "Community 10"
Cohesion: 0.08
Nodes (30): buildGlobalGrassChunk(), _cameraForward, clamp01(), continueGrassChunkBuild(), createGrassCardGeometry(), createGrassChunkBuildJob(), createRockCover(), dummy (+22 more)

### Community 11 - "Community 11"
Cohesion: 0.12
Nodes (28): DEFAULT_HOUSE_CONFIG, GAME_HOUSE_LIBRARY, normalizeHouseConfig(), CheckboxField(), ColorField(), NumberField(), Section(), SelectField() (+20 more)

### Community 12 - "Community 12"
Cohesion: 0.14
Nodes (19): APPEARANCE_COLOR_KEYS, isFiniteNumber(), isVector(), now(), sanitizeBallState(), sanitizeCatState(), sanitizeCharacterAppearance(), sanitizeChatText() (+11 more)

### Community 13 - "Community 13"
Cohesion: 0.10
Nodes (27): buildCache(), collisionCache, getBarycentricYOnTriangleXZ(), getCollisionSource(), getMapObjectBaseY(), getMapObjectCollisionData(), getObjectTargetHeight(), getPlacementMaxStepUp() (+19 more)

### Community 14 - "Community 14"
Cohesion: 0.11
Nodes (28): BallRespawnGuard(), Cat(), CustomizationLayer(), NetworkCat(), clamp01(), distanceToPolylineSamples(), getNeighborHousePadHeight(), getNeighborHousePadHeightAt() (+20 more)

### Community 15 - "Community 15"
Cohesion: 0.10
Nodes (20): SceneAtmosphere(), BIOME_VISUALS, getBiomeInfluence(), MAP_BIOME_AREAS, BASE_SKY_COLORS, CloudSky(), DEFAULT_SUN_DIRECTION, GRAVEYARD_SKY_COLORS (+12 more)

### Community 16 - "Community 16"
Cohesion: 0.16
Nodes (21): toSavedPlacements(), toSavedSpawners(), getTreeMapObjectEntries(), asFiniteNumber(), BASE_MAP_OBJECT_CATALOG, clampNumber(), createCustomMapObjectCatalog(), createTreeMapObjectCatalog() (+13 more)

### Community 17 - "Community 17"
Cohesion: 0.14
Nodes (11): GableRoof(), LeanToRoof(), createGeometryCollector(), createMergedHouseGeometry(), createSlopedCeilingGeometry(), getDoorData(), pushBox(), pushCeilingPlate() (+3 more)

### Community 18 - "Community 18"
Cohesion: 0.13
Nodes (15): HouseColliders(), cornerById, corners, getRoomBounds(), getRoomHalfSize(), houseLayout, mainRoom, mainToSecondOpening (+7 more)

### Community 19 - "Community 19"
Cohesion: 0.12
Nodes (16): dummy, InstancedTrees(), AUTHORED_TREES, clamp01(), createHouseWallColliders(), createNeighborHouseColliders(), createWallCollider(), DISTANT_TREES (+8 more)

### Community 20 - "Community 20"
Cohesion: 0.12
Nodes (18): addRunDependency(), createWasm(), findWasmBinary(), getBinaryPromise(), getWasmImports(), instantiateArrayBuffer(), instantiateAsync(), locateFile() (+10 more)

### Community 21 - "Community 21"
Cohesion: 0.14
Nodes (14): getCachedVisualGeometry(), getBiomeGroundColorUniforms(), getBiomeShaderAreas(), GRAVEYARD_SHADER_GROUND_INTENSITIES, graveyardGroundColorUniforms, graveyardGroundIntensities, graveyardGroundIntensityUniforms, graveyardShaderAreas (+6 more)

### Community 22 - "Community 22"
Cohesion: 0.15
Nodes (15): activeModeButtonStyle, createInitialBiomeBrush(), Editor(), EditorCamera(), modeButtonStyle, MODES, modeSwitchStyle, useMapEditorState() (+7 more)

### Community 23 - "Community 23"
Cohesion: 0.23
Nodes (16): getVisualGrassDensity(), canPlaceObject(), clamp01(), distanceToSamples(), getDistanceToPath(), getDistanceToRoad(), getZoneAt(), getZoneDensity() (+8 more)

### Community 25 - "Community 25"
Cohesion: 0.20
Nodes (15): toSavedBiomes(), asColor(), asFiniteNumber(), BIOME_TYPE_IDS, BIOME_TYPES, clamp01(), clampNumber(), DEFAULT_GRAVEYARD_GROUND_COLORS (+7 more)

### Community 27 - "Community 27"
Cohesion: 0.16
Nodes (14): collidesWithGoalFrame(), getKickContact(), getNearestPunchTarget(), getPunchContact(), intersectsAabbSphere(), collidesWithEditableTree(), collidesWithOutdoorObstacle(), getMobOutdoorFootY() (+6 more)

### Community 28 - "Community 28"
Cohesion: 0.18
Nodes (12): createNeighborFloorplan(), createRoomWalls(), getExteriorContour(), getGroupBounds(), getRoofGroups(), getRoomBounds(), getRoomCorners(), getWallCoverageIntervals() (+4 more)

### Community 29 - "Community 29"
Cohesion: 0.19
Nodes (12): BiomeAreaMarkers(), BiomeBrushPreview(), clampMapPosition(), createBiomeArea(), createEditorId(), createMonsterSpawner(), createPlacement(), getPlacementHeightOffset() (+4 more)

### Community 30 - "Community 30"
Cohesion: 0.20
Nodes (12): getWallColliderTransform(), getWallDirection(), getWallFootprint(), getWallPointAt(), splitWallIntoSolidRects(), createColoredGeometryCollector(), createPlayerExteriorShellGeometry(), HouseOpeningReveals() (+4 more)

### Community 32 - "Community 32"
Cohesion: 0.22
Nodes (8): createRoadCurve(), createRoadGeometry(), getRoadFrame(), getRoadLotTransform(), roadLayout, OutdoorSurfaceMaterial(), Road(), RoadMesh()

### Community 33 - "Community 33"
Cohesion: 0.19
Nodes (11): toSavedPaths(), dummy, PaintedPaths(), PathLayer(), asFiniteNumber(), clampNumber(), MAP_PATHS, MAP_PATHS (+3 more)

### Community 34 - "Community 34"
Cohesion: 0.23
Nodes (12): charHexToVec(), getCharacterMaterialKey(), makePantsDetailsTintApplyGlsl(), makeSkinWithDetailsTintApplyGlsl(), makeTintApplyGlsl(), normalizeMixamoObjectName(), srgbChannelToLinear(), cloneMixamoAnimationClip() (+4 more)

### Community 35 - "Community 35"
Cohesion: 0.24
Nodes (11): BUILTIN_TREE_LIBRARY, SAVED_TREE_LIBRARY, getLibraryTreeConfig(), getRuntimeTreeLibrary(), getStoredTreeLibrary(), getTreeForMapObjectId(), getTreeIdFromMapObjectId(), getTreeMapObjectId() (+3 more)

### Community 36 - "Community 36"
Cohesion: 0.18
Nodes (11): ACHIEVEMENT_IDS, ACHIEVEMENTS, getTitleDefinition(), getTitleRarity(), TITLE_IDS, TITLE_RARITIES, TITLES, AchievementsPanel() (+3 more)

### Community 37 - "Community 37"
Cohesion: 0.20
Nodes (11): clampMapPositionForSpawn(), getDistanceToNearestHouse(), getDistanceToNeighborHouses(), getDistanceToPlayerHouse(), getMushroomEnemyWanderPoint(), getNearbyTreeCount(), getSeededUnitValue(), getSpawnerSlotPosition() (+3 more)

### Community 38 - "Community 38"
Cohesion: 0.20
Nodes (4): params, terrainReady, ErrorBoundary, styles

### Community 39 - "Community 39"
Cohesion: 0.25
Nodes (7): getModelExtension(), MapObjectHitTarget(), MapObjectInstance(), MapObjectModel(), MapObjectPlaceables(), MapObjectSelection(), getMapObjectCatalogItem()

### Community 40 - "Community 40"
Cohesion: 0.20
Nodes (10): addOnPostRun(), initRuntime(), postRun(), addOnPostRun(), addOnPreRun(), callRuntimeCallbacks(), initRuntime(), postRun() (+2 more)

### Community 41 - "Community 41"
Cohesion: 0.20
Nodes (8): useGameTexture(), Ball(), GameChatPanel(), getCappedAnisotropy(), getDefaultPerformanceSettings(), HouseInterior(), isLikelyMobileDevice(), loadPerformanceSettings()

### Community 42 - "Community 42"
Cohesion: 0.22
Nodes (4): getMapObjectIdFromRelativePath(), MAP_MODEL_EXTENSIONS, RESERVED_MAP_OBJECT_IDS, sanitizeGeneratedObjectId()

### Community 43 - "Community 43"
Cohesion: 0.25
Nodes (6): buffer, header, keys, vals, xs, zs

### Community 44 - "Community 44"
Cohesion: 0.29
Nodes (6): build, watchPatterns, deploy, healthcheckPath, startCommand, $schema

### Community 45 - "Community 45"
Cohesion: 0.29
Nodes (7): appendTwitchParents(), getOnlineVideoEmbedUrl(), getTikTokEmbedUrl(), getTwitchEmbedUrl(), getTwitchParentHost(), getTwitchParentHosts(), getYouTubeEmbedUrl()

### Community 46 - "Community 46"
Cohesion: 0.47
Nodes (5): fmt(), markLoad(), marks, reportLoadTiming(), ShaderWarmupGate()

### Community 47 - "Community 47"
Cohesion: 0.40
Nodes (5): fromWireType(), _fd_write(), printChar(), UTF8ArrayToString(), UTF8ToString()

### Community 48 - "Community 48"
Cohesion: 0.40
Nodes (5): toWireType(), ensureString(), intArrayFromString(), lengthBytesUTF8(), stringToUTF8Array()

### Community 49 - "Community 49"
Cohesion: 0.40
Nodes (4): evaluateMetricAchievements(), getLocalAchievement(), LOCAL_ACHIEVEMENTS, LOCAL_ACHIEVEMENTS_BY_ID

### Community 50 - "Community 50"
Cohesion: 0.40
Nodes (3): dryRun, explicit, io

### Community 51 - "Community 51"
Cohesion: 0.40
Nodes (5): constrainCameraToSkeletonTower(), getSkeletonTowerCameraContext(), getSkeletonTowerHeightWorld(), skeletonTowerLocalToWorld(), worldToSkeletonTowerLocal()

### Community 52 - "Community 52"
Cohesion: 0.50
Nodes (3): GENERATED_MAP_OBJECT_DEFINITIONS, MANUAL_MAP_OBJECT_DEFINITIONS, MAP_OBJECT_DEFINITIONS

### Community 53 - "Community 53"
Cohesion: 0.50
Nodes (4): c(), l(), ma(), p()

### Community 54 - "Community 54"
Cohesion: 0.50
Nodes (4): emscripten_realloc_buffer(), _emscripten_resize_heap(), getHeapMax(), updateMemoryViews()

### Community 55 - "Community 55"
Cohesion: 0.50
Nodes (4): useStoredParticlePreset(), FloatingMagicSkull(), MagicSkullDiscovery(), MagicSkullDiscoveryMapModel()

### Community 57 - "Community 57"
Cohesion: 0.50
Nodes (4): getMaterialDrawCallCount(), getObjectDrawCallCount(), getObjectTriangleCount(), isObjectVisibleInScene()

### Community 58 - "Community 58"
Cohesion: 0.67
Nodes (4): getMushroomEnemySpawnCandidates(), getMushroomEnemySpawnPosition(), getMushroomEnemySpawnPositions(), getRandomEnemySpawnPositions()

### Community 60 - "Community 60"
Cohesion: 0.67
Nodes (3): activeSessionStorageKey(), hasSavedGuestSession(), readSavedSession()

### Community 61 - "Community 61"
Cohesion: 0.67
Nodes (3): getActiveViewportSize(), getViewportOrientation(), getViewportRenderSettings()

## Knowledge Gaps
- **266 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+261 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **22 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `clone()` connect `Community 5` to `Community 9`?**
  _High betweenness centrality (0.267) - this node is a cross-community bridge._
- **Why does `getTerrainHeight()` connect `Community 14` to `Community 0`, `Community 1`, `Community 2`, `Community 3`, `Community 7`, `Community 10`, `Community 13`, `Community 16`, `Community 17`, `Community 18`, `Community 19`, `Community 22`, `Community 27`, `Community 28`, `Community 29`, `Community 32`, `Community 33`, `Community 35`, `Community 37`, `Community 39`, `Community 58`?**
  _High betweenness centrality (0.075) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _266 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.011049723756906077 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.06034801925212884 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.054563492063492064 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.08956228956228957 - nodes in this community are weakly interconnected._