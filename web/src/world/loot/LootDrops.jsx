import { Suspense, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html, useGLTF } from '@react-three/drei'
import { Box3, Mesh, Vector3 } from 'three'
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { ITEMS, getItemDefinition } from '../../items/itemDefinitions'

// Objets lootés qui tombent au sol et y restent. Ils ne sont aimantés/absorbés
// QUE si le joueur s'approche (PICKUP_RADIUS) ; sinon ils restent au sol pendant
// LIFETIME_MS puis disparaissent (avec un fondu en fin de vie).
// Perf : animation pilotée par refs dans un seul useFrame (aucun setState/frame) ;
// modèles 3D préchargés une fois (bas) puis clonés par instance.

const PICKUP_RADIUS = 2.0 // distance (unités monde) à laquelle le joueur aspire l'objet
const FLY_MS = 360 // durée de l'aimantation une fois déclenchée
const LIFETIME_MS = 30000 // durée au sol avant disparition
const FADE_MS = 900 // fondu de sortie en fin de vie
const DROP_TARGET_SIZE = 0.25 // taille normalisée (unités monde) de tout objet au sol

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

export default function LootDrops({ drops = [], playerPositionRef, onAbsorb, onExpire }) {
  const groupRefs = useRef(new Map())
  const doneRef = useRef(new Set()) // drops absorbés/expirés (anti double-traitement)
  const magnetStartRef = useRef(new Map()) // id -> timestamp du déclenchement de l'aimantation
  const registrarsRef = useRef(new Map()) // callbacks de ref STABLES par id

  // IMPORTANT : un callback de ref inline est recréé à chaque rendu, ce qui pousse
  // React à appeler le cleanup (group=null) à CHAQUE re-render du parent — ici très
  // fréquent — effaçant l'état d'aimantation. On mémorise donc un callback stable
  // par id : le cleanup ne se déclenche alors qu'au vrai démontage de l'objet.
  const getRegistrar = (id) => {
    let registrar = registrarsRef.current.get(id)
    if (!registrar) {
      registrar = (group) => {
        if (group) {
          groupRefs.current.set(id, group)
        } else {
          groupRefs.current.delete(id)
          doneRef.current.delete(id)
          magnetStartRef.current.delete(id)
          registrarsRef.current.delete(id)
        }
      }
      registrarsRef.current.set(id, registrar)
    }
    return registrar
  }

  useFrame(() => {
    const now = performance.now()
    const player = playerPositionRef?.current
    for (const drop of drops) {
      const group = groupRefs.current.get(drop.id)
      if (!group || doneRef.current.has(drop.id)) continue
      const [fx, fy, fz] = drop.from
      const restY = fy + 0.3
      const age = now - drop.bornAt
      group.rotation.y = age * 0.003 // rotation lente "loot"

      const magnetStart = magnetStartRef.current.get(drop.id)

      if (magnetStart == null) {
        // --- Au sol : disparition en fin de vie, sinon repos + détection joueur.
        if (age >= LIFETIME_MS) {
          doneRef.current.add(drop.id)
          onExpire?.(drop.id)
          continue
        }
        const remaining = LIFETIME_MS - age
        group.scale.setScalar(remaining < FADE_MS ? Math.max(0, remaining / FADE_MS) : 1)
        group.position.set(fx, restY + Math.sin(age * 0.012) * 0.06, fz)

        // Déclenche l'aimantation seulement si le joueur est assez proche.
        if (player) {
          const distance = Math.hypot(player.x - fx, player.z - fz)
          if (distance < PICKUP_RADIUS) magnetStartRef.current.set(drop.id, now)
        }
        continue
      }

      // --- Aimantation vers le joueur jusqu'à absorption.
      if (!player) continue
      const k = Math.min(1, (now - magnetStart) / FLY_MS)
      const e = smoothstep(k)
      group.scale.setScalar(1)
      group.position.set(
        fx + (player.x - fx) * e,
        restY + (player.y + 0.7 - restY) * e,
        fz + (player.z - fz) * e,
      )

      if (k >= 1) {
        doneRef.current.add(drop.id)
        onAbsorb(drop.id, drop.itemId)
      }
    }
  })

  return (
    <>
      {drops.map((drop) => (
        <group key={drop.id} ref={getRegistrar(drop.id)} position={drop.from}>
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
