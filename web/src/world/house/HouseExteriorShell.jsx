import { useEffect, useMemo } from 'react'
import { useTexture } from '@react-three/drei'
import { RepeatWrapping, SRGBColorSpace } from 'three'
import { getRoomBounds, houseLayout, mainRoom, outsideDoorOpening, secondRoom } from './houseLayout'
import { getWallSideTransform, splitWallIntoSolidRects } from './wallUtils'

const EXTERIOR_WALL_TEXTURE = '/textures/environment/walls/mur-paint.png'
const EXTERIOR_WALL_REPEAT_PER_UNIT = 0.32
const EXTERIOR_DEBUG_COLOR = '#ff1f1f'
const EXTERIOR_RENDER_OFFSET = 0.045

function useRepeatedExteriorTexture(baseTexture, width, height) {
  const repeatX = Math.max(0.35, width * EXTERIOR_WALL_REPEAT_PER_UNIT)
  const repeatY = Math.max(0.35, height * EXTERIOR_WALL_REPEAT_PER_UNIT)

  const texture = useMemo(() => {
    const nextTexture = baseTexture.clone()
    nextTexture.wrapS = RepeatWrapping
    nextTexture.wrapT = RepeatWrapping
    nextTexture.repeat.set(repeatX, repeatY)
    nextTexture.colorSpace = SRGBColorSpace
    nextTexture.needsUpdate = true
    return nextTexture
  }, [baseTexture, repeatX, repeatY])

  useEffect(() => () => texture.dispose(), [texture])

  return texture
}

function ExteriorWallFace({ wall, rect, side, baseTexture }) {
  const transform = getWallSideTransform(wall, rect, side)
  const position = [
    transform.position[0] + side.normal[0] * EXTERIOR_RENDER_OFFSET,
    transform.position[1],
    transform.position[2] + side.normal[2] * EXTERIOR_RENDER_OFFSET,
  ]
  const wallTexture = useRepeatedExteriorTexture(baseTexture, transform.width, transform.height)

  return (
    <mesh position={position} rotation={transform.rotation} castShadow receiveShadow renderOrder={10}>
      <planeGeometry args={[transform.width, transform.height]} />
      <meshStandardMaterial map={wallTexture} color={EXTERIOR_DEBUG_COLOR} roughness={0.82} />
    </mesh>
  )
}

function ExteriorRoomFace({ position, rotation = [0, 0, 0], width, height, baseTexture }) {
  const wallTexture = useRepeatedExteriorTexture(baseTexture, width, height)

  return (
    <mesh position={position} rotation={rotation} castShadow receiveShadow renderOrder={10}>
      <planeGeometry args={[width, height]} />
      <meshStandardMaterial map={wallTexture} color={EXTERIOR_DEBUG_COLOR} roughness={0.82} />
    </mesh>
  )
}

function ExteriorCornerPost({ position, height }) {
  const thickness = Math.max(0.035, EXTERIOR_RENDER_OFFSET * 1.2)

  return (
    <mesh position={position} castShadow receiveShadow renderOrder={10}>
      <boxGeometry args={[thickness, height, thickness]} />
      <meshStandardMaterial color={EXTERIOR_DEBUG_COLOR} roughness={0.82} />
    </mesh>
  )
}

function HouseExteriorWalls() {
  const baseTexture = useTexture(EXTERIOR_WALL_TEXTURE)
  const mainBounds = getRoomBounds(mainRoom)
  const secondBounds = getRoomBounds(secondRoom)
  const secondWallY = secondRoom.size[1] * 0.5
  const mainWallY = mainRoom.size[1] * 0.5
  const secondWallFaces = [
    {
      id: 'second-west',
      position: [secondBounds.minX - houseLayout.wallThickness * 0.5 - EXTERIOR_RENDER_OFFSET, secondWallY, secondRoom.position[2]],
      rotation: [0, -Math.PI / 2, 0],
      width: secondRoom.size[2],
      height: secondRoom.size[1],
    },
    {
      id: 'second-east',
      position: [secondBounds.maxX + houseLayout.wallThickness * 0.5 + EXTERIOR_RENDER_OFFSET, secondWallY, secondRoom.position[2]],
      rotation: [0, Math.PI / 2, 0],
      width: secondRoom.size[2],
      height: secondRoom.size[1],
    },
    {
      id: 'second-north',
      position: [secondRoom.position[0], secondWallY, secondBounds.maxZ + houseLayout.wallThickness * 0.5 + EXTERIOR_RENDER_OFFSET],
      rotation: [0, 0, 0],
      width: secondRoom.size[0],
      height: secondRoom.size[1],
    },
  ]
  const mainAnnexJunctionFaces = [
    {
      id: 'main-north-left-exposed',
      position: [
        (mainBounds.minX + secondBounds.minX) * 0.5,
        mainRoom.size[1] * 0.5,
        mainBounds.maxZ + houseLayout.wallThickness * 0.5 + EXTERIOR_RENDER_OFFSET,
      ],
      rotation: [0, 0, 0],
      width: secondBounds.minX - mainBounds.minX,
      height: mainRoom.size[1],
    },
    {
      id: 'main-north-right-exposed',
      position: [
        (secondBounds.maxX + mainBounds.maxX) * 0.5,
        mainRoom.size[1] * 0.5,
        mainBounds.maxZ + houseLayout.wallThickness * 0.5 + EXTERIOR_RENDER_OFFSET,
      ],
      rotation: [0, 0, 0],
      width: mainBounds.maxX - secondBounds.maxX,
      height: mainRoom.size[1],
    },
    {
      id: 'main-north-over-annex',
      position: [
        secondRoom.position[0],
        secondRoom.size[1] + (mainRoom.size[1] - secondRoom.size[1]) * 0.5,
        mainBounds.maxZ + houseLayout.wallThickness * 0.5 + EXTERIOR_RENDER_OFFSET,
      ],
      rotation: [0, 0, 0],
      width: secondRoom.size[0],
      height: mainRoom.size[1] - secondRoom.size[1],
    },
  ].filter((face) => face.width > 0.001)
  const cornerPosts = [
    {
      id: 'main-south-west',
      position: [
        mainBounds.minX - houseLayout.wallThickness * 0.5 - EXTERIOR_RENDER_OFFSET,
        mainWallY,
        mainBounds.minZ - houseLayout.wallThickness * 0.5 - EXTERIOR_RENDER_OFFSET,
      ],
      height: mainRoom.size[1],
    },
    {
      id: 'main-south-east',
      position: [
        mainBounds.maxX + houseLayout.wallThickness * 0.5 + EXTERIOR_RENDER_OFFSET,
        mainWallY,
        mainBounds.minZ - houseLayout.wallThickness * 0.5 - EXTERIOR_RENDER_OFFSET,
      ],
      height: mainRoom.size[1],
    },
    {
      id: 'main-north-west',
      position: [
        mainBounds.minX - houseLayout.wallThickness * 0.5 - EXTERIOR_RENDER_OFFSET,
        mainWallY,
        mainBounds.maxZ + houseLayout.wallThickness * 0.5 + EXTERIOR_RENDER_OFFSET,
      ],
      height: mainRoom.size[1],
    },
    {
      id: 'main-north-east',
      position: [
        mainBounds.maxX + houseLayout.wallThickness * 0.5 + EXTERIOR_RENDER_OFFSET,
        mainWallY,
        mainBounds.maxZ + houseLayout.wallThickness * 0.5 + EXTERIOR_RENDER_OFFSET,
      ],
      height: mainRoom.size[1],
    },
    {
      id: 'second-north-west',
      position: [
        secondBounds.minX - houseLayout.wallThickness * 0.5 - EXTERIOR_RENDER_OFFSET,
        secondWallY,
        secondBounds.maxZ + houseLayout.wallThickness * 0.5 + EXTERIOR_RENDER_OFFSET,
      ],
      height: secondRoom.size[1],
    },
    {
      id: 'second-north-east',
      position: [
        secondBounds.maxX + houseLayout.wallThickness * 0.5 + EXTERIOR_RENDER_OFFSET,
        secondWallY,
        secondBounds.maxZ + houseLayout.wallThickness * 0.5 + EXTERIOR_RENDER_OFFSET,
      ],
      height: secondRoom.size[1],
    },
  ]

  return (
    <>
      {houseLayout.walls.flatMap((wall) =>
        splitWallIntoSolidRects(wall).flatMap((rect) =>
          [wall.sideA, wall.sideB]
            .filter((side) => side.type === 'outside')
            .map((side) => (
              <ExteriorWallFace
                key={`${rect.id}-${side.normal.join('-')}`}
                wall={wall}
                rect={rect}
                side={side}
                baseTexture={baseTexture}
              />
            )),
        ),
      )}
      {secondWallFaces.map((face) => (
        <ExteriorRoomFace
          key={face.id}
          position={face.position}
          rotation={face.rotation}
          width={face.width}
          height={face.height}
          baseTexture={baseTexture}
        />
      ))}
      {mainAnnexJunctionFaces.map((face) => (
        <ExteriorRoomFace
          key={face.id}
          position={face.position}
          rotation={face.rotation}
          width={face.width}
          height={face.height}
          baseTexture={baseTexture}
        />
      ))}
      {cornerPosts.map((post) => (
        <ExteriorCornerPost key={post.id} position={post.position} height={post.height} />
      ))}
    </>
  )
}

function HouseExteriorDetails() {
  const mainBounds = getRoomBounds(mainRoom)
  const doorX = mainBounds.minX - houseLayout.wallThickness * 0.5 - 0.09
  const doorZ = outsideDoorOpening.centerZ
  const doorHeight = outsideDoorOpening.height

  return (
    <group>
      <mesh position={[doorX - 0.02, (outsideDoorOpening.bottomY ?? 0) + doorHeight + 0.08, doorZ]}>
        <boxGeometry args={[0.16, 0.16, outsideDoorOpening.width + 0.18]} />
        <meshStandardMaterial color="#4a5660" roughness={0.58} />
      </mesh>
    </group>
  )
}

function HouseExteriorShell({ visible = true }) {
  return (
    <group visible={visible}>
      <HouseExteriorWalls />
      <HouseExteriorDetails />
    </group>
  )
}

export default HouseExteriorShell
