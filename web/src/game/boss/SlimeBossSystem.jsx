import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { getTerrainHeight } from '../../world/terrain/terrainGeometry'
import { getOutdoorWalkableHeight } from '../../world/mapObjectCollision'
import { getOutdoorHouseRoofHeight } from '../../world/outdoorRoofCollision'
import { useBossStore } from './bossStore'
import { SLIME_BOSS } from './bossConfig'
import { getBossJumpOffset, getShockwaveRadius } from './bossSimulation'
import { isGroundWaveContact } from './bossGroundContact'
import { getMeleeHitDamage } from '../meleeWeapons'
import { ATTACK_TYPE } from '../damageTypes'
import { PLAYER_CAPSULE_HALF_HEIGHT, PLAYER_CAPSULE_RADIUS } from '../constants'
import ParticleEffect from '../../effects/ParticleEffect'
import { useStoredParticlePreset } from '../../effects/storedParticlePresets'
import { completeLoadTask, resetLoadTask } from '../../lib/loadTaskRegistry'
import SlimeProceduralModel from '../../enemies/SlimeProceduralModel'

export const SLIME_BOSS_PREPARE_TASK = 'slime-boss:prepare'
resetLoadTask(SLIME_BOSS_PREPARE_TASK)

const PREPARED_MINION_KINDS = ['green', 'blue', 'green', 'green', 'blue', 'green', 'blue', 'green']
const BOSS_PROJECTILE_POOL_SIZE = 12
const PLAYER_CENTER_TO_FOOT = PLAYER_CAPSULE_HALF_HEIGHT + PLAYER_CAPSULE_RADIUS
const SURFACE_VISUAL_SEARCH_HEIGHT = 2.4
const PROJECTILE_IMPACT_FLASH_MS = 520
const WORLD_UNITS_PER_METER = 2.25 / 1.63

function getBossGroundSurface(x, z, referenceFootY) {
  const terrainY = getTerrainHeight(x, z)
  const referenceY = Number.isFinite(referenceFootY)
    ? referenceFootY
    : terrainY + SURFACE_VISUAL_SEARCH_HEIGHT
  return Math.max(
    terrainY,
    getOutdoorWalkableHeight(x, z, referenceY),
    getOutdoorHouseRoofHeight(x, z, referenceY) ?? -Infinity,
  )
}

function getBossGroundPose(x, z, referenceFootY, footprintRadius) {
  const radius = Math.max(0.4, footprintRadius)
  const center = getBossGroundSurface(x, z, referenceFootY)
  const left = getBossGroundSurface(x - radius, z, center)
  const right = getBossGroundSurface(x + radius, z, center)
  const back = getBossGroundSurface(x, z - radius, center)
  const front = getBossGroundSurface(x, z + radius, center)

  return {
    // Supporting the full footprint prevents the large mesh from cutting through
    // an uphill side while its centre is still on lower terrain.
    y: Math.max(center, left, right, back, front),
    pitch: THREE.MathUtils.clamp(
      -Math.atan2(front - back, radius * 2),
      -0.22,
      0.22,
    ),
    roll: THREE.MathUtils.clamp(
      Math.atan2(right - left, radius * 2),
      -0.22,
      0.22,
    ),
  }
}

function prepareBossMinionAsset(source, kind) {
  source.traverse((child) => {
    if (child.name === 'Armature') {
      child.rotation.set(0, 0, 0)
      child.scale.set(1, 1, 1)
    }
  })
  source.updateWorldMatrix(true, true)
  const bounds = new THREE.Box3().setFromObject(source)
  const size = bounds.getSize(new THREE.Vector3())
  const center = bounds.getCenter(new THREE.Vector3())
  const object = cloneSkeleton(source)
  object.traverse((child) => {
    if (child.isMesh || child.isSkinnedMesh) child.frustumCulled = false
  })
  return {
    object,
    offset: [-center.x, -bounds.min.y, -center.z],
    scale: (
      SLIME_BOSS.summons.modelTargetHeight
      * (SLIME_BOSS.summons.sizeScaleByKind[kind] ?? 1)
      * WORLD_UNITS_PER_METER
    ) / Math.max(size.y, 0.001),
  }
}

function BossPhasePrewarm({
  shockwavePreset,
}) {
  return (
    <group
      visible={false}
      position={[0, -500, 0]}
      scale={0.001}
      userData={{
        shaderWarmupWhenHidden: true,
        shaderWarmupScope: 'boot',
        debugCategory: 'warmup',
      }}
    >
      <mesh position={[4, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} frustumCulled={false}>
        <circleGeometry args={[SLIME_BOSS.projectile.poolRadius, 40]} />
        <meshBasicMaterial color="#ff372f" transparent opacity={0.28} depthWrite={false} />
      </mesh>
      <mesh position={[6, 0, 0]} frustumCulled={false}>
        <sphereGeometry args={[0.48, 16, 12]} />
        <meshStandardMaterial color="#e31520" emissive="#7b0000" emissiveIntensity={0.8} roughness={0.55} />
      </mesh>
      <pointLight color="#ff1f18" intensity={0} distance={8} />
      <ParticleEffect preset={shockwavePreset} playing={false} warmup />
    </group>
  )
}

function AltarProximity({ placements, playerPositionRef, enabled }) {
  const currentRef = useRef(null)

  useFrame(() => {
    const setNearAltar = useBossStore.getState().setNearAltar
    if (!enabled || !placements.length || !playerPositionRef?.current) {
      if (currentRef.current !== null) {
        currentRef.current = null
        setNearAltar(null)
      }
      return
    }

    const player = playerPositionRef.current
    let nearestId = null
    let nearestDistance = SLIME_BOSS.summonRange
    for (const placement of placements) {
      const [x = 0, , z = 0] = placement.position ?? []
      const distance = Math.hypot(player.x - x, player.z - z)
      if (distance < nearestDistance) {
        nearestDistance = distance
        nearestId = placement.id
      }
    }
    if (nearestId !== currentRef.current) {
      currentRef.current = nearestId
      setNearAltar(nearestId)
    }
  })
  return null
}

function GroundShockwave({ attack, origin, timeOffsetRef, preset }) {
  const impactRingRef = useRef(null)
  const impactFlashRef = useRef(null)
  const ring = preset.groundRings?.[0]
  const vfxPreset = useMemo(() => ({
    ...preset,
    groundZones: [],
    light: { ...preset.light, enabled: false },
  }), [preset])
  const ringScale = SLIME_BOSS.shockwave.maxRadius / Math.max(0.1, ring?.endRadius ?? SLIME_BOSS.shockwave.maxRadius)
  const vfxTimeSource = useMemo(() => () => {
    if (attack?.kind !== 'shockwave') return -1
    const now = Date.now() + (timeOffsetRef?.current ?? 0)
    const shockDuration = Math.max(0.05, (attack.activeEndsAt - attack.jumpEndsAt) / 1000)
    return ((now - attack.jumpEndsAt) / 1000) * (preset.duration / shockDuration)
  }, [attack, preset.duration, timeOffsetRef])

  useFrame(() => {
    const now = Date.now() + (timeOffsetRef?.current ?? 0)

    const impactAge = attack?.kind === 'shockwave' ? now - attack.jumpEndsAt : Infinity
    const impactVisible = impactAge >= 0 && impactAge < PROJECTILE_IMPACT_FLASH_MS
    const impactProgress = impactVisible ? impactAge / PROJECTILE_IMPACT_FLASH_MS : 1
    const impactY = getBossGroundSurface(origin[0], origin[2])
    for (const ref of [impactRingRef, impactFlashRef]) {
      if (!ref.current) continue
      ref.current.visible = impactVisible
      ref.current.position.set(origin[0], impactY + 0.085, origin[2])
    }
    if (impactRingRef.current) {
      const scale = 0.3 + impactProgress * SLIME_BOSS.shockwave.impactRadius
      impactRingRef.current.scale.setScalar(scale)
      impactRingRef.current.material.opacity = (1 - impactProgress) * 0.9
    }
    if (impactFlashRef.current) {
      const scale = 0.6 + impactProgress * 2.5
      impactFlashRef.current.scale.setScalar(scale)
      impactFlashRef.current.material.opacity = (1 - impactProgress) * 0.42
    }
  })

  return (
    <>
      <group position={origin} scale={ringScale}>
        <ParticleEffect
          preset={vfxPreset}
          playing={attack?.kind === 'shockwave'}
          forceOneShot
          playbackId={attack?.id ?? 'shockwave-idle'}
          timeSource={vfxTimeSource}
        />
      </group>
      <mesh ref={impactFlashRef} visible={false} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1, 48]} />
        <meshBasicMaterial
          color="#ff4b23"
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh ref={impactRingRef} visible={false} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.72, 1, 64]} />
        <meshBasicMaterial
          color="#fff1c2"
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>
    </>
  )
}

function BossProjectileHazard({
  hazard,
  slotIndex,
  origin,
  timeOffsetRef,
  fireballPreset,
  groundZonePreset,
}) {
  const groupRef = useRef(null)
  const fallingRef = useRef(null)
  const telegraphRef = useRef(null)
  const impactRingRef = useRef(null)
  const impactFlashRef = useRef(null)
  const launchOriginRef = useRef([...origin])
  const hazardRef = useRef(hazard)
  const assignedHazardIdRef = useRef(null)
  useLayoutEffect(() => {
    hazardRef.current = hazard
    if (hazard?.id !== assignedHazardIdRef.current) {
      assignedHazardIdRef.current = hazard?.id ?? null
      if (hazard) launchOriginRef.current = [...origin]
    }
  }, [hazard, origin])
  const safePosition = hazard?.position ?? [0, -500, 0]
  const surfaceY = useMemo(
    () => (hazard ? getBossGroundSurface(hazard.position[0], hazard.position[2]) : -500),
    [hazard],
  )
  const groundZone = groundZonePreset.groundZones?.[0]
  const hazardRadius = hazard?.radius ?? SLIME_BOSS.projectile.poolRadius
  const groundZoneScale = hazardRadius / Math.max(0.1, groundZone?.startRadius ?? hazardRadius)
  const groundZoneTimeSource = useMemo(() => () => {
    const currentHazard = hazardRef.current
    if (!currentHazard) return -1
    return (Date.now() + (timeOffsetRef?.current ?? 0) - currentHazard.impactAt) / 1000
  }, [timeOffsetRef])

  useFrame(() => {
    const currentHazard = hazardRef.current
    const group = groupRef.current
    if (group) group.visible = Boolean(currentHazard)
    if (!currentHazard) return
    const now = Date.now() + (timeOffsetRef?.current ?? 0)
    const launchOrigin = launchOriginRef.current
    const launchSurfaceY = getBossGroundSurface(launchOrigin[0], launchOrigin[2])
    const fallProgress = THREE.MathUtils.clamp(
      (now - currentHazard.telegraphAt)
        / Math.max(1, currentHazard.impactAt - currentHazard.telegraphAt),
      0,
      1,
    )
    const falling = fallingRef.current
    if (falling) {
      falling.visible = now < currentHazard.impactAt
      const eased = fallProgress * fallProgress * (3 - 2 * fallProgress)
      falling.position.x = (launchOrigin[0] - currentHazard.position[0]) * (1 - eased)
      falling.position.z = (launchOrigin[2] - currentHazard.position[2]) * (1 - eased)
      falling.position.y = THREE.MathUtils.lerp(
        launchSurfaceY - surfaceY + 3.2,
        0.42,
        eased,
      ) + Math.sin(fallProgress * Math.PI) * 2.4
      const pulse = (0.92 + Math.sin(now * 0.025) * 0.08) * 2.15
      falling.scale.setScalar(pulse)
    }

    const telegraphProgress = 0.5 + Math.sin(now * 0.014) * 0.5
    if (telegraphRef.current) {
      telegraphRef.current.visible = now < currentHazard.impactAt
      telegraphRef.current.scale.setScalar(0.9 + telegraphProgress * 0.12)
      telegraphRef.current.material.opacity = 0.26 + telegraphProgress * 0.26
    }
    const impactAge = now - currentHazard.impactAt
    const impactVisible = impactAge >= 0 && impactAge < PROJECTILE_IMPACT_FLASH_MS
    const progress = impactVisible ? impactAge / PROJECTILE_IMPACT_FLASH_MS : 1
    if (impactRingRef.current) {
      impactRingRef.current.visible = impactVisible
      impactRingRef.current.scale.setScalar(0.25 + progress * currentHazard.radius)
      impactRingRef.current.material.opacity = (1 - progress) * 0.9
    }
    if (impactFlashRef.current) {
      impactFlashRef.current.visible = impactVisible
      impactFlashRef.current.scale.setScalar(0.45 + progress * 1.5)
      impactFlashRef.current.material.opacity = (1 - progress) * 0.55
    }
  })

  return (
    <group
      ref={groupRef}
      position={[safePosition[0], surfaceY + 0.055, safePosition[2]]}
      visible={Boolean(hazard)}
      userData={{
        shaderWarmupWhenHidden: true,
        shaderWarmupScope: 'boot',
        debugCategory: 'warmup',
        bossProjectileSlot: slotIndex,
      }}
    >
      <group scale={[groundZoneScale, 1, groundZoneScale]}>
        <ParticleEffect
          preset={groundZonePreset}
          playing={Boolean(hazard)}
          warmup
          forceOneShot
          playbackId={hazard?.id ?? `boss-projectile-zone-${slotIndex}`}
          timeSource={groundZoneTimeSource}
        />
      </group>
      <mesh ref={telegraphRef} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[
          SLIME_BOSS.projectile.poolRadius * 0.78,
          SLIME_BOSS.projectile.poolRadius,
          48,
        ]} />
        <meshBasicMaterial
          color="#ff3b24"
          transparent
          opacity={0.4}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>
      <group ref={fallingRef}>
        <ParticleEffect
          preset={fireballPreset}
          playing={Boolean(hazard)}
          warmup
          loop
          position={[0, -0.9, 0]}
          playbackId={hazard?.id ?? `boss-projectile-fireball-${slotIndex}`}
        />
      </group>
      <mesh ref={impactFlashRef} visible={false} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1, 48]} />
        <meshBasicMaterial
          color="#ff4a25"
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh ref={impactRingRef} visible={false} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.72, 1, 48]} />
        <meshBasicMaterial
          color="#fff0bd"
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}

function BossHazards({
  playerPositionRef,
  playerMountPositionRef,
  onDamagePlayer,
  movementSpeedMultiplierRef,
  timeOffsetRef,
}) {
  const hazards = useBossStore((state) => state.hazards)
  const attack = useBossStore((state) => state.attack)
  const spawn = useBossStore((state) => state.spawn)
  const bossPosition = useBossStore((state) => state.position)
  const damageTimesRef = useRef(new Map())
  const shockImpactRef = useRef(null)
  const shockHitRef = useRef(null)
  const shockwavePreset = useStoredParticlePreset('slime_shockwave_fire')
  const storedFireballPreset = useStoredParticlePreset('fireball_projectile')
  const fireballPreset = useMemo(() => (
    storedFireballPreset
      ? {
          ...storedFireballPreset,
          // Une salve ne doit jamais modifier le nombre de lumières de la scène :
          // Three.js recompilerait alors les shaders du décor à l'apparition et à l'impact.
          light: { ...storedFireballPreset.light, enabled: false },
        }
      : null
  ), [storedFireballPreset])
  const groundZonePreset = useStoredParticlePreset('slime_projectile_zone')

  useEffect(() => () => {
    if (movementSpeedMultiplierRef) movementSpeedMultiplierRef.current = 1
  }, [movementSpeedMultiplierRef])

  useFrame(() => {
    const now = Date.now() + (timeOffsetRef?.current ?? 0)
    const player = playerPositionRef?.current
    const attackOrigin = bossPosition ?? spawn
    let slowed = false

    {
      const radius = getShockwaveRadius(attack, now)
      const mountFootY = playerMountPositionRef?.current?.y
      const playerFootY = player
        ? (Number.isFinite(mountFootY) ? mountFootY : player.y - PLAYER_CENTER_TO_FOOT)
        : null
      const surfaceY = player
        ? getBossGroundSurface(player.x, player.z, playerFootY)
        : null
      const touchesGroundWave = player
        ? isGroundWaveContact({
            playerCenterY: player.y,
            playerCenterToFoot: PLAYER_CENTER_TO_FOOT,
            mountFootY,
            surfaceY,
            dodgeHeight: SLIME_BOSS.shockwave.dodgeHeight,
          })
        : false
      if (
        attack?.kind === 'shockwave' &&
        now >= attack.jumpEndsAt &&
        now < attack.jumpEndsAt + 220 &&
        player &&
        shockImpactRef.current !== attack.id
      ) {
        const impactDistance = Math.hypot(player.x - attackOrigin[0], player.z - attackOrigin[2])
        if (touchesGroundWave && impactDistance <= SLIME_BOSS.shockwave.impactRadius) {
          shockImpactRef.current = attack.id
          onDamagePlayer?.({
            damage: SLIME_BOSS.shockwave.impactDamage,
            sourceId: `${attack.id}:impact`,
            attackType: ATTACK_TYPE.DODGEABLE,
          })
        }
      }

      if (radius > 0 && player && shockHitRef.current !== attack?.id) {
        const distance = Math.hypot(player.x - attackOrigin[0], player.z - attackOrigin[2])
        if (touchesGroundWave && Math.abs(distance - radius) < SLIME_BOSS.shockwave.band) {
          shockHitRef.current = attack.id
          onDamagePlayer?.({
            damage: SLIME_BOSS.shockwave.damage,
            sourceId: attack.id,
            attackType: ATTACK_TYPE.GROUND_WAVE,
          })
        }
      }
    }

    for (const hazard of hazards) {
      if (!player) continue
      const distance = Math.hypot(player.x - hazard.position[0], player.z - hazard.position[2])
      if (distance > hazard.radius) continue
      if (now >= hazard.impactAt && now < hazard.impactAt + 220) {
        const impactKey = `${hazard.id}:impact`
        if (!damageTimesRef.current.has(impactKey)) {
          damageTimesRef.current.set(impactKey, now)
          onDamagePlayer?.({
            damage: SLIME_BOSS.projectile.impactDamage,
            sourceId: impactKey,
            attackType: ATTACK_TYPE.DODGEABLE,
          })
        }
      }
      if (now >= hazard.impactAt && now < hazard.expiresAt) {
        slowed = true
        const tickKey = `${hazard.id}:pool`
        const lastDamageAt = damageTimesRef.current.get(tickKey) ?? 0
        if (now - lastDamageAt >= SLIME_BOSS.projectile.poolTickMs) {
          damageTimesRef.current.set(tickKey, now)
          onDamagePlayer?.({
            damage: SLIME_BOSS.projectile.poolDamage,
            sourceId: tickKey,
            attackType: ATTACK_TYPE.PERSISTENT_AREA,
          })
        }
      }
    }
    if (movementSpeedMultiplierRef) {
      movementSpeedMultiplierRef.current = slowed ? SLIME_BOSS.projectile.slowMultiplier : 1
    }
  })

  if (!shockwavePreset || !fireballPreset || !groundZonePreset) return null
  const attackOrigin = bossPosition ?? spawn ?? [0, -500, 0]
  return (
    <>
      <GroundShockwave
        attack={attack}
        origin={attackOrigin}
        timeOffsetRef={timeOffsetRef}
        preset={shockwavePreset}
      />
      {Array.from({ length: BOSS_PROJECTILE_POOL_SIZE }, (_, slotIndex) => {
        const hazard = hazards.find((entry) => entry.slot === slotIndex) ?? null
        return (
          <BossProjectileHazard
            key={`boss-projectile-slot-${slotIndex}`}
            hazard={hazard}
            slotIndex={slotIndex}
            origin={attackOrigin}
            timeOffsetRef={timeOffsetRef}
            fireballPreset={fireballPreset}
            groundZonePreset={groundZonePreset}
          />
        )
      })}
    </>
  )
}

const BossMinion = memo(function BossMinion({
  minion,
  slotIndex,
  slotKind,
  playerPositionRef,
  onDamagePlayer,
  onBossHit,
  registerCombatTarget,
  swordEquipped,
  timeOffsetRef,
  preparedModel = null,
  mobGroupRef = null,
}) {
  const url = slotKind === 'blue' ? SLIME_BOSS.summons.blueModelUrl : SLIME_BOSS.summons.greenModelUrl
  const { scene } = useGLTF(url)
  const model = useMemo(
    () => preparedModel ?? prepareBossMinionAsset(scene, slotKind),
    [preparedModel, scene, slotKind],
  )
  const groupRef = useRef(null)
  const summonRingRef = useRef(null)
  const summonGlowRef = useRef(null)
  const lastDamageAtRef = useRef(0)
  const hitRef = useRef(onBossHit)
  const swordRef = useRef(swordEquipped)
  const minionIdRef = useRef(null)
  const hitSquashRef = useRef(0)
  const attackAnimationRef = useRef(null)
  const visualPositionRef = useRef({ x: 0, y: -500, z: 0 })
  const sizeScale = SLIME_BOSS.summons.sizeScaleByKind[slotKind] ?? 1
  const targetRef = useRef({
    id: `boss-minion-slot-${slotIndex}`,
    position: { x: 0, y: -500, z: 0 },
    radius: SLIME_BOSS.summons.radius * Math.max(0.6, sizeScale),
    height: SLIME_BOSS.summons.targetHeight * sizeScale,
    tags: ['slime'],
    disabled: false,
    takeDamage: (hit) => {
      hitSquashRef.current = 1
      const damage = getMeleeHitDamage({
        weaponId: swordRef.current ? 'cheat_sword' : null,
        fallbackDamage: hit.damage,
        targetTags: ['slime'],
        charged: Boolean(hit.charged),
      })
      hitRef.current?.({
        ...hit,
        targetId: minionIdRef.current,
        damage,
        weaponId: swordRef.current ? 'cheat_sword' : null,
      })
      return true
    },
  })

  useEffect(() => {
    hitRef.current = onBossHit
    swordRef.current = swordEquipped
  }, [onBossHit, swordEquipped])

  useEffect(() => {
    const minionId = minion?.id ?? null
    minionIdRef.current = minionId
    targetRef.current.id = minionId ?? `boss-minion-slot-${slotIndex}`
    if (!registerCombatTarget || !minionId) return undefined
    return registerCombatTarget(minionId, targetRef.current)
  }, [minion?.id, registerCombatTarget, slotIndex])

  useEffect(() => {
    const minionId = minion?.id ?? null
    const mobGroup = mobGroupRef?.current
    if (!mobGroup || !minionId) return undefined
    const mob = {
      getPosition: () => targetRef.current.position,
      separationRadius: targetRef.current.radius,
      immovableForSeparation: true,
    }
    mob.spatialValue = {
      id: minionId,
      mob,
      position: targetRef.current.position,
    }
    mobGroup.set(minionId, mob)
    return () => { mobGroup.delete(minionId) }
  }, [minion?.id, mobGroupRef])

  useFrame((state, delta) => {
    const group = groupRef.current
    if (!group) return
    const currentId = minionIdRef.current
    const live = currentId
      ? useBossStore.getState().minions.find((entry) => entry.id === currentId)
      : null
    group.visible = Boolean(live)
    if (!live) return
    group.position.x = THREE.MathUtils.damp(group.position.x, live.position[0], 9, delta)
    group.position.y = live.position[1]
    group.position.z = THREE.MathUtils.damp(group.position.z, live.position[2], 9, delta)
    targetRef.current.position.x = live.position[0]
    targetRef.current.position.y = live.position[1]
    targetRef.current.position.z = live.position[2]
    visualPositionRef.current.x = group.position.x
    visualPositionRef.current.y = group.position.y
    visualPositionRef.current.z = group.position.z

    const player = playerPositionRef?.current
    if (player) {
      const directionX = player.x - group.position.x
      const directionZ = player.z - group.position.z
      if (directionX * directionX + directionZ * directionZ > 0.0001) {
        const targetYaw = Math.atan2(directionX, directionZ)
        const yawDelta = THREE.MathUtils.euclideanModulo(
          targetYaw - group.rotation.y + Math.PI,
          Math.PI * 2,
        ) - Math.PI
        group.rotation.y += yawDelta * (1 - Math.exp(-10 * delta))
      }
    }

    const now = Date.now() + (timeOffsetRef?.current ?? 0)
    const summonAge = Math.max(0, now - (live.spawnedAt ?? 0))
    const summonProgress = THREE.MathUtils.clamp(summonAge / 620, 0, 1)
    const easedSummon = 1 - Math.pow(1 - summonProgress, 3)
    group.scale.setScalar(Math.max(0.08, easedSummon))
    if (summonRingRef.current) {
      summonRingRef.current.visible = summonProgress < 1
      summonRingRef.current.scale.setScalar(0.4 + summonProgress * 2.8)
      summonRingRef.current.material.opacity = (1 - summonProgress) * 0.85
    }
    if (summonGlowRef.current) {
      summonGlowRef.current.visible = summonProgress < 1
      summonGlowRef.current.scale.setScalar(1.4 - summonProgress * 0.5)
      summonGlowRef.current.material.opacity = (1 - summonProgress) * 0.42
    }

    if (!player || now - lastDamageAtRef.current < SLIME_BOSS.summons.attackCooldownMs) return
    if (Math.hypot(player.x - live.position[0], player.z - live.position[2]) <= SLIME_BOSS.summons.radius + 0.65) {
      lastDamageAtRef.current = now
      attackAnimationRef.current = { endsAt: state.clock.elapsedTime + 0.52 }
      onDamagePlayer?.({
        damage: SLIME_BOSS.summons.damage,
        sourceId: live.id,
        attackType: ATTACK_TYPE.DODGEABLE,
      })
    }
  })

  return (
    <group
      ref={groupRef}
      position={minion?.position ?? [0, -500, 0]}
      scale={1}
      visible={Boolean(minion)}
      userData={{
        shaderWarmupWhenHidden: true,
        shaderWarmupScope: 'boot',
        debugCategory: 'warmup',
      }}
    >
      <SlimeProceduralModel
        object={model.object}
        offset={model.offset}
        scale={model.scale}
        positionRef={visualPositionRef}
        hitSquashRef={hitSquashRef}
        attackRef={attackAnimationRef}
      />
      <mesh ref={summonGlowRef} position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <circleGeometry args={[1, 40]} />
        <meshBasicMaterial
          color={slotKind === 'blue' ? '#38b8ff' : '#6bff75'}
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh ref={summonRingRef} position={[0, 0.025, 0]} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.74, 1, 48]} />
        <meshBasicMaterial
          color="#fff2c2"
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
})

function BossModel({
  authority,
  playerPositionRef,
  remotePlayerStateRef,
  localPlayerAlive,
  onBossHit,
  registerCombatTarget,
  swordEquipped,
  timeOffsetRef,
  mobGroupRef,
}) {
  const gltf = useGLTF(SLIME_BOSS.modelUrl)
  const groupRef = useRef(null)
  const deathTimeRef = useRef(0)
  const lastSimulationAtRef = useRef(0)
  const spawn = useBossStore((state) => state.spawn)
  const phase = useBossStore((state) => state.phase)

  const swordRef = useRef(swordEquipped)
  const hitRef = useRef(onBossHit)
  const targetRef = useRef({
    id: SLIME_BOSS.id,
    position: { x: 0, y: 0, z: 0 },
    radius: SLIME_BOSS.melee.hitRadius,
    height: SLIME_BOSS.targetHeight,
    disabled: false,
    takeDamage: (hit) => {
      const damage = getMeleeHitDamage({
        weaponId: swordRef.current ? 'cheat_sword' : null,
        fallbackDamage: hit.damage,
        targetTags: ['slime'],
        charged: Boolean(hit.charged),
      })
      hitRef.current?.({ ...hit, damage, weaponId: swordRef.current ? 'cheat_sword' : null })
      return true
    },
  })

  const { scene, baseScale, footOffset, visualRadius } = useMemo(() => {
    const cloned = cloneSkeleton(gltf.scene)
    cloned.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true
        child.frustumCulled = false
      }
    })
    const box = new THREE.Box3().setFromObject(cloned)
    const size = box.getSize(new THREE.Vector3())
    const scale = SLIME_BOSS.targetHeight / (size.y || 1)
    return {
      scene: cloned,
      baseScale: scale,
      footOffset: -box.min.y * scale,
      visualRadius: Math.max(size.x, size.z) * scale * 0.5,
    }
  }, [gltf])

  useEffect(() => {
    swordRef.current = swordEquipped
    hitRef.current = onBossHit
  }, [onBossHit, swordEquipped])

  useEffect(() => {
    targetRef.current.radius = Math.max(
      SLIME_BOSS.melee.hitRadius,
      visualRadius + SLIME_BOSS.melee.hitPadding,
    )
  }, [visualRadius])

  useEffect(() => {
    if (!registerCombatTarget || !spawn) return undefined
    return registerCombatTarget(SLIME_BOSS.id, targetRef.current)
  }, [registerCombatTarget, spawn])

  useEffect(() => {
    const mobGroup = mobGroupRef?.current
    if (!mobGroup || !spawn) return undefined
    const mob = {
      getPosition: () => targetRef.current.position,
      separationRadius: Math.max(SLIME_BOSS.melee.hitRadius, visualRadius),
      immovableForSeparation: true,
    }
    mob.spatialValue = {
      id: SLIME_BOSS.id,
      mob,
      position: targetRef.current.position,
    }
    mobGroup.set(SLIME_BOSS.id, mob)
    return () => { mobGroup.delete(SLIME_BOSS.id) }
  }, [mobGroupRef, spawn, visualRadius])

  useFrame((_, dt) => {
    const now = Date.now() + (timeOffsetRef?.current ?? 0)
    const bossBeforeStep = useBossStore.getState()
    if (authority && bossBeforeStep.active && now - lastSimulationAtRef.current >= 100) {
      const players = []
      if (playerPositionRef?.current) {
        const player = playerPositionRef.current
        players.push({ id: 'local', alive: localPlayerAlive, position: [player.x, player.y, player.z] })
      }
      const remote = remotePlayerStateRef?.current
      if (remote?.position) players.push({
        id: remote.userId ?? 'remote',
        alive: remote.alive !== false,
        position: remote.position,
      })
      useBossStore.getState().step({
        now,
        dt: Math.min(0.25, (now - (lastSimulationAtRef.current || now - 100)) / 1000),
        players,
        getGroundHeight: getBossGroundSurface,
      })
      lastSimulationAtRef.current = now
    }

    const group = groupRef.current
    const boss = useBossStore.getState()
    if (!group || !boss.position) return
    const jumpOffset = getBossJumpOffset(boss.attack, now)
    const moveDx = boss.position[0] - group.position.x
    const moveDz = boss.position[2] - group.position.z
    const moving = Math.hypot(moveDx, moveDz) > 0.025
    const moveCycle = Math.abs(Math.sin(now / 155))
    const bob = moving ? moveCycle * 0.22 : Math.sin(now / 500) * 0.09
    const groundPose = getBossGroundPose(
      boss.position[0],
      boss.position[2],
      boss.position[1],
      Math.min(1.25, Math.max(0.55, visualRadius * 0.4)),
    )
    group.position.x = THREE.MathUtils.damp(group.position.x, boss.position[0], 8, dt)
    group.position.y = THREE.MathUtils.damp(
      group.position.y,
      groundPose.y + footOffset + bob + jumpOffset,
      12,
      dt,
    )
    group.position.z = THREE.MathUtils.damp(group.position.z, boss.position[2], 8, dt)
    group.rotation.x = THREE.MathUtils.damp(group.rotation.x, groundPose.pitch, 10, dt)
    group.rotation.z = THREE.MathUtils.damp(group.rotation.z, groundPose.roll, 10, dt)
    if (moving) {
      const targetYaw = Math.atan2(moveDx, moveDz)
      const yawDelta = Math.atan2(
        Math.sin(targetYaw - group.rotation.y),
        Math.cos(targetYaw - group.rotation.y),
      )
      group.rotation.y += yawDelta * (1 - Math.exp(-dt * 8))
    }
    targetRef.current.position.x = boss.position[0]
    targetRef.current.position.y = groundPose.y
    targetRef.current.position.z = boss.position[2]
    targetRef.current.disabled = boss.state !== 'active'

    if (boss.state === 'dying') {
      deathTimeRef.current += dt
      const scale = Math.max(0, 1 - deathTimeRef.current / 1.2)
      group.scale.setScalar(baseScale * scale)
    } else {
      deathTimeRef.current = 0
      const pulse = boss.phase === 3 ? 1 + Math.sin(now / 90) * 0.025 : 1
      const squash = moving ? (moveCycle - 0.5) * 0.045 : 0
      group.scale.set(
        baseScale * pulse * (1 + squash),
        baseScale * pulse * (1 - squash * 1.35),
        baseScale * pulse * (1 + squash),
      )
    }
  })

  const safeSpawn = spawn ?? [0, -500, 0]
  return (
    <group
      ref={groupRef}
      position={[safeSpawn[0], safeSpawn[1] + footOffset, safeSpawn[2]]}
      scale={baseScale}
      visible={Boolean(spawn)}
      userData={{
        shaderWarmupWhenHidden: true,
        shaderWarmupScope: 'boot',
        debugCategory: 'warmup',
      }}
    >
      <primitive object={scene} />
      <pointLight color="#ff1f18" intensity={phase === 3 ? 2.2 : 0} distance={8} />
    </group>
  )
}

export default function SlimeBossSystem({
  placements = [],
  playerPositionRef,
  playerMountPositionRef,
  remotePlayerStateRef,
  localPlayerAlive = true,
  onDamagePlayer,
  onBossHit,
  registerCombatTarget,
  swordEquipped = false,
  movementSpeedMultiplierRef,
  timeOffsetRef,
  authority = true,
  enabled = true,
  mobGroupRef = null,
}) {
  const minions = useBossStore((state) => state.minions)
  const shockwavePreset = useStoredParticlePreset('slime_shockwave_fire')
  const greenGltf = useGLTF(SLIME_BOSS.summons.greenModelUrl)
  const blueGltf = useGLTF(SLIME_BOSS.summons.blueModelUrl)
  const preparedMinionModels = useMemo(() => PREPARED_MINION_KINDS.map((kind) => (
    prepareBossMinionAsset(kind === 'blue' ? blueGltf.scene : greenGltf.scene, kind)
  )), [blueGltf.scene, greenGltf.scene])
  useLayoutEffect(() => {
    completeLoadTask(SLIME_BOSS_PREPARE_TASK)
  }, [preparedMinionModels])
  useEffect(() => () => {
    if (movementSpeedMultiplierRef) movementSpeedMultiplierRef.current = 1
  }, [movementSpeedMultiplierRef])

  return (
    <>
      <BossPhasePrewarm
        shockwavePreset={shockwavePreset}
      />
      {preparedMinionModels.map((preparedModel, index) => {
        const minion = minions.find((entry) => entry.slot === index) ?? null
        return (
          <BossMinion
            key={`boss-minion-slot-${index}`}
            minion={minion}
            slotIndex={index}
            slotKind={PREPARED_MINION_KINDS[index]}
            playerPositionRef={playerPositionRef}
            onDamagePlayer={onDamagePlayer}
            onBossHit={onBossHit}
            registerCombatTarget={registerCombatTarget}
            swordEquipped={swordEquipped}
            timeOffsetRef={timeOffsetRef}
            preparedModel={preparedModel}
            mobGroupRef={mobGroupRef}
          />
        )
      })}
      <AltarProximity placements={placements} playerPositionRef={playerPositionRef} enabled={enabled} />
      <BossHazards
        playerPositionRef={playerPositionRef}
        playerMountPositionRef={playerMountPositionRef}
        onDamagePlayer={onDamagePlayer}
        movementSpeedMultiplierRef={movementSpeedMultiplierRef}
        timeOffsetRef={timeOffsetRef}
      />
      <BossModel
        authority={authority}
        playerPositionRef={playerPositionRef}
        remotePlayerStateRef={remotePlayerStateRef}
        localPlayerAlive={localPlayerAlive}
        onBossHit={onBossHit}
        registerCombatTarget={registerCombatTarget}
        swordEquipped={swordEquipped}
        timeOffsetRef={timeOffsetRef}
        mobGroupRef={mobGroupRef}
      />
    </>
  )
}

useGLTF.preload(SLIME_BOSS.modelUrl)
useGLTF.preload(SLIME_BOSS.summons.greenModelUrl)
useGLTF.preload(SLIME_BOSS.summons.blueModelUrl)
