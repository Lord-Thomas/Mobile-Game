import { expect, it } from 'vitest'
import { Box3, PlaneGeometry, Vector3 } from 'three'
import { createStreamedGeometry, syncStreamedGeometry } from './streamedGeometry'

function slot(height) {
  return { data: new Float32Array([1, height, 1, 0.2, 2, height, 2, 0.25]),
    ranks: new Float32Array([0.25, 0.75]), count: 2, version: 1,
    bounds: new Box3(new Vector3(-2, height - 2, -2), new Vector3(10, height + 2, 10)) }
}

it('updates every recycled block independently, including hill-to-flat heights and bounds', () => {
  const base = new PlaneGeometry()
  const slots = [slot(12), slot(25)]
  const geometries = slots.map(item => createStreamedGeometry(base, item))
  expect(geometries[0].userData).not.toBe(geometries[1].userData)
  expect(geometries[0].userData).not.toBe(base.userData)
  const gpuCopies = new Map()
  function upload(geometry) {
    const attribute = geometry.attributes.instancePlacement
    const previous = gpuCopies.get(geometry)
    if (!previous || attribute.version !== previous.version) {
      gpuCopies.set(geometry, { version: attribute.version, data: attribute.array.slice() })
    }
  }
  geometries.forEach((geometry, i) => { syncStreamedGeometry(geometry, slots[i], true); upload(geometry) })
  const buffers = geometries.map(g => g.attributes.instancePlacement.array)
  // Both slots have the same generation number, but both must be uploaded.
  for (const item of slots) {
    item.version = 3
    item.data[1] = item.data[5] = 0.04
    item.bounds.min.y = -2; item.bounds.max.y = 2
  }
  geometries.forEach((geometry, i) => {
    expect(syncStreamedGeometry(geometry, slots[i], true)).toBe(true)
    upload(geometry)
    expect(gpuCopies.get(geometry).data[1]).toBeCloseTo(0.04)
    expect(gpuCopies.get(geometry).data[5]).toBeCloseTo(0.04)
    expect(geometry.attributes.instancePlacement.array).toBe(buffers[i])
    expect(geometry.boundingBox.min.y).toBe(-2)
    expect(geometry.boundingSphere.center.y).toBe(0)
    expect(geometry.attributes.instanceDensityRank.version).toBe(2)
    expect(syncStreamedGeometry(geometry, slots[i], true)).toBe(false)
  })
  geometries.forEach(g => g.dispose()); base.dispose()
})
