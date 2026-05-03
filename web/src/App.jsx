import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, Html, useAnimations, useFBX, useGLTF, useTexture } from '@react-three/drei'
import { BallCollider, CapsuleCollider, CuboidCollider, Physics, RigidBody, useRapier } from '@react-three/rapier'
import { BackSide, LoopOnce, LoopRepeat, MathUtils, Mesh, PlaneGeometry, RepeatWrapping, SRGBColorSpace, Vector3 } from 'three'
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { useEffect, useMemo, useRef, useState } from 'react'

const ROOM_LIMIT = 4.95
const GOAL_Z = -3.42
const BALL_RADIUS = 0.138
const PLAYER_CAPSULE_HALF_HEIGHT = 0.2
const PLAYER_CAPSULE_RADIUS = 0.22
const PLAYER_HEIGHT = PLAYER_CAPSULE_HALF_HEIGHT + PLAYER_CAPSULE_RADIUS
const PLAYER_MODEL_SCALE = 0.0129
const PLAYER_MODEL_VERTICAL_OFFSET = 0.1
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
const EMOTE_LONG_PRESS_MS = 420
const EMOTE_CANCEL_DISTANCE = 14
const EMOTE_MENU_RADIUS = 86
const EMOTE_MENU_DEADZONE = 26
const EMOTE_MENU_ARC_START = -Math.PI / 2 - Math.PI / 3
const EMOTE_MENU_ARC_END = -Math.PI / 2 + Math.PI / 3
const CAMERA_DISTANCE = 4.6
const CAMERA_HEIGHT = 1.55
const EDGE_TRIGGER_PX = 14
const CAMERA_DRAG_SENSITIVITY = 0.007
const SHOW_FLOOR_GRID = false
const GOAL_POINTS = 10
const SKIN_STORAGE_KEY = 'lab_ball_skins_v1'
const SKIN_STATION_POSITION = { x: -3.5, y: 0.35, z: 1.8 }
const ENV_STATION_POSITION = { x: 3.5, y: 0.35, z: 1.8 }
const MAIN_ROOM = { width: 10, depth: 10, height: 5 }
const FRONT_WALL = { zVisual: 5.05, zCollider: 5.1, thickness: 0.1 }
const DRAGON_OPENING = { centerX: 0, width: 6, bottomY: 0, height: 3.8 }
const WALL_REPEAT_X_PER_UNIT = 3.4 / 12
const WALL_REPEAT_Y_PER_UNIT = 1.9 / 5

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
    price: 130,
    texture: '/textures/environment/floors/sol-beton.png',
  },
  {
    id: 'floor-parquet-loft',
    name: 'Parquet Loft',
    price: 190,
    texture: '/textures/environment/floors/sol-parquet-01.png',
  },
  {
    id: 'floor-parquet-clair',
    name: 'Parquet Clair',
    price: 250,
    texture: '/textures/environment/floors/sol-parquet-02.png',
  },
  {
    id: 'floor-tomette',
    name: 'Tomette',
    price: 320,
    texture: '/textures/environment/floors/sol-tomette.png',
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
    price: 140,
    texture: '/textures/environment/walls/mur-brique-02.png',
  },
  {
    id: 'wall-briques-01',
    name: 'Briques 01',
    price: 210,
    texture: '/textures/environment/walls/mur-briques-01.png',
  },
]

const emotes = [
  { id: 'wave', label: 'Salut', glyph: '👋' },
  { id: 'dance', label: 'Danse', glyph: '♫' },
]

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

function dampAngle(current, target, damping, delta) {
  let diff = (target - current + Math.PI) % (Math.PI * 2)
  if (diff < 0) diff += Math.PI * 2
  diff -= Math.PI
  return current + diff * Math.min(1, damping * delta)
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

function collidesWithGoalFrame(nextX, nextY, nextZ) {
  const r = PLAYER_CAPSULE_RADIUS
  const hitLeftPost = intersectsAabbSphere(nextX, nextY, nextZ, r, -1.5, 1, GOAL_Z, 0.11, 1, 0.11)
  const hitRightPost = intersectsAabbSphere(nextX, nextY, nextZ, r, 1.5, 1, GOAL_Z, 0.11, 1, 0.11)
  const hitCrossbar = intersectsAabbSphere(nextX, nextY, nextZ, r, 0, 2, GOAL_Z, 1.58, 0.11, 0.11)
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
      const key = event.key.toLowerCase()

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
      const key = event.key.toLowerCase()

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

function WhiteRoom({ floorTexturePath, wallTexturePath }) {
  const floorColorMap = useTexture(floorTexturePath)
  const wallColorMap = useTexture(wallTexturePath)
  floorColorMap.wrapS = RepeatWrapping
  floorColorMap.wrapT = RepeatWrapping
  floorColorMap.repeat.set(3.2, 3.2)
  floorColorMap.colorSpace = SRGBColorSpace
  wallColorMap.wrapS = RepeatWrapping
  wallColorMap.wrapT = RepeatWrapping
  wallColorMap.colorSpace = SRGBColorSpace
  const ceilingTexture = useMemo(() => {
    const next = wallColorMap.clone()
    next.wrapS = RepeatWrapping
    next.wrapT = RepeatWrapping
    next.repeat.set(
      Math.max(0.01, MAIN_ROOM.width * WALL_REPEAT_X_PER_UNIT),
      Math.max(0.01, MAIN_ROOM.depth * WALL_REPEAT_X_PER_UNIT),
    )
    next.colorSpace = SRGBColorSpace
    next.needsUpdate = true
    return next
  }, [wallColorMap])
  useEffect(() => () => ceilingTexture.dispose(), [ceilingTexture])
  const frontWall = getWallOpeningLayout(MAIN_ROOM.width, MAIN_ROOM.height, DRAGON_OPENING)

  return (
    <>
      <color attach="background" args={['#eef3f8']} />
      <fog attach="fog" args={['#eef3f8', 10, 24]} />

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
      <mesh position={[0, 4.98, 0]}>
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

function Goal({ onBallZoneEnter, onBallZoneExit, ballRef }) {
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
    <group position={[0, 0, GOAL_Z]}>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[0.11, 1, 0.11]} position={[-1.5, 1, 0]} restitution={0.72} friction={0.5} />
        <CuboidCollider args={[0.11, 1, 0.11]} position={[1.5, 1, 0]} restitution={0.72} friction={0.5} />
        <CuboidCollider args={[1.58, 0.11, 0.11]} position={[0, 2, 0]} restitution={0.72} friction={0.5} />
        <CuboidCollider args={[1.5, 1, 0.05]} position={[0, 1, -1.14]} restitution={0.52} friction={0.45} />
      </RigidBody>

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

      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider
          args={[1.34, 0.86, 0.44]}
          position={[0, 1, -0.5]}
          sensor
          onIntersectionEnter={handleGoalSensorEnter}
          onIntersectionExit={handleGoalSensorExit}
        />
      </RigidBody>

      <GoalNet ballRef={ballRef} />
    </group>
  )
}

function GoalNet({ ballRef }) {
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
      const vx = p.x
      const vy = p.y
      const vzLocal = p.z - GOAL_Z
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

function Player({ touchRef, ballRef, playerPositionRef }) {
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
      state.clock.elapsedTime < danceUntilRef.current
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

    if (collidesWithGoalFrame(nextX, nextY, nextZ)) {
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
                : state.clock.elapsedTime < kickUntilRef.current
                  ? 'kick'
                  : isMoving
                    ? speed > 2.45
                      ? 'run'
                      : 'walk'
                    : 'idle'
    setPlayerMotion((current) => (current === nextMotion ? current : nextMotion))

    const pitch = touch.cameraPitch
    const horizontalDistance = CAMERA_DISTANCE * Math.cos(pitch)
    const desiredX = nextX + Math.sin(yaw) * horizontalDistance
    const desiredY = nextY + CAMERA_HEIGHT + Math.sin(pitch) * CAMERA_DISTANCE
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
  const jumpStart = useFBX('/models/player/player-jump-start.fbx')
  const jumpLoop = useFBX('/models/player/player-jump-loop.fbx')
  const jumpLand = useFBX('/models/player/player-jump-land.fbx')
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
      { source: jumpStart.animations[0], name: 'jumpStart' },
      { source: jumpLoop.animations[0], name: 'fallingIdle' },
      { source: jumpLand.animations[0], name: 'jumpLand' },
    ]

    return clips
      .filter(({ source }) => source)
      .map(({ source, name }) => {
        const clip = source.clone()
        clip.name = name
        if (name === 'wave' || name === 'dance') {
          lockEmoteHipsHeight(clip, hipsRestHeight)
        }
        return clip
      })
  }, [idle.animations, walk.animations, run.animations, kick.animations, wave.animations, dance.animations, jumpStart.animations, jumpLoop.animations, jumpLand.animations])

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

    const isOneShot = nextMotion === 'kick' || nextMotion === 'jumpStart' || nextMotion === 'jumpLand'
    const fadeDuration =
      previousMotion === 'jumpStart' && nextMotion === 'fallingIdle'
        ? PLAYER_JUMP_TO_FALL_ANIMATION_FADE
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

function ControlsOverlay({ touchRef }) {
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
      >
        <div className={`edge-glow right ${edgeGlow.right ? 'active' : ''}`} />
        <div className={`edge-glow left ${edgeGlow.left ? 'active' : ''}`} />
        <div className={`edge-glow top ${edgeGlow.top ? 'active' : ''}`} />
        <div className={`edge-glow bottom ${edgeGlow.bottom ? 'active' : ''}`} />
        {emoteMenu && (
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

      <button className="action-btn" type="button" onPointerDown={triggerAction} aria-label="Action">
        <span className="action-symbol">{'\u2423'}</span>
      </button>
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
  previewFloorIndex,
  previewWallIndex,
  selectedFloorSkinId,
  selectedWallSkinId,
  ownedFloorSkinIds,
  ownedWallSkinIds,
  onClose,
  onPrevious,
  onNext,
  onBuy,
  onSelect,
}) {
  if (!open) return null

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
            className={`env-tab-btn ${!isFloorTab ? 'active' : ''}`}
            onClick={() => onTabChange('wall')}
          >
            Mur
          </button>
        </div>
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
  const isAdminMode = useMemo(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      return params.get('mode') === 'admin'
    } catch {
      return false
    }
  }, [])

  const touchRef = useRef({
    moveX: 0,
    moveY: 0,
    cameraYaw: 0,
    cameraPitch: -0.22,
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
  const [isEnvironmentMenuOpen, setIsEnvironmentMenuOpen] = useState(false)
  const [isNearEnvironmentStation, setIsNearEnvironmentStation] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SKIN_STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw)
      // Economy by mode: normal starts at 0, admin uses test wallet.
      setCoins(isAdminMode ? 850 : 0)
      if (Array.isArray(parsed.ownedSkins) && parsed.ownedSkins.length) setOwnedSkins(parsed.ownedSkins)
      if (typeof parsed.selectedSkinId === 'string') {
        setSelectedSkinId(parsed.selectedSkinId)
        setPreviewSkinId(parsed.selectedSkinId)
      }
      if (Array.isArray(parsed.ownedFloorSkins) && parsed.ownedFloorSkins.length) {
        setOwnedFloorSkins(parsed.ownedFloorSkins)
      }
      if (Array.isArray(parsed.ownedWallSkins) && parsed.ownedWallSkins.length) {
        setOwnedWallSkins(parsed.ownedWallSkins)
      }
      if (typeof parsed.selectedFloorSkinId === 'string') {
        setSelectedFloorSkinId(parsed.selectedFloorSkinId)
        setPreviewFloorSkinId(parsed.selectedFloorSkinId)
      }
      if (typeof parsed.selectedWallSkinId === 'string') {
        setSelectedWallSkinId(parsed.selectedWallSkinId)
        setPreviewWallSkinId(parsed.selectedWallSkinId)
      }
    } catch {}
  }, [])

  useEffect(() => {
    localStorage.setItem(
      SKIN_STORAGE_KEY,
      JSON.stringify({
        coins,
        ownedSkins,
        selectedSkinId,
        ownedFloorSkins,
        ownedWallSkins,
        selectedFloorSkinId,
        selectedWallSkinId,
      }),
    )
  }, [coins, ownedSkins, selectedSkinId, ownedFloorSkins, ownedWallSkins, selectedFloorSkinId, selectedWallSkinId])

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
    setCoins((current) => current + GOAL_POINTS)

    const ball = ballRef.current
    const ballPosition = ball?.translation()
    setScorePopups((previous) => [
      ...previous,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        value: GOAL_POINTS,
        x: ballPosition?.x ?? 0,
        y: Math.max(0.9, ballPosition?.y ?? 0.9),
        z: ballPosition?.z ?? GOAL_Z - 0.55,
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
  const previewFloorIndex = Math.max(0, floorSkins.findIndex((skin) => skin.id === previewFloorSkinId))
  const previewWallIndex = Math.max(0, wallSkins.findIndex((skin) => skin.id === previewWallSkinId))
  const activeFloorSkinId = isEnvironmentMenuOpen ? previewFloorSkinId : selectedFloorSkinId
  const activeWallSkinId = isEnvironmentMenuOpen ? previewWallSkinId : selectedWallSkinId
  const activeFloorSkin = floorSkins.find((skin) => skin.id === activeFloorSkinId) || floorSkins[0]
  const activeWallSkin = wallSkins.find((skin) => skin.id === activeWallSkinId) || wallSkins[0]

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
    const current = Math.max(0, wallSkins.findIndex((skin) => skin.id === previewWallSkinId))
    const next = (current + direction + wallSkins.length) % wallSkins.length
    setPreviewWallSkinId(wallSkins[next].id)
  }

  const buyPreviewSkin = () => {
    const skin = ballSkins[previewIndex]
    if (ownedSkins.includes(skin.id)) return
    if (coins < skin.price) return
    setCoins((current) => current - skin.price)
    setOwnedSkins((current) => [...current, skin.id])
  }

  const selectPreviewSkin = () => {
    const skin = ballSkins[previewIndex]
    if (!ownedSkins.includes(skin.id)) return
    setSelectedSkinId(skin.id)
    setIsSkinMenuOpen(false)
  }
  const buyPreviewEnvironmentSkin = () => {
    const skin = environmentTab === 'floor' ? floorSkins[previewFloorIndex] : wallSkins[previewWallIndex]
    const owned = environmentTab === 'floor' ? ownedFloorSkins : ownedWallSkins
    if (owned.includes(skin.id)) return
    if (coins < skin.price) return
    setCoins((current) => current - skin.price)
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
    const skin = wallSkins[previewWallIndex]
    if (!ownedWallSkins.includes(skin.id)) return
    setSelectedWallSkinId(skin.id)
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
        />
        <Dragon playerPositionRef={playerPositionRef} />
        <GlassContainmentRoom />
        <SkinStation />
        <EnvironmentStation />
        <Physics gravity={[0, -9.81, 0]}>
          <PhysicsBounds />
          <GlassContainmentColliders />
          <Ball ballRef={ballRef} skinTexturePath={activeSkin.texture} />
          <BallRespawnGuard ballRef={ballRef} onOutOfBounds={handleOutOfBoundsRespawn} />
          <Goal onBallZoneEnter={handleBallZoneEnter} onBallZoneExit={handleBallZoneExit} ballRef={ballRef} />
          <Player touchRef={touchRef} ballRef={ballRef} playerPositionRef={playerPositionRef} />
          <SkinStationTrigger playerPositionRef={playerPositionRef} onNearChange={setIsNearSkinStation} />
          <EnvironmentStationTrigger playerPositionRef={playerPositionRef} onNearChange={setIsNearEnvironmentStation} />
          <ScorePopups popups={scorePopups} />
        </Physics>
      </Canvas>

      <ControlsOverlay touchRef={touchRef} />
      <CoinsOverlay coins={coins} />
      {isNearSkinStation && !isSkinMenuOpen && (
        <button className="skin-open-btn" type="button" onClick={openSkinMenu}>
          Personnaliser le ballon
        </button>
      )}
      {isNearEnvironmentStation && !isEnvironmentMenuOpen && (
        <button className="skin-open-btn skin-open-btn-right" type="button" onClick={openEnvironmentMenu}>
          Personnaliser sol + murs
        </button>
      )}
      <SkinMenu
        open={isSkinMenuOpen}
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
        open={isEnvironmentMenuOpen}
        coins={coins}
        activeTab={environmentTab}
        onTabChange={setEnvironmentTab}
        floorSkins={floorSkins}
        wallSkins={wallSkins}
        previewFloorIndex={previewFloorIndex}
        previewWallIndex={previewWallIndex}
        selectedFloorSkinId={selectedFloorSkinId}
        selectedWallSkinId={selectedWallSkinId}
        ownedFloorSkinIds={ownedFloorSkins}
        ownedWallSkinIds={ownedWallSkins}
        onClose={closeEnvironmentMenu}
        onPrevious={() => goEnvironmentPreview(-1)}
        onNext={() => goEnvironmentPreview(1)}
        onBuy={buyPreviewEnvironmentSkin}
        onSelect={selectPreviewEnvironmentSkin}
      />
    </main>
  )

  if (isAdminMode) {
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
useFBX.preload('/models/player/player-jump-start.fbx')
useFBX.preload('/models/player/player-jump-loop.fbx')
useFBX.preload('/models/player/player-jump-land.fbx')
ballSkins.forEach((skin) => useTexture.preload(skin.texture))
floorSkins.forEach((skin) => useTexture.preload(skin.texture))
wallSkins.forEach((skin) => useTexture.preload(skin.texture))
