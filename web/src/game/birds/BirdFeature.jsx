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
const WILD_WANDER_RADIUS = 1.8
const WILD_FLIGHT_RADIUS = 4.8
const BIRD_GROUND_SPEED = 0.72
const BIRD_FOLLOW_SPEED = 3.4
const BIRD_CATCHUP_SPEED = 5.2
const ADOPTED_LAND_DELAY = 3.6

function dampAngle(current, target, speed, delta) {
  const difference = Math.atan2(Math.sin(target - current), Math.cos(target - current))
  return current + difference * (1 - Math.exp(-speed * delta))
}

function moveTowards(group, target, speed, delta) {
  const dx = target.x - group.position.x
  const dy = target.y - group.position.y
  const dz = target.z - group.position.z
  const distance = Math.hypot(dx, dy, dz)
  if (distance <= 0.001) return distance
  const step = Math.min(speed * delta, distance)
  group.position.x += (dx / distance) * step
  group.position.y += (dy / distance) * step
  group.position.z += (dz / distance) * step
  group.rotation.y = dampAngle(group.rotation.y, Math.atan2(dx, dz), 8, delta)
  return distance
}

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
  const originX = origin[0]
  const originZ = origin[2]

  useEffect(() => {
    if (!enabled) return undefined
    const timer = window.setInterval(() => setClock((value) => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [enabled])

  const bushes = useMemo(() => BUSH_OFFSETS.map(([dx, dz], index) => {
    const x = originX + dx
    const z = originZ + dz
    return { id: `seed-bush-${index}`, position: [x, getTerrainHeight(x, z), z] }
  }), [originX, originZ])

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
  onFear,
  onBondGain,
  onAdopt,
}) {
  const groupRef = useRef(null)
  const bodyRef = useRef(null)
  const animationRef = useRef(null)
  const stateRef = useRef('wild_idle')
  const stateUntilRef = useRef(0)
  const naturalActionAtRef = useRef(0)
  const groundTargetRef = useRef(new Vector3())
  const flightPlanRef = useRef(null)
  const peckDropRef = useRef(null)
  const peckHandledRef = useRef(false)
  const stillTimeRef = useRef(0)
  const wasAdoptedRef = useRef(birdProgress.adopted)
  const consumedDropIdsRef = useRef(new Set())
  const [canAdopt, setCanAdopt] = useState(false)
  const [nearBird, setNearBird] = useState(false)
  const [trustFeedback, setTrustFeedback] = useState(null)
  const originX = origin[0]
  const originZ = origin[2]
  const landing = useMemo(() => {
    const x = originX + BIRD_LANDING_OFFSET[0]
    const z = originZ + BIRD_LANDING_OFFSET[1]
    return new Vector3(x, getTerrainHeight(x, z) + 0.03, z)
  }, [originX, originZ])

  useEffect(() => {
    if (!trustFeedback) return undefined
    const timer = window.setTimeout(() => setTrustFeedback(null), 2600)
    return () => window.clearTimeout(timer)
  }, [trustFeedback])

  const showTrustFeedback = useCallback((kind) => {
    setTrustFeedback({ kind, token: Date.now() })
  }, [])

  const beginFlight = useCallback((landX, landZ, reason) => {
    const group = groupRef.current
    if (!group) return
    const landY = getTerrainHeight(landX, landZ) + 0.03
    const dx = landX - group.position.x
    const dz = landZ - group.position.z
    const planarDistance = Math.hypot(dx, dz) || 1
    const directionX = dx / planarDistance
    const directionZ = dz / planarDistance
    const cruiseHeight = Math.max(group.position.y + 1.5, landY + 1.8)
    flightPlanRef.current = {
      phase: 'takeoff',
      reason,
      takeoff: new Vector3(
        group.position.x + directionX * 1.25,
        cruiseHeight,
        group.position.z + directionZ * 1.25,
      ),
      cruise: new Vector3(landX - directionX * 1.1, landY + 1.25, landZ - directionZ * 1.1),
      land: new Vector3(landX, landY, landZ),
    }
    stateRef.current = 'flight'
    peckDropRef.current = null
    peckHandledRef.current = false
  }, [])

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

  const startPecking = useCallback((drop, now) => {
    stateRef.current = 'pecking'
    stateUntilRef.current = now + 1050
    peckDropRef.current = drop
    peckHandledRef.current = false
    animationRef.current?.('Idle')
  }, [])

  useFrame((_, delta) => {
    const group = groupRef.current
    const body = bodyRef.current
    const player = playerPositionRef?.current
    if (!group || !player) return
    group.visible = Boolean(enabled && (!birdProgress.adopted || birdProgress.active))
    if (!group.visible) return

    if (!Number.isFinite(group.position.x)) {
      group.position.copy(landing)
      stateRef.current = birdProgress.adopted ? 'adopted_follow' : 'wild_idle'
    }

    const playerSpeed = Math.hypot(playerVelocityRef?.current?.x ?? 0, playerVelocityRef?.current?.z ?? 0)
    const distanceToPlayer = Math.hypot(player.x - group.position.x, player.z - group.position.z)
    const now = performance.now()
    const isNear = distanceToPlayer < 8
    if (isNear !== nearBird) setNearBird(isNear)

    if (wasAdoptedRef.current !== birdProgress.adopted) {
      wasAdoptedRef.current = birdProgress.adopted
      flightPlanRef.current = null
      stateRef.current = birdProgress.adopted ? 'adopted_follow' : 'wild_idle'
      stillTimeRef.current = 0
    }

    if (body) {
      const pecking = stateRef.current === 'pecking'
      const peckWave = pecking ? Math.max(0, Math.sin((stateUntilRef.current - now) * 0.024)) : 0
      body.rotation.x = MathUtils.damp(body.rotation.x, peckWave * 0.42, 14, delta)
      body.position.y = MathUtils.damp(body.position.y, peckWave * -0.035, 14, delta)
    }

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

    const flightPlan = flightPlanRef.current
    if (stateRef.current === 'flight' && flightPlan) {
      const target = flightPlan[flightPlan.phase]
      const phaseSpeed = flightPlan.phase === 'cruise' ? 3.8 : 2.7
      const distance = moveTowards(group, target, phaseSpeed, delta)
      animationRef.current?.(flightPlan.phase === 'cruise' && distance > 0.55 ? 'Glide' : 'Flap')
      if (distance < 0.12) {
        if (flightPlan.phase === 'takeoff') flightPlan.phase = 'cruise'
        else if (flightPlan.phase === 'cruise') flightPlan.phase = 'land'
        else {
          group.position.copy(flightPlan.land)
          const reason = flightPlan.reason
          flightPlanRef.current = null
          stateRef.current = birdProgress.adopted ? 'adopted_ground_idle' : 'wild_idle'
          naturalActionAtRef.current = now + 2800 + Math.random() * 4200
          if (reason === 'adopted_seed' && targetSeed) startPecking(targetSeed, now)
          animationRef.current?.('Idle')
        }
      }
      return
    }

    if (stateRef.current === 'pecking') {
      const drop = peckDropRef.current
      if (!peckHandledRef.current && now >= stateUntilRef.current - 560) {
        peckHandledRef.current = true
        if (drop && !consumedDropIdsRef.current.has(drop.id)) {
          consumedDropIdsRef.current.add(drop.id)
          onSeedEaten?.(drop.id)
          if (birdProgress.adopted) onBondGain?.()
          else {
            onTrustGain?.()
            showTrustFeedback('gain')
          }
        }
      }
      animationRef.current?.('Idle')
      if (now >= stateUntilRef.current) {
        peckDropRef.current = null
        stateRef.current = birdProgress.adopted ? 'adopted_ground_idle' : 'wild_idle'
        naturalActionAtRef.current = now + 1800 + Math.random() * 2600
      }
      return
    }

    if (birdProgress.adopted) {
      if (canAdopt) setCanAdopt(false)
      stillTimeRef.current = playerSpeed < 0.14 ? stillTimeRef.current + delta : 0

      const groundY = getTerrainHeight(group.position.x, group.position.z) + 0.03
      const grounded = Math.abs(group.position.y - groundY) < 0.18

      if (targetSeed && distanceToPlayer > 0.8) {
        const seedX = targetSeed.from[0]
        const seedZ = targetSeed.from[2]
        if (!grounded) {
          beginFlight(seedX, seedZ, 'adopted_seed')
          return
        }
        groundTargetRef.current.set(seedX, getTerrainHeight(seedX, seedZ) + 0.03, seedZ)
        const distance = moveTowards(group, groundTargetRef.current, BIRD_GROUND_SPEED * 1.45, delta)
        animationRef.current?.('Walk')
        if (distance < 0.3) startPecking(targetSeed, now)
        return
      }

      if (stateRef.current === 'adopted_follow') {
        const velocity = playerVelocityRef?.current ?? { x: 0, z: 0 }
        const speed = Math.hypot(velocity.x, velocity.z)
        const forwardX = speed > 0.1 ? velocity.x / speed : 0
        const forwardZ = speed > 0.1 ? velocity.z / speed : 1
        const orbit = Math.sin(now * 0.00115) * 0.22
        groundTargetRef.current.set(
          player.x - forwardX * 0.7 + forwardZ * (0.62 + orbit),
          player.y + 0.72 + Math.sin(now * 0.003) * 0.06,
          player.z - forwardZ * 0.7 - forwardX * (0.62 + orbit),
        )
        const distance = moveTowards(
          group,
          groundTargetRef.current,
          distanceToPlayer > 5 ? BIRD_CATCHUP_SPEED : BIRD_FOLLOW_SPEED,
          delta,
        )
        // Un oiseau presque immobile en l'air bat des ailes au lieu de glisser.
        animationRef.current?.(distance > 0.75 && playerSpeed > 0.35 ? 'Glide' : 'Flap')
        if (stillTimeRef.current >= ADOPTED_LAND_DELAY) {
          const side = Math.sin(now * 0.001) > 0 ? 1 : -1
          beginFlight(player.x + side * 1.05, player.z + 0.65, 'adopted_land')
        } else if (distanceToPlayer > 20) {
          group.position.copy(groundTargetRef.current)
        }
        return
      }

      if (playerSpeed > 0.32 || distanceToPlayer > 3.2) {
        stateRef.current = 'adopted_follow'
        stillTimeRef.current = 0
        animationRef.current?.('Flap')
        return
      }

      group.position.y = MathUtils.damp(group.position.y, groundY, 10, delta)
      if (stateRef.current === 'adopted_ground_wander') {
        const distance = moveTowards(group, groundTargetRef.current, BIRD_GROUND_SPEED * 0.75, delta)
        animationRef.current?.('Walk')
        if (distance < 0.12 || now >= stateUntilRef.current) {
          stateRef.current = 'adopted_ground_idle'
          naturalActionAtRef.current = now + 2600 + Math.random() * 4200
        }
        return
      }

      animationRef.current?.(Math.random() < 0.002 ? 'Rest_Pose' : 'Idle')
      if (now >= naturalActionAtRef.current) {
        const angle = Math.random() * Math.PI * 2
        const radius = 0.45 + Math.random() * 0.8
        const x = player.x + Math.cos(angle) * radius
        const z = player.z + Math.sin(angle) * radius
        groundTargetRef.current.set(x, getTerrainHeight(x, z) + 0.03, z)
        stateRef.current = 'adopted_ground_wander'
        stateUntilRef.current = now + 2600
      }
      return
    }

    const readyToAdopt = birdProgress.trust >= BIRD_TRUST_MAX && distanceToPlayer < 2.2
    if (readyToAdopt !== canAdopt) setCanAdopt(readyToAdopt)

    const frightened = birdProgress.trust < BIRD_TRUST_MAX
      && (distanceToPlayer < 0.82 || (distanceToPlayer < 3.1 && playerSpeed > 1.65))
    if (frightened) {
      const awayX = group.position.x - player.x
      const awayZ = group.position.z - player.z
      const awayLength = Math.hypot(awayX, awayZ) || 1
      const side = Math.random() < 0.5 ? -1 : 1
      const landX = landing.x + (awayX / awayLength) * 4.4 + side * 1.2
      const landZ = landing.z + (awayZ / awayLength) * 4.4 - side * 1.2
      onFear?.()
      showTrustFeedback('loss')
      beginFlight(landX, landZ, 'fear')
      return
    }

    if (targetSeed && distanceToPlayer > 1.15 && birdProgress.trust < BIRD_TRUST_MAX) {
      groundTargetRef.current.set(
        targetSeed.from[0],
        getTerrainHeight(targetSeed.from[0], targetSeed.from[2]) + 0.03,
        targetSeed.from[2],
      )
      const distance = moveTowards(group, groundTargetRef.current, BIRD_GROUND_SPEED, delta)
      animationRef.current?.('Walk')
      if (distance < 0.3) startPecking(targetSeed, now)
      return
    }

    const groundY = getTerrainHeight(group.position.x, group.position.z) + 0.03
    group.position.y = MathUtils.damp(group.position.y, groundY, 10, delta)

    if (stateRef.current === 'wild_wander') {
      const distance = moveTowards(group, groundTargetRef.current, BIRD_GROUND_SPEED, delta)
      animationRef.current?.('Walk')
      if (distance < 0.12 || now >= stateUntilRef.current) {
        stateRef.current = 'wild_idle'
        naturalActionAtRef.current = now + 1800 + Math.random() * 3600
      }
      return
    }

    animationRef.current?.(Math.random() < 0.0025 ? 'Rest_Pose' : 'Idle')
    if (now >= naturalActionAtRef.current) {
      if (Math.random() < 0.32) {
        const angle = Math.random() * Math.PI * 2
        const radius = 2.4 + Math.random() * (WILD_FLIGHT_RADIUS - 2.4)
        beginFlight(
          landing.x + Math.cos(angle) * radius,
          landing.z + Math.sin(angle) * radius,
          'wild_roam',
        )
      } else {
        const angle = Math.random() * Math.PI * 2
        const radius = 0.45 + Math.random() * WILD_WANDER_RADIUS
        const x = landing.x + Math.cos(angle) * radius
        const z = landing.z + Math.sin(angle) * radius
        groundTargetRef.current.set(x, getTerrainHeight(x, z) + 0.03, z)
        stateRef.current = 'wild_wander'
        stateUntilRef.current = now + 3200
      }
      naturalActionAtRef.current = now + 5000
    }
  })

  const showTrust = !birdProgress.adopted
    && nearBird
    && (birdProgress.trust > 0 || trustFeedback)

  return (
    <group ref={groupRef} position={landing} userData={{ debugCategory: 'npcs' }}>
      <group ref={bodyRef}>
        <Suspense fallback={null}>
          <BirdModel animationRef={animationRef} />
        </Suspense>
      </group>
      {showTrust && (
        <Html center position={[0, 0.68, 0]} distanceFactor={8} occlude={false}>
          <div className={`bird-trust-bubble${trustFeedback ? ` is-${trustFeedback.kind}` : ''}`}>
            <span className="bird-trust-bubble__label">Confiance</span>
            <span className="bird-trust-bubble__hearts" aria-label={`${birdProgress.trust} cœur sur ${BIRD_TRUST_MAX}`}>
              {'♥'.repeat(birdProgress.trust)}{'♡'.repeat(BIRD_TRUST_MAX - birdProgress.trust)}
            </span>
            {trustFeedback?.kind === 'loss' && <small>Effrayé · −1</small>}
            {trustFeedback?.kind === 'gain' && <small>La confiance grandit</small>}
          </div>
        </Html>
      )}
      {canAdopt && !birdProgress.adopted && (
        <Html center position={[0, 0.98, 0]} distanceFactor={7} occlude={false}>
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
