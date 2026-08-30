import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Html, useAnimations, useGLTF, useTexture } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { Box3, LoopRepeat, MathUtils, Mesh, Vector3 } from 'three'
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { getTerrainHeight } from '../../world/terrain/terrainGeometry'
import { BIRD_TRUST_MAX } from './birdProgress'

export const BIRD_MODEL_URL = '/models/birds/bird-01.glb'
export const BIRD_BUSH_TEXTURE_URL = '/textures/birds/seed-bush-proxy.png'
export const BIRD_SEED_ITEM_ID = 'bird_seed'
export const WILD_BERRY_ITEM_ID = 'wild_berry'

const BUSH_RESPAWN_MS = 30_000
const BIRD_TARGET_HEIGHT = 0.42
const BUSH_OFFSETS = [
  [-3.8, 3.5],
  [2.7, 5.2],
  [5.4, 0.6],
]
const BIRD_LANDING_OFFSET = [1.1, 3.1]

function isTextInputEvent(event) {
  const target = event.target
  return target instanceof HTMLElement
    && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
}

function BushVisual({ ripe }) {
  const texture = useTexture(BIRD_BUSH_TEXTURE_URL)
  return (
    <group scale={ripe ? 1 : 0.78}>
      <sprite position={[0, 0.82, 0]} scale={[2.15, 1.75, 1]}>
        <spriteMaterial
          map={texture}
          transparent
          alphaTest={0.12}
          depthWrite={false}
          opacity={ripe ? 1 : 0.42}
        />
      </sprite>
      {ripe && (
        <>
          <mesh position={[-0.48, 0.7, 0.08]}><sphereGeometry args={[0.055, 8, 8]} /><meshStandardMaterial color="#263e9d" /></mesh>
          <mesh position={[0.18, 0.95, 0.1]}><sphereGeometry args={[0.05, 8, 8]} /><meshStandardMaterial color="#334fb4" /></mesh>
          <mesh position={[0.48, 0.55, 0.08]}><sphereGeometry args={[0.06, 8, 8]} /><meshStandardMaterial color="#263e9d" /></mesh>
        </>
      )}
    </group>
  )
}

function HarvestableBushes({ enabled, origin, playerPositionRef, onHarvest }) {
  const [harvestedAt, setHarvestedAt] = useState({})
  const [nearBushId, setNearBushId] = useState(null)
  const firstHarvestRef = useRef(true)
  const [, setClock] = useState(0)

  useEffect(() => {
    if (!enabled) return undefined
    const timer = window.setInterval(() => setClock((value) => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [enabled])

  const bushes = useMemo(() => BUSH_OFFSETS.map(([dx, dz], index) => {
    const x = origin[0] + dx
    const z = origin[2] + dz
    return { id: `seed-bush-${index}`, position: [x, getTerrainHeight(x, z), z] }
  }), [origin])

  const isRipe = useCallback((bushId) => {
    const harvested = harvestedAt[bushId]
    return !harvested || Date.now() - harvested >= BUSH_RESPAWN_MS
  }, [harvestedAt])

  useFrame(() => {
    if (!enabled || !playerPositionRef?.current) {
      if (nearBushId !== null) setNearBushId(null)
      return
    }
    const player = playerPositionRef.current
    let nearest = null
    let nearestDistance = 1.65
    for (const bush of bushes) {
      if (!isRipe(bush.id)) continue
      const distance = Math.hypot(player.x - bush.position[0], player.z - bush.position[2])
      if (distance < nearestDistance) {
        nearest = bush.id
        nearestDistance = distance
      }
    }
    if (nearest !== nearBushId) setNearBushId(nearest)
  })

  const harvest = useCallback((bushId) => {
    const bush = bushes.find((candidate) => candidate.id === bushId)
    if (!enabled || !bush || !isRipe(bushId)) return
    const seedFound = firstHarvestRef.current || Math.random() < 0.4
    firstHarvestRef.current = false
    const itemIds = [WILD_BERRY_ITEM_ID, ...(seedFound ? [BIRD_SEED_ITEM_ID] : [])]
    setHarvestedAt((current) => ({ ...current, [bushId]: Date.now() }))
    setNearBushId(null)
    onHarvest?.(itemIds, bush.position)
  }, [bushes, enabled, isRipe, onHarvest])

  useEffect(() => {
    if (!nearBushId) return undefined
    const onKeyDown = (event) => {
      if (event.repeat || isTextInputEvent(event) || event.key.toLowerCase() !== 'e') return
      event.preventDefault()
      harvest(nearBushId)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [harvest, nearBushId])

  return bushes.map((bush) => {
    const ripe = isRipe(bush.id)
    const near = nearBushId === bush.id
    return (
      <group key={bush.id} position={bush.position} userData={{ debugCategory: 'vegetation' }}>
        <BushVisual ripe={ripe} />
        {near && (
          <Html center position={[0, 1.65, 0]} distanceFactor={8} occlude={false}>
            <button className="bird-world-action" type="button" onClick={() => harvest(bush.id)}>
              Récolter <kbd>E</kbd>
            </button>
          </Html>
        )}
      </group>
    )
  })
}

function BirdModel({ animationRef }) {
  const { scene, animations } = useGLTF(BIRD_MODEL_URL)
  const bird = useMemo(() => {
    const object = clone(scene)
    object.traverse((child) => {
      if (!(child instanceof Mesh)) return
      child.castShadow = true
      child.receiveShadow = false
    })
    const bounds = new Box3().setFromObject(object)
    const size = bounds.getSize(new Vector3())
    const center = bounds.getCenter(new Vector3())
    const scale = BIRD_TARGET_HEIGHT / Math.max(size.y, 0.001)
    return { object, scale, offset: [-center.x, -bounds.min.y, -center.z] }
  }, [scene])
  const { actions } = useAnimations(animations, bird.object)
  const currentActionRef = useRef(null)
  const currentNameRef = useRef('')

  useEffect(() => {
    const play = (name) => {
      if (currentNameRef.current === name) return
      const next = actions[name] ?? actions.Idle
      if (!next) return
      currentActionRef.current?.fadeOut(0.2)
      next.reset().setLoop(LoopRepeat, Infinity).fadeIn(0.2).play()
      currentActionRef.current = next
      currentNameRef.current = name
    }
    animationRef.current = play
    play('Idle')
    return () => {
      animationRef.current = null
      Object.values(actions).forEach((action) => action?.stop())
    }
  }, [actions, animationRef])

  return (
    <group scale={bird.scale}>
      <primitive object={bird.object} position={bird.offset} />
    </group>
  )
}

function BirdActor({
  enabled,
  origin,
  playerPositionRef,
  playerVelocityRef,
  seedDrops,
  birdProgress,
  onSeedEaten,
  onTrustGain,
  onBondGain,
  onAdopt,
}) {
  const groupRef = useRef(null)
  const animationRef = useRef(null)
  const stateRef = useRef('idle')
  const flightUntilRef = useRef(0)
  const peckUntilRef = useRef(0)
  const consumedDropIdsRef = useRef(new Set())
  const [canAdopt, setCanAdopt] = useState(false)
  const landing = useMemo(() => {
    const x = origin[0] + BIRD_LANDING_OFFSET[0]
    const z = origin[2] + BIRD_LANDING_OFFSET[1]
    return new Vector3(x, getTerrainHeight(x, z) + 0.03, z)
  }, [origin])

  const adopt = useCallback(() => {
    if (!canAdopt || birdProgress.adopted) return
    onAdopt?.()
  }, [birdProgress.adopted, canAdopt, onAdopt])

  useEffect(() => {
    if (!canAdopt) return undefined
    const onKeyDown = (event) => {
      if (event.repeat || isTextInputEvent(event) || event.key.toLowerCase() !== 'e') return
      event.preventDefault()
      adopt()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [adopt, canAdopt])

  useFrame((_, delta) => {
    const group = groupRef.current
    const player = playerPositionRef?.current
    if (!group || !player) return
    group.visible = Boolean(enabled && (!birdProgress.adopted || birdProgress.active))
    if (!group.visible) return

    if (!Number.isFinite(group.position.x) || stateRef.current === 'uninitialized') {
      group.position.copy(landing)
      stateRef.current = 'idle'
    }

    const playerSpeed = Math.hypot(playerVelocityRef?.current?.x ?? 0, playerVelocityRef?.current?.z ?? 0)
    const distanceToPlayer = Math.hypot(player.x - group.position.x, player.z - group.position.z)
    const now = performance.now()
    const availableSeeds = seedDrops.filter((drop) => !consumedDropIdsRef.current.has(drop.id))
    let targetSeed = null
    let seedDistance = Infinity
    for (const drop of availableSeeds) {
      const distance = Math.hypot(drop.from[0] - group.position.x, drop.from[2] - group.position.z)
      if (distance < seedDistance && distance < 5.5) {
        targetSeed = drop
        seedDistance = distance
      }
    }

    if (birdProgress.adopted) {
      setCanAdopt(false)
      if (targetSeed && distanceToPlayer > 0.9) {
        const targetY = getTerrainHeight(targetSeed.from[0], targetSeed.from[2]) + 0.03
        const dx = targetSeed.from[0] - group.position.x
        const dz = targetSeed.from[2] - group.position.z
        const distance = Math.hypot(dx, dz)
        if (distance < 0.35) {
          if (now >= peckUntilRef.current) {
            consumedDropIdsRef.current.add(targetSeed.id)
            peckUntilRef.current = now + 900
            onSeedEaten?.(targetSeed.id)
            onBondGain?.()
          }
          animationRef.current?.('Idle')
        } else {
          const step = Math.min(delta * 1.25, distance)
          group.position.x += (dx / distance) * step
          group.position.z += (dz / distance) * step
          group.position.y = MathUtils.damp(group.position.y, targetY, 8, delta)
          group.rotation.y = Math.atan2(dx, dz)
          animationRef.current?.('Walk')
        }
        return
      }

      const velocity = playerVelocityRef?.current ?? { x: 0, z: 0 }
      const speed = Math.hypot(velocity.x, velocity.z)
      const forwardX = speed > 0.1 ? velocity.x / speed : 0
      const forwardZ = speed > 0.1 ? velocity.z / speed : 1
      const targetX = player.x - forwardX * 0.65 + forwardZ * 0.55
      const targetZ = player.z - forwardZ * 0.65 - forwardX * 0.55
      const targetY = player.y + (speed > 0.25 ? 0.75 : 0.48)
      const dx = targetX - group.position.x
      const dy = targetY - group.position.y
      const dz = targetZ - group.position.z
      const distance = Math.hypot(dx, dy, dz)
      if (distance > 7) {
        group.position.set(targetX, targetY, targetZ)
      } else if (distance > 0.08) {
        const step = Math.min(delta * (distance > 2 ? 4.2 : 2.1), distance)
        group.position.x += (dx / distance) * step
        group.position.y += (dy / distance) * step
        group.position.z += (dz / distance) * step
        group.rotation.y = Math.atan2(dx, dz)
      }
      animationRef.current?.(distance > 0.35 ? 'Flap' : 'Glide')
      return
    }

    const readyToAdopt = birdProgress.trust >= BIRD_TRUST_MAX && distanceToPlayer < 2.2
    if (readyToAdopt !== canAdopt) setCanAdopt(readyToAdopt)

    if (stateRef.current === 'flying') {
      const awayX = landing.x + 3.2
      const awayZ = landing.z + 2.4
      const returning = now >= flightUntilRef.current
      const targetX = returning ? landing.x : awayX
      const targetZ = returning ? landing.z : awayZ
      const targetY = returning ? landing.y : landing.y + 3
      const dx = targetX - group.position.x
      const dy = targetY - group.position.y
      const dz = targetZ - group.position.z
      const distance = Math.hypot(dx, dy, dz)
      const step = Math.min(delta * 3.1, distance)
      if (distance > 0.01) {
        group.position.x += (dx / distance) * step
        group.position.y += (dy / distance) * step
        group.position.z += (dz / distance) * step
        group.rotation.y = Math.atan2(dx, dz)
      }
      animationRef.current?.('Flap')
      if (returning && distance < 0.08) {
        group.position.copy(landing)
        stateRef.current = 'idle'
        animationRef.current?.('Idle')
      }
      return
    }

    if ((distanceToPlayer < 0.85 || (distanceToPlayer < 3 && playerSpeed > 1.8)) && birdProgress.trust < BIRD_TRUST_MAX) {
      stateRef.current = 'flying'
      flightUntilRef.current = now + 5500
      animationRef.current?.('Flap')
      return
    }

    if (targetSeed && distanceToPlayer > 1.15 && birdProgress.trust < BIRD_TRUST_MAX) {
      const dx = targetSeed.from[0] - group.position.x
      const dz = targetSeed.from[2] - group.position.z
      const distance = Math.hypot(dx, dz)
      if (distance < 0.34) {
        if (now >= peckUntilRef.current) {
          consumedDropIdsRef.current.add(targetSeed.id)
          peckUntilRef.current = now + 950
          onSeedEaten?.(targetSeed.id)
          onTrustGain?.()
        }
        animationRef.current?.('Idle')
      } else {
        const step = Math.min(delta * 0.72, distance)
        group.position.x += (dx / distance) * step
        group.position.z += (dz / distance) * step
        group.position.y = getTerrainHeight(group.position.x, group.position.z) + 0.03
        group.rotation.y = Math.atan2(dx, dz)
        animationRef.current?.('Walk')
      }
      return
    }

    group.position.y = MathUtils.damp(group.position.y, landing.y, 5, delta)
    animationRef.current?.('Idle')
  })

  return (
    <group ref={groupRef} position={landing} userData={{ debugCategory: 'npcs' }}>
      <Suspense fallback={null}>
        <BirdModel animationRef={animationRef} />
      </Suspense>
      {canAdopt && !birdProgress.adopted && (
        <Html center position={[0, 0.75, 0]} distanceFactor={7} occlude={false}>
          <button className="bird-world-action bird-world-action--adopt" type="button" onClick={adopt}>
            Adopter <kbd>E</kbd>
          </button>
        </Html>
      )}
    </group>
  )
}

export default function BirdFeature(props) {
  const { enabled, origin, playerPositionRef, onHarvest } = props
  return (
    <group visible={enabled}>
      <HarvestableBushes
        enabled={enabled}
        origin={origin}
        playerPositionRef={playerPositionRef}
        onHarvest={onHarvest}
      />
      <BirdActor {...props} />
    </group>
  )
}

useGLTF.preload(BIRD_MODEL_URL)
useTexture.preload(BIRD_BUSH_TEXTURE_URL)
