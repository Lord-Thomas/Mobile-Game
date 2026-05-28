import { useTexture } from '@react-three/drei'
import { BoxGeometry, BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Matrix4 } from 'three'
import { useEffect, useMemo } from 'react'
import { getWallColliderTransform, getWallPointAt, splitWallIntoSolidRects } from './house/wallUtils'
import GableRoof from './house/GableRoof'
import LeanToRoof from './house/LeanToRoof'
import { createNeighborFloorplan } from './house/neighborFloorplan'
import { getTerrainHeight } from './terrain/terrainGeometry'

const EXTERIOR_WALL_TEXTURE = '/textures/environment/walls/mur-paint.png'

function getDoorData(walls) {
  const wall = walls.find((nextWall) => nextWall.openings.length)
  const opening = wall?.openings[0]
  if (!wall || !opening) return null

  const y = (opening.bottom ?? 0) + opening.height * 0.5
  const offset = wall.thickness * 0.5 + 0.012
  const openingPoint = getWallPointAt(wall, opening.center)
  const position = [
    openingPoint.x + wall.sideB.normal[0] * offset,
    y,
    openingPoint.z + wall.sideB.normal[2] * offset,
  ]
  const rotation = wall.axis === 'x'
    ? [0, wall.sideB.normal[2] < 0 ? Math.PI : 0, 0]
    : [0, wall.sideB.normal[0] > 0 ? Math.PI / 2 : -Math.PI / 2, 0]

  return { opening, position, rotation, y }
}

function createSlopedCeilingGeometry({ width, height, depth, attachSide, rise }) {
  const x0 = -width * 0.5
  const x1 = width * 0.5
  const z0 = -depth * 0.5
  const z1 = depth * 0.5
  const bottomY = height - 0.04
  const clearance = 0.025
  const yH = height + rise - clearance
  const yL = height - clearance

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

  const vertices = [
    x0, bottomY, z0,
    x1, bottomY, z0,
    x0, bottomY, z1,
    x1, bottomY, z1,
    x0, y00, z0,
    x1, y10, z0,
    x0, y01, z1,
    x1, y11, z1,
  ]
  const quads = [
    [0, 2, 1, 3],
    [4, 5, 6, 7],
    [0, 1, 4, 5],
    [2, 6, 3, 7],
    [0, 4, 2, 6],
    [1, 3, 5, 7],
  ]
  const positions = []
  const indices = []

  quads.forEach(([a, b, c, d]) => {
    const base = positions.length / 3
    positions.push(
      vertices[a * 3], vertices[a * 3 + 1], vertices[a * 3 + 2],
      vertices[b * 3], vertices[b * 3 + 1], vertices[b * 3 + 2],
      vertices[c * 3], vertices[c * 3 + 1], vertices[c * 3 + 2],
      vertices[d * 3], vertices[d * 3 + 1], vertices[d * 3 + 2],
    )
    indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2)
  })

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function guessAttachSide(group, primaryGroup) {
  if (!primaryGroup) return 'south'
  const dx = group.center[0] - primaryGroup.center[0]
  const dz = group.center[2] - primaryGroup.center[2]
  if (Math.abs(dx) >= Math.abs(dz)) return dx > 0 ? 'west' : 'east'
  return dz > 0 ? 'south' : 'north'
}

function getWallExteriorColor(wall) {
  return wall.sideA?.type === 'outside'
    ? wall.sideA.color
    : wall.sideB?.type === 'outside'
      ? wall.sideB.color
      : wall.trim
}

function createGeometryCollector() {
  return {
    positions: [],
    normals: [],
    colors: [],
  }
}

function pushGeometry(collector, geometry, colorValue, matrix = null) {
  const color = new Color(colorValue)
  const workingGeometry = geometry.index ? geometry.toNonIndexed() : geometry.clone()
  if (matrix) workingGeometry.applyMatrix4(matrix)
  if (!workingGeometry.attributes.normal) workingGeometry.computeVertexNormals()

  const positions = workingGeometry.attributes.position.array
  const normals = workingGeometry.attributes.normal.array

  for (let index = 0; index < positions.length; index += 3) {
    collector.positions.push(positions[index], positions[index + 1], positions[index + 2])
    collector.normals.push(normals[index], normals[index + 1], normals[index + 2])
    collector.colors.push(color.r, color.g, color.b)
  }

  workingGeometry.dispose()
}

function pushBox(collector, position, rotationY, size, color, depthBoost = 0) {
  const geometry = new BoxGeometry(size[0], size[1], size[2] + depthBoost)
  const matrix = new Matrix4().makeRotationY(rotationY)
  matrix.setPosition(position[0], position[1], position[2])
  pushGeometry(collector, geometry, color, matrix)
  geometry.dispose()
}

function pushWallVolumes(collector, walls) {
  walls.forEach((wall) => {
    const color = getWallExteriorColor(wall)
    splitWallIntoSolidRects(wall).forEach((rect) => {
      const transform = getWallColliderTransform(wall, rect)
      pushBox(
        collector,
        transform.position,
        transform.rotation[1],
        [transform.args[0] * 2, transform.args[1] * 2, transform.args[2] * 2],
        color,
      )
    })
  })
}

function pushOpeningReveals(collector, walls) {
  walls.forEach((wall) => {
    wall.openings.forEach((opening) => {
      const bottom = opening.bottom ?? 0
      const top = bottom + opening.height
      const topHeight = wall.height - top
      const min = opening.center - opening.width * 0.5
      const max = opening.center + opening.width * 0.5
      const y = bottom + opening.height * 0.5
      const reveals = [
        { center: min, y, width: 0.05, height: opening.height },
        { center: max, y, width: 0.05, height: opening.height },
      ]

      if (topHeight > 0.001) {
        reveals.push({ center: opening.center, y: top, width: opening.width, height: 0.05 })
      }

      reveals.forEach((rect) => {
        const transform = getWallColliderTransform(wall, rect)
        pushBox(
          collector,
          transform.position,
          transform.rotation[1],
          [transform.args[0] * 2, transform.args[1] * 2, transform.args[2] * 2],
          wall.trim,
          0.03,
        )
      })
    })
  })
}

function pushDoor(collector, door) {
  if (!door) return
  const { opening, position, rotation, y } = door
  const rotationY = rotation[1]
  const normalX = Math.sin(rotationY)
  const normalZ = Math.cos(rotationY)

  pushBox(collector, position, rotationY, [opening.width, opening.height, 0.035], '#7d543d')
  pushBox(
    collector,
    [position[0] + normalX * 0.045, y, position[2] + normalZ * 0.045],
    rotationY,
    [0.08, 0.08, 0.08],
    '#f1c45b',
  )
}

function pushCeilingPlate(collector, room, trim, roofGroup, attachSide, rise) {
  const [width, height, depth] = room.size

  if (roofGroup?.type === 'lean_to') {
    const geometry = createSlopedCeilingGeometry({ width, height, depth, attachSide, rise })
    const matrix = new Matrix4().makeTranslation(room.position[0], 0, room.position[2])
    pushGeometry(collector, geometry, trim, matrix)
    geometry.dispose()
    return
  }

  pushBox(collector, [room.position[0], height + 0.02, room.position[2]], 0, [width, 0.12, depth], trim)
}

function createMergedHouseGeometry(floorplan, trim, primaryGroup) {
  const collector = createGeometryCollector()

  floorplan.rooms.forEach((room) => {
    const walls = floorplan.walls.filter((wall) => wall.roomId === room.id)
    const door = getDoorData(walls)
    const roofGroup = floorplan.roofGroups.find((group) => group.roomIds.includes(room.id))
    const roofGroupIndex = floorplan.roofGroups.findIndex((group) => group.id === roofGroup?.id)
    const attachSide = roofGroup
      ? roofGroup.attachmentSide ?? guessAttachSide(roofGroup, primaryGroup)
      : 'south'
    const rise = primaryGroup && roofGroupIndex > 0
      ? Math.max(0.4, primaryGroup.height - roofGroup.height)
      : 0.72

    pushWallVolumes(collector, walls)
    pushOpeningReveals(collector, walls)
    pushDoor(collector, door)
    pushCeilingPlate(collector, room, trim, roofGroup, attachSide, rise)
  })

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(collector.positions, 3))
  geometry.setAttribute('normal', new Float32BufferAttribute(collector.normals, 3))
  geometry.setAttribute('color', new Float32BufferAttribute(collector.colors, 3))
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return geometry
}

function MergedHouseShell({ floorplan, trim, primaryGroup }) {
  const geometry = useMemo(
    () => createMergedHouseGeometry(floorplan, trim, primaryGroup),
    [floorplan, primaryGroup, trim],
  )

  useEffect(() => () => geometry.dispose(), [geometry])

  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial vertexColors roughness={0.78} side={DoubleSide} />
    </mesh>
  )
}

function NeighborHouse({ position, color, trim, rotationY = 0, parts, size, doorWall, floorplan: providedFloorplan = null }) {
  const exteriorTexture = useTexture(EXTERIOR_WALL_TEXTURE)
  const terrainY = getTerrainHeight(position[0], position[2])
  const floorplan = useMemo(
    () => providedFloorplan ?? createNeighborFloorplan({ parts, size, doorWall, color, trim }),
    [color, doorWall, parts, providedFloorplan, size, trim],
  )
  const primaryGroup = floorplan.roofGroups[0] ?? null

  return (
    <group position={[position[0], terrainY, position[2]]} rotation={[0, rotationY, 0]}>
      <MergedHouseShell floorplan={floorplan} trim={trim} primaryGroup={primaryGroup} />
      {floorplan.roofGroups.map((group, index) => {
        const attachSide = group.attachmentSide ?? guessAttachSide(group, primaryGroup)
        const rise = primaryGroup && index > 0
          ? Math.max(0.4, primaryGroup.height - group.height)
          : 0.72

        return (
          <group key={group.id} position={group.center}>
            {group.type === 'flat' ? null : group.type === 'lean_to' ? (
              <LeanToRoof
                width={group.width}
                depth={group.depth}
                wallTopY={group.height}
                attachSide={attachSide}
                rise={rise}
                overhang={0.24}
                overhangAttached={0}
                thickness={0.14}
                wallThickness={floorplan.wallThickness}
                color={trim}
                gableColor={color}
                gableTexture={exteriorTexture}
              />
            ) : (
              <GableRoof
                width={group.width}
                depth={group.depth}
                wallTopY={group.height}
                gableBaseY={group.height}
                pitch={group.width >= group.depth ? 30 : 34}
                overhang={index === 0 ? 0.34 : 0.28}
                thickness={0.14}
                wallThickness={floorplan.wallThickness}
                color={trim}
                gableColor={color}
                gableTexture={exteriorTexture}
              />
            )}
          </group>
        )
      })}
    </group>
  )
}

export default NeighborHouse
