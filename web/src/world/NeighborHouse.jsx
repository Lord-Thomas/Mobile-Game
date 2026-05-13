import { DoubleSide } from 'three'
import { getWallSideTransform, splitWallIntoSolidRects } from './house/wallUtils'
import OutdoorSurfaceMaterial from './OutdoorSurfaceMaterial'

const WALL_THICKNESS = 0.18

function createNeighborWalls({ size, color, trim, doorWall }) {
  const [width, height, depth] = size
  const halfWidth = width * 0.5
  const halfDepth = depth * 0.5
  const doorWidth = 1.05
  const doorHeight = 2.15

  const walls = [
    {
      id: 'west',
      axis: 'z',
      constant: -halfWidth,
      from: -halfDepth,
      to: halfDepth,
      sideA: { normal: [1, 0, 0], color: '#ece7df' },
      sideB: { normal: [-1, 0, 0], color },
    },
    {
      id: 'east',
      axis: 'z',
      constant: halfWidth,
      from: -halfDepth,
      to: halfDepth,
      sideA: { normal: [-1, 0, 0], color: '#ece7df' },
      sideB: { normal: [1, 0, 0], color },
    },
    {
      id: 'south',
      axis: 'x',
      constant: -halfDepth,
      from: -halfWidth,
      to: halfWidth,
      sideA: { normal: [0, 0, 1], color: '#ece7df' },
      sideB: { normal: [0, 0, -1], color },
    },
    {
      id: 'north',
      axis: 'x',
      constant: halfDepth,
      from: -halfWidth,
      to: halfWidth,
      sideA: { normal: [0, 0, -1], color: '#ece7df' },
      sideB: { normal: [0, 0, 1], color },
    },
  ]

  return walls.map((wall) => ({
    ...wall,
    height,
    thickness: WALL_THICKNESS,
    trim,
    openings: wall.id === doorWall
      ? [{ id: 'front_door', type: 'door', center: 0, width: doorWidth, bottom: 0, height: doorHeight }]
      : [],
  }))
}

function WallFace({ wall, rect, side }) {
  const transform = getWallSideTransform(wall, rect, side)

  return (
    <mesh position={transform.position} rotation={transform.rotation} castShadow receiveShadow>
      <planeGeometry args={[transform.width, transform.height]} />
      <meshStandardMaterial color={side.color} roughness={0.78} />
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

          if (wall.axis === 'x') {
            return [
              <mesh key={`${wall.id}-left-reveal`} position={[min, y, wall.constant]}>
                <boxGeometry args={[0.05, opening.height, wall.thickness + 0.03]} />
                <meshStandardMaterial color={color} roughness={0.72} />
              </mesh>,
              <mesh key={`${wall.id}-right-reveal`} position={[max, y, wall.constant]}>
                <boxGeometry args={[0.05, opening.height, wall.thickness + 0.03]} />
                <meshStandardMaterial color={color} roughness={0.72} />
              </mesh>,
              topHeight > 0.001 && (
                <mesh key={`${wall.id}-top-reveal`} position={[opening.center, top, wall.constant]}>
                  <boxGeometry args={[opening.width, 0.05, wall.thickness + 0.03]} />
                  <meshStandardMaterial color={color} roughness={0.72} />
                </mesh>
              ),
            ].filter(Boolean)
          }

          return [
            <mesh key={`${wall.id}-left-reveal`} position={[wall.constant, y, min]}>
              <boxGeometry args={[wall.thickness + 0.03, opening.height, 0.05]} />
              <meshStandardMaterial color={color} roughness={0.72} />
            </mesh>,
            <mesh key={`${wall.id}-right-reveal`} position={[wall.constant, y, max]}>
              <boxGeometry args={[wall.thickness + 0.03, opening.height, 0.05]} />
              <meshStandardMaterial color={color} roughness={0.72} />
            </mesh>,
            topHeight > 0.001 && (
              <mesh key={`${wall.id}-top-reveal`} position={[wall.constant, top, opening.center]}>
                <boxGeometry args={[wall.thickness + 0.03, 0.05, opening.width]} />
                <meshStandardMaterial color={color} roughness={0.72} />
              </mesh>
            ),
          ].filter(Boolean)
        }),
      )}
    </>
  )
}

function getDoorData(walls) {
  const wall = walls.find((nextWall) => nextWall.openings.length)
  const opening = wall?.openings[0]
  if (!wall || !opening) return null

  const y = (opening.bottom ?? 0) + opening.height * 0.5
  const offset = wall.thickness * 0.5 + 0.012
  const position = wall.axis === 'x'
    ? [opening.center, y, wall.constant + wall.sideB.normal[2] * offset]
    : [wall.constant + wall.sideB.normal[0] * offset, y, opening.center]
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

function NeighborPath({ door, roadPosition, housePosition, rotationY }) {
  if (!door || !roadPosition) return null
  const dx = roadPosition[0] - housePosition[0]
  const dz = roadPosition[2] - housePosition[2]
  const cos = Math.cos(-rotationY)
  const sin = Math.sin(-rotationY)
  const localRoadX = dx * cos - dz * sin
  const localRoadZ = dx * sin + dz * cos
  const doorX = door.position[0]
  const doorZ = door.position[2]
  const pathDx = localRoadX - doorX
  const pathDz = localRoadZ - doorZ
  const pathLength = Math.hypot(pathDx, pathDz)
  const pathCenterX = (localRoadX + doorX) * 0.5
  const pathCenterZ = (localRoadZ + doorZ) * 0.5
  const pathAngle = -Math.atan2(pathDx, pathDz)

  if (pathLength < 0.2) return null

  return (
    <mesh position={[pathCenterX, -0.012, pathCenterZ]} rotation={[-Math.PI / 2, 0, pathAngle]}>
      <planeGeometry args={[1.2, pathLength]} />
      <OutdoorSurfaceMaterial
        colorMap="/textures/outdoor/dirt-ground-basecolor-512.jpg"
        repeat={[1, Math.max(1, pathLength / 4)]}
        color="#bfae83"
        roughness={0.88}
      />
    </mesh>
  )
}

function NeighborLot({ lotSize }) {
  return (
    <group>
      <mesh position={[0, -0.022, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={lotSize} />
        <OutdoorSurfaceMaterial
          colorMap="/textures/outdoor/grass-patchy-basecolor-512.jpg"
          repeat={[Math.max(1, lotSize[0] / 5), Math.max(1, lotSize[1] / 5)]}
          color="#a3bd78"
          roughness={0.9}
        />
      </mesh>
      <mesh position={[0, 0.23, -lotSize[1] * 0.5]}>
        <boxGeometry args={[lotSize[0], 0.46, 0.12]} />
        <meshStandardMaterial color="#e8d7ad" roughness={0.72} />
      </mesh>
      <mesh position={[0, 0.23, lotSize[1] * 0.5]}>
        <boxGeometry args={[lotSize[0], 0.46, 0.12]} />
        <meshStandardMaterial color="#e8d7ad" roughness={0.72} />
      </mesh>
      <mesh position={[-lotSize[0] * 0.5, 0.23, 0]}>
        <boxGeometry args={[0.12, 0.46, lotSize[1]]} />
        <meshStandardMaterial color="#e8d7ad" roughness={0.72} />
      </mesh>
      <mesh position={[lotSize[0] * 0.5, 0.23, 0]}>
        <boxGeometry args={[0.12, 0.46, lotSize[1]]} />
        <meshStandardMaterial color="#e8d7ad" roughness={0.72} />
      </mesh>
    </group>
  )
}

function NeighborHouse({ position, color, trim, rotationY = 0, size, lotSize, doorWall, roadPosition }) {
  const walls = createNeighborWalls({ size, color, trim, doorWall })
  const door = getDoorData(walls)
  const [width, height, depth] = size

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <NeighborLot lotSize={lotSize} />
      <NeighborPath door={door} roadPosition={roadPosition} housePosition={position} rotationY={rotationY} />
      {walls.flatMap((wall) =>
        splitWallIntoSolidRects(wall).flatMap((rect) => [
          <WallFace key={`${wall.id}-${rect.id}-a`} wall={wall} rect={rect} side={wall.sideA} />,
          <WallFace key={`${wall.id}-${rect.id}-b`} wall={wall} rect={rect} side={wall.sideB} />,
        ]),
      )}
      <OpeningReveals walls={walls} />
      <NeighborDoor door={door} />
      <mesh position={[0, height + 0.02, 0]}>
        <boxGeometry args={[width + 0.12, 0.12, depth + 0.12]} />
        <meshStandardMaterial color={trim} roughness={0.8} />
      </mesh>
      {[-width * 0.26, width * 0.26].map((x) => (
        <mesh key={x} position={[x, 1.55, -depth * 0.5 - 0.095]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[0.72, 0.62]} />
          <meshStandardMaterial color="#dff6ff" emissive="#b7e8ff" emissiveIntensity={0.1} roughness={0.42} />
        </mesh>
      ))}
    </group>
  )
}

export default NeighborHouse
