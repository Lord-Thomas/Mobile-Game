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
  // groupRefs : nœud 3D par id (pour bouger l'objet impérativement).
  const groupRefs = useRef(new Map())
  // animState : état d'animation par id { magnetStart, done }. CRUCIAL : il est
  // découplé du cycle de vie du ref. Le cleanup du ref ne le touche JAMAIS (sinon
  // les toggles de ref de React/StrictMode l'effaceraient en plein vol). Il est
  // purgé en fin de frame selon les drops réellement présents.
  const animState = useRef(new Map())
  const registrarsRef = useRef(new Map())

  // Callback de ref stable par id : ne gère QUE groupRefs. Il ne se supprime pas
  // lui-même de registrarsRef (sinon il redeviendrait instable au rendu suivant).
  const getRegistrar = (id) => {
    let registrar = registrarsRef.current.get(id)
    if (!registrar) {
      registrar = (group) => {
        if (group) groupRefs.current.set(id, group)
        else groupRefs.current.delete(id)
      }
      registrarsRef.current.set(id, registrar)
    }
    return registrar
  }

  useFrame(() => {
    const now = performance.now()
    const player = playerPositionRef?.current
    const liveIds = new Set()

    for (const drop of drops) {
      liveIds.add(drop.id)
      const group = groupRefs.current.get(drop.id)
      if (!group) continue

      let state = animState.current.get(drop.id)
      if (!state) {
        state = { magnetStart: null, done: false }
        animState.current.set(drop.id, state)
      }
      if (state.done) continue

      const [fx, fy, fz] = drop.from
      const restY = fy + 0.3
      const age = now - drop.bornAt
      group.rotation.y = age * 0.003 // rotation lente "loot"

      if (state.magnetStart == null) {
        // --- Au sol : disparition en fin de vie, sinon repos + détection joueur.
        if (age >= LIFETIME_MS) {
          state.done = true
          onExpire?.(drop.id)
          continue
        }
        const remaining = LIFETIME_MS - age
        group.scale.setScalar(remaining < FADE_MS ? Math.max(0, remaining / FADE_MS) : 1)
        group.position.set(fx, restY + Math.sin(age * 0.012) * 0.06, fz)

        // Déclenche l'aimantation seulement si le joueur est assez proche.
        if (player) {
          const distance = Math.hypot(player.x - fx, player.z - fz)
          if (distance < PICKUP_RADIUS) state.magnetStart = now
        }
        continue
      }

      // --- Aimantation vers le joueur jusqu'à absorption.
      if (!player) continue
      const k = Math.min(1, (now - state.magnetStart) / FLY_MS)
      const e = smoothstep(k)
      group.scale.setScalar(1)
      group.position.set(
        fx + (player.x - fx) * e,
        restY + (player.y + 0.7 - restY) * e,
        fz + (player.z - fz) * e,
      )

      if (k >= 1) {
        state.done = true
        onAbsorb?.(drop.id, drop.itemId)
      }
    }

    // Purge l'état/les registrars des drops disparus (anti-fuite mémoire).
    for (const id of animState.current.keys()) {
      if (!liveIds.has(id)) animState.current.delete(id)
    }
    for (const id of registrarsRef.current.keys()) {
      if (!liveIds.has(id)) registrarsRef.current.delete(id)
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
