import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { getItemDefinition } from '../../items/itemDefinitions'

// Objets lootés qui tombent au sol puis sont aimantés vers le joueur ("absorbés").
// Perf : animation pilotée par refs dans un seul useFrame (aucun setState par
// frame) ; les drops s'absorbent en ~0,8 s donc il y en a très peu à l'écran.
//
// Visuel : emoji par défaut (aucun asset requis). Pour utiliser tes modèles 3D,
// ajoute `dropModelUrl` dans itemDefinitions.js et branche un rendu GLB ici
// (préchargé + cloné) — la mécanique d'aimantation reste identique.

const REST_MS = 320 // temps de repos au sol avant aimantation
const FLY_MS = 460 // durée de l'aimantation vers le joueur

function smoothstep(t) {
  return t * t * (3 - 2 * t)
}

export default function LootDrops({ drops = [], playerPositionRef, onAbsorb }) {
  const groupRefs = useRef(new Map())
  const absorbedRef = useRef(new Set())

  const register = (id, group) => {
    if (group) {
      groupRefs.current.set(id, group)
    } else {
      groupRefs.current.delete(id)
      absorbedRef.current.delete(id)
    }
  }

  useFrame(() => {
    const now = performance.now()
    const player = playerPositionRef?.current
    for (const drop of drops) {
      const group = groupRefs.current.get(drop.id)
      if (!group || absorbedRef.current.has(drop.id)) continue
      const [fx, fy, fz] = drop.from
      const restY = fy + 0.3
      const age = now - drop.bornAt

      if (age < REST_MS) {
        // Petit rebond au sol.
        group.position.set(fx, restY + Math.sin(age * 0.012) * 0.06, fz)
        continue
      }
      if (!player) continue

      const k = Math.min(1, (age - REST_MS) / FLY_MS)
      const e = smoothstep(k)
      group.position.set(
        fx + (player.x - fx) * e,
        restY + (player.y + 0.7 - restY) * e,
        fz + (player.z - fz) * e,
      )

      if (k >= 1) {
        absorbedRef.current.add(drop.id)
        onAbsorb(drop.id, drop.itemId)
      }
    }
  })

  return (
    <>
      {drops.map((drop) => {
        const def = getItemDefinition(drop.itemId)
        return (
          <group key={drop.id} ref={(group) => register(drop.id, group)} position={drop.from}>
            <Html center distanceFactor={8} occlude={false}>
              <div className="loot-drop">{def?.emoji ?? '📦'}</div>
            </Html>
          </group>
        )
      })}
    </>
  )
}
