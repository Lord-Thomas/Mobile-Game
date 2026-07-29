import { memo, useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { getTerrainHeight } from '../../world/terrain/terrainGeometry'
import { useBossStore } from './bossStore'
import { SLIME_BOSS } from './bossConfig'
import { getBossJumpOffset, getShockwaveRadius } from './bossSimulation'
import { getMeleeHitDamage } from '../meleeWeapons'
import { ATTACK_TYPE } from '../damageTypes'

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

function BossHazards({ playerPositionRef, onDamagePlayer, movementSpeedMultiplierRef, timeOffsetRef }) {
  const hazards = useBossStore((state) => state.hazards)
  const attack = useBossStore((state) => state.attack)
  const spawn = useBossStore((state) => state.spawn)
  const bossPosition = useBossStore((state) => state.position)
  const shockRingRef = useRef(null)
  const fallingRefs = useRef(new Map())
  const poolMaterialRefs = useRef(new Map())
  const damageTimesRef = useRef(new Map())
  const shockImpactRef = useRef(null)
  const shockHitRef = useRef(null)

  useEffect(() => () => {
    if (movementSpeedMultiplierRef) movementSpeedMultiplierRef.current = 1
  }, [movementSpeedMultiplierRef])

  useFrame(() => {
    const now = Date.now() + (timeOffsetRef?.current ?? 0)
    const player = playerPositionRef?.current
    const attackOrigin = bossPosition ?? spawn
    let slowed = false

    if (shockRingRef.current) {
      const radius = getShockwaveRadius(attack, now)
      shockRingRef.current.visible = radius > 0
      shockRingRef.current.scale.set(Math.max(0.001, radius), Math.max(0.001, radius), 1)
      shockRingRef.current.material.opacity = radius > 0 ? 0.18 + 0.5 * (1 - radius / SLIME_BOSS.shockwave.maxRadius) : 0

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
        const airborne = player.y - getTerrainHeight(player.x, player.z) > SLIME_BOSS.shockwave.dodgeHeight
        if (!airborne && Math.abs(distance - radius) < SLIME_BOSS.shockwave.band) {
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
      const poolMaterial = poolMaterialRefs.current.get(hazard.id)
      if (poolMaterial) poolMaterial.opacity = now < hazard.impactAt ? 0.28 : 0.48
      const falling = fallingRefs.current.get(hazard.id)
      if (falling) {
        const progress = Math.max(0, Math.min(1, (now - hazard.telegraphAt) / Math.max(1, hazard.impactAt - hazard.telegraphAt)))
        falling.visible = now < hazard.impactAt
        falling.position.y = hazard.position[1] + 7 * (1 - progress)
      }
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

  if (!spawn) return null
  return (
    <>
      <mesh
        ref={shockRingRef}
        visible={false}
        position={[
          (bossPosition ?? spawn)[0],
          (bossPosition ?? spawn)[1] + 0.08,
          (bossPosition ?? spawn)[2],
        ]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <ringGeometry args={[0.82, 1, 64]} />
        <meshBasicMaterial color="#ff3b30" transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {hazards.map((hazard) => (
        <group key={hazard.id}>
          <mesh position={[hazard.position[0], hazard.position[1] + 0.045, hazard.position[2]]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[hazard.radius, 40]} />
            <meshBasicMaterial
              ref={(node) => {
                if (node) poolMaterialRefs.current.set(hazard.id, node)
                else poolMaterialRefs.current.delete(hazard.id)
              }}
              color="#ff372f"
              transparent
              opacity={0.28}
              depthWrite={false}
            />
          </mesh>
          <mesh
            ref={(node) => {
              if (node) fallingRefs.current.set(hazard.id, node)
              else fallingRefs.current.delete(hazard.id)
            }}
            position={[hazard.position[0], hazard.position[1] + 7, hazard.position[2]]}
          >
            <sphereGeometry args={[0.48, 16, 12]} />
            <meshStandardMaterial color="#e31520" emissive="#7b0000" emissiveIntensity={0.8} roughness={0.55} />
          </mesh>
        </group>
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
}) {
  const url = minion.kind === 'blue' ? SLIME_BOSS.summons.blueModelUrl : SLIME_BOSS.summons.greenModelUrl
  const { scene } = useGLTF(url)
  const cloned = useMemo(() => scene.clone(true), [scene])
  const groupRef = useRef(null)
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

    const player = playerPositionRef?.current
    const now = Date.now() + (timeOffsetRef?.current ?? 0)
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
    </group>
  )
})

function BossModel({
  authority,
  playerPositionRef,
  remotePlayerStateRef,
  localPlayerAlive,
  onDamagePlayer,
  onBossHit,
  registerCombatTarget,
  swordEquipped,
  movementSpeedMultiplierRef,
  timeOffsetRef,
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
        {phase === 3 && <pointLight color="#ff1f18" intensity={2.2} distance={8} />}
      </group>
      <BossHazards
        playerPositionRef={playerPositionRef}
        onDamagePlayer={onDamagePlayer}
        movementSpeedMultiplierRef={movementSpeedMultiplierRef}
        timeOffsetRef={timeOffsetRef}
      />
      {minions.map((minion) => (
        <BossMinion
          key={minion.id}
          minion={minion}
          playerPositionRef={playerPositionRef}
          onDamagePlayer={onDamagePlayer}
          onBossHit={onBossHit}
          registerCombatTarget={registerCombatTarget}
          swordEquipped={swordEquipped}
          timeOffsetRef={timeOffsetRef}
        />
      ))}
    </>
  )
}

export default function SlimeBossSystem({
  placements = [],
  playerPositionRef,
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
  useEffect(() => () => {
    if (movementSpeedMultiplierRef) movementSpeedMultiplierRef.current = 1
  }, [movementSpeedMultiplierRef])

  return (
    <>
      <AltarProximity placements={placements} playerPositionRef={playerPositionRef} enabled={enabled} />
      {active && (
        <BossModel
          authority={authority}
          playerPositionRef={playerPositionRef}
          remotePlayerStateRef={remotePlayerStateRef}
          localPlayerAlive={localPlayerAlive}
          onDamagePlayer={onDamagePlayer}
          onBossHit={onBossHit}
          registerCombatTarget={registerCombatTarget}
          swordEquipped={swordEquipped}
          movementSpeedMultiplierRef={movementSpeedMultiplierRef}
          timeOffsetRef={timeOffsetRef}
        />
      )}
    </>
  )
}

useGLTF.preload(SLIME_BOSS.modelUrl)
useGLTF.preload(SLIME_BOSS.summons.greenModelUrl)
useGLTF.preload(SLIME_BOSS.summons.blueModelUrl)
