import { expect, it } from 'vitest'
import { Frustum, Matrix4, PerspectiveCamera, Sphere, Vector3 } from 'three'
import { getFlatGrassField } from '../TerrainGroundCover'
import { partitionGrassField } from './spatialGrass'

it('preserves every instance exactly once and encloses animated tufts', async () => {
  const field = await getFlatGrassField(20, 5)
  const cells = partitionGrassField(field.fields)
  const tuples = batches => batches.flatMap(({ data, count }) =>
    Array.from({ length: count }, (_, i) => Array.from(data.subarray(i * 4, i * 4 + 4)).join(','))).sort()
  expect(tuples(cells)).toEqual(tuples(field.fields))
  expect(cells.length).toBeGreaterThan(4)
  for (const { data, count, bounds } of cells) {
    let enclosed = true
    for (let i = 0; i < count * 4; i += 4) {
      enclosed &&= bounds.containsPoint(new Vector3(data[i] - 1.9, data[i + 1] - 1.9, data[i + 2] - 1.9))
        && bounds.containsPoint(new Vector3(data[i] + 1.9, data[i + 1] + 1.9, data[i + 2] + 1.9))
    }
    expect(enclosed).toBe(true)
  }
})

it('culls off-camera cells while retaining every potentially visible cell', async () => {
  const cells = partitionGrassField((await getFlatGrassField(50, 5)).fields)
  const camera = new PerspectiveCamera(52, 1, 0.1, 420)
  camera.position.set(0, 2.4, 6)
  camera.lookAt(0, 0, -10)
  camera.updateMatrixWorld()
  const frustum = new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse))
  const visible = cells.filter(cell => frustum.intersectsSphere(cell.bounds.getBoundingSphere(new Sphere())))
  expect(visible.length).toBeGreaterThan(0)
  expect(visible.length).toBeLessThan(cells.length)
  for (const cell of cells) {
    if (frustum.intersectsBox(cell.bounds)) expect(visible).toContain(cell)
  }
})
