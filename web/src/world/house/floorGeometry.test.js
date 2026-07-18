import { describe, expect, it } from 'vitest'
import { createFloorRectsGeometryData, decomposeCellsIntoRects, getCellsBounds } from './floorGeometry'
import { addRoomToHousePlan, createDefaultHousePlan, getCellKey } from './housePlan'
import { deriveHouseLayout } from './deriveHouseLayout'

function rectArea(rect) {
  return (rect.maxX - rect.minX) * (rect.maxZ - rect.minZ)
}

describe('floorGeometry', () => {
  it('decompose un carre en un seul rectangle', () => {
    const keys = []
    for (let x = 0; x < 4; x += 1) {
      for (let z = 0; z < 4; z += 1) keys.push(getCellKey(x, z))
    }
    const rects = decomposeCellsIntoRects(keys)

    expect(rects).toHaveLength(1)
    expect(rects[0]).toEqual({ minX: 0, minZ: 0, maxX: 4, maxZ: 4 })
  })

  it('decompose une forme en L en rectangles couvrant toutes les cellules', () => {
    const keys = []
    for (let x = 0; x < 6; x += 1) {
      for (let z = 0; z < 3; z += 1) keys.push(getCellKey(x, z))
    }
    for (let x = 0; x < 3; x += 1) {
      for (let z = 3; z < 6; z += 1) keys.push(getCellKey(x, z))
    }
    const rects = decomposeCellsIntoRects(keys)
    const totalArea = rects.reduce((sum, rect) => sum + rectArea(rect), 0)

    expect(rects.length).toBeGreaterThanOrEqual(2)
    expect(totalArea).toBe(keys.length)
  })

  it('expose empreinte, bornes et hauteur max dans le layout derive', () => {
    const plan = addRoomToHousePlan(createDefaultHousePlan(), {
      direction: 'east',
      width: 4,
      depth: 6,
    })
    const layout = deriveHouseLayout(plan)
    const totalArea = layout.footprintRects.reduce((sum, rect) => sum + rectArea(rect), 0)

    expect(totalArea).toBe(Object.keys(plan.floorCells).length)
    expect(layout.bounds).toMatchObject({ minX: -5, maxX: 9, minZ: -5, maxZ: 5 })
    expect(layout.maxWallHeight).toBe(5)
  })

  it('genere des quads avec UVs en coordonnees monde', () => {
    const data = createFloorRectsGeometryData([{ minX: -2, minZ: 0, maxX: 2, maxZ: 3 }], 0.5)

    expect(data.positions).toHaveLength(12)
    expect(data.indices).toHaveLength(6)
    expect(data.uvs.slice(0, 2)).toEqual([-1, 0])
  })
})
