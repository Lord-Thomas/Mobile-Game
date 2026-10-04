import { BufferGeometry, Float32BufferAttribute } from 'three'

// Three crossed, outward-leaning cards, with the original UVs and vertex colours.
// Roots stay on the soil; the lean creates actual visible area from above.
export function createVolumeTuftGeometry(card) {
  const source = card.getAttribute('position')
  const positions = [], uvs = [], colors = [], indices = []
  const height = Math.max(...Array.from({ length: source.count }, (_, i) => source.getY(i)))
  for (let plane = 0; plane < 3; plane++) {
    const angle = plane * Math.PI * 2 / 3
    const cos = Math.cos(angle), sin = Math.sin(angle)
    const heightScale = [1, 0.94, 1.03][plane]
    for (let i = 0; i < source.count; i++) {
      const x = source.getX(i), y = source.getY(i)
      const lean = (y / height) * 0.36
      positions.push(x * cos - lean * sin, y * heightScale, x * sin + lean * cos)
      uvs.push(card.attributes.uv.getX(i), card.attributes.uv.getY(i))
      colors.push(card.attributes.color.getX(i), card.attributes.color.getY(i), card.attributes.color.getZ(i))
    }
    for (const index of card.index.array) indices.push(index + plane * source.count)
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}
