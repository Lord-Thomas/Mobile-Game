import { Suspense, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html, useGLTF } from '@react-three/drei'
import { Box3, Mesh, Vector3 } from 'three'
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { ITEMS, getItemDefinition } from '../../items/itemDefinitions'

// Objets lootés qui tombent au sol puis sont aimantés vers le joueur ("absorbés").
// Perf : animation pilotée par refs dans un seul useFrame (aucun setState par
// frame) ; les drops s'absorbent en ~0,8 s donc il y en a très peu à l'écran.
// Les modèles 3D sont préchargés une fois (bas) puis clonés par instance.

const REST_MS = 320 // temps de repos au sol avant aimantation
const FLY_MS = 460 // durée de l'aimantation vers le joueur
const DROP_TARGET_SIZE = 0.5 // taille normalisée (unités monde) de tout objet au sol

function smoothstep(t) {
  return t * t * (3 - 2 * t)
}

// Charge + clone + normalise la taille d'un modèle GLB d'objet.
function LootDropModel({ url }) {
  const { scene } = useGLTF(url)
  const model = useMemo(() => {
    const object = clone(scene)
    object.traverse((child) => {
      if (child instanceof Mesh) {
        child.castShadow = false
        child.receiveShadow = false
      }
    })
    const box = new Box3().setFromObject(object)
    const size = box.getSize(new Vector3())
    const center = box.getCenter(new Vector3())
    const scale = DROP_TARGET_SIZE / Math.max(size.x, size.y, size.z, 0.001)
    return { object, scale, center }
  }, [scene])

  return (
    <group scale={model.scale}>
      <primitive object={model.object} position={[-model.center.x, -model.center.y, -model.center.z]} />
    </group>
  )
}

function LootDropVisual({ def }) {
  if (def?.model) {
    return (
      <Suspense fallback={null}>
        <LootDropModel url={def.model} />
      </Suspense>
    )
  }
  return (
    <Html center distanceFactor={8} occlude={false}>
      <div className="loot-drop">{def?.emoji ?? '📦'}</div>
    </Html>
  )
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
      group.rotation.y = age * 0.003 // rotation lente "loot"

      if (age < REST_MS) {
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
      {drops.map((drop) => (
        <group key={drop.id} ref={(group) => register(drop.id, group)} position={drop.from}>
          <LootDropVisual def={getItemDefinition(drop.itemId)} />
        </group>
      ))}
    </>
  )
}

// Précharge les modèles d'objets une seule fois.
Object.values(ITEMS).forEach((item) => {
  if (item.model) useGLTF.preload(item.model)
})
