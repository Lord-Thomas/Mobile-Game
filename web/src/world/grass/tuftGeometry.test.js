import { expect, it } from 'vitest'
import { PlaneGeometry, Float32BufferAttribute } from 'three'
import { createVolumeTuftGeometry } from './tuftGeometry'

it('keeps roots on the ground and presents real area from above with six triangles', () => {
  const card = new PlaneGeometry(1.08, 0.78)
  card.translate(0, 0.39, 0)
  card.setAttribute('color', new Float32BufferAttribute(new Float32Array(12).fill(0.7), 3))
  const tuft = createVolumeTuftGeometry(card)
  expect(tuft.index.count).toBe(18)
  const p = tuft.attributes.position
  let topArea = 0, roots = 0
  for (let i = 0; i < p.count; i++) {
    expect(p.getY(i)).toBeGreaterThanOrEqual(0)
    if (p.getY(i) < 0.00001) roots++
  }
  for (let t = 0; t < tuft.index.count; t += 3) {
    const [a, b, c] = Array.from(tuft.index.array.slice(t, t + 3))
    topArea += Math.abs((p.getX(b) - p.getX(a)) * (p.getZ(c) - p.getZ(a))
      - (p.getZ(b) - p.getZ(a)) * (p.getX(c) - p.getX(a))) / 2
  }
  expect(roots).toBe(6)
  expect(topArea).toBeGreaterThan(1)
  for (let plane = 0; plane < 3; plane++) {
    expect([...tuft.attributes.uv.array.slice(plane * 8, plane * 8 + 8)]).toEqual([...card.attributes.uv.array])
    expect([...tuft.attributes.color.array.slice(plane * 12, plane * 12 + 12)]).toEqual([...card.attributes.color.array])
  }
  tuft.dispose(); card.dispose()
})
