import { useEffect, useMemo } from 'react'
import { BufferGeometry, DoubleSide, Float32BufferAttribute } from 'three'

function createGeometry(positions, indices) {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function LeanToRoof({
  width,
  depth,
  wallTopY,
  attachSide = 'south',
  rise = 0.9,
  overhang = 0.24,
  overhangAttached = 0,
  thickness = 0.12,
  color = '#8f4b3a',
}) {
  const geometry = useMemo(() => {
    const ovW = attachSide === 'west' ? overhangAttached : overhang
    const ovE = attachSide === 'east' ? overhangAttached : overhang
    const ovS = attachSide === 'south' ? overhangAttached : overhang
    const ovN = attachSide === 'north' ? overhangAttached : overhang

    const x0 = -width * 0.5 - ovW
    const x1 = width * 0.5 + ovE
    const z0 = -depth * 0.5 - ovS
    const z1 = depth * 0.5 + ovN

    const yH = wallTopY + rise
    const yL = wallTopY

    let y00, y10, y01, y11
    if (attachSide === 'west') {
      y00 = yH; y10 = yL; y01 = yH; y11 = yL
    } else if (attachSide === 'east') {
      y00 = yL; y10 = yH; y01 = yL; y11 = yH
    } else if (attachSide === 'south') {
      y00 = yH; y10 = yH; y01 = yL; y11 = yL
    } else {
      y00 = yL; y10 = yL; y01 = yH; y11 = yH
    }

    // 8 vertices: 4 outer top (0-3) + 4 inner bottom (4-7)
    const v = [
      x0, y00, z0,              // 0 SW outer
      x1, y10, z0,              // 1 SE outer
      x0, y01, z1,              // 2 NW outer
      x1, y11, z1,              // 3 NE outer
      x0, y00 - thickness, z0,  // 4 SW inner
      x1, y10 - thickness, z0,  // 5 SE inner
      x0, y01 - thickness, z1,  // 6 NW inner
      x1, y11 - thickness, z1,  // 7 NE inner
    ]

    // 6 closed faces: top, bottom, south, north, west, east
    const quads = [
      [0, 1, 2, 3],  // top outer
      [5, 4, 7, 6],  // bottom inner
      [1, 0, 5, 4],  // south (Z=z0)
      [2, 3, 6, 7],  // north (Z=z1)
      [0, 2, 4, 6],  // west  (X=x0)
      [3, 1, 7, 5],  // east  (X=x1)
    ]

    const positions = []
    const indices = []
    quads.forEach(([a, b, c, d]) => {
      const base = positions.length / 3
      positions.push(v[a * 3], v[a * 3 + 1], v[a * 3 + 2])
      positions.push(v[b * 3], v[b * 3 + 1], v[b * 3 + 2])
      positions.push(v[c * 3], v[c * 3 + 1], v[c * 3 + 2])
      positions.push(v[d * 3], v[d * 3 + 1], v[d * 3 + 2])
      indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2)
    })

    return createGeometry(positions, indices)
  }, [attachSide, depth, overhang, overhangAttached, rise, thickness, wallTopY, width])

  useEffect(() => () => geometry.dispose(), [geometry])

  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial color={color} roughness={0.84} side={DoubleSide} />
    </mesh>
  )
}

export default LeanToRoof
