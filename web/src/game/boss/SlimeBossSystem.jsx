import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
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

function BossModel() {
  const gltf = useGLTF(SLIME_BOSS.modelUrl)
  const groupRef = useRef(null)
  const deathTimeRef = useRef(0)
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
    const { state } = useBossStore.getState()

    const bob = Math.sin(performance.now() / 1000 * 2) * 0.12
    group.position.set(spawn[0], spawn[1] + footOffset + bob, spawn[2])

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
  })

  if (!spawn) return null

  return (
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
  )
}

export default function SlimeBossSystem({ placements = [], playerPositionRef, enabled = true }) {
  const active = useBossStore((s) => s.active)

  return (
    <>
      <AltarProximity placements={placements} playerPositionRef={playerPositionRef} enabled={enabled} />
      {active && <BossModel />}
    </>
  )
}

useGLTF.preload(SLIME_BOSS.modelUrl)
