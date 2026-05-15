import { useTexture } from '@react-three/drei'
import { DoubleSide, RepeatWrapping, SRGBColorSpace } from 'three'
import { useEffect, useMemo } from 'react'
import { getWallColliderTransform, getWallPointAt, splitWallIntoSolidRects } from './house/wallUtils'
import GableRoof from './house/GableRoof'
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

function HouseVolume({ id, room, walls, exteriorTexture, trim }) {
  const door = getDoorData(walls)
  const [width, height, depth] = room.size
  const hasSharedXWall = walls.some((wall) => wall.axis === 'z' && wall.length < depth - 0.001)
  const hasSharedZWall = walls.some((wall) => wall.axis === 'x' && wall.length < width - 0.001)

  return (
    <>
      {walls.flatMap((wall) =>
        splitWallIntoSolidRects(wall).map((rect) => (
          <WallVolume key={`${id}-${rect.id}`} wall={wall} rect={rect} exteriorTexture={exteriorTexture} />
        )),
      )}
      <OpeningReveals walls={walls} />
      <NeighborDoor door={door} />
      <mesh position={[room.position[0], height + 0.02, room.position[2]]}>
        <boxGeometry args={[width + 0.12, 0.12, depth + 0.12]} />
        <meshStandardMaterial color={trim} roughness={0.8} />
      </mesh>
      <group position={room.position}>
        <GableRoof
          width={width}
          depth={depth}
          baseY={height + 0.1}
          pitch={width >= depth ? 30 : 34}
          overhang={0.32}
          overhangX={hasSharedXWall ? 0.08 : 0.32}
          overhangZ={hasSharedZWall ? 0.08 : 0.32}
          thickness={0.12}
          color={trim}
          gableColor={walls[0]?.sideB?.color ?? '#f3f0e5'}
        />
      </group>
    </>
  )
}

function NeighborHouse({ position, color, trim, rotationY = 0, parts, size, doorWall }) {
  const exteriorTexture = useTexture(EXTERIOR_WALL_TEXTURE)
  const terrainY = getTerrainHeight(position[0], position[2])
  const floorplan = useMemo(() => createNeighborFloorplan({ parts, size, doorWall, color, trim }), [color, doorWall, parts, size, trim])

  return (
    <group position={[position[0], terrainY, position[2]]} rotation={[0, rotationY, 0]}>
      {floorplan.rooms.map((room) => (
        <HouseVolume
          key={room.id}
          id={room.id}
          room={room}
          walls={floorplan.walls.filter((wall) => wall.roomId === room.id)}
          trim={trim}
          exteriorTexture={exteriorTexture}
        />
      ))}
    </group>
  )
}

export default NeighborHouse
