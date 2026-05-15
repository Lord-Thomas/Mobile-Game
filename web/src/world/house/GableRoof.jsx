import { useEffect, useMemo } from 'react'
import { BufferGeometry, DoubleSide, Float32BufferAttribute } from 'three'

function createGableRoofGeometry({
  width,
  depth,
  baseY,
  ridgeHeight,
  overhangX,
  overhangZ,
  thickness,
  ridgeAxis = 'z',
}) {
  const halfWidth = width * 0.5 + overhangX
  const halfDepth = depth * 0.5 + overhangZ
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

function createGableEndGeometry({
  width,
  depth,
  baseY,
  ridgeHeight,
  overhangX,
  overhangZ,
  ridgeAxis = 'z',
}) {
  const halfWidth = width * 0.5 + overhangX
  const halfDepth = depth * 0.5 + overhangZ
  const topY = baseY + ridgeHeight
  const positions = ridgeAxis === 'z'
    ? [
        -halfWidth, baseY, -halfDepth,
        halfWidth, baseY, -halfDepth,
        0, topY, -halfDepth,
        halfWidth, baseY, halfDepth,
        -halfWidth, baseY, halfDepth,
        0, topY, halfDepth,
      ]
    : [
        -halfWidth, baseY, halfDepth,
        -halfWidth, baseY, -halfDepth,
        -halfWidth, topY, 0,
        halfWidth, baseY, -halfDepth,
        halfWidth, baseY, halfDepth,
        halfWidth, topY, 0,
      ]
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setIndex([0, 1, 2, 3, 4, 5])
  geometry.computeVertexNormals()
  return geometry
}

function GableRoof({
  width,
  depth,
  baseY,
  pitch = 32,
  overhang = 0.35,
  overhangX = overhang,
  overhangZ = overhang,
  thickness = 0.12,
  color = '#8f4b3a',
  gableColor = '#f3f0e5',
}) {
  const ridgeAxis = width >= depth ? 'x' : 'z'
  const run = ridgeAxis === 'z' ? width * 0.5 + overhangX : depth * 0.5 + overhangZ
  const ridgeHeight = Math.tan((pitch * Math.PI) / 180) * run
  const geometry = useMemo(() => createGableRoofGeometry({
    width,
    depth,
    baseY,
    ridgeHeight,
    overhangX,
    overhangZ,
    thickness,
    ridgeAxis,
  }), [baseY, depth, overhangX, overhangZ, ridgeAxis, ridgeHeight, thickness, width])
  const gableGeometry = useMemo(() => createGableEndGeometry({
    width,
    depth,
    baseY,
    ridgeHeight,
    overhangX,
    overhangZ,
    ridgeAxis,
  }), [baseY, depth, overhangX, overhangZ, ridgeAxis, ridgeHeight, width])

  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => gableGeometry.dispose(), [gableGeometry])

  return (
    <>
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshStandardMaterial color={color} roughness={0.84} side={DoubleSide} />
      </mesh>
      <mesh geometry={gableGeometry} castShadow receiveShadow>
        <meshStandardMaterial color={gableColor} roughness={0.8} side={DoubleSide} />
      </mesh>
    </>
  )
}

export default GableRoof
