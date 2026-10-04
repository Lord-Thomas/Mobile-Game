import { useMemo } from 'react'
import LushVegetation from './LushVegetation'
import { createLushLayout } from './lushLayout'
import { getTerrainHeight } from '../terrain/terrainGeometry'
import { getDistanceToPath, getDistanceToRoad, isInsideHouseFootprint } from '../worldZones'
import { MAP_PATH_SURFACE_SAMPLER } from '../paths'
import { getBiomeInfluence } from '../biomeAreas'
import { ROAD_WIDTH } from '../outdoorData'
import { OUTDOOR_LIGHT_LAYER } from '../lightingLayers'

export default function LushEnvironmentPatch({ active, reducedDensity = false }) {
  const plants = useMemo(() => createLushLayout({
    origin: [-21, 7],
    heightAt: getTerrainHeight,
    canPlace: (x, z, radius) => {
      if (isInsideHouseFootprint(x, z, radius + 1)) return false
      if (getDistanceToPath(x, z) < radius + 1.2) return false
      if (getDistanceToRoad(x, z) < ROAD_WIDTH * 0.5 + radius + 1.2) return false
      if (getBiomeInfluence('graveyard', x, z, null) > 0.15) return false
      // Sample the plant footprint too, keeping foliage off painted paths.
      return [[0, 0], [radius, 0], [-radius, 0], [0, radius], [0, -radius]].every(([dx, dz]) => {
        const weights = MAP_PATH_SURFACE_SAMPLER.sampleGrassWeights(x + dx, z + dz)
        return weights.naturalWeight + weights.grassWeight > 0.9
      })
    },
  }), [])
  return <LushVegetation plants={plants} active={active} layer={OUTDOOR_LIGHT_LAYER} reducedDensity={reducedDensity} />
}
