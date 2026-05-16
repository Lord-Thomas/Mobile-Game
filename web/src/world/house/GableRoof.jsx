import { useEffect, useMemo } from 'react'
import { BufferGeometry, DoubleSide, Float32BufferAttribute } from 'three'

function createRoofShellGeometry({ width, depth, wallTopY, pitch, overhangX, overhangZ, thickness, ridgeAxis }) {
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
        // Outer top slopes
        -halfRoofWidth, topEaveY, -halfRoofDepth,
        0, topRidgeY, -halfRoofDepth,
        -halfRoofWidth, topEaveY, halfRoofDepth,
        0, topRidgeY, halfRoofDepth,
        0, topRidgeY, -halfRoofDepth,
        halfRoofWidth, topEaveY, -halfRoofDepth,
        0, topRidgeY, halfRoofDepth,
        halfRoofWidth, topEaveY, halfRoofDepth,
        // Inner bottom slopes
        -halfRoofWidth, bottomEaveY, halfRoofDepth,
        0, bottomRidgeY, halfRoofDepth,
        -halfRoofWidth, bottomEaveY, -halfRoofDepth,
        0, bottomRidgeY, -halfRoofDepth,
        0, bottomRidgeY, halfRoofDepth,
        halfRoofWidth, bottomEaveY, halfRoofDepth,
        0, bottomRidgeY, -halfRoofDepth,
        halfRoofWidth, bottomEaveY, -halfRoofDepth,
        // X side walls (eave thickness caps)
        -halfRoofWidth, bottomEaveY, -halfRoofDepth,
        -halfRoofWidth, topEaveY, -halfRoofDepth,
        -halfRoofWidth, bottomEaveY, halfRoofDepth,
        -halfRoofWidth, topEaveY, halfRoofDepth,
        halfRoofWidth, topEaveY, -halfRoofDepth,
        halfRoofWidth, bottomEaveY, -halfRoofDepth,
        halfRoofWidth, topEaveY, halfRoofDepth,
        halfRoofWidth, bottomEaveY, halfRoofDepth,
        // Z end faces (eave cross-section at gable end)
        -halfRoofWidth, topEaveY, -halfRoofDepth,
        0, topRidgeY, -halfRoofDepth,
        0, bottomRidgeY, -halfRoofDepth,
        -halfRoofWidth, bottomEaveY, -halfRoofDepth,
        0, topRidgeY, -halfRoofDepth,
        halfRoofWidth, topEaveY, -halfRoofDepth,
        halfRoofWidth, bottomEaveY, -halfRoofDepth,
        0, bottomRidgeY, -halfRoofDepth,
        -halfRoofWidth, topEaveY, halfRoofDepth,
        0, topRidgeY, halfRoofDepth,
        0, bottomRidgeY, halfRoofDepth,
        -halfRoofWidth, bottomEaveY, halfRoofDepth,
        0, topRidgeY, halfRoofDepth,
        halfRoofWidth, topEaveY, halfRoofDepth,
        halfRoofWidth, bottomEaveY, halfRoofDepth,
        0, bottomRidgeY, halfRoofDepth,
      ]
    : [
        // Outer top slopes
        -halfRoofWidth, topEaveY, -halfRoofDepth,
        -halfRoofWidth, topRidgeY, 0,
        halfRoofWidth, topEaveY, -halfRoofDepth,
        halfRoofWidth, topRidgeY, 0,
        -halfRoofWidth, topRidgeY, 0,
        -halfRoofWidth, topEaveY, halfRoofDepth,
        halfRoofWidth, topRidgeY, 0,
        halfRoofWidth, topEaveY, halfRoofDepth,
        // Inner bottom slopes
        halfRoofWidth, bottomEaveY, -halfRoofDepth,
        halfRoofWidth, bottomRidgeY, 0,
        -halfRoofWidth, bottomEaveY, -halfRoofDepth,
        -halfRoofWidth, bottomRidgeY, 0,
        -halfRoofWidth, bottomRidgeY, 0,
        -halfRoofWidth, bottomEaveY, halfRoofDepth,
        halfRoofWidth, bottomRidgeY, 0,
        halfRoofWidth, bottomEaveY, halfRoofDepth,
        // Z side walls (eave thickness caps)
        -halfRoofWidth, bottomEaveY, -halfRoofDepth,
        -halfRoofWidth, topEaveY, -halfRoofDepth,
        halfRoofWidth, bottomEaveY, -halfRoofDepth,
        halfRoofWidth, topEaveY, -halfRoofDepth,
        -halfRoofWidth, topEaveY, halfRoofDepth,
        -halfRoofWidth, bottomEaveY, halfRoofDepth,
        halfRoofWidth, topEaveY, halfRoofDepth,
        halfRoofWidth, bottomEaveY, halfRoofDepth,
        // X end faces (eave cross-section at gable end)
        -halfRoofWidth, topEaveY, -halfRoofDepth,
        -halfRoofWidth, topRidgeY, 0,
        -halfRoofWidth, bottomRidgeY, 0,
        -halfRoofWidth, bottomEaveY, -halfRoofDepth,
        -halfRoofWidth, topRidgeY, 0,
        -halfRoofWidth, topEaveY, halfRoofDepth,
        -halfRoofWidth, bottomEaveY, halfRoofDepth,
        -halfRoofWidth, bottomRidgeY, 0,
        halfRoofWidth, topEaveY, -halfRoofDepth,
        halfRoofWidth, topRidgeY, 0,
        halfRoofWidth, bottomRidgeY, 0,
        halfRoofWidth, bottomEaveY, -halfRoofDepth,
        halfRoofWidth, topRidgeY, 0,
        halfRoofWidth, topEaveY, halfRoofDepth,
        halfRoofWidth, bottomEaveY, halfRoofDepth,
        halfRoofWidth, bottomRidgeY, 0,
      ]

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setIndex([
    0, 1, 2, 1, 3, 2,
    4, 5, 6, 5, 7, 6,
    8, 9, 10, 9, 11, 10,
    12, 13, 14, 13, 15, 14,
    16, 17, 18, 17, 19, 18,
    20, 21, 22, 21, 23, 22,
    24, 25, 26, 24, 26, 27,
    28, 29, 30, 28, 30, 31,
    32, 33, 34, 32, 34, 35,
    36, 37, 38, 36, 38, 39,
  ])
  geometry.computeVertexNormals()
  return geometry
}

// Triangular prism (gable) — non-indexed so each face gets its own flat normal
function createGableGeometry({ width, depth, wallTopY, gableBaseY, pitch, wallThickness, ridgeAxis, showStart, showEnd }) {
  const hw = width * 0.5 + wallThickness * 0.5
  const hd = depth * 0.5 + wallThickness * 0.5
  // Run measured from wall face — gives the same pitch angle as the roof slope
  const run = ridgeAxis === 'z' ? hw : hd
  const ridgeRise = Math.tan((pitch * Math.PI) / 180) * run
  const baseY = gableBaseY ?? wallTopY
  const ridgeY = baseY + ridgeRise

  const p = []

  function tri(ax, ay, az, bx, by, bz, cx, cy, cz) {
    p.push(ax, ay, az, bx, by, bz, cx, cy, cz)
  }
  function quad(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz) {
    tri(ax, ay, az, bx, by, bz, cx, cy, cz)
    tri(bx, by, bz, dx, dy, dz, cx, cy, cz)
  }

  // Add a triangular prism in either XY (isZ=true) or ZY (isZ=false) cross-section
  // Corners: A=(ax,ay), B=(bx,by), C=(cx,cy) in cross-section plane
  // d0 = outer face depth, d1 = inner face depth
  function addPrism(ax, ay, bx, by, cx, cy, d0, d1, isZ) {
    function v(px, py, d) { return isZ ? [px, py, d] : [d, py, px] }
    const [a0x, a0y, a0z] = v(ax, ay, d0)
    const [b0x, b0y, b0z] = v(bx, by, d0)
    const [c0x, c0y, c0z] = v(cx, cy, d0)
    const [a1x, a1y, a1z] = v(ax, ay, d1)
    const [b1x, b1y, b1z] = v(bx, by, d1)
    const [c1x, c1y, c1z] = v(cx, cy, d1)

    // Outer face — A,C,B winding so normal points toward outer direction
    tri(a0x, a0y, a0z, c0x, c0y, c0z, b0x, b0y, b0z)
    // Inner face — A,B,C winding (reversed)
    tri(a1x, a1y, a1z, b1x, b1y, b1z, c1x, c1y, c1z)
    // Bottom edge A-B
    quad(a0x, a0y, a0z, a1x, a1y, a1z, b0x, b0y, b0z, b1x, b1y, b1z)
    // Right edge B-C
    quad(b0x, b0y, b0z, b1x, b1y, b1z, c0x, c0y, c0z, c1x, c1y, c1z)
    // Left edge C-A
    quad(c0x, c0y, c0z, c1x, c1y, c1z, a0x, a0y, a0z, a1x, a1y, a1z)
  }

  if (ridgeAxis === 'z') {
    // Gable at Z faces; outer = further from center
    if (showStart) addPrism(-hw, baseY, hw, baseY, 0, ridgeY, -hd, -hd + wallThickness, true)
    if (showEnd)   addPrism(hw, baseY, -hw, baseY, 0, ridgeY,  hd,  hd - wallThickness, true)
  } else {
    // Gable at X faces
    if (showStart) addPrism(hd, baseY, -hd, baseY, 0, ridgeY, -hw, -hw + wallThickness, false)
    if (showEnd)   addPrism(-hd, baseY, hd, baseY, 0, ridgeY,  hw,  hw - wallThickness, false)
  }

  if (!p.length) return null
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(p, 3))
  geometry.computeVertexNormals()
  return geometry
}

function GableRoof({
  width,
  depth,
  wallTopY,
  gableBaseY,
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
    width, depth, wallTopY, pitch, overhangX, overhangZ, thickness, ridgeAxis,
  }), [depth, overhangX, overhangZ, pitch, ridgeAxis, thickness, wallTopY, width])

  const gableGeometry = useMemo(() => createGableGeometry({
    width, depth, wallTopY, gableBaseY, pitch, wallThickness, ridgeAxis,
    showStart: showStartGable, showEnd: showEndGable,
  }), [depth, gableBaseY, pitch, ridgeAxis, showEndGable, showStartGable, wallThickness, wallTopY, width])

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
