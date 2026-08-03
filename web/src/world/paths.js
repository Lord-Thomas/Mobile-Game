import { MAP_PATHS as generatedPaths } from './paths.generated'

export const DEFAULT_PATH_HARDNESS = 0.55

// Painted paths are stored as a flat list of round "stamps" (like biome paint),
// each at a world position with a width. Overlapping stamps along a drag form a
// continuous path. They render as terrain-following decals (see PaintedPaths).
export const PATH_TYPES = {
  grass: {
    id: 'grass',
    name: 'Herbe',
    color: '#789758',
    tint: '#ffffff',
    map: '/textures/outdoor/grass-patchy-basecolor-512.jpg',
    normalMap: '/textures/outdoor/grass-patchy-normal.png',
    roughnessMap: '/textures/outdoor/grass-patchy-roughness.jpg',
    textureScale: 0.155,
    terrainGrade: {
      target: [0.055, 0.37, 0.035],
      luminanceScale: 2.8,
      luminanceBias: 0.10,
      luminanceMax: 0.84,
      amount: 0.90,
    },
  },
  dirt: {
    id: 'dirt',
    name: 'Terre',
    color: '#6f5d44',
    tint: '#ffffff',
    map: '/textures/outdoor/dirt-ground-basecolor-512.jpg',
    normalMap: '/textures/outdoor/dirt-ground-normal.jpg',
    roughnessMap: '/textures/outdoor/dirt-ground-roughness.jpg',
    textureScale: 0.18,
    terrainGrade: {
      target: [0.49, 0.23, 0.04],
      luminanceScale: 2.5,
      luminanceBias: 0.08,
      luminanceMax: 0.90,
      amount: 0.50,
    },
  },
  stone: {
    id: 'stone',
    name: 'Pierre',
    color: '#8b8881',
    tint: '#aaa9a3',
    map: '/textures/outdoor/asphalt-clean-basecolor-512.jpg',
    normalMap: '/textures/outdoor/asphalt-clean-normal.jpg',
    roughnessMap: '/textures/outdoor/dirt-path-roughness.jpg',
    textureScale: 0.2,
  },
  sand: {
    id: 'sand',
    name: 'Sable',
    color: '#c2a878',
    tint: '#d8bd83',
    map: '/textures/outdoor/dirt-path-basecolor.jpg',
    normalMap: '/textures/outdoor/dirt-path-normal.png',
    roughnessMap: '/textures/outdoor/dirt-path-roughness.jpg',
    textureScale: 0.2,
  },
  gravel: {
    id: 'gravel',
    name: 'Gravier',
    color: '#9a948a',
    tint: '#bbb7ae',
    map: '/textures/outdoor/asphalt-clean-basecolor-512.jpg',
    normalMap: '/textures/outdoor/asphalt-clean-normal.jpg',
    roughnessMap: '/textures/outdoor/dirt-path-roughness.jpg',
    textureScale: 0.2,
  },
}

export const PATH_TYPE_IDS = Object.keys(PATH_TYPES)

function asFiniteNumber(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

export function normalizePathStamp(stamp, index = 0) {
  const type = PATH_TYPES[stamp?.type]?.id ?? 'dirt'
  const center = Array.isArray(stamp?.center)
    ? [asFiniteNumber(stamp.center[0]), asFiniteNumber(stamp.center[1])]
    : [0, 0]

  return {
    id: typeof stamp?.id === 'string' && stamp.id.trim() ? stamp.id : `path_${index + 1}`,
    type,
    center,
    width: clampNumber(asFiniteNumber(stamp?.width, 3), 0.5, 24),
    hardness: clampNumber(asFiniteNumber(stamp?.hardness, DEFAULT_PATH_HARDNESS), 0, 1),
  }
}

export const MAP_PATHS = generatedPaths.map(normalizePathStamp)
