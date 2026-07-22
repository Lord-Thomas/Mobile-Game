import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { getTerrainHeight } from '../../world/terrain/terrainGeometry'
import { useBossStore } from './bossStore'
import { SLIME_BOSS } from './bossConfig'

// Système 3D du Boss Slime (monté dans le Canvas extérieur).
// Contient : la détection de proximité des autels (écrit nearAltarId au store) et
// le rendu + l'animation du boss quand il est actif. La logique de jeu (vie, mort)
// vit dans le store ; ici on ne fait que RENDRE l'état + gérer l'anim par frame.
//
// V1 : le boss est statique (bob léger) et prend des dégâts au clic (placeholder en
// attendant la mêlée / l'onde de choc). La mort joue une réduction d'échelle puis
// reset (le boss disparaît, l'autel se déverrouille).

const DEATH_DURATION = 1.0

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

    const p = playerPositionRef.current
    let nearestId = null
    let nearestDistance = SLIME_BOSS.summonRange
    for (const placement of placements) {
      const [x = 0, , z = 0] = placement.position ?? []
      const distance = Math.hypot(p.x - x, p.z - z)
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

function BossModel({ playerPositionRef, onDamagePlayer }) {
  const gltf = useGLTF(SLIME_BOSS.modelUrl)
  const groupRef = useRef(null)
  const ringRef = useRef(null)
  const deathTimeRef = useRef(0)
  const attackRef = useRef({ t: 0, waveHit: false })
  const spawn = useBossStore((s) => s.spawn)

  // Normalise le modèle à la hauteur cible + pose les "pieds" à y=0 (une seule fois).
  const { scene, baseScale, footOffset } = useMemo(() => {
    const cloned = gltf.scene.clone(true)
    const box = new THREE.Box3().setFromObject(cloned)
    const size = new THREE.Vector3()
    box.getSize(size)
    const baseScale = SLIME_BOSS.targetHeight / (size.y || 1)
    return { scene: cloned, baseScale, footOffset: -box.min.y * baseScale }
  }, [gltf])

  useFrame((_, dt) => {
    const group = groupRef.current
    if (!group || !spawn) return
    const { state, phase } = useBossStore.getState()
    const cfg = SLIME_BOSS.shockwave
    const cycle = cfg.telegraphMs + cfg.jumpMs + cfg.shockMs + cfg.recoverMs + cfg.idleGapMs

    let jumpOffset = 0
    let ringRadius = 0
    let ringActive = false

    // --- Machine à états de l'attaque (uniquement quand le boss combat) ---------
    if (state === 'active') {
      const a = attackRef.current
      a.t += dt * 1000 * (SLIME_BOSS.phaseSpeed[phase - 1] ?? 1)
      if (a.t >= cycle) { a.t -= cycle; a.waveHit = false }
      const t = a.t

      if (t < cfg.telegraphMs) {
        // Télégraphe : le boss se ramasse légèrement.
        jumpOffset = -0.25 * Math.sin((t / cfg.telegraphMs) * Math.PI)
      } else if (t < cfg.telegraphMs + cfg.jumpMs) {
        // Bond : parabole up→down.
        const p = (t - cfg.telegraphMs) / cfg.jumpMs
        jumpOffset = cfg.jumpHeight * Math.sin(p * Math.PI)
      } else if (t < cfg.telegraphMs + cfg.jumpMs + cfg.shockMs) {
        // Onde : le front s'étend au sol.
        const p = (t - cfg.telegraphMs - cfg.jumpMs) / cfg.shockMs
        ringRadius = cfg.maxRadius * p
        ringActive = true

        // Détection + dégâts (séparés du visuel) : un seul hit par onde, esquive
        // possible en sautant (hauteur du joueur au moment du passage du front).
        if (!a.waveHit && playerPositionRef?.current && onDamagePlayer) {
          const pp = playerPositionRef.current
          const dist = Math.hypot(pp.x - spawn[0], pp.z - spawn[2])
          const airborne = pp.y - getTerrainHeight(pp.x, pp.z) > cfg.dodgeHeight
          if (!airborne && dist <= cfg.maxRadius && Math.abs(dist - ringRadius) < cfg.band) {
            a.waveHit = true
            onDamagePlayer({ damage: cfg.damage })
          }
        }
      }
    } else {
      attackRef.current.t = 0
      attackRef.current.waveHit = false
    }

    // --- Position / bob / bond / mort ------------------------------------------
    const bob = Math.sin(performance.now() / 1000 * 2) * 0.12
    group.position.set(spawn[0], spawn[1] + footOffset + bob + jumpOffset, spawn[2])

    if (state === 'dying') {
      deathTimeRef.current += dt
      const k = Math.max(0, 1 - deathTimeRef.current / DEATH_DURATION)
      group.scale.setScalar(baseScale * k)
      if (deathTimeRef.current >= DEATH_DURATION) {
        deathTimeRef.current = 0
        useBossStore.getState().reset()
      }
    } else {
      deathTimeRef.current = 0
      group.scale.setScalar(baseScale)
    }

    // --- Anneau de choc (visuel, sibling non impacté par l'échelle du boss) -----
    const ring = ringRef.current
    if (ring) {
      ring.visible = ringActive && state === 'active'
      const r = Math.max(0.001, ringRadius)
      ring.scale.set(r, r, 1)
      ring.material.opacity = ringActive ? 0.15 + 0.55 * (1 - ringRadius / cfg.maxRadius) : 0
    }
  })

  if (!spawn) return null

  return (
    <>
      <group
        ref={groupRef}
        position={[spawn[0], spawn[1] + footOffset, spawn[2]]}
        scale={baseScale}
        onClick={(event) => {
          event.stopPropagation()
          useBossStore.getState().damage(200)
        }}
      >
        <primitive object={scene} />
      </group>
      {/* Onde de choc : anneau plat au sol, échelle animée par useFrame. */}
      <mesh
        ref={ringRef}
        visible={false}
        position={[spawn[0], spawn[1] + 0.08, spawn[2]]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <ringGeometry args={[0.82, 1, 56]} />
        <meshBasicMaterial color="#ff3b30" transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </>
  )
}

export default function SlimeBossSystem({ placements = [], playerPositionRef, onDamagePlayer, enabled = true }) {
  const active = useBossStore((s) => s.active)

  return (
    <>
      <AltarProximity placements={placements} playerPositionRef={playerPositionRef} enabled={enabled} />
      {active && <BossModel playerPositionRef={playerPositionRef} onDamagePlayer={onDamagePlayer} />}
    </>
  )
}

useGLTF.preload(SLIME_BOSS.modelUrl)
