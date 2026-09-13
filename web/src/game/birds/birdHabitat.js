import { canPlaceObject, isInsideHouseFootprint } from '../../world/worldZones'
import { NEIGHBOR_HOUSES, getNeighborHouseParts } from '../../world/outdoorData'
import { MAP_PATH_SURFACE_SAMPLER } from '../../world/paths'
import { getBiomeInfluence } from '../../world/biomeAreas'

export function isBirdBushSite(x, z) {
  if (!canPlaceObject('authored_tree', x, z) || isInsideHouseFootprint(x, z, 7)) return false
  if (getBiomeInfluence('graveyard', x, z, null) > 0.28) return false
  for (const house of NEIGHBOR_HOUSES) {
    const dx = x - house.position[0]
    const dz = z - house.position[2]
    const c = Math.cos(house.rotationY)
    const s = Math.sin(house.rotationY)
    const lx = c * dx - s * dz
    const lz = s * dx + c * dz
    if (getNeighborHouseParts(house).some((part) =>
      Math.abs(lx - part.offset[0]) < part.size[0] / 2 + 7
      && Math.abs(lz - part.offset[1]) < part.size[2] / 2 + 7)) return false
  }
  // Check the whole bush footprint against painted paths, not just its centre.
  return [[0, 0], [-1.2, 0], [1.2, 0], [0, -1.2], [0, 1.2]].every(([dx, dz]) => {
    const { naturalWeight, grassWeight } = MAP_PATH_SURFACE_SAMPLER.sampleGrassWeights(x + dx, z + dz)
    return naturalWeight + grassWeight > 0.95
  })
}

export function createBirdBushSites() {
  let seed = 7319
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
  const sites = []
  // Irregular small clusters separated by open meadow; stable across renders.
  for (let cluster = 0; cluster < 100; cluster += 1) {
    const cx = (random() - 0.5) * 300
    const cz = (random() - 0.5) * 300
    const count = 2 + Math.floor(random() * 3)
    for (let i = 0; i < count; i += 1) {
      const angle = random() * Math.PI * 2
      const radius = random() * 7
      const x = cx + Math.cos(angle) * radius
      const z = cz + Math.sin(angle) * radius
      if (!isBirdBushSite(x, z) || sites.some((site) => Math.hypot(site.x - x, site.z - z) < 3)) continue
      sites.push({ id: `seed-bush-${sites.length}`, x, z, scale: 0.75 + random() * 0.4 })
    }
  }
  return sites
}
