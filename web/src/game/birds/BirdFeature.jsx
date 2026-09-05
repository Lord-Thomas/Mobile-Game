import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Billboard, Html, useAnimations, useGLTF, useTexture } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { Box3, CubicBezierCurve3, LoopRepeat, MathUtils, Mesh, Vector3 } from 'three'
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { getTerrainHeight } from '../../world/terrain/terrainGeometry'
import { BIRD_TRUST_MAX } from './birdProgress'
import { createBirdBushSites } from './birdHabitat'
import { nearestBirdFood, nearestFeedingBird } from './birdFeeding'
import { getBirdApproachLimits } from '../crouch'

export const BIRD_MODEL_URL = '/models/birds/bird-01.glb'
export const BIRD_BUSH_TEXTURE_URL = '/textures/birds/seed-bush-proxy.png'
export const BIRD_SEED_ITEM_ID = 'bird_seed'
export const WILD_BERRY_ITEM_ID = 'wild_berry'

const BUSH_RESPAWN_MS = 30_000
const BIRD_TARGET_HEIGHT = 0.22
const AMBIENT_PROGRESS = { adopted: false, active: false, trust: 0 }
const NO_SEEDS = []
const FLOCK_ORIGINS = [[-14, 0, 8], [17, 0, -13], [-24, 0, -20], [26, 0, 29], [-30, 0, 32], [55, 0, -45], [-65, 0, 55], [85, 0, 70], [-90, 0, -75]]
const BIRD_LANDING_OFFSET = [1.1, 3.1]
const WILD_WANDER_RADIUS = 1.8
const WILD_FLIGHT_RADIUS = 12
const BIRD_GROUND_SPEED = 0.72
const BIRD_FOLLOW_SPEED = 3.4
const BIRD_CATCHUP_SPEED = 5.2
const ADOPTED_LAND_DELAY = 18

function wildGroundPause(trust, random = Math.random) {
  // Some brief stops, some real feeding opportunities; fed birds linger longer.
  return trust > 0 || random() < 0.45
    ? 16000 + random() * 14000
    : 5000 + random() * 4000
}

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

function HarvestableBushes({ enabled, playerPositionRef, onHarvest }) {
  const [harvestedAt, setHarvestedAt] = useState({})
  const [nearBushId, setNearBushId] = useState(null)
  const firstHarvestRef = useRef(true)
  const [, setClock] = useState(0)

  useEffect(() => {
    if (!enabled) return undefined
    const timer = window.setInterval(() => setClock((value) => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [enabled])

  const bushes = useMemo(() => createBirdBushSites().map((site) => ({
    ...site, position: [site.x, getTerrainHeight(site.x, site.z), site.z],
  })), [])

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
      <group key={bush.id} position={bush.position} scale={bush.scale} userData={{ debugCategory: 'vegetation' }}>
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
  ambient = false,
  birdId = 'primary',
  positionsRef,
  origin,
  playerPositionRef,
  playerVelocityRef,
  playerCrouchingRef,
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
    const cruiseHeight = Math.max(group.position.y + 2, landY + 9 + Math.random() * 5)
    const radius = 12 + Math.random() * 9
    const angle = Math.atan2(-directionZ, directionX)
    const center = new Vector3(landX, cruiseHeight, landZ)
    const entry = new Vector3(center.x + Math.cos(angle) * radius, cruiseHeight, center.z + Math.sin(angle) * radius * 0.7)
    const tangent = new Vector3(-Math.sin(angle), 0, Math.cos(angle) * 0.7).normalize()
    const start = group.position.clone()
    const curve = new CubicBezierCurve3(start,
      start.clone().add(new Vector3(directionX * 4, 3, directionZ * 4)),
      entry.clone().addScaledVector(tangent, -5), entry)
    flightPlanRef.current = {
      phase: 'takeoff',
      reason,
      elapsed: 0,
      duration: curve.getLength() / 4.2,
      curve,
      center,
      radius,
      angle,
      cruiseTime: 0,
      cruiseDuration: 28 + Math.random() * 24,
      point: new Vector3(),
      tangent: new Vector3(),
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
    const canDetectFood = group.visible && stateRef.current !== 'flight'
      && stateRef.current !== 'adopted_follow'
      && Math.abs(group.position.y - getTerrainHeight(group.position.x, group.position.z)) < 0.18
    positionsRef.current.set(birdId, { position: group.position, grounded: canDetectFood })
    if (!group.visible) return

    if (!Number.isFinite(group.position.x)) {
      group.position.copy(landing)
      stateRef.current = birdProgress.adopted ? 'adopted_follow' : 'wild_idle'
    }

    const playerSpeed = Math.hypot(playerVelocityRef?.current?.x ?? 0, playerVelocityRef?.current?.z ?? 0)
    const distanceToPlayer = Math.hypot(player.x - group.position.x, player.z - group.position.z)
    const approachLimits = getBirdApproachLimits(playerCrouchingRef?.current === true)
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
      if (stateRef.current !== 'flight') {
        body.rotation.x = MathUtils.damp(body.rotation.x, peckWave * 0.42, 14, delta)
        body.rotation.z = MathUtils.damp(body.rotation.z, 0, 5, delta)
      }
      body.position.y = MathUtils.damp(body.position.y, peckWave * -0.035, 14, delta)
    }

    const targetSeed = nearestBirdFood(seedDrops, group.position, consumedDropIdsRef.current, canDetectFood)

    const flightPlan = flightPlanRef.current
    if (stateRef.current === 'flight' && flightPlan) {
      const dt = Math.min(delta, 0.05)
      const previousYaw = group.rotation.y
      if (flightPlan.phase === 'cruise') {
        flightPlan.cruiseTime += dt
        const speed = 4.5 + Math.sin(flightPlan.cruiseTime * 0.6) * 0.35
        const a = flightPlan.angle
        const arcSpeed = flightPlan.radius * Math.hypot(Math.sin(a), Math.cos(a) * 0.7)
        flightPlan.angle += speed * dt / arcSpeed
        const angle = flightPlan.angle
        flightPlan.point.set(
          flightPlan.center.x + Math.cos(angle) * flightPlan.radius,
          flightPlan.center.y + Math.sin(flightPlan.cruiseTime * 0.45) * 0.65,
          flightPlan.center.z + Math.sin(angle) * flightPlan.radius * 0.7,
        )
        flightPlan.tangent.copy(flightPlan.point).sub(group.position).normalize()
      } else {
        flightPlan.elapsed += dt
        const t = Math.min(1, flightPlan.elapsed / flightPlan.duration)
        flightPlan.curve.getPointAt(t, flightPlan.point)
        flightPlan.curve.getTangentAt(t, flightPlan.tangent)
      }
      group.position.copy(flightPlan.point)
      const tangent = flightPlan.tangent
      group.rotation.y = dampAngle(previousYaw, Math.atan2(tangent.x, tangent.z), 6, dt)
      if (body) {
        const turn = Math.atan2(Math.sin(group.rotation.y - previousYaw), Math.cos(group.rotation.y - previousYaw)) / Math.max(dt, 0.001)
        body.rotation.z = MathUtils.damp(body.rotation.z, MathUtils.clamp(-turn * 0.7, -0.5, 0.5), 4, dt)
        body.rotation.x = MathUtils.damp(body.rotation.x, -Math.asin(MathUtils.clamp(tangent.y, -0.6, 0.6)), 4, dt)
      }
      animationRef.current?.(flightPlan.phase === 'cruise' && flightPlan.cruiseTime % 6 > 1.6 ? 'Glide' : 'Flap')
      const segmentDone = flightPlan.phase === 'cruise'
        ? birdProgress.adopted || flightPlan.cruiseTime >= flightPlan.cruiseDuration
        : flightPlan.elapsed >= flightPlan.duration
      if (segmentDone) {
        if (flightPlan.phase === 'takeoff') flightPlan.phase = 'cruise'
        else if (flightPlan.phase === 'cruise') {
            flightPlan.phase = 'land'
            const end = flightPlan.land
            const approach = end.clone().sub(group.position).setY(0).normalize()
            flightPlan.curve = new CubicBezierCurve3(group.position.clone(),
              group.position.clone().addScaledVector(tangent, 6),
              end.clone().addScaledVector(approach, -4).add(new Vector3(0, 1.5, 0)), end.clone())
            flightPlan.elapsed = 0
            flightPlan.duration = Math.max(2, flightPlan.curve.getLength() / 3.6)
        }
        else {
          group.position.copy(flightPlan.land)
          flightPlanRef.current = null
          stateRef.current = birdProgress.adopted ? 'adopted_ground_idle' : 'wild_idle'
          naturalActionAtRef.current = now + (birdProgress.adopted ? 3000 : wildGroundPause(birdProgress.trust))
          animationRef.current?.('Idle')
        }
      }
      return
    }

    if (stateRef.current === 'pecking') {
      const drop = peckDropRef.current
      if (!peckHandledRef.current && now >= stateUntilRef.current - 560) {
        peckHandledRef.current = true
        if (drop && seedDrops.some((candidate) => candidate.id === drop.id) && !consumedDropIdsRef.current.has(drop.id)) {
          consumedDropIdsRef.current.add(drop.id)
          onSeedEaten?.(drop.id)
          if (birdProgress.adopted) onBondGain?.()
          else {
            onTrustGain?.(birdId)
            showTrustFeedback('gain')
          }
        }
      }
      animationRef.current?.('Idle')
      if (now >= stateUntilRef.current) {
        peckDropRef.current = null
        stateRef.current = birdProgress.adopted ? 'adopted_ground_idle' : 'wild_idle'
        naturalActionAtRef.current = now + (birdProgress.adopted ? 4000 : 20000 + Math.random() * 10000)
      }
      return
    }

    if (birdProgress.adopted) {
      if (canAdopt) setCanAdopt(false)
      stillTimeRef.current = playerSpeed < 0.14 ? stillTimeRef.current + delta : 0

      const groundY = getTerrainHeight(group.position.x, group.position.z) + 0.03

      if (targetSeed && distanceToPlayer > 0.8) {
        const seedX = targetSeed.from[0]
        const seedZ = targetSeed.from[2]
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

      if (playerSpeed > 0.32 || distanceToPlayer > 3.2 || now >= naturalActionAtRef.current) {
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

    const readyToAdopt = !ambient && birdProgress.trust >= BIRD_TRUST_MAX && distanceToPlayer < 2.2
    if (readyToAdopt !== canAdopt) setCanAdopt(readyToAdopt)

    const frightened = birdProgress.trust < BIRD_TRUST_MAX
      && (distanceToPlayer < approachLimits.fearDistance || (distanceToPlayer < approachLimits.runningDistance && playerSpeed > approachLimits.runningSpeed))
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

    if (targetSeed && distanceToPlayer > approachLimits.feedingDistance) {
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
        naturalActionAtRef.current = now + wildGroundPause(birdProgress.trust)
      }
      return
    }

    animationRef.current?.(Math.random() < 0.0025 ? 'Rest_Pose' : 'Idle')
    if (now >= naturalActionAtRef.current) {
      if (Math.random() < 0.9) {
        const angle = Math.random() * Math.PI * 2
        const radius = 6 + Math.random() * (WILD_FLIGHT_RADIUS - 6)
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

  const showTrust = !ambient && !birdProgress.adopted
    && nearBird
    && (birdProgress.trust > 0 || trustFeedback)

  return (
    <group ref={groupRef} position={landing} userData={{ debugCategory: 'npcs' }}>
      <group ref={bodyRef}>
        <Suspense fallback={null}>
          <BirdModel animationRef={animationRef} />
        </Suspense>
      </group>
      {!ambient && !birdProgress.adopted && birdProgress.hasBeenFed && (
        <Billboard position={[0, 0.52, 0]}>
          <mesh rotation={[0, 0, Math.PI / 4]}>
            <planeGeometry args={[0.19, 0.19]} />
            <meshBasicMaterial color="#ffd879" depthTest depthWrite toneMapped={false} />
          </mesh>
          <mesh position={[0, 0, 0.005]} rotation={[0, 0, Math.PI / 4]}>
            <planeGeometry args={[0.1, 0.1]} />
            <meshBasicMaterial color="#8b5622" depthTest depthWrite toneMapped={false} />
          </mesh>
        </Billboard>
      )}
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
  const positionsRef = useRef(new Map())
  const [feedingBirdId, setFeedingBirdId] = useState(null)
  const savedBirdId = props.birdProgress.birdId ?? 'primary'
  const tracked = props.birdProgress.hasBeenFed || props.birdProgress.adopted
  const activeBirdId = tracked ? savedBirdId : feedingBirdId ?? 'primary'
  useFrame(() => {
    if (!enabled || tracked) return
    // Keep the same recipient while food is present, so two birds cannot eat it.
    const recipient = positionsRef.current.get(feedingBirdId)
    if (recipient && nearestBirdFood(props.seedDrops, recipient.position, new Set(), recipient.grounded)) return
    const next = nearestFeedingBird(positionsRef.current, props.seedDrops)
    if (next !== feedingBirdId) setFeedingBirdId(next)
  })
  const actorProps = (id) => ({
    ...props,
    birdId: id,
    ambient: id !== activeBirdId,
    birdProgress: id === activeBirdId ? props.birdProgress : AMBIENT_PROGRESS,
    seedDrops: id === activeBirdId ? props.seedDrops : NO_SEEDS,
    onFear: id === activeBirdId ? props.onFear : undefined,
  })
  return (
    <group visible={enabled}>
      <HarvestableBushes
        enabled={enabled}
        origin={origin}
        playerPositionRef={playerPositionRef}
        onHarvest={onHarvest}
      />
      <BirdActor {...actorProps('primary')} positionsRef={positionsRef} />
      {FLOCK_ORIGINS.map((birdOrigin, index) => (
        <BirdActor key={index} {...actorProps(`flock-${index}`)} positionsRef={positionsRef} origin={birdOrigin} />
      ))}
    </group>
  )
}

useGLTF.preload(BIRD_MODEL_URL)
useTexture.preload(BIRD_BUSH_TEXTURE_URL)
