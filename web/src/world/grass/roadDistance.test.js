import { expect, it } from 'vitest'
import { getDistanceToRoad } from '../worldZones'
import { createRoadCurve } from '../roads/roadGeometry'
import { roadLayout } from '../roads/roadLayout'

it('preserves road distances when taking only one square root per query', () => {
  const curve = createRoadCurve(roadLayout.mainRoad.points)
  const points = Array.from({ length: 96 }, (_, i) => curve.getPointAt(i / 95))
  for (let x = -188; x <= 188; x += 17.3) for (let z = -188; z <= 188; z += 19.7) {
    let expected = Infinity
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i]
      const dx = b.x - a.x, dz = b.z - a.z
      const lengthSq = dx * dx + dz * dz
      const t = lengthSq ? Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / lengthSq)) : 0
      expected = Math.min(expected, Math.hypot(x - a.x - dx * t, z - a.z - dz * t))
    }
    expect(getDistanceToRoad(x, z)).toBeCloseTo(expected, 10)
  }
})
