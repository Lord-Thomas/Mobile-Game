import { useTexture } from '@react-three/drei'
import { BufferGeometry, DoubleSide, Float32BufferAttribute, RepeatWrapping, SRGBColorSpace } from 'three'
import { useEffect, useMemo } from 'react'
import { getWallColliderTransform, getWallPointAt, splitWallIntoSolidRects } from './house/wallUtils'
import GableRoof from './house/GableRoof'
import LeanToRoof from './house/LeanToRoof'
import { createNeighborFloorplan } from './house/neighborFloorplan'
import { getTerrainHeight } from './terrain/terrainGeometry'

const EXTERIOR_WALL_TEXTURE = '/textures/environment/walls/mur-paint.png'
const WALL_REPEAT_X_PER_UNIT = 0.18
const WALL_REPEAT_Y_PER_UNIT = 0.18

function getWallMaterialSlots(wall) {
  const slots = [null, null, null, null, null, null]
  const dx = wall.endCorner.x - wall.startCorner.x
  const dz = wall.endCorner.z - wall.startCorner.z
  const length = Math.hypot(dx, dz) || 1
  const leftNormal = [-dz / length, 0, dx / length]

  ;[wall.sideA, wall.sideB].forEach((side) => {
    const sideDot = side.normal[0] * leftNormal[0] + side.normal[2] * leftNormal[2]
    if (sideDot >= 0) slots[4] = side
    if (sideDot < 0) slots[5] = side
  })

  return slots
}

function WallBlockMaterial({ attach, side, width, height, exteriorTexture, capColor }) {
  const isExterior = side?.type === 'outside'
  const repeatedTexture = useMemo(() => {
    if (!isExterior) return null
    const next = exteriorTexture.clone()
    next.wrapS = RepeatWrapping
    next.wrapT = RepeatWrapping
    next.repeat.set(
      Math.max(0.01, width * WALL_REPEAT_X_PER_UNIT),
      Math.max(0.01, height * WALL_REPEAT_Y_PER_UNIT),
    )
    next.colorSpace = SRGBColorSpace
    next.needsUpdate = true
    return next
  }, [exteriorTexture, height, isExterior, width])

  useEffect(() => {
    return () => repeatedTexture?.dispose()
  }, [repeatedTexture])

  return (
    <meshStandardMaterial
      attach={attach}
      map={repeatedTexture}
      color={side?.color ?? capColor}
      roughness={side ? 0.78 : 0.8}
      polygonOffset={Boolean(side)}
      polygonOffsetFactor={side ? -1 : 0}
      polygonOffsetUnits={side ? -1 : 0}
    />
  )
}

function WallVolume({ wall, rect, exteriorTexture }) {
  const transform = getWallColliderTransform(wall, rect)
  const materialSlots = getWallMaterialSlots(wall)
  const capColor = wall.trim

  return (
    <mesh position={transform.position} rotation={transform.rotation} castShadow receiveShadow>
      <boxGeometry args={[
        transform.args[0] * 2,
        transform.args[1] * 2,
        transform.args[2] * 2,
      ]} />
      {materialSlots.map((side, index) => (
        <WallBlockMaterial
          key={`${rect.id}-material-${index}`}
          attach={`material-${index}`}
          side={side}
          width={transform.renderWidth ?? rect.width}
          height={rect.height}
          exteriorTexture={exteriorTexture}
          capColor={capColor}
        />
      ))}
    </mesh>
  )
}

function OpeningReveals({ walls }) {
  return (
    <>
      {walls.flatMap((wall) =>
        wall.openings.flatMap((opening) => {
          const bottom = opening.bottom ?? 0
          const top = bottom + opening.height
          const topHeight = wall.height - top
          const min = opening.center - opening.width * 0.5
          const max = opening.center + opening.width * 0.5
          const y = bottom + opening.height * 0.5
          const color = wall.trim

          return [
            <RevealVolume
              key={`${wall.id}-left-reveal`}
              wall={wall}
              center={min}
              y={y}
              width={0.05}
              height={opening.height}
              color={color}
            />,
            <RevealVolume
              key={`${wall.id}-right-reveal`}
              wall={wall}
              center={max}
              y={y}
              width={0.05}
              height={opening.height}
              color={color}
            />,
            topHeight > 0.001 && (
              <RevealVolume
                key={`${wall.id}-top-reveal`}
                wall={wall}
                center={opening.center}
                y={top}
                width={opening.width}
                height={0.05}
                color={color}
              />
            ),
          ].filter(Boolean)
        }),
      )}
    </>
  )
}

function RevealVolume({ wall, center, y, width, height, color }) {
  const transform = getWallColliderTransform(wall, { center, y, width, height })

  return (
    <mesh position={transform.position} rotation={transform.rotation}>
      <boxGeometry args={[
        transform.args[0] * 2,
        transform.args[1] * 2,
        transform.args[2] * 2 + 0.03,
      ]} />
      <meshStandardMaterial color={color} roughness={0.72} />
    </mesh>
  )
}

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

  return { wall, opening, position, rotation, y }
}

function NeighborDoor({ door }) {
  if (!door) return null
  const { opening, position, rotation, y } = door

  return (
    <group>
      <mesh position={position} rotation={rotation}>
        <planeGeometry args={[opening.width, opening.height]} />
        <meshStandardMaterial color="#7d543d" roughness={0.65} side={DoubleSide} />
      </mesh>
      <mesh position={[position[0], y, position[2]]}>
        <sphereGeometry args={[0.05, 12, 8]} />
        <meshStandardMaterial color="#f1c45b" metalness={0.2} roughness={0.38} />
      </mesh>
    </group>
  )
}

function createSlopedCeilingGeometry({ width, height, depth, attachSide, rise }) {
  const x0 = -width * 0.5
  const x1 = width * 0.5
  const z0 = -depth * 0.5
  const z1 = depth * 0.5

  // On garde quasiment la même sous-face que l'ancien faux plafond.
  const bottomY = height - 0.04

  // Le dessus suit la pente du toit appentis pour éviter de dépasser.
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
    // bottom face
    x0, bottomY, z0, // 0
    x1, bottomY, z0, // 1
    x0, bottomY, z1, // 2
    x1, bottomY, z1, // 3

    // sloped top face
    x0, y00, z0, // 4
    x1, y10, z0, // 5
    x0, y01, z1, // 6
    x1, y11, z1, // 7
  ]

  const quads = [
    [0, 2, 1, 3], // bottom
    [4, 5, 6, 7], // sloped top
    [0, 1, 4, 5], // south
    [2, 6, 3, 7], // north
    [0, 4, 2, 6], // west
    [1, 3, 5, 7], // east
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

function CeilingPlate({ room, trim, roofGroup, attachSide, rise }) {
  const [width, height, depth] = room.size

  const slopedGeometry = useMemo(() => {
    if (roofGroup?.type !== 'lean_to') return null

    return createSlopedCeilingGeometry({
      width,
      height,
      depth,
      attachSide,
      rise,
    })
  }, [attachSide, depth, height, rise, roofGroup?.type, width])

  useEffect(() => {
    return () => slopedGeometry?.dispose()
  }, [slopedGeometry])

  if (roofGroup?.type === 'lean_to' && slopedGeometry) {
    return (
      <mesh
        geometry={slopedGeometry}
        position={[room.position[0], 0, room.position[2]]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color={trim} roughness={0.8} side={DoubleSide} />
      </mesh>
    )
  }

  return (
    <mesh position={[room.position[0], height + 0.02, room.position[2]]}>
      <boxGeometry args={[width, 0.12, depth]} />
      <meshStandardMaterial color={trim} roughness={0.8} />
    </mesh>
  )
}

function HouseVolume({ id, room, walls, exteriorTexture, trim, roofGroup, attachSide, rise }) {
  const door = getDoorData(walls)
  const [width, height, depth] = room.size

  return (
    <>
      {walls.flatMap((wall) =>
        splitWallIntoSolidRects(wall).map((rect) => (
          <WallVolume key={`${id}-${rect.id}`} wall={wall} rect={rect} exteriorTexture={exteriorTexture} />
        )),
      )}
      <OpeningReveals walls={walls} />
      <NeighborDoor door={door} />
{/* Faux plafond — cache la structure du toit vue depuis l'intérieur */}
<CeilingPlate
  room={room}
  trim={trim}
  roofGroup={roofGroup}
  attachSide={attachSide}
  rise={rise}
/>
    </>
  )
}

// Fallback: deviner le côté d'attachement en fonction de la position relative
function guessAttachSide(group, primaryGroup) {
  if (!primaryGroup) return 'south'
  const dx = group.center[0] - primaryGroup.center[0]
  const dz = group.center[2] - primaryGroup.center[2]
  if (Math.abs(dx) >= Math.abs(dz)) return dx > 0 ? 'west' : 'east'
  return dz > 0 ? 'south' : 'north'
}

function NeighborHouse({ position, color, trim, rotationY = 0, parts, size, doorWall }) {
  const exteriorTexture = useTexture(EXTERIOR_WALL_TEXTURE)
  const terrainY = getTerrainHeight(position[0], position[2])
  const floorplan = useMemo(() => createNeighborFloorplan({ parts, size, doorWall, color, trim }), [color, doorWall, parts, size, trim])

  const primaryGroup = floorplan.roofGroups[0] ?? null

  return (
    <group position={[position[0], terrainY, position[2]]} rotation={[0, rotationY, 0]}>
{floorplan.rooms.map((room) => {
  const roofGroup = floorplan.roofGroups.find((group) => group.roomIds.includes(room.id))
  const roofGroupIndex = floorplan.roofGroups.findIndex((group) => group.id === roofGroup?.id)
  const attachSide = roofGroup
    ? roofGroup.attachmentSide ?? guessAttachSide(roofGroup, primaryGroup)
    : 'south'

  const rise = primaryGroup && roofGroupIndex > 0
    ? Math.max(0.4, primaryGroup.height - roofGroup.height)
    : 0.72

  return (
    <HouseVolume
      key={room.id}
      id={room.id}
      room={room}
      walls={floorplan.walls.filter((wall) => wall.roomId === room.id)}
      trim={trim}
      exteriorTexture={exteriorTexture}
      roofGroup={roofGroup}
      attachSide={attachSide}
      rise={rise}
    />
  )
})}
      {floorplan.roofGroups.map((group, index) => {
        const attachSide = group.attachmentSide ?? guessAttachSide(group, primaryGroup)
        // Rise = différence de hauteur entre maison principale et dépendance
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
