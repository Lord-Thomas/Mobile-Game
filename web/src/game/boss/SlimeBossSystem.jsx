import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
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

const PREPARED_MINION_KINDS = ['green', 'blue', 'green', 'green', 'blue', 'green', 'blue', 'green']
const PLAYER_CENTER_TO_FOOT = PLAYER_CAPSULE_HALF_HEIGHT + PLAYER_CAPSULE_RADIUS
const SHOCKWAVE_SEGMENT_COUNT = 48
const SURFACE_VISUAL_SEARCH_HEIGHT = 2.4
const PROJECTILE_IMPACT_FLASH_MS = 520

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

function clonePreparedBossAsset(scene) {
  const cloned = scene.clone(true)
  cloned.traverse((child) => {
    if (child.isMesh || child.isSkinnedMesh) child.frustumCulled = false
  })
  return cloned
}

function BossPhasePrewarm({
  greenScene,
  blueScene,
  shockwavePreset,
  fireballPreset,
  groundZonePreset,
}) {
  const warmupGreen = useMemo(() => clonePreparedBossAsset(greenScene), [greenScene])
  const warmupBlue = useMemo(() => clonePreparedBossAsset(blueScene), [blueScene])

  return (
    <group
      visible={false}
      position={[0, -500, 0]}
      scale={0.001}
      userData={{ shaderWarmupWhenHidden: true, debugCategory: 'warmup' }}
    >
      <primitive object={warmupGreen} />
      <primitive object={warmupBlue} position={[2, 0, 0]} />
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
      <ParticleEffect preset={fireballPreset} playing={false} warmup position={[8, 0, 0]} />
      <ParticleEffect preset={groundZonePreset} playing={false} warmup position={[10, 0, 0]} />
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
  const coreRef = useRef(null)
  const glowRef = useRef(null)
  const impactRingRef = useRef(null)
  const impactFlashRef = useRef(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const lastRadiusRef = useRef(-1)
  const ring = preset.groundRings?.[0]
  const vfxPreset = useMemo(() => ({
    ...preset,
    groundRings: [],
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
    const radius = getShockwaveRadius(attack, now)
    const core = coreRef.current
    const glow = glowRef.current
    const visible = radius > 0

    if (core) core.visible = visible
    if (glow) glow.visible = visible
    if (visible && Math.abs(radius - lastRadiusRef.current) > 0.12) {
      const arcLength = Math.max(0.08, (Math.PI * 2 * radius) / SHOCKWAVE_SEGMENT_COUNT * 1.16)
      for (let index = 0; index < SHOCKWAVE_SEGMENT_COUNT; index += 1) {
        const angle = (index / SHOCKWAVE_SEGMENT_COUNT) * Math.PI * 2
        const x = origin[0] + Math.cos(angle) * radius
        const z = origin[2] + Math.sin(angle) * radius
        const surfaceY = getBossGroundSurface(x, z)
        dummy.position.set(x, surfaceY + 0.075, z)
        dummy.rotation.set(-Math.PI / 2, 0, angle + Math.PI / 2)
        const coreWidth = Math.max(0.08, (ring?.thickness ?? 0.42) * ringScale * 0.3)
        const glowWidth = Math.max(0.2, (ring?.thickness ?? 0.42) * ringScale * 1.08)
        dummy.scale.set(arcLength, coreWidth, 1)
        dummy.updateMatrix()
        core?.setMatrixAt(index, dummy.matrix)
        dummy.scale.set(arcLength * 1.08, glowWidth, 1)
        dummy.updateMatrix()
        glow?.setMatrixAt(index, dummy.matrix)
      }
      if (core) core.instanceMatrix.needsUpdate = true
      if (glow) glow.instanceMatrix.needsUpdate = true
      lastRadiusRef.current = radius
    }

    const fade = visible ? 1 - radius / SLIME_BOSS.shockwave.maxRadius : 0
    const presetOpacity = ring?.opacity ?? 0.9
    const presetIntensity = Math.min(1.5, (ring?.intensity ?? 3) / 3)
    if (core?.material) core.material.opacity = visible ? presetOpacity * presetIntensity * (0.72 + fade * 0.22) : 0
    if (glow?.material) glow.material.opacity = visible ? presetOpacity * presetIntensity * (0.2 + fade * 0.28) : 0

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
      <instancedMesh ref={glowRef} args={[null, null, SHOCKWAVE_SEGMENT_COUNT]} visible={false} frustumCulled={false}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          color={ring?.colorMid ?? '#ff3a20'}
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </instancedMesh>
      <instancedMesh ref={coreRef} args={[null, null, SHOCKWAVE_SEGMENT_COUNT]} visible={false} frustumCulled={false}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          color={ring?.colorHot ?? '#ffd7a8'}
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </instancedMesh>
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
  origin,
  timeOffsetRef,
  fireballPreset,
  groundZonePreset,
}) {
  const fallingRef = useRef(null)
  const telegraphRef = useRef(null)
  const impactRingRef = useRef(null)
  const impactFlashRef = useRef(null)
  const [launchOrigin] = useState(() => [...origin])
  const surfaceY = useMemo(
    () => getBossGroundSurface(hazard.position[0], hazard.position[2]),
    [hazard.position],
  )
  const launchSurfaceY = useMemo(
    () => getBossGroundSurface(launchOrigin[0], launchOrigin[2]),
    [launchOrigin],
  )
  const groundZone = groundZonePreset.groundZones?.[0]
  const groundZoneScale = hazard.radius / Math.max(0.1, groundZone?.startRadius ?? hazard.radius)
  const groundZoneTimeSource = useMemo(() => () => (
    (Date.now() + (timeOffsetRef?.current ?? 0) - hazard.impactAt) / 1000
  ), [hazard.impactAt, timeOffsetRef])

  useFrame(() => {
    const now = Date.now() + (timeOffsetRef?.current ?? 0)
    const fallProgress = THREE.MathUtils.clamp(
      (now - hazard.telegraphAt) / Math.max(1, hazard.impactAt - hazard.telegraphAt),
      0,
      1,
    )
    const falling = fallingRef.current
    if (falling) {
      falling.visible = now < hazard.impactAt
      const eased = fallProgress * fallProgress * (3 - 2 * fallProgress)
      falling.position.x = (launchOrigin[0] - hazard.position[0]) * (1 - eased)
      falling.position.z = (launchOrigin[2] - hazard.position[2]) * (1 - eased)
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
      telegraphRef.current.visible = now < hazard.impactAt
      telegraphRef.current.scale.setScalar(0.9 + telegraphProgress * 0.12)
      telegraphRef.current.material.opacity = 0.26 + telegraphProgress * 0.26
    }
    const impactAge = now - hazard.impactAt
    const impactVisible = impactAge >= 0 && impactAge < PROJECTILE_IMPACT_FLASH_MS
    const progress = impactVisible ? impactAge / PROJECTILE_IMPACT_FLASH_MS : 1
    if (impactRingRef.current) {
      impactRingRef.current.visible = impactVisible
      impactRingRef.current.scale.setScalar(0.25 + progress * hazard.radius)
      impactRingRef.current.material.opacity = (1 - progress) * 0.9
    }
    if (impactFlashRef.current) {
      impactFlashRef.current.visible = impactVisible
      impactFlashRef.current.scale.setScalar(0.45 + progress * 1.5)
      impactFlashRef.current.material.opacity = (1 - progress) * 0.55
    }
  })

  return (
    <group position={[hazard.position[0], surfaceY + 0.055, hazard.position[2]]}>
      <group scale={[groundZoneScale, 1, groundZoneScale]}>
        <ParticleEffect
          preset={groundZonePreset}
          playing
          forceOneShot
          playbackId={hazard.id}
          timeSource={groundZoneTimeSource}
        />
      </group>
      <mesh ref={telegraphRef} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[hazard.radius * 0.78, hazard.radius, 48]} />
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
          playing
          loop
          position={[0, -0.9, 0]}
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
  const fireballPreset = useStoredParticlePreset('fireball_projectile')
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
      if (
        attack?.kind === 'shockwave' &&
        now >= attack.jumpEndsAt &&
        now < attack.jumpEndsAt + 220 &&
        player &&
        shockImpactRef.current !== attack.id
      ) {
        const impactDistance = Math.hypot(player.x - attackOrigin[0], player.z - attackOrigin[2])
        if (impactDistance <= SLIME_BOSS.shockwave.impactRadius) {
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
        const mountFootY = playerMountPositionRef?.current?.y
        const playerFootY = Number.isFinite(mountFootY)
          ? mountFootY
          : player.y - PLAYER_CENTER_TO_FOOT
        const surfaceY = getBossGroundSurface(player.x, player.z, playerFootY)
        const touchesGroundWave = isGroundWaveContact({
          playerCenterY: player.y,
          playerCenterToFoot: PLAYER_CENTER_TO_FOOT,
          mountFootY,
          surfaceY,
          dodgeHeight: SLIME_BOSS.shockwave.dodgeHeight,
        })
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

  if (!spawn || !shockwavePreset || !fireballPreset || !groundZonePreset) return null
  const attackOrigin = bossPosition ?? spawn
  return (
    <>
      <GroundShockwave
        attack={attack}
        origin={attackOrigin}
        timeOffsetRef={timeOffsetRef}
        preset={shockwavePreset}
      />
      {hazards.map((hazard) => (
        <BossProjectileHazard
          key={hazard.id}
          hazard={hazard}
          origin={attackOrigin}
          timeOffsetRef={timeOffsetRef}
          fireballPreset={fireballPreset}
          groundZonePreset={groundZonePreset}
        />
      ))}
    </>
  )
}

const BossMinion = memo(function BossMinion({
  minion,
  playerPositionRef,
  onDamagePlayer,
  onBossHit,
  registerCombatTarget,
  swordEquipped,
  timeOffsetRef,
  preparedScene = null,
}) {
  const url = minion.kind === 'blue' ? SLIME_BOSS.summons.blueModelUrl : SLIME_BOSS.summons.greenModelUrl
  const { scene } = useGLTF(url)
  const cloned = useMemo(() => preparedScene ?? scene.clone(true), [preparedScene, scene])
  const groupRef = useRef(null)
  const summonRingRef = useRef(null)
  const summonGlowRef = useRef(null)
  const lastDamageAtRef = useRef(0)
  const hitRef = useRef(onBossHit)
  const swordRef = useRef(swordEquipped)
  const targetRef = useRef({
    id: minion.id,
    position: { x: minion.position[0], y: minion.position[1], z: minion.position[2] },
    radius: SLIME_BOSS.summons.radius,
    height: 1.1,
    disabled: false,
    takeDamage: (hit) => {
      const damage = getMeleeHitDamage({
        weaponId: swordRef.current ? 'cheat_sword' : null,
        fallbackDamage: hit.damage,
        targetTags: ['slime'],
        charged: Boolean(hit.charged),
      })
      hitRef.current?.({
        ...hit,
        targetId: minion.id,
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
    if (!registerCombatTarget) return undefined
    return registerCombatTarget(minion.id, targetRef.current)
  }, [minion.id, registerCombatTarget])

  useFrame(() => {
    const group = groupRef.current
    const live = useBossStore.getState().minions.find((entry) => entry.id === minion.id)
    if (!group || !live) return
    group.position.x = THREE.MathUtils.damp(group.position.x, live.position[0], 9, 1 / 60)
    group.position.y = live.position[1] + 0.45 + Math.sin(Date.now() / 180 + minion.spawnedPhase) * 0.08
    group.position.z = THREE.MathUtils.damp(group.position.z, live.position[2], 9, 1 / 60)
    targetRef.current.position.x = live.position[0]
    targetRef.current.position.y = live.position[1]
    targetRef.current.position.z = live.position[2]

    const now = Date.now() + (timeOffsetRef?.current ?? 0)
    const summonAge = Math.max(0, now - (live.spawnedAt ?? 0))
    const summonProgress = THREE.MathUtils.clamp(summonAge / 620, 0, 1)
    const easedSummon = 1 - Math.pow(1 - summonProgress, 3)
    group.scale.setScalar(0.55 * Math.max(0.08, easedSummon))
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

    const player = playerPositionRef?.current
    if (!player || now - lastDamageAtRef.current < SLIME_BOSS.summons.attackCooldownMs) return
    if (Math.hypot(player.x - live.position[0], player.z - live.position[2]) <= SLIME_BOSS.summons.radius + 0.65) {
      lastDamageAtRef.current = now
      onDamagePlayer?.({
        damage: SLIME_BOSS.summons.damage,
        sourceId: minion.id,
        attackType: ATTACK_TYPE.DODGEABLE,
      })
    }
  })

  return (
    <group ref={groupRef} position={minion.position} scale={0.55}>
      <primitive object={cloned} />
      <mesh ref={summonGlowRef} position={[0, -0.7, 0]} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <circleGeometry args={[1, 40]} />
        <meshBasicMaterial
          color={minion.kind === 'blue' ? '#38b8ff' : '#6bff75'}
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh ref={summonRingRef} position={[0, -0.68, 0]} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
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
  playerMountPositionRef,
  remotePlayerStateRef,
  localPlayerAlive,
  onDamagePlayer,
  onBossHit,
  registerCombatTarget,
  swordEquipped,
  movementSpeedMultiplierRef,
  timeOffsetRef,
  preparedMinionScenes,
}) {
  const gltf = useGLTF(SLIME_BOSS.modelUrl)
  const groupRef = useRef(null)
  const deathTimeRef = useRef(0)
  const lastSimulationAtRef = useRef(0)
  const spawn = useBossStore((state) => state.spawn)
  const minions = useBossStore((state) => state.minions)
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
    const cloned = gltf.scene.clone(true)
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

  useFrame((_, dt) => {
    const now = Date.now() + (timeOffsetRef?.current ?? 0)
    if (authority && now - lastSimulationAtRef.current >= 100) {
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
    group.position.x = THREE.MathUtils.damp(group.position.x, boss.position[0], 8, dt)
    group.position.y = boss.position[1] + footOffset + bob + jumpOffset
    group.position.z = THREE.MathUtils.damp(group.position.z, boss.position[2], 8, dt)
    if (moving) {
      const targetYaw = Math.atan2(moveDx, moveDz)
      const yawDelta = Math.atan2(
        Math.sin(targetYaw - group.rotation.y),
        Math.cos(targetYaw - group.rotation.y),
      )
      group.rotation.y += yawDelta * (1 - Math.exp(-dt * 8))
    }
    targetRef.current.position.x = boss.position[0]
    targetRef.current.position.y = boss.position[1]
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

  if (!spawn) return null
  return (
    <>
      <group ref={groupRef} position={[spawn[0], spawn[1] + footOffset, spawn[2]]} scale={baseScale}>
        <primitive object={scene} />
        <pointLight color="#ff1f18" intensity={phase === 3 ? 2.2 : 0} distance={8} />
      </group>
      <BossHazards
        playerPositionRef={playerPositionRef}
        playerMountPositionRef={playerMountPositionRef}
        onDamagePlayer={onDamagePlayer}
        movementSpeedMultiplierRef={movementSpeedMultiplierRef}
        timeOffsetRef={timeOffsetRef}
      />
      {minions.map((minion, index) => (
        <BossMinion
          key={minion.id}
          minion={minion}
          playerPositionRef={playerPositionRef}
          onDamagePlayer={onDamagePlayer}
          onBossHit={onBossHit}
          registerCombatTarget={registerCombatTarget}
          swordEquipped={swordEquipped}
          timeOffsetRef={timeOffsetRef}
          preparedScene={preparedMinionScenes[index] ?? null}
        />
      ))}
    </>
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
}) {
  const active = useBossStore((state) => state.active)
  const shockwavePreset = useStoredParticlePreset('slime_shockwave_fire')
  const fireballPreset = useStoredParticlePreset('fireball_projectile')
  const groundZonePreset = useStoredParticlePreset('slime_projectile_zone')
  const greenGltf = useGLTF(SLIME_BOSS.summons.greenModelUrl)
  const blueGltf = useGLTF(SLIME_BOSS.summons.blueModelUrl)
  const preparedMinionScenes = useMemo(() => PREPARED_MINION_KINDS.map((kind) => (
    clonePreparedBossAsset(kind === 'blue' ? blueGltf.scene : greenGltf.scene)
  )), [blueGltf.scene, greenGltf.scene])
  useEffect(() => () => {
    if (movementSpeedMultiplierRef) movementSpeedMultiplierRef.current = 1
  }, [movementSpeedMultiplierRef])

  return (
    <>
      <BossPhasePrewarm
        greenScene={greenGltf.scene}
        blueScene={blueGltf.scene}
        shockwavePreset={shockwavePreset}
        fireballPreset={fireballPreset}
        groundZonePreset={groundZonePreset}
      />
      <AltarProximity placements={placements} playerPositionRef={playerPositionRef} enabled={enabled} />
      {active && (
        <BossModel
          authority={authority}
          playerPositionRef={playerPositionRef}
          playerMountPositionRef={playerMountPositionRef}
          remotePlayerStateRef={remotePlayerStateRef}
          localPlayerAlive={localPlayerAlive}
          onDamagePlayer={onDamagePlayer}
          onBossHit={onBossHit}
          registerCombatTarget={registerCombatTarget}
          swordEquipped={swordEquipped}
          movementSpeedMultiplierRef={movementSpeedMultiplierRef}
          timeOffsetRef={timeOffsetRef}
          preparedMinionScenes={preparedMinionScenes}
        />
      )}
    </>
  )
}

useGLTF.preload(SLIME_BOSS.modelUrl)
useGLTF.preload(SLIME_BOSS.summons.greenModelUrl)
useGLTF.preload(SLIME_BOSS.summons.blueModelUrl)
