import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, Html, OrthographicCamera, useAnimations, useFBX, useGLTF, useTexture } from '@react-three/drei'
import { BallCollider, CapsuleCollider, CuboidCollider, Physics, RigidBody, useRapier } from '@react-three/rapier'
import { ACESFilmicToneMapping, BackSide, Box3, CanvasTexture, DoubleSide, Euler, FrontSide, LinearFilter, Matrix4, LoopOnce, LoopRepeat, MathUtils, Mesh, PCFShadowMap, PlaneGeometry, Quaternion, Raycaster, RepeatWrapping, SRGBColorSpace, Vector2, Vector3 } from 'three'
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createEditableObjectInstance, defaultEditableObjects, objectCatalog, shopObjectIds } from './gameObjects/placeableObjects'
import { isSupabaseConfigured } from './lib/supabase'
import { addPlayerCoins, getCurrentUser, loadPlayerProgress, loadPlayerPublicWorld, onAuthStateChange, savePlayerProgress, signInWithPassword, signOut, signUpWithPassword } from './services/progressService'
import { connectMultiplayerSession, connectOnlinePresence, createSessionFromRequest, createVisitRequest, isMultiplayerAvailable } from './services/multiplayerService'
import { connectColyseusVisitSession } from './services/colyseusSessionService'
import { downloadBlob, generateThumbnailBlob } from './tools/thumbnails/generateThumbnailBlob'
import OutdoorNeighborhood from './world/OutdoorNeighborhood'
import OutdoorBounds from './world/OutdoorBounds'
import { OUTDOOR_HALF_SIZE, OUTDOOR_PLAYER_COLLIDERS, PLAYER_PLOT_SIZE } from './world/outdoorData'
import { getTerrainHeight } from './world/terrain/terrainGeometry'
import { getRoomBounds, houseLayout, mainRoom, outsideDoorOpening, secondRoom } from './world/house/houseLayout'
import { getWallColliderTransform, splitWallIntoSolidRects } from './world/house/wallUtils'
import GableRoof from './world/house/GableRoof'
import LeanToRoof from './world/house/LeanToRoof'
import PlayerHouse from './world/house/PlayerHouse'

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
const MAX_RENDER_DPR = 1.5
const MIN_RENDER_DPR = 0.45
const TARGET_MAX_RENDER_PIXELS = 2_200_000
const MIN_DYNAMIC_RENDER_SCALE = 0.82
const MAX_DYNAMIC_RENDER_SCALE = 1
const LOW_FPS_THRESHOLD = 48
const HIGH_FPS_THRESHOLD = 57
const FPS_SAMPLE_WINDOW_SECONDS = 2
const RENDER_SCALE_STEP = 0.05
const BASE_CAMERA_VERTICAL_FOV = 52
const MAX_CAMERA_HORIZONTAL_FOV = 72
const MULTIPLAYER_INTERP_DELAY_MS = 150
const MULTIPLAYER_PLAYER_SEND_INTERVAL = 1 / 20
const MULTIPLAYER_BALL_ACTIVE_SEND_INTERVAL = 1 / 20
const MULTIPLAYER_BALL_SLEEP_SEND_INTERVAL = 1 / 5
const MULTIPLAYER_MAX_EXTRAPOLATION_MS = 180
const MULTIPLAYER_REMOTE_SNAP_DISTANCE = 4
const MULTIPLAYER_REMOTE_VISUAL_SMOOTHING = 10
const ThumbnailTool = lazy(() => import('./tools/ThumbnailTool.jsx'))
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
const ZONES = {
  interior: 'interior',
  secondRoom: 'secondRoom',
  outside: 'outside',
}
const MAIN_ROOM_BOUNDS = getRoomBounds(mainRoom)
const OUTDOOR_DOOR_POSITION = {
  x: MAIN_ROOM_BOUNDS.minX,
  y: 1.1,
  z: outsideDoorOpening.centerZ,
}
const OUTDOOR_ENTRY_POSITION = {
  x: MAIN_ROOM_BOUNDS.minX - 2.2,
  y: 0.35,
  z: outsideDoorOpening.centerZ,
}
const PLAYER_SPAWNS = {
  interior: [0, PLAYER_HEIGHT, 2.2],
  outside: [OUTDOOR_ENTRY_POSITION.x, PLAYER_HEIGHT, OUTDOOR_ENTRY_POSITION.z],
}
const DOOR_INTERACTION_DISTANCE = 1.25
const PLAY_AREA_LIMITS = {
  interior: { minX: -ROOM_LIMIT, maxX: ROOM_LIMIT, minZ: -ROOM_LIMIT, maxZ: ROOM_LIMIT },
  secondRoom: { minX: -ROOM_LIMIT, maxX: ROOM_LIMIT, minZ: -ROOM_LIMIT, maxZ: ROOM_LIMIT },
  outside: { minX: -38, maxX: 38, minZ: -38, maxZ: 38 },
}
const CAMERA_SETTINGS = {
  interior: { distance: CAMERA_DISTANCE, height: CAMERA_HEIGHT, minY: 0.35, maxY: 4.7 },
  secondRoom: { distance: CAMERA_DISTANCE, height: CAMERA_HEIGHT, minY: 0.35, maxY: 4.7 },
  outside: { distance: 6.5, height: 2.2, minY: 0.55, maxY: 14 },
}
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
const PARCEL_HALF = PLAYER_PLOT_SIZE / 2
const CUSTOM_ROOM_BOUNDS = { minX: -PARCEL_HALF, maxX: PARCEL_HALF, minZ: -PARCEL_HALF, maxZ: PARCEL_HALF }
const CUSTOM_GRID_SIZE = 0.25
const CUSTOM_PLACEMENT_RAY_START_Y = 30
const TV_INTERACTION_DISTANCE = 1.35
const TV_MENU_EVENT = 'lab-tv-open-menu'
let activeNearbyTvId = null
const MAIN_ROOM = { width: mainRoom.size[0], depth: mainRoom.size[2], height: mainRoom.size[1] }
const WALL_REPEAT_X_PER_UNIT = 3.4 / 12
const WALL_REPEAT_Y_PER_UNIT = 1.9 / 5
const DEFAULT_CEILING_TEXTURE = '/textures/environment/walls/mur-paint.png'
const EXTERIOR_WALL_TEXTURE = '/textures/environment/walls/mur-paint.png'
const EXTERIOR_WALL_COLOR = '#f3ead6'

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

function clampCameraInPlayableVolume(x, y, z, currentZone = ZONES.interior) {
  const limits = PLAY_AREA_LIMITS[currentZone] ?? PLAY_AREA_LIMITS.interior
  const settings = CAMERA_SETTINGS[currentZone] ?? CAMERA_SETTINGS.interior
  const zMax = currentZone === ZONES.interior || currentZone === ZONES.secondRoom ? 4.94 : limits.maxZ
  const clampedX = MathUtils.clamp(x, limits.minX, limits.maxX)
  const clampedY = MathUtils.clamp(y, settings.minY, settings.maxY)
  const clampedZ = MathUtils.clamp(z, limits.minZ, zMax)
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

function HouseInterior({ floorTexturePath, wallTexturePath, ceilingTexturePath, hideCeiling, hideRoof }) {
  const floorColorMap = useTexture(floorTexturePath)
  const wallColorMap = useTexture(wallTexturePath)
  const ceilingColorMap = useTexture(ceilingTexturePath)
  const exteriorWallTexture = useTexture(EXTERIOR_WALL_TEXTURE)
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

  return (
    <>
      <HouseWalls wallTexture={wallColorMap} />
      <mesh position={[0, MAIN_ROOM.height - 0.02, 0]} visible={!hideCeiling}>
        <boxGeometry args={[MAIN_ROOM.width, 0.1, MAIN_ROOM.depth]} />
        <meshStandardMaterial map={ceilingTexture} color="#e6edf6" side={BackSide} />
      </mesh>
      <mesh position={[secondRoom.position[0], secondRoom.size[1] - 0.02, secondRoom.position[2]]} visible={!hideCeiling}>
        <boxGeometry args={[secondRoom.size[0], 0.1, secondRoom.size[2]]} />
        <meshStandardMaterial map={ceilingTexture} color="#edf1f5" side={BackSide} />
      </mesh>
      {!hideRoof && (
        <>
          <GableRoof
            width={MAIN_ROOM.width}
            depth={MAIN_ROOM.depth}
            wallTopY={MAIN_ROOM.height}
            gableBaseY={MAIN_ROOM.height}
            pitch={32}
            overhang={0.42}
            thickness={0.14}
            wallThickness={houseLayout.wallThickness}
            color="#8b4c3f"
            gableColor={EXTERIOR_WALL_COLOR}
            gableTexture={exteriorWallTexture}
          />
          <group position={secondRoom.position}>
            <LeanToRoof
              width={secondRoom.size[0]}
              depth={secondRoom.size[2]}
              wallTopY={secondRoom.size[1]}
              attachSide="south"
              rise={MAIN_ROOM.height - secondRoom.size[1]}
              overhang={0.34}
              overhangAttached={0}
              thickness={0.12}
              wallThickness={houseLayout.wallThickness}
              color="#8b4c3f"
              gableColor={EXTERIOR_WALL_COLOR}
              gableTexture={exteriorWallTexture}
            />
          </group>
        </>
      )}

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[MAIN_ROOM.width, MAIN_ROOM.depth]} />
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

    </>
  )
}

function WallBlockMaterial({ attach, side, width, height, wallTexture, exteriorTexture, capColor = '#d8d0c4' }) {
  const materialColor = side?.color ?? capColor
  const sideMaterial = side?.material
  const isExterior = side?.type === 'outside'
  const repeatedTexture = useMemo(() => {
    if (!side) return null
    const sourceTexture = isExterior ? exteriorTexture : wallTexture
    if (!isExterior && sideMaterial !== 'active_wall') return null
    const next = sourceTexture.clone()
    next.wrapS = RepeatWrapping
    next.wrapT = RepeatWrapping
    next.repeat.set(
      Math.max(0.01, width * WALL_REPEAT_X_PER_UNIT),
      Math.max(0.01, height * WALL_REPEAT_Y_PER_UNIT),
    )
    next.colorSpace = SRGBColorSpace
    next.needsUpdate = true
    return next
  }, [exteriorTexture, height, isExterior, side, sideMaterial, wallTexture, width])

  useEffect(() => {
    return () => repeatedTexture?.dispose()
  }, [repeatedTexture])

  if (isExterior) {
    return (
      <meshStandardMaterial
        attach={attach}
        map={repeatedTexture}
        color={EXTERIOR_WALL_COLOR}
        roughness={0.82}
        polygonOffset
        polygonOffsetFactor={-1}
        polygonOffsetUnits={-1}
      />
    )
  }

  if (sideMaterial === 'active_wall') {
    return (
      <meshStandardMaterial
        attach={attach}
        map={repeatedTexture}
        color="#e6edf6"
        roughness={0.68}
        metalness={0.03}
        polygonOffset
        polygonOffsetFactor={-0.5}
        polygonOffsetUnits={-0.5}
      />
    )
  }

  return <meshStandardMaterial attach={attach} color={materialColor} roughness={0.78} />
}

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

function WallVolume({ wall, rect, wallTexture, exteriorTexture }) {
  const transform = getWallColliderTransform(wall, rect)
  const materialSlots = useMemo(() => getWallMaterialSlots(wall), [wall])
  const args = [
    transform.args[0] * 2,
    transform.args[1] * 2,
    transform.args[2] * 2,
  ]
  const textureWidth = transform.renderWidth ?? rect.width
  const textureHeight = rect.height
  const hasExterior = materialSlots.some((side) => side?.type === 'outside')
  const capColor = hasExterior ? EXTERIOR_WALL_COLOR : '#d8d0c4'

  return (
    <mesh position={transform.position} rotation={transform.rotation} castShadow receiveShadow>
      <boxGeometry args={args} />
      {materialSlots.map((side, index) => (
        <WallBlockMaterial
          key={`${rect.id}-material-${index}`}
          attach={`material-${index}`}
          side={side}
          width={textureWidth}
          height={textureHeight}
          wallTexture={wallTexture}
          exteriorTexture={exteriorTexture}
          capColor={capColor}
        />
      ))}
    </mesh>
  )
}

function HouseWalls({ wallTexture }) {
  const exteriorTexture = useTexture(EXTERIOR_WALL_TEXTURE)
  const walls = houseLayout.walls

  return (
    <>
      {walls.flatMap((wall) =>
        splitWallIntoSolidRects(wall).map((rect) => (
          <WallVolume
            key={rect.id}
            wall={wall}
            rect={rect}
            wallTexture={wallTexture}
            exteriorTexture={exteriorTexture}
          />
        )),
      )}
      <HouseOpeningReveals walls={walls} />
    </>
  )
}

function HouseOpeningReveals({ walls }) {
  const revealColor = '#d8d0c4'

  const makeReveal = (wall, key, center, y, width, height) => {
    const transform = getWallColliderTransform(wall, { center, y, width, height })
    return (
      <mesh key={key} position={transform.position} rotation={transform.rotation}>
        <boxGeometry args={[width, height, wall.thickness + 0.03]} />
        <meshStandardMaterial color={revealColor} roughness={0.72} />
      </mesh>
    )
  }

  return (
    <>
      {walls.flatMap((wall) =>
        (wall.openings ?? []).flatMap((opening) => {
          const wallBottom = wall.bottom ?? wall.bottomY ?? 0
          const bottom = opening.bottom ?? 0
          const min = opening.center - opening.width * 0.5
          const max = opening.center + opening.width * 0.5
          const centerY = wallBottom + bottom + opening.height * 0.5
          const topY = wallBottom + bottom + opening.height
          const topHeight = wall.height - (bottom + opening.height)
          const bottomRevealY = wallBottom + bottom

          return [
            makeReveal(wall, `${wall.id}-${opening.id}-reveal-left`, min, centerY, 0.05, opening.height),
            makeReveal(wall, `${wall.id}-${opening.id}-reveal-right`, max, centerY, 0.05, opening.height),
            topHeight > 0.001 && makeReveal(wall, `${wall.id}-${opening.id}-reveal-top`, opening.center, topY, opening.width, 0.05),
            bottom > 0.001 && makeReveal(wall, `${wall.id}-${opening.id}-reveal-bottom`, opening.center, bottomRevealY, opening.width, 0.05),
          ].filter(Boolean)
        }),
      )}
    </>
  )
}

function InteriorLighting({ active, hideCeiling, roomLightOn = true, lightColor = '#ffffff' }) {
  if (!active) return null

  return (
    <>
      <color attach="background" args={[roomLightOn ? '#eef3f8' : '#04060a']} />
      {!hideCeiling && <fog attach="fog" args={[roomLightOn ? '#eef3f8' : '#04060a', 10, 24]} />}
      <ambientLight intensity={roomLightOn ? 0.65 : 0.45} color={roomLightOn ? lightColor : '#6878a0'} />
      <hemisphereLight args={[roomLightOn ? lightColor : '#3a4a6a', '#10131a', roomLightOn ? 0.9 : 0.5]} />
      <directionalLight position={[4, 7, 5]} intensity={roomLightOn ? 1.4 : 0} color={roomLightOn ? lightColor : '#ffffff'} />
      <directionalLight position={[-3, 5, -4]} intensity={roomLightOn ? 0.6 : 0} color={roomLightOn ? lightColor : '#ffffff'} />
      {roomLightOn && <Environment preset="city" environmentIntensity={0.15} />}
    </>
  )
}

const LIGHT_SWITCH_POS = { x: -4.86, z: -1.3 }
const LIGHT_SWITCH_DISTANCE = 1.5

function LightSwitchTrigger({ playerPositionRef, enabled, onNearChange }) {
  const nearRef = useRef(false)
  useFrame(() => {
    if (!enabled) {
      if (nearRef.current) { nearRef.current = false; onNearChange(false) }
      return
    }
    const p = playerPositionRef.current
    const dist = Math.hypot(p.x - LIGHT_SWITCH_POS.x, p.z - LIGHT_SWITCH_POS.z)
    const next = dist <= LIGHT_SWITCH_DISTANCE
    if (next !== nearRef.current) { nearRef.current = next; onNearChange(next) }
  })
  return null
}

function LightSwitch({ isOn, isNear, onOpen, mode }) {
  const WALL_X = -4.86
  const SWITCH_Y = 1.1
  const SWITCH_Z = -1.3
  const plateColor = '#f0ece4'
  const rockerOnColor = '#fffbe6'
  const rockerOffColor = '#444'

  return (
    <group position={[WALL_X, SWITCH_Y, SWITCH_Z]} rotation={[0, Math.PI / 2, 0]}>
      <mesh>
        <boxGeometry args={[0.086, 0.086, 0.018]} />
        <meshStandardMaterial color={plateColor} roughness={0.7} metalness={0.05} />
      </mesh>
      <mesh position={[0, isOn ? 0.012 : -0.012, 0.01]} rotation={[isOn ? -0.18 : 0.18, 0, 0]}>
        <boxGeometry args={[0.042, 0.056, 0.012]} />
        <meshStandardMaterial
          color={isOn ? rockerOnColor : rockerOffColor}
          emissive={isOn ? '#fff8c0' : '#000000'}
          emissiveIntensity={isOn ? 0.4 : 0}
          roughness={0.4}
        />
      </mesh>
      {isNear && mode === 'play' && (
        <Html position={[0, 0, 0.02]} center>
          <div
            onPointerDown={(e) => { e.stopPropagation(); onOpen() }}
            style={{ width: 60, height: 60, cursor: 'pointer', borderRadius: 4 }}
          />
        </Html>
      )}
    </group>
  )
}

function PhysicsBounds() {
  const wallSegments = houseLayout.walls
    .flatMap((wall) =>
      splitWallIntoSolidRects(wall).map((rect) => ({
        id: rect.id,
        ...getWallColliderTransform(wall, rect),
      })),
    )

  return (
    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider args={[5, 0.2, 5]} position={[0, -0.2, 0]} />
      {wallSegments.map((segment) => (
        <CuboidCollider key={segment.id} args={segment.args} position={segment.position} rotation={segment.rotation} />
      ))}
    </RigidBody>
  )
}

function LightColorWheel({ onChange }) {
  const canvasRef = useRef(null)
  const isDragging = useRef(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const size = canvas.width
    const cx = size / 2
    const cy = size / 2
    const radius = size / 2 - 1
    const imageData = ctx.createImageData(size, size)
    const data = imageData.data

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - cx
        const dy = y - cy
        const dist = Math.hypot(dx, dy)
        if (dist <= radius) {
          const hue = ((Math.atan2(dy, dx) * 180 / Math.PI) + 360) % 360
          const sat = dist / radius
          const h = hue / 60
          const i = Math.floor(h)
          const f = h - i
          const p = 1 - sat
          const q = 1 - sat * f
          const t = 1 - sat * (1 - f)
          let r, g, b
          switch (i % 6) {
            case 0: r = 1; g = t; b = p; break
            case 1: r = q; g = 1; b = p; break
            case 2: r = p; g = 1; b = t; break
            case 3: r = p; g = q; b = 1; break
            case 4: r = t; g = p; b = 1; break
            default: r = 1; g = p; b = q; break
          }
          const idx = (y * size + x) * 4
          data[idx] = Math.round(r * 255)
          data[idx + 1] = Math.round(g * 255)
          data[idx + 2] = Math.round(b * 255)
          data[idx + 3] = 255
        }
      }
    }

    ctx.putImageData(imageData, 0, 0)
  }, [])

  function pickColor(e) {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const clientX = e.clientX ?? e.touches?.[0]?.clientX
    const clientY = e.clientY ?? e.touches?.[0]?.clientY
    if (clientX == null) return
    const x = Math.round((clientX - rect.left) * (canvas.width / rect.width))
    const y = Math.round((clientY - rect.top) * (canvas.height / rect.height))
    const cx = canvas.width / 2
    const cy = canvas.height / 2
    if (Math.hypot(x - cx, y - cy) > canvas.width / 2) return
    const pixel = canvas.getContext('2d').getImageData(x, y, 1, 1).data
    const hex = '#' + [pixel[0], pixel[1], pixel[2]].map((v) => v.toString(16).padStart(2, '0')).join('')
    onChange(hex)
  }

  return (
    <canvas
      ref={canvasRef}
      width={140}
      height={140}
      style={{ width: '100%', aspectRatio: '1', borderRadius: '50%', cursor: 'crosshair', touchAction: 'none', display: 'block' }}
      onPointerDown={(e) => { isDragging.current = true; pickColor(e); e.currentTarget.setPointerCapture(e.pointerId) }}
      onPointerMove={(e) => { if (isDragging.current) pickColor(e) }}
      onPointerUp={() => { isDragging.current = false }}
    />
  )
}

function GlassContainmentRoom({ roomLightOn = true, lightColor = '#ffffff' }) {
  const [roomWidth, roomHeight, roomDepth] = secondRoom.size
  const halfWidth = roomWidth * 0.5
  const halfDepth = roomDepth * 0.5

  return (
    <group position={secondRoom.position}>
      <mesh position={[0, 0.012, 0]}>
        <boxGeometry args={[roomWidth, 0.05, roomDepth]} />
        <meshStandardMaterial color="#d4dbe3" />
      </mesh>

      <mesh position={[0, roomHeight * 0.5, -halfDepth + 0.02]}>
        <boxGeometry args={[roomWidth, roomHeight, 0.06]} />
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
          side={BackSide}
        />
      </mesh>

      <mesh position={[0, roomHeight + 0.03, -halfDepth + 0.055]}>
        <boxGeometry args={[roomWidth + 0.12, 0.06, 0.06]} />
        <meshStandardMaterial color="#9da8b3" metalness={0.45} roughness={0.35} />
      </mesh>
      <mesh position={[0, -0.03, -halfDepth + 0.055]}>
        <boxGeometry args={[roomWidth + 0.12, 0.06, 0.06]} />
        <meshStandardMaterial color="#9da8b3" metalness={0.45} roughness={0.35} />
      </mesh>
      <mesh position={[-halfWidth - 0.03, roomHeight * 0.5, -halfDepth + 0.055]}>
        <boxGeometry args={[0.06, roomHeight + 0.12, 0.06]} />
        <meshStandardMaterial color="#9da8b3" metalness={0.45} roughness={0.35} />
      </mesh>
      <mesh position={[halfWidth + 0.03, roomHeight * 0.5, -halfDepth + 0.055]}>
        <boxGeometry args={[0.06, roomHeight + 0.12, 0.06]} />
        <meshStandardMaterial color="#9da8b3" metalness={0.45} roughness={0.35} />
      </mesh>

      {roomLightOn && <pointLight position={[0, roomHeight - 0.6, 0.05]} intensity={1.45} color={lightColor} />}
    </group>
  )
}

function GlassContainmentColliders() {
  const [roomWidth, roomHeight, roomDepth] = secondRoom.size
  const halfWidth = roomWidth * 0.5
  const halfDepth = roomDepth * 0.5
  const halfHeight = roomHeight * 0.5
  const [, , roomZ] = secondRoom.position

  return (
    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider args={[halfWidth, halfHeight, 0.06]} position={[0, halfHeight, roomZ - halfDepth + 0.02]} />
    </RigidBody>
  )
}

function Ball({ ballRef, skinTexturePath, spawnPosition = [0, 3.2, 0], linearDamping = 0.35, angularDamping = 0.4 }) {
  const { gl } = useThree()
  const ballSkin = useGLTF('/models/ball/ballon.glb')
  const skinTexture = useTexture(skinTexturePath)
  skinTexture.colorSpace = SRGBColorSpace
  skinTexture.anisotropy = gl.capabilities.getMaxAnisotropy()
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
      position={spawnPosition}
      restitution={0.82}
      friction={0.55}
      linearDamping={linearDamping}
      angularDamping={angularDamping}
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

function Player({
  touchRef,
  ballRef,
  playerPositionRef,
  playerVelocityRef,
  mode,
  currentZone,
  spawnRequest,
  goalObject,
  seatedState,
  onSeatedPhaseChange,
  cameraOnCat = false,
  catPositionRef = null,
  localPlayerStateRef = null,
  onKickIntent = null,
}) {
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
  const [isPlayerVisible, setIsPlayerVisible] = useState(true)
  const [playerMotion, setPlayerMotion] = useState('idle')
  const keyboardRef = useKeyboardInput()
  const { camera } = useThree()
  const { world, rapier } = useRapier()

  useEffect(() => {
    if (!spawnRequest) return
    const [x, y, z] = spawnRequest.position
    playerPosRef.current.x = x
    playerPosRef.current.y = y
    playerPosRef.current.z = z
    playerPositionRef.current.x = x
    playerPositionRef.current.y = y
    playerPositionRef.current.z = z
    planarVelocityRef.current.x = 0
    planarVelocityRef.current.z = 0
    filteredInputRef.current.x = 0
    filteredInputRef.current.y = 0
    velocityYRef.current = 0
    onGroundRef.current = true
    wasOnGroundRef.current = true
    playerBodyRef.current?.setNextKinematicTranslation({ x, y, z })
    visualRef.current?.position.set(x, y, z)
    cameraLookRef.current.x = x
    cameraLookRef.current.y = y + 0.55
    cameraLookRef.current.z = z
  }, [spawnRequest, playerPositionRef])

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return
      if (getKeyboardKey(event) !== '=' && event.code !== 'Equal') return

      const target = event.target
      const isTyping =
        target instanceof HTMLElement &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      if (isTyping) return

      event.preventDefault()
      setIsPlayerVisible((current) => !current)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

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
      if (localPlayerStateRef) {
        localPlayerStateRef.current = {
          position: [nextX, nextY, nextZ],
          rotationY: targetYaw,
          motion: nextMotion,
          zone: currentZone,
        }
      }

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

      const clampedCamera = clampCameraInPlayableVolume(targetCameraX, targetCameraY, targetCameraZ, currentZone)
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

    const limits = PLAY_AREA_LIMITS[currentZone] ?? PLAY_AREA_LIMITS.interior
    nextX = MathUtils.clamp(nextX, limits.minX, limits.maxX)
    nextZ = MathUtils.clamp(nextZ, limits.minZ, limits.maxZ)

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
    const floorY = currentZone === ZONES.outside
      ? getTerrainHeight(nextX, nextZ) + PLAYER_HEIGHT
      : PLAYER_HEIGHT
    let nextY = onGroundRef.current ? floorY : playerPosRef.current.y + velocityYRef.current * delta
    const distanceToGround = Math.max(0, nextY - floorY)
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

    if (nextY <= floorY) {
      nextY = floorY
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

    if (
      currentZone !== ZONES.outside &&
      collidesWithGoalFrame(nextX, nextY, nextZ, goalObject)
    ) {
      nextX = prevX
      nextZ = prevZ
      planarVelocityRef.current.x = 0
      planarVelocityRef.current.z = 0
    }

    if (currentZone === ZONES.outside && collidesWithOutdoorObstacle(nextX, nextZ)) {
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
    if (playerVelocityRef) {
      playerVelocityRef.current.x = planarVelocityRef.current.x
      playerVelocityRef.current.z = planarVelocityRef.current.z
    }

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
          const impulse = { x: kickContact.forwardX * power, y: lift, z: kickContact.forwardZ * power }
          const shouldApplyLocalImpulse = onKickIntent?.({ impulse, power, lift }) !== false
          if (shouldApplyLocalImpulse) {
            ball.applyImpulse(impulse, true)
          }
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
    if (localPlayerStateRef) {
      localPlayerStateRef.current = {
        position: [nextX, nextY, nextZ],
        rotationY: visualRef.current.rotation.y,
        motion: nextMotion,
        zone: currentZone,
      }
    }

    const pitch = touch.cameraPitch
    const cameraSettings = CAMERA_SETTINGS[currentZone] ?? CAMERA_SETTINGS.interior
    const cameraDistance = touch.cameraDistance ?? cameraSettings.distance

    const focusX = cameraOnCat && catPositionRef ? catPositionRef.current.x : nextX
    const focusY = cameraOnCat && catPositionRef ? catPositionRef.current.y : nextY
    const focusZ = cameraOnCat && catPositionRef ? catPositionRef.current.z : nextZ
    const lookHeight = cameraOnCat ? 0.3 : 0.55

    const horizontalDistance = cameraDistance * Math.cos(pitch)
    const desiredX = focusX + Math.sin(yaw) * horizontalDistance
    const desiredY = focusY + cameraSettings.height + Math.sin(pitch) * cameraDistance
    const desiredZ = focusZ + Math.cos(yaw) * horizontalDistance

    let targetX = desiredX
    let targetY = desiredY
    let targetZ = desiredZ

    const originY = focusY + 0.7
    const dirX = desiredX - focusX
    const dirY = desiredY - originY
    const dirZ = desiredZ - focusZ
    const rayDistance = Math.hypot(dirX, dirY, dirZ)

    if (rayDistance > 0.001) {
      const inv = 1 / rayDistance
      const rayDir = { x: dirX * inv, y: dirY * inv, z: dirZ * inv }
      const ray = new rapier.Ray({ x: focusX, y: originY, z: focusZ }, rayDir)
      const hit = world.castRay(ray, rayDistance, true)
      if (hit && hit.toi < rayDistance) {
        const safe = Math.max(0.2, hit.toi - 0.14)
        targetX = focusX + rayDir.x * safe
        targetY = originY + rayDir.y * safe
        targetZ = focusZ + rayDir.z * safe
      }
    }

    const clampedTarget = clampCameraInPlayableVolume(targetX, targetY, targetZ, currentZone)
    camera.position.x = MathUtils.damp(camera.position.x, clampedTarget.x, 12, delta)
    camera.position.y = MathUtils.damp(camera.position.y, clampedTarget.y, 12, delta)
    camera.position.z = MathUtils.damp(camera.position.z, clampedTarget.z, 12, delta)

    cameraLookRef.current.x = MathUtils.damp(cameraLookRef.current.x, focusX, 16, delta)
    cameraLookRef.current.y = MathUtils.damp(cameraLookRef.current.y, focusY + lookHeight, 16, delta)
    cameraLookRef.current.z = MathUtils.damp(cameraLookRef.current.z, focusZ, 16, delta)
    camera.lookAt(cameraLookRef.current.x, cameraLookRef.current.y, cameraLookRef.current.z)
  })

  return (
    <>
      <RigidBody
        ref={playerBodyRef}
        type="kinematicPosition"
        colliders={false}
        position={PLAYER_SPAWNS.interior}
      >
        <CapsuleCollider args={[PLAYER_CAPSULE_HALF_HEIGHT, PLAYER_CAPSULE_RADIUS]} />
      </RigidBody>
      <group ref={visualRef} position={PLAYER_SPAWNS.interior} visible={isPlayerVisible}>
        <PlayerAvatar motion={playerMotion} />
      </group>
    </>
  )
}

function PlayerAvatar({ motion }) {
  const { gl } = useThree()
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
    const maxAnisotropy = gl.capabilities.getMaxAnisotropy()
    next.traverse((object) => {
      if (object instanceof Mesh) {
        object.castShadow = true
        object.receiveShadow = true
        object.frustumCulled = false
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        materials.forEach((mat) => {
          if (!mat) return
          ;[mat.map, mat.normalMap, mat.roughnessMap, mat.metalnessMap, mat.emissiveMap].forEach((tex) => {
            if (tex) {
              tex.anisotropy = maxAnisotropy
              tex.needsUpdate = true
            }
          })
        })
      }
    })
    return next
  }, [model, gl])

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
        if (name === 'sitDown' || name === 'sittingIdle' || name === 'standUp' || name === 'walk' || name === 'run') {
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

function RemotePlayer({ state, label = 'Visiteur', transport = 'none', serverTimeOffsetRef = null }) {
  const groupRef = useRef(null)
  const samplesRef = useRef([])
  const lastSeqRef = useRef(-1)
  const displayedMotionRef = useRef(state?.motion ?? 'idle')
  const motionSwitchAtRef = useRef(0)
  const [, forceMotionRender] = useState(0)
  const targetRef = useRef({
    position: state?.position ?? [0, PLAYER_HEIGHT, 2.2],
    rotationY: state?.rotationY ?? 0,
    velocity: [0, 0, 0],
    receivedAt: Date.now(),
    motion: state?.motion ?? 'idle',
  })

  // Initialize group position imperatively on mount so R3F never resets it via JSX props on re-renders
  useLayoutEffect(() => {
    const group = groupRef.current
    if (!group || !state?.position) return
    group.position.fromArray(state.position)
    group.rotation.y = state.rotationY ?? 0
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!state?.position) return
    const seq = state.seq ?? 0
    if (seq <= lastSeqRef.current) return
    lastSeqRef.current = seq
    const sample = {
      position: state.position,
      rotationY: Number.isFinite(state.rotationY) ? state.rotationY : 0,
      velocity: Array.isArray(state.velocity) ? state.velocity : [0, 0, 0],
      motion: state.motion || 'idle',
      time: transport === 'colyseus' && Number.isFinite(state.serverTime) ? state.serverTime : Date.now(),
    }
    samplesRef.current.push(sample)
    if (samplesRef.current.length > 14) samplesRef.current.splice(0, samplesRef.current.length - 14)

    targetRef.current = {
      position: sample.position,
      rotationY: sample.rotationY,
      velocity: sample.velocity,
      motion: sample.motion,
      receivedAt: Date.now(),
    }
  }, [state, transport])

  useFrame((_, delta) => {
    const group = groupRef.current
    if (!group) return
    let x
    let y
    let z
    let rotationY

    if (transport === 'colyseus' && samplesRef.current.length) {
      const samples = samplesRef.current
      const renderAt = Date.now() + (serverTimeOffsetRef?.current ?? 0) - MULTIPLAYER_INTERP_DELAY_MS
      while (samples.length > 2 && samples[1].time <= renderAt) samples.shift()

      const previous = samples[0]
      const next = samples[1]
      x = previous.position[0]
      y = previous.position[1]
      z = previous.position[2]
      rotationY = previous.rotationY

      if (next) {
        const span = Math.max(1, next.time - previous.time)
        const alpha = MathUtils.clamp((renderAt - previous.time) / span, 0, 1)
        // Hermite cubic spline: uses velocity at both endpoints for smooth curves
        const spanSec = span / 1000
        const a2 = alpha * alpha
        const a3 = a2 * alpha
        const h00 = 2 * a3 - 3 * a2 + 1
        const h10 = a3 - 2 * a2 + alpha
        const h01 = -2 * a3 + 3 * a2
        const h11 = a3 - a2
        const v0 = previous.velocity
        const v1 = next.velocity
        x = h00 * previous.position[0] + h10 * v0[0] * spanSec + h01 * next.position[0] + h11 * v1[0] * spanSec
        y = h00 * previous.position[1] + h10 * v0[1] * spanSec + h01 * next.position[1] + h11 * v1[1] * spanSec
        z = h00 * previous.position[2] + h10 * v0[2] * spanSec + h01 * next.position[2] + h11 * v1[2] * spanSec
        const rotationDelta = MathUtils.euclideanModulo(next.rotationY - previous.rotationY + Math.PI, Math.PI * 2) - Math.PI
        rotationY = previous.rotationY + rotationDelta * alpha
      } else {
        const extrapolateSeconds = MathUtils.clamp(
          (renderAt - previous.time) / 1000,
          0,
          MULTIPLAYER_MAX_EXTRAPOLATION_MS / 1000,
        )
        x += (previous.velocity?.[0] ?? 0) * extrapolateSeconds
        y += (previous.velocity?.[1] ?? 0) * extrapolateSeconds
        z += (previous.velocity?.[2] ?? 0) * extrapolateSeconds
      }
    } else {
      const target = targetRef.current
      const ageSeconds = MathUtils.clamp((Date.now() - target.receivedAt) / 1000, 0, MULTIPLAYER_MAX_EXTRAPOLATION_MS / 1000)
      const leadSeconds = Math.min(ageSeconds + 0.06, 0.16)
      x = target.position[0] + (target.velocity?.[0] ?? 0) * leadSeconds
      y = target.position[1] + (target.velocity?.[1] ?? 0) * leadSeconds
      z = target.position[2] + (target.velocity?.[2] ?? 0) * leadSeconds
      rotationY = target.rotationY
    }

    const distance = Math.hypot(group.position.x - x, group.position.y - y, group.position.z - z)
    if (distance > MULTIPLAYER_REMOTE_SNAP_DISTANCE) {
      group.position.set(x, y, z)
    } else {
      const smoothing = transport === 'colyseus' ? MULTIPLAYER_REMOTE_VISUAL_SMOOTHING : 10
      group.position.x = MathUtils.damp(group.position.x, x, smoothing, delta)
      group.position.y = MathUtils.damp(group.position.y, y, smoothing, delta)
      group.position.z = MathUtils.damp(group.position.z, z, smoothing, delta)
    }
    group.rotation.y = dampAngle(group.rotation.y, rotationY, transport === 'colyseus' ? 10 : 12, delta)

    const nextMotion = targetRef.current.motion || 'idle'
    const now = Date.now()
    if (nextMotion !== displayedMotionRef.current && now - motionSwitchAtRef.current > 110) {
      displayedMotionRef.current = nextMotion
      motionSwitchAtRef.current = now
      forceMotionRender((value) => value + 1)
    }
  })

  if (!state?.position) return null

  return (
    <group ref={groupRef}>
      <PlayerAvatar motion={displayedMotionRef.current || 'idle'} />
      <Html position={[0, 1.65, 0]} center distanceFactor={8} occlude>
        <div className="remote-player-label">{label}</div>
      </Html>
    </group>
  )
}

function ControlsOverlay({ touchRef, adminCameraControls = false, uiHidden = false, onTap }) {
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
      return
    }
    const dx = event.clientX - emotePressRef.current.x
    const dy = event.clientY - emotePressRef.current.y
    const isTap = Math.hypot(dx, dy) < 8
    if (isTap && onTap) onTap(event.clientX, event.clientY)
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

function MultiplayerPanel({
  configured,
  user,
  open,
  role,
  session,
  onlinePlayers,
  incomingRequest,
  outgoingRequest,
  sessionConnectionState,
  sessionTransport,
  remotePlayerState,
  message,
  onToggle,
  onRequestVisit,
  onAcceptRequest,
  onRejectRequest,
  onLeaveSession,
}) {
  const sessionLabel = role === 'host'
    ? `${session?.guestDisplayName ?? 'Visiteur'} visite ton monde`
    : role === 'guest'
      ? `Tu visites ${session?.hostDisplayName ?? 'un monde'}`
      : null

  return (
    <div className={`multiplayer-panel ${open ? 'open' : ''}`}>
      <button className="multiplayer-toggle" type="button" onClick={onToggle} aria-label="Multijoueur">
        <span className={`multiplayer-dot ${role !== 'solo' ? 'connected' : ''}`} />
        <span>Visites</span>
      </button>
      {open && (
        <div className="multiplayer-menu">
          {!configured && <p className="multiplayer-help">Supabase doit etre configure pour les visites.</p>}
          {configured && !user && <p className="multiplayer-help">Connecte ton compte pour voir les joueurs en ligne.</p>}
          {configured && user && role !== 'solo' && (
            <div className="multiplayer-session-card">
              <strong>{sessionLabel}</strong>
              <span>{role === 'guest' ? 'Mode visite: modification bloquee.' : 'La personnalisation est suspendue pendant la visite.'}</span>
              <span>
                Canal: {sessionConnectionState === 'connected' ? 'connecte' : 'connexion...'}
                {sessionTransport !== 'none' ? ` (${sessionTransport})` : ''}
                {' / '}
                Joueur distant: {remotePlayerState?.position ? 'recu' : 'en attente'}
              </span>
              <button type="button" onClick={onLeaveSession}>Quitter</button>
            </div>
          )}
          {configured && user && role === 'solo' && incomingRequest && (
            <div className="multiplayer-request-card">
              <strong>{incomingRequest.fromDisplayName} veut visiter ton monde.</strong>
              <div className="multiplayer-actions">
                <button type="button" onClick={onAcceptRequest}>Accepter</button>
                <button type="button" onClick={onRejectRequest}>Refuser</button>
              </div>
            </div>
          )}
          {configured && user && role === 'solo' && outgoingRequest && (
            <p className="multiplayer-help">Demande envoyee a {outgoingRequest.toDisplayName}.</p>
          )}
          {configured && user && role === 'solo' && (
            <>
              <div className="multiplayer-title">Joueurs en ligne</div>
              <div className="multiplayer-list">
                {onlinePlayers.length === 0 && <span className="multiplayer-empty">Personne d'autre en ligne pour l'instant.</span>}
                {onlinePlayers.map((player) => (
                  <button
                    key={player.userId}
                    type="button"
                    className="multiplayer-player"
                    onClick={() => onRequestVisit(player)}
                    disabled={Boolean(outgoingRequest)}
                  >
                    <span>{player.displayName}</span>
                    <small>{player.status === 'available' ? 'Disponible' : 'Occupe'}</small>
                  </button>
                ))}
              </div>
            </>
          )}
          {message && <div className="multiplayer-message">{message}</div>}
        </div>
      )}
    </div>
  )
}

function roundNetValue(value, precision = 100) {
  return Math.round(value * precision) / precision
}

function roundNetVector(values, precision = 100) {
  return values.map((value) => roundNetValue(value, precision))
}

function MultiplayerBridge({
  channelRef,
  role,
  localUserId,
  playerPositionRef,
  playerVelocityRef,
  localPlayerStateRef,
  remoteBallState,
  ballRef,
  guestKickQueueRef,
  hostTimeOffsetRef,
}) {
  const lastSendRef = useRef(0)
  const lastBallSendRef = useRef(0)
  const lastGuestBallPushRef = useRef(0)
  const playerSeqRef = useRef(0)
  const ballSeqRef = useRef(0)
  const guestKickSeqRef = useRef(0)
  const lastRemoteBallSeqRef = useRef(-1)

  useFrame(({ clock }) => {
    const channel = channelRef.current
    if (!channel || role === 'solo' || !localUserId) return

    const now = clock.elapsedTime
    const estimatedHostTime = Date.now() + (hostTimeOffsetRef?.current ?? 0)

    if (now - lastSendRef.current > MULTIPLAYER_PLAYER_SEND_INTERVAL) {
      const position = playerPositionRef.current
      const velocity = playerVelocityRef?.current ?? { x: 0, z: 0 }
      channel.sendPlayerState({
        seq: playerSeqRef.current++,
        hostTime: estimatedHostTime,
        position: roundNetVector([position.x, position.y, position.z]),
        rotationY: localPlayerStateRef.current.rotationY,
        velocity: roundNetVector([velocity.x, 0, velocity.z]),
        grounded: true,
        motion: localPlayerStateRef.current.motion,
        zone: localPlayerStateRef.current.zone,
        sentAt: estimatedHostTime,
      })
      lastSendRef.current = now
    }

    const ball = ballRef.current
    if (!ball) return

    if (role === 'host') {
      const nextKick = guestKickQueueRef.current.shift()
      if (nextKick?.impulse) {
        ball.applyImpulse(nextKick.impulse, true)
      }

      const p = ball.translation()
      const v = ball.linvel()
      const a = ball.angvel()
      const isBallActive = Math.hypot(v.x, v.y, v.z) > 0.08 || Math.hypot(a.x, a.y, a.z) > 0.08
      const ballInterval = isBallActive ? MULTIPLAYER_BALL_ACTIVE_SEND_INTERVAL : MULTIPLAYER_BALL_SLEEP_SEND_INTERVAL

      if (now - lastBallSendRef.current > ballInterval) {
        channel.sendBallState({
          seq: ballSeqRef.current++,
          hostTime: Date.now(),
          position: roundNetVector([p.x, p.y, p.z]),
          linvel: roundNetVector([v.x, v.y, v.z]),
          angvel: roundNetVector([a.x, a.y, a.z]),
          sentAt: Date.now(),
        })
        lastBallSendRef.current = now
      }
      return
    }

    if (
      role === 'guest' &&
      remoteBallState?.position &&
      (remoteBallState.seq ?? 0) > lastRemoteBallSeqRef.current
    ) {
      const [x, y, z] = remoteBallState.position ?? []
      const [vx, vy, vz] = remoteBallState.linvel ?? []
      const [ax, ay, az] = remoteBallState.angvel ?? []
      if ([x, y, z].every(Number.isFinite)) {
        const localPosition = ball.translation()
        const error = Math.hypot(localPosition.x - x, localPosition.y - y, localPosition.z - z)
        const correction = error < 0.5 ? 0.22 : error < 1.6 ? 0.55 : 1
        ball.setTranslation({
          x: MathUtils.lerp(localPosition.x, x, correction),
          y: MathUtils.lerp(localPosition.y, y, correction),
          z: MathUtils.lerp(localPosition.z, z, correction),
        }, true)
      }
      if ([vx, vy, vz].every(Number.isFinite)) {
        const localVelocity = ball.linvel()
        ball.setLinvel({
          x: MathUtils.lerp(localVelocity.x, vx, 0.35),
          y: MathUtils.lerp(localVelocity.y, vy, 0.35),
          z: MathUtils.lerp(localVelocity.z, vz, 0.35),
        }, true)
      }
      if ([ax, ay, az].every(Number.isFinite)) {
        const localAngularVelocity = ball.angvel()
        ball.setAngvel({
          x: MathUtils.lerp(localAngularVelocity.x, ax, 0.35),
          y: MathUtils.lerp(localAngularVelocity.y, ay, 0.35),
          z: MathUtils.lerp(localAngularVelocity.z, az, 0.35),
        }, true)
      }
      lastRemoteBallSeqRef.current = remoteBallState.seq ?? lastRemoteBallSeqRef.current
    }

    if (role === 'guest' && now - lastGuestBallPushRef.current > 0.11) {
      const playerPosition = playerPositionRef.current
      const playerVelocity = playerVelocityRef?.current
      const ballPosition = ball.translation()
      const dx = ballPosition.x - playerPosition.x
      const dz = ballPosition.z - playerPosition.z
      const distance = Math.hypot(dx, dz)
      const playerSpeed = Math.hypot(playerVelocity?.x ?? 0, playerVelocity?.z ?? 0)

      if (distance > 0.001 && distance < 0.48 && playerSpeed > 0.55) {
        const inv = 1 / distance
        const speedScale = MathUtils.clamp(playerSpeed / 3.4, 0.25, 1)
        const impulse = {
          x: dx * inv * 0.045 * speedScale,
          y: 0.012,
          z: dz * inv * 0.045 * speedScale,
        }
        ball.applyImpulse(impulse, true)
        channel.sendGuestKick({
          seq: guestKickSeqRef.current++,
          hostTime: estimatedHostTime,
          impulse,
          kind: 'body-push',
        })
        lastGuestBallPushRef.current = now
      }
    }
  })

  return null
}

// Halo d'interaction : anneau au sol qui s'agrandit et pulse quand on approche
function InteractionHalo({ isNear, color = '#ffffff', pulseColor, position }) {
  const outerRef = useRef()
  const innerRef = useRef()
  const scaleRef = useRef(0.35)
  const pulseRef = useRef(0)

  useFrame((_, delta) => {
    const target = isNear ? 1 : 0.35
    scaleRef.current += (target - scaleRef.current) * Math.min(1, 8 * delta)
    const s = scaleRef.current
    if (outerRef.current) outerRef.current.scale.set(s, s, 1)
    if (innerRef.current) {
      if (isNear) {
        pulseRef.current += delta * 2.2
        const pulse = 0.6 + 0.4 * Math.sin(pulseRef.current)
        innerRef.current.scale.set(s * pulse, s * pulse, 1)
        innerRef.current.material.opacity = 0.35 * pulse
      } else {
        pulseRef.current = 0
        innerRef.current.scale.set(s * 0.6, s * 0.6, 1)
        innerRef.current.material.opacity = 0
      }
    }
  })

  const pc = pulseColor ?? color

  return (
    <group position={position} rotation={[-Math.PI / 2, 0, 0]}>
      {/* Anneau principal */}
      <mesh ref={outerRef}>
        <ringGeometry args={[0.28, 0.42, 48]} />
        <meshBasicMaterial color={color} transparent opacity={0.75} depthWrite={false} />
      </mesh>
      {/* Disque intérieur pulsé */}
      <mesh ref={innerRef}>
        <circleGeometry args={[0.28, 48]} />
        <meshBasicMaterial color={pc} transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  )
}

function BallStation({ isNear, goalObject }) {
  const BALL_SIDE_OFFSET = 2.0
  const gx = goalObject?.position?.[0] ?? 0
  const gz = goalObject?.position?.[2] ?? GOAL_Z
  const rotY = goalObject?.rotationY ?? 0
  const tx = gx - Math.cos(rotY) * BALL_SIDE_OFFSET
  const tz = gz + Math.sin(rotY) * BALL_SIDE_OFFSET
  return (
    <InteractionHalo
      isNear={isNear}
      color="#a8c4e0"
      pulseColor="#d0e8ff"
      position={[tx, 0.02, tz]}
    />
  )
}

function EnvironmentStation({ isNear }) {
  return (
    <InteractionHalo
      isNear={isNear}
      color="#a0d4b8"
      pulseColor="#c8f0d8"
      position={[ENV_STATION_POSITION.x, 0.02, ENV_STATION_POSITION.z]}
    />
  )
}

function CustomizationStation({ isNear }) {
  return (
    <InteractionHalo
      isNear={isNear}
      color="#f2c14e"
      pulseColor="#ffe599"
      position={[CUSTOM_STATION_POSITION.x, 0.02, CUSTOM_STATION_POSITION.z]}
    />
  )
}

function OutdoorDoor() {
  const doorWidth = outsideDoorOpening.width
  const doorHeight = outsideDoorOpening.height
  const doorY = (outsideDoorOpening.bottomY ?? 0) + doorHeight * 0.5

  return (
    <group position={[OUTDOOR_DOOR_POSITION.x, 0, OUTDOOR_DOOR_POSITION.z]} rotation={[0, Math.PI / 2, 0]}>
      <mesh position={[0, doorY, 0.02]}>
        <planeGeometry args={[doorWidth, doorHeight]} />
        <meshStandardMaterial color="#8b5a3d" roughness={0.66} side={DoubleSide} />
      </mesh>
      <mesh position={[doorWidth * 0.34, doorY, 0.06]}>
        <sphereGeometry args={[0.055, 12, 8]} />
        <meshStandardMaterial color="#f1c45b" metalness={0.25} roughness={0.35} />
      </mesh>
    </group>
  )
}

function OutdoorDoorTrigger({ playerPositionRef, currentZone, onNearChange }) {
  const wasNearRef = useRef(false)

  useFrame(() => {
    const p = playerPositionRef.current
    const target = currentZone === ZONES.outside ? OUTDOOR_ENTRY_POSITION : OUTDOOR_DOOR_POSITION
    const near = Math.hypot(p.x - target.x, p.z - target.z) < DOOR_INTERACTION_DISTANCE
    if (near !== wasNearRef.current) {
      wasNearRef.current = near
      onNearChange(near)
    }
  })

  return null
}

function BallStationTrigger({ playerPositionRef, goalObject, onNearChange }) {
  const wasNearRef = useRef(false)
  const BALL_SIDE_OFFSET = 2.0

  useFrame(() => {
    const p = playerPositionRef.current
    const gx = goalObject?.position?.[0] ?? 0
    const gz = goalObject?.position?.[2] ?? GOAL_Z
    const rotY = goalObject?.rotationY ?? 0
    const tx = gx - Math.cos(rotY) * BALL_SIDE_OFFSET
    const tz = gz + Math.sin(rotY) * BALL_SIDE_OFFSET
    const near = Math.hypot(p.x - tx, p.z - tz) < 1.6
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
    <InteractionHalo
      isNear={true}
      color="#ffd447"
      pulseColor="#fff0a0"
      position={[seat.position[0], 0.02, seat.position[2]]}
    />
  )
}

const CUSTOMIZE_ZOOM_MIN = 20
const CUSTOMIZE_ZOOM_MAX = 150
const CUSTOMIZE_ZOOM_DEFAULT = 58

function CustomizationCamera({ active }) {
  const { gl } = useThree()
  const camRef = useRef()
  const zoomRef = useRef(CUSTOMIZE_ZOOM_DEFAULT)
  const pinchDistRef = useRef(null)

  useEffect(() => {
    if (active) zoomRef.current = CUSTOMIZE_ZOOM_DEFAULT
  }, [active])

  useEffect(() => {
    if (!active) return
    const canvas = gl.domElement

    const onWheel = (e) => {
      e.preventDefault()
      zoomRef.current = MathUtils.clamp(
        zoomRef.current + Math.sign(e.deltaY) * -5,
        CUSTOMIZE_ZOOM_MIN,
        CUSTOMIZE_ZOOM_MAX,
      )
    }

    const onTouchStart = (e) => {
      if (e.touches.length === 2) {
        pinchDistRef.current = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY,
        )
      }
    }

    const onTouchMove = (e) => {
      if (e.touches.length !== 2 || pinchDistRef.current === null) return
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      )
      zoomRef.current = MathUtils.clamp(
        zoomRef.current + (dist - pinchDistRef.current) * 0.3,
        CUSTOMIZE_ZOOM_MIN,
        CUSTOMIZE_ZOOM_MAX,
      )
      pinchDistRef.current = dist
    }

    const onTouchEnd = () => { pinchDistRef.current = null }

    canvas.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('touchstart', onTouchStart, { passive: true })
    canvas.addEventListener('touchmove', onTouchMove, { passive: true })
    canvas.addEventListener('touchend', onTouchEnd, { passive: true })

    return () => {
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('touchstart', onTouchStart)
      canvas.removeEventListener('touchmove', onTouchMove)
      canvas.removeEventListener('touchend', onTouchEnd)
    }
  }, [active, gl])

  useFrame(() => {
    if (!camRef.current) return
    if (Math.abs(camRef.current.zoom - zoomRef.current) > 0.1) {
      camRef.current.zoom = MathUtils.lerp(camRef.current.zoom, zoomRef.current, 0.15)
      camRef.current.updateProjectionMatrix()
    }
  })

  if (!active) return null

  return (
    <OrthographicCamera
      ref={camRef}
      makeDefault
      position={[0, 18, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      zoom={CUSTOMIZE_ZOOM_DEFAULT}
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

function getTwitchParentHost() {
  if (typeof window === 'undefined') return 'localhost'
  return window.location.hostname || 'localhost'
}

function collidesWithOutdoorObstacle(nextX, nextZ) {
  return OUTDOOR_PLAYER_COLLIDERS.some((collider) => {
    const rotationY = collider.rotationY ?? 0
    const dx = nextX - collider.x
    const dz = nextZ - collider.z
    const cos = Math.cos(-rotationY)
    const sin = Math.sin(-rotationY)
    const localX = dx * cos - dz * sin
    const localZ = dx * sin + dz * cos

    return intersectsAabbSphere(
      localX,
      PLAYER_HEIGHT,
      localZ,
      PLAYER_CAPSULE_RADIUS,
      0,
      PLAYER_HEIGHT,
      0,
      collider.hx,
      0.6,
      collider.hz,
    )
  })
}

function getTwitchParentHosts() {
  const hosts = new Set([getTwitchParentHost(), 'localhost', '127.0.0.1'])

  try {
    const topHost = window.top?.location?.hostname
    if (topHost) hosts.add(topHost)
  } catch {}

  return [...hosts].filter(Boolean)
}

function appendTwitchParents(embedUrl) {
  getTwitchParentHosts().forEach((parent) => {
    embedUrl.searchParams.append('parent', parent)
  })
}

function getYouTubeEmbedUrl(url, host) {
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
  return { url: embedUrl.toString(), platform: 'youtube' }
}

function getTwitchEmbedUrl(url, host) {
  const pathParts = url.pathname.split('/').filter(Boolean)

  if (host === 'clips.twitch.tv') {
    const clipSlug = pathParts[0] ?? ''
    if (!/^[a-zA-Z0-9_-]+$/.test(clipSlug)) return null
    const embedUrl = new URL('https://clips.twitch.tv/embed')
    embedUrl.searchParams.set('clip', clipSlug)
    appendTwitchParents(embedUrl)
    embedUrl.searchParams.set('autoplay', 'true')
    return { url: embedUrl.toString(), platform: 'twitch' }
  }

  if (host !== 'twitch.tv' && host !== 'm.twitch.tv') return null

  const clipIndex = pathParts.indexOf('clip')
  if (clipIndex >= 0) {
    const clipSlug = pathParts[clipIndex + 1] ?? ''
    if (!/^[a-zA-Z0-9_-]+$/.test(clipSlug)) return null
    const embedUrl = new URL('https://clips.twitch.tv/embed')
    embedUrl.searchParams.set('clip', clipSlug)
    appendTwitchParents(embedUrl)
    embedUrl.searchParams.set('autoplay', 'true')
    return { url: embedUrl.toString(), platform: 'twitch' }
  }

  if (pathParts[0] === 'videos') {
    const videoId = pathParts[1] ?? ''
    if (!/^\d+$/.test(videoId)) return null
    const embedUrl = new URL('https://player.twitch.tv/')
    embedUrl.searchParams.set('video', `v${videoId}`)
    appendTwitchParents(embedUrl)
    embedUrl.searchParams.set('autoplay', 'true')
    return { url: embedUrl.toString(), platform: 'twitch' }
  }

  const channel = pathParts[0] ?? ''
  if (!/^[a-zA-Z0-9_]{3,25}$/.test(channel)) return null
  const embedUrl = new URL('https://player.twitch.tv/')
  embedUrl.searchParams.set('channel', channel)
  appendTwitchParents(embedUrl)
  embedUrl.searchParams.set('autoplay', 'true')
  return { url: embedUrl.toString(), platform: 'twitch' }
}

function getTikTokEmbedUrl(url, host) {
  if (host !== 'tiktok.com' && host !== 'm.tiktok.com') return null
  const videoId = url.pathname.split('/').filter(Boolean).find((part) => /^\d{10,}$/.test(part)) ?? ''
  if (!videoId) return null
  const embedUrl = new URL(`https://www.tiktok.com/player/v1/${videoId}`)
  embedUrl.searchParams.set('autoplay', '1')
  embedUrl.searchParams.set('controls', '1')
  embedUrl.searchParams.set('volume_control', '1')
  embedUrl.searchParams.set('muted', '0')
  return { url: embedUrl.toString(), platform: 'tiktok' }
}

function getOnlineVideoEmbedUrl(rawUrl) {
  const value = rawUrl.trim()
  if (!value) return null

  try {
    const url = new URL(value.includes('://') ? value : `https://${value}`)
    const host = url.hostname.replace(/^www\./, '')
    return getYouTubeEmbedUrl(url, host) ?? getTwitchEmbedUrl(url, host) ?? getTikTokEmbedUrl(url, host)
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
  const [tvOnlinePlatform, setTvOnlinePlatform] = useState('')
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
  const tvOnlinePlatformRef = useRef('')
  const tvVolumeRef = useRef(1)
  const tvPausedRef = useRef(false)
  const { camera, gl } = useThree()
  const [tvViewportKey, setTvViewportKey] = useState('0x0')
  const isMobileMediaMode = useMemo(() => {
    if (typeof navigator === 'undefined') return false
    return /android|iphone|ipad|ipod/i.test(navigator.userAgent) || !navigator.mediaDevices?.getDisplayMedia
  }, [])
  const cssScreenWidth = 1280
  const cssScreenHeight = Math.max(1, Math.round(cssScreenWidth * ((screenInfo?.height ?? 0.5625) / (screenInfo?.width ?? 1))))

  useEffect(() => {
    tvOnlinePlatformRef.current = tvOnlinePlatform
  }, [tvOnlinePlatform])

  useEffect(() => {
    tvVolumeRef.current = tvVolume
  }, [tvVolume])

  useEffect(() => {
    tvPausedRef.current = tvPaused
  }, [tvPaused])

  useEffect(() => {
    const updateViewportKey = () => {
      const rect = gl.domElement.getBoundingClientRect()
      const width = Math.round(rect.width)
      const height = Math.round(rect.height)
      setTvViewportKey(`${width}x${height}`)
    }

    updateViewportKey()
    const observer = new ResizeObserver(updateViewportKey)
    observer.observe(gl.domElement)
    window.addEventListener('orientationchange', updateViewportKey)
    return () => {
      observer.disconnect()
      window.removeEventListener('orientationchange', updateViewportKey)
    }
  }, [gl])

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

  useEffect(() => {
    const handleTikTokMessage = (event) => {
      const data = typeof event.data === 'string'
        ? (() => {
            try {
              return JSON.parse(event.data)
            } catch {
              return null
            }
          })()
        : event.data

      if (!data?.['x-tiktok-player'] || tvOnlinePlatformRef.current !== 'tiktok') return

      if (data.type === 'onPlayerReady' && tvVolumeRef.current > 0 && !tvPausedRef.current) {
        window.setTimeout(() => {
          unmuteTikTok()
          postTikTokCommand('play')
        }, 100)
      }

      if (data.type === 'onMute' && data.value === true && tvVolumeRef.current > 0 && !tvPausedRef.current) {
        window.setTimeout(unmuteTikTok, 100)
      }
    }

    window.addEventListener('message', handleTikTokMessage)
    return () => window.removeEventListener('message', handleTikTokMessage)
  }, [])

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

  const postTikTokCommand = (type, value) => {
    const frameWindow = youtubeFrameRef.current?.contentWindow
    if (!frameWindow) return
    const message = {
      type,
      value: value ?? null,
      'x-tiktok-player': true,
    }
    const serializedMessage = JSON.stringify(message)
    frameWindow.postMessage(message, '*')
    frameWindow.postMessage(message, 'https://www.tiktok.com')
    frameWindow.postMessage(serializedMessage, '*')
    frameWindow.postMessage(serializedMessage, 'https://www.tiktok.com')
    window.setTimeout(() => {
      const delayedWindow = youtubeFrameRef.current?.contentWindow
      delayedWindow?.postMessage(message, '*')
      delayedWindow?.postMessage(message, 'https://www.tiktok.com')
      delayedWindow?.postMessage(serializedMessage, '*')
      delayedWindow?.postMessage(serializedMessage, 'https://www.tiktok.com')
    }, 250)
  }

  const unmuteTikTok = () => {
    postTikTokCommand('unMute')
    postTikTokCommand('unmute')
  }

  const restartTikTokPlayback = () => {
    if (!tvOnlineEmbedUrl) return
    try {
      const nextUrl = new URL(tvOnlineEmbedUrl)
      nextUrl.searchParams.set('autoplay', '1')
      nextUrl.searchParams.set('muted', '0')
      nextUrl.searchParams.set('playRequest', `${Date.now()}`)
      setTvOnlineEmbedUrl(nextUrl.toString())
    } catch {}
  }

  const applyOnlineVideoVolume = (nextVolume) => {
    if (tvOnlinePlatform === 'youtube') {
      applyYouTubeVolume(nextVolume)
      return
    }
    if (tvOnlinePlatform === 'tiktok') {
      if (nextVolume <= 0) {
        postTikTokCommand('mute')
      } else {
        unmuteTikTok()
      }
    }
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
      if (activeNearbyTvId !== tvInstanceId) return
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
            placeholder="Lien video YouTube / TikTok / Twitch"
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
  }, [texture, tvMenuOpen, tvOnlineEmbedUrl, tvOnlineMessage, tvOnlinePanelOpen, tvOnlinePlatform, tvOnlineUrl, tvPaused, tvVolume, tvPoweredOn])

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
    if (tvOnlinePlatform === 'youtube') postYouTubeCommand('pauseVideo')
    if (tvOnlinePlatform === 'tiktok') postTikTokCommand('pause')
    setTvPoweredOn(false)
    setTvPaused(false)
    setTvMenuOpen(true)
  }

  const changeTvMedia = async (event) => {
    event?.stopPropagation?.()
    setTvMenuOpen(false)
    setTvOnlinePanelOpen(false)
    setTvOnlineEmbedUrl('')
    setTvOnlinePlatform('')
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
      applyOnlineVideoVolume(nextVolume)
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
    const embed = getOnlineVideoEmbedUrl(nextUrl)
    setTvOnlineUrl(nextUrl)

    if (!embed) {
      setTvOnlineMessage('Lien video invalide')
      setTvOnlinePanelOpen(true)
      setTvMenuOpen(true)
      return
    }

    clearTextureMedia()
    setTvOnlineEmbedUrl(embed.url)
    setTvOnlinePlatform(embed.platform)
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
      if (tvOnlinePlatform === 'youtube') {
        postYouTubeCommand('playVideo')
        applyYouTubeVolume(tvVolume)
      }
    if (tvOnlinePlatform === 'tiktok') {
      unmuteTikTok()
      postTikTokCommand('play')
    }
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
      if (tvOnlinePlatform === 'youtube') {
        postYouTubeCommand(shouldPause ? 'pauseVideo' : 'playVideo')
        if (!shouldPause) applyYouTubeVolume(tvVolume)
      }
      if (tvOnlinePlatform === 'tiktok') {
        postTikTokCommand(shouldPause ? 'pause' : 'play')
        if (!shouldPause) {
          unmuteTikTok()
        }
      }
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
    setTvOnlinePlatform('')
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
      setTvOnlinePlatform('')
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
  const youtubeCssWidth = 640
  const youtubeCssHeight = Math.max(1, Math.round(youtubeCssWidth * ((screenInfo?.height ?? 0.5625) / (screenInfo?.width ?? 1))))
  const screenHtmlScale = (screenInfo.width * 400) / youtubeCssWidth
  const youtubeViewportReady = tvViewportKey !== '0x0'
  const youtubeFrameKey = `${tvOnlineEmbedUrl}:${tvViewportKey}`

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
      {showOnlineScreen && youtubeViewportReady && (
        <Html
          key={youtubeFrameKey}
          transform
          occlude="blending"
          center
          distanceFactor={screenHtmlScale}
          zIndexRange={[1, 0]}
          position={[0, 0, 0.006]}
          style={{
            width: `${youtubeCssWidth}px`,
            height: `${youtubeCssHeight}px`,
            pointerEvents: 'auto',
            overflow: 'hidden',
            transformOrigin: '50% 50%',
          }}
        >
          <div className="tv-youtube-fill">
            <iframe
              key={youtubeFrameKey}
              ref={youtubeFrameRef}
              className="tv-youtube-frame"
              src={tvOnlineEmbedUrl}
              title="Video en ligne"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; fullscreen; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              scrolling="no"
              onLoad={() => {
                if (tvOnlinePlatform === 'youtube') {
                  applyYouTubeVolume(tvVolume)
                  postYouTubeCommand(tvPaused ? 'pauseVideo' : 'playVideo')
                }
                if (tvOnlinePlatform === 'tiktok') {
                  if (tvPaused) {
                    postTikTokCommand('pause')
                  } else {
                    if (tvVolume > 0) unmuteTikTok()
                    postTikTokCommand('play')
                  }
                }
              }}
            />
          </div>
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

const CUSTOMIZE_PAN_BOUNDS = { minX: -6, maxX: 6, minZ: -6, maxZ: 12 }

function RoomBorder({ width, depth, posX = 0, posZ = 0 }) {
  const positions = useMemo(() => new Float32Array([
    -width / 2, 0, -depth / 2,
     width / 2, 0, -depth / 2,
     width / 2, 0,  depth / 2,
    -width / 2, 0,  depth / 2,
  ]), [width, depth])

  return (
    <lineLoop position={[posX, 0.07, posZ]}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" array={positions} count={4} itemSize={3} />
      </bufferGeometry>
      <lineBasicMaterial color="#f2c14e" />
    </lineLoop>
  )
}

function EditableFloor({
  mode,
  draggingObjectId,
  placingObjectId,
  placementLocked,
  getPlacementY,
  getFootprint,
  onDrag,
  onLockPlacement,
  onStopDragging,
  onClearSelection,
}) {
  const { camera } = useThree()
  const lastClientRef = useRef(null)

  useEffect(() => {
    if (mode !== 'customize') {
      camera.position.x = 0
      camera.position.z = 0
    }
  }, [mode, camera])

  if (mode !== 'customize') return null

  const getSnappedPlacement = (point, objectId) => {
    const { hx, hz } = getFootprint(objectId)
    const x = MathUtils.clamp(snap(point.x), -PARCEL_HALF + hx, PARCEL_HALF - hx)
    const z = MathUtils.clamp(snap(point.z), -PARCEL_HALF + hz, PARCEL_HALF - hz)
    return [x, getPlacementY(x, z, objectId), z]
  }

  const isPanning = !draggingObjectId && !placingObjectId

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0.028, 0]}
      onPointerDown={(event) => {
        if (isPanning) {
          if (event.pointerType === 'touch' && lastClientRef.current) {
            // Second finger landed — cancel pan to let pinch zoom take over
            lastClientRef.current = null
          } else {
            lastClientRef.current = { x: event.clientX, y: event.clientY }
          }
        }
      }}
      onPointerMove={(event) => {
        if (isPanning) {
          if (lastClientRef.current) {
            const dx = event.clientX - lastClientRef.current.x
            const dy = event.clientY - lastClientRef.current.y
            lastClientRef.current = { x: event.clientX, y: event.clientY }
            const worldPerPixel = 1 / camera.zoom
            camera.position.x = MathUtils.clamp(camera.position.x - dx * worldPerPixel, CUSTOMIZE_PAN_BOUNDS.minX, CUSTOMIZE_PAN_BOUNDS.maxX)
            camera.position.z = MathUtils.clamp(camera.position.z - dy * worldPerPixel, CUSTOMIZE_PAN_BOUNDS.minZ, CUSTOMIZE_PAN_BOUNDS.maxZ)
          }
          return
        }
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
        lastClientRef.current = null
        event.stopPropagation()
        onStopDragging()
      }}
      onPointerMissed={() => {
        lastClientRef.current = null
        onStopDragging()
        onClearSelection()
      }}
    >
      <planeGeometry args={[PLAYER_PLOT_SIZE + 4, PLAYER_PLOT_SIZE + 4]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  )
}

function PlacementPreview({ object, preview, groupRef }) {
  if (!object || !preview) return null

  return (
    <group position={preview.position} rotation={[0, preview.rotationY, 0]}>
      <group ref={groupRef} scale={0.96}>
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
  const previewGroupRef = useRef()
  const placingObjectIdRef = useRef(placingObjectId)
  useEffect(() => { placingObjectIdRef.current = placingObjectId }, [placingObjectId])

  const registerPlaceableRef = useCallback((id, object3D) => {
    if (object3D) {
      placeableRefs.current.set(id, object3D)
      return
    }
    placeableRefs.current.delete(id)
  }, [])

  const getFootprint = useCallback((objectId) => {
    const isPreview = objectId === placingObjectIdRef.current
    const object3D = isPreview ? previewGroupRef.current : placeableRefs.current.get(objectId)
    if (!object3D) return { hx: 0, hz: 0 }
    object3D.updateWorldMatrix(true, true)
    const box = new Box3().setFromObject(object3D)
    const size = box.getSize(new Vector3())
    return { hx: size.x / 2, hz: size.z / 2 }
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

    if (hit) return hit.point.y
    const insideHouse = houseLayout.rooms.some((room) => {
      const [rx, , rz] = room.position
      return (
        Math.abs(x - rx) <= room.size[0] * 0.5 &&
        Math.abs(z - rz) <= room.size[2] * 0.5
      )
    })
    return insideHouse ? 0 : getTerrainHeight(x, z)
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
        getFootprint={getFootprint}
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
      {mode === 'customize' && (
        <>
          <RoomBorder width={MAIN_ROOM.width} depth={MAIN_ROOM.depth} />
          <RoomBorder
            width={secondRoom.size[0]}
            depth={secondRoom.size[2]}
            posX={secondRoom.position[0]}
            posZ={secondRoom.position[2]}
          />
        </>
      )}
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
      <PlacementPreview object={placingObject} preview={placementPreview} groupRef={previewGroupRef} />
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

function LegacyThumbnailTool() {
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
  onRespawn,
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
        <button type="button" className="skin-respawn-btn" onClick={onRespawn}>Respawn ballon</button>
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
  ownedCat,
  catActive,
  onBuyCat,
  onToggleCat,
}) {
  if (!open) return null

  const isAnimalsTab = activeTab === 'animals'
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
          <button
            type="button"
            className={`env-tab-btn ${isAnimalsTab ? 'active' : ''}`}
            onClick={() => onTabChange('animals')}
          >
            Animaux
          </button>
        </div>
        {isAnimalsTab ? (
          <>
            <div className="skin-title">Animaux</div>
            <div className="animals-shop-grid">
              <div className="animal-shop-card">
                <div className="animal-shop-preview">
                  <img src="/ui/object-thumbnails/cat.webp" alt="Chat" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.parentElement.textContent = '🐱' }} />
                </div>
                <span className="animal-shop-name">Chat</span>
                {!ownedCat ? (
                  <>
                    <span className="animal-shop-price">500 pieces</span>
                    <button
                      type="button"
                      className="animal-buy-btn"
                      onClick={onBuyCat}
                      disabled={coins < 500}
                    >
                      Acheter
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className={`animal-toggle-btn ${catActive ? 'dismiss' : 'summon'}`}
                    onClick={onToggleCat}
                  >
                    {catActive ? 'Renvoyer' : 'Invoquer'}
                  </button>
                )}
              </div>
            </div>
          </>
        ) : isFurnitureTab ? (
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

function isGoalInsideHouse(goalPosition) {
  if (!goalPosition) return true
  const [x, , z] = goalPosition
  return houseLayout.rooms.some((room) => {
    const [rx, , rz] = room.position
    return (
      Math.abs(x - rx) <= room.size[0] * 0.5 + 0.5 &&
      Math.abs(z - rz) <= room.size[2] * 0.5 + 0.5
    )
  })
}

function BallRespawnGuard({ ballRef, goalObject, onOutOfBounds }) {
  const outTimerRef = useRef(0)
  const triggerLockRef = useRef(false)

  useFrame((_, delta) => {
    const ball = ballRef.current
    if (!ball) return

    const p = ball.translation()
    const goalInside = isGoalInsideHouse(goalObject?.position)
    const isOut = goalInside
      ? (p.y < -1.2 || p.y > 7 || Math.abs(p.x) > 8.2 || Math.abs(p.z) > 12)
      : (p.y < getTerrainHeight(p.x, p.z) - 0.5 || Math.abs(p.x) > OUTDOOR_HALF_SIZE - 1 || Math.abs(p.z) > OUTDOOR_HALF_SIZE - 1)

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

function getEvenPixelSize(value) {
  const rounded = Math.max(2, Math.floor(value))
  return rounded % 2 === 0 ? rounded : rounded - 1
}

function useVerticalFrameSize(active) {
  const [frameSize, setFrameSize] = useState(null)

  useLayoutEffect(() => {
    if (!active) {
      setFrameSize(null)
      return undefined
    }

    const updateFrameSize = () => {
      const widthFromHeight = window.innerHeight * (9 / 16)
      const heightFromWidth = window.innerWidth * (16 / 9)
      const widthLimited = widthFromHeight <= window.innerWidth
      const width = getEvenPixelSize(widthLimited ? widthFromHeight : window.innerWidth)
      const height = getEvenPixelSize(widthLimited ? window.innerHeight : heightFromWidth)
      setFrameSize({ width, height })
    }

    updateFrameSize()
    window.addEventListener('resize', updateFrameSize)
    window.addEventListener('orientationchange', updateFrameSize)
    return () => {
      window.removeEventListener('resize', updateFrameSize)
      window.removeEventListener('orientationchange', updateFrameSize)
    }
  }, [active])

  return frameSize
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

function getViewportRenderSettings(renderScale = MAX_DYNAMIC_RENDER_SCALE) {
  if (typeof window === 'undefined') {
    return { dpr: 1, antialias: true }
  }

  const width = Math.max(1, window.innerWidth || 1)
  const height = Math.max(1, window.innerHeight || 1)
  const nativeDpr = Math.min(MAX_RENDER_DPR, Math.max(MIN_RENDER_DPR, window.devicePixelRatio || 1))
  const viewportPixels = width * height
  const targetPixels = TARGET_MAX_RENDER_PIXELS * renderScale
  const pixelCappedDpr = Math.sqrt(targetPixels / viewportPixels)
  const dpr = MathUtils.clamp(pixelCappedDpr, MIN_RENDER_DPR, nativeDpr)

  return {
    dpr: Number(dpr.toFixed(2)),
    antialias: dpr < 1.3,
  }
}

function useViewportRenderSettings(renderScale) {
  const [settings, setSettings] = useState(() => getViewportRenderSettings(renderScale))

  useEffect(() => {
    let frame = null
    const update = () => {
      if (frame) cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        setSettings((current) => {
          const next = getViewportRenderSettings(renderScale)
          return current.dpr === next.dpr && current.antialias === next.antialias ? current : next
        })
      })
    }

    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
    }
  }, [renderScale])

  return settings
}

function RenderQualityGovernor({ onScaleChange }) {
  const sampleTimeRef = useRef(0)
  const sampleFramesRef = useRef(0)
  const recoveryWindowsRef = useRef(0)

  useFrame((_, delta) => {
    sampleTimeRef.current += delta
    sampleFramesRef.current += 1

    if (sampleTimeRef.current < FPS_SAMPLE_WINDOW_SECONDS) return

    const fps = sampleFramesRef.current / sampleTimeRef.current
    sampleTimeRef.current = 0
    sampleFramesRef.current = 0

    if (fps < LOW_FPS_THRESHOLD) {
      recoveryWindowsRef.current = 0
      onScaleChange((current) => Math.max(MIN_DYNAMIC_RENDER_SCALE, Number((current - RENDER_SCALE_STEP).toFixed(2))))
      return
    }

    if (fps >= HIGH_FPS_THRESHOLD) {
      recoveryWindowsRef.current += 1
      if (recoveryWindowsRef.current >= 3) {
        recoveryWindowsRef.current = 0
        onScaleChange((current) => Math.min(MAX_DYNAMIC_RENDER_SCALE, Number((current + RENDER_SCALE_STEP).toFixed(2))))
      }
      return
    }

    recoveryWindowsRef.current = 0
  })

  return null
}

function getDebugCategory(object) {
  let current = object
  while (current) {
    if (current.userData?.debugCategory) return current.userData.debugCategory
    current = current.parent
  }
  return 'other'
}

function getObjectTriangleCount(object) {
  if (!object.geometry || !object.isMesh) return 0
  let current = object
  while (current) {
    if (!current.visible) return 0
    current = current.parent
  }
  const geometry = object.geometry
  const indexCount = geometry.index?.count ?? 0
  const positionCount = geometry.attributes.position?.count ?? 0
  const triangleCount = indexCount > 0 ? indexCount / 3 : positionCount / 3
  return triangleCount * (object.isInstancedMesh ? object.count : 1)
}

function getRendererInfo(gl) {
  const context = gl.getContext()
  const extension = context.getExtension('WEBGL_debug_renderer_info')
  const renderer = extension
    ? context.getParameter(extension.UNMASKED_RENDERER_WEBGL)
    : context.getParameter(context.RENDERER)
  const vendor = extension
    ? context.getParameter(extension.UNMASKED_VENDOR_WEBGL)
    : context.getParameter(context.VENDOR)

  return {
    renderer: String(renderer ?? ''),
    vendor: String(vendor ?? ''),
  }
}

function isWeakRenderer(rendererInfo) {
  const value = `${rendererInfo.vendor} ${rendererInfo.renderer}`.toLowerCase()
  return [
    'intel',
    'uhd graphics',
    'iris',
    'microsoft basic render driver',
    'swiftshader',
    'llvmpipe',
    'software',
  ].some((pattern) => value.includes(pattern))
}

function RenderStatsProbe({ onStatsChange, onRendererInfo }) {
  const { gl, scene } = useThree()
  const elapsedRef = useRef(0)
  const framesRef = useRef(0)
  const maxFrameTimeRef = useRef(0)
  const drawingBufferRef = useRef(new Vector2())

  useEffect(() => {
    onRendererInfo(getRendererInfo(gl))
  }, [gl, onRendererInfo])

  useFrame((_, delta) => {
    const frameTimeMs = delta * 1000
    elapsedRef.current += delta
    framesRef.current += 1
    maxFrameTimeRef.current = Math.max(maxFrameTimeRef.current, frameTimeMs)

    if (elapsedRef.current < 0.25) return

    gl.getDrawingBufferSize(drawingBufferRef.current)
    const fps = framesRef.current / elapsedRef.current
    const averageFrameTimeMs = (elapsedRef.current / framesRef.current) * 1000
    const trianglesByCategory = {}

    scene.traverse((object) => {
      const triangles = getObjectTriangleCount(object)
      if (triangles <= 0) return
      const category = getDebugCategory(object)
      trianglesByCategory[category] = (trianglesByCategory[category] ?? 0) + triangles
    })

    onStatsChange({
      fps,
      frameTimeMs: averageFrameTimeMs,
      maxFrameTimeMs: maxFrameTimeRef.current,
      drawCalls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      textures: gl.info.memory.textures,
      geometries: gl.info.memory.geometries,
      dpr: gl.getPixelRatio(),
      drawingBufferWidth: drawingBufferRef.current.x,
      drawingBufferHeight: drawingBufferRef.current.y,
      trianglesByCategory,
      grassDebug: typeof window !== 'undefined' ? window.__grassDebug ?? null : null,
    })

    elapsedRef.current = 0
    framesRef.current = 0
    maxFrameTimeRef.current = 0
  })

  return null
}

function RenderStatsOverlay({ stats, toggles, onToggle }) {
  if (!stats) return null

  const rows = [
    ['FPS', stats.fps.toFixed(1)],
    ['Frame', `${stats.frameTimeMs.toFixed(1)} ms`],
    ['Max frame', `${stats.maxFrameTimeMs.toFixed(1)} ms`],
    ['Draw calls', stats.drawCalls.toLocaleString('fr-FR')],
    ['Triangles', stats.triangles.toLocaleString('fr-FR')],
    ['Textures', stats.textures.toLocaleString('fr-FR')],
    ['Geometries', stats.geometries.toLocaleString('fr-FR')],
    ['DPR', stats.dpr.toFixed(2)],
    ['Buffer', `${stats.drawingBufferWidth} x ${stats.drawingBufferHeight}`],
  ]
  const triangleRows = Object.entries(stats.trianglesByCategory ?? {})
    .sort((left, right) => right[1] - left[1])
    .map(([label, value]) => [label, value.toLocaleString('fr-FR')])
  const grassRows = stats.grassDebug
    ? [
        ['G queue', stats.grassDebug.queuedChunks.toLocaleString('fr-FR')],
        ['G pending', stats.grassDebug.pendingChunks.toLocaleString('fr-FR')],
        ['G active', stats.grassDebug.activeChunk ?? '-'],
        ['G done', stats.grassDebug.completedChunks.toLocaleString('fr-FR')],
        ['G mounted', stats.grassDebug.mountedChunks.toLocaleString('fr-FR')],
        ['G blades', stats.grassDebug.completedBlades.toLocaleString('fr-FR')],
      ]
    : []

  return (
    <aside className="render-stats" aria-label="Statistiques de rendu">
      <div className="render-stats-controls">
        {[
          ['grass', 'Herbe'],
          ['trees', 'Arbres'],
          ['terrain', 'Terrain'],
          ['sky', 'Ciel'],
          ['shadows', 'Ombres'],
          ['house', 'Maison'],
          ['player', 'Joueur'],
          ['plot', 'Parcelle'],
          ['portrait', '9:16'],
        ].map(([key, label]) => (
          <button
            className={toggles[key] ? 'is-active' : ''}
            key={key}
            type="button"
            onClick={() => onToggle(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {rows.map(([label, value]) => (
        <div className="render-stats-row" key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
      <div className="render-stats-divider" />
      {grassRows.map(([label, value]) => (
        <div className="render-stats-row" key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
      {grassRows.length > 0 && <div className="render-stats-divider" />}
      {triangleRows.map(([label, value]) => (
        <div className="render-stats-row" key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </aside>
  )
}

function GpuWarning({ visible, onDismiss }) {
  if (!visible) return null

  return (
    <aside className="gpu-warning" role="status">
      <p>
        Votre navigateur utilise probablement le GPU integre. Pour de meilleures performances,
        activez le GPU haute performance pour Chrome dans les parametres graphiques Windows.
      </p>
      <button type="button" onClick={onDismiss}>
        Fermer
      </button>
    </aside>
  )
}

function AdaptiveCameraFov() {
  const { camera, size } = useThree()

  useLayoutEffect(() => {
    const aspect = Math.max(0.1, size.width / Math.max(1, size.height))
    const maxHorizontalFovRadians = MathUtils.degToRad(MAX_CAMERA_HORIZONTAL_FOV)
    const cappedVerticalFov = MathUtils.radToDeg(
      2 * Math.atan(Math.tan(maxHorizontalFovRadians * 0.5) / aspect),
    )
    camera.fov = Math.min(BASE_CAMERA_VERTICAL_FOV, cappedVerticalFov)
    camera.updateProjectionMatrix()
  }, [camera, size.height, size.width])

  return null
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

  if (isThumbnailTool) {
    return (
      <Suspense fallback={null}>
        <ThumbnailTool />
      </Suspense>
    )
  }

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
  const isDebugMode = useMemo(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      return params.get('debug') === '1'
    } catch {
      return false
    }
  }, [])
  const isLocalNetwork = useMemo(() => {
    try {
      const h = window.location.hostname
      return h === 'localhost' || h === '127.0.0.1' || /^192\.168\./.test(h) || /^10\./.test(h)
    } catch {
      return false
    }
  }, [])
  const progressScope = isAdminMode ? 'admin' : 'player'
  const progressStorageKey = isAdminMode ? `${SKIN_STORAGE_KEY}:admin` : SKIN_STORAGE_KEY
  const verticalFrameSize = useVerticalFrameSize(isAdminMode || isVerticalFrameMode)
  const [dynamicRenderScale, setDynamicRenderScale] = useState(MAX_DYNAMIC_RENDER_SCALE)
  const renderSettings = useViewportRenderSettings(dynamicRenderScale)
  const [renderStats, setRenderStats] = useState(null)
  const [rendererInfo, setRendererInfo] = useState(null)
  const [gpuWarningDismissed, setGpuWarningDismissed] = useState(false)
  const [debugToggles, setDebugToggles] = useState({
    grass: true,
    trees: true,
    terrain: true,
    sky: true,
    shadows: true,
    house: true,
    player: true,
    plot: false,
    portrait: false,
  })
  const showGpuWarning = Boolean(rendererInfo && isWeakRenderer(rendererInfo) && !gpuWarningDismissed)

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
  const playerVelocityRef = useRef({ x: 0, z: 0 })
  const catPositionRef = useRef({ x: 0, y: 0, z: 0 })
  const catGroupRef = useRef(null)
  const catTapCallbackRef = useRef(null)
  const [cameraOnCat, setCameraOnCat] = useState(false)
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
  const [roomLightOn, setRoomLightOn] = useState(true)
  const [lightColor, setLightColor] = useState('#ffffff')
  const [isNearLightSwitch, setIsNearLightSwitch] = useState(false)
  const [isLightMenuOpen, setIsLightMenuOpen] = useState(false)
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
  const [currentZone, setCurrentZone] = useState(ZONES.interior)
  const [zoneFadeActive, setZoneFadeActive] = useState(false)
  const [spawnRequest, setSpawnRequest] = useState(null)
  const [captureUiHidden, setCaptureUiHidden] = useState(false)
  const [editableObjects, setEditableObjects] = useState(defaultEditableObjects)
  const [selectedObjectId, setSelectedObjectId] = useState(null)
  const [draggingObjectId, setDraggingObjectId] = useState(null)
  const [placingObjectId, setPlacingObjectId] = useState(null)
  const [placementLocked, setPlacementLocked] = useState(false)
  const [placementPreview, setPlacementPreview] = useState(null)
  const [isObjectInventoryOpen, setIsObjectInventoryOpen] = useState(false)
  const [isNearCustomizationStation, setIsNearCustomizationStation] = useState(false)
  const [isNearOutdoorDoor, setIsNearOutdoorDoor] = useState(false)
  const [ownedCat, setOwnedCat] = useState(false)
  const [catActive, setCatActive] = useState(false)
  const [nearbySeat, setNearbySeat] = useState(null)
  const [nearbyTv, setNearbyTv] = useState(null)
  useEffect(() => { activeNearbyTvId = nearbyTv?.id ?? null }, [nearbyTv])
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
  const onlinePresenceRef = useRef(null)
  const multiplayerChannelRef = useRef(null)
  const localPlayerStateRef = useRef({ position: [0, PLAYER_HEIGHT, 2.2], rotationY: 0, motion: 'idle', zone: ZONES.interior })
  const guestKickQueueRef = useRef([])
  const hostTimeOffsetRef = useRef(0)
  const [isMultiplayerOpen, setIsMultiplayerOpen] = useState(false)
  const [onlinePlayers, setOnlinePlayers] = useState([])
  const [incomingVisitRequest, setIncomingVisitRequest] = useState(null)
  const [outgoingVisitRequest, setOutgoingVisitRequest] = useState(null)
  const [multiplayerRole, setMultiplayerRole] = useState('solo')
  const [multiplayerSession, setMultiplayerSession] = useState(null)
  const [remotePlayerState, setRemotePlayerState] = useState(null)
  const [remoteBallState, setRemoteBallState] = useState(null)
  const [sessionConnectionState, setSessionConnectionState] = useState('idle')
  const [sessionTransport, setSessionTransport] = useState('none')
  const [multiplayerMessage, setMultiplayerMessage] = useState('')
  const isGuestVisit = multiplayerRole === 'guest'
  const isHostVisit = multiplayerRole === 'host'
  const isMultiplayerSession = multiplayerRole !== 'solo'
  const canModifyWorld = !isGuestVisit && !isHostVisit

  useEffect(() => {
    if (!isAdminMode && !isVerticalFrameMode) return undefined

    const onKeyDown = (event) => {
      const key = getKeyboardKey(event)
      const isDeleteToggle = key === 'delete'
      const isPointingUp = (isAdminMode || isVerticalFrameMode) && key === 'p' && !event.repeat
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
    ownedCat,
    catActive,
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
    setOwnedCat(false)
    setCatActive(false)
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
    if (typeof parsed.ownedCat === 'boolean') setOwnedCat(parsed.ownedCat)
    if (typeof parsed.catActive === 'boolean') setCatActive(parsed.catActive)
  }

  const saveCurrentProgressToCloud = async () => {
    if (isGuestVisit) return false
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
    if (isGuestVisit) return false
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
    if (isGuestVisit) return
    const snapshot = createCurrentProgressSnapshot()
    latestProgressRef.current = snapshot
    localStorage.setItem(
      progressStorageKey,
      JSON.stringify(snapshot),
    )
  }, [isGuestVisit, progressStorageKey, displayName, coins, ownedSkins, selectedSkinId, ownedFloorSkins, ownedWallSkins, selectedFloorSkinId, selectedWallSkinId, applyWallToCeiling, editableObjects, ownedCat, catActive])

  useEffect(() => {
    authUserRef.current = authUser
  }, [authUser])

  useEffect(() => {
    if (!isMultiplayerAvailable() || !authUser) {
      setOnlinePlayers([])
      onlinePresenceRef.current?.disconnect()
      onlinePresenceRef.current = null
      return undefined
    }

    const connection = connectOnlinePresence({
      user: authUser,
      displayName,
      status: multiplayerRole === 'solo' ? 'available' : 'busy',
      onPlayers: setOnlinePlayers,
      onVisitRequest: (request) => {
        if (multiplayerRole !== 'solo') return
        setIncomingVisitRequest(request)
        setIsMultiplayerOpen(true)
        setMultiplayerMessage(`${request.fromDisplayName} veut visiter ton monde.`)
      },
      onVisitResponse: async (response) => {
        if (!response?.accepted) {
          setOutgoingVisitRequest(null)
          setMultiplayerMessage('Demande refusee.')
          return
        }

        setOutgoingVisitRequest(null)
        setMultiplayerMessage('Chargement du monde...')
        try {
          const hostWorld = response.session.worldSnapshot
            ?? await loadPlayerPublicWorld(response.session.hostUserId, { scope: progressScope })
          if (!hostWorld) {
            setMultiplayerMessage('Impossible de charger ce monde. Verifie le SQL Supabase.')
            return
          }
          applyProgressSnapshot(hostWorld, { includeCoins: false })
          setMultiplayerSession(response.session)
          setMultiplayerRole('guest')
          setMode('play')
          setIsSkinMenuOpen(false)
          setIsEnvironmentMenuOpen(false)
          setIsObjectInventoryOpen(false)
          setSelectedObjectId(null)
          setMultiplayerMessage('Mode visite active: tu peux te balader et jouer au foot.')
        } catch {
          setMultiplayerMessage('Lecture du monde impossible. Lance le SQL Supabase mis a jour.')
        }
      },
      onSessionEnded: () => {
        setMultiplayerMessage('La visite est terminee.')
        setMultiplayerRole('solo')
        setMultiplayerSession(null)
        setRemotePlayerState(null)
        setRemoteBallState(null)
        setSessionConnectionState('idle')
        if (authUserRef.current) {
          loadPlayerProgress({ scope: progressScope })
            .then((progress) => {
              if (progress) applyProgressSnapshot(progress)
            })
            .catch(() => {})
        }
      },
    })

    onlinePresenceRef.current = connection
    return () => {
      connection.disconnect()
      if (onlinePresenceRef.current === connection) onlinePresenceRef.current = null
    }
  }, [authUser, displayName, multiplayerRole, progressScope])

  useEffect(() => {
    multiplayerChannelRef.current?.disconnect()
    multiplayerChannelRef.current = null
    setRemotePlayerState(null)
    setRemoteBallState(null)
    setSessionConnectionState('idle')
    setSessionTransport('none')
    guestKickQueueRef.current = []

    if (!multiplayerSession || multiplayerRole === 'solo' || !authUser) return undefined

    let cancelled = false
    let activeChannel = null

    const connectFallbackSupabase = () => {
      const channel = connectMultiplayerSession({
        sessionId: multiplayerSession.id,
        userId: authUser.id,
        role: multiplayerRole,
        onRemotePlayerState: setRemotePlayerState,
        onRemoteBallState: setRemoteBallState,
        onGuestKick: (payload) => {
          if (payload?.impulse) guestKickQueueRef.current.push(payload)
        },
        onStatusChange: setSessionConnectionState,
        onHostTimeOffsetChange: (offset) => {
          hostTimeOffsetRef.current = MathUtils.lerp(hostTimeOffsetRef.current, offset, 0.25)
        },
        onSessionEnded: () => {
          setMultiplayerRole('solo')
          setMultiplayerSession(null)
          setRemotePlayerState(null)
          setRemoteBallState(null)
          setSessionConnectionState('idle')
          setSessionTransport('none')
          setMultiplayerMessage('La visite est terminee.')
        },
      })
      setSessionTransport('supabase')
      return channel
    }

    setSessionConnectionState('connecting')
    connectColyseusVisitSession({
      session: multiplayerSession,
      user: authUser,
      role: multiplayerRole,
      displayName: displayName || authUser.email?.split('@')[0] || '',
      onRemotePlayerState: setRemotePlayerState,
      onRemoteBallState: setRemoteBallState,
      onGuestKick: (payload) => {
        if (payload?.impulse) guestKickQueueRef.current.push(payload)
      },
      onPlayerLeft: () => {
        setRemotePlayerState(null)
        setMultiplayerMessage('Le joueur distant a quitte la visite.')
      },
      onStatusChange: setSessionConnectionState,
      onServerTimeOffsetChange: (offset) => {
        hostTimeOffsetRef.current = MathUtils.lerp(hostTimeOffsetRef.current, offset, 0.35)
      },
    })
      .then((channel) => {
        if (cancelled) {
          channel?.disconnect()
          return
        }
        if (channel) {
          activeChannel = channel
          multiplayerChannelRef.current = channel
          setSessionTransport('colyseus')
          return
        }
        activeChannel = connectFallbackSupabase()
        multiplayerChannelRef.current = activeChannel
      })
      .catch(() => {
        if (cancelled) return
        activeChannel = connectFallbackSupabase()
        multiplayerChannelRef.current = activeChannel
        setMultiplayerMessage('Colyseus indisponible: fallback Supabase actif.')
      })

    return () => {
      cancelled = true
      activeChannel?.disconnect()
      if (multiplayerChannelRef.current === activeChannel) multiplayerChannelRef.current = null
    }
  }, [authUser, displayName, multiplayerRole, multiplayerSession])

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
    if (isGuestVisit) return undefined
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
  }, [isGuestVisit, authUser, progressScope, displayName, coins, ownedSkins, selectedSkinId, ownedFloorSkins, ownedWallSkins, selectedFloorSkinId, selectedWallSkinId, applyWallToCeiling, editableObjects, ownedCat, catActive])

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

    const gx = goalObject.position?.[0] ?? 0
    const gy = goalObject.position?.[1] ?? 0
    const gz = goalObject.position?.[2] ?? 0
    const rotY = goalObject.rotationY ?? 0
    const BALL_FORWARD_OFFSET = 3.5
    const spawnX = gx + Math.sin(rotY) * BALL_FORWARD_OFFSET
    const spawnZ = gz + Math.cos(rotY) * BALL_FORWARD_OFFSET
    const goalInside = isGoalInsideHouse(goalObject.position)
    const groundY = goalInside ? 0 : getTerrainHeight(spawnX, spawnZ)
    ball.setTranslation({
      x: spawnX,
      y: Math.max(gy + 1.2, groundY + 0.5),
      z: spawnZ,
    }, true)
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
  const availableWallSkins = (isAdminMode || isLocalNetwork) ? wallSkins : wallSkins.filter((skin) => !skin.adminOnly)
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
    if (!canModifyWorld) return
    setPreviewSkinId(selectedSkinId)
    setIsSkinMenuOpen(true)
  }

  const closeSkinMenu = () => {
    setPreviewSkinId(selectedSkinId)
    setIsSkinMenuOpen(false)
  }
  const openEnvironmentMenu = () => {
    if (!canModifyWorld) return
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
    if (!canModifyWorld) return
    const skin = ballSkins[previewIndex]
    if (ownedSkins.includes(skin.id)) return
    if (!isAdminMode && coins < skin.price) return
    const paid = isAdminMode ? true : await applyCoinDelta(-skin.price)
    if (!paid) return
    setOwnedSkins((current) => [...current, skin.id])
  }

  const selectPreviewSkin = () => {
    if (!canModifyWorld) return
    const skin = ballSkins[previewIndex]
    if (!ownedSkins.includes(skin.id)) return
    setSelectedSkinId(skin.id)
    setIsSkinMenuOpen(false)
  }
  const buyPreviewEnvironmentSkin = async () => {
    if (!canModifyWorld) return
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
    if (!canModifyWorld) return
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
    if (!canModifyWorld) return
    const item = objectCatalog[objectId]
    if (!item || !shopObjectIds.includes(objectId)) return
    if (!isAdminMode && coins < item.price) return
    const object = createEditableObjectInstance(objectId)
    if (!object) return
    const paid = isAdminMode ? true : await applyCoinDelta(-item.price)
    if (!paid) return
    setEditableObjects((current) => [...current, object])
  }

  const buyCat = async () => {
    if (!canModifyWorld) return
    if (ownedCat) return
    if (!isAdminMode && coins < 500) return
    const paid = isAdminMode ? true : await applyCoinDelta(-500)
    if (!paid) return
    setOwnedCat(true)
  }

  const toggleCat = () => {
    if (!canModifyWorld) return
    if (!ownedCat) return
    setCatActive((v) => !v)
  }

  const toggleCameraOnCat = useCallback(() => setCameraOnCat(v => !v), [])

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
    if (!canModifyWorld) return
    if (!nearbyTv) return
    window.dispatchEvent(new CustomEvent(TV_MENU_EVENT, { detail: { objectId: nearbyTv.id } }))
  }

  const transitionToZone = (nextZone) => {
    if (zoneFadeActive || currentZone === nextZone) return
    setZoneFadeActive(true)
    setIsNearOutdoorDoor(false)
    setIsNearSkinStation(false)
    setIsNearEnvironmentStation(false)
    setIsNearCustomizationStation(false)
    setNearbySeat(null)
    setNearbyTv(null)
    setSeatedState(null)
    setMode('play')
    setIsSkinMenuOpen(false)
    setIsEnvironmentMenuOpen(false)
    setSelectedObjectId(null)
    setDraggingObjectId(null)
    setPlacingObjectId(null)
    setPlacementLocked(false)
    setPlacementPreview(null)
    window.setTimeout(() => {
      const spawn = PLAYER_SPAWNS[nextZone] ?? PLAYER_SPAWNS.interior
      setCurrentZone(nextZone)
      setSpawnRequest({ zone: nextZone, position: spawn, token: Date.now() })
      touchRef.current.moveX = 0
      touchRef.current.moveY = 0
      touchRef.current.lookX = 0
      touchRef.current.lookY = 0
      touchRef.current.cameraDistance = CAMERA_SETTINGS[nextZone]?.distance ?? CAMERA_DISTANCE
      window.setTimeout(() => setZoneFadeActive(false), 180)
    }, 180)
  }

  const requestOutdoorTransition = () => {
    transitionToZone(currentZone === ZONES.outside ? ZONES.interior : ZONES.outside)
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
      if (isNearOutdoorDoor) {
        event.preventDefault()
        requestOutdoorTransition()
        return
      }
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
  }, [mode, isNearOutdoorDoor, nearbySeat, seatedState, currentZone, zoneFadeActive])

  const openCustomizationMode = () => {
    if (!canModifyWorld) return
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
    if (!canModifyWorld) return
    setEditableObjects((current) =>
      current.map((object) => (object.id === id ? { ...object, position } : object)),
    )
  }

  const storeSelectedObject = () => {
    if (!canModifyWorld) return
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
    if (!canModifyWorld) return
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
    if (!canModifyWorld) return
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
    if (!canModifyWorld) return
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
    if (!canModifyWorld) return
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

  const requestVisitPlayer = async (player) => {
    if (!authUser || multiplayerRole !== 'solo') return
    const request = {
      ...createVisitRequest({ fromUser: authUser, toUserId: player.userId }),
      toDisplayName: player.displayName,
    }
    setOutgoingVisitRequest(request)
    setMultiplayerMessage(`Demande envoyee a ${player.displayName}.`)
    await onlinePresenceRef.current?.sendVisitRequest(request)
  }

  const acceptVisitRequest = async () => {
    if (!incomingVisitRequest || !authUser || multiplayerRole !== 'solo') return
    await saveCurrentProgressToCloud()
    const session = createSessionFromRequest({
      ...incomingVisitRequest,
      toDisplayName: displayName || authUser.email?.split('@')[0] || 'Hote',
    })
    session.worldSnapshot = latestProgressRef.current ?? createCurrentProgressSnapshot()
    const response = {
      accepted: true,
      requestId: incomingVisitRequest.id,
      toUserId: incomingVisitRequest.fromUserId,
      fromUserId: authUser.id,
      session,
    }
    setIncomingVisitRequest(null)
    setMultiplayerSession(session)
    setMultiplayerRole('host')
    setMode('play')
    setIsSkinMenuOpen(false)
    setIsEnvironmentMenuOpen(false)
    setSelectedObjectId(null)
    setDraggingObjectId(null)
    setPlacingObjectId(null)
    setPlacementPreview(null)
    setIsObjectInventoryOpen(false)
    setMultiplayerMessage(`${session.guestDisplayName} rejoint ton monde.`)
    await onlinePresenceRef.current?.sendVisitResponse(response)
  }

  const rejectVisitRequest = async () => {
    if (!incomingVisitRequest || !authUser) return
    await onlinePresenceRef.current?.sendVisitResponse({
      accepted: false,
      requestId: incomingVisitRequest.id,
      toUserId: incomingVisitRequest.fromUserId,
      fromUserId: authUser.id,
    })
    setIncomingVisitRequest(null)
    setMultiplayerMessage('Demande refusee.')
  }

  const leaveMultiplayerSession = async () => {
    if (multiplayerSession && authUser) {
      await multiplayerChannelRef.current?.sendSessionEnded({
        sessionId: multiplayerSession.id,
        hostUserId: multiplayerSession.hostUserId,
        guestUserId: multiplayerSession.guestUserId,
      })
      await onlinePresenceRef.current?.sendSessionEnded({
        sessionId: multiplayerSession.id,
        hostUserId: multiplayerSession.hostUserId,
        guestUserId: multiplayerSession.guestUserId,
        toUserId: authUser.id === multiplayerSession.hostUserId
          ? multiplayerSession.guestUserId
          : multiplayerSession.hostUserId,
      })
    }

    setMultiplayerRole('solo')
    setMultiplayerSession(null)
    setRemotePlayerState(null)
    setRemoteBallState(null)
    setIncomingVisitRequest(null)
    setOutgoingVisitRequest(null)
    setMultiplayerMessage('Visite terminee.')

    if (isGuestVisit) {
      try {
        const ownProgress = await loadPlayerProgress({ scope: progressScope })
        if (ownProgress) applyProgressSnapshot(ownProgress)
      } catch {}
    }
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
      <div className={`canvas-wrap${isDebugMode && debugToggles.portrait ? ' debug-portrait' : ''}`}>
      <Canvas
        dpr={renderSettings.dpr}
        camera={{ fov: BASE_CAMERA_VERTICAL_FOV, position: [0, 2.4, 6], near: 0.1, far: 240 }}
        shadows={{ enabled: !isDebugMode || debugToggles.shadows, type: PCFShadowMap }}
        gl={{
          antialias: renderSettings.antialias,
          powerPreference: 'high-performance',
          stencil: false,
          depth: true,
        }}
        onCreated={({ gl }) => {
          gl.outputColorSpace = SRGBColorSpace
          gl.toneMapping = ACESFilmicToneMapping
          gl.toneMappingExposure = 1.04
        }}
        resize={{ debounce: 80 }}
      >
        <AdaptiveCameraFov />
        <RenderQualityGovernor onScaleChange={setDynamicRenderScale} />
        <RenderStatsProbe onStatsChange={setRenderStats} onRendererInfo={setRendererInfo} />
        <MultiplayerBridge
          channelRef={multiplayerChannelRef}
          role={multiplayerRole}
          localUserId={authUser?.id}
          playerPositionRef={playerPositionRef}
          playerVelocityRef={playerVelocityRef}
          localPlayerStateRef={localPlayerStateRef}
          remoteBallState={remoteBallState}
          ballRef={ballRef}
          guestKickQueueRef={guestKickQueueRef}
          hostTimeOffsetRef={hostTimeOffsetRef}
        />
        <InteriorLighting active={currentZone !== ZONES.outside} hideCeiling={mode === 'customize'} roomLightOn={roomLightOn} lightColor={lightColor} />
        {(!isDebugMode || debugToggles.house) && (
        <PlayerHouse exteriorVisible>
          <group>
            <HouseInterior
              floorTexturePath={activeFloorSkin.texture}
              wallTexturePath={activeWallSkin.texture}
              ceilingTexturePath={activeCeilingTexturePath}
              hideCeiling={mode === 'customize'}
              hideRoof={mode === 'customize'}
            />
            <LightSwitch isOn={roomLightOn} isNear={isNearLightSwitch && canModifyWorld} onOpen={() => canModifyWorld && setIsLightMenuOpen((v) => !v)} mode={mode} />
            <Dragon playerPositionRef={playerPositionRef} />
            {catActive && <Cat playerPositionRef={playerPositionRef} playerVelocityRef={playerVelocityRef} currentZone={currentZone} catPositionRef={catPositionRef} catGroupRef={catGroupRef} />}
            {catActive && (isAdminMode || isVerticalFrameMode) && <CatTapDetector catPositionRef={catPositionRef} callbackRef={catTapCallbackRef} onToggle={toggleCameraOnCat} />}
            <GlassContainmentRoom roomLightOn={roomLightOn} lightColor={lightColor} />
            <OutdoorDoor />
            <BallStation isNear={isNearSkinStation} goalObject={goalObject} />
            <EnvironmentStation isNear={isNearEnvironmentStation} />
            <CustomizationStation isNear={isNearCustomizationStation} />
            <SeatTargetMarker seat={mode === 'play' && !seatedState?.phase ? nearbySeat : null} />
          </group>
          <CustomizationLayer
            mode={currentZone === ZONES.outside || !canModifyWorld ? 'play' : mode}
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
        </PlayerHouse>
        )}
        <OutdoorNeighborhood
          lightingActive={currentZone === ZONES.outside}
          playerPositionRef={playerPositionRef}
          ballRef={ballRef}
          showGrass={!isDebugMode || debugToggles.grass}
          showTrees={!isDebugMode || debugToggles.trees}
          showTerrain={!isDebugMode || debugToggles.terrain}
          showSky={!isDebugMode || debugToggles.sky}
          castShadows={!isDebugMode || debugToggles.shadows}
          showPlayerPlot={(isDebugMode && debugToggles.plot) || mode === 'customize'}
        />
        <RemotePlayer
          state={remotePlayerState}
          label={multiplayerRole === 'host' ? multiplayerSession?.guestDisplayName : multiplayerSession?.hostDisplayName}
          transport={sessionTransport}
          serverTimeOffsetRef={hostTimeOffsetRef}
        />
        <Physics gravity={[0, -9.81, 0]}>
          <PhysicsBounds />
          <GlassContainmentColliders />
          <OutdoorBounds includeHouseFootprint={false} />
          <Goal
            object={goalObject}
            mode={canModifyWorld ? mode : 'play'}
            selected={selectedObjectId === goalObject.id}
            onSelect={setSelectedObjectId}
            onStartDragging={setDraggingObjectId}
            onBallZoneEnter={handleBallZoneEnter}
            onBallZoneExit={handleBallZoneExit}
            ballRef={ballRef}
          />
          <Ball
            ballRef={ballRef}
            skinTexturePath={activeSkin.texture}
            linearDamping={currentZone === ZONES.outside ? 0.08 : 0.35}
            angularDamping={currentZone === ZONES.outside ? 0.12 : 0.4}
            spawnPosition={(() => {
              const gx = goalObject.position?.[0] ?? 0
              const gy = goalObject.position?.[1] ?? 0
              const gz = goalObject.position?.[2] ?? 0
              const rotY = goalObject.rotationY ?? 0
              const offset = 3.5
              const sx = gx + Math.sin(rotY) * offset
              const sz = gz + Math.cos(rotY) * offset
              const groundY = isGoalInsideHouse(goalObject.position) ? 0 : getTerrainHeight(sx, sz)
              return [sx, Math.max(gy + 1.2, groundY + 0.5), sz]
            })()}
          />
          <BallRespawnGuard ballRef={ballRef} goalObject={goalObject} onOutOfBounds={handleOutOfBoundsRespawn} />
          {(!isDebugMode || debugToggles.player) && (
            <Player
              touchRef={touchRef}
              ballRef={ballRef}
              playerPositionRef={playerPositionRef}
              playerVelocityRef={playerVelocityRef}
              mode={mode}
              currentZone={currentZone}
              spawnRequest={spawnRequest}
              goalObject={goalObject}
              seatedState={seatedState}
              onSeatedPhaseChange={updateSeatedPhase}
              cameraOnCat={cameraOnCat}
              catPositionRef={catPositionRef}
              localPlayerStateRef={localPlayerStateRef}
              onKickIntent={isGuestVisit
                ? ({ impulse }) => {
                  multiplayerChannelRef.current?.sendGuestKick({ impulse })
                  return false
                }
                : null}
            />
          )}
          <OutdoorDoorTrigger
            playerPositionRef={playerPositionRef}
            currentZone={currentZone}
            onNearChange={setIsNearOutdoorDoor}
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
          <LightSwitchTrigger
            playerPositionRef={playerPositionRef}
            enabled={currentZone !== ZONES.outside && mode === 'play' && canModifyWorld}
            onNearChange={(near) => { setIsNearLightSwitch(near); if (!near) setIsLightMenuOpen(false) }}
          />
          <BallStationTrigger playerPositionRef={playerPositionRef} goalObject={goalObject} onNearChange={setIsNearSkinStation} />
          {currentZone !== ZONES.outside && (
            <>
              <EnvironmentStationTrigger playerPositionRef={playerPositionRef} onNearChange={setIsNearEnvironmentStation} />
              <CustomizationStationTrigger
                playerPositionRef={playerPositionRef}
                onNearChange={setIsNearCustomizationStation}
                enabled={mode === 'play' && canModifyWorld}
              />
            </>
          )}
          {showCaptureUi && <ScorePopups popups={scorePopups} />}
        </Physics>
      </Canvas>
      </div>
      {isDebugMode && (
        <RenderStatsOverlay
          stats={renderStats}
          toggles={debugToggles}
          onToggle={(key) => setDebugToggles((current) => ({ ...current, [key]: !current[key] }))}
        />
      )}
      <GpuWarning visible={showGpuWarning} onDismiss={() => setGpuWarningDismissed(true)} />

      {mode === 'play' && (
        <ControlsOverlay
          touchRef={touchRef}
          adminCameraControls={isAdminMode || isVerticalFrameMode}
          uiHidden={!showCaptureUi}
          onTap={catActive && (isAdminMode || isVerticalFrameMode) ? (clientX, clientY) => { catTapCallbackRef.current?.(clientX, clientY) } : undefined}
        />
      )}
      {showCaptureUi && <CoinsOverlay coins={coins} />}
      {showCaptureUi && isLocalNetwork && canModifyWorld && (
        <button className="debug-add-coins-btn" type="button" onClick={() => applyCoinDelta(500)}>
          +500
        </button>
      )}
      {showCaptureUi && catActive && cameraOnCat && (isAdminMode || isVerticalFrameMode) && (
        <button className="cat-cam-btn" type="button" onClick={() => setCameraOnCat(false)}>
          🐱 Caméra chat — Retour joueur
        </button>
      )}
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
      {showCaptureUi && (
        <MultiplayerPanel
          configured={isMultiplayerAvailable()}
          user={authUser}
          open={isMultiplayerOpen}
          role={multiplayerRole}
          session={multiplayerSession}
          onlinePlayers={onlinePlayers}
          incomingRequest={incomingVisitRequest}
          outgoingRequest={outgoingVisitRequest}
          sessionConnectionState={sessionConnectionState}
          sessionTransport={sessionTransport}
          remotePlayerState={remotePlayerState}
          message={multiplayerMessage}
          onToggle={() => setIsMultiplayerOpen((current) => !current)}
          onRequestVisit={requestVisitPlayer}
          onAcceptRequest={acceptVisitRequest}
          onRejectRequest={rejectVisitRequest}
          onLeaveSession={leaveMultiplayerSession}
        />
      )}
      {showCaptureUi && isNearOutdoorDoor && mode === 'play' && !isSkinMenuOpen && !isEnvironmentMenuOpen && (
        <button className="skin-open-btn outdoor-open-btn" type="button" onClick={requestOutdoorTransition}>
          {currentZone === ZONES.outside ? 'Entrer' : 'Sortir'}
        </button>
      )}
      {showCaptureUi && canModifyWorld && isNearSkinStation && !isSkinMenuOpen && mode === 'play' && (
        <button className="skin-open-btn" type="button" onClick={openSkinMenu}>
          Personnaliser le ballon
        </button>
      )}
      {showCaptureUi && canModifyWorld && currentZone !== ZONES.outside && isNearEnvironmentStation && !isEnvironmentMenuOpen && mode === 'play' && (
        <button className="skin-open-btn skin-open-btn-right" type="button" onClick={openEnvironmentMenu}>
          Boutique
        </button>
      )}
      {showCaptureUi && canModifyWorld && currentZone !== ZONES.outside && isNearCustomizationStation && mode === 'play' && !isSkinMenuOpen && !isEnvironmentMenuOpen && (
        <button className="skin-open-btn custom-open-btn" type="button" onClick={openCustomizationMode}>
          Personnaliser la piece
        </button>
      )}
      {showCaptureUi && canModifyWorld && isLightMenuOpen && isNearLightSwitch && mode === 'play' && !isSkinMenuOpen && !isEnvironmentMenuOpen && (
        <div className="light-panel">
          <button
            className={`light-panel-toggle ${roomLightOn ? 'on' : 'off'}`}
            type="button"
            onClick={() => setRoomLightOn((v) => !v)}
          >
            {roomLightOn ? 'Lumière ON' : 'Lumière OFF'}
          </button>
          {roomLightOn && <LightColorWheel onChange={setLightColor} />}
          <button className="light-panel-close" type="button" onClick={() => setIsLightMenuOpen(false)}>
            Fermer
          </button>
        </div>
      )}
      {showCaptureUi && canModifyWorld && nearbyTv && mode === 'play' && !isSkinMenuOpen && !isEnvironmentMenuOpen && (
        <button className="skin-open-btn tv-open-btn" type="button" onClick={requestTvMenu}>
          TV
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
      {showCaptureUi && canModifyWorld && currentZone !== ZONES.outside && mode === 'customize' && (
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
      {showCaptureUi && canModifyWorld && currentZone !== ZONES.outside && mode === 'customize' && (
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
        onRespawn={handleBallRespawn}
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
        ownedCat={ownedCat}
        catActive={catActive}
        onBuyCat={buyCat}
        onToggleCat={toggleCat}
      />
      <div className={`zone-fade${zoneFadeActive ? ' active' : ''}`} />
    </main>
  )

  if (isAdminMode || isVerticalFrameMode) {
    return (
      <div className="admin-viewport">
        <div
          className="admin-frame"
          style={verticalFrameSize ? {
            width: `${verticalFrameSize.width}px`,
            height: `${verticalFrameSize.height}px`,
          } : undefined}
        >
          {gameView}
        </div>
      </div>
    )
  }

  return gameView
}

export default App

// ─── Cat tap detector ────────────────────────────────────────────────────────

function CatTapDetector({ catPositionRef, callbackRef, onToggle }) {
  const { camera, gl } = useThree()

  useEffect(() => {
    callbackRef.current = (clientX, clientY) => {
      const rect = gl.domElement.getBoundingClientRect()
      const nx = ((clientX - rect.left) / rect.width) * 2 - 1
      const ny = -((clientY - rect.top) / rect.height) * 2 + 1
      const raycaster = new Raycaster()
      raycaster.setFromCamera({ x: nx, y: ny }, camera)
      const catVec = new Vector3(
        catPositionRef.current.x,
        catPositionRef.current.y + 0.3,
        catPositionRef.current.z,
      )
      const closest = raycaster.ray.closestPointToPoint(catVec, new Vector3())
      if (closest.distanceTo(catVec) < 0.7) onToggle()
    }
    return () => { callbackRef.current = null }
  }, [camera, gl, catPositionRef, callbackRef, onToggle])

  return null
}

// ─── Cat NPC ────────────────────────────────────────────────────────────────

const PET_STATE = {
  IDLE_NEAR:      'idle_near',
  FOLLOW:         'follow',
  CATCH_UP:       'catch_up',
  RUN_WITH_PLAYER:'run_with_player',
  WANDER:         'wander',
  DECIDING:       'deciding',
}

const CAT_MAX_WALK_SPEED   = 1.7
const CAT_MAX_RUN_SPEED    = 4.0
const CAT_TURN_SPEED       = 5.5
const CAT_SLOW_RADIUS      = 1.2   // arrive : commence à freiner dans ce rayon
const CAT_IDLE_DIST        = 1.1   // en dessous → IDLE_NEAR
const CAT_CATCHUP_DIST     = 4.0   // au-delà → CATCH_UP
const CAT_RUN_PLAYER_SPEED = 2.8   // vitesse joueur déclenchant RUN_WITH_PLAYER
// Seuils d'hysteresis pour IDLE_NEAR : le chat ne part pas au premier micro-mouvement
const CAT_LAZY_MOVE_DIST   = 1.8   // distance minimale pour quitter IDLE_NEAR
const CAT_LAZY_MOVE_TIME   = 1.2   // secondes à cette distance avant de se décider
const CAT_SIT_DELAY        = 4.0   // secondes idle avant de s'asseoir
const CAT_WANDER_INTERVAL  = 6000  // ms entre tentatives de promenade
const CAT_WANDER_RADIUS    = 1.5

const CAT_OFFSETS = [
  { side: -0.7, back: 0.9 },
  { side:  0.7, back: 0.9 },
  { side: -0.5, back: 0.3 },
  { side:  0.5, back: 0.3 },
  { side:  0.0, back: 1.1 },
]

function Cat({ playerPositionRef, playerVelocityRef, currentZone, catPositionRef, catGroupRef }) {
  const { scene, animations } = useGLTF('/models/cat.glb')
  const cat = useMemo(() => clone(scene), [scene])
  const { actions } = useAnimations(animations, cat)
  const groupRef         = useRef()
  const stateRef         = useRef(PET_STATE.IDLE_NEAR)
  const timerRef         = useRef(CAT_SIT_DELAY)
  // Accumule le temps passé hors de la zone confortable (hysteresis)
  const lazyTimerRef     = useRef(0)
  const wanderTargetRef  = useRef(new Vector3())
  const offsetRef        = useRef(CAT_OFFSETS[0])
  const currentActionRef = useRef(null)
  const currentAnimRef   = useRef('')

  const playAnim = useCallback((name, loop = true, fade = 0.3) => {
    if (currentAnimRef.current === name) return
    const action = actions[name]
    if (!action) return
    currentActionRef.current?.fadeOut(fade)
    action.reset().setLoop(loop ? LoopRepeat : LoopOnce, loop ? Infinity : 1).play()
    action.setEffectiveWeight(1).setEffectiveTimeScale(1)
    if (fade > 0) action.fadeIn(fade)
    action.clampWhenFinished = !loop
    currentActionRef.current = action
    currentAnimRef.current = name
  }, [actions])

  useEffect(() => {
    cat.traverse((obj) => {
      if (obj instanceof Mesh) { obj.castShadow = true; obj.receiveShadow = true }
    })
    playAnim('Idle')
  }, [cat, playAnim])

  // Hauteur du sol sous une position XZ donnée
  const getFloorY = useCallback((x, z) => {
    return currentZone === ZONES.outside ? getTerrainHeight(x, z) : 0
  }, [currentZone])

  const pickOffset = useCallback(() => {
    const prev = offsetRef.current
    const choices = CAT_OFFSETS.filter(o => o !== prev)
    offsetRef.current = choices[Math.floor(Math.random() * choices.length)]
  }, [])

  const computeTarget = useCallback((pp, pv, side, back) => {
    const speed = Math.sqrt(pv.x * pv.x + pv.z * pv.z)
    let fwdX, fwdZ
    if (speed > 0.15) {
      fwdX = pv.x / speed; fwdZ = pv.z / speed
    } else {
      const g = groupRef.current
      if (!g) return { x: pp.x, z: pp.z }
      const dx = pp.x - g.position.x
      const dz = pp.z - g.position.z
      const d = Math.sqrt(dx * dx + dz * dz) || 1
      fwdX = dx / d; fwdZ = dz / d
    }
    const rightX = fwdZ, rightZ = -fwdX
    return {
      x: pp.x - fwdX * back + rightX * side,
      z: pp.z - fwdZ * back + rightZ * side,
    }
  }, [])

  // Steering arrive + colle le chat au sol
  const arriveToward = useCallback((tx, tz, maxSpeed, delta) => {
    const g = groupRef.current
    const dx = tx - g.position.x
    const dz = tz - g.position.z
    const dist = Math.sqrt(dx * dx + dz * dz)
    if (dist < 0.02) return 0
    const speed = maxSpeed * MathUtils.clamp(dist / CAT_SLOW_RADIUS, 0, 1)
    const step = Math.min(speed * delta, dist)
    const nx = g.position.x + (dx / dist) * step
    const nz = g.position.z + (dz / dist) * step
    g.position.x = nx
    g.position.z = nz
    g.position.y = getFloorY(nx, nz)
    return dist
  }, [getFloorY])

  const turnToward = useCallback((tx, tz, delta) => {
    const g = groupRef.current
    const dx = tx - g.position.x
    const dz = tz - g.position.z
    if (Math.abs(dx) < 0.001 && Math.abs(dz) < 0.001) return
    let diff = Math.atan2(dx, dz) - g.rotation.y
    while (diff > Math.PI)  diff -= Math.PI * 2
    while (diff < -Math.PI) diff += Math.PI * 2
    g.rotation.y += diff * Math.min(CAT_TURN_SPEED * delta, 1)
  }, [])

  useFrame((_, delta) => {
    if (!groupRef.current || !playerPositionRef?.current) return

    const pp  = playerPositionRef.current
    const pv  = playerVelocityRef?.current ?? { x: 0, z: 0 }
    const pos = groupRef.current.position

    const playerSpeed = Math.sqrt(pv.x * pv.x + pv.z * pv.z)
    const dist = Math.hypot(pp.x - pos.x, pp.z - pos.z)

    // Colle toujours le chat au sol, même quand il est immobile
    pos.y = getFloorY(pos.x, pos.z)

    // ── Transitions d'état ────────────────────────────────────────────────
    const state = stateRef.current

    if (state === PET_STATE.IDLE_NEAR) {
      // Hysteresis : n'accumule le timer que si le joueur est vraiment loin ET bouge
      if (dist > CAT_LAZY_MOVE_DIST) {
        lazyTimerRef.current += delta
        if (lazyTimerRef.current >= CAT_LAZY_MOVE_TIME) {
          lazyTimerRef.current = 0
          // Le joueur court : RUN_WITH_PLAYER directement
          if (playerSpeed > CAT_RUN_PLAYER_SPEED) {
            pickOffset(); stateRef.current = PET_STATE.RUN_WITH_PLAYER
          } else if (dist > CAT_CATCHUP_DIST) {
            stateRef.current = PET_STATE.CATCH_UP
          } else {
            pickOffset(); stateRef.current = PET_STATE.FOLLOW; timerRef.current = CAT_SIT_DELAY
          }
        }
      } else {
        lazyTimerRef.current = Math.max(0, lazyTimerRef.current - delta * 2) // oublie vite si revenu proche
      }

      timerRef.current -= delta
      if (timerRef.current <= 0) playAnim('Sit')
      else playAnim('Idle')
      return
    }

    // Dans tous les autres états, retour à IDLE_NEAR si le joueur est revenu
    if (dist <= CAT_IDLE_DIST && state !== PET_STATE.WANDER) {
      stateRef.current = PET_STATE.IDLE_NEAR
      timerRef.current = CAT_SIT_DELAY
      lazyTimerRef.current = 0
      playAnim('Idle')
      return
    }

    // Escalade vers CATCH_UP ou RUN si nécessaire depuis FOLLOW
    if (state === PET_STATE.FOLLOW) {
      if (playerSpeed > CAT_RUN_PLAYER_SPEED) { pickOffset(); stateRef.current = PET_STATE.RUN_WITH_PLAYER; return }
      if (dist > CAT_CATCHUP_DIST) { stateRef.current = PET_STATE.CATCH_UP; return }
    }
    // Retour vers FOLLOW depuis CATCH_UP quand assez proche
    if (state === PET_STATE.CATCH_UP && dist <= CAT_CATCHUP_DIST * 0.7) {
      pickOffset(); stateRef.current = PET_STATE.FOLLOW; timerRef.current = CAT_SIT_DELAY
    }
    // Retour vers FOLLOW depuis RUN si le joueur ralentit
    if (state === PET_STATE.RUN_WITH_PLAYER && playerSpeed <= CAT_RUN_PLAYER_SPEED * 0.7 && dist <= CAT_CATCHUP_DIST) {
      pickOffset(); stateRef.current = PET_STATE.FOLLOW; timerRef.current = CAT_SIT_DELAY
    }

    // ── Comportements ─────────────────────────────────────────────────────
    if (stateRef.current === PET_STATE.FOLLOW) {
      const { side, back } = offsetRef.current
      const tgt = computeTarget(pp, pv, side, back)
      turnToward(tgt.x, tgt.z, delta)
      const remaining = arriveToward(tgt.x, tgt.z, CAT_MAX_WALK_SPEED, delta)
      playAnim(remaining > 0.15 ? 'Walk' : 'Idle')
      return
    }

    if (stateRef.current === PET_STATE.CATCH_UP) {
      playAnim('Run')
      turnToward(pp.x, pp.z, delta)
      arriveToward(pp.x, pp.z, CAT_MAX_RUN_SPEED, delta)
      return
    }

    if (stateRef.current === PET_STATE.RUN_WITH_PLAYER) {
      const { side, back } = offsetRef.current
      const tgt = computeTarget(pp, pv, side, back)
      playAnim('Run')
      turnToward(tgt.x, tgt.z, delta)
      arriveToward(tgt.x, tgt.z, CAT_MAX_RUN_SPEED, delta)
      return
    }

    if (stateRef.current === PET_STATE.WANDER) {
      if (dist > CAT_CATCHUP_DIST) { stateRef.current = PET_STATE.CATCH_UP; return }
      const wt = wanderTargetRef.current
      turnToward(wt.x, wt.z, delta)
      const remaining = arriveToward(wt.x, wt.z, CAT_MAX_WALK_SPEED * 0.75, delta)
      playAnim(remaining > 0.1 ? 'Walk' : 'Idle')
      timerRef.current -= delta
      if (remaining < 0.2 || timerRef.current <= 0) {
        stateRef.current = PET_STATE.IDLE_NEAR
        timerRef.current = CAT_SIT_DELAY
        lazyTimerRef.current = 0
        playAnim('Idle')
      }
    }

    if (catPositionRef) {
      catPositionRef.current.x = pos.x
      catPositionRef.current.y = pos.y
      catPositionRef.current.z = pos.z
    }
  })

  useEffect(() => {
    const id = setInterval(() => {
      if (stateRef.current !== PET_STATE.IDLE_NEAR) return
      if (!playerPositionRef?.current || !groupRef.current) return
      const pv = playerVelocityRef?.current ?? { x: 0, z: 0 }
      if (Math.sqrt(pv.x * pv.x + pv.z * pv.z) > 0.2) return
      if (Math.random() > 0.5) return
      const pp = playerPositionRef.current
      const angle = Math.random() * Math.PI * 2
      const r = CAT_WANDER_RADIUS * (0.4 + Math.random() * 0.6)
      wanderTargetRef.current.set(pp.x + Math.cos(angle) * r, 0, pp.z + Math.sin(angle) * r)
      stateRef.current = PET_STATE.WANDER
      timerRef.current = 3 + Math.random() * 3
    }, CAT_WANDER_INTERVAL)
    return () => clearInterval(id)
  }, [playerPositionRef, playerVelocityRef])

  return (
    <group ref={(el) => { groupRef.current = el; if (catGroupRef) catGroupRef.current = el }} position={[1, 0, 2]}>
      <primitive object={cat} />
    </group>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

useGLTF.preload('/models/ball/ballon.glb')
useGLTF.preload('/models/dragon.glb')
useGLTF.preload('/models/cat.glb')
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
