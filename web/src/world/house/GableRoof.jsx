import { useEffect, useMemo } from 'react'
import { BufferGeometry, DoubleSide, Float32BufferAttribute } from 'three'

function createGeometry(positions, indices) {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function createRoofShellGeometry({
  width,
  depth,
  wallTopY,
  pitch,
  overhangX,
  overhangZ,
  thickness,
  ridgeAxis,
}) {
  const halfRoofWidth = width * 0.5 + overhangX
  const halfRoofDepth = depth * 0.5 + overhangZ
  const run = ridgeAxis === 'z' ? halfRoofWidth : halfRoofDepth
  const ridgeRise = Math.tan((pitch * Math.PI) / 180) * run
  const topEaveY = wallTopY + thickness
  const topRidgeY = topEaveY + ridgeRise
  const bottomEaveY = wallTopY
  const bottomRidgeY = topRidgeY - thickness
  const positions = ridgeAxis === 'z'
    ? [
        -halfRoofWidth, topEaveY, -halfRoofDepth,
        0, topRidgeY, -halfRoofDepth,
        -halfRoofWidth, topEaveY, halfRoofDepth,
        0, topRidgeY, halfRoofDepth,
        0, topRidgeY, -halfRoofDepth,
        halfRoofWidth, topEaveY, -halfRoofDepth,
        0, topRidgeY, halfRoofDepth,
        halfRoofWidth, topEaveY, halfRoofDepth,

        -halfRoofWidth, bottomEaveY, halfRoofDepth,
        0, bottomRidgeY, halfRoofDepth,
        -halfRoofWidth, bottomEaveY, -halfRoofDepth,
        0, bottomRidgeY, -halfRoofDepth,
        0, bottomRidgeY, halfRoofDepth,
        halfRoofWidth, bottomEaveY, halfRoofDepth,
        0, bottomRidgeY, -halfRoofDepth,
        halfRoofWidth, bottomEaveY, -halfRoofDepth,

        // X side walls (ferme la tranche à X=±halfRoofWidth)
        -halfRoofWidth, bottomEaveY, -halfRoofDepth,
        -halfRoofWidth, topEaveY,    -halfRoofDepth,
        -halfRoofWidth, bottomEaveY,  halfRoofDepth,
        -halfRoofWidth, topEaveY,     halfRoofDepth,
        halfRoofWidth,  topEaveY,    -halfRoofDepth,
        halfRoofWidth,  bottomEaveY, -halfRoofDepth,
        halfRoofWidth,  topEaveY,     halfRoofDepth,
        halfRoofWidth,  bottomEaveY,  halfRoofDepth,

        // Z end faces (ferme la tranche à Z=±halfRoofDepth)
        -halfRoofWidth, topEaveY,    -halfRoofDepth,
        0,              topRidgeY,   -halfRoofDepth,
        0,              bottomRidgeY,-halfRoofDepth,
        -halfRoofWidth, bottomEaveY, -halfRoofDepth,
        0,              topRidgeY,   -halfRoofDepth,
        halfRoofWidth,  topEaveY,    -halfRoofDepth,
        halfRoofWidth,  bottomEaveY, -halfRoofDepth,
        0,              bottomRidgeY,-halfRoofDepth,
        -halfRoofWidth, topEaveY,     halfRoofDepth,
        0,              topRidgeY,    halfRoofDepth,
        0,              bottomRidgeY, halfRoofDepth,
        -halfRoofWidth, bottomEaveY,  halfRoofDepth,
        0,              topRidgeY,    halfRoofDepth,
        halfRoofWidth,  topEaveY,     halfRoofDepth,
        halfRoofWidth,  bottomEaveY,  halfRoofDepth,
        0,              bottomRidgeY, halfRoofDepth,
      ]
    : [
        -halfRoofWidth, topEaveY, -halfRoofDepth,
        -halfRoofWidth, topRidgeY, 0,
        halfRoofWidth, topEaveY, -halfRoofDepth,
        halfRoofWidth, topRidgeY, 0,
        -halfRoofWidth, topRidgeY, 0,
        -halfRoofWidth, topEaveY, halfRoofDepth,
        halfRoofWidth, topRidgeY, 0,
        halfRoofWidth, topEaveY, halfRoofDepth,

        halfRoofWidth, bottomEaveY, -halfRoofDepth,
        halfRoofWidth, bottomRidgeY, 0,
        -halfRoofWidth, bottomEaveY, -halfRoofDepth,
        -halfRoofWidth, bottomRidgeY, 0,
        -halfRoofWidth, bottomRidgeY, 0,
        -halfRoofWidth, bottomEaveY, halfRoofDepth,
        halfRoofWidth, bottomRidgeY, 0,
        halfRoofWidth, bottomEaveY, halfRoofDepth,

        -halfRoofWidth, bottomEaveY, -halfRoofDepth,
        -halfRoofWidth, topEaveY, -halfRoofDepth,
        halfRoofWidth, bottomEaveY, -halfRoofDepth,
        halfRoofWidth, topEaveY, -halfRoofDepth,
        -halfRoofWidth, topEaveY, halfRoofDepth,
        -halfRoofWidth, bottomEaveY, halfRoofDepth,
        halfRoofWidth, topEaveY, halfRoofDepth,
        halfRoofWidth, bottomEaveY, halfRoofDepth,

        // eave end faces at X=±halfRoofWidth (ferme la tranche du débord)
        -halfRoofWidth, topEaveY,    -halfRoofDepth,
        -halfRoofWidth, topRidgeY,   0,
        -halfRoofWidth, bottomRidgeY,0,
        -halfRoofWidth, bottomEaveY, -halfRoofDepth,
        -halfRoofWidth, topRidgeY,   0,
        -halfRoofWidth, topEaveY,    halfRoofDepth,
        -halfRoofWidth, bottomEaveY, halfRoofDepth,
        -halfRoofWidth, bottomRidgeY,0,
        halfRoofWidth,  topEaveY,    -halfRoofDepth,
        halfRoofWidth,  topRidgeY,   0,
        halfRoofWidth,  bottomRidgeY,0,
        halfRoofWidth,  bottomEaveY, -halfRoofDepth,
        halfRoofWidth,  topRidgeY,   0,
        halfRoofWidth,  topEaveY,    halfRoofDepth,
        halfRoofWidth,  bottomEaveY, halfRoofDepth,
        halfRoofWidth,  bottomRidgeY,0,
      ]
  return createGeometry(positions, [
    0, 1, 2, 1, 3, 2,
    4, 5, 6, 5, 7, 6,
    8, 9, 10, 9, 11, 10,
    12, 13, 14, 13, 15, 14,
    16, 17, 18, 17, 19, 18,
    20, 21, 22, 21, 23, 22,
    // eave end caps (communs aux deux axes, décalés à partir de 24)
    24, 25, 26, 24, 26, 27,
    28, 29, 30, 28, 30, 31,
    32, 33, 34, 32, 34, 35,
    36, 37, 38, 36, 38, 39,
  ])
}

function createGableGeometry({
  width,
  depth,
  wallTopY,
  pitch,
  overhangX,
  overhangZ,
  wallThickness,
  thickness,
  ridgeAxis,
  showStart,
  showEnd,
}) {
  const halfWallWidth = width * 0.5 + wallThickness * 0.5
  const halfWallDepth = depth * 0.5 + wallThickness * 0.5
  const run = ridgeAxis === 'z' ? width * 0.5 + overhangX : depth * 0.5 + overhangZ
  const ridgeRise = Math.tan((pitch * Math.PI) / 180) * run
  const ridgeY = wallTopY + thickness + ridgeRise
  const positions = []
  const indices = []

  if (ridgeAxis === 'z') {
    if (showStart) {
      positions.push(-halfWallWidth, wallTopY, -halfWallDepth, halfWallWidth, wallTopY, -halfWallDepth, 0, ridgeY, -halfWallDepth)
      indices.push(0, 1, 2)
    }
    if (showEnd) {
      const offset = positions.length / 3
      positions.push(halfWallWidth, wallTopY, halfWallDepth, -halfWallWidth, wallTopY, halfWallDepth, 0, ridgeY, halfWallDepth)
      indices.push(offset, offset + 1, offset + 2)
    }
  } else {
    if (showStart) {
      positions.push(-halfWallWidth, wallTopY, halfWallDepth, -halfWallWidth, wallTopY, -halfWallDepth, -halfWallWidth, ridgeY, 0)
      indices.push(0, 1, 2)
    }
    if (showEnd) {
      const offset = positions.length / 3
      positions.push(halfWallWidth, wallTopY, -halfWallDepth, halfWallWidth, wallTopY, halfWallDepth, halfWallWidth, ridgeY, 0)
      indices.push(offset, offset + 1, offset + 2)
    }
  }

  return positions.length ? createGeometry(positions, indices) : null
}

function GableRoof({
  width,
  depth,
  wallTopY,
  pitch = 32,
  overhang = 0.35,
  overhangX = overhang,
  overhangZ = overhang,
  thickness = 0.12,
  wallThickness = 0.18,
  color = '#8f4b3a',
  gableColor = '#f3f0e5',
  showStartGable = true,
  showEndGable = true,
}) {
  const ridgeAxis = width >= depth ? 'x' : 'z'
  const shellGeometry = useMemo(() => createRoofShellGeometry({
    width,
    depth,
    wallTopY,
    pitch,
    overhangX,
    overhangZ,
    thickness,
    ridgeAxis,
  }), [depth, overhangX, overhangZ, pitch, ridgeAxis, thickness, wallTopY, width])
  const gableGeometry = useMemo(() => createGableGeometry({
    width,
    depth,
    wallTopY,
    pitch,
    overhangX,
    overhangZ,
    wallThickness,
    thickness,
    ridgeAxis,
    showStart: showStartGable,
    showEnd: showEndGable,
  }), [depth, overhangX, overhangZ, pitch, ridgeAxis, showEndGable, showStartGable, thickness, wallThickness, wallTopY, width])

  useEffect(() => () => shellGeometry.dispose(), [shellGeometry])
  useEffect(() => () => gableGeometry?.dispose(), [gableGeometry])

  return (
    <>
      <mesh geometry={shellGeometry} castShadow receiveShadow>
        <meshStandardMaterial color={color} roughness={0.84} side={DoubleSide} />
      </mesh>
      {gableGeometry && (
        <mesh geometry={gableGeometry} castShadow receiveShadow>
          <meshStandardMaterial color={gableColor} roughness={0.8} side={DoubleSide} />
        </mesh>
      )}
    </>
  )
}

export default GableRoof
