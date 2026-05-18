import { useEffect, useMemo } from 'react'
import { BufferGeometry, DoubleSide, Float32BufferAttribute, RepeatWrapping, SRGBColorSpace } from 'three'

const PIGNON_UV_REPEAT = 0.18  // same scale as exterior wall tiling

function createGeometry(positions, uvs, indices) {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  if (uvs) geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
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
  wallThickness = 0.18,
  color = '#8f4b3a',
  gableColor = '#f3f0e5',
  gableTexture = null,
}) {
  // ─── Pignon (gable end) geometry ──────────────────────────────────────────
  // Two trapezoidal prisms, one at each gable end, with UV coords for texturing.
  const gableGeometry = useMemo(() => {
    const R = PIGNON_UV_REPEAT

    const x0 = -width * 0.5 - wallThickness * 0.5
    const x1 =  width * 0.5 + wallThickness * 0.5
    const z0 = -depth * 0.5 - wallThickness * 0.5
    const z1 =  depth * 0.5 + wallThickness * 0.5

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

    // UV projection: use the axis that runs along the pignon face width
    // south/north attachment → pignons face ±X → width runs along Z → u = z*R
    // west/east  attachment → pignons face ±Z → width runs along X → u = x*R
    const uvFn = (attachSide === 'south' || attachSide === 'north')
      ? ([x, y, z]) => [z * R, y * R]
      : ([x, y, z]) => [x * R, y * R]

    const positions = []
    const uvs = []
    const indices = []

    function addQuad(a, b, c, d) {
      const base = positions.length / 3
      positions.push(...a, ...b, ...c, ...d)
      uvs.push(...uvFn(a), ...uvFn(b), ...uvFn(c), ...uvFn(d))
      indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2)
    }

    function addPrism(a0, b0, c0, d0, a1, b1, c1, d1) {
      addQuad(a0, b0, c0, d0)           // front face
      addQuad(b1, a1, d1, c1)           // back face (reversed)
      addQuad(a0, a1, b0, b1)           // side A
      addQuad(b0, b1, d0, d1)           // side B
      addQuad(d0, d1, c0, c1)           // side C
      addQuad(c0, c1, a0, a1)           // side D
    }

    const inset = 0.002

    if (attachSide === 'north' || attachSide === 'south') {
      // Left gable end (X = x0 side)
      addPrism(
        [x0,                wallTopY, z0 + inset],
        [x0,                wallTopY, z1 - inset],
        [x0,                y00,      z0 + inset],
        [x0,                y01,      z1 - inset],
        [x0 + wallThickness, wallTopY, z0 + inset],
        [x0 + wallThickness, wallTopY, z1 - inset],
        [x0 + wallThickness, y00,      z0 + inset],
        [x0 + wallThickness, y01,      z1 - inset],
      )
      // Right gable end (X = x1 side)
      addPrism(
        [x1 - wallThickness, wallTopY, z0 + inset],
        [x1 - wallThickness, wallTopY, z1 - inset],
        [x1 - wallThickness, y10,      z0 + inset],
        [x1 - wallThickness, y11,      z1 - inset],
        [x1,                 wallTopY, z0 + inset],
        [x1,                 wallTopY, z1 - inset],
        [x1,                 y10,      z0 + inset],
        [x1,                 y11,      z1 - inset],
      )
    } else {
      // Front gable end (Z = z0 side)
      addPrism(
        [x0 + inset, wallTopY, z0],
        [x1 - inset, wallTopY, z0],
        [x0 + inset, y00,      z0],
        [x1 - inset, y10,      z0],
        [x0 + inset, wallTopY, z0 + wallThickness],
        [x1 - inset, wallTopY, z0 + wallThickness],
        [x0 + inset, y00,      z0 + wallThickness],
        [x1 - inset, y10,      z0 + wallThickness],
      )
      // Back gable end (Z = z1 side)
      addPrism(
        [x0 + inset, wallTopY, z1 - wallThickness],
        [x1 - inset, wallTopY, z1 - wallThickness],
        [x0 + inset, y01,      z1 - wallThickness],
        [x1 - inset, y11,      z1 - wallThickness],
        [x0 + inset, wallTopY, z1],
        [x1 - inset, wallTopY, z1],
        [x0 + inset, y01,      z1],
        [x1 - inset, y11,      z1],
      )
    }

    return createGeometry(positions, uvs, indices)
  }, [attachSide, depth, rise, wallThickness, wallTopY, width])

  // ─── Roof shell geometry ───────────────────────────────────────────────────
  const geometry = useMemo(() => {
    const ovW = attachSide === 'west'  ? overhangAttached : overhang
    const ovE = attachSide === 'east'  ? overhangAttached : overhang
    const ovS = attachSide === 'south' ? overhangAttached : overhang
    const ovN = attachSide === 'north' ? overhangAttached : overhang

    const x0 = -width * 0.5 - ovW
    const x1 =  width * 0.5 + ovE
    const z0 = -depth * 0.5 - ovS
    const z1 =  depth * 0.5 + ovN

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

    // Compute roof normal to offset the inner face along the slope
    const ux = x1 - x0, uy = y10 - y00
    const vz = z1 - z0, vy = y01 - y00
    let nx = uy * vz
    let ny = -(ux * vz)
    let nz = ux * vy - uy * 0   // simplifies since uz=vx=0

    // Recompute properly
    nx = uy * vz - 0 * vy
    ny = 0 * 0 - ux * vz
    nz = ux * vy - uy * 0

    if (ny < 0) { nx *= -1; ny *= -1; nz *= -1 }
    const nLen = Math.hypot(nx, ny, nz) || 1
    nx /= nLen; ny /= nLen; nz /= nLen

    function innerPoint(x, y, z) {
      return [x + nx * thickness, y - Math.abs(ny) * thickness, z + nz * thickness]
    }

    const p4 = innerPoint(x0, y00, z0)
    const p5 = innerPoint(x1, y10, z0)
    const p6 = innerPoint(x0, y01, z1)
    const p7 = innerPoint(x1, y11, z1)

    const v = [
      x0, y00, z0,  // 0 SW outer
      x1, y10, z0,  // 1 SE outer
      x0, y01, z1,  // 2 NW outer
      x1, y11, z1,  // 3 NE outer
      ...p4,        // 4 SW inner
      ...p5,        // 5 SE inner
      ...p6,        // 6 NW inner
      ...p7,        // 7 NE inner
    ]

    // 6 closed faces — no UVs needed (roof tile material, no texture)
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
      positions.push(v[a*3], v[a*3+1], v[a*3+2])
      positions.push(v[b*3], v[b*3+1], v[b*3+2])
      positions.push(v[c*3], v[c*3+1], v[c*3+2])
      positions.push(v[d*3], v[d*3+1], v[d*3+2])
      indices.push(base, base+1, base+2, base+1, base+3, base+2)
    })

    return createGeometry(positions, null, indices)
  }, [attachSide, depth, overhang, overhangAttached, rise, thickness, wallTopY, width])

  // ─── Clone & configure gable texture ──────────────────────────────────────
  const tiledGableTexture = useMemo(() => {
    if (!gableTexture) return null
    const tex = gableTexture.clone()
    tex.wrapS = RepeatWrapping
    tex.wrapT = RepeatWrapping
    tex.repeat.set(1, 1)   // UVs already encode world-space tiling
    tex.colorSpace = SRGBColorSpace
    tex.needsUpdate = true
    return tex
  }, [gableTexture])

  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => gableGeometry.dispose(), [gableGeometry])
  useEffect(() => () => tiledGableTexture?.dispose(), [tiledGableTexture])

  return (
    <>
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshStandardMaterial color={color} roughness={0.84} side={DoubleSide} />
      </mesh>

      <mesh geometry={gableGeometry} castShadow receiveShadow>
        <meshStandardMaterial
          color={gableColor}
          map={tiledGableTexture}
          roughness={0.78}
          side={DoubleSide}
        />
      </mesh>
    </>
  )
}

export default LeanToRoof
