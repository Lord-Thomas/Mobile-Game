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
  attachSide,
  rise = 0.9,
  overhang = 0.24,
  thickness = 0.12,
  color = '#8f4b3a',
}) {
  const geometry = useMemo(() => {
    const halfWidth = width * 0.5
    const halfDepth = depth * 0.5
    const minX = -halfWidth - overhang
    const maxX = halfWidth + overhang
    const minZ = -halfDepth - overhang
    const maxZ = halfDepth + overhang
    let top
    let bottom

    if (attachSide === 'west') {
      top = [minX, wallTopY, minZ, maxX, wallTopY + rise, minZ, minX, wallTopY, maxZ, maxX, wallTopY + rise, maxZ]
      bottom = [minX, wallTopY - thickness, maxZ, maxX, wallTopY + rise - thickness, maxZ, minX, wallTopY - thickness, minZ, maxX, wallTopY + rise - thickness, minZ]
    } else if (attachSide === 'east') {
      top = [minX, wallTopY + rise, minZ, maxX, wallTopY, minZ, minX, wallTopY + rise, maxZ, maxX, wallTopY, maxZ]
      bottom = [minX, wallTopY + rise - thickness, maxZ, maxX, wallTopY - thickness, maxZ, minX, wallTopY + rise - thickness, minZ, maxX, wallTopY - thickness, minZ]
    } else if (attachSide === 'south') {
      top = [minX, wallTopY + rise, minZ, maxX, wallTopY + rise, minZ, minX, wallTopY, maxZ, maxX, wallTopY, maxZ]
      bottom = [minX, wallTopY - thickness, maxZ, maxX, wallTopY - thickness, maxZ, minX, wallTopY + rise - thickness, minZ, maxX, wallTopY + rise - thickness, minZ]
    } else {
      top = [minX, wallTopY, minZ, maxX, wallTopY, minZ, minX, wallTopY + rise, maxZ, maxX, wallTopY + rise, maxZ]
      bottom = [minX, wallTopY + rise - thickness, maxZ, maxX, wallTopY + rise - thickness, maxZ, minX, wallTopY - thickness, minZ, maxX, wallTopY - thickness, minZ]
    }

    const positions = [
      ...top,
      ...bottom,
      ...top.slice(0, 6), ...bottom.slice(6, 12),
      ...top.slice(6, 12), ...bottom.slice(0, 6),
    ]
    return createGeometry(positions, [
      0, 1, 2, 1, 3, 2,
      4, 5, 6, 5, 7, 6,
      8, 9, 10, 9, 11, 10,
      12, 13, 14, 13, 15, 14,
    ])
  }, [attachSide, depth, overhang, rise, thickness, wallTopY, width])

  useEffect(() => () => geometry.dispose(), [geometry])

  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial color={color} roughness={0.84} side={DoubleSide} />
    </mesh>
  )
}

export default LeanToRoof
