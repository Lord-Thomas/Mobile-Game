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

// Pentagonal prism (gable) — non-indexed so each face gets its own flat normal.
// Cross-section shape:
//         (0, ridgeY)            ← apex
//        /           \
//  correct slope (same as roof inner)
//      /               \
// (-wr, eaveY)   (wr, eaveY)     ← shoulder = point where roof slope meets wall face
// |                         |    ← vertical strip (extension du mur)
// (-wr, baseY)   (wr, baseY)     ← base at wall top
function createGableGeometry({ width, depth, wallTopY, gableBaseY, pitch, overhangX, overhangZ, wallThickness, ridgeAxis, showStart, showEnd }) {
  const hw = width * 0.5 + wallThickness * 0.5   // halfWallWidth
  const hd = depth * 0.5 + wallThickness * 0.5   // halfWallDepth
  const halfRoofRun = ridgeAxis === 'z' ? width * 0.5 + overhangX : depth * 0.5 + overhangZ
  const halfWallRun = ridgeAxis === 'z' ? hw : hd

  const ridgeRise = Math.tan((pitch * Math.PI) / 180) * halfRoofRun
  const baseY = gableBaseY ?? wallTopY
  const ridgeY = wallTopY + ridgeRise   // apex = inner shell ridge height
  // Shoulder: height where the inner roof slope intersects the wall face
  const eaveY = wallTopY + ridgeRise * (halfRoofRun - halfWallRun) / halfRoofRun

  const p = []

  function tri(ax, ay, az, bx, by, bz, cx, cy, cz) {
    p.push(ax, ay, az, bx, by, bz, cx, cy, cz)
  }
  function quad(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz) {
    tri(ax, ay, az, bx, by, bz, cx, cy, cz)
    tri(bx, by, bz, dx, dy, dz, cx, cy, cz)
  }

  // Pentagon prism: A(-wr,base) B(wr,base) C(wr,eave) D(0,ridge) E(-wr,eave)
  // d0 = outer face coord, d1 = inner face coord, isZ = extrude along Z (vs X)
  function addPentaPrism(wr, d0, d1, isZ) {
    function vt(px, py, d) { return isZ ? [px, py, d] : [d, py, px] }
    const [a0x,a0y,a0z] = vt(-wr, baseY,  d0)
    const [b0x,b0y,b0z] = vt( wr, baseY,  d0)
    const [c0x,c0y,c0z] = vt( wr, eaveY,  d0)
    const [d0x,d0y,d0z] = vt(  0, ridgeY, d0)
    const [e0x,e0y,e0z] = vt(-wr, eaveY,  d0)

    const [a1x,a1y,a1z] = vt(-wr, baseY,  d1)
    const [b1x,b1y,b1z] = vt( wr, baseY,  d1)
    const [c1x,c1y,c1z] = vt( wr, eaveY,  d1)
    const [d1x,d1y,d1z] = vt(  0, ridgeY, d1)
    const [e1x,e1y,e1z] = vt(-wr, eaveY,  d1)

    // Outer face (d0): A,C,B winding → normal toward outer
    tri(a0x,a0y,a0z, e0x,e0y,e0z, b0x,b0y,b0z)   // lower half
    tri(e0x,e0y,e0z, c0x,c0y,c0z, b0x,b0y,b0z)   // lower half right
    tri(e0x,e0y,e0z, d0x,d0y,d0z, c0x,c0y,c0z)   // upper triangle

    // Inner face (d1): reversed
    tri(a1x,a1y,a1z, b1x,b1y,b1z, e1x,e1y,e1z)
    tri(e1x,e1y,e1z, b1x,b1y,b1z, c1x,c1y,c1z)
    tri(e1x,e1y,e1z, c1x,c1y,c1z, d1x,d1y,d1z)

    // 5 side edges
    quad(a0x,a0y,a0z, a1x,a1y,a1z, b0x,b0y,b0z, b1x,b1y,b1z)   // base A-B
    quad(b0x,b0y,b0z, b1x,b1y,b1z, c0x,c0y,c0z, c1x,c1y,c1z)   // right B-C
    quad(c0x,c0y,c0z, c1x,c1y,c1z, d0x,d0y,d0z, d1x,d1y,d1z)   // slope C-D
    quad(d0x,d0y,d0z, d1x,d1y,d1z, e0x,e0y,e0z, e1x,e1y,e1z)   // slope D-E
    quad(e0x,e0y,e0z, e1x,e1y,e1z, a0x,a0y,a0z, a1x,a1y,a1z)   // left E-A
  }

  function addSideWallInfill(x0, x1, z0, z1) {
    quad(x0, baseY, z0, x1, baseY, z1, x0, eaveY, z0, x1, eaveY, z1)
  }

  if (ridgeAxis === 'z') {
    if (showStart) addPentaPrism(hw, -hd, -hd + wallThickness, true)
    if (showEnd)   addPentaPrism(hw,  hd,  hd - wallThickness, true)

    // Side wall infills: closes the holes between side walls and roof slopes
    addSideWallInfill(-hw, -hw, -hd, hd)
    addSideWallInfill( hw,  hw, -hd, hd)
  } else {
    if (showStart) addPentaPrism(hd, -hw, -hw + wallThickness, false)
    if (showEnd)   addPentaPrism(hd,  hw,  hw - wallThickness, false)

    // Side wall infills: closes the holes between side walls and roof slopes
    addSideWallInfill(-hw, hw, -hd, -hd)
    addSideWallInfill(-hw, hw,  hd,  hd)
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
    width, depth, wallTopY, gableBaseY, pitch, overhangX, overhangZ, wallThickness, ridgeAxis,
    showStart: showStartGable, showEnd: showEndGable,
  }), [depth, gableBaseY, overhangX, overhangZ, pitch, ridgeAxis, showEndGable, showStartGable, wallThickness, wallTopY, width])

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
