import { useEffect, useMemo } from 'react'
import { BufferGeometry, DoubleSide, Float32BufferAttribute, RepeatWrapping, SRGBColorSpace } from 'three'

// Texture repeat scale — matches exterior wall repeat so gable tiles identically
const GABLE_UV_REPEAT = 0.18

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
//
// UV coordinates use world-space planar projection (px * R, py * R) so the
// texture tiles identically to the exterior wall material.
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

  const R = GABLE_UV_REPEAT
  const p = []
  const uvs = []

  // Push a single vertex (world position + planar UV)
  function pushVert(wx, wy, wz, u, v) {
    p.push(wx, wy, wz)
    uvs.push(u, v)
  }

  function tri(a, b, c) {
    pushVert(...a); pushVert(...b); pushVert(...c)
  }
  function quad(a, b, c, d) {
    tri(a, b, c); tri(b, d, c)
  }

  // Pentagon prism: A(-wr,base) B(wr,base) C(wr,eave) D(0,ridge) E(-wr,eave)
  // d0 = outer face coord, d1 = inner face coord, isZ = extrude along Z (vs X)
  // UV uses (px, py) in the gable's cross-section plane — matches wall tiling.
  function addPentaPrism(wr, d0, d1, isZ) {
    // mk: local coords (px=lateral, py=height, d=depth) → [worldX, worldY, worldZ, u, v]
    function mk(px, py, d) {
      const [wx, wy, wz] = isZ ? [px, py, d] : [d, py, px]
      return [wx, wy, wz, px * R, py * R]
    }

    const A0 = mk(-wr, baseY,  d0)
    const B0 = mk( wr, baseY,  d0)
    const C0 = mk( wr, eaveY,  d0)
    const R0 = mk(  0, ridgeY, d0)   // ridge at d0
    const E0 = mk(-wr, eaveY,  d0)
    const A1 = mk(-wr, baseY,  d1)
    const B1 = mk( wr, baseY,  d1)
    const C1 = mk( wr, eaveY,  d1)
    const R1 = mk(  0, ridgeY, d1)   // ridge at d1
    const E1 = mk(-wr, eaveY,  d1)

    // Outer face (d0): winding → normal toward outer
    tri(A0, E0, B0)
    tri(E0, C0, B0)
    tri(E0, R0, C0)

    // Inner face (d1): reversed
    tri(A1, B1, E1)
    tri(E1, B1, C1)
    tri(E1, C1, R1)

    // 5 side quads
    quad(A0, A1, B0, B1)   // base A–B
    quad(B0, B1, C0, C1)   // right B–C
    quad(C0, C1, R0, R1)   // slope C–D(ridge)
    quad(R0, R1, E0, E1)   // slope D(ridge)–E
    quad(E0, E1, A0, A1)   // left E–A
  }

  // Thin vertical infill panel matching the side wall face between ridgeAxis side walls
  // and the sloped shoulder of the gable. Fills the strip from baseY to eaveY.
  function addSideWallInfill(x0, x1, z0, z1) {
    // UV: along-wall direction for u, height for v
    const uFn = ridgeAxis === 'z'
      ? (wx, wz) => wz * R
      : (wx, wz) => wx * R
    const lo0 = [x0, baseY, z0, uFn(x0, z0), baseY * R]
    const lo1 = [x1, baseY, z1, uFn(x1, z1), baseY * R]
    const hi0 = [x0, eaveY, z0, uFn(x0, z0), eaveY * R]
    const hi1 = [x1, eaveY, z1, uFn(x1, z1), eaveY * R]
    quad(lo0, lo1, hi0, hi1)
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
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
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
  gableTexture = null,
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

  // Clone and configure the gable texture so it tiles at the same scale as exterior walls
  const tiledGableTexture = useMemo(() => {
    if (!gableTexture) return null
    const tex = gableTexture.clone()
    tex.wrapS = RepeatWrapping
    tex.wrapT = RepeatWrapping
    tex.repeat.set(1, 1)   // UVs already encode world-space repeat via GABLE_UV_REPEAT
    tex.colorSpace = SRGBColorSpace
    tex.needsUpdate = true
    return tex
  }, [gableTexture])

  useEffect(() => () => shellGeometry.dispose(), [shellGeometry])
  useEffect(() => () => gableGeometry?.dispose(), [gableGeometry])
  useEffect(() => () => tiledGableTexture?.dispose(), [tiledGableTexture])

  return (
    <>
      <mesh geometry={shellGeometry} castShadow receiveShadow>
        <meshStandardMaterial color={color} roughness={0.84} side={DoubleSide} />
      </mesh>
      {gableGeometry && (
        <mesh geometry={gableGeometry} castShadow receiveShadow>
          <meshStandardMaterial
            color={gableColor}
            map={tiledGableTexture}
            roughness={0.78}
            side={DoubleSide}
          />
        </mesh>
      )}
    </>
  )
}

export default GableRoof
