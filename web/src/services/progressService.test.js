import { beforeAll, describe, expect, it, vi } from 'vitest'

// progressService importe le client Supabase, qui lit window.location au
// chargement du module : on stubbe avant l'import dynamique.
let toProgressRow
let fromProgressRow

beforeAll(async () => {
  vi.stubGlobal('window', { location: { origin: 'http://localhost' } })
  const module = await import('./progressService')
  toProgressRow = module.toProgressRow
  fromProgressRow = module.fromProgressRow
})

const housePlan = {
  version: 1,
  floorCells: { '0,0': { enabled: true } },
  walls: { wall_a: { id: 'wall_a', from: [0, 0], to: [3, 0], height: 5 } },
  openings: {},
  entranceDoorId: null,
  styles: { floorByCell: {}, wallBySide: {}, ceilingByCell: {} },
}

const progress = {
  displayName: 'Thomas',
  coins: 120,
  ownedSkins: ['classic'],
  selectedSkinId: 'classic',
  editableObjects: [],
  ownedFloorSkins: ['floor-classic'],
  ownedWallSkins: ['wall-classic'],
  housePlan,
  roomLightOn: false,
  lightColor: '#ff0000',
  lightIntensity: 1.5,
}

describe('progressService', () => {
  // La maison construite par le joueur est une donnée permanente : elle était
  // absente de la liste blanche world_settings et disparaissait au rechargement.
  it('conserve le plan de maison et les lumieres au round-trip cloud', () => {
    const row = toProgressRow('user-1', progress)
    const restored = fromProgressRow(row)

    expect(row.world_settings.housePlan).toEqual(housePlan)
    expect(restored.housePlan).toEqual(housePlan)
    expect(restored.roomLightOn).toBe(false)
    expect(restored.lightColor).toBe('#ff0000')
    expect(restored.lightIntensity).toBe(1.5)
  })

  it('retombe sur des valeurs par defaut quand la maison est absente', () => {
    const restored = fromProgressRow({ coins: 0, world_settings: {} })

    // null (et non undefined) : l'appelant garde alors le plan courant.
    expect(restored.housePlan).toBeNull()
    expect(restored.roomLightOn).toBe(true)
    expect(restored.lightColor).toBe('#ffffff')
    expect(restored.lightIntensity).toBe(2)
  })
})
