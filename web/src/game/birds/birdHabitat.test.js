import { describe, expect, it } from 'vitest'
import { createBirdBushSites, isBirdBushSite } from './birdHabitat'
import { NEIGHBOR_HOUSES, getNeighborHouseParts } from '../../world/outdoorData'
import { localHousePointToWorld } from '../../world/house/houseTransforms'
import { MAP_PATH_SURFACE_SAMPLER } from '../../world/paths'

describe('bird habitat', () => {
  it('keeps bushes away from the road and every neighbor house part', () => {
    expect(isBirdBushSite(0, 22)).toBe(false)
    expect(isBirdBushSite(0, 0)).toBe(false)
    for (const house of NEIGHBOR_HOUSES) {
      for (const part of getNeighborHouseParts(house)) {
        const point = localHousePointToWorld(...[house.position[0], house.position[2], house.rotationY], part.offset[0] + part.size[0] / 2 + 4, part.offset[1])
        expect(isBirdBushSite(point.x, point.z)).toBe(false)
      }
    }
  })

  it('distributes stable, spaced bushes on unpainted ground or grass across the map', () => {
    const sites = createBirdBushSites()
    expect(sites).toEqual(createBirdBushSites())
    expect(sites.length).toBeGreaterThan(50)
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      expect(sites.some(({ x, z }) => x * sx > 30 && z * sz > 30)).toBe(true)
    }
    sites.forEach((site, index) => {
      const weights = MAP_PATH_SURFACE_SAMPLER.sampleGrassWeights(site.x, site.z)
      expect(weights.naturalWeight + weights.grassWeight).toBeGreaterThan(0.95)
      for (const other of sites.slice(index + 1)) {
        expect(Math.hypot(other.x - site.x, other.z - site.z)).toBeGreaterThanOrEqual(3)
      }
    })
  })
})
