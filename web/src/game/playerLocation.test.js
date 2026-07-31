import { describe, expect, it } from 'vitest'
import { createSavedPlayerLocation, normalizeSavedPlayerLocation } from './playerLocation'

const options = {
  limitsByZone: {
    interior: { minX: -5, maxX: 5, minZ: -5, maxZ: 5 },
    outside: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },
  },
  fallbackSpawns: {
    interior: [0, 0.42, 2.2],
    outside: [-6, 0.42, 0],
  },
}

describe('playerLocation', () => {
  it('conserve zone, position et orientation valides', () => {
    const location = normalizeSavedPlayerLocation(createSavedPlayerLocation({
      zone: 'outside',
      position: [12, 3, -8],
      rotationY: 1.2,
      cameraYaw: -0.8,
    }), options)
    expect(location).toMatchObject({ zone: 'outside', position: [12, 3, -8], rotationY: 1.2 })
  })

  it('borne une position corrompue aux limites de la zone', () => {
    const location = normalizeSavedPlayerLocation({
      zone: 'interior',
      position: [500, 0.42, -500],
    }, options)
    expect(location.position).toEqual([5, 0.42, -5])
  })

  it('refuse une zone inconnue ou des coordonnées invalides', () => {
    expect(normalizeSavedPlayerLocation({ zone: 'void', position: [0, 0, 0] }, options)).toBeNull()
    expect(normalizeSavedPlayerLocation({ zone: 'outside', position: [0, NaN, 0] }, options)).toBeNull()
  })
})
