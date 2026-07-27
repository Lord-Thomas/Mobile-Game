import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import process from 'node:process'
import jimp from 'jimp'
import { createRoadCurve } from '../src/world/roads/roadGeometry.js'
import { roadLayout } from '../src/world/roads/roadLayout.js'
import { MAP_BIOME_AREAS as generatedBiomeAreas } from '../src/world/biomeAreas.generated.js'
import {
  TERRAIN_SURFACE_MASK_HALF_SIZE,
  TERRAIN_SURFACE_MASK_RESOLUTION,
  TERRAIN_SURFACE_MASK_WORLD_SIZE,
} from '../src/world/terrain/terrainSurfaceMaskConfig.js'
import {
  getBiomeAreaBaseInfluence,
  getNaturalGraveyardInfluence,
  getNaturalGraveyardNoise,
  getNaturalSurfaceDirtWeight,
} from '../src/world/terrain/terrainSurfaceMaskMath.js'

const OUTPUT_PATH = join(
  process.cwd(),
  'public',
  'textures',
  'outdoor',
  'terrain-surface-mask.png',
)
const ROAD_SHADER_SAMPLES = 20

function toByte(value) {
  return Math.max(0, Math.min(255, Math.round(value * 255)))
}

function worldToPixel(value, resolution) {
  return Math.floor(
    ((value + TERRAIN_SURFACE_MASK_HALF_SIZE) / TERRAIN_SURFACE_MASK_WORLD_SIZE) * resolution,
  )
}

export async function generateTerrainSurfaceMask({
  biomeAreas = generatedBiomeAreas,
  resolution = TERRAIN_SURFACE_MASK_RESOLUTION,
  outputPath = OUTPUT_PATH,
} = {}) {
  const startedAt = performance.now()
  const image = new jimp(resolution, resolution, 0x000000ff)
  const pixels = image.bitmap.data
  const baseGraveyardInfluence = new Float32Array(resolution * resolution)
  const pixelWorldSize = TERRAIN_SURFACE_MASK_WORLD_SIZE / resolution
  const curve = createRoadCurve(roadLayout.mainRoad.points)
  const roadPoints = Array.from({ length: ROAD_SHADER_SAMPLES }, (_, index) => {
    const point = curve.getPointAt(index / (ROAD_SHADER_SAMPLES - 1))
    return { x: point.x, z: point.z }
  })

  for (const area of biomeAreas) {
    if (area.biome !== 'graveyard') continue
    const radius = Math.max(0, Number(area.radius) || 0)
    const minX = Math.max(0, worldToPixel(area.center[0] - radius, resolution))
    const maxX = Math.min(resolution - 1, worldToPixel(area.center[0] + radius, resolution))
    const minZ = Math.max(0, worldToPixel(area.center[1] - radius, resolution))
    const maxZ = Math.min(resolution - 1, worldToPixel(area.center[1] + radius, resolution))

    for (let pixelZ = minZ; pixelZ <= maxZ; pixelZ += 1) {
      const z = -TERRAIN_SURFACE_MASK_HALF_SIZE + (pixelZ + 0.5) * pixelWorldSize
      const rowOffset = pixelZ * resolution
      for (let pixelX = minX; pixelX <= maxX; pixelX += 1) {
        const x = -TERRAIN_SURFACE_MASK_HALF_SIZE + (pixelX + 0.5) * pixelWorldSize
        const offset = rowOffset + pixelX
        baseGraveyardInfluence[offset] = Math.max(
          baseGraveyardInfluence[offset],
          getBiomeAreaBaseInfluence(x, z, area),
        )
      }
    }
  }

  for (let pixelZ = 0; pixelZ < resolution; pixelZ += 1) {
    const z = -TERRAIN_SURFACE_MASK_HALF_SIZE + (pixelZ + 0.5) * pixelWorldSize
    const rowOffset = pixelZ * resolution
    for (let pixelX = 0; pixelX < resolution; pixelX += 1) {
      const x = -TERRAIN_SURFACE_MASK_HALF_SIZE + (pixelX + 0.5) * pixelWorldSize
      const maskOffset = rowOffset + pixelX
      const pixelOffset = maskOffset * 4
      const graveyardNoise = getNaturalGraveyardNoise(x, z)

      pixels[pixelOffset] = toByte(getNaturalSurfaceDirtWeight(x, z, roadPoints))
      pixels[pixelOffset + 1] = toByte(
        getNaturalGraveyardInfluence(x, z, baseGraveyardInfluence[maskOffset]),
      )
      pixels[pixelOffset + 2] = toByte(graveyardNoise.coarse)
      pixels[pixelOffset + 3] = toByte(graveyardNoise.fine)
    }
  }

  await image.writeAsync(outputPath)
  return {
    outputPath,
    resolution,
    durationMs: performance.now() - startedAt,
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : ''
if (import.meta.url === invokedPath) {
  const result = await generateTerrainSurfaceMask()
  console.log(
    `Terrain surface mask: ${result.resolution}x${result.resolution} -> ${result.outputPath} `
    + `(${Math.round(result.durationMs)} ms)`,
  )
}
