// Flags de perf activés par paramètre d'URL, pour bissecter le coût de chargement
// SANS toucher au comportement par défaut. Lus une seule fois au démarrage.
//
//   ?nophys      → désactive le cooking physique lourd (trimesh terrain + colliders d'objets)
//   ?noterrain   → remplace le TrimeshCollider du terrain par un sol plat
//   ?nomapcol    → désactive MapObjectPhysicsColliders
//
// But : si le chargement s'effondre avec ?nophys, le cooking Rapier (BVH trimesh
// en WASM synchrone) est le coupable des ~11 s invisibles au Profiler React.
const params = typeof window !== 'undefined'
  ? new URLSearchParams(window.location.search)
  : new URLSearchParams()

export const PERF_NO_TERRAIN_TRIMESH = params.has('nophys') || params.has('noterrain')
export const PERF_NO_MAP_COLLIDERS = params.has('nophys') || params.has('nomapcol')
export const PERF_SHADER_WARMUP = params.has('shaderwarmup')
export const PERF_RUNTIME_WARMUP_RIG = params.has('warmuprig')
