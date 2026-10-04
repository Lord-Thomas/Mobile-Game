import { BufferGeometry, Float32BufferAttribute, Vector3, Color } from 'three'
import { seededRandom } from './lushLayout'

// Opaque, folded leaves: no alpha cards or textures, and a real silhouette at all angles.
export function createPlantGeometry(kind, seed = 41) {
  const random = seededRandom(seed)
  const positions = [], colors = [], indices = []
  const palette = kind === 'shrub' ? ['#2d6535', '#447e3d', '#648d43']
    : kind === 'fern' ? ['#397c45', '#599750', '#78ad58'] : ['#5f873a', '#7c9e49', '#91ae58']
  function leaf(base, direction, length, width, colorIndex = 0, bend = 0.1) {
    const forward = direction.clone().normalize()
    let side = new Vector3().crossVectors(forward, new Vector3(0, 1, 0))
    if (side.lengthSq() < 0.001) side.set(1, 0, 0)
    side.normalize()
    const mid = base.clone().addScaledVector(forward, length * 0.47)
    const tip = base.clone().addScaledVector(forward, length)
    tip.y -= bend
    const ridge = mid.clone(); ridge.y += width * 0.18
    const vertices = [base, mid.clone().addScaledVector(side, width * 0.5), ridge,
      mid.clone().addScaledVector(side, -width * 0.5), tip]
    const start = positions.length / 3
    const color = new Color(palette[colorIndex % palette.length])
    for (let j = 0; j < vertices.length; j++) {
      positions.push(...vertices[j].toArray())
      const c = color.clone().multiplyScalar(j === 0 ? 0.7 : j === 2 ? 1.12 : 1)
      colors.push(c.r, c.g, c.b)
    }
    indices.push(start, start + 1, start + 2, start, start + 2, start + 3,
      start + 1, start + 4, start + 2, start + 2, start + 4, start + 3)
  }
  if (kind === 'shrub') {
    for (let branch = 0; branch < 15; branch++) {
      const angle = branch * 2.39996 + random() * 0.3
      const height = 0.45 + random() * 0.8
      const reach = 0.28 + random() * 0.46
      for (let tier = 0; tier < 8; tier++) {
        const t = (tier + 1) / 8
        const center = new Vector3(Math.cos(angle) * reach * t, height * t, Math.sin(angle) * reach * t)
        for (const sign of [-1, 1]) {
          const a = angle + sign * (0.7 + random() * 0.7)
          leaf(center, new Vector3(Math.cos(a), 0.15 + random() * 0.55, Math.sin(a)),
            (0.22 + random() * 0.14) * (1.15 - t * 0.3), 0.13 + random() * 0.1, branch + tier, 0.045)
        }
      }
    }
  } else if (kind === 'fern') {
    for (let frond = 0; frond < 9; frond++) {
      const angle = frond * 2.39996
      const length = 0.55 + random() * 0.4
      for (let step = 1; step <= 12; step++) {
        const t = step / 13
        const base = new Vector3(Math.cos(angle) * length * t, Math.sin(t * 2.2) * length * 0.62 + 0.08, Math.sin(angle) * length * t)
        const width = Math.sin(t * Math.PI) * 0.21 * (1 - t * 0.45)
        for (const sign of [-1, 1]) {
          const a = angle + sign * 1.04
          leaf(base, new Vector3(Math.cos(a), 0.16, Math.sin(a)), width, width * 0.4, frond + step, 0.02)
        }
      }
    }
  } else {
    for (let blade = 0; blade < 24; blade++) {
      const angle = random() * Math.PI * 2
      const radius = random() * 0.14
      leaf(new Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius),
        new Vector3(Math.cos(angle) * 0.4, 1, Math.sin(angle) * 0.4),
        0.4 + random() * 0.5, 0.035 + random() * 0.035, blade, 0.12)
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return geometry
}
