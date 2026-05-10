import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, Html, OrthographicCamera, useAnimations, useFBX, useGLTF, useTexture } from '@react-three/drei'
import { BallCollider, CapsuleCollider, CuboidCollider, Physics, RigidBody, useRapier } from '@react-three/rapier'
import { BackSide, Box3, CanvasTexture, DoubleSide, Euler, FrontSide, LinearFilter, Matrix4, LoopOnce, LoopRepeat, MathUtils, Mesh, PlaneGeometry, Quaternion, Raycaster, RepeatWrapping, SRGBColorSpace, Vector3 } from 'three'
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createEditableObjectInstance, defaultEditableObjects, objectCatalog, shopObjectIds } from './gameObjects/placeableObjects'
import { isSupabaseConfigured } from './lib/supabase'
import { addPlayerCoins, getCurrentUser, loadPlayerProgress, onAuthStateChange, savePlayerProgress, signInWithPassword, signOut, signUpWithPassword } from './services/progressService'
import { downloadBlob, generateThumbnailBlob } from './tools/thumbnails/generateThumbnailBlob'

const ROOM_LIMIT = 4.95
const GOAL_Z = -3.42
const BALL_RADIUS = 0.138
const PLAYER_CAPSULE_HALF_HEIGHT = 0.2
const PLAYER_CAPSULE_RADIUS = 0.22
const PLAYER_HEIGHT = PLAYER_CAPSULE_HALF_HEIGHT + PLAYER_CAPSULE_RADIUS
const PLAYER_MODEL_SCALE = 0.0129
const PLAYER_MODEL_VERTICAL_OFFSET = 0.1
const PLAYER_REFERENCE_HEIGHT_METERS = 1.63
const PLAYER_REFERENCE_HEIGHT_WORLD_UNITS = 2.25
const WORLD_UNITS_PER_METER = PLAYER_REFERENCE_HEIGHT_WORLD_UNITS / PLAYER_REFERENCE_HEIGHT_METERS
const SOFA_WIDTH_METERS = 1.5
const PLAYER_KICK_DURATION = 1.15
const PLAYER_KICK_CONTACT_DELAY = 0.43
const PLAYER_KICK_CONTACT_WINDOW = 0.16
const PLAYER_KICK_RANGE = 1.05
const PLAYER_KICK_FRONT_MIN = 0.08
const PLAYER_KICK_LATERAL_RANGE = 0.55
const PLAYER_KICK_FOOT_FORWARD_OFFSET = 0.46
const PLAYER_KICK_FOOT_SIDE_OFFSET = 0.1
const PLAYER_KICK_FOOT_CONTACT_RADIUS = 0.28
const PLAYER_JUMP_START_DURATION = 0.62
const PLAYER_JUMP_LAND_DURATION = 0.38
const PLAYER_LANDING_PREPARE_DISTANCE = 0.95
const PLAYER_DEFAULT_ANIMATION_FADE = 0.18
const PLAYER_LANDING_ANIMATION_FADE = 0.12
const PLAYER_AIR_ANIMATION_FADE = 0.18
const PLAYER_JUMP_TO_FALL_ANIMATION_FADE = 0.24
const PLAYER_WAVE_DURATION = 2.1
const PLAYER_DANCE_DURATION = 15.97
const PLAYER_POINTING_UP_DURATION = 2.4
const PLAYER_SIT_DOWN_DURATION = 1.05
const PLAYER_STAND_UP_DURATION = 1.05
const PLAYER_SITTING_HEIGHT = 0.34
const SEAT_INTERACTION_DISTANCE = 1.1
const EMOTE_LONG_PRESS_MS = 420
const EMOTE_CANCEL_DISTANCE = 14
const EMOTE_MENU_RADIUS = 86
const EMOTE_MENU_DEADZONE = 26
const EMOTE_MENU_ARC_START = -Math.PI / 2 - Math.PI / 3
const EMOTE_MENU_ARC_END = -Math.PI / 2 + Math.PI / 3
const CAMERA_DISTANCE = 4.6
const CAMERA_MIN_DISTANCE = 0.85
const CAMERA_MAX_DISTANCE = 8.5
const CAMERA_HEIGHT = 1.55
const EDGE_TRIGGER_PX = 14
const CAMERA_DRAG_SENSITIVITY = 0.007
const CAMERA_WHEEL_ZOOM_SENSITIVITY = 0.0025
const SHOW_FLOOR_GRID = false
const GOAL_POINTS = 10
const SKIN_STORAGE_KEY = 'lab_ball_skins_v1'
const LEGACY_STARTER_FURNITURE_IDS = new Set(['sofa_01', 'desk_01', 'office_chair_01', 'plant_01'])
const SKIN_STATION_POSITION = { x: -3.5, y: 0.35, z: 1.8 }
const ENV_STATION_POSITION = { x: 3.5, y: 0.35, z: 1.8 }
const CUSTOM_STATION_POSITION = { x: 0, y: 0.35, z: 3.55 }
const CUSTOM_ROOM_BOUNDS = { minX: -4.25, maxX: 4.25, minZ: -4.25, maxZ: 4.25 }
const CUSTOM_GRID_SIZE = 0.25
const CUSTOM_PLACEMENT_RAY_START_Y = 30
const TV_INTERACTION_DISTANCE = 1.35
const TV_MENU_EVENT = 'lab-tv-open-menu'
const MAIN_ROOM = { width: 10, depth: 10, height: 5 }
const FRONT_WALL = { zVisual: 5.05, zCollider: 5.1, thickness: 0.1 }
const DRAGON_OPENING = { centerX: 0, width: 6, bottomY: 0, height: 3.8 }
const WALL_REPEAT_X_PER_UNIT = 3.4 / 12
const WALL_REPEAT_Y_PER_UNIT = 1.9 / 5
const DEFAULT_CEILING_TEXTURE = '/textures/environment/walls/mur-paint.png'

const ballSkins = [
  { id: 'classic', name: 'Classique', price: 0, texture: '/models/ball/textures/ballon-classique.png', defaultUnlocked: true },
  { id: 'moon', name: 'Lune', price: 100, texture: '/models/ball/textures/ballon-lune.png' },
  { id: 'mars', name: 'Mars', price: 210, texture: '/models/ball/textures/ballon-mars.png' },
  { id: 'earth', name: 'Terre', price: 300, texture: '/models/ball/textures/ballon-terre.png' },
  { id: 'planet-x', name: 'Planete X', price: 150, texture: '/models/ball/textures/ballon-planete-x.png' },
]

const floorSkins = [
  {
    id: 'floor-classic',
    name: 'Parquet Classique',
    price: 0,
    texture: '/textures/wood/parquet-color.png',
    defaultUnlocked: true,
  },
  {
    id: 'floor-beton',
    name: 'Beton',
    price: 65,
    texture: '/textures/environment/floors/sol-beton.png',
  },
  {
    id: 'floor-parquet-loft',
    name: 'Parquet Loft',
    price: 95,
    texture: '/textures/environment/floors/sol-parquet-01.png',
  },
  {
    id: 'floor-parquet-clair',
    name: 'Parquet Clair',
    price: 125,
    texture: '/textures/environment/floors/sol-parquet-02.png',
  },
  {
    id: 'floor-tomette',
    name: 'Tomette',
    price: 160,
    texture: '/textures/environment/floors/sol-tomette.png',
  },
  {
    id: 'floor-damier-doux',
    name: 'Damier Doux',
    price: 65,
    texture: '/textures/environment/floors/sol-damier-doux.png',
  },
  {
    id: 'floor-carreaux-retro',
    name: 'Carreaux Retro',
    price: 95,
    texture: '/textures/environment/floors/sol-carreaux-retro.png',
  },
  {
    id: 'floor-chevron-beurre',
    name: 'Chevron Beurre',
    price: 125,
    texture: '/textures/environment/floors/sol-chevron-beurre.png',
  },
  {
    id: 'floor-peinture-blanche',
    name: 'Peinture Blanche',
    price: 50,
    texture: '/textures/environment/walls/mur-paint.png',
  },
  {
    id: 'floor-brun-mat',
    name: 'Brun Mat',
    price: 70,
    texture: '/textures/environment/walls/mur-brun-mat.png',
  },
  {
    id: 'floor-stuc-beige-doux',
    name: 'Stuc Beige Doux',
    price: 105,
    texture: '/textures/environment/walls/mur-stuc-beige-doux.png',
  },
]

const wallSkins = [
  {
    id: 'wall-classic',
    name: 'Peinture Blanche',
    price: 0,
    texture: '/textures/environment/walls/mur-paint.png',
    defaultUnlocked: true,
  },
  {
    id: 'wall-brique-02',
    name: 'Brique 02',
    price: 70,
    texture: '/textures/environment/walls/mur-brique-02.png',
  },
  {
    id: 'wall-briques-01',
    name: 'Briques 01',
    price: 105,
    texture: '/textures/environment/walls/mur-briques-01.png',
  },
  {
    id: 'wall-brun-mat',
    name: 'Brun Mat',
    price: 70,
    texture: '/textures/environment/walls/mur-brun-mat.png',
  },
  {
    id: 'wall-stuc-beige-doux',
    name: 'Stuc Beige Doux',
    price: 105,
    texture: '/textures/environment/walls/mur-stuc-beige-doux.png',
  },
  {
    id: 'wall-tomette',
    name: 'Tomette',
    price: 160,
    texture: '/textures/environment/floors/sol-tomette.png',
  },
  {
    id: 'wall-damier-doux',
    name: 'Damier Doux',
    price: 65,
    texture: '/textures/environment/floors/sol-damier-doux.png',
  },
  {
    id: 'wall-carreaux-retro',
    name: 'Carreaux Retro',
    price: 95,
    texture: '/textures/environment/floors/sol-carreaux-retro.png',
  },
  {
    id: 'wall-chevron-beurre',
    name: 'Chevron Beurre',
    price: 125,
    texture: '/textures/environment/floors/sol-chevron-beurre.png',
  },
  {
    id: 'wall-fond-vert',
    name: 'Fond Vert',
    price: 0,
    texture: '/textures/environment/walls/Fond%20Vert.png',
    adminOnly: true,
  },
]

const placementRaycaster = new Raycaster()
const placementRayOrigin = new Vector3()
const placementRayDirection = new Vector3(0, -1, 0)

const emotes = [
  { id: 'wave', label: 'Salut', glyph: '👋' },
  { id: 'dance', label: 'Danse', glyph: '♫' },
]

function snap(value, gridSize = CUSTOM_GRID_SIZE) {
  return Math.round(value / gridSize) * gridSize
}

function clampToCustomRoom(x, z) {
  return [
    MathUtils.clamp(x, CUSTOM_ROOM_BOUNDS.minX, CUSTOM_ROOM_BOUNDS.maxX),
    MathUtils.clamp(z, CUSTOM_ROOM_BOUNDS.minZ, CUSTOM_ROOM_BOUNDS.maxZ),
  ]
}

function getRotatedGoalCollider(goalObject, localPosition) {
  const goalPosition = goalObject?.position ?? [0, 0, GOAL_Z]
  const rotationY = goalObject?.rotationY ?? 0
  const cos = Math.cos(rotationY)
  const sin = Math.sin(rotationY)
  const [localX, localY, localZ] = localPosition

  return {
    position: [
      goalPosition[0] + localX * cos + localZ * sin,
      goalPosition[1] + localY,
      goalPosition[2] - localX * sin + localZ * cos,
    ],
    rotation: [0, rotationY, 0],
  }
}

function transformLocalPoint(object, localPosition) {
  const rotationY = object?.rotationY ?? 0
  const cos = Math.cos(rotationY)
  const sin = Math.sin(rotationY)
  const [localX, localY, localZ] = localPosition
  const position = object?.position ?? [0, 0, 0]

  return [
    position[0] + localX * cos + localZ * sin,
    position[1] + localY,
    position[2] - localX * sin + localZ * cos,
  ]
}

function getSeatWorldData(object, seat) {
  const basePosition = transformLocalPoint(object, seat.localPosition)
  const rotationY = (object.rotationY ?? 0) + (seat.localRotationY ?? 0)
  const seatedForwardOffset = seat.seatedForwardOffset ?? 0
  const position = [
    basePosition[0] + Math.sin(rotationY) * seatedForwardOffset,
    basePosition[1],
    basePosition[2] + Math.cos(rotationY) * seatedForwardOffset,
  ]
  const standUpForwardOffset = seat.standUpForwardOffset ?? seatedForwardOffset
  const exitPosition = [
    basePosition[0] + Math.sin(rotationY) * standUpForwardOffset,
    basePosition[1],
    basePosition[2] + Math.cos(rotationY) * standUpForwardOffset,
  ]

  return {
    id: seat.id,
    objectId: object.id,
    position,
    exitPosition,
    rotationY,
    sittingHeight: PLAYER_SITTING_HEIGHT + basePosition[1],
  }
}

function getObjectLabel(object) {
  const catalogItem = objectCatalog[object.objectId]
  if (catalogItem?.name) return catalogItem.name
  if (object.type === 'sofa') return 'Canape'
  if (object.type === 'goal') return 'Cage'
  return object.type
}

function getInventoryCards(objects) {
  const grouped = {}

  objects
    .filter((object) => object.canStore)
    .forEach((object) => {
      const objectId = object.objectId ?? object.type
      const catalogItem = objectCatalog[objectId]
      if (!grouped[objectId]) {
        grouped[objectId] = {
          objectId,
          type: object.type,
          name: getObjectLabel(object),
          category: catalogItem?.category ?? 'misc',
          thumbnail: catalogItem?.thumbnail ?? null,
          total: 0,
          stored: 0,
          placed: 0,
          storedInstanceId: null,
        }
      }

      grouped[objectId].total += 1
      if (object.status === 'stored') {
        grouped[objectId].stored += 1
        grouped[objectId].storedInstanceId = grouped[objectId].storedInstanceId ?? object.id
      } else {
        grouped[objectId].placed += 1
      }
    })

  return Object.values(grouped)
}

function getEmoteAngle(index, count) {
  if (count <= 1) return -Math.PI / 2
  const t = index / (count - 1)
  return EMOTE_MENU_ARC_START + t * (EMOTE_MENU_ARC_END - EMOTE_MENU_ARC_START)
}

function getEmoteSelection(dx, dy) {
  const distance = Math.hypot(dx, dy)
  if (distance < EMOTE_MENU_DEADZONE) return null

  if (emotes.length === 1) {
    return dy < -EMOTE_MENU_DEADZONE ? emotes[0].id : null
  }

  const angle = Math.atan2(dy, dx)
  const arcPadding = (EMOTE_MENU_ARC_END - EMOTE_MENU_ARC_START) / Math.max(2, emotes.length - 1) / 2
  if (angle < EMOTE_MENU_ARC_START - arcPadding || angle > EMOTE_MENU_ARC_END + arcPadding) return null

  let bestIndex = 0
  let bestDistance = Infinity
  for (let index = 0; index < emotes.length; index += 1) {
    const delta = Math.abs(angle - getEmoteAngle(index, emotes.length))
    if (delta < bestDistance) {
      bestDistance = delta
      bestIndex = index
    }
  }
  return emotes[bestIndex].id
}

function getHipsRestHeight(clip) {
  const track = clip?.tracks.find((nextTrack) => nextTrack.name === 'mixamorigHips.position')
  return track ? track.values[1] : null
}

function lockEmoteHipsHeight(clip, restHeight) {
  if (restHeight === null) return clip
  const track = clip.tracks.find((nextTrack) => nextTrack.name === 'mixamorigHips.position')
  if (!track) return clip

  for (let index = 1; index < track.values.length; index += 3) {
    track.values[index] = restHeight
  }
  return clip
}

function lockHipsPlanarPosition(clip) {
  const track = clip?.tracks.find((nextTrack) => nextTrack.name === 'mixamorigHips.position')
  if (!track) return clip

  const baseX = track.values[0]
  const baseZ = track.values[2]
  for (let index = 0; index < track.values.length; index += 3) {
    track.values[index] = baseX
    track.values[index + 2] = baseZ
  }
  return clip
}

function dampAngle(current, target, damping, delta) {
  let diff = (target - current + Math.PI) % (Math.PI * 2)
  if (diff < 0) diff += Math.PI * 2
  diff -= Math.PI
  return current + diff * Math.min(1, damping * delta)
}

function getKeyboardKey(event) {
  if (typeof event?.key === 'string') return event.key.toLowerCase()
  if (typeof event?.code !== 'string') return ''
  if (event.code.startsWith('Key') && event.code.length === 4) return event.code.slice(3).toLowerCase()
  return event.code.toLowerCase()
}

function clampCameraInPlayableVolume(x, y, z) {
  const clampedX = MathUtils.clamp(x, -4.9, 4.9)
  const clampedY = MathUtils.clamp(y, 0.35, 4.7)
  // Keep camera in main lab volume only (outside the containment room).
  const clampedZ = MathUtils.clamp(z, -4.9, 4.94)
  return { x: clampedX, y: clampedY, z: clampedZ }
}

function intersectsAabbSphere(px, py, pz, radius, cx, cy, cz, hx, hy, hz) {
  const dx = Math.max(Math.abs(px - cx) - hx, 0)
  const dy = Math.max(Math.abs(py - cy) - hy, 0)
  const dz = Math.max(Math.abs(pz - cz) - hz, 0)
  return dx * dx + dy * dy + dz * dz <= radius * radius
}

function collidesWithGoalFrame(nextX, nextY, nextZ, goalObject) {
  const goalX = goalObject?.position?.[0] ?? 0
  const goalZ = goalObject?.position?.[2] ?? GOAL_Z
  const goalRotationY = goalObject?.rotationY ?? 0
  const dx = nextX - goalX
  const dz = nextZ - goalZ
  const cos = Math.cos(goalRotationY)
  const sin = Math.sin(goalRotationY)
  const localX = dx * cos - dz * sin
  const localZ = dx * sin + dz * cos
  const r = PLAYER_CAPSULE_RADIUS
  const hitLeftPost = intersectsAabbSphere(localX, nextY, localZ, r, -1.5, 1, 0, 0.11, 1, 0.11)
  const hitRightPost = intersectsAabbSphere(localX, nextY, localZ, r, 1.5, 1, 0, 0.11, 1, 0.11)
  const hitCrossbar = intersectsAabbSphere(localX, nextY, localZ, r, 0, 2, 0, 1.58, 0.11, 0.11)
  // Keep only frame collision for player to avoid "phantom blocks" inside the goal volume.
  return hitLeftPost || hitRightPost || hitCrossbar
}

function getKickContact({ playerX, playerZ, yaw, ballX, ballZ }) {
  const forwardX = Math.sin(yaw)
  const forwardZ = Math.cos(yaw)
  const rightX = Math.cos(yaw)
  const rightZ = -Math.sin(yaw)
  const dx = ballX - playerX
  const dz = ballZ - playerZ
  const forwardDistance = dx * forwardX + dz * forwardZ
  const lateralDistance = dx * rightX + dz * rightZ
  const footX =
    playerX +
    forwardX * PLAYER_KICK_FOOT_FORWARD_OFFSET +
    rightX * PLAYER_KICK_FOOT_SIDE_OFFSET
  const footZ =
    playerZ +
    forwardZ * PLAYER_KICK_FOOT_FORWARD_OFFSET +
    rightZ * PLAYER_KICK_FOOT_SIDE_OFFSET
  const distanceToFoot = Math.hypot(ballX - footX, ballZ - footZ)

  return {
    forwardX,
    forwardZ,
    isInKickArc:
      forwardDistance > PLAYER_KICK_FRONT_MIN &&
      forwardDistance < PLAYER_KICK_RANGE &&
      Math.abs(lateralDistance) < PLAYER_KICK_LATERAL_RANGE,
    isTouchingFoot: distanceToFoot < PLAYER_KICK_FOOT_CONTACT_RADIUS + BALL_RADIUS,
  }
}

function getWallOpeningLayout(wallWidth, wallHeight, opening) {
  const halfWallWidth = wallWidth * 0.5
  const halfOpeningWidth = opening.width * 0.5
  const leftWidth = Math.max(0, halfWallWidth - halfOpeningWidth)
  const rightWidth = leftWidth
  const topHeight = Math.max(0, wallHeight - (opening.bottomY + opening.height))

  return {
    left: {
      width: leftWidth,
      x: opening.centerX - halfOpeningWidth - leftWidth * 0.5,
      y: wallHeight * 0.5,
      height: wallHeight,
    },
    right: {
      width: rightWidth,
      x: opening.centerX + halfOpeningWidth + rightWidth * 0.5,
      y: wallHeight * 0.5,
      height: wallHeight,
    },
    top: {
      width: opening.width,
      x: opening.centerX,
      y: opening.bottomY + opening.height + topHeight * 0.5,
      height: topHeight,
    },
  }
}

function WallPanel({ texture, uvWidth, uvHeight, position, geometryArgs }) {
  const panelTexture = useMemo(() => {
    const next = texture.clone()
    next.wrapS = RepeatWrapping
    next.wrapT = RepeatWrapping
    next.repeat.set(
      Math.max(0.01, uvWidth * WALL_REPEAT_X_PER_UNIT),
      Math.max(0.01, uvHeight * WALL_REPEAT_Y_PER_UNIT),
    )
    next.colorSpace = SRGBColorSpace
    next.needsUpdate = true
    return next
  }, [texture, uvWidth, uvHeight])

  useEffect(() => {
    return () => panelTexture.dispose()
  }, [panelTexture])

  return (
    <mesh position={position}>
      <boxGeometry args={geometryArgs} />
      <meshStandardMaterial map={panelTexture} color="#e6edf6" side={BackSide} />
    </mesh>
  )
}

function useKeyboardInput() {
  const keysRef = useRef({
    forward: false,
    back: false,
    left: false,
    right: false,
    actionQueued: false,
  })

  useEffect(() => {
    const onKeyDown = (event) => {
      const key = getKeyboardKey(event)

      if (key === 'z' || key === 'arrowup' || key === 'w') keysRef.current.forward = true
      if (key === 's' || key === 'arrowdown') keysRef.current.back = true
      if (key === 'q' || key === 'arrowleft' || key === 'a') keysRef.current.left = true
      if (key === 'd' || key === 'arrowright') keysRef.current.right = true

      if (key === ' ') {
        event.preventDefault()
        keysRef.current.actionQueued = true
      }
    }

    const onKeyUp = (event) => {
      const key = getKeyboardKey(event)

      if (key === 'z' || key === 'arrowup' || key === 'w') keysRef.current.forward = false
      if (key === 's' || key === 'arrowdown') keysRef.current.back = false
      if (key === 'q' || key === 'arrowleft' || key === 'a') keysRef.current.left = false
      if (key === 'd' || key === 'arrowright') keysRef.current.right = false
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  return keysRef
}

function WhiteRoom({ floorTexturePath, wallTexturePath, ceilingTexturePath, hideCeiling }) {
  const floorColorMap = useTexture(floorTexturePath)
  const wallColorMap = useTexture(wallTexturePath)
  const ceilingColorMap = useTexture(ceilingTexturePath)
  floorColorMap.wrapS = RepeatWrapping
  floorColorMap.wrapT = RepeatWrapping
  floorColorMap.repeat.set(3.2, 3.2)
  floorColorMap.colorSpace = SRGBColorSpace
  wallColorMap.wrapS = RepeatWrapping
  wallColorMap.wrapT = RepeatWrapping
  wallColorMap.colorSpace = SRGBColorSpace
  ceilingColorMap.wrapS = RepeatWrapping
  ceilingColorMap.wrapT = RepeatWrapping
  ceilingColorMap.colorSpace = SRGBColorSpace
  const ceilingTexture = useMemo(() => {
    const next = ceilingColorMap.clone()
    next.wrapS = RepeatWrapping
    next.wrapT = RepeatWrapping
    next.repeat.set(
      Math.max(0.01, MAIN_ROOM.width * WALL_REPEAT_X_PER_UNIT),
      Math.max(0.01, MAIN_ROOM.depth * WALL_REPEAT_X_PER_UNIT),
    )
    next.colorSpace = SRGBColorSpace
    next.needsUpdate = true
    return next
  }, [ceilingColorMap])
  useEffect(() => () => ceilingTexture.dispose(), [ceilingTexture])
  const frontWall = getWallOpeningLayout(MAIN_ROOM.width, MAIN_ROOM.height, DRAGON_OPENING)

  return (
    <>
      <color attach="background" args={['#eef3f8']} />
      {!hideCeiling && <fog attach="fog" args={['#eef3f8', 10, 24]} />}

      <ambientLight intensity={0.5} />
      <hemisphereLight args={['#f7fbff', '#d8dee9', 0.7]} />
      <directionalLight position={[4, 7, 5]} intensity={1.15} color="#ffffff" />

      <WallPanel
        texture={wallColorMap}
        uvWidth={MAIN_ROOM.depth}
        uvHeight={5}
        position={[-5.05, 2.5, 0]}
        geometryArgs={[0.1, 5, MAIN_ROOM.depth]}
      />
      <WallPanel
        texture={wallColorMap}
        uvWidth={MAIN_ROOM.depth}
        uvHeight={5}
        position={[5.05, 2.5, 0]}
        geometryArgs={[0.1, 5, MAIN_ROOM.depth]}
      />
      <WallPanel
        texture={wallColorMap}
        uvWidth={MAIN_ROOM.width}
        uvHeight={5}
        position={[0, 2.5, -5.05]}
        geometryArgs={[MAIN_ROOM.width, 5, 0.1]}
      />
      <WallPanel
        texture={wallColorMap}
        uvWidth={frontWall.left.width}
        uvHeight={frontWall.left.height}
        position={[frontWall.left.x, frontWall.left.y, FRONT_WALL.zVisual]}
        geometryArgs={[frontWall.left.width, frontWall.left.height, FRONT_WALL.thickness]}
      />
      <WallPanel
        texture={wallColorMap}
        uvWidth={frontWall.right.width}
        uvHeight={frontWall.right.height}
        position={[frontWall.right.x, frontWall.right.y, FRONT_WALL.zVisual]}
        geometryArgs={[frontWall.right.width, frontWall.right.height, FRONT_WALL.thickness]}
      />
      <WallPanel
        texture={wallColorMap}
        uvWidth={frontWall.top.width}
        uvHeight={frontWall.top.height}
        position={[frontWall.top.x, frontWall.top.y, FRONT_WALL.zVisual]}
        geometryArgs={[frontWall.top.width, frontWall.top.height, FRONT_WALL.thickness]}
      />
      <mesh position={[0, 4.98, 0]} visible={!hideCeiling}>
        <boxGeometry args={[MAIN_ROOM.width, 0.1, MAIN_ROOM.depth]} />
        <meshStandardMaterial map={ceilingTexture} color="#e6edf6" side={BackSide} />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[10, 10]} />
        <meshStandardMaterial
          map={floorColorMap}
          roughness={0.66}
          metalness={0.08}
          color="#b8ad9b"
        />
      </mesh>

      <gridHelper
        args={[10, 20, '#c3ccd6', '#d8e0e8']}
        position={[0, 0.01, 0]}
        visible={SHOW_FLOOR_GRID}
      />

      <Environment preset="city" />
    </>
  )
}

function PhysicsBounds() {
  const frontWall = getWallOpeningLayout(MAIN_ROOM.width, MAIN_ROOM.height, DRAGON_OPENING)

  return (
    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider args={[5, 0.2, 5]} position={[0, -0.2, 0]} />
      <CuboidCollider args={[0.1, 2.4, 5]} position={[-5.1, 2.2, 0]} />
      <CuboidCollider args={[0.1, 2.4, 5]} position={[5.1, 2.2, 0]} />
      <CuboidCollider args={[5, 2.4, 0.1]} position={[0, 2.2, -5.1]} />
      <CuboidCollider args={[frontWall.left.width * 0.5, frontWall.left.height * 0.5, 0.1]} position={[frontWall.left.x, frontWall.left.y, FRONT_WALL.zCollider]} />
      <CuboidCollider args={[frontWall.right.width * 0.5, frontWall.right.height * 0.5, 0.1]} position={[frontWall.right.x, frontWall.right.y, FRONT_WALL.zCollider]} />
      <CuboidCollider args={[frontWall.top.width * 0.5, frontWall.top.height * 0.5, 0.1]} position={[frontWall.top.x, frontWall.top.y, FRONT_WALL.zCollider]} />
    </RigidBody>
  )
}

function GlassContainmentRoom() {
  return (
    <group position={[0, 0, 7.03]}>
      <mesh position={[0, 0.012, 0]}>
        <boxGeometry args={[6, 0.05, 4]} />
        <meshStandardMaterial color="#d4dbe3" />
      </mesh>

      <mesh position={[0, 1.9, 1.98]}>
        <boxGeometry args={[6, 3.8, 0.1]} />
        <meshStandardMaterial color="#edf1f5" />
      </mesh>
      <mesh position={[-3, 1.9, 0]}>
        <boxGeometry args={[0.1, 3.8, 4]} />
        <meshStandardMaterial color="#edf1f5" />
      </mesh>
      <mesh position={[3, 1.9, 0]}>
        <boxGeometry args={[0.1, 3.8, 4]} />
        <meshStandardMaterial color="#edf1f5" />
      </mesh>

      <mesh position={[0, 1.9, -1.98]}>
        <boxGeometry args={[6, 3.8, 0.06]} />
        <meshPhysicalMaterial
          color="#bfefff"
          transparent
          opacity={1}
          roughness={0.05}
          metalness={0}
          transmission={1}
          thickness={0.2}
          ior={1.5}
          reflectivity={0.8}
          envMapIntensity={1.35}
        />
      </mesh>

      <mesh position={[0, 3.83, -1.945]}>
        <boxGeometry args={[6.12, 0.06, 0.06]} />
        <meshStandardMaterial color="#9da8b3" metalness={0.45} roughness={0.35} />
      </mesh>
      <mesh position={[0, -0.03, -1.945]}>
        <boxGeometry args={[6.12, 0.06, 0.06]} />
        <meshStandardMaterial color="#9da8b3" metalness={0.45} roughness={0.35} />
      </mesh>
      <mesh position={[-3.03, 1.9, -1.945]}>
        <boxGeometry args={[0.06, 3.92, 0.06]} />
        <meshStandardMaterial color="#9da8b3" metalness={0.45} roughness={0.35} />
      </mesh>
      <mesh position={[3.03, 1.9, -1.945]}>
        <boxGeometry args={[0.06, 3.92, 0.06]} />
        <meshStandardMaterial color="#9da8b3" metalness={0.45} roughness={0.35} />
      </mesh>

      <pointLight position={[0, 3.2, 0.05]} intensity={1.45} color="#bfefff" />
    </group>
  )
}

function GlassContainmentColliders() {
  return (
    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider args={[3, 1.9, 0.06]} position={[0, 1.9, 5.05]} />
      <CuboidCollider args={[0.05, 1.9, 2]} position={[-3, 1.9, 7.03]} />
      <CuboidCollider args={[0.05, 1.9, 2]} position={[3, 1.9, 7.03]} />
      <CuboidCollider args={[3, 1.9, 0.05]} position={[0, 1.9, 9.01]} />
    </RigidBody>
  )
}

function Ball({ ballRef, skinTexturePath }) {
  const ballSkin = useGLTF('/models/ball/ballon.glb')
  const skinTexture = useTexture(skinTexturePath)
  skinTexture.colorSpace = SRGBColorSpace
  const visual = useMemo(() => {
    const candidates = []

    ballSkin.scene.traverse((object) => {
      if (!(object instanceof Mesh) || !object.geometry) return
      const geometry = object.geometry
      if (!geometry.boundingBox) geometry.computeBoundingBox()
      if (!geometry.boundingBox) return

      const size = geometry.boundingBox.getSize(new Vector3())
      const maxSide = Math.max(size.x, size.y, size.z)
      const minSide = Math.min(size.x, size.y, size.z)
      if (maxSide <= 0) return

      const roundness = minSide / maxSide
      const volume = size.x * size.y * size.z
      const score = roundness * roundness * volume
      candidates.push({ object, score })
    })

    const picked = candidates.sort((a, b) => b.score - a.score)[0]?.object
    if (!picked) return null

    const geometry = picked.geometry.clone()
    if (!geometry.boundingBox) geometry.computeBoundingBox()
    const center = geometry.boundingBox.getCenter(new Vector3())
    const size = geometry.boundingBox.getSize(new Vector3())
    const maxSide = Math.max(size.x, size.y, size.z) || 1

    geometry.translate(-center.x, -center.y, -center.z)

    const material = picked.material.clone()
    material.map = skinTexture
    material.needsUpdate = true

    return {
      geometry,
      material,
      scale: (BALL_RADIUS * 2) / maxSide,
    }
  }, [ballSkin.scene, skinTexture])

  return (
    <RigidBody
      ref={ballRef}
      name="ball"
      colliders={false}
      position={[0, 3.2, 0]}
      restitution={0.82}
      friction={0.55}
      linearDamping={0.35}
      angularDamping={0.4}
      mass={1}
      ccd
    >
      <BallCollider args={[BALL_RADIUS]} />
      <group name="ball">
        {visual && (
          <mesh
            geometry={visual.geometry}
            material={visual.material}
            scale={visual.scale}
            castShadow
            frustumCulled={false}
          />
        )}
      </group>
    </RigidBody>
  )
}

const DRAGON_POSITION = { x: 0, y: 0.03, z: 7.03 }
const DRAGON_WAKE_DISTANCE = 5
const DRAGON_WAKE_DELAY = 2
const DRAGON_SLEEP_DELAY = 4

function Dragon({ playerPositionRef }) {
  const { scene, animations } = useGLTF('/models/dragon.glb')
  const dragon = useMemo(() => clone(scene), [scene])
  const { actions, mixer } = useAnimations(animations, dragon)
  const stateRef = useRef('patrol')
  const nearTimeRef = useRef(0)
  const awayTimeRef = useRef(0)
  const currentActionRef = useRef(null)

  const playAction = (name, { loop = true, fade = 0.25, force = false } = {}) => {
    const action = actions[name]
    if (!action || (!force && currentActionRef.current === action)) return action

    if (currentActionRef.current !== action) currentActionRef.current?.fadeOut(fade)
    if (!action.isRunning()) action.reset()
    action.setLoop(loop ? LoopRepeat : LoopOnce, loop ? Infinity : 1).play()
    action.setEffectiveWeight(1)
    action.setEffectiveTimeScale(1)
    if (fade > 0) action.fadeIn(fade)
    action.clampWhenFinished = !loop
    currentActionRef.current = action

    return action
  }

  useEffect(() => {
    dragon.traverse((object) => {
      if (object instanceof Mesh) {
        object.castShadow = true
        object.receiveShadow = true
      }
    })
  }, [dragon])

  useEffect(() => {
    const onFinished = (event) => {
      if (
        stateRef.current === 'entering' &&
        event.action === actions.Dragon_Ancient_Dialogue_Entry_Neutral
      ) {
        stateRef.current = 'dialogue'
        playAction('Dragon_Ancient_Dialogue_Relaxed_Idle')
      }

      if (stateRef.current === 'leaving' && event.action === actions.Dragon_Ancient_Dialogue_Out) {
        stateRef.current = 'patrol'
        nearTimeRef.current = 0
        awayTimeRef.current = 0
        playAction('Dragon_Ancient_Patrol_Idle')
      }
    }

    mixer.addEventListener('finished', onFinished)
    return () => mixer.removeEventListener('finished', onFinished)
  }, [actions, mixer])

  useFrame((_, delta) => {
    const playerPosition = playerPositionRef.current
    const distanceToPlayer = Math.hypot(
      playerPosition.x - DRAGON_POSITION.x,
      playerPosition.z - DRAGON_POSITION.z,
    )
    const isNear = distanceToPlayer <= DRAGON_WAKE_DISTANCE

    if (stateRef.current === 'patrol') {
      const patrolIdle = playAction('Dragon_Ancient_Patrol_Idle', { fade: 0, force: true })
      if (!patrolIdle) return

      nearTimeRef.current = isNear ? nearTimeRef.current + delta : 0
      if (nearTimeRef.current >= DRAGON_WAKE_DELAY) {
        stateRef.current = 'entering'
        awayTimeRef.current = 0
        playAction('Dragon_Ancient_Dialogue_Entry_Neutral', { loop: false })
      }
      return
    }

    if (stateRef.current === 'dialogue') {
      awayTimeRef.current = isNear ? 0 : awayTimeRef.current + delta
      if (awayTimeRef.current >= DRAGON_SLEEP_DELAY) {
        stateRef.current = 'leaving'
        nearTimeRef.current = 0
        playAction('Dragon_Ancient_Dialogue_Out', { loop: false })
      }
    }
  })

  return (
    <group
      position={[DRAGON_POSITION.x, DRAGON_POSITION.y, DRAGON_POSITION.z]}
      rotation={[0, Math.PI, 0]}
      scale={2}
    >
      <primitive object={dragon} />
    </group>
  )
}

function GoalVisual({ selected = false, ballRef = null, goalObject = null }) {
  return (
    <>
      <mesh position={[-1.5, 1, 0]}>
        <boxGeometry args={[0.1, 2, 0.1]} />
        <meshStandardMaterial color="#a5afb9" metalness={0.28} roughness={0.45} />
      </mesh>
      <mesh position={[1.5, 1, 0]}>
        <boxGeometry args={[0.1, 2, 0.1]} />
        <meshStandardMaterial color="#a5afb9" metalness={0.28} roughness={0.45} />
      </mesh>
      <mesh position={[0, 2, 0]}>
        <boxGeometry args={[3.1, 0.1, 0.1]} />
        <meshStandardMaterial color="#a5afb9" metalness={0.28} roughness={0.45} />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, -0.55]}>
        <planeGeometry args={[2.9, 1.25]} />
        <meshStandardMaterial
          color="#2c8fe0"
          emissive="#1f6fb2"
          emissiveIntensity={0.35}
          transparent
          opacity={0.58}
        />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.016, -0.55]}>
        <planeGeometry args={[2.1, 0.62]} />
        <meshStandardMaterial
          color="#9dddff"
          emissive="#6cc7ff"
          emissiveIntensity={0.2}
          transparent
          opacity={0.42}
        />
      </mesh>

      {ballRef && goalObject && <GoalNet ballRef={ballRef} goalObject={goalObject} />}
      {selected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.035, -0.45]}>
          <ringGeometry args={[1.82, 1.9, 42]} />
          <meshBasicMaterial color="#ffd447" transparent opacity={0.95} />
        </mesh>
      )}
    </>
  )
}

function Goal({
  object,
  mode,
  selected,
  onSelect,
  onStartDragging,
  onBallZoneEnter,
  onBallZoneExit,
  ballRef,
}) {
  if (!object || object.status === 'stored') return null

  const goalPosition = object?.position ?? [0, 0, GOAL_Z]
  const isCustomizeMode = mode === 'customize'
  const leftPostCollider = getRotatedGoalCollider(object, [-1.5, 1, 0])
  const rightPostCollider = getRotatedGoalCollider(object, [1.5, 1, 0])
  const crossbarCollider = getRotatedGoalCollider(object, [0, 2, 0])
  const backCollider = getRotatedGoalCollider(object, [0, 1, -1.14])
  const scoreZoneCollider = getRotatedGoalCollider(object, [0, 1, -0.5])

  const handlePointerDown = (event) => {
    if (!isCustomizeMode || !object?.canMove) return
    event.stopPropagation()
    onSelect(object.id)
    onStartDragging(object.id)
  }

  const handleGoalSensorEnter = (event) => {
    const bodyName = event.other.rigidBodyObject?.name
    const colliderName = event.other.colliderObject?.name
    if (bodyName === 'ball' || colliderName === 'ball') onBallZoneEnter()
  }

  const handleGoalSensorExit = (event) => {
    const bodyName = event.other.rigidBodyObject?.name
    const colliderName = event.other.colliderObject?.name
    if (bodyName === 'ball' || colliderName === 'ball') onBallZoneExit()
  }

  return (
    <>
      <RigidBody
        key={`goal-frame-${goalPosition.join(':')}-${object?.rotationY ?? 0}`}
        type="fixed"
        colliders={false}
      >
        <CuboidCollider args={[0.11, 1, 0.11]} position={leftPostCollider.position} restitution={0.72} friction={0.5} />
        <CuboidCollider args={[0.11, 1, 0.11]} position={rightPostCollider.position} restitution={0.72} friction={0.5} />
        <CuboidCollider args={[1.58, 0.11, 0.11]} position={crossbarCollider.position} rotation={crossbarCollider.rotation} restitution={0.72} friction={0.5} />
        <CuboidCollider args={[1.5, 1, 0.05]} position={backCollider.position} rotation={backCollider.rotation} restitution={0.52} friction={0.45} />
      </RigidBody>

      <RigidBody
        key={`goal-zone-${goalPosition.join(':')}-${object?.rotationY ?? 0}`}
        type="fixed"
        colliders={false}
      >
        <CuboidCollider
          args={[1.34, 0.86, 0.44]}
          position={scoreZoneCollider.position}
          rotation={scoreZoneCollider.rotation}
          sensor
          onIntersectionEnter={handleGoalSensorEnter}
          onIntersectionExit={handleGoalSensorExit}
        />
      </RigidBody>

      <group
        position={goalPosition}
        rotation={[0, object?.rotationY ?? 0, 0]}
        onPointerDown={handlePointerDown}
      >
        <GoalVisual selected={selected} ballRef={ballRef} goalObject={object} />
      </group>
    </>
  )
}

function GoalNet({ ballRef, goalObject }) {
  const NET_WIDTH = 3.02
  const NET_HEIGHT = 1.96
  const NET_DEPTH = 1.28
  const netRef = useRef()
  const baseRef = useRef(null)
  const displacementRef = useRef(null)
  const velocityRef = useRef(null)
  const fixedRef = useRef(null)
  const netGeometry = useMemo(() => {
    const width = NET_WIDTH
    const height = NET_HEIGHT
    const segX = 22
    const segY = 14
    const depth = NET_DEPTH
    const geometry = new PlaneGeometry(width, height, segX, segY)
    const pos = geometry.attributes.position

    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i)
      const y = pos.getY(i)
      const yNormalized = (y + height * 0.5) / height
      const depthFactor = 1 - yNormalized

      // Front edge attached to posts/top bar, bottom goes deeper.
      let z = -depth * depthFactor
      // Small natural relaxation to avoid a perfectly straight sheet.
      z -= Math.sin((x / (width * 0.5)) * Math.PI) * 0.08 * depthFactor
      z -= (1 - Math.abs(x) / (width * 0.5)) * 0.03 * depthFactor

      pos.setZ(i, z)
    }

    pos.needsUpdate = true
    return geometry
  }, [])
  const sideGeometry = useMemo(() => {
    const sideHeight = NET_HEIGHT - 0.08
    const geometry = new PlaneGeometry(NET_DEPTH, sideHeight, 8, 12)
    const pos = geometry.attributes.position
    const halfDepth = NET_DEPTH * 0.5
    const halfHeight = sideHeight * 0.5

    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i)
      const y = pos.getY(i)
      const topFactor = 1 - (y + halfHeight) / sideHeight
      const t = (x + halfDepth) / NET_DEPTH

      // Top is close to the frame, bottom goes deeper, like a real net side.
      const depth = t * NET_DEPTH * topFactor
      pos.setX(i, depth)
      pos.setZ(i, 0)
    }

    pos.needsUpdate = true
    return geometry
  }, [])

  useEffect(() => {
    if (!netRef.current) return
    const positions = netRef.current.geometry.attributes.position.array
    baseRef.current = new Float32Array(positions)
    displacementRef.current = new Float32Array(positions.length / 3)
    velocityRef.current = new Float32Array(positions.length / 3)
    fixedRef.current = new Uint8Array(positions.length / 3)

    const widthHalf = NET_WIDTH * 0.5
    const heightHalf = NET_HEIGHT * 0.5
    for (let i = 0; i < fixedRef.current.length; i += 1) {
      const i3 = i * 3
      const x = baseRef.current[i3]
      const y = baseRef.current[i3 + 1]
      // Keep all borders rigidly attached to the frame.
      const fixed =
        Math.abs(x) > widthHalf - 0.0001 ||
        Math.abs(y) > heightHalf - 0.0001
      fixedRef.current[i] = fixed ? 1 : 0
    }
  }, [])

  useFrame((_, delta) => {
    if (
      !netRef.current ||
      !baseRef.current ||
      !displacementRef.current ||
      !velocityRef.current ||
      !fixedRef.current
    ) return

    const positions = netRef.current.geometry.attributes.position.array
    const base = baseRef.current
    const displacement = displacementRef.current
    const velocity = velocityRef.current
    const fixed = fixedRef.current
    const vertexCount = displacement.length

    const ball = ballRef.current
    if (ball) {
      const p = ball.translation()
      const v = ball.linvel()
      const goalX = goalObject?.position?.[0] ?? 0
      const goalZ = goalObject?.position?.[2] ?? GOAL_Z
      const goalRotationY = goalObject?.rotationY ?? 0
      const dx = p.x - goalX
      const dz = p.z - goalZ
      const cos = Math.cos(goalRotationY)
      const sin = Math.sin(goalRotationY)
      const vx = dx * cos - dz * sin
      const vy = p.y
      const vzLocal = dx * sin + dz * cos
      const speed = Math.hypot(v.x, v.y, v.z)
      const impactRadius = 0.9
      const impactForce = Math.min(0.11, 0.016 + speed * 0.0065)

      for (let i = 0; i < vertexCount; i += 1) {
        if (fixed[i]) continue
        const i3 = i * 3
        const px = base[i3]
        const py = base[i3 + 1]
        const pz = base[i3 + 2]

        const dx = px - vx
        const dy = py - vy
        const dz = pz - vzLocal
        const dist = Math.hypot(dx, dy, dz)

        if (dist < impactRadius) {
          const force = (1 - dist / impactRadius) * impactForce
          velocity[i] -= force
        }
      }
    }

    const spring = Math.min(1, 8.2 * delta)
    const damp = Math.max(0.84, 1 - 7.2 * delta)
    const maxPush = 0.34

    for (let i = 0; i < vertexCount; i += 1) {
      const i3 = i * 3
      if (fixed[i]) {
        displacement[i] = 0
        velocity[i] = 0
        positions[i3 + 2] = base[i3 + 2]
        continue
      }
      velocity[i] *= damp
      displacement[i] += velocity[i]
      displacement[i] += (0 - displacement[i]) * spring
      displacement[i] = Math.max(-maxPush, Math.min(maxPush * 0.35, displacement[i]))
      positions[i3 + 2] = base[i3 + 2] + displacement[i]
    }

    netRef.current.geometry.attributes.position.needsUpdate = true
  })

  return (
    <group>
      <mesh ref={netRef} geometry={netGeometry} position={[0, 1, -0.02]}>
        <meshStandardMaterial
          color="#9ec5ff"
          emissive="#4f7fc7"
          emissiveIntensity={0.2}
          wireframe
          transparent
          opacity={0.92}
          roughness={0.62}
          metalness={0.03}
        />
      </mesh>

      <mesh position={[-1.5, 0.98, -0.01]} rotation={[0, Math.PI / 2, 0]} geometry={sideGeometry}>
        <meshStandardMaterial
          color="#9ec5ff"
          emissive="#4f7fc7"
          emissiveIntensity={0.16}
          wireframe
          transparent
          opacity={0.86}
          roughness={0.68}
          metalness={0.03}
        />
      </mesh>

      <mesh position={[1.5, 0.98, -0.01]} rotation={[0, Math.PI / 2, 0]} geometry={sideGeometry}>
        <meshStandardMaterial
          color="#9ec5ff"
          emissive="#4f7fc7"
          emissiveIntensity={0.16}
          wireframe
          transparent
          opacity={0.86}
          roughness={0.68}
          metalness={0.03}
        />
      </mesh>
    </group>
  )
}

function Player({ touchRef, ballRef, playerPositionRef, mode, goalObject, seatedState, onSeatedPhaseChange }) {
  const playerBodyRef = useRef()
  const visualRef = useRef()
  const playerPosRef = useRef({ x: 0, y: PLAYER_HEIGHT, z: 2.2 })
  const planarVelocityRef = useRef({ x: 0, z: 0 })
  const filteredInputRef = useRef({ x: 0, y: 0 })
  const cameraLookRef = useRef({ x: 0, y: PLAYER_HEIGHT + 0.55, z: 2.2 })
  const kickUntilRef = useRef(0)
  const pendingKickRef = useRef(null)
  const jumpStartUntilRef = useRef(0)
  const jumpLandUntilRef = useRef(0)
  const waveUntilRef = useRef(0)
  const danceUntilRef = useRef(0)
  const pointingUpUntilRef = useRef(0)
  const seatPhaseRef = useRef(null)
  const seatTimerRef = useRef(0)
  const velocityYRef = useRef(0)
  const onGroundRef = useRef(true)
  const wasOnGroundRef = useRef(true)
  const landingPreparedRef = useRef(false)
  const [playerMotion, setPlayerMotion] = useState('idle')
  const keyboardRef = useKeyboardInput()
  const { camera } = useThree()
  const { world, rapier } = useRapier()

  useFrame((state, delta) => {
    if (!playerBodyRef.current || !visualRef.current) return

    const key = keyboardRef.current
    const touch = touchRef.current

    if (seatedState?.phase) {
      const seat = seatedState.seat
      const isStandingUp = seatedState.phase === 'standUp'
      const target = seat.position
      const targetYaw = seat.rotationY
      const cameraYawSpeed = 2.9
      const cameraPitchSpeed = 2.1

      if (!touch.lookActive) {
        touch.lookX = 0
        touch.lookY = 0
      }
      touch.cameraYaw -= touch.lookX * cameraYawSpeed * delta
      touch.cameraPitch = MathUtils.clamp(
        touch.cameraPitch + touch.lookY * cameraPitchSpeed * delta,
        -0.8,
        0.35,
      )

      if (seatPhaseRef.current !== seatedState.phase) {
        seatPhaseRef.current = seatedState.phase
        seatTimerRef.current = 0
      }

      seatTimerRef.current += delta
      key.actionQueued = false
      touch.moveX = 0
      touch.moveY = 0
      touch.actionQueued = false
      touch.emoteQueued = null
      planarVelocityRef.current.x = 0
      planarVelocityRef.current.z = 0
      filteredInputRef.current.x = 0
      filteredInputRef.current.y = 0
      velocityYRef.current = 0
      onGroundRef.current = true

      const nextX = target[0]
      const nextY = isStandingUp ? PLAYER_HEIGHT : (seat.sittingHeight ?? PLAYER_SITTING_HEIGHT)
      const nextZ = target[2]
      playerPosRef.current.x = nextX
      playerPosRef.current.y = nextY
      playerPosRef.current.z = nextZ
      playerPositionRef.current.x = nextX
      playerPositionRef.current.y = nextY
      playerPositionRef.current.z = nextZ
      playerBodyRef.current.setNextKinematicTranslation({ x: nextX, y: nextY, z: nextZ })
      visualRef.current.position.set(nextX, nextY, nextZ)
      visualRef.current.rotation.y = targetYaw

      const nextMotion =
        seatedState.phase === 'sitDown'
          ? 'sitDown'
          : seatedState.phase === 'standUp'
            ? 'standUp'
            : 'sittingIdle'
      setPlayerMotion((current) => (current === nextMotion ? current : nextMotion))

      if (seatedState.phase === 'sitDown' && seatTimerRef.current >= PLAYER_SIT_DOWN_DURATION) {
        onSeatedPhaseChange('sitting')
      }
      if (seatedState.phase === 'standUp' && seatTimerRef.current >= PLAYER_STAND_UP_DURATION) {
        playerPosRef.current.x = seat.exitPosition[0]
        playerPosRef.current.y = PLAYER_HEIGHT
        playerPosRef.current.z = seat.exitPosition[2]
        playerPositionRef.current.x = seat.exitPosition[0]
        playerPositionRef.current.y = PLAYER_HEIGHT
        playerPositionRef.current.z = seat.exitPosition[2]
        playerBodyRef.current.setNextKinematicTranslation({
          x: seat.exitPosition[0],
          y: PLAYER_HEIGHT,
          z: seat.exitPosition[2],
        })
        visualRef.current.position.set(seat.exitPosition[0], PLAYER_HEIGHT, seat.exitPosition[2])
        seatPhaseRef.current = null
        onSeatedPhaseChange(null)
      }

      cameraLookRef.current.x = MathUtils.damp(cameraLookRef.current.x, nextX, 12, delta)
      cameraLookRef.current.y = MathUtils.damp(cameraLookRef.current.y, nextY + 0.75, 12, delta)
      cameraLookRef.current.z = MathUtils.damp(cameraLookRef.current.z, nextZ, 12, delta)
      const pitch = touch.cameraPitch
      const cameraDistance = touch.cameraDistance ?? 3
      const horizontalDistance = cameraDistance * Math.cos(pitch)
      const seatCameraX = nextX + Math.sin(touch.cameraYaw) * horizontalDistance
      const seatCameraY = nextY + 1.45 + Math.sin(pitch) * cameraDistance
      const seatCameraZ = nextZ + Math.cos(touch.cameraYaw) * horizontalDistance
      let targetCameraX = seatCameraX
      let targetCameraY = seatCameraY
      let targetCameraZ = seatCameraZ

      const originY = nextY + 0.75
      const dirX = seatCameraX - nextX
      const dirY = seatCameraY - originY
      const dirZ = seatCameraZ - nextZ
      const rayDistance = Math.hypot(dirX, dirY, dirZ)

      if (rayDistance > 0.001) {
        const inv = 1 / rayDistance
        const rayDir = { x: dirX * inv, y: dirY * inv, z: dirZ * inv }
        const ray = new rapier.Ray({ x: nextX, y: originY, z: nextZ }, rayDir)
        const hit = world.castRay(ray, rayDistance, true)
        if (hit && hit.toi < rayDistance) {
          const safe = Math.max(0.2, hit.toi - 0.14)
          targetCameraX = nextX + rayDir.x * safe
          targetCameraY = originY + rayDir.y * safe
          targetCameraZ = nextZ + rayDir.z * safe
        }
      }

      const clampedCamera = clampCameraInPlayableVolume(targetCameraX, targetCameraY, targetCameraZ)
      camera.position.x = MathUtils.damp(camera.position.x, clampedCamera.x, 7, delta)
      camera.position.y = MathUtils.damp(camera.position.y, clampedCamera.y, 7, delta)
      camera.position.z = MathUtils.damp(camera.position.z, clampedCamera.z, 7, delta)
      camera.lookAt(cameraLookRef.current.x, cameraLookRef.current.y, cameraLookRef.current.z)
      return
    }

    if (seatPhaseRef.current) {
      seatPhaseRef.current = null
      seatTimerRef.current = 0
    }

    if (mode === 'customize') {
      key.actionQueued = false
      touch.moveX = 0
      touch.moveY = 0
      touch.lookX = 0
      touch.lookY = 0
      touch.lookActive = false
      touch.actionQueued = false
      touch.emoteQueued = null
      planarVelocityRef.current.x = 0
      planarVelocityRef.current.z = 0
      filteredInputRef.current.x = 0
      filteredInputRef.current.y = 0
      setPlayerMotion((current) => (current === 'idle' ? current : 'idle'))
      return
    }

    const cameraYawSpeed = 2.9
    const cameraPitchSpeed = 2.1
    if (!touch.lookActive) {
      touch.lookX = 0
      touch.lookY = 0
    }
    touch.cameraYaw -= touch.lookX * cameraYawSpeed * delta
    touch.cameraPitch = MathUtils.clamp(
      touch.cameraPitch + touch.lookY * cameraPitchSpeed * delta,
      -0.8,
      0.35,
    )

    let isEmoting =
      state.clock.elapsedTime < waveUntilRef.current ||
      state.clock.elapsedTime < danceUntilRef.current ||
      state.clock.elapsedTime < pointingUpUntilRef.current
    const keyboardAxisX = (key.right ? 1 : 0) - (key.left ? 1 : 0)
    const keyboardAxisY = (key.forward ? 1 : 0) - (key.back ? 1 : 0)
    const controlX = MathUtils.clamp(touch.moveX + keyboardAxisX, -1, 1)
    const controlY = MathUtils.clamp(touch.moveY + keyboardAxisY, -1, 1)
    const wantsControlCancel =
      isEmoting &&
      (Math.hypot(controlX, controlY) > 0.12 || key.actionQueued || touch.actionQueued)

    if (wantsControlCancel) {
      waveUntilRef.current = 0
      danceUntilRef.current = 0
      pointingUpUntilRef.current = 0
      isEmoting = false
    }

    const rawX = isEmoting ? 0 : controlX
    const rawY = isEmoting ? 0 : controlY
    const rawLength = Math.hypot(rawX, rawY)

    const moveFilter = 16
    filteredInputRef.current.x +=
      (rawX - filteredInputRef.current.x) * Math.min(1, moveFilter * delta)
    filteredInputRef.current.y +=
      (rawY - filteredInputRef.current.y) * Math.min(1, moveFilter * delta)

    let moveX = filteredInputRef.current.x
    let moveY = filteredInputRef.current.y
    const inputLength = Math.hypot(moveX, moveY)
    if (rawLength < 0.08 && inputLength < 0.12) {
      moveX = 0
      moveY = 0
      filteredInputRef.current.x = 0
      filteredInputRef.current.y = 0
    } else if (inputLength > 1) {
      moveX /= inputLength
      moveY /= inputLength
    }

    const yaw = touch.cameraYaw
    const forwardX = -Math.sin(yaw)
    const forwardZ = -Math.cos(yaw)
    const rightX = Math.cos(yaw)
    const rightZ = -Math.sin(yaw)

    let worldX = rightX * moveX + forwardX * moveY
    let worldZ = rightZ * moveX + forwardZ * moveY

    const isMoving = worldX !== 0 || worldZ !== 0

    if (isMoving) {
      const length = Math.hypot(worldX, worldZ)
      worldX /= length
      worldZ /= length
    }

    const moveIntensity = MathUtils.clamp(rawLength, 0, 1)
    const speed = isMoving ? MathUtils.lerp(1.65, 3.4, MathUtils.smoothstep(moveIntensity, 0.25, 0.95)) : 0
    const targetVelX = worldX * speed
    const targetVelZ = worldZ * speed
    const planarDamping = 14
    planarVelocityRef.current.x +=
      (targetVelX - planarVelocityRef.current.x) * Math.min(1, planarDamping * delta)
    planarVelocityRef.current.z +=
      (targetVelZ - planarVelocityRef.current.z) * Math.min(1, planarDamping * delta)
    if (Math.abs(targetVelX) < 0.0001 && Math.abs(planarVelocityRef.current.x) < 0.02) {
      planarVelocityRef.current.x = 0
    }
    if (Math.abs(targetVelZ) < 0.0001 && Math.abs(planarVelocityRef.current.z) < 0.02) {
      planarVelocityRef.current.z = 0
    }

    const prevX = playerPosRef.current.x
    const prevZ = playerPosRef.current.z
    let nextX = prevX + planarVelocityRef.current.x * delta
    let nextZ = prevZ + planarVelocityRef.current.z * delta

    if (isMoving) {
      const targetYaw = Math.atan2(worldX, worldZ)
      visualRef.current.rotation.y = dampAngle(visualRef.current.rotation.y, targetYaw, 12, delta)
    }

    nextX = MathUtils.clamp(nextX, -ROOM_LIMIT, ROOM_LIMIT)
    nextZ = MathUtils.clamp(nextZ, -ROOM_LIMIT, ROOM_LIMIT)

    const wantsEmote = touch.emoteQueued
    const wantsAction = !isEmoting && (key.actionQueued || touch.actionQueued)
    if (wantsEmote === 'wave' && onGroundRef.current) {
      waveUntilRef.current = state.clock.elapsedTime + PLAYER_WAVE_DURATION
      danceUntilRef.current = 0
      pointingUpUntilRef.current = 0
      kickUntilRef.current = 0
      pendingKickRef.current = null
      jumpStartUntilRef.current = 0
      jumpLandUntilRef.current = 0
      planarVelocityRef.current.x = 0
      planarVelocityRef.current.z = 0
      filteredInputRef.current.x = 0
      filteredInputRef.current.y = 0
    } else if (wantsEmote === 'dance' && onGroundRef.current) {
      danceUntilRef.current = state.clock.elapsedTime + PLAYER_DANCE_DURATION
      waveUntilRef.current = 0
      pointingUpUntilRef.current = 0
      kickUntilRef.current = 0
      pendingKickRef.current = null
      jumpStartUntilRef.current = 0
      jumpLandUntilRef.current = 0
      planarVelocityRef.current.x = 0
      planarVelocityRef.current.z = 0
      filteredInputRef.current.x = 0
      filteredInputRef.current.y = 0
    } else if (wantsEmote === 'pointingUp' && onGroundRef.current) {
      pointingUpUntilRef.current = state.clock.elapsedTime + PLAYER_POINTING_UP_DURATION
      waveUntilRef.current = 0
      danceUntilRef.current = 0
      kickUntilRef.current = 0
      pendingKickRef.current = null
      jumpStartUntilRef.current = 0
      jumpLandUntilRef.current = 0
      planarVelocityRef.current.x = 0
      planarVelocityRef.current.z = 0
      filteredInputRef.current.x = 0
      filteredInputRef.current.y = 0
    } else if (wantsAction) {
      const ball = ballRef.current
      if (ball) {
        const ballPos = ball.translation()
        const kickContact = getKickContact({
          playerX: nextX,
          playerZ: nextZ,
          yaw: visualRef.current.rotation.y,
          ballX: ballPos.x,
          ballZ: ballPos.z,
        })

        if (kickContact.isInKickArc && onGroundRef.current) {
          const contactAt = state.clock.elapsedTime + PLAYER_KICK_CONTACT_DELAY
          kickUntilRef.current = state.clock.elapsedTime + PLAYER_KICK_DURATION
          pendingKickRef.current = {
            contactAt,
            expiresAt: contactAt + PLAYER_KICK_CONTACT_WINDOW,
            fired: false,
            running: speed > 2.45,
          }
        } else if (onGroundRef.current) {
          velocityYRef.current = 4.9
          onGroundRef.current = false
          jumpStartUntilRef.current = state.clock.elapsedTime + PLAYER_JUMP_START_DURATION
          jumpLandUntilRef.current = 0
          landingPreparedRef.current = false
        }
      } else if (onGroundRef.current) {
        velocityYRef.current = 4.9
        onGroundRef.current = false
        jumpStartUntilRef.current = state.clock.elapsedTime + PLAYER_JUMP_START_DURATION
        jumpLandUntilRef.current = 0
        landingPreparedRef.current = false
      }
    }

    key.actionQueued = false
    touch.actionQueued = false
    touch.emoteQueued = null

    if (!onGroundRef.current) {
      velocityYRef.current -= 12 * delta
    } else {
      velocityYRef.current = 0
    }
    let nextY = onGroundRef.current ? PLAYER_HEIGHT : playerPosRef.current.y + velocityYRef.current * delta
    const distanceToGround = Math.max(0, nextY - PLAYER_HEIGHT)
    const shouldPrepareLanding =
      !onGroundRef.current &&
      !landingPreparedRef.current &&
      state.clock.elapsedTime >= jumpStartUntilRef.current &&
      velocityYRef.current < -1 &&
      distanceToGround < PLAYER_LANDING_PREPARE_DISTANCE

    if (shouldPrepareLanding) {
      landingPreparedRef.current = true
      jumpLandUntilRef.current = state.clock.elapsedTime + PLAYER_JUMP_LAND_DURATION
    }

    if (nextY <= PLAYER_HEIGHT) {
      nextY = PLAYER_HEIGHT
      velocityYRef.current = 0
      onGroundRef.current = true
    }

    if (!wasOnGroundRef.current && onGroundRef.current) {
      if (!landingPreparedRef.current) {
        jumpLandUntilRef.current = state.clock.elapsedTime + PLAYER_JUMP_LAND_DURATION
      }
      landingPreparedRef.current = false
    }
    wasOnGroundRef.current = onGroundRef.current

    if (collidesWithGoalFrame(nextX, nextY, nextZ, goalObject)) {
      nextX = prevX
      nextZ = prevZ
      planarVelocityRef.current.x = 0
      planarVelocityRef.current.z = 0
    }

    playerPosRef.current.x = nextX
    playerPosRef.current.y = nextY
    playerPosRef.current.z = nextZ
    playerPositionRef.current.x = nextX
    playerPositionRef.current.y = nextY
    playerPositionRef.current.z = nextZ

    playerBodyRef.current.setNextKinematicTranslation({ x: nextX, y: nextY, z: nextZ })
    if (visualRef.current) {
      visualRef.current.position.set(nextX, nextY, nextZ)
    }

    const pendingKick = pendingKickRef.current
    if (pendingKick && !pendingKick.fired && state.clock.elapsedTime >= pendingKick.contactAt) {
      const ball = ballRef.current
      if (ball && state.clock.elapsedTime <= pendingKick.expiresAt) {
        const ballPos = ball.translation()
        const kickContact = getKickContact({
          playerX: nextX,
          playerZ: nextZ,
          yaw: visualRef.current.rotation.y,
          ballX: ballPos.x,
          ballZ: ballPos.z,
        })

        if (kickContact.isInKickArc && kickContact.isTouchingFoot) {
          const power = pendingKick.running ? 0.22 : 0.17
          const lift = pendingKick.running ? 0.08 : 0.06
          ball.applyImpulse(
            { x: kickContact.forwardX * power, y: lift, z: kickContact.forwardZ * power },
            true,
          )
        }
      }
      pendingKick.fired = true
      pendingKickRef.current = null
    } else if (pendingKick && state.clock.elapsedTime > pendingKick.expiresAt) {
      pendingKickRef.current = null
    }

    const nextMotion =
      state.clock.elapsedTime < jumpLandUntilRef.current
        ? 'jumpLand'
        : !onGroundRef.current && state.clock.elapsedTime < jumpStartUntilRef.current
          ? 'jumpStart'
          : !onGroundRef.current
            ? 'fallingIdle'
            : state.clock.elapsedTime < waveUntilRef.current
              ? 'wave'
              : state.clock.elapsedTime < danceUntilRef.current
                ? 'dance'
                : state.clock.elapsedTime < pointingUpUntilRef.current
                  ? 'pointingUp'
                  : state.clock.elapsedTime < kickUntilRef.current
                    ? 'kick'
                    : isMoving
                      ? speed > 2.45
                        ? 'run'
                        : 'walk'
                      : 'idle'
    setPlayerMotion((current) => (current === nextMotion ? current : nextMotion))

    const pitch = touch.cameraPitch
    const cameraDistance = touch.cameraDistance ?? CAMERA_DISTANCE
    const horizontalDistance = cameraDistance * Math.cos(pitch)
    const desiredX = nextX + Math.sin(yaw) * horizontalDistance
    const desiredY = nextY + CAMERA_HEIGHT + Math.sin(pitch) * cameraDistance
    const desiredZ = nextZ + Math.cos(yaw) * horizontalDistance

    let targetX = desiredX
    let targetY = desiredY
    let targetZ = desiredZ

    const originY = nextY + 0.7
    const dirX = desiredX - nextX
    const dirY = desiredY - originY
    const dirZ = desiredZ - nextZ
    const rayDistance = Math.hypot(dirX, dirY, dirZ)

    if (rayDistance > 0.001) {
      const inv = 1 / rayDistance
      const rayDir = { x: dirX * inv, y: dirY * inv, z: dirZ * inv }
      const ray = new rapier.Ray({ x: nextX, y: originY, z: nextZ }, rayDir)
      const hit = world.castRay(ray, rayDistance, true)
      if (hit && hit.toi < rayDistance) {
        const safe = Math.max(0.2, hit.toi - 0.14)
        targetX = nextX + rayDir.x * safe
        targetY = originY + rayDir.y * safe
        targetZ = nextZ + rayDir.z * safe
      }
    }

    const clampedTarget = clampCameraInPlayableVolume(targetX, targetY, targetZ)
    camera.position.x = MathUtils.damp(camera.position.x, clampedTarget.x, 12, delta)
    camera.position.y = MathUtils.damp(camera.position.y, clampedTarget.y, 12, delta)
    camera.position.z = MathUtils.damp(camera.position.z, clampedTarget.z, 12, delta)

    cameraLookRef.current.x = MathUtils.damp(cameraLookRef.current.x, nextX, 16, delta)
    cameraLookRef.current.y = MathUtils.damp(cameraLookRef.current.y, nextY + 0.55, 16, delta)
    cameraLookRef.current.z = MathUtils.damp(cameraLookRef.current.z, nextZ, 16, delta)
    camera.lookAt(cameraLookRef.current.x, cameraLookRef.current.y, cameraLookRef.current.z)
  })

  return (
    <>
      <RigidBody
        ref={playerBodyRef}
        type="kinematicPosition"
        colliders={false}
        position={[0, PLAYER_HEIGHT, 2.2]}
      >
        <CapsuleCollider args={[PLAYER_CAPSULE_HALF_HEIGHT, PLAYER_CAPSULE_RADIUS]} />
      </RigidBody>
      <group ref={visualRef} position={[0, PLAYER_HEIGHT, 2.2]}>
        <PlayerAvatar motion={playerMotion} />
      </group>
    </>
  )
}

function PlayerAvatar({ motion }) {
  const model = useFBX('/models/player/player-boy01.fbx')
  const idle = useFBX('/models/player/player-idle.fbx')
  const walk = useFBX('/models/player/player-walk.fbx')
  const run = useFBX('/models/player/player-run.fbx')
  const kick = useFBX('/models/player/player-kick.fbx')
  const wave = useFBX('/models/Waving.fbx')
  const dance = useFBX('/models/Wave Hip Hop Dance.fbx')
  const pointingUp = useFBX('/models/player/pointing-up.fbx')
  const jumpStart = useFBX('/models/player/player-jump-start.fbx')
  const jumpLoop = useFBX('/models/player/player-jump-loop.fbx')
  const jumpLand = useFBX('/models/player/player-jump-land.fbx')
  const sitDown = useFBX('/models/player/Stand To Sit.fbx')
  const sittingIdle = useFBX('/models/player/Sitting Idle.fbx')
  const standUp = useFBX('/models/player/Stand Up.fbx')
  const avatar = useMemo(() => {
    const next = clone(model)
    next.visible = false
    next.traverse((object) => {
      if (object instanceof Mesh) {
        object.castShadow = true
        object.receiveShadow = true
        object.frustumCulled = false
      }
    })
    return next
  }, [model])

  const animationClips = useMemo(() => {
    const hipsRestHeight = getHipsRestHeight(idle.animations[0])
    const clips = [
      { source: idle.animations[0], name: 'idle' },
      { source: walk.animations[0], name: 'walk' },
      { source: run.animations[0], name: 'run' },
      { source: kick.animations[0], name: 'kick' },
      { source: wave.animations[0], name: 'wave' },
      { source: dance.animations[0], name: 'dance' },
      { source: pointingUp.animations[0], name: 'pointingUp' },
      { source: jumpStart.animations[0], name: 'jumpStart' },
      { source: jumpLoop.animations[0], name: 'fallingIdle' },
      { source: jumpLand.animations[0], name: 'jumpLand' },
      { source: sitDown.animations[0], name: 'sitDown' },
      { source: sittingIdle.animations[0], name: 'sittingIdle' },
      { source: standUp.animations[0], name: 'standUp' },
    ]

    return clips
      .filter(({ source }) => source)
      .map(({ source, name }) => {
        const clip = source.clone()
        clip.name = name
        if (name === 'wave' || name === 'dance' || name === 'pointingUp') {
          lockEmoteHipsHeight(clip, hipsRestHeight)
        }
        if (name === 'sitDown' || name === 'sittingIdle' || name === 'standUp') {
          lockHipsPlanarPosition(clip)
        }
        return clip
      })
  }, [idle.animations, walk.animations, run.animations, kick.animations, wave.animations, dance.animations, pointingUp.animations, jumpStart.animations, jumpLoop.animations, jumpLand.animations, sitDown.animations, sittingIdle.animations, standUp.animations])

  const { actions } = useAnimations(animationClips, avatar)
  const currentActionRef = useRef(null)
  const currentMotionRef = useRef(null)
  const revealFramesRef = useRef(0)

  const playMotion = (nextMotion) => {
    const nextAction = actions[nextMotion]
    const previousAction = currentActionRef.current
    const previousMotion = currentMotionRef.current

    if (!nextAction) return false

    if (previousAction === nextAction) return

    const isOneShot = nextMotion === 'kick' || nextMotion === 'pointingUp' || nextMotion === 'jumpStart' || nextMotion === 'jumpLand' || nextMotion === 'sitDown' || nextMotion === 'standUp'
    const fadeDuration =
      previousMotion === 'jumpStart' && nextMotion === 'fallingIdle'
        ? PLAYER_JUMP_TO_FALL_ANIMATION_FADE
        : nextMotion === 'sitDown' || nextMotion === 'standUp' || previousMotion === 'sittingIdle'
          ? 0.12
        : nextMotion === 'jumpLand'
        ? PLAYER_LANDING_ANIMATION_FADE
        : nextMotion === 'jumpStart' || nextMotion === 'fallingIdle'
          ? PLAYER_AIR_ANIMATION_FADE
          : PLAYER_DEFAULT_ANIMATION_FADE

    nextAction
      .reset()
      .setLoop(isOneShot ? LoopOnce : LoopRepeat, isOneShot ? 1 : Infinity)
      .setEffectiveWeight(1)
      .setEffectiveTimeScale(nextMotion === 'kick' ? 1.2 : 1)
      .play()
    nextAction.clampWhenFinished = isOneShot

    if (previousAction) {
      avatar.visible = true
      nextAction.crossFadeFrom(previousAction, fadeDuration, false)
    } else {
      nextAction.setEffectiveWeight(1)
      avatar.visible = false
      revealFramesRef.current = 2
    }

    currentActionRef.current = nextAction
    currentMotionRef.current = nextMotion
    return true
  }

  useFrame(() => {
    if (currentMotionRef.current !== motion) {
      playMotion(motion)
    }

    if (revealFramesRef.current <= 0) return
    revealFramesRef.current -= 1
    if (revealFramesRef.current <= 0 && currentActionRef.current) {
      avatar.visible = true
    }
  })

  return (
    <primitive
      object={avatar}
      position={[0, -PLAYER_HEIGHT + PLAYER_MODEL_VERTICAL_OFFSET, 0]}
      rotation={[0, 0, 0]}
      scale={PLAYER_MODEL_SCALE}
    />
  )
}

function ControlsOverlay({ touchRef, adminCameraControls = false, uiHidden = false }) {
  const joystickPointerIdRef = useRef(null)
  const lookPointerIdRef = useRef(null)
  const lookLastRef = useRef({ x: 0, y: 0 })
  const emoteTimerRef = useRef(null)
  const emotePressRef = useRef({ x: 0, y: 0, cancelled: false })
  const [stickVisual, setStickVisual] = useState({ x: 0, y: 0 })
  const [emoteMenu, setEmoteMenu] = useState(null)
  const [activeEmoteId, setActiveEmoteId] = useState(null)
  const [edgeGlow, setEdgeGlow] = useState({
    left: false,
    right: false,
    top: false,
    bottom: false,
  })

  useEffect(() => {
    return () => {
      if (emoteTimerRef.current) clearTimeout(emoteTimerRef.current)
    }
  }, [])

  const clearEmoteTimer = () => {
    if (!emoteTimerRef.current) return
    clearTimeout(emoteTimerRef.current)
    emoteTimerRef.current = null
  }

  const closeEmoteMenu = () => {
    clearEmoteTimer()
    setEmoteMenu(null)
    setActiveEmoteId(null)
  }

  const setJoystick = (event) => {
    const zone = event.currentTarget.getBoundingClientRect()
    const centerX = zone.left + zone.width / 2
    const centerY = zone.top + zone.height / 2
    const dx = event.clientX - centerX
    const dy = event.clientY - centerY
    const radius = zone.width * 0.36

    const distance = Math.hypot(dx, dy)
    const factor = distance > radius ? radius / distance : 1
    const clampedX = dx * factor
    const clampedY = dy * factor

    touchRef.current.moveX = clampedX / radius
    touchRef.current.moveY = -clampedY / radius
    setStickVisual({ x: clampedX, y: clampedY })
  }

  const resetJoystick = () => {
    touchRef.current.moveX = 0
    touchRef.current.moveY = 0
    setStickVisual({ x: 0, y: 0 })
    joystickPointerIdRef.current = null
  }

  const onJoystickDown = (event) => {
    joystickPointerIdRef.current = event.pointerId
    event.currentTarget.setPointerCapture(event.pointerId)
    setJoystick(event)
  }

  const onJoystickMove = (event) => {
    if (joystickPointerIdRef.current !== event.pointerId) return
    setJoystick(event)
  }

  const onJoystickUp = (event) => {
    if (joystickPointerIdRef.current !== event.pointerId) return
    resetJoystick()
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const onLookDown = (event) => {
    lookPointerIdRef.current = event.pointerId
    lookLastRef.current.x = event.clientX
    lookLastRef.current.y = event.clientY
    emotePressRef.current = { x: event.clientX, y: event.clientY, cancelled: false }
    event.currentTarget.setPointerCapture(event.pointerId)
    touchRef.current.lookActive = true
    touchRef.current.lookX = 0
    touchRef.current.lookY = 0
    setEdgeGlow({ left: false, right: false, top: false, bottom: false })
    clearEmoteTimer()
    emoteTimerRef.current = window.setTimeout(() => {
      if (lookPointerIdRef.current !== event.pointerId) return
      if (emotePressRef.current.cancelled) return
      touchRef.current.lookActive = false
      touchRef.current.lookX = 0
      touchRef.current.lookY = 0
      setEdgeGlow({ left: false, right: false, top: false, bottom: false })
      setActiveEmoteId(null)
      setEmoteMenu({ x: event.clientX, y: event.clientY })
    }, EMOTE_LONG_PRESS_MS)
  }

  const onLookMove = (event) => {
    if (lookPointerIdRef.current !== event.pointerId) return
    if (emoteMenu) {
      setActiveEmoteId(getEmoteSelection(event.clientX - emoteMenu.x, event.clientY - emoteMenu.y))
      return
    }

    const pressDx = event.clientX - emotePressRef.current.x
    const pressDy = event.clientY - emotePressRef.current.y
    if (Math.hypot(pressDx, pressDy) > EMOTE_CANCEL_DISTANCE) {
      emotePressRef.current.cancelled = true
      clearEmoteTimer()
    }

    const stepX = event.clientX - lookLastRef.current.x
    const stepY = event.clientY - lookLastRef.current.y
    touchRef.current.cameraYaw -= stepX * CAMERA_DRAG_SENSITIVITY
    touchRef.current.cameraPitch = MathUtils.clamp(
      touchRef.current.cameraPitch + stepY * CAMERA_DRAG_SENSITIVITY,
      -0.8,
      0.35,
    )

    const viewportW = window.innerWidth
    const viewportH = window.innerHeight
    const edgeLeft = event.clientX <= EDGE_TRIGGER_PX
    const edgeRight = event.clientX >= viewportW - EDGE_TRIGGER_PX
    const edgeTop = event.clientY <= EDGE_TRIGGER_PX
    const edgeBottom = event.clientY >= viewportH - EDGE_TRIGGER_PX

    touchRef.current.lookX = 0
    touchRef.current.lookY = 0

    if (edgeLeft) touchRef.current.lookX = -1
    if (edgeRight) touchRef.current.lookX = 1
    if (edgeTop) touchRef.current.lookY = -1
    if (edgeBottom) touchRef.current.lookY = 1

    setEdgeGlow({ left: edgeLeft, right: edgeRight, top: edgeTop, bottom: edgeBottom })

    lookLastRef.current.x = event.clientX
    lookLastRef.current.y = event.clientY
  }

  const onLookUp = (event) => {
    if (lookPointerIdRef.current !== event.pointerId) return
    const selectedEmoteId = emoteMenu ? activeEmoteId : null
    closeEmoteMenu()
    lookPointerIdRef.current = null
    touchRef.current.lookActive = false
    touchRef.current.lookX = 0
    touchRef.current.lookY = 0
    setEdgeGlow({ left: false, right: false, top: false, bottom: false })
    event.currentTarget.releasePointerCapture(event.pointerId)
    if (selectedEmoteId) {
      touchRef.current.emoteQueued = selectedEmoteId
    }
  }

  const onCameraWheel = (event) => {
    if (!adminCameraControls) return
    event.preventDefault()
    const currentDistance = touchRef.current.cameraDistance ?? CAMERA_DISTANCE
    const zoomFactor = 1 + event.deltaY * CAMERA_WHEEL_ZOOM_SENSITIVITY
    touchRef.current.cameraDistance = MathUtils.clamp(
      currentDistance * zoomFactor,
      CAMERA_MIN_DISTANCE,
      CAMERA_MAX_DISTANCE,
    )
  }

  const triggerAction = () => {
    touchRef.current.actionQueued = true
  }

  return (
    <div className="hud">
      <div
        className="camera-pad"
        onPointerDown={onLookDown}
        onPointerMove={onLookMove}
        onPointerUp={onLookUp}
        onPointerCancel={onLookUp}
        onWheel={onCameraWheel}
      >
        {!uiHidden && <div className={`edge-glow right ${edgeGlow.right ? 'active' : ''}`} />}
        {!uiHidden && <div className={`edge-glow left ${edgeGlow.left ? 'active' : ''}`} />}
        {!uiHidden && <div className={`edge-glow top ${edgeGlow.top ? 'active' : ''}`} />}
        {!uiHidden && <div className={`edge-glow bottom ${edgeGlow.bottom ? 'active' : ''}`} />}
        {!uiHidden && emoteMenu && (
          <div
            className="emote-radial"
            style={{ left: emoteMenu.x, top: emoteMenu.y }}
          >
            {emotes.map((emote, index) => (
              <div
                key={emote.id}
                className={`emote-choice ${activeEmoteId === emote.id ? 'active' : ''}`}
                style={{
                  '--emote-x': `${Math.cos(getEmoteAngle(index, emotes.length)) * EMOTE_MENU_RADIUS}px`,
                  '--emote-y': `${Math.sin(getEmoteAngle(index, emotes.length)) * EMOTE_MENU_RADIUS}px`,
                }}
                aria-label={emote.label}
              >
                <span className="emote-glyph">{emote.glyph}</span>
              </div>
            ))}
            <div className="emote-deadzone" />
            <div className="emote-anchor" />
          </div>
        )}
      </div>

      {!uiHidden && (
        <div className="joystick-wrap">
          <div
            className="joystick-zone"
            onPointerDown={onJoystickDown}
            onPointerMove={onJoystickMove}
            onPointerUp={onJoystickUp}
            onPointerCancel={onJoystickUp}
          >
            <div
              className="joystick-thumb"
              style={{
                transform: `translate(${stickVisual.x}px, ${stickVisual.y}px)`,
              }}
            />
          </div>
        </div>
      )}

      {!uiHidden && (
        <button className="action-btn" type="button" onPointerDown={triggerAction} aria-label="Action">
          <span className="action-symbol">{'\u2423'}</span>
        </button>
      )}
    </div>
  )
}

function CoinsOverlay({ coins }) {
  return (
    <div className="score-wrap">
      <div className="score">
        <img className="score-coin-icon" src="/ui/coins.png" alt="Pieces" />
        <span className="score-value">{coins}</span>
      </div>
    </div>
  )
}

function AccountSyncPanel({
  configured,
  user,
  email,
  password,
  displayName,
  mode,
  open,
  message,
  saveState,
  onToggle,
  onEmailChange,
  onPasswordChange,
  onDisplayNameChange,
  onModeChange,
  onSubmit,
  onSignOut,
}) {
  const isConnected = Boolean(user)
  const statusText = configured
    ? isConnected
      ? 'Compte connecte'
      : 'Mode invite'
    : 'Supabase non configure'

  return (
    <div className={`account-sync ${open ? 'open' : ''}`}>
      <button className="account-sync-toggle" type="button" onClick={onToggle} aria-label="Compte">
        <span className={`account-sync-dot ${isConnected ? 'connected' : ''}`} />
        <span>Compte</span>
      </button>
      {open && (
        <div className="account-sync-panel">
          <div className="account-sync-status">
            {statusText}
            <span>{saveState}</span>
          </div>
          {!isConnected && (
            <p className="account-sync-help">
              Ta progression invite reste sur cet appareil. Cree un compte pour la sauvegarder en ligne.
            </p>
          )}
          {configured && !isConnected && (
            <>
              <div className="account-sync-tabs">
                <button
                  type="button"
                  className={mode === 'signup' ? 'active' : ''}
                  onClick={() => onModeChange('signup')}
                >
                  Creer
                </button>
                <button
                  type="button"
                  className={mode === 'signin' ? 'active' : ''}
                  onClick={() => onModeChange('signin')}
                >
                  Connexion
                </button>
              </div>
              <form className="account-sync-form" onSubmit={onSubmit}>
                {mode === 'signup' && (
                  <input
                    type="text"
                    value={displayName}
                    onChange={(event) => onDisplayNameChange(event.target.value)}
                    placeholder="Pseudo"
                    aria-label="Pseudo"
                    minLength={2}
                    required
                  />
                )}
                <input
                  type="email"
                  value={email}
                  onChange={(event) => onEmailChange(event.target.value)}
                  placeholder="Email"
                  aria-label="Email"
                  required
                />
                <input
                  type="password"
                  value={password}
                  onChange={(event) => onPasswordChange(event.target.value)}
                  placeholder="Mot de passe"
                  aria-label="Mot de passe"
                  minLength={8}
                  required
                />
                <button type="submit">
                  {mode === 'signup' ? 'Creer mon compte' : 'Se connecter'}
                </button>
              </form>
              <div className="account-sync-social">
                <button type="button" disabled>Google bientot</button>
                <button type="button" disabled>Apple bientot</button>
              </div>
            </>
          )}
          {configured && isConnected && (
            <>
              <div className="account-sync-help">
                {displayName || user.email}
                <br />
                Progression sauvegardee en ligne.
              </div>
              <button className="account-sync-out" type="button" onClick={onSignOut}>
                Deconnexion
              </button>
            </>
          )}
          {message && <div className="account-sync-message">{message}</div>}
        </div>
      )}
    </div>
  )
}

function SkinStation() {
  return (
    <group position={[SKIN_STATION_POSITION.x, SKIN_STATION_POSITION.y, SKIN_STATION_POSITION.z]}>
      <mesh position={[0, -0.32, 0]}>
        <cylinderGeometry args={[0.6, 0.6, 0.16, 20]} />
        <meshStandardMaterial color="#d7dde5" />
      </mesh>
    </group>
  )
}

function EnvironmentStation() {
  return (
    <group position={[ENV_STATION_POSITION.x, ENV_STATION_POSITION.y, ENV_STATION_POSITION.z]}>
      <mesh position={[0, -0.32, 0]}>
        <cylinderGeometry args={[0.6, 0.6, 0.16, 20]} />
        <meshStandardMaterial color="#d0d8e3" />
      </mesh>
    </group>
  )
}

function CustomizationStation() {
  return (
    <group position={[CUSTOM_STATION_POSITION.x, CUSTOM_STATION_POSITION.y, CUSTOM_STATION_POSITION.z]}>
      <mesh position={[0, -0.32, 0]}>
        <cylinderGeometry args={[0.68, 0.68, 0.16, 24]} />
        <meshStandardMaterial color="#c9d8e6" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.22, 0]}>
        <ringGeometry args={[0.42, 0.5, 32]} />
        <meshBasicMaterial color="#f2c14e" />
      </mesh>
    </group>
  )
}

function SkinStationTrigger({ playerPositionRef, onNearChange }) {
  const wasNearRef = useRef(false)

  useFrame(() => {
    const p = playerPositionRef.current
    const d = Math.hypot(p.x - SKIN_STATION_POSITION.x, p.z - SKIN_STATION_POSITION.z)
    const near = d < 1.45
    if (near !== wasNearRef.current) {
      wasNearRef.current = near
      onNearChange(near)
    }
  })

  return null
}

function EnvironmentStationTrigger({ playerPositionRef, onNearChange }) {
  const wasNearRef = useRef(false)

  useFrame(() => {
    const p = playerPositionRef.current
    const d = Math.hypot(p.x - ENV_STATION_POSITION.x, p.z - ENV_STATION_POSITION.z)
    const near = d < 1.45
    if (near !== wasNearRef.current) {
      wasNearRef.current = near
      onNearChange(near)
    }
  })

  return null
}

function CustomizationStationTrigger({ playerPositionRef, onNearChange, enabled }) {
  const wasNearRef = useRef(false)

  useFrame(() => {
    if (!enabled) {
      if (wasNearRef.current) {
        wasNearRef.current = false
        onNearChange(false)
      }
      return
    }

    const p = playerPositionRef.current
    const d = Math.hypot(p.x - CUSTOM_STATION_POSITION.x, p.z - CUSTOM_STATION_POSITION.z)
    const near = d < 1.55
    if (near !== wasNearRef.current) {
      wasNearRef.current = near
      onNearChange(near)
    }
  })

  return null
}

function SeatInteractionTrigger({ playerPositionRef, objects, seatedState, onNearbySeatChange }) {
  const currentSeatIdRef = useRef(null)

  useFrame(() => {
    if (seatedState?.phase) {
      if (currentSeatIdRef.current !== null) {
        currentSeatIdRef.current = null
        onNearbySeatChange(null)
      }
      return
    }

    const playerPosition = playerPositionRef.current
    let nearestSeat = null
    let nearestDistance = Infinity

    objects.forEach((object) => {
      object.seats?.forEach((seat) => {
        const worldSeat = getSeatWorldData(object, seat)
        const interactionDistance = seat.interactionDistance ?? SEAT_INTERACTION_DISTANCE
        const distance = Math.hypot(
          playerPosition.x - worldSeat.position[0],
          playerPosition.z - worldSeat.position[2],
        )

        if (distance <= interactionDistance && distance < nearestDistance) {
          nearestDistance = distance
          nearestSeat = worldSeat
        }
      })
    })

    const nextSeat = nearestSeat
    if ((nextSeat?.id ?? null) !== currentSeatIdRef.current) {
      currentSeatIdRef.current = nextSeat?.id ?? null
      onNearbySeatChange(nextSeat)
    }
  })

  return null
}

function TvInteractionTrigger({ playerPositionRef, objects, enabled, onNearbyTvChange }) {
  const currentTvIdRef = useRef(null)

  useFrame(() => {
    if (!enabled) {
      if (currentTvIdRef.current !== null) {
        currentTvIdRef.current = null
        onNearbyTvChange(null)
      }
      return
    }

    const playerPosition = playerPositionRef.current
    let nearestTv = null
    let nearestDistance = Infinity

    objects.forEach((object) => {
      const catalogItem = objectCatalog[object.objectId]
      if (catalogItem?.type !== 'interactive_tv' || !object.position) return

      const distance = Math.hypot(
        playerPosition.x - object.position[0],
        playerPosition.z - object.position[2],
      )

      if (distance <= TV_INTERACTION_DISTANCE && distance < nearestDistance) {
        nearestDistance = distance
        nearestTv = object
      }
    })

    const nextTvId = nearestTv?.id ?? null
    if (nextTvId !== currentTvIdRef.current) {
      currentTvIdRef.current = nextTvId
      onNearbyTvChange(nearestTv)
    }
  })

  return null
}

function SeatTargetMarker({ seat }) {
  if (!seat) return null

  return (
    <group position={[seat.position[0], 0.58, seat.position[2]]}>
      <mesh>
        <sphereGeometry args={[0.08, 16, 12]} />
        <meshBasicMaterial color="#ffd447" />
      </mesh>
      <pointLight intensity={0.5} distance={1.2} color="#ffd447" />
    </group>
  )
}

function CustomizationCamera({ active }) {
  if (!active) return null

  return (
    <OrthographicCamera
      makeDefault
      position={[0, 18, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      zoom={58}
      near={0.1}
      far={60}
    />
  )
}

function SofaModel() {
  const model = useFBX('/models/placeables/modular-sofa/modular-sofa.fbx')
  const texture = useTexture('/models/placeables/modular-sofa/tripo_convert_9412eb1b-7c85-49b7-86b8-96b1b5cc9732.fbm/modularsofa3dmodel_basecolor.JPEG')
  const sofa = useMemo(() => {
    const object = clone(model)
    texture.colorSpace = SRGBColorSpace
    texture.needsUpdate = true

    object.traverse((child) => {
      if (child instanceof Mesh) {
        child.castShadow = true
        child.receiveShadow = true
        if (child.material) {
          child.material = child.material.clone()
          child.material.map = texture
          child.material.needsUpdate = true
        }
      }
    })

    object.updateWorldMatrix(true, true)
    const box = new Box3().setFromObject(object)
    const size = box.getSize(new Vector3())
    const center = box.getCenter(new Vector3())
    const longestSide = Math.max(size.x, size.z, 0.001)
    const targetWidth = SOFA_WIDTH_METERS * WORLD_UNITS_PER_METER
    const scale = targetWidth / longestSide

    return {
      object,
      offset: [-center.x, -box.min.y, -center.z],
      scale,
    }
  }, [model, texture])

  return (
    <group scale={sofa.scale}>
      <primitive object={sofa.object} position={sofa.offset} />
    </group>
  )
}

function GlbPlaceableModel({ objectId }) {
  const catalogItem = objectCatalog[objectId]
  const gltf = useGLTF(catalogItem.modelUrl)
  const model = useMemo(() => {
    const object = clone(gltf.scene)

    object.traverse((child) => {
      if (child instanceof Mesh) {
        child.castShadow = true
        child.receiveShadow = true
      }
    })

    object.updateWorldMatrix(true, true)
    const box = new Box3().setFromObject(object)
    const size = box.getSize(new Vector3())
    const center = box.getCenter(new Vector3())
    const targetWidth = (catalogItem.targetWidthMeters ?? 0) * WORLD_UNITS_PER_METER
    const targetHeight = (catalogItem.targetHeightMeters ?? 0) * WORLD_UNITS_PER_METER
    const horizontalSize = Math.max(size.x, size.z, 0.001)
    const sourceSize = targetHeight > 0 ? Math.max(size.y, 0.001) : horizontalSize
    const targetSize = targetHeight > 0 ? targetHeight : targetWidth
    const scale = targetSize > 0 ? targetSize / sourceSize : 1

    return {
      object,
      offset: [-center.x, -box.min.y, -center.z],
      scale,
    }
  }, [catalogItem.targetHeightMeters, catalogItem.targetWidthMeters, gltf.scene])

  return (
    <group scale={model.scale} rotation={[0, catalogItem.modelRotationY ?? 0, 0]}>
      <primitive object={model.object} position={model.offset} />
    </group>
  )
}

function getNamedScreenInfo(object, offset, screenName = 'TV_SCREEN') {
  const screen = object.getObjectByName(screenName)
  if (!screen) return null

  object.updateWorldMatrix(true, true)
  screen.updateWorldMatrix(true, false)

  const position = new Vector3()
  const quaternion = new Quaternion()
  const scale = new Vector3()
  screen.matrixWorld.decompose(position, quaternion, scale)

  let width = 1
  let height = 0.56
  let screenQuaternion = quaternion.clone()
  const screenBox = new Box3().setFromObject(screen)
  if (!screenBox.isEmpty()) {
    position.copy(screenBox.getCenter(new Vector3()))
  }

  if (screen.geometry) {
    screen.geometry.computeBoundingBox()
    const size = new Vector3()
    screen.geometry.boundingBox.getSize(size)
    const dimensions = [
      { axis: new Vector3(1, 0, 0).applyQuaternion(quaternion).normalize(), size: Math.abs(size.x * scale.x) },
      { axis: new Vector3(0, 1, 0).applyQuaternion(quaternion).normalize(), size: Math.abs(size.y * scale.y) },
      { axis: new Vector3(0, 0, 1).applyQuaternion(quaternion).normalize(), size: Math.abs(size.z * scale.z) },
    ].sort((a, b) => b.size - a.size)
    const widthDimension = dimensions[0]
    const heightDimension = dimensions[1]
    const normalDimension = dimensions[2]
    const normalAxis = new Vector3().crossVectors(widthDimension.axis, heightDimension.axis).normalize()
    if (normalAxis.dot(normalDimension.axis) < 0) normalAxis.negate()
    const basis = new Matrix4().makeBasis(widthDimension.axis, heightDimension.axis, normalAxis)
    screenQuaternion = new Quaternion().setFromRotationMatrix(basis)
    width = Math.max(widthDimension.size, 0.01)
    height = Math.max(heightDimension.size, 0.01)
  } else if (!screenBox.isEmpty()) {
    const worldSize = screenBox.getSize(new Vector3())
    const dimensions = [worldSize.x, worldSize.y, worldSize.z].sort((a, b) => b - a)
    width = Math.max(dimensions[0], 0.01)
    height = Math.max(dimensions[1], 0.01)
  }

  screen.traverse((child) => {
    child.visible = false
  })

  const normal = new Vector3(0, 0, 1).applyQuaternion(screenQuaternion)
  position.add(new Vector3(offset[0], offset[1], offset[2]))
  position.add(normal.multiplyScalar(0.008))

  return {
    position: position.toArray(),
    quaternion: screenQuaternion,
    width,
    height,
  }
}

function InteractiveTvModel({ objectId, placedObjectId }) {
  const catalogItem = objectCatalog[objectId]
  const gltf = useGLTF(catalogItem.modelUrl)
  const model = useMemo(() => {
    const object = clone(gltf.scene)

    object.traverse((child) => {
      if (child instanceof Mesh) {
        child.castShadow = true
        child.receiveShadow = true
      }
    })

    object.updateWorldMatrix(true, true)
    const box = new Box3().setFromObject(object)
    const size = box.getSize(new Vector3())
    const center = box.getCenter(new Vector3())
    const targetWidth = (catalogItem.targetWidthMeters ?? 0) * WORLD_UNITS_PER_METER
    const horizontalSize = Math.max(size.x, size.z, 0.001)
    const scale = targetWidth > 0 ? targetWidth / horizontalSize : 1
    const offset = [-center.x, -box.min.y, -center.z]
    const namedScreenInfo = getNamedScreenInfo(object, offset, catalogItem.screenName ?? 'TV_SCREEN')
    const fallbackScreen = catalogItem.screen
    const fallbackScreenInfo = fallbackScreen
      ? {
          position: fallbackScreen.position ?? [0.045, 0.78, 0],
          quaternion: new Quaternion().setFromEuler(new Euler(
            fallbackScreen.rotation?.[0] ?? 0,
            fallbackScreen.rotation?.[1] ?? Math.PI / 2,
            fallbackScreen.rotation?.[2] ?? 0,
          )),
          width: fallbackScreen.size?.[0] ?? 1.16,
          height: fallbackScreen.size?.[1] ?? 0.65,
        }
      : null

    return {
      object,
      offset,
      scale,
      screenInfo: namedScreenInfo ?? fallbackScreenInfo,
    }
  }, [catalogItem.screen, catalogItem.screenName, catalogItem.targetWidthMeters, gltf.scene])

  return (
    <group scale={model.scale} rotation={[0, catalogItem.modelRotationY ?? 0, 0]}>
      <primitive object={model.object} position={model.offset} />
      {model.screenInfo && (
        <InteractiveTvScreen screenInfo={model.screenInfo} tvInstanceId={placedObjectId} />
      )}
    </group>
  )
}

function PlaceableModel({ objectId, type, placedObjectId }) {
  const catalogItem = objectCatalog[objectId]
  if (type === 'goal' || catalogItem?.type === 'goal') return <GoalVisual />
  if (catalogItem?.type === 'interactive_tv') return <InteractiveTvModel objectId={objectId} placedObjectId={placedObjectId} />
  if (catalogItem?.modelUrl) return <GlbPlaceableModel objectId={objectId} />
  if (type === 'sofa' || catalogItem?.type === 'sofa') return <SofaModel />
  return null
}

function getYouTubeEmbedUrl(rawUrl) {
  const value = rawUrl.trim()
  if (!value) return null

  try {
    const url = new URL(value.includes('://') ? value : `https://${value}`)
    const host = url.hostname.replace(/^www\./, '')
    let videoId = ''

    if (host === 'youtu.be') {
      videoId = url.pathname.split('/').filter(Boolean)[0] ?? ''
    } else if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      if (url.pathname.startsWith('/watch')) {
        videoId = url.searchParams.get('v') ?? ''
      } else if (url.pathname.startsWith('/embed/') || url.pathname.startsWith('/shorts/')) {
        videoId = url.pathname.split('/').filter(Boolean)[1] ?? ''
      }
    }

    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) return null

    const embedUrl = new URL(`https://www.youtube.com/embed/${videoId}`)
    embedUrl.searchParams.set('autoplay', '1')
    embedUrl.searchParams.set('playsinline', '1')
    embedUrl.searchParams.set('enablejsapi', '1')
    if (typeof window !== 'undefined') {
      embedUrl.searchParams.set('origin', window.location.origin)
    }
    return embedUrl.toString()
  } catch {
    return null
  }
}

function escapeHtmlAttribute(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function InteractiveTvScreen({ screenInfo, tvInstanceId }) {
  const [texture, setTexture] = useState(null)
  const [captureState, setCaptureState] = useState('off')
  const [tvMenuOpen, setTvMenuOpen] = useState(false)
  const [tvOnlinePanelOpen, setTvOnlinePanelOpen] = useState(false)
  const [tvOnlineUrl, setTvOnlineUrl] = useState('')
  const [tvOnlineEmbedUrl, setTvOnlineEmbedUrl] = useState('')
  const [tvOnlineMessage, setTvOnlineMessage] = useState('')
  const [tvVolume, setTvVolume] = useState(1)
  const [tvPoweredOn, setTvPoweredOn] = useState(true)
  const [tvPaused, setTvPaused] = useState(false)
  const streamRef = useRef(null)
  const videoRef = useRef(null)
  const youtubeFrameRef = useRef(null)
  const audioContextRef = useRef(null)
  const audioSourceRef = useRef(null)
  const audioGainRef = useRef(null)
  const textureRef = useRef(null)
  const materialRef = useRef(null)
  const objectUrlRef = useRef(null)
  const fittedMediaRef = useRef(null)
  const screenGroupRef = useRef(null)
  const interactionLockRef = useRef(false)
  const mobileFileInputRef = useRef(null)
  const handleFileChangeRef = useRef(null)
  const fileSelectionKeyRef = useRef('')
  const soundUnlockPendingRef = useRef(false)
  const tvMenuElementRef = useRef(null)
  const tvMenuCallbacksRef = useRef({})
  const { camera, gl } = useThree()
  const isMobileMediaMode = useMemo(() => {
    if (typeof navigator === 'undefined') return false
    return /android|iphone|ipad|ipod/i.test(navigator.userAgent) || !navigator.mediaDevices?.getDisplayMedia
  }, [])
  const cssScreenWidth = 1280
  const cssScreenHeight = Math.max(1, Math.round(cssScreenWidth * ((screenInfo?.height ?? 0.5625) / (screenInfo?.width ?? 1))))

  const resetAudioGraph = () => {
    audioSourceRef.current?.disconnect()
    audioGainRef.current?.disconnect()
    audioSourceRef.current = null
    audioGainRef.current = null
  }

  const ensureAudioGraph = (video = videoRef.current) => {
    if (!video || audioGainRef.current) return audioGainRef.current
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (!AudioContextClass) return null
    try {
      const context = audioContextRef.current ?? new AudioContextClass()
      audioContextRef.current = context
      const source = context.createMediaElementSource(video)
      const gain = context.createGain()
      source.connect(gain)
      gain.connect(context.destination)
      audioSourceRef.current = source
      audioGainRef.current = gain
      return gain
    } catch (error) {
      console.warn('TV audio graph setup failed', error)
      return null
    }
  }

  const applyVideoVolume = (nextVolume) => {
    const video = videoRef.current
    if (!video) return
    const safeVolume = MathUtils.clamp(nextVolume, 0, 1)
    try {
      video.muted = safeVolume <= 0
      const gain = ensureAudioGraph(video)
      if (gain) {
        gain.gain.value = safeVolume
      } else if (!isMobileMediaMode) {
        video.volume = safeVolume
      }
      if (safeVolume > 0) {
        audioContextRef.current?.resume?.().catch((error) => {
          console.warn('TV audio context resume failed', error)
        })
        video.play().catch((error) => {
          console.warn('TV audio play failed', error)
        })
      }
    } catch (error) {
      console.warn('TV volume update failed', error)
    }
  }

  const prepareVideoAudio = (video, shouldStartMuted) => {
    try {
      video.muted = shouldStartMuted
    } catch (error) {
      console.warn('TV muted setup failed', error)
    }
    if (!isMobileMediaMode) {
      try {
        video.volume = tvVolume
      } catch (error) {
        console.warn('TV volume setup failed', error)
      }
    }
  }

  const postYouTubeCommand = (func, args = []) => {
    const frameWindow = youtubeFrameRef.current?.contentWindow
    if (!frameWindow) return
    frameWindow.postMessage(JSON.stringify({
      event: 'command',
      func,
      args,
    }), 'https://www.youtube.com')
  }

  const applyYouTubeVolume = (nextVolume) => {
    const percent = Math.round(MathUtils.clamp(nextVolume, 0, 1) * 100)
    postYouTubeCommand('setVolume', [percent])
    postYouTubeCommand(percent <= 0 ? 'mute' : 'unMute')
  }

  const drawFittedMedia = (fittedMedia) => {
    const { canvas, context, source, sourceWidth, sourceHeight, texture: fittedTexture } = fittedMedia
    if (!context) return
    if (source instanceof HTMLVideoElement && source.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return
    const safeSourceWidth = Math.max(sourceWidth, 1)
    const safeSourceHeight = Math.max(sourceHeight, 1)
    const canvasAspect = canvas.width / canvas.height
    const sourceAspect = safeSourceWidth / safeSourceHeight
    let drawWidth = canvas.width
    let drawHeight = canvas.height

    if (sourceAspect > canvasAspect) {
      drawHeight = drawWidth / sourceAspect
    } else {
      drawWidth = drawHeight * sourceAspect
    }

    context.fillStyle = '#000000'
    context.fillRect(0, 0, canvas.width, canvas.height)
    try {
      context.drawImage(
        source,
        (canvas.width - drawWidth) / 2,
        (canvas.height - drawHeight) / 2,
        drawWidth,
        drawHeight,
      )
      fittedTexture.needsUpdate = true
    } catch (error) {
      console.warn('TV media draw failed', error)
    }
  }

  const getEventClientPoint = (event) => {
    const touch = event.touches?.[0] ?? event.changedTouches?.[0]
    if (touch) return { x: touch.clientX, y: touch.clientY }
    if (Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
      return { x: event.clientX, y: event.clientY }
    }
    return null
  }

  const isPointerInsideScreen = (event) => {
    const group = screenGroupRef.current
    if (!group) return false
    const point = getEventClientPoint(event)
    if (!point) return false

    group.updateWorldMatrix(true, false)
    const rect = gl.domElement.getBoundingClientRect()
    const localCorners = [
      new Vector3(-screenInfo.width / 2, -screenInfo.height / 2, 0),
      new Vector3(screenInfo.width / 2, -screenInfo.height / 2, 0),
      new Vector3(screenInfo.width / 2, screenInfo.height / 2, 0),
      new Vector3(-screenInfo.width / 2, screenInfo.height / 2, 0),
    ]
    const corners = localCorners.map((corner) => {
      const projected = corner.applyMatrix4(group.matrixWorld).project(camera)
      return {
        x: rect.left + ((projected.x + 1) / 2) * rect.width,
        y: rect.top + ((1 - projected.y) / 2) * rect.height,
      }
    })
    let inside = false
    for (let i = 0, j = corners.length - 1; i < corners.length; j = i, i += 1) {
      const current = corners[i]
      const previous = corners[j]
      const intersects = ((current.y > point.y) !== (previous.y > point.y))
        && point.x < ((previous.x - current.x) * (point.y - current.y)) / (previous.y - current.y) + current.x
      if (intersects) inside = !inside
    }
    return inside
  }

  const triggerScreenInteraction = (event) => {
    event?.stopPropagation?.()
    if (interactionLockRef.current) return
    interactionLockRef.current = true
    window.setTimeout(() => {
      interactionLockRef.current = false
    }, 250)

    handleActiveScreenClick(event)
  }

  const statusLabel = {
    off: isMobileMediaMode ? 'Touchez pour choisir' : 'Touchez pour allumer',
    requesting: 'Choisissez un onglet',
    warming: 'Chargement',
    denied: 'Partage refuse',
    insecure: 'HTTPS requis',
    mobile: 'Touchez pour choisir',
    unsupported: 'Non supporte',
    error: 'Reessayer',
  }[captureState] ?? 'Touchez pour allumer'

  const standbyTexture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = cssScreenWidth
    canvas.height = cssScreenHeight
    const context = canvas.getContext('2d')
    if (context) {
      const centerX = canvas.width / 2
      const centerY = canvas.height / 2
      context.fillStyle = '#020305'
      context.fillRect(0, 0, canvas.width, canvas.height)
      const glow = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, canvas.width * 0.55)
      glow.addColorStop(0, 'rgba(52, 140, 190, 0.2)')
      glow.addColorStop(0.45, 'rgba(14, 26, 38, 0.5)')
      glow.addColorStop(1, 'rgba(0, 0, 0, 0)')
      context.fillStyle = glow
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.fillStyle = '#f8fbff'
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      context.font = '900 68px Segoe UI, Arial, sans-serif'
      context.fillText(statusLabel, centerX, centerY)
      context.fillStyle = 'rgba(248, 251, 255, 0.55)'
      context.font = '500 30px Segoe UI, Arial, sans-serif'
      context.fillText(isMobileMediaMode ? 'Photo ou video' : 'Partage d onglet', centerX, centerY + 86)
    }
    const nextTexture = new CanvasTexture(canvas)
    nextTexture.colorSpace = SRGBColorSpace
    nextTexture.minFilter = LinearFilter
    nextTexture.magFilter = LinearFilter
    nextTexture.generateMipmaps = false
    nextTexture.needsUpdate = true
    return nextTexture
  }, [captureState, cssScreenHeight, isMobileMediaMode])

  useFrame(() => {
    if (fittedMediaRef.current?.isVideo) {
      drawFittedMedia(fittedMediaRef.current)
    }
    if (textureRef.current) {
      textureRef.current.needsUpdate = true
    }
    if (materialRef.current) {
      materialRef.current.needsUpdate = true
    }
  })

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      videoRef.current?.pause()
      videoRef.current = null
      resetAudioGraph()
      audioContextRef.current?.close?.()
      audioContextRef.current = null
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = null
      }
      fittedMediaRef.current = null
      mobileFileInputRef.current?.remove()
      mobileFileInputRef.current = null
      tvMenuElementRef.current?.remove()
      tvMenuElementRef.current = null
      setTvMenuOpen(false)
      setTvOnlinePanelOpen(false)
      setTexture((currentTexture) => {
        currentTexture?.dispose()
        textureRef.current = null
        return null
      })
    }
  }, [])

  useEffect(() => {
    return () => {
      standbyTexture.dispose()
    }
  }, [standbyTexture])

  useEffect(() => {
    const handleDocumentScreenPress = (event) => {
      if (event.button && event.button !== 0) return
      if (!isPointerInsideScreen(event)) return
      if (isMobileMediaMode && event.type === 'pointerdown' && event.pointerType === 'touch') return
      event.preventDefault?.()
      triggerScreenInteraction(event)
    }

    document.addEventListener('pointerdown', handleDocumentScreenPress, { capture: true })
    document.addEventListener('touchend', handleDocumentScreenPress, { capture: true, passive: false })
    document.addEventListener('click', handleDocumentScreenPress, { capture: true })
    return () => {
      document.removeEventListener('pointerdown', handleDocumentScreenPress, { capture: true })
      document.removeEventListener('touchend', handleDocumentScreenPress, { capture: true })
      document.removeEventListener('click', handleDocumentScreenPress, { capture: true })
    }
  })

  useEffect(() => {
    const handleOpenMenuRequest = (event) => {
      const requestedObjectId = event.detail?.objectId
      if (requestedObjectId && tvInstanceId && requestedObjectId !== tvInstanceId) return
      setTvMenuOpen(true)
      setTvOnlinePanelOpen(false)
      setTvOnlineMessage('')
    }

    window.addEventListener(TV_MENU_EVENT, handleOpenMenuRequest)
    return () => window.removeEventListener(TV_MENU_EVENT, handleOpenMenuRequest)
  }, [tvInstanceId])

  useEffect(() => {
    if (!tvMenuOpen) {
      tvMenuElementRef.current?.remove()
      tvMenuElementRef.current = null
      return undefined
    }

    const menu = document.createElement('div')
    menu.className = 'tv-control-menu'
    const onActiveClass = tvPoweredOn ? ' is-active' : ''
    const offActiveClass = !tvPoweredOn ? ' is-active' : ''
    const mediaActiveClass = texture && tvPoweredOn ? ' is-active' : ''
    const onlineActiveClass = tvOnlineEmbedUrl && tvPoweredOn ? ' is-active' : ''
    const pauseLabel = tvPaused ? 'Play' : 'Pause'
    menu.innerHTML = `
      <div class="tv-control-row">
        <button type="button" class="${onActiveClass}" data-tv-action="on">On</button>
        <button type="button" class="${offActiveClass}" data-tv-action="off">Off</button>
        <button type="button" data-tv-action="pause">${pauseLabel}</button>
        <button type="button" class="${mediaActiveClass}" data-tv-action="change">Fichier</button>
        <button type="button" class="${onlineActiveClass}" data-tv-action="online">Video en ligne</button>
        <button type="button" data-tv-action="volumeDown">Volume -</button>
        <span class="tv-volume-readout">${Math.round(tvVolume * 100)}%</span>
        <button type="button" data-tv-action="volumeUp">Volume +</button>
        <button type="button" class="tv-menu-close" data-tv-action="close" aria-label="Fermer">×</button>
      </div>
      ${tvOnlinePanelOpen ? `
        <form class="tv-online-form" data-tv-online-form>
          <input
            type="url"
            name="youtubeUrl"
            value="${escapeHtmlAttribute(tvOnlineUrl)}"
            placeholder="Lien YouTube"
            autocomplete="off"
          />
          <button type="submit">Lire</button>
        </form>
        ${tvOnlineMessage ? `<span class="tv-online-message">${tvOnlineMessage}</span>` : ''}
      ` : ''}
    `
    const stopMenuEvent = (event) => {
      event.stopPropagation()
      if (!event.target?.closest?.('input, form')) {
        event.preventDefault?.()
      }
    }
    const handleMenuClick = (event) => {
      const action = event.target?.dataset?.tvAction
      if (!action) return
      event.preventDefault()
      event.stopPropagation()
      tvMenuCallbacksRef.current[action]?.(event)
    }
    const handleMenuSubmit = (event) => {
      event.preventDefault()
      event.stopPropagation()
      const form = event.target
      if (!form.matches('[data-tv-online-form]')) return
      const url = form.elements.youtubeUrl?.value ?? ''
      tvMenuCallbacksRef.current.submitOnline?.(url)
    }
    menu.addEventListener('pointerdown', stopMenuEvent)
    menu.addEventListener('touchend', stopMenuEvent)
    menu.addEventListener('dblclick', stopMenuEvent)
    menu.addEventListener('click', handleMenuClick)
    menu.addEventListener('submit', handleMenuSubmit)
    document.body.appendChild(menu)
    tvMenuElementRef.current = menu
    if (tvOnlinePanelOpen) {
      menu.querySelector('input[name="youtubeUrl"]')?.focus()
    }

    return () => {
      menu.removeEventListener('pointerdown', stopMenuEvent)
      menu.removeEventListener('touchend', stopMenuEvent)
      menu.removeEventListener('dblclick', stopMenuEvent)
      menu.removeEventListener('click', handleMenuClick)
      menu.removeEventListener('submit', handleMenuSubmit)
      menu.remove()
      if (tvMenuElementRef.current === menu) {
        tvMenuElementRef.current = null
      }
    }
  }, [texture, tvMenuOpen, tvOnlineEmbedUrl, tvOnlineMessage, tvOnlinePanelOpen, tvOnlineUrl, tvPaused, tvVolume, tvPoweredOn])

  if (!screenInfo) return null

  const createFittedTexture = (source, sourceWidth, sourceHeight, isVideo = false) => {
    const canvas = document.createElement('canvas')
    canvas.width = cssScreenWidth
    canvas.height = cssScreenHeight
    const context = canvas.getContext('2d')
    const nextTexture = new CanvasTexture(canvas)
    nextTexture.colorSpace = SRGBColorSpace
    nextTexture.minFilter = LinearFilter
    nextTexture.magFilter = LinearFilter
    nextTexture.generateMipmaps = false
    const fittedMedia = {
      canvas,
      context,
      source,
      sourceWidth,
      sourceHeight,
      texture: nextTexture,
      isVideo,
    }
    drawFittedMedia(fittedMedia)
    fittedMediaRef.current = fittedMedia
    return nextTexture
  }

  const waitForVideoReady = (video, eventName, isReady, timeoutMs = 2500) => {
    if (isReady()) return Promise.resolve()
    return new Promise((resolve, reject) => {
      let timeoutId = null
      const cleanup = () => {
        video.removeEventListener(eventName, handleReady)
        video.removeEventListener('error', handleError)
        if (timeoutId) window.clearTimeout(timeoutId)
      }
      const handleReady = () => {
        cleanup()
        resolve()
      }
      const handleError = () => {
        cleanup()
        reject(video.error ?? new Error('Video load failed'))
      }
      timeoutId = window.setTimeout(() => {
        cleanup()
        resolve()
      }, timeoutMs)
      video.addEventListener(eventName, handleReady, { once: true })
      video.addEventListener('error', handleError, { once: true })
    })
  }

  const stopCapture = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    videoRef.current?.pause()
    videoRef.current = null
    resetAudioGraph()
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
    fittedMediaRef.current = null
    soundUnlockPendingRef.current = false
    setTvMenuOpen(false)
    setTexture((currentTexture) => {
      currentTexture?.dispose()
      textureRef.current = null
      return null
    })
    setTvPoweredOn(true)
    setTvPaused(false)
    setCaptureState('off')
  }

  const clearTextureMedia = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    videoRef.current?.pause()
    videoRef.current = null
    resetAudioGraph()
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
    fittedMediaRef.current = null
    soundUnlockPendingRef.current = false
    setTexture((currentTexture) => {
      currentTexture?.dispose()
      textureRef.current = null
      return null
    })
    setTvPaused(false)
  }

  const openFilePicker = (event) => {
    event?.stopPropagation?.()
    setTvMenuOpen(false)
    setTvOnlinePanelOpen(false)
    const input = mobileFileInputRef.current ?? document.createElement('input')
    input.type = 'file'
    input.accept = 'video/*,image/*'
    if (!mobileFileInputRef.current) {
      input.setAttribute('aria-hidden', 'true')
      input.tabIndex = -1
      Object.assign(input.style, {
        position: 'fixed',
        left: '0',
        top: '0',
        width: '1px',
        height: '1px',
        opacity: '0',
        pointerEvents: 'none',
        zIndex: '-1',
      })
      input.addEventListener('change', (changeEvent) => {
        handleFileChangeRef.current?.(changeEvent)
      })
      document.body.appendChild(input)
      mobileFileInputRef.current = input
    }
    input.value = ''
    input.click()
  }

  const handleActiveScreenClick = async (event) => {
    event?.stopPropagation?.()
    setTvMenuOpen(true)
  }

  const turnTvOff = (event) => {
    event?.stopPropagation?.()
    videoRef.current?.pause()
    if (tvOnlineEmbedUrl) postYouTubeCommand('pauseVideo')
    setTvPoweredOn(false)
    setTvPaused(false)
    setTvMenuOpen(true)
  }

  const changeTvMedia = async (event) => {
    event?.stopPropagation?.()
    setTvMenuOpen(false)
    setTvOnlinePanelOpen(false)
    setTvOnlineEmbedUrl('')
    setTvOnlineMessage('')
    if (isMobileMediaMode) {
      openFilePicker(event)
      return
    }
    stopCapture()
    await startCapture(event)
  }

  const changeVolume = (delta) => {
    const nextVolume = MathUtils.clamp(tvVolume + delta, 0, 1)
    setTvVolume(nextVolume)
    if (tvOnlineEmbedUrl && tvPoweredOn) {
      applyYouTubeVolume(nextVolume)
    } else {
      applyVideoVolume(nextVolume)
    }
    if (nextVolume > 0) {
      soundUnlockPendingRef.current = false
    }
  }

  const volumeDown = (event) => {
    event?.stopPropagation?.()
    changeVolume(-0.1)
  }

  const volumeUp = (event) => {
    event?.stopPropagation?.()
    changeVolume(0.1)
  }

  const openOnlinePanel = (event) => {
    event?.stopPropagation?.()
    setTvOnlinePanelOpen(true)
    setTvOnlineMessage('')
    setTvMenuOpen(true)
  }

  const submitOnlineVideo = (url) => {
    const nextUrl = url.trim()
    const embedUrl = getYouTubeEmbedUrl(nextUrl)
    setTvOnlineUrl(nextUrl)

    if (!embedUrl) {
      setTvOnlineMessage('Lien YouTube invalide')
      setTvOnlinePanelOpen(true)
      setTvMenuOpen(true)
      return
    }

    clearTextureMedia()
    setTvOnlineEmbedUrl(embedUrl)
    setTvOnlineMessage('')
    setTvOnlinePanelOpen(false)
    setTvPoweredOn(true)
    setTvPaused(false)
    setCaptureState('playing')
    setTvMenuOpen(true)
  }

  const turnTvOn = async (event) => {
    event?.stopPropagation?.()
    if (tvOnlineEmbedUrl) {
      setTvPoweredOn(true)
      setTvPaused(false)
      postYouTubeCommand('playVideo')
      applyYouTubeVolume(tvVolume)
      setTvMenuOpen(true)
      return
    }
    if (texture && videoRef.current) {
      setTvPoweredOn(true)
      setTvPaused(false)
      applyVideoVolume(tvVolume > 0 ? tvVolume : 1)
      await videoRef.current.play().catch((error) => {
        console.warn('TV play failed', error)
      })
      setTvMenuOpen(true)
      return
    }
    setTvMenuOpen(false)
    if (isMobileMediaMode) {
      openFilePicker(event)
      return
    }
    await startCapture(event)
  }

  const toggleTvPause = async (event) => {
    event?.stopPropagation?.()
    if (!tvPoweredOn) return
    const shouldPause = !tvPaused

    if (tvOnlineEmbedUrl) {
      postYouTubeCommand(shouldPause ? 'pauseVideo' : 'playVideo')
      if (!shouldPause) applyYouTubeVolume(tvVolume)
      setTvPaused(shouldPause)
      setTvMenuOpen(true)
      return
    }

    const video = videoRef.current
    if (!video) return
    if (shouldPause) {
      video.pause()
    } else {
      applyVideoVolume(tvVolume)
      await video.play().catch((error) => {
        console.warn('TV resume failed', error)
      })
    }
    setTvPaused(shouldPause)
    setTvMenuOpen(true)
  }

  tvMenuCallbacksRef.current = {
    on: turnTvOn,
    off: turnTvOff,
    pause: toggleTvPause,
    change: changeTvMedia,
    online: openOnlinePanel,
    submitOnline: submitOnlineVideo,
    close: () => {
      setTvMenuOpen(false)
      setTvOnlinePanelOpen(false)
      setTvOnlineMessage('')
    },
    volumeDown,
    volumeUp,
  }

  const handleScreenPointerDown = (event) => {
    triggerScreenInteraction(event)
  }

  const handleFileChange = async (event) => {
    event?.stopPropagation?.()
    const input = event.target
    const file = input.files?.[0]
    if (!file) return
    const selectionKey = `${file.name}-${file.size}-${file.lastModified}`
    if (fileSelectionKeyRef.current === selectionKey) return
    fileSelectionKeyRef.current = selectionKey
    window.setTimeout(() => {
      if (fileSelectionKeyRef.current === selectionKey) {
        fileSelectionKeyRef.current = ''
      }
    }, 2000)

    const fileName = file.name?.toLowerCase() ?? ''
    const isVideo = file.type.startsWith('video/') || /\.(mp4|mov|m4v|webm|ogg)$/i.test(fileName)
    const isImage = file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|heic|heif)$/i.test(fileName)
    if (!isVideo && !isImage) {
      setCaptureState('error')
      input.value = ''
      return
    }

    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    videoRef.current?.pause()
    videoRef.current = null
    resetAudioGraph()
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
    fittedMediaRef.current = null
    soundUnlockPendingRef.current = false
    setTvMenuOpen(false)
    setTvOnlineEmbedUrl('')
    setTvOnlinePanelOpen(false)
    setTvPaused(false)
    setTvPoweredOn(true)
    setCaptureState('warming')

    try {
      if (isVideo) {
        const url = URL.createObjectURL(file)
        objectUrlRef.current = url
        const video = document.createElement('video')
        video.src = url
        video.loop = true
        video.playsInline = true
        video.setAttribute('playsinline', 'true')
        video.setAttribute('webkit-playsinline', 'true')
        video.autoplay = true
        video.preload = 'auto'
        videoRef.current = video
        prepareVideoAudio(video, isMobileMediaMode || tvVolume <= 0)
        video.load()
        await waitForVideoReady(
          video,
          'loadedmetadata',
          () => video.readyState >= HTMLMediaElement.HAVE_METADATA && video.videoWidth > 0,
        )
        await video.play().catch((error) => {
          console.warn('TV local video autoplay delayed', error)
        })
        await waitForVideoReady(
          video,
          'loadeddata',
          () => video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA,
        )
        const nextTexture = createFittedTexture(
          video,
          video.videoWidth || cssScreenWidth,
          video.videoHeight || cssScreenHeight,
          true,
        )
        setTexture((currentTexture) => {
          currentTexture?.dispose()
          textureRef.current = nextTexture
          return nextTexture
        })
        setTvPoweredOn(true)
        setTvPaused(false)
        soundUnlockPendingRef.current = isMobileMediaMode
        setCaptureState('playing')
        return
      }

      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      const image = new Image()
      await new Promise((resolve, reject) => {
        image.onload = resolve
        image.onerror = reject
        image.src = dataUrl
      })
      const nextTexture = createFittedTexture(image, image.naturalWidth, image.naturalHeight)
      setTexture((currentTexture) => {
        currentTexture?.dispose()
        textureRef.current = nextTexture
        return nextTexture
      })
      setTvPoweredOn(true)
      setTvPaused(false)
      soundUnlockPendingRef.current = false
      setCaptureState('playing')
    } catch (error) {
      console.warn('TV local media failed', error)
      stopCapture()
      setCaptureState('error')
    } finally {
      input.value = ''
    }
  }

  handleFileChangeRef.current = handleFileChange

  const startCapture = async (event) => {
    event?.stopPropagation?.()
    if (isMobileMediaMode) {
      setCaptureState('mobile')
      return
    }

    if (!window.isSecureContext) {
      setCaptureState('insecure')
      return
    }

    if (!navigator.mediaDevices?.getDisplayMedia) {
      setCaptureState('unsupported')
      return
    }

    setCaptureState('requesting')
    try {
      setTvOnlineEmbedUrl('')
      setTvOnlinePanelOpen(false)
      setTvOnlineMessage('')
      setTvPaused(false)
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30, max: 30 },
        },
        audio: true,
      })
      streamRef.current = stream
      const video = document.createElement('video')
      video.srcObject = stream
      video.playsInline = true
      video.autoplay = true
      videoRef.current = video
      prepareVideoAudio(video, tvVolume <= 0)

      stream.getVideoTracks()[0]?.addEventListener('ended', stopCapture, { once: true })
      await video.play()
      if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
        await new Promise((resolve) => {
          video.addEventListener('loadedmetadata', resolve, { once: true })
        })
      }
      setCaptureState('warming')
      await new Promise((resolve) => {
        if ('requestVideoFrameCallback' in video) {
          video.requestVideoFrameCallback(() => resolve())
          return
        }
        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0) {
          resolve()
          return
        }
        video.addEventListener('loadeddata', resolve, { once: true })
      })

      const nextTexture = createFittedTexture(video, video.videoWidth, video.videoHeight, true)
      setTexture((currentTexture) => {
        currentTexture?.dispose()
        textureRef.current = nextTexture
        return nextTexture
      })
      setTvPoweredOn(true)
      setTvPaused(false)
      setCaptureState('playing')
    } catch (error) {
      console.warn('TV capture failed', error)
      stopCapture()
      setCaptureState(error?.name === 'NotAllowedError' ? 'denied' : 'error')
    }
  }

  const showTextureScreen = texture && tvPoweredOn
  const showOnlineScreen = tvOnlineEmbedUrl && tvPoweredOn
  const screenHtmlScale = (screenInfo.width * 400) / cssScreenWidth

  return (
    <group ref={screenGroupRef} position={screenInfo.position} quaternion={screenInfo.quaternion}>
      {(texture ? [-0.002, 0.002] : [0]).map((zOffset) => (
        <mesh
          key={zOffset}
          position={[0, 0, zOffset]}
          onPointerDown={handleScreenPointerDown}
        >
          <planeGeometry args={[screenInfo.width, screenInfo.height]} />
          {showTextureScreen ? (
            <meshBasicMaterial
              ref={zOffset > 0 ? materialRef : undefined}
              map={texture}
              toneMapped={false}
              side={zOffset > 0 ? FrontSide : BackSide}
            />
          ) : showOnlineScreen ? (
            <meshBasicMaterial color="#020202" toneMapped={false} side={DoubleSide} />
          ) : (
            <meshBasicMaterial map={standbyTexture} toneMapped={false} side={DoubleSide} />
          )}
        </mesh>
      ))}
      {showOnlineScreen && (
        <Html
          transform
          occlude="blending"
          center
          distanceFactor={1}
          scale={screenHtmlScale}
          zIndexRange={[1, 0]}
          position={[0, 0, 0.006]}
          style={{
            width: `${cssScreenWidth}px`,
            height: `${cssScreenHeight}px`,
            pointerEvents: 'auto',
          }}
        >
          <iframe
            ref={youtubeFrameRef}
            className="tv-youtube-frame"
            width={cssScreenWidth}
            height={cssScreenHeight}
            src={tvOnlineEmbedUrl}
            title="YouTube video"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            onLoad={() => {
              applyYouTubeVolume(tvVolume)
              postYouTubeCommand(tvPaused ? 'pauseVideo' : 'playVideo')
            }}
          />
        </Html>
      )}
    </group>
  )
}

function EditableObject({ object, selected, mode, onSelect, onStartDragging, onObjectRef }) {
  const isCustomizeMode = mode === 'customize'
  const selectionRing = object.type === 'sofa' || object.type === 'desk' ? [1.05, 1.12] : [0.62, 0.68]
  const groupRef = useRef(null)

  useEffect(() => {
    const group = groupRef.current
    if (!group) return undefined

    group.userData.placedObjectId = object.id
    group.traverse((child) => {
      child.userData.placedObjectId = object.id
    })
    onObjectRef(object.id, group)

    return () => onObjectRef(object.id, null)
  }, [object.id, onObjectRef])

  if (object.type === 'goal') return null

  const handlePointerDown = (event) => {
    if (!isCustomizeMode || !object.canMove) return
    event.stopPropagation()
    onSelect(object.id)
    onStartDragging(object.id)
  }

  return (
    <group
      ref={groupRef}
      position={object.position}
      rotation={[0, object.rotationY, 0]}
      onPointerDown={handlePointerDown}
    >
      <Suspense fallback={null}>
        <PlaceableModel objectId={object.objectId} type={object.type} placedObjectId={object.id} />
      </Suspense>
      {selected && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.035, 0]}
          userData={{ ignorePlacementSupport: true, placedObjectId: object.id }}
        >
          <ringGeometry args={[selectionRing[0], selectionRing[1], 36]} />
          <meshBasicMaterial color="#ffd447" transparent opacity={0.95} />
        </mesh>
      )}
    </group>
  )
}

function EditableFloor({
  mode,
  draggingObjectId,
  placingObjectId,
  placementLocked,
  getPlacementY,
  onDrag,
  onLockPlacement,
  onStopDragging,
  onClearSelection,
}) {
  if (mode !== 'customize') return null

  const getSnappedPlacement = (point, objectId) => {
    const [x, z] = clampToCustomRoom(snap(point.x), snap(point.z))
    return [x, getPlacementY(x, z, objectId), z]
  }

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0.028, 0]}
      onPointerMove={(event) => {
        if (!draggingObjectId && !placingObjectId) return
        if (placingObjectId && placementLocked) return
        event.stopPropagation()
        const objectId = draggingObjectId ?? placingObjectId
        onDrag(objectId, getSnappedPlacement(event.point, objectId))
      }}
      onClick={(event) => {
        if (!placingObjectId || placementLocked) return
        event.stopPropagation()
        onDrag(placingObjectId, getSnappedPlacement(event.point, placingObjectId))
        onLockPlacement()
      }}
      onPointerUp={(event) => {
        event.stopPropagation()
        onStopDragging()
      }}
      onPointerMissed={() => {
        onStopDragging()
        onClearSelection()
      }}
    >
      <planeGeometry args={[MAIN_ROOM.width, MAIN_ROOM.depth]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  )
}

function PlacementPreview({ object, preview }) {
  if (!object || !preview) return null

  return (
    <group position={preview.position} rotation={[0, preview.rotationY, 0]}>
      <group scale={0.96}>
        <Suspense fallback={null}>
          <PlaceableModel objectId={object.objectId} type={object.type} placedObjectId={object.id} />
        </Suspense>
      </group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.045, 0]}
        userData={{ ignorePlacementSupport: true }}
      >
        <ringGeometry args={[1.08, 1.16, 40]} />
        <meshBasicMaterial color={preview.isValid ? '#66ff9a' : '#ff5f5f'} transparent opacity={0.92} />
      </mesh>
    </group>
  )
}

function CustomizationLayer({
  mode,
  objects,
  selectedObjectId,
  draggingObjectId,
  placingObjectId,
  placementPreview,
  placementLocked,
  onSelect,
  onStartDragging,
  onStopDragging,
  onUpdatePosition,
  onUpdatePlacementPreview,
  onLockPlacement,
}) {
  const placedObjects = objects.filter((object) => object.status !== 'stored')
  const placingObject = objects.find((object) => object.id === placingObjectId)
  const placeableRefs = useRef(new Map())

  const registerPlaceableRef = useCallback((id, object3D) => {
    if (object3D) {
      placeableRefs.current.set(id, object3D)
      return
    }
    placeableRefs.current.delete(id)
  }, [])

  const getPlacementY = useCallback((x, z, ignoredObjectId) => {
    const supportObjects = Array.from(placeableRefs.current.entries())
      .filter(([id]) => id !== ignoredObjectId)
      .map(([, object3D]) => object3D)

    if (supportObjects.length === 0) return 0

    supportObjects.forEach((object3D) => object3D.updateMatrixWorld(true))
    placementRayOrigin.set(x, CUSTOM_PLACEMENT_RAY_START_Y, z)
    placementRaycaster.set(placementRayOrigin, placementRayDirection)

    const hit = placementRaycaster
      .intersectObjects(supportObjects, true)
      .find((intersection) => {
        const hitObjectId = intersection.object.userData.placedObjectId
        return !intersection.object.userData.ignorePlacementSupport && hitObjectId !== ignoredObjectId
      })

    return hit ? hit.point.y : 0
  }, [])

  return (
    <>
      <CustomizationCamera active={mode === 'customize'} />
      <EditableFloor
        mode={mode}
        draggingObjectId={draggingObjectId}
        placingObjectId={placingObjectId}
        placementLocked={placementLocked}
        getPlacementY={getPlacementY}
        onDrag={(id, position) => {
          if (placingObjectId) {
            onUpdatePlacementPreview(position)
            return
          }
          onUpdatePosition(id, position)
        }}
        onStopDragging={onStopDragging}
        onClearSelection={() => onSelect(null)}
        onLockPlacement={onLockPlacement}
      />
      <gridHelper
        args={[MAIN_ROOM.width, MAIN_ROOM.width / CUSTOM_GRID_SIZE, '#f2c14e', '#d8e0e8']}
        position={[0, 0.032, 0]}
        visible={mode === 'customize'}
      />
      {placedObjects.map((object) => (
        <EditableObject
          key={object.id}
          object={object}
          selected={selectedObjectId === object.id}
          mode={mode}
          onSelect={onSelect}
          onStartDragging={onStartDragging}
          onObjectRef={registerPlaceableRef}
        />
      ))}
      <PlacementPreview object={placingObject} preview={placementPreview} />
    </>
  )
}

function InventoryPreviewIcon({ type }) {
  return (
    <div className={`inventory-preview-icon ${type}`}>
      {type === 'sofa' && (
        <>
          <span className="inventory-sofa-back" />
          <span className="inventory-sofa-seat" />
          <span className="inventory-sofa-arm left" />
          <span className="inventory-sofa-arm right" />
        </>
      )}
    </div>
  )
}

function InventoryThumbnail({ card }) {
  const [failed, setFailed] = useState(false)

  if (card.thumbnail && !failed) {
    return (
      <img
        className="inventory-thumbnail-img"
        src={card.thumbnail}
        alt=""
        onError={() => setFailed(true)}
      />
    )
  }

  return <InventoryPreviewIcon type={card.type} />
}

function ObjectInventorySheet({ open, cards, placingObjectId, onToggle, onSelect }) {
  return (
    <div className={`object-inventory-sheet ${open ? 'open' : ''}`}>
      <button className="object-inventory-handle" type="button" onClick={onToggle}>
        Objets
      </button>
      {open && (
        <div className="object-inventory-content">
          <div className="object-inventory-header">
            <h2>Objets</h2>
            <button type="button" aria-label="Fermer" onClick={onToggle}>×</button>
          </div>
          <div className="object-inventory-tabs">
            <button type="button" className="active">Tous</button>
            <button type="button">Meubles</button>
            <button type="button">Lumières</button>
            <button type="button">Déco</button>
            <button type="button">Sols</button>
            <button type="button">Murs</button>
          </div>
          <div className="object-inventory-grid">
            {cards.map((card) => {
              const isAvailable = card.stored > 0
              return (
                <button
                  key={card.objectId}
                  type="button"
                  className={`inventory-card ${!isAvailable ? 'disabled' : ''} ${placingObjectId === card.storedInstanceId ? 'active' : ''}`}
                  onClick={() => {
                    if (isAvailable) onSelect(card.storedInstanceId)
                  }}
                  disabled={!isAvailable}
                >
                  <div className="inventory-card-preview">
                    <InventoryThumbnail card={card} />
                    <span className="inventory-card-quantity">x{card.stored}</span>
                  </div>
                  <div className="inventory-card-name">{card.name}</div>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function ThumbnailTool() {
  const [captures, setCaptures] = useState({})
  const [busyObjectId, setBusyObjectId] = useState(null)
  const [toolMessage, setToolMessage] = useState('')
  const catalogItems = Object.values(objectCatalog)
  const isThumbnailGeneratable = (item) => {
    const url = item.thumbnailModelUrl ?? item.modelUrl
    return ['glb', 'fbx'].includes(url?.split('?')[0].split('.').pop()?.toLowerCase())
  }
  const generatableItems = catalogItems.filter(isThumbnailGeneratable)
  const captureObjectId = useMemo(() => {
    try {
      return new URLSearchParams(window.location.search).get('capture')
    } catch {
      return null
    }
  }, [])

  const generateItemThumbnail = async (item) => {
    const modelUrl = item.thumbnailModelUrl ?? item.modelUrl
    if (!isThumbnailGeneratable(item)) return
    setBusyObjectId(item.id)
    setToolMessage(`Generation de ${item.name}...`)
    try {
      const blob = await generateThumbnailBlob({
        modelUrl,
        textureUrl: item.thumbnailTextureUrl,
        rotationY: (item.modelRotationY ?? 0) + (item.thumbnailRotationY ?? 0),
        margin: item.thumbnailMargin ?? 1.24,
        view: item.thumbnailView ?? 'front',
      })
      const url = URL.createObjectURL(blob)
      setCaptures((current) => {
        if (current[item.id]?.url) URL.revokeObjectURL(current[item.id].url)
        return { ...current, [item.id]: { url, blob } }
      })
      setToolMessage(`Miniature prete : ${item.name}`)
    } catch (error) {
      setToolMessage(`Generation impossible pour ${item.name}: ${error.message}`)
    } finally {
      setBusyObjectId(null)
    }
  }

  const generateMissingThumbnails = async () => {
    for (const item of generatableItems) {
      if (!captures[item.id]) await generateItemThumbnail(item)
    }
    setToolMessage('Generation terminee. Telecharge les miniatures validees en WebP.')
  }

  const downloadCapture = (objectId) => {
    const blob = captures[objectId]?.blob
    if (blob) downloadBlob(blob, `${objectId}.webp`)
  }

  useEffect(() => {
    if (!captureObjectId) return
    const item = objectCatalog[captureObjectId]
    if (!item || !isThumbnailGeneratable(item)) return
    generateItemThumbnail(item)
  }, [captureObjectId])

  if (captureObjectId) {
    const capture = captures[captureObjectId]
    return (
      <main className="thumbnail-capture-page">
        {capture?.url ? <img src={capture.url} alt="" /> : null}
      </main>
    )
  }

  return (
    <main className="thumbnail-tool">
      <div className="thumbnail-tool-panel">
        <div className="thumbnail-tool-header">
          <div>
            <h1>Object thumbnails</h1>
            <p>Outil dev : genere des WebP carres depuis les GLB. Le jeu charge ensuite seulement les images sauvegardees.</p>
          </div>
          <button type="button" onClick={generateMissingThumbnails} disabled={Boolean(busyObjectId)}>
            Generer les manquantes
          </button>
        </div>
        {toolMessage && <div className="thumbnail-tool-message">{toolMessage}</div>}
        <div className="thumbnail-tool-grid">
          {catalogItems.map((item) => (
            <div className="thumbnail-tool-card" key={item.id}>
              <div className="thumbnail-tool-preview">
                {captures[item.id]?.url ? (
                  <img src={captures[item.id].url} alt="" />
                ) : item.thumbnail ? (
                  <img src={item.thumbnail} alt="" />
                ) : (
                  <span>Aucune image</span>
                )}
              </div>
              <div className="thumbnail-tool-info">
                <strong>{item.name}</strong>
                <span>{isThumbnailGeneratable(item) ? 'Compatible' : 'Miniature manuelle'}</span>
                <button
                  type="button"
                  onClick={() => generateItemThumbnail(item)}
                  disabled={Boolean(busyObjectId) || !isThumbnailGeneratable(item)}
                >
                  {captures[item.id] ? 'Regenerer' : 'Generer'}
                </button>
                <button type="button" onClick={() => downloadCapture(item.id)} disabled={!captures[item.id]}>
                  Télécharger PNG
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}

function SkinMenu({
  open,
  coins,
  skins,
  previewIndex,
  selectedSkinId,
  ownedSkinIds,
  onClose,
  onPrevious,
  onNext,
  onBuy,
  onSelect,
}) {
  if (!open) return null

  const skin = skins[previewIndex]
  const isOwned = ownedSkinIds.includes(skin.id)
  const isSelected = selectedSkinId === skin.id
  const canBuy = coins >= skin.price

  return (
    <div className="skin-menu-overlay">
      <div className="skin-menu">
        <div className="skin-coins">
          <img src="/ui/coins.png" alt="" aria-hidden="true" />
          <span>{coins} pieces</span>
        </div>
        <div className="skin-title">{skin.name}</div>
        <div className="skin-preview-wrap">
          <div
            className="skin-preview-ball"
            style={{ backgroundImage: `url(${skin.texture})` }}
          />
        </div>
        <div className="skin-nav">
          <button type="button" onClick={onPrevious} className="skin-nav-btn">{'<'}</button>
          <button type="button" onClick={onNext} className="skin-nav-btn">{'>'}</button>
        </div>
        {!isOwned && (
          <button
            type="button"
            className="skin-action-btn"
            onClick={onBuy}
            disabled={!canBuy}
          >
            Acheter - {skin.price}
          </button>
        )}
        {isOwned && !isSelected && (
          <button type="button" className="skin-action-btn" onClick={onSelect}>Selectionner</button>
        )}
        {isOwned && isSelected && <div className="skin-equipped">Equipe</div>}
        <button type="button" className="skin-close-btn" onClick={onClose}>Fermer</button>
      </div>
    </div>
  )
}

function EnvironmentMenu({
  open,
  coins,
  activeTab,
  onTabChange,
  floorSkins,
  wallSkins,
  furnitureItems,
  furnitureCounts,
  previewFloorIndex,
  previewWallIndex,
  selectedFloorSkinId,
  selectedWallSkinId,
  ownedFloorSkinIds,
  ownedWallSkinIds,
  applyWallToCeiling,
  onApplyWallToCeilingChange,
  onClose,
  onPrevious,
  onNext,
  onBuy,
  onSelect,
  onBuyFurniture,
}) {
  if (!open) return null

  const isFurnitureTab = activeTab === 'furniture'
  const isFloorTab = activeTab === 'floor'
  const skins = isFloorTab ? floorSkins : wallSkins
  const previewIndex = isFloorTab ? previewFloorIndex : previewWallIndex
  const selectedSkinId = isFloorTab ? selectedFloorSkinId : selectedWallSkinId
  const ownedSkinIds = isFloorTab ? ownedFloorSkinIds : ownedWallSkinIds
  const skin = skins[previewIndex]
  const isOwned = ownedSkinIds.includes(skin.id)
  const isSelected = selectedSkinId === skin.id
  const canBuy = coins >= skin.price

  return (
    <div className="skin-menu-overlay">
      <div className="skin-menu">
        <div className="skin-coins">
          <img src="/ui/coins.png" alt="" aria-hidden="true" />
          <span>{coins} pieces</span>
        </div>
        <div className="env-tabs">
          <button
            type="button"
            className={`env-tab-btn ${isFloorTab ? 'active' : ''}`}
            onClick={() => onTabChange('floor')}
          >
            Sol
          </button>
          <button
            type="button"
            className={`env-tab-btn ${activeTab === 'wall' ? 'active' : ''}`}
            onClick={() => onTabChange('wall')}
          >
            Mur
          </button>
          <button
            type="button"
            className={`env-tab-btn ${isFurnitureTab ? 'active' : ''}`}
            onClick={() => onTabChange('furniture')}
          >
            Meubles
          </button>
        </div>
        {isFurnitureTab ? (
          <>
            <div className="skin-title">Meubles</div>
            <div className="furniture-shop-grid">
              {furnitureItems.map((item) => {
                const ownedCount = furnitureCounts[item.id] ?? 0
                const canBuyFurniture = coins >= item.price
                return (
                  <button
                    key={item.id}
                    type="button"
                    className="furniture-shop-card"
                    onClick={() => onBuyFurniture(item.id)}
                    disabled={!canBuyFurniture}
                  >
                    <div className="furniture-shop-preview">
                      <img src={item.thumbnail} alt="" />
                      {ownedCount > 0 && <span className="furniture-owned-badge">x{ownedCount}</span>}
                    </div>
                    <span className="furniture-shop-name">{item.name}</span>
                    <span className="furniture-shop-price">{item.price} pieces</span>
                  </button>
                )
              })}
            </div>
          </>
        ) : (
          <>
            <div className="skin-title">{skin.name}</div>
            <div className="env-preview-wrap">
              <div
                className="env-preview-wall"
                style={{
                  backgroundImage: `url(${isFloorTab ? wallSkins[previewWallIndex].texture : skin.texture})`,
                }}
              />
              <div
                className="env-preview-floor"
                style={{
                  backgroundImage: `url(${isFloorTab ? skin.texture : floorSkins[previewFloorIndex].texture})`,
                }}
              />
            </div>
            {!isFloorTab && (
              <label className="env-ceiling-toggle">
                <input
                  type="checkbox"
                  checked={applyWallToCeiling}
                  onChange={(event) => onApplyWallToCeilingChange(event.target.checked)}
                />
                <span>Appliquer au plafond</span>
              </label>
            )}
            <div className="skin-nav">
              <button type="button" onClick={onPrevious} className="skin-nav-btn">{'<'}</button>
              <button type="button" onClick={onNext} className="skin-nav-btn">{'>'}</button>
            </div>
            {!isOwned && (
              <button type="button" className="skin-action-btn" onClick={onBuy} disabled={!canBuy}>
                Acheter - {skin.price}
              </button>
            )}
            {isOwned && !isSelected && (
              <button type="button" className="skin-action-btn" onClick={onSelect}>Selectionner</button>
            )}
            {isOwned && isSelected && <div className="skin-equipped">Equipe</div>}
          </>
        )}
        <button type="button" className="skin-close-btn" onClick={onClose}>Fermer</button>
      </div>
    </div>
  )
}

function BallRespawnGuard({ ballRef, onOutOfBounds }) {
  const outTimerRef = useRef(0)
  const triggerLockRef = useRef(false)

  useFrame((_, delta) => {
    const ball = ballRef.current
    if (!ball) return

    const p = ball.translation()
    const isOut =
      p.y < -1.2 ||
      p.y > 7 ||
      Math.abs(p.x) > 8.2 ||
      Math.abs(p.z) > 12

    if (isOut) {
      outTimerRef.current += delta
      if (outTimerRef.current > 1.6 && !triggerLockRef.current) {
        triggerLockRef.current = true
        onOutOfBounds()
      }
    } else {
      outTimerRef.current = 0
      triggerLockRef.current = false
    }
  })

  return null
}

function ScorePopups({ popups }) {
  return (
    <>
      {popups.map((popup) => (
        <Html key={popup.id} position={[popup.x, popup.y, popup.z]} center transform sprite>
          <div
            className="score-value score-burst-world"
            style={{ animationDuration: `${popup.duration}ms` }}
          >
            +{popup.value}
          </div>
        </Html>
      ))}
    </>
  )
}

function App() {
  const isThumbnailTool = useMemo(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      return params.get('tool') === 'thumbnail'
    } catch {
      return false
    }
  }, [])

  if (isThumbnailTool) return <ThumbnailTool />

  const isAdminMode = useMemo(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      return params.get('mode') === 'admin'
    } catch {
      return false
    }
  }, [])
  const isVerticalFrameMode = useMemo(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      const frame = params.get('frame')?.toLowerCase()
      const format = params.get('format')?.toLowerCase()
      const aspect = params.get('aspect')?.toLowerCase()
      return (
        frame === '9x16' ||
        frame === '9:16' ||
        frame === 'vertical' ||
        format === 'tiktok' ||
        aspect === '9x16' ||
        aspect === '9:16'
      )
    } catch {
      return false
    }
  }, [])
  const progressScope = isAdminMode ? 'admin' : 'player'
  const progressStorageKey = isAdminMode ? `${SKIN_STORAGE_KEY}:admin` : SKIN_STORAGE_KEY

  const touchRef = useRef({
    moveX: 0,
    moveY: 0,
    cameraYaw: 0,
    cameraPitch: -0.22,
    cameraDistance: CAMERA_DISTANCE,
    lookX: 0,
    lookY: 0,
    lookActive: false,
    actionQueued: false,
    emoteQueued: null,
  })
  const ballRef = useRef()
  const playerPositionRef = useRef({ x: 0, y: PLAYER_HEIGHT, z: 2.2 })
  const scoreCooldownRef = useRef(false)
  const respawnTimerRef = useRef(null)
  const outRespawnCooldownRef = useRef(false)
  const [scorePopups, setScorePopups] = useState([])
  const [coins, setCoins] = useState(isAdminMode ? 850 : 0)
  const [ownedSkins, setOwnedSkins] = useState(['classic'])
  const [selectedSkinId, setSelectedSkinId] = useState('classic')
  const [previewSkinId, setPreviewSkinId] = useState('classic')
  const [isSkinMenuOpen, setIsSkinMenuOpen] = useState(false)
  const [isNearSkinStation, setIsNearSkinStation] = useState(false)
  const [environmentTab, setEnvironmentTab] = useState('floor')
  const [ownedFloorSkins, setOwnedFloorSkins] = useState(['floor-classic'])
  const [ownedWallSkins, setOwnedWallSkins] = useState(['wall-classic'])
  const [selectedFloorSkinId, setSelectedFloorSkinId] = useState('floor-classic')
  const [selectedWallSkinId, setSelectedWallSkinId] = useState('wall-classic')
  const [previewFloorSkinId, setPreviewFloorSkinId] = useState('floor-classic')
  const [previewWallSkinId, setPreviewWallSkinId] = useState('wall-classic')
  const [applyWallToCeiling, setApplyWallToCeiling] = useState(false)
  const [isEnvironmentMenuOpen, setIsEnvironmentMenuOpen] = useState(false)
  const [isNearEnvironmentStation, setIsNearEnvironmentStation] = useState(false)
  const [mode, setMode] = useState('play')
  const [captureUiHidden, setCaptureUiHidden] = useState(false)
  const [editableObjects, setEditableObjects] = useState(defaultEditableObjects)
  const [selectedObjectId, setSelectedObjectId] = useState(null)
  const [draggingObjectId, setDraggingObjectId] = useState(null)
  const [placingObjectId, setPlacingObjectId] = useState(null)
  const [placementLocked, setPlacementLocked] = useState(false)
  const [placementPreview, setPlacementPreview] = useState(null)
  const [isObjectInventoryOpen, setIsObjectInventoryOpen] = useState(false)
  const [isNearCustomizationStation, setIsNearCustomizationStation] = useState(false)
  const [nearbySeat, setNearbySeat] = useState(null)
  const [nearbyTv, setNearbyTv] = useState(null)
  const [seatedState, setSeatedState] = useState(null)
  const [authUser, setAuthUser] = useState(null)
  const [isAccountOpen, setIsAccountOpen] = useState(false)
  const [authMode, setAuthMode] = useState('signup')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [authMessage, setAuthMessage] = useState('')
  const [cloudSaveState, setCloudSaveState] = useState(isSupabaseConfigured ? 'offline' : 'local')
  const hasLoadedCloudProgressRef = useRef(false)
  const skipNextCloudSaveRef = useRef(false)
  const authUserRef = useRef(null)
  const latestProgressRef = useRef(null)
  const cloudSaveTimeoutRef = useRef(null)

  useEffect(() => {
    if (!isAdminMode && !isVerticalFrameMode) return undefined

    const onKeyDown = (event) => {
      const key = getKeyboardKey(event)
      const isDeleteToggle = key === 'delete'
      const isPointingUp = isAdminMode && key === 'p' && !event.repeat
      if (!isDeleteToggle && !isPointingUp) return
      const target = event.target
      const isTyping =
        target instanceof HTMLElement &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      if (isTyping) return
      event.preventDefault()
      if (isDeleteToggle) {
        setCaptureUiHidden((current) => !current)
        return
      }
      touchRef.current.emoteQueued = 'pointingUp'
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isAdminMode, isVerticalFrameMode])

  const createCurrentProgressSnapshot = () => ({
    displayName,
    coins,
    ownedSkins,
    selectedSkinId,
    ownedFloorSkins,
    ownedWallSkins,
    selectedFloorSkinId,
    selectedWallSkinId,
    applyWallToCeiling,
    editableObjects,
  })

  const resetGuestProgress = () => {
    setCoins(isAdminMode ? 850 : 0)
    setOwnedSkins(['classic'])
    setSelectedSkinId('classic')
    setPreviewSkinId('classic')
    setOwnedFloorSkins(['floor-classic'])
    setOwnedWallSkins(['wall-classic'])
    setSelectedFloorSkinId('floor-classic')
    setSelectedWallSkinId('wall-classic')
    setPreviewFloorSkinId('floor-classic')
    setPreviewWallSkinId('wall-classic')
    setApplyWallToCeiling(false)
    setEditableObjects(defaultEditableObjects)
    setSelectedObjectId(null)
    setDraggingObjectId(null)
    setPlacingObjectId(null)
    setPlacementLocked(false)
    setPlacementPreview(null)
    setIsObjectInventoryOpen(false)
    setNearbySeat(null)
    setSeatedState(null)
  }

  const applyProgressSnapshot = (parsed, { includeCoins = true } = {}) => {
    if (!parsed) return
    if (typeof parsed.displayName === 'string') setDisplayName(parsed.displayName)
    if (includeCoins && typeof parsed.coins === 'number') {
      setCoins(isAdminMode ? 850 : Math.max(0, parsed.coins))
    } else if (includeCoins) {
      setCoins(isAdminMode ? 850 : 0)
    }
    if (Array.isArray(parsed.ownedSkins) && parsed.ownedSkins.length) setOwnedSkins(parsed.ownedSkins)
    if (typeof parsed.selectedSkinId === 'string') {
      setSelectedSkinId(parsed.selectedSkinId)
      setPreviewSkinId(parsed.selectedSkinId)
    }

    const validFloorSkinIds = new Set(floorSkins.map((skin) => skin.id))
    const validWallSkinIds = new Set(wallSkins.map((skin) => skin.id))
    const ownedFloorSkinIds = Array.isArray(parsed.ownedFloorSkins)
      ? ['floor-classic', ...parsed.ownedFloorSkins.filter((id) => validFloorSkinIds.has(id) && id !== 'floor-classic')]
      : ['floor-classic']
    const ownedWallSkinIds = Array.isArray(parsed.ownedWallSkins)
      ? ['wall-classic', ...parsed.ownedWallSkins.filter((id) => validWallSkinIds.has(id) && id !== 'wall-classic')]
      : ['wall-classic']

    setOwnedFloorSkins(ownedFloorSkinIds)
    setOwnedWallSkins(ownedWallSkinIds)

    if (typeof parsed.selectedFloorSkinId === 'string' && validFloorSkinIds.has(parsed.selectedFloorSkinId)) {
      setSelectedFloorSkinId(parsed.selectedFloorSkinId)
      setPreviewFloorSkinId(parsed.selectedFloorSkinId)
    }
    if (typeof parsed.selectedWallSkinId === 'string' && validWallSkinIds.has(parsed.selectedWallSkinId)) {
      setSelectedWallSkinId(parsed.selectedWallSkinId)
      setPreviewWallSkinId(parsed.selectedWallSkinId)
    }
    if (typeof parsed.applyWallToCeiling === 'boolean') {
      setApplyWallToCeiling(parsed.applyWallToCeiling)
    }

    if (Array.isArray(parsed.editableObjects)) {
      const knownIds = new Set(defaultEditableObjects.map((object) => object.id))
      const savedObjectsById = new Map(parsed.editableObjects.map((object) => [object?.id, object]))
      const mergedObjects = defaultEditableObjects.map((baseObject) => {
        const savedObject = savedObjectsById.get(baseObject.id)
        if (!savedObject || !knownIds.has(savedObject.id)) return baseObject
        const position = Array.isArray(savedObject.position) && savedObject.position.length === 3
          ? savedObject.position
          : baseObject.position
        return {
          ...baseObject,
          status: savedObject.status === 'stored' && baseObject.canStore ? 'stored' : 'placed',
          position: savedObject.status === 'stored' && baseObject.canStore
            ? null
            : [
              MathUtils.clamp(Number(position[0]) || baseObject.position[0], CUSTOM_ROOM_BOUNDS.minX, CUSTOM_ROOM_BOUNDS.maxX),
              Number.isFinite(Number(position[1])) ? Number(position[1]) : baseObject.position[1],
              MathUtils.clamp(Number(position[2]) || baseObject.position[2], CUSTOM_ROOM_BOUNDS.minZ, CUSTOM_ROOM_BOUNDS.maxZ),
            ],
          rotationY: Number.isFinite(savedObject.rotationY) ? savedObject.rotationY : baseObject.rotationY,
        }
      })
      const savedShopObjects = parsed.editableObjects
        .filter((object) =>
          object?.id &&
          !knownIds.has(object.id) &&
          !LEGACY_STARTER_FURNITURE_IDS.has(object.id) &&
          shopObjectIds.includes(object.objectId),
        )
        .map((object) => {
          const position = Array.isArray(object.position) && object.position.length === 3
            ? object.position
            : null
          return createEditableObjectInstance(object.objectId, {
            id: object.id,
            status: object.status === 'placed' ? 'placed' : 'stored',
            position: object.status === 'placed' && position
              ? [
                MathUtils.clamp(Number(position[0]) || 0, CUSTOM_ROOM_BOUNDS.minX, CUSTOM_ROOM_BOUNDS.maxX),
                Number.isFinite(Number(position[1])) ? Number(position[1]) : 0,
                MathUtils.clamp(Number(position[2]) || 0, CUSTOM_ROOM_BOUNDS.minZ, CUSTOM_ROOM_BOUNDS.maxZ),
              ]
              : null,
            rotationY: Number.isFinite(object.rotationY) ? object.rotationY : 0,
          })
        })
        .filter(Boolean)

      setEditableObjects([...mergedObjects, ...savedShopObjects])
    }
  }

  const saveCurrentProgressToCloud = async () => {
    if (!isSupabaseConfigured || !authUserRef.current || !hasLoadedCloudProgressRef.current) return false
    setCloudSaveState('saving')
    try {
      await savePlayerProgress(latestProgressRef.current ?? createCurrentProgressSnapshot(), { scope: progressScope })
      setCloudSaveState('synced')
      return true
    } catch {
      setCloudSaveState('error')
      return false
    }
  }

  const applyCoinDelta = async (delta) => {
    const previousCoins = latestProgressRef.current?.coins ?? coins
    setCoins((current) => Math.max(0, current + delta))
    if (!isSupabaseConfigured || !authUserRef.current || !hasLoadedCloudProgressRef.current) return true

    try {
      const nextCoins = await addPlayerCoins(delta, { scope: progressScope })
      if (typeof nextCoins === 'number') setCoins(Math.max(0, nextCoins))
      return true
    } catch {
      if (delta > 0 || previousCoins + delta >= 0) {
        try {
          await savePlayerProgress({
            ...(latestProgressRef.current ?? createCurrentProgressSnapshot()),
            coins: Math.max(0, previousCoins + delta),
          }, { includeCoins: true, scope: progressScope })
          setCloudSaveState('synced')
          return true
        } catch {}
      }
      setCoins(previousCoins)
      setCloudSaveState('error')
      return false
    }
  }

  useEffect(() => {
    try {
      const raw = localStorage.getItem(progressStorageKey)
      if (!raw) return
      applyProgressSnapshot(JSON.parse(raw))
    } catch {}
  }, [progressStorageKey])

  useEffect(() => {
    const snapshot = createCurrentProgressSnapshot()
    latestProgressRef.current = snapshot
    localStorage.setItem(
      progressStorageKey,
      JSON.stringify(snapshot),
    )
  }, [progressStorageKey, displayName, coins, ownedSkins, selectedSkinId, ownedFloorSkins, ownedWallSkins, selectedFloorSkinId, selectedWallSkinId, applyWallToCeiling, editableObjects])

  useEffect(() => {
    authUserRef.current = authUser
  }, [authUser])

  useEffect(() => {
    if (!isSupabaseConfigured) return undefined

    let cancelled = false

    const loadCloudProgress = async (user) => {
      setAuthUser(user)
      if (!user) {
        hasLoadedCloudProgressRef.current = false
        setCloudSaveState('offline')
        return
      }
      setDisplayName(user.user_metadata?.display_name ?? '')

      setCloudSaveState('loading')
      try {
        const cloudProgress = await loadPlayerProgress({ scope: progressScope })
        if (cancelled) return
        if (cloudProgress) {
          skipNextCloudSaveRef.current = true
          applyProgressSnapshot(cloudProgress)
        } else {
          await savePlayerProgress(latestProgressRef.current ?? createCurrentProgressSnapshot(), { scope: progressScope })
        }
        hasLoadedCloudProgressRef.current = true
        setCloudSaveState('synced')
      } catch {
        if (!cancelled) setCloudSaveState('error')
      }
    }

    getCurrentUser()
      .then(async (user) => {
        if (cancelled) return
        setAuthUser(user)
        if (!user) {
          setCloudSaveState('offline')
          return null
        }
        setDisplayName(user.user_metadata?.display_name ?? '')
        setCloudSaveState('loading')
        const cloudProgress = await loadPlayerProgress({ scope: progressScope })
        if (cloudProgress) {
          skipNextCloudSaveRef.current = true
          applyProgressSnapshot(cloudProgress)
        } else {
          await savePlayerProgress(latestProgressRef.current ?? createCurrentProgressSnapshot(), { scope: progressScope })
        }
        hasLoadedCloudProgressRef.current = true
        setCloudSaveState('synced')
        return cloudProgress
      })
      .catch(() => {
        if (!cancelled) setCloudSaveState('offline')
      })

    const unsubscribe = onAuthStateChange(loadCloudProgress)
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [progressScope])

  useEffect(() => {
    if (!isSupabaseConfigured || !authUser || !hasLoadedCloudProgressRef.current) return undefined
    if (skipNextCloudSaveRef.current) {
      skipNextCloudSaveRef.current = false
      return undefined
    }

    if (cloudSaveTimeoutRef.current) window.clearTimeout(cloudSaveTimeoutRef.current)
    setCloudSaveState('saving')
    cloudSaveTimeoutRef.current = window.setTimeout(() => {
      savePlayerProgress(latestProgressRef.current ?? createCurrentProgressSnapshot(), { scope: progressScope })
        .then(() => setCloudSaveState('synced'))
        .catch(() => setCloudSaveState('error'))
    }, 800)

    return () => {
      if (cloudSaveTimeoutRef.current) window.clearTimeout(cloudSaveTimeoutRef.current)
    }
  }, [authUser, progressScope, displayName, coins, ownedSkins, selectedSkinId, ownedFloorSkins, ownedWallSkins, selectedFloorSkinId, selectedWallSkinId, applyWallToCeiling, editableObjects])

  useEffect(() => {
    const saveBeforeLeaving = () => {
      if (document.visibilityState === 'hidden') {
        saveCurrentProgressToCloud()
      }
    }
    const saveOnPageHide = () => {
      saveCurrentProgressToCloud()
    }

    document.addEventListener('visibilitychange', saveBeforeLeaving)
    window.addEventListener('pagehide', saveOnPageHide)
    return () => {
      document.removeEventListener('visibilitychange', saveBeforeLeaving)
      window.removeEventListener('pagehide', saveOnPageHide)
    }
  }, [progressScope])

  useEffect(() => {
    const interval = window.setInterval(() => {
      const now = Date.now()
      setScorePopups((previous) => previous.filter((popup) => now < popup.startAt + popup.duration))
    }, 120)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const preventContextMenu = (event) => event.preventDefault()
    window.addEventListener('contextmenu', preventContextMenu)
    return () => window.removeEventListener('contextmenu', preventContextMenu)
  }, [])

  const handleBallRespawn = () => {
    const ball = ballRef.current
    if (!ball) return

    ball.setTranslation({ x: 0, y: 3.2, z: 0 }, true)
    ball.setLinvel({ x: 0, y: 0, z: 0 }, true)
    ball.setAngvel({ x: 0, y: 0, z: 0 }, true)
    scoreCooldownRef.current = false
  }

  const handleOutOfBoundsRespawn = () => {
    if (outRespawnCooldownRef.current) return
    outRespawnCooldownRef.current = true
    if (respawnTimerRef.current) {
      clearTimeout(respawnTimerRef.current)
      respawnTimerRef.current = null
    }
    handleBallRespawn()
    window.setTimeout(() => {
      outRespawnCooldownRef.current = false
    }, 1200)
  }

  const handleGoal = () => {
    if (scoreCooldownRef.current) return

    scoreCooldownRef.current = true
    applyCoinDelta(GOAL_POINTS)

    const ball = ballRef.current
    const ballPosition = ball?.translation()
    const goalPosition = editableObjects.find((object) => object.id === 'goal_01')?.position ?? [0, 0, GOAL_Z]
    setScorePopups((previous) => [
      ...previous,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        value: GOAL_POINTS,
        x: ballPosition?.x ?? 0,
        y: Math.max(0.9, ballPosition?.y ?? 0.9),
        z: ballPosition?.z ?? goalPosition[2] - 0.55,
        startAt: Date.now(),
        duration: 620,
      },
    ])

    if (respawnTimerRef.current) clearTimeout(respawnTimerRef.current)
    respawnTimerRef.current = setTimeout(() => {
      respawnTimerRef.current = null
      handleBallRespawn()
    }, 1000)
  }

  const handleBallZoneEnter = () => {
    if (scoreCooldownRef.current) return
    handleGoal()
  }

  const handleBallZoneExit = () => {}

  const previewIndex = Math.max(0, ballSkins.findIndex((skin) => skin.id === previewSkinId))
  const activeSkinId = isSkinMenuOpen ? previewSkinId : selectedSkinId
  const activeSkin = ballSkins.find((skin) => skin.id === activeSkinId) || ballSkins[0]
  const availableWallSkins = isAdminMode ? wallSkins : wallSkins.filter((skin) => !skin.adminOnly)
  const previewFloorIndex = Math.max(0, floorSkins.findIndex((skin) => skin.id === previewFloorSkinId))
  const previewWallIndex = Math.max(0, availableWallSkins.findIndex((skin) => skin.id === previewWallSkinId))
  const activeFloorSkinId = isEnvironmentMenuOpen ? previewFloorSkinId : selectedFloorSkinId
  const activeWallSkinId = isEnvironmentMenuOpen ? previewWallSkinId : selectedWallSkinId
  const activeFloorSkin = floorSkins.find((skin) => skin.id === activeFloorSkinId) || floorSkins[0]
  const activeWallSkin = availableWallSkins.find((skin) => skin.id === activeWallSkinId) || wallSkins[0]
  const activeCeilingTexturePath = applyWallToCeiling ? activeWallSkin.texture : DEFAULT_CEILING_TEXTURE
  const goalObject = editableObjects.find((object) => object.id === 'goal_01') || defaultEditableObjects[0]
  const placedEditableObjects = editableObjects.filter((object) => object.status !== 'stored')
  const selectedObject = editableObjects.find((object) => object.id === selectedObjectId)
  const inventoryCards = getInventoryCards(editableObjects)
  const showCaptureUi = !(isAdminMode || isVerticalFrameMode) || !captureUiHidden
  const furnitureShopItems = shopObjectIds.map((objectId) => objectCatalog[objectId]).filter(Boolean)
  const furnitureCounts = editableObjects.reduce((counts, object) => {
    if (shopObjectIds.includes(object.objectId)) {
      counts[object.objectId] = (counts[object.objectId] ?? 0) + 1
    }
    return counts
  }, {})

  const openSkinMenu = () => {
    setPreviewSkinId(selectedSkinId)
    setIsSkinMenuOpen(true)
  }

  const closeSkinMenu = () => {
    setPreviewSkinId(selectedSkinId)
    setIsSkinMenuOpen(false)
  }
  const openEnvironmentMenu = () => {
    setEnvironmentTab('floor')
    setPreviewFloorSkinId(selectedFloorSkinId)
    setPreviewWallSkinId(selectedWallSkinId)
    setIsEnvironmentMenuOpen(true)
  }
  const closeEnvironmentMenu = () => {
    setPreviewFloorSkinId(selectedFloorSkinId)
    setPreviewWallSkinId(selectedWallSkinId)
    setIsEnvironmentMenuOpen(false)
  }

  const goPreview = (direction) => {
    const current = Math.max(0, ballSkins.findIndex((skin) => skin.id === previewSkinId))
    const next = (current + direction + ballSkins.length) % ballSkins.length
    setPreviewSkinId(ballSkins[next].id)
  }
  const goEnvironmentPreview = (direction) => {
    if (environmentTab === 'floor') {
      const current = Math.max(0, floorSkins.findIndex((skin) => skin.id === previewFloorSkinId))
      const next = (current + direction + floorSkins.length) % floorSkins.length
      setPreviewFloorSkinId(floorSkins[next].id)
      return
    }
    const current = Math.max(0, availableWallSkins.findIndex((skin) => skin.id === previewWallSkinId))
    const next = (current + direction + availableWallSkins.length) % availableWallSkins.length
    setPreviewWallSkinId(availableWallSkins[next].id)
  }

  const buyPreviewSkin = async () => {
    const skin = ballSkins[previewIndex]
    if (ownedSkins.includes(skin.id)) return
    if (!isAdminMode && coins < skin.price) return
    const paid = isAdminMode ? true : await applyCoinDelta(-skin.price)
    if (!paid) return
    setOwnedSkins((current) => [...current, skin.id])
  }

  const selectPreviewSkin = () => {
    const skin = ballSkins[previewIndex]
    if (!ownedSkins.includes(skin.id)) return
    setSelectedSkinId(skin.id)
    setIsSkinMenuOpen(false)
  }
  const buyPreviewEnvironmentSkin = async () => {
    const skin = environmentTab === 'floor' ? floorSkins[previewFloorIndex] : availableWallSkins[previewWallIndex]
    const owned = environmentTab === 'floor' ? ownedFloorSkins : ownedWallSkins
    if (owned.includes(skin.id)) return
    if (!isAdminMode && coins < skin.price) return
    const paid = isAdminMode ? true : await applyCoinDelta(-skin.price)
    if (!paid) return
    if (environmentTab === 'floor') {
      setOwnedFloorSkins((current) => [...current, skin.id])
    } else {
      setOwnedWallSkins((current) => [...current, skin.id])
    }
  }
  const selectPreviewEnvironmentSkin = () => {
    if (environmentTab === 'floor') {
      const skin = floorSkins[previewFloorIndex]
      if (!ownedFloorSkins.includes(skin.id)) return
      setSelectedFloorSkinId(skin.id)
      return
    }
    const skin = availableWallSkins[previewWallIndex]
    if (!ownedWallSkins.includes(skin.id)) return
    setSelectedWallSkinId(skin.id)
  }

  const buyFurnitureObject = async (objectId) => {
    const item = objectCatalog[objectId]
    if (!item || !shopObjectIds.includes(objectId)) return
    if (!isAdminMode && coins < item.price) return
    const object = createEditableObjectInstance(objectId)
    if (!object) return
    const paid = isAdminMode ? true : await applyCoinDelta(-item.price)
    if (!paid) return
    setEditableObjects((current) => [...current, object])
  }

  const requestSit = () => {
    if (!nearbySeat || mode !== 'play') return
    setSeatedState({ phase: 'sitDown', seat: nearbySeat })
    setNearbySeat(null)
  }

  const requestStandUp = () => {
    if (seatedState?.phase !== 'sitting') return
    setSeatedState({ phase: 'standUp', seat: seatedState.seat })
  }

  const requestTvMenu = () => {
    if (!nearbyTv) return
    window.dispatchEvent(new CustomEvent(TV_MENU_EVENT, { detail: { objectId: nearbyTv.id } }))
  }

  const updateSeatedPhase = (phase) => {
    setSeatedState((current) => {
      if (!current) return null
      if (!phase) return null
      return { ...current, phase }
    })
  }

  useEffect(() => {
    const onKeyDown = (event) => {
      if (getKeyboardKey(event) !== 'e') return
      if (mode !== 'play') return
      if (seatedState?.phase === 'sitting') {
        event.preventDefault()
        requestStandUp()
        return
      }
      if (nearbySeat && !seatedState?.phase) {
        event.preventDefault()
        requestSit()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [mode, nearbySeat, seatedState])

  const openCustomizationMode = () => {
    setIsSkinMenuOpen(false)
    setIsEnvironmentMenuOpen(false)
    setMode('customize')
    setSelectedObjectId(placedEditableObjects[0]?.id ?? null)
    setDraggingObjectId(null)
    setPlacingObjectId(null)
    setPlacementLocked(false)
    setPlacementPreview(null)
    setIsObjectInventoryOpen(false)
    setNearbySeat(null)
    setNearbyTv(null)
    setSeatedState(null)
  }

  const closeCustomizationMode = () => {
    setMode('play')
    setSelectedObjectId(null)
    setDraggingObjectId(null)
    setPlacingObjectId(null)
    setPlacementLocked(false)
    setPlacementPreview(null)
    setIsObjectInventoryOpen(false)
    setIsNearCustomizationStation(false)
  }

  const updateEditableObjectPosition = (id, position) => {
    setEditableObjects((current) =>
      current.map((object) => (object.id === id ? { ...object, position } : object)),
    )
  }

  const storeSelectedObject = () => {
    if (!selectedObject?.canStore) return
    setEditableObjects((current) =>
      current.map((object) =>
        object.id === selectedObject.id
          ? { ...object, status: 'stored', position: null }
          : object,
      ),
    )
    setSelectedObjectId(null)
    setDraggingObjectId(null)
  }

  const beginPlaceObject = (id) => {
    const object = editableObjects.find((nextObject) => nextObject.id === id)
    if (!object || object.status !== 'stored') return
    setSelectedObjectId(null)
    setDraggingObjectId(null)
    setPlacingObjectId(id)
    setPlacementLocked(false)
    setPlacementPreview({
      position: [0, 0, 0],
      rotationY: object.rotationY ?? 0,
      isValid: true,
    })
    setIsObjectInventoryOpen(false)
  }

  const updatePlacementPreview = (position) => {
    setPlacementPreview((current) => {
      if (!current) return current
      const [x, z] = clampToCustomRoom(position[0], position[2])
      return {
        ...current,
        position: [x, Number.isFinite(Number(position[1])) ? Number(position[1]) : 0, z],
        isValid: true,
      }
    })
  }

  const confirmPlacement = () => {
    if (!placingObjectId || !placementPreview?.isValid) return
    setEditableObjects((current) =>
      current.map((object) =>
        object.id === placingObjectId
          ? {
            ...object,
            status: 'placed',
            position: placementPreview.position,
            rotationY: placementPreview.rotationY,
          }
          : object,
      ),
    )
    setSelectedObjectId(placingObjectId)
    setPlacingObjectId(null)
    setPlacementLocked(false)
    setPlacementPreview(null)
  }

  const cancelPlacement = () => {
    setPlacingObjectId(null)
    setPlacementLocked(false)
    setPlacementPreview(null)
  }

  const rotateSelectedObject = (direction) => {
    const angle = Math.PI / 4
    if (placingObjectId) {
      setPlacementPreview((current) => (
        current ? { ...current, rotationY: current.rotationY + direction * angle } : current
      ))
      return
    }
    if (!selectedObjectId) return
    setEditableObjects((current) =>
      current.map((object) => {
        if (object.id !== selectedObjectId || !object.canRotate) return object
        return { ...object, rotationY: object.rotationY + direction * angle }
      }),
    )
  }

  const requestAccountSubmit = async (event) => {
    event.preventDefault()
    const email = authEmail.trim()
    const password = authPassword
    const pseudo = displayName.trim()
    if (!email || password.length < 8) return
    const result = authMode === 'signup'
      ? await signUpWithPassword({ email, password, displayName: pseudo })
      : await signInWithPassword({ email, password })
    const errorMessage = result.error === 'Invalid login credentials'
      ? 'Email/mot de passe incorrect, ou compte pas encore confirme.'
      : result.error
    setAuthMessage(result.ok
      ? authMode === 'signup'
        ? result.needsEmailConfirmation
          ? 'Compte cree. Confirme ton email, ou desactive la confirmation dans Supabase pour le prototype.'
          : 'Compte cree et connecte.'
        : 'Connexion reussie.'
      : `Connexion impossible: ${errorMessage ?? 'erreur inconnue'}`)
  }

  const requestSignOut = async () => {
    await saveCurrentProgressToCloud()
    await signOut()
    setAuthUser(null)
    setAuthPassword('')
    setAuthMessage('')
    setCloudSaveState('offline')
    hasLoadedCloudProgressRef.current = false
    skipNextCloudSaveRef.current = false
    authUserRef.current = null
    resetGuestProgress()
  }

  const gameView = (
    <main className="app">
      <Canvas
        dpr={[1, 1.5]}
        camera={{ fov: 52, position: [0, 2.4, 6], near: 0.1, far: 40 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
      >
        <WhiteRoom
          floorTexturePath={activeFloorSkin.texture}
          wallTexturePath={activeWallSkin.texture}
          ceilingTexturePath={activeCeilingTexturePath}
          hideCeiling={mode === 'customize'}
        />
        <Dragon playerPositionRef={playerPositionRef} />
        <GlassContainmentRoom />
        <SkinStation />
        <EnvironmentStation />
        <CustomizationStation />
        <CustomizationLayer
          mode={mode}
          objects={editableObjects}
          selectedObjectId={selectedObjectId}
          draggingObjectId={draggingObjectId}
          placingObjectId={placingObjectId}
          placementLocked={placementLocked}
          placementPreview={placementPreview}
          onSelect={setSelectedObjectId}
          onStartDragging={setDraggingObjectId}
          onStopDragging={() => setDraggingObjectId(null)}
          onUpdatePosition={updateEditableObjectPosition}
          onUpdatePlacementPreview={updatePlacementPreview}
          onLockPlacement={() => setPlacementLocked(true)}
        />
        <SeatTargetMarker seat={mode === 'play' && !seatedState?.phase ? nearbySeat : null} />
        <Physics gravity={[0, -9.81, 0]}>
          <PhysicsBounds />
          <GlassContainmentColliders />
          <Ball ballRef={ballRef} skinTexturePath={activeSkin.texture} />
          <BallRespawnGuard ballRef={ballRef} onOutOfBounds={handleOutOfBoundsRespawn} />
          <Goal
            object={goalObject}
            mode={mode}
            selected={selectedObjectId === goalObject.id}
            onSelect={setSelectedObjectId}
            onStartDragging={setDraggingObjectId}
            onBallZoneEnter={handleBallZoneEnter}
            onBallZoneExit={handleBallZoneExit}
            ballRef={ballRef}
          />
          <Player
            touchRef={touchRef}
            ballRef={ballRef}
            playerPositionRef={playerPositionRef}
            mode={mode}
            goalObject={goalObject}
            seatedState={seatedState}
            onSeatedPhaseChange={updateSeatedPhase}
          />
          <SkinStationTrigger playerPositionRef={playerPositionRef} onNearChange={setIsNearSkinStation} />
          <EnvironmentStationTrigger playerPositionRef={playerPositionRef} onNearChange={setIsNearEnvironmentStation} />
          <CustomizationStationTrigger
            playerPositionRef={playerPositionRef}
            onNearChange={setIsNearCustomizationStation}
            enabled={mode === 'play'}
          />
          <SeatInteractionTrigger
            playerPositionRef={playerPositionRef}
            objects={placedEditableObjects}
            seatedState={seatedState}
            onNearbySeatChange={setNearbySeat}
          />
          <TvInteractionTrigger
            playerPositionRef={playerPositionRef}
            objects={placedEditableObjects}
            enabled={mode === 'play'}
            onNearbyTvChange={setNearbyTv}
          />
          {showCaptureUi && <ScorePopups popups={scorePopups} />}
        </Physics>
      </Canvas>

      {mode === 'play' && (
        <ControlsOverlay
          touchRef={touchRef}
          adminCameraControls={isAdminMode}
          uiHidden={!showCaptureUi}
        />
      )}
      {showCaptureUi && <CoinsOverlay coins={coins} />}
      {showCaptureUi && (
        <AccountSyncPanel
          configured={isSupabaseConfigured}
          user={authUser}
          email={authEmail}
          password={authPassword}
          displayName={displayName}
          mode={authMode}
          open={isAccountOpen}
          message={authMessage}
          saveState={cloudSaveState}
          onToggle={() => setIsAccountOpen((current) => !current)}
          onEmailChange={setAuthEmail}
          onPasswordChange={setAuthPassword}
          onDisplayNameChange={setDisplayName}
          onModeChange={(nextMode) => {
            setAuthMode(nextMode)
            setAuthMessage('')
          }}
          onSubmit={requestAccountSubmit}
          onSignOut={requestSignOut}
        />
      )}
      {showCaptureUi && isNearSkinStation && !isSkinMenuOpen && mode === 'play' && (
        <button className="skin-open-btn" type="button" onClick={openSkinMenu}>
          Personnaliser le ballon
        </button>
      )}
      {showCaptureUi && isNearEnvironmentStation && !isEnvironmentMenuOpen && mode === 'play' && (
        <button className="skin-open-btn skin-open-btn-right" type="button" onClick={openEnvironmentMenu}>
          Boutique
        </button>
      )}
      {showCaptureUi && isNearCustomizationStation && mode === 'play' && !isSkinMenuOpen && !isEnvironmentMenuOpen && (
        <button className="skin-open-btn custom-open-btn" type="button" onClick={openCustomizationMode}>
          Personnaliser la piece
        </button>
      )}
      {showCaptureUi && nearbyTv && mode === 'play' && !isSkinMenuOpen && !isEnvironmentMenuOpen && (
        <button className="skin-open-btn tv-open-btn" type="button" onClick={requestTvMenu}>
          Changer la TV
        </button>
      )}
      {showCaptureUi && nearbySeat && mode === 'play' && !seatedState?.phase && !isSkinMenuOpen && !isEnvironmentMenuOpen && (
        <button className="skin-open-btn seat-open-btn" type="button" onClick={requestSit}>
          S'asseoir
        </button>
      )}
      {showCaptureUi && seatedState?.phase === 'sitting' && (
        <button className="skin-open-btn seat-open-btn" type="button" onClick={requestStandUp}>
          Se relever
        </button>
      )}
      {showCaptureUi && mode === 'customize' && (
        <div className="customize-ui">
          <div className="customize-rotation">
            <button type="button" onClick={() => rotateSelectedObject(-1)} disabled={!selectedObjectId && !placingObjectId}>
              {'<'}
            </button>
            <button type="button" onClick={() => rotateSelectedObject(1)} disabled={!selectedObjectId && !placingObjectId}>
              {'>'}
            </button>
            {selectedObject?.canStore && !placingObjectId && (
              <button type="button" onClick={storeSelectedObject}>
                Ranger
              </button>
            )}
          </div>
          {placingObjectId ? (
            <div className="customize-placement-actions">
              <button
                className="customize-done"
                type="button"
                onClick={confirmPlacement}
                disabled={!placementPreview?.isValid || !placementLocked}
              >
                Poser
              </button>
              <button className="customize-cancel" type="button" onClick={cancelPlacement}>
                Annuler
              </button>
            </div>
          ) : (
            <button className="customize-done" type="button" onClick={closeCustomizationMode}>
              Valider
            </button>
          )}
        </div>
      )}
      {showCaptureUi && mode === 'customize' && (
        <ObjectInventorySheet
          open={isObjectInventoryOpen}
          cards={inventoryCards}
          placingObjectId={placingObjectId}
          onToggle={() => setIsObjectInventoryOpen((current) => !current)}
          onSelect={beginPlaceObject}
        />
      )}
      <SkinMenu
        open={showCaptureUi && isSkinMenuOpen}
        coins={coins}
        skins={ballSkins}
        previewIndex={previewIndex}
        selectedSkinId={selectedSkinId}
        ownedSkinIds={ownedSkins}
        onClose={closeSkinMenu}
        onPrevious={() => goPreview(-1)}
        onNext={() => goPreview(1)}
        onBuy={buyPreviewSkin}
        onSelect={selectPreviewSkin}
      />
      <EnvironmentMenu
        open={showCaptureUi && isEnvironmentMenuOpen}
        coins={coins}
        activeTab={environmentTab}
        onTabChange={setEnvironmentTab}
        floorSkins={floorSkins}
        wallSkins={availableWallSkins}
        furnitureItems={furnitureShopItems}
        furnitureCounts={furnitureCounts}
        previewFloorIndex={previewFloorIndex}
        previewWallIndex={previewWallIndex}
        selectedFloorSkinId={selectedFloorSkinId}
        selectedWallSkinId={selectedWallSkinId}
        ownedFloorSkinIds={ownedFloorSkins}
        ownedWallSkinIds={ownedWallSkins}
        applyWallToCeiling={applyWallToCeiling}
        onApplyWallToCeilingChange={setApplyWallToCeiling}
        onClose={closeEnvironmentMenu}
        onPrevious={() => goEnvironmentPreview(-1)}
        onNext={() => goEnvironmentPreview(1)}
        onBuy={buyPreviewEnvironmentSkin}
        onSelect={selectPreviewEnvironmentSkin}
        onBuyFurniture={buyFurnitureObject}
      />
    </main>
  )

  if (isAdminMode || isVerticalFrameMode) {
    return (
      <div className="admin-viewport">
        <div className="admin-frame">{gameView}</div>
      </div>
    )
  }

  return gameView
}

export default App

useGLTF.preload('/models/ball/ballon.glb')
useGLTF.preload('/models/dragon.glb')
useFBX.preload('/models/player/player-boy01.fbx')
useFBX.preload('/models/player/player-idle.fbx')
useFBX.preload('/models/player/player-walk.fbx')
useFBX.preload('/models/player/player-run.fbx')
useFBX.preload('/models/player/player-kick.fbx')
useFBX.preload('/models/Waving.fbx')
useFBX.preload('/models/Wave Hip Hop Dance.fbx')
useFBX.preload('/models/player/pointing-up.fbx')
useFBX.preload('/models/player/player-jump-start.fbx')
useFBX.preload('/models/player/player-jump-loop.fbx')
useFBX.preload('/models/player/player-jump-land.fbx')
useFBX.preload('/models/player/Stand To Sit.fbx')
useFBX.preload('/models/player/Sitting Idle.fbx')
useFBX.preload('/models/player/Stand Up.fbx')
useFBX.preload('/models/placeables/modular-sofa/modular-sofa.fbx')
useTexture.preload('/models/placeables/modular-sofa/tripo_convert_9412eb1b-7c85-49b7-86b8-96b1b5cc9732.fbm/modularsofa3dmodel_basecolor.JPEG')
Object.values(objectCatalog).forEach((item) => {
  if (item.modelUrl) useGLTF.preload(item.modelUrl)
  if (item.thumbnailModelUrl?.endsWith('.fbx')) useFBX.preload(item.thumbnailModelUrl)
  if (item.thumbnailTextureUrl) useTexture.preload(item.thumbnailTextureUrl)
})
ballSkins.forEach((skin) => useTexture.preload(skin.texture))
floorSkins.forEach((skin) => useTexture.preload(skin.texture))
wallSkins.forEach((skin) => useTexture.preload(skin.texture))
