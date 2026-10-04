import { createTerrainHeightSampler } from './terrainHeightSampler'
import { createWorldGrassPlacementSampler } from '../TerrainGroundCover'
import { getCachedVisualGeometry } from '../terrain/terrainGeometry'
import { MAP_BIOME_AREAS, getBiomeInfluence } from '../biomeAreas'
import { MAP_PATHS, getPathStampOpacityAt, getPaintCoverageThresholdAt } from '../paths'
import { getRoomBounds, houseLayout } from '../house/houseLayout'

// Expensive broad density is cached on the same fine grid as the previous
// outdoor version. Precise building/path/biome masks remain per blade.
export function createOutdoorGrassSurface(biomeAreas = MAP_BIOME_AREAS) {
  const height = createTerrainHeightSampler(getCachedVisualGeometry())
  const naturalDensity = createWorldGrassPlacementSampler()
  const houses = houseLayout.rooms.map(getRoomBounds)
  return {
    cell(cx, cz) {
      const minX = cx * 8 - 0.45, maxX = cx * 8 + 8.45
      const minZ = cz * 8 - 0.45, maxZ = cz * 8 + 8.45
      const intersects = (x, z, radius) => x + radius >= minX && x - radius <= maxX
        && z + radius >= minZ && z - radius <= maxZ
      const biomes = biomeAreas.filter(area => area.biome === 'graveyard'
        && intersects(area.center[0], area.center[1], area.radius))
      const paths = MAP_PATHS.filter(path => intersects(path.center[0], path.center[1], path.width / 2))
      const footprints = houses.filter(b => b.maxX + 0.9 >= minX && b.minX - 0.9 <= maxX
        && b.maxZ + 0.9 >= minZ && b.minZ - 0.9 <= maxZ)
      return (x, z, random) => {
        if (footprints.some(b => x > b.minX - 0.9 && x < b.maxX + 0.9 && z > b.minZ - 0.9 && z < b.maxZ + 0.9)) return null
        const influence = biomes.length ? getBiomeInfluence('graveyard', x, z, null, biomes) : 0
        if (influence > 0.28) return null
        let surface = 'natural'
        if (paths.length) {
          const threshold = getPaintCoverageThresholdAt(x, z)
          for (const path of paths) {
            const coverage = getPathStampOpacityAt(path, x, z)
            if (coverage >= 0.001 && threshold <= coverage) surface = path.type
          }
        }
        const density = surface === 'natural' ? naturalDensity(x, z)
          : surface === 'grass' ? 0.18 * (1 - influence) ** 3.5 : 0
        if (random >= Math.min(1, density * 7.5)) return null
        return height(x, z)
      }
    },
  }
}
