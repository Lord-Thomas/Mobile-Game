import { describe, expect, it } from 'vitest'
import { SpatialHash2D } from './spatialHash2D'

describe('SpatialHash2D', () => {
  it('returns only entries intersecting the requested area', () => {
    const index = new SpatialHash2D(4)
    index.insertPoint({ id: 'near', x: 1, z: 1 }, 1, 1)
    index.insertPoint({ id: 'far', x: 20, z: 20 }, 20, 20)

    expect(index.queryAabb(0, 0, 3, 3).map(({ id }) => id)).toEqual(['near'])
  })

  it('deduplicates entries spanning several cells and preserves insertion order', () => {
    const index = new SpatialHash2D(2)
    index.insertAabb({ id: 'large' }, -2, -2, 4, 4, 0)
    index.insertPoint({ id: 'point', x: 0, z: 0 }, 0, 0, 1)

    expect(index.queryAabb(-1, -1, 1, 1).map(({ id }) => id)).toEqual(['large', 'point'])
  })

  it('filters point entries by circular radius', () => {
    const index = new SpatialHash2D(2)
    index.insertPoint({ id: 'inside', position: { x: 0.5, z: 0.5 } }, 0.5, 0.5)
    index.insertPoint({ id: 'corner', position: { x: 0.9, z: 0.9 } }, 0.9, 0.9)

    expect(index.queryRadius(0, 0, 1).map(({ id }) => id)).toEqual(['inside'])
  })

  it('moves keyed entries without duplicating them or changing their order', () => {
    const index = new SpatialHash2D(2)
    index.insertKeyedPoint('first', { id: 'first', position: { x: 0, z: 0 } }, 0, 0)
    index.insertKeyedPoint('second', { id: 'second', position: { x: 1, z: 0 } }, 1, 0)

    index.updateKeyedPoint('first', { id: 'first', position: { x: 5, z: 0 } }, 5, 0)

    expect(index.queryRadius(0, 0, 2).map(({ id }) => id)).toEqual(['second'])
    expect(index.queryRadius(5, 0, 2).map(({ id }) => id)).toEqual(['first'])
    expect(index.queryAabb(-1, -1, 6, 1).map(({ id }) => id)).toEqual(['first', 'second'])
  })
})
