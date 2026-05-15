import { useEffect, useMemo } from 'react'
import { BufferGeometry, Float32BufferAttribute } from 'three'

function createGableRoofGeometry({
  width,
  depth,
  baseY,
  ridgeHeight,
  overhang,
  thickness,
  ridgeAxis = 'z',
}) {
  const halfWidth = width * 0.5 + overhang
  const halfDepth = depth * 0.5 + overhang
  const topY = baseY + ridgeHeight
  const bottomY = baseY - thickness
  const positions = []
  const indices = []

  if (ridgeAxis === 'z') {
    positions.push(
      -halfWidth, baseY, -halfDepth,
      0, topY, -halfDepth,
      -halfWidth, baseY, halfDepth,
      0, topY, halfDepth,
      0, topY, -halfDepth,
      halfWidth, baseY, -halfDepth,
      0, topY, halfDepth,
      halfWidth, baseY, halfDepth,
      -halfWidth, bottomY, -halfDepth,
      -halfWidth, baseY, -halfDepth,
      -halfWidth, bottomY, halfDepth,
      -halfWidth, baseY, halfDepth,
      halfWidth, baseY, -halfDepth,
      halfWidth, bottomY, -halfDepth,
      halfWidth, baseY, halfDepth,
      halfWidth, bottomY, halfDepth,
      -halfWidth, bottomY, -halfDepth,
      halfWidth, bottomY, -halfDepth,
      -halfWidth, baseY, -halfDepth,
      halfWidth, baseY, -halfDepth,
      -halfWidth, baseY, halfDepth,
      halfWidth, baseY, halfDepth,
      -halfWidth, bottomY, halfDepth,
      halfWidth, bottomY, halfDepth,
    )
  } else {
    positions.push(
      -halfWidth, baseY, -halfDepth,
      -halfWidth, topY, 0,
      halfWidth, baseY, -halfDepth,
      halfWidth, topY, 0,
      -halfWidth, topY, 0,
      -halfWidth, baseY, halfDepth,
      halfWidth, topY, 0,
      halfWidth, baseY, halfDepth,
      -halfWidth, bottomY, -halfDepth,
      -halfWidth, baseY, -halfDepth,
      halfWidth, bottomY, -halfDepth,
      halfWidth, baseY, -halfDepth,
      -halfWidth, baseY, halfDepth,
      -halfWidth, bottomY, halfDepth,
      halfWidth, baseY, halfDepth,
      halfWidth, bottomY, halfDepth,
      -halfWidth, bottomY, -halfDepth,
      -halfWidth, bottomY, halfDepth,
      -halfWidth, baseY, -halfDepth,
      -halfWidth, baseY, halfDepth,
      halfWidth, baseY, -halfDepth,
      halfWidth, baseY, halfDepth,
      halfWidth, bottomY, -halfDepth,
      halfWidth, bottomY, halfDepth,
    )
  }

  indices.push(
    0, 1, 2, 1, 3, 2,
    4, 5, 6, 5, 7, 6,
    8, 9, 10, 9, 11, 10,
    12, 13, 14, 13, 15, 14,
    16, 17, 18, 17, 19, 18,
    20, 21, 22, 21, 23, 22,
  )

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function GableRoof({
  width,
  depth,
  baseY,
  pitch = 32,
  overhang = 0.35,
  thickness = 0.12,
  color = '#8f4b3a',
}) {
  const ridgeAxis = width >= depth ? 'x' : 'z'
  const run = ridgeAxis === 'z' ? width * 0.5 + overhang : depth * 0.5 + overhang
  const ridgeHeight = Math.tan((pitch * Math.PI) / 180) * run
  const geometry = useMemo(() => createGableRoofGeometry({
    width,
    depth,
    baseY,
    ridgeHeight,
    overhang,
    thickness,
    ridgeAxis,
  }), [baseY, depth, overhang, ridgeAxis, ridgeHeight, thickness, width])

  useEffect(() => () => geometry.dispose(), [geometry])

  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial color={color} roughness={0.84} />
    </mesh>
  )
}

export default GableRoof
