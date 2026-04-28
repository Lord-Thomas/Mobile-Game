import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment } from '@react-three/drei'
import { BallCollider, CapsuleCollider, CuboidCollider, Physics, RigidBody } from '@react-three/rapier'
import { BackSide, MathUtils } from 'three'
import { useEffect, useRef, useState } from 'react'

const ROOM_LIMIT = 4.6
const PLAYER_HEIGHT = 0.6
const CAMERA_DISTANCE = 4.6
const CAMERA_HEIGHT = 1.55
const EDGE_TRIGGER_PX = 14
const CAMERA_DRAG_SENSITIVITY = 0.007

function dampAngle(current, target, damping, delta) {
  let diff = (target - current + Math.PI) % (Math.PI * 2)
  if (diff < 0) diff += Math.PI * 2
  diff -= Math.PI
  return current + diff * Math.min(1, damping * delta)
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
      if (key === 'd' || key === 'arrowright' || key === 'd') keysRef.current.right = false
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
  return (
    <>
      <color attach="background" args={['#eef3f8']} />
      <fog attach="fog" args={['#eef3f8', 10, 24]} />

      <ambientLight intensity={0.5} />
      <hemisphereLight args={['#f7fbff', '#d8dee9', 0.7]} />
      <directionalLight position={[4, 7, 5]} intensity={1.15} color="#ffffff" />

      <mesh position={[0, 2.5, 0]}>
        <boxGeometry args={[12, 5, 12]} />
        <meshStandardMaterial color="#f8fafc" side={BackSide} />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[10, 10]} />
        <meshStandardMaterial color="#e6ebf1" />
      </mesh>

      <gridHelper args={[10, 20, '#c3ccd6', '#d8e0e8']} position={[0, 0.01, 0]} />

      <mesh position={[0, 2.48, -4.9]}>
        <boxGeometry args={[7, 0.08, 0.08]} />
        <meshStandardMaterial color="#dce3eb" emissive="#dce3eb" emissiveIntensity={0.25} />
      </mesh>

      <Environment preset="studio" />
    </>
  )
}

function PhysicsBounds() {
  return (
    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider args={[5, 0.2, 5]} position={[0, -0.2, 0]} />
      <CuboidCollider args={[0.2, 2.4, 5]} position={[-5, 2.2, 0]} />
      <CuboidCollider args={[0.2, 2.4, 5]} position={[5, 2.2, 0]} />
      <CuboidCollider args={[5, 2.4, 0.2]} position={[0, 2.2, -5]} />
      <CuboidCollider args={[5, 2.4, 0.2]} position={[0, 2.2, 5]} />
    </RigidBody>
  )
}

function Ball({ ballRef }) {
  return (
    <RigidBody
      ref={ballRef}
      colliders={false}
      position={[0.8, 0.34, -0.8]}
      restitution={0.82}
      friction={0.55}
      linearDamping={0.35}
      angularDamping={0.4}
      mass={1}
    >
      <BallCollider args={[0.32]} />
      <mesh castShadow>
        <sphereGeometry args={[0.32, 26, 26]} />
        <meshStandardMaterial color="#ffffff" roughness={0.42} metalness={0.04} />
      </mesh>
    </RigidBody>
  )
}

function Player({ touchRef, ballRef }) {
  const playerBodyRef = useRef()
  const visualRef = useRef()
  const velocityYRef = useRef(0)
  const onGroundRef = useRef(true)
  const keyboardRef = useKeyboardInput()
  const { camera } = useThree()

  useFrame((_, delta) => {
    if (!playerBodyRef.current || !visualRef.current) return

    const key = keyboardRef.current
    const touch = touchRef.current

    const cameraYawSpeed = 2.9
    const cameraPitchSpeed = 2.1
    touch.cameraYaw -= touch.lookX * cameraYawSpeed * delta
    touch.cameraPitch = MathUtils.clamp(
      touch.cameraPitch + touch.lookY * cameraPitchSpeed * delta,
      -0.8,
      0.35,
    )

    const keyboardAxisX = (key.right ? 1 : 0) - (key.left ? 1 : 0)
    const keyboardAxisY = (key.forward ? 1 : 0) - (key.back ? 1 : 0)

    const moveX = MathUtils.clamp(touch.moveX + keyboardAxisX, -1, 1)
    const moveY = MathUtils.clamp(touch.moveY + keyboardAxisY, -1, 1)

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
    const translation = playerBodyRef.current.translation()

    let nextX = translation.x + worldX * speed * delta
    let nextZ = translation.z + worldZ * speed * delta

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

    velocityYRef.current -= 12 * delta
    let nextY = translation.y + velocityYRef.current * delta

    if (nextY <= PLAYER_HEIGHT) {
      nextY = PLAYER_HEIGHT
      velocityYRef.current = 0
      onGroundRef.current = true
    }

    playerBodyRef.current.setNextKinematicTranslation({ x: nextX, y: nextY, z: nextZ })

    const pitch = touch.cameraPitch
    const horizontalDistance = CAMERA_DISTANCE * Math.cos(pitch)
    const targetX = nextX + Math.sin(yaw) * horizontalDistance
    const targetY = nextY + CAMERA_HEIGHT + Math.sin(pitch) * CAMERA_DISTANCE
    const targetZ = nextZ + Math.cos(yaw) * horizontalDistance

    camera.position.x += (targetX - camera.position.x) * 0.13
    camera.position.y += (targetY - camera.position.y) * 0.13
    camera.position.z += (targetZ - camera.position.z) * 0.13
    camera.lookAt(nextX, nextY + 0.55, nextZ)
  })

  return (
    <RigidBody ref={playerBodyRef} type="kinematicPosition" colliders={false} position={[0, PLAYER_HEIGHT, 2.2]}>
      <CapsuleCollider args={[0.2, 0.22]} />
      <group ref={visualRef}>
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
    </RigidBody>
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
        <span className="action-symbol">?</span>
      </button>
    </div>
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
    actionQueued: false,
  })
  const ballRef = useRef()

  return (
    <main className="app">
      <Canvas
        dpr={[1, 1.5]}
        camera={{ fov: 52, position: [0, 2.4, 6], near: 0.1, far: 40 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
      >
        <WhiteRoom />
        <Physics gravity={[0, -9.81, 0]}>
          <PhysicsBounds />
          <Ball ballRef={ballRef} />
          <Player touchRef={touchRef} ballRef={ballRef} />
        </Physics>
      </Canvas>

      <ControlsOverlay touchRef={touchRef} />
    </main>
  )
}

export default App