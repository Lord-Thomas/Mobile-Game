import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, Html, useAnimations, useGLTF, useTexture } from '@react-three/drei'
import { BallCollider, CapsuleCollider, CuboidCollider, Physics, RigidBody, useRapier } from '@react-three/rapier'
import { BackSide, Box3, LoopOnce, LoopRepeat, MathUtils, Mesh, PlaneGeometry, RepeatWrapping, SRGBColorSpace, Vector3 } from 'three'
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { useEffect, useMemo, useRef, useState } from 'react'

const ROOM_LIMIT = 4.95
const GOAL_Z = -3.65
const BALL_RADIUS = 0.256
const PLAYER_CAPSULE_HALF_HEIGHT = 0.2
const PLAYER_CAPSULE_RADIUS = 0.22
const PLAYER_HEIGHT = PLAYER_CAPSULE_HALF_HEIGHT + PLAYER_CAPSULE_RADIUS
const CAMERA_DISTANCE = 4.6
const CAMERA_HEIGHT = 1.55
const EDGE_TRIGGER_PX = 14
const CAMERA_DRAG_SENSITIVITY = 0.007
const SHOW_FLOOR_GRID = false
const GOAL_POINTS = 10

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

function WhiteRoom() {
  const floorColorMap = useTexture('/textures/wood/parquet-color.png')
  floorColorMap.wrapS = RepeatWrapping
  floorColorMap.wrapT = RepeatWrapping
  floorColorMap.repeat.set(3.2, 3.2)
  floorColorMap.colorSpace = SRGBColorSpace

  return (
    <>
      <color attach="background" args={['#eef3f8']} />
      <fog attach="fog" args={['#eef3f8', 10, 24]} />

      <ambientLight intensity={0.5} />
      <hemisphereLight args={['#f7fbff', '#d8dee9', 0.7]} />
      <directionalLight position={[4, 7, 5]} intensity={1.15} color="#ffffff" />

      <mesh position={[-5.05, 2.5, 0]}>
        <boxGeometry args={[0.1, 5, 12]} />
        <meshStandardMaterial color="#f8fafc" side={BackSide} />
      </mesh>
      <mesh position={[5.05, 2.5, 0]}>
        <boxGeometry args={[0.1, 5, 12]} />
        <meshStandardMaterial color="#f8fafc" side={BackSide} />
      </mesh>
      <mesh position={[0, 2.5, -5.05]}>
        <boxGeometry args={[12, 5, 0.1]} />
        <meshStandardMaterial color="#f8fafc" side={BackSide} />
      </mesh>
      <mesh position={[-4.5, 2.5, 5.05]}>
        <boxGeometry args={[3, 5, 0.1]} />
        <meshStandardMaterial color="#f8fafc" side={BackSide} />
      </mesh>
      <mesh position={[4.5, 2.5, 5.05]}>
        <boxGeometry args={[3, 5, 0.1]} />
        <meshStandardMaterial color="#f8fafc" side={BackSide} />
      </mesh>
      <mesh position={[0, 3.88, 5.05]}>
        <boxGeometry args={[6, 2.24, 0.1]} />
        <meshStandardMaterial color="#f8fafc" side={BackSide} />
      </mesh>
      <mesh position={[0, 4.98, 0]}>
        <boxGeometry args={[12, 0.1, 12]} />
        <meshStandardMaterial color="#f8fafc" side={BackSide} />
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

      <mesh position={[0, 2.48, -4.9]}>
        <boxGeometry args={[7, 0.08, 0.08]} />
        <meshStandardMaterial color="#dce3eb" emissive="#dce3eb" emissiveIntensity={0.25} />
      </mesh>

      <Environment preset="city" />
    </>
  )
}

function PhysicsBounds() {
  return (
    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider args={[5, 0.2, 5]} position={[0, -0.2, 0]} />
      <CuboidCollider args={[0.1, 2.4, 5]} position={[-5.1, 2.2, 0]} />
      <CuboidCollider args={[0.1, 2.4, 5]} position={[5.1, 2.2, 0]} />
      <CuboidCollider args={[5, 2.4, 0.1]} position={[0, 2.2, -5.1]} />
      <CuboidCollider args={[1, 2.4, 0.1]} position={[-4, 2.2, 5.1]} />
      <CuboidCollider args={[1, 2.4, 0.1]} position={[4, 2.2, 5.1]} />
      <CuboidCollider args={[3, 0.7, 0.1]} position={[0, 3.9, 5.1]} />
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

function Ball({ ballRef }) {
  const ballSkin = useGLTF('/ball-skin/base_basic_pbr.glb')
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

    return {
      geometry,
      material: picked.material.clone(),
      scale: (BALL_RADIUS * 2) / maxSide,
    }
  }, [ballSkin.scene])

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
      const impactRadius = 1.02
      const impactForce = Math.min(0.22, 0.045 + speed * 0.012)

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

    const spring = Math.min(1, 7.5 * delta)
    const damp = Math.max(0.8, 1 - 6.5 * delta)

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
      positions[i3 + 2] = base[i3 + 2] + displacement[i]
    }

    netRef.current.geometry.attributes.position.needsUpdate = true
  })

  return (
    <group>
      <mesh ref={netRef} geometry={netGeometry} position={[0, 1, -0.02]}>
        <meshStandardMaterial
          color="#f4f8ff"
          wireframe
          transparent
          opacity={0.72}
          roughness={0.7}
          metalness={0.04}
        />
      </mesh>

      <mesh position={[-1.5, 0.98, -0.01]} rotation={[0, Math.PI / 2, 0]} geometry={sideGeometry}>
        <meshStandardMaterial
          color="#f4f8ff"
          wireframe
          transparent
          opacity={0.62}
          roughness={0.75}
          metalness={0.03}
        />
      </mesh>

      <mesh position={[1.5, 0.98, -0.01]} rotation={[0, Math.PI / 2, 0]} geometry={sideGeometry}>
        <meshStandardMaterial
          color="#f4f8ff"
          wireframe
          transparent
          opacity={0.62}
          roughness={0.75}
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
  const velocityYRef = useRef(0)
  const onGroundRef = useRef(true)
  const keyboardRef = useKeyboardInput()
  const { camera } = useThree()
  const { world, rapier } = useRapier()

  useFrame((_, delta) => {
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

    const keyboardAxisX = (key.right ? 1 : 0) - (key.left ? 1 : 0)
    const keyboardAxisY = (key.forward ? 1 : 0) - (key.back ? 1 : 0)

    const rawX = MathUtils.clamp(touch.moveX + keyboardAxisX, -1, 1)
    const rawY = MathUtils.clamp(touch.moveY + keyboardAxisY, -1, 1)
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

    const speed = 3.2
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

    const wantsAction = key.actionQueued || touch.actionQueued
    if (wantsAction) {
      const ball = ballRef.current
      if (ball) {
        const ballPos = ball.translation()
        const dx = ballPos.x - nextX
        const dz = ballPos.z - nextZ
        const planarDistance = Math.hypot(dx, dz)

        if (planarDistance < 1.4) {
          const inv = planarDistance > 0.0001 ? 1 / planarDistance : 0
          ball.applyImpulse(
            { x: dx * inv * 2.7, y: 1.15, z: dz * inv * 2.7 },
            true,
          )
        } else if (onGroundRef.current) {
          velocityYRef.current = 4.9
          onGroundRef.current = false
        }
      } else if (onGroundRef.current) {
        velocityYRef.current = 4.9
        onGroundRef.current = false
      }
    }

    key.actionQueued = false
    touch.actionQueued = false

    if (!onGroundRef.current) {
      velocityYRef.current -= 12 * delta
    } else {
      velocityYRef.current = 0
    }
    let nextY = onGroundRef.current ? PLAYER_HEIGHT : playerPosRef.current.y + velocityYRef.current * delta

    if (nextY <= PLAYER_HEIGHT) {
      nextY = PLAYER_HEIGHT
      velocityYRef.current = 0
      onGroundRef.current = true
    }

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
        <mesh>
          <capsuleGeometry args={[0.22, 0.42, 6, 10]} />
          <meshStandardMaterial color="#27a2ff" roughness={0.5} metalness={0.08} />
        </mesh>
        <mesh position={[0, 0.22, 0.22]}>
          <sphereGeometry args={[0.06, 16, 16]} />
          <meshStandardMaterial color="#ffffff" />
        </mesh>
        <mesh position={[0.11, 0.22, 0.22]}>
          <sphereGeometry args={[0.06, 16, 16]} />
          <meshStandardMaterial color="#ffffff" />
        </mesh>
      </group>
    </>
  )
}

function ControlsOverlay({ touchRef }) {
  const joystickPointerIdRef = useRef(null)
  const lookPointerIdRef = useRef(null)
  const lookLastRef = useRef({ x: 0, y: 0 })
  const [stickVisual, setStickVisual] = useState({ x: 0, y: 0 })
  const [edgeGlow, setEdgeGlow] = useState({
    left: false,
    right: false,
    top: false,
    bottom: false,
  })

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
    event.currentTarget.setPointerCapture(event.pointerId)
    touchRef.current.lookActive = true
    touchRef.current.lookX = 0
    touchRef.current.lookY = 0
    setEdgeGlow({ left: false, right: false, top: false, bottom: false })
  }

  const onLookMove = (event) => {
    if (lookPointerIdRef.current !== event.pointerId) return

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
    lookPointerIdRef.current = null
    touchRef.current.lookActive = false
    touchRef.current.lookX = 0
    touchRef.current.lookY = 0
    setEdgeGlow({ left: false, right: false, top: false, bottom: false })
    event.currentTarget.releasePointerCapture(event.pointerId)
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

function ScoreOverlay({ score }) {
  return (
    <div className="score-wrap">
      <div className="score">
        <span className="score-label">Score</span>
        <span className="score-value">{score}</span>
      </div>
    </div>
  )
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
  const touchRef = useRef({
    moveX: 0,
    moveY: 0,
    cameraYaw: 0,
    cameraPitch: -0.22,
    lookX: 0,
    lookY: 0,
    lookActive: false,
    actionQueued: false,
  })
  const ballRef = useRef()
  const playerPositionRef = useRef({ x: 0, y: PLAYER_HEIGHT, z: 2.2 })
  const scoreCooldownRef = useRef(false)
  const respawnTimerRef = useRef(null)
  const [score, setScore] = useState(0)
  const [scorePopups, setScorePopups] = useState([])

  useEffect(() => {
    const interval = window.setInterval(() => {
      const now = Date.now()
      setScorePopups((previous) => previous.filter((popup) => now < popup.startAt + popup.duration))
    }, 120)
    return () => clearInterval(interval)
  }, [])

  const handleBallRespawn = () => {
    const ball = ballRef.current
    if (!ball) return

    ball.setTranslation({ x: 0, y: 3.2, z: 0 }, true)
    ball.setLinvel({ x: 0, y: 0, z: 0 }, true)
    ball.setAngvel({ x: 0, y: 0, z: 0 }, true)
    scoreCooldownRef.current = false
  }

  const handleGoal = () => {
    if (scoreCooldownRef.current) return

    scoreCooldownRef.current = true
    setScore((current) => current + GOAL_POINTS)

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

  return (
    <main className="app">
      <Canvas
        dpr={[1, 1.5]}
        camera={{ fov: 52, position: [0, 2.4, 6], near: 0.1, far: 40 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
      >
        <WhiteRoom />
        <Dragon playerPositionRef={playerPositionRef} />
        <GlassContainmentRoom />
        <Physics gravity={[0, -9.81, 0]}>
          <PhysicsBounds />
          <GlassContainmentColliders />
          <Ball ballRef={ballRef} />
          <Goal onBallZoneEnter={handleBallZoneEnter} onBallZoneExit={handleBallZoneExit} ballRef={ballRef} />
          <Player touchRef={touchRef} ballRef={ballRef} playerPositionRef={playerPositionRef} />
          <ScorePopups popups={scorePopups} />
        </Physics>
      </Canvas>

      <ControlsOverlay touchRef={touchRef} />
      <ScoreOverlay score={score} />
    </main>
  )
}

export default App

useGLTF.preload('/ball-skin/base_basic_pbr.glb')
useGLTF.preload('/models/dragon.glb')
