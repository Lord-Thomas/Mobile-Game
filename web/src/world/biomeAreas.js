import { Color, Vector4 } from 'three'
import { MAP_BIOME_AREAS as generatedBiomeAreas } from './biomeAreas.generated'

export const BIOME_TYPES = {
  graveyard: {
    id: 'graveyard',
    name: 'Cimetiere',
    color: '#83d8c4',
  },
}

export const BIOME_TYPE_IDS = Object.keys(BIOME_TYPES)
export const BIOME_SHADER_MAX_AREAS = 8
const DEFAULT_GRAVEYARD_GROUND_COLORS = {
  darkSoil: '#2e261f',
  dryClay: '#595046',
  ash: '#7a7d73',
  boneDust: '#9e9780',
  coldShadow: '#293331',
}

export const BIOME_VISUALS = {
  graveyard: {
    atmosphere: {
      background: '#d7e2e1',
      fog: '#aebfbb',
      fogNear: 18,
      fogFar: 145,
      fogDensity: 0.045,
      sun: '#cfd9cf',
      sky: '#bdced3',
      ground: '#7b8278',
      horizon: '#c9d4cf',
      zenith: '#5f7f91',
      cloudBase: '#d6d9cf',
      cloudWarm: '#b8d7c5',
      cloudShade: '#81918f',
      cloudCoverageBoost: 0.16,
      desaturation: 0.3,
    },
    ground: {
      darkSoil: [0.18, 0.15, 0.12],
      dryClay: [0.35, 0.30, 0.24],
      ash: [0.48, 0.49, 0.45],
      boneDust: [0.62, 0.59, 0.49],
      coldShadow: [0.16, 0.20, 0.19],
    },
  },
}

function asFiniteNumber(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function clamp01(value) {
  return clampNumber(value, 0, 1)
}

function smoothstep(edge0, edge1, value) {
  if (Math.abs(edge1 - edge0) < 1e-6) return value >= edge1 ? 1 : 0
  const t = clamp01((value - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

function normalizeCenter(center) {
  if (!Array.isArray(center)) return [0, 0]
  return [
    asFiniteNumber(center[0]),
    asFiniteNumber(center[1]),
  ]
}

function asColor(value, fallback) {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback
}

function normalizeGroundColors(colors = {}) {
  return {
    darkSoil: asColor(colors.darkSoil, DEFAULT_GRAVEYARD_GROUND_COLORS.darkSoil),
    dryClay: asColor(colors.dryClay, DEFAULT_GRAVEYARD_GROUND_COLORS.dryClay),
    ash: asColor(colors.ash, DEFAULT_GRAVEYARD_GROUND_COLORS.ash),
    boneDust: asColor(colors.boneDust, DEFAULT_GRAVEYARD_GROUND_COLORS.boneDust),
    coldShadow: asColor(colors.coldShadow, DEFAULT_GRAVEYARD_GROUND_COLORS.coldShadow),
  }
}

export function normalizeBiomeArea(area, index = 0) {
  const biome = BIOME_TYPES[area?.biome]?.id ?? 'graveyard'
  const radius = clampNumber(asFiniteNumber(area?.radius, 24), 2, 140)

  return {
    id: typeof area?.id === 'string' && area.id.trim()
      ? area.id
      : `${biome}_${index + 1}`,
    biome,
    center: normalizeCenter(area?.center),
    radius,
    feather: clampNumber(asFiniteNumber(area?.feather, radius * 0.28), 0.5, 80),
    groundIntensity: clamp01(asFiniteNumber(area?.groundIntensity, 1)),
    fogIntensity: clamp01(asFiniteNumber(area?.fogIntensity, 0.5)),
    particleIntensity: clamp01(asFiniteNumber(area?.particleIntensity, 0.65)),
    groundColors: normalizeGroundColors(area?.groundColors),
  }
}

export const MAP_BIOME_AREAS = generatedBiomeAreas.map(normalizeBiomeArea)

export function getBiomeInfluence(biome, x, z, channel = 'groundIntensity', areas = MAP_BIOME_AREAS) {
  let influence = 0

  for (const area of areas) {
    if (area.biome !== biome) continue
    const [centerX, centerZ] = area.center
    const distance = Math.hypot(x - centerX, z - centerZ)
    const innerRadius = Math.max(0, area.radius - area.feather)
    const areaInfluence = 1 - smoothstep(innerRadius, area.radius, distance)
    const channelIntensity = channel === null ? 1 : area[channel] ?? area.groundIntensity ?? 1
    influence = Math.max(influence, areaInfluence * channelIntensity)
  }

  return clamp01(influence)
}

export function getBiomeShaderAreas(biome = 'graveyard', areas = MAP_BIOME_AREAS) {
  return areas
    .filter((area) => area.biome === biome)
    .slice(0, BIOME_SHADER_MAX_AREAS)
    .map((area) => new Vector4(area.center[0], area.center[1], area.radius, area.feather))
}

export const GRAVEYARD_SHADER_AREAS = getBiomeShaderAreas('graveyard')
export const GRAVEYARD_SHADER_GROUND_INTENSITIES = MAP_BIOME_AREAS
  .filter((area) => area.biome === 'graveyard')
  .slice(0, BIOME_SHADER_MAX_AREAS)
  .map((area) => area.groundIntensity)

export function getBiomeGroundColors(biome = 'graveyard', areas = MAP_BIOME_AREAS) {
  const area = areas.find((candidate) => candidate.biome === biome)
  return normalizeGroundColors(area?.groundColors)
}

export function getBiomeGroundColorUniforms(biome = 'graveyard', areas = MAP_BIOME_AREAS) {
  const colors = getBiomeGroundColors(biome, areas)
  return {
    darkSoil: new Color(colors.darkSoil),
    dryClay: new Color(colors.dryClay),
    ash: new Color(colors.ash),
    boneDust: new Color(colors.boneDust),
    coldShadow: new Color(colors.coldShadow),
  }
}
