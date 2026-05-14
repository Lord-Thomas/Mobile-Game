import { useMemo } from 'react'
import { BufferGeometry, DoubleSide, Float32BufferAttribute } from 'three'

const MOUNTAIN_RADIUS = 76
const MOUNTAIN_SEGMENTS = 40

function createOuterHillsGeometry() {
  const positions = []
  const indices = []
  const segments = 56

  for (let index = 0; index <= segments; index += 1) {
    const t = index / segments
    const angle = t * Math.PI * 2
    const innerRadius = 43 + Math.sin(index * 0.9) * 2.4
    const outerRadius = 61 + Math.sin(index * 1.4) * 3.2
    const crestRadius = 52 + Math.sin(index * 1.1) * 2.6
    const wave = Math.sin(index * 0.77) * 0.45 + Math.sin(index * 1.91) * 0.35
    const crestHeight = 0.9 + wave * 0.45 + (index % 7 === 0 ? 0.5 : 0)
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)

    positions.push(cos * innerRadius, -0.18, sin * innerRadius)
    positions.push(cos * crestRadius, crestHeight, sin * crestRadius)
    positions.push(cos * outerRadius, -0.08, sin * outerRadius)

    if (index < segments) {
      const a = index * 3
      const b = a + 1
      const c = a + 2
      const d = a + 3
      const e = a + 4
      const f = a + 5
      indices.push(a, d, b)
      indices.push(b, d, e)
      indices.push(b, e, c)
      indices.push(c, e, f)
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function createMountainRingGeometry() {
  const positions = []
  const indices = []

  for (let index = 0; index <= MOUNTAIN_SEGMENTS; index += 1) {
    const t = index / MOUNTAIN_SEGMENTS
    const angle = t * Math.PI * 2
    const nextNoise = Math.sin(index * 1.73) * 0.45 + Math.sin(index * 0.61) * 0.55
    const radius = MOUNTAIN_RADIUS + Math.sin(index * 2.1) * 4.5
    const x = Math.cos(angle) * radius
    const z = Math.sin(angle) * radius
    const baseY = -0.15
    const topY = 7.5 + nextNoise * 2.6 + (index % 5 === 0 ? 2.2 : 0)

    positions.push(x, baseY, z)
    positions.push(x, topY, z)

    if (index < MOUNTAIN_SEGMENTS) {
      const a = index * 2
      const b = a + 1
      const c = a + 2
      const d = a + 3
      indices.push(a, c, b)
      indices.push(b, c, d)
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function DistantScenery() {
  const mountains = useMemo(() => createMountainRingGeometry(), [])
  const outerHills = useMemo(() => createOuterHillsGeometry(), [])

  return (
    <group>
      <mesh geometry={outerHills} renderOrder={-6}>
        <meshStandardMaterial color="#7f9d66" roughness={1} side={DoubleSide} fog />
      </mesh>
      <mesh position={[0, -0.24, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[39, 92, 96]} />
        <meshStandardMaterial color="#8ead79" roughness={1} side={DoubleSide} fog />
      </mesh>
      <mesh geometry={mountains} renderOrder={-5}>
        <meshStandardMaterial color="#86a47c" roughness={1} side={DoubleSide} fog />
      </mesh>
      <mesh position={[0, 2.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[60, 94, 96]} />
        <meshStandardMaterial color="#b7cfb0" roughness={1} transparent opacity={0.24} side={DoubleSide} depthWrite={false} fog />
      </mesh>
    </group>
  )
}

export default DistantScenery
