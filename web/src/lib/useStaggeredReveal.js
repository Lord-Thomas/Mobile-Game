import { useEffect, useRef, useState } from 'react'

// Révèle une liste progressivement, quelques éléments par "tick" d'inactivité,
// APRÈS le premier paint.
//
// Pourquoi : monter d'un coup un gros lot de composants lourds (clone GLTF/FBX,
// skinning, colliders) dans le commit initial gèle le main thread pendant
// plusieurs secondes (cf. les ~110 long tasks au chargement) ET garde l'overlay
// ouvert tant que le dernier objet n'a pas commité. En étalant le montage, le
// commit initial reste léger (le gate se débloque tôt) et les objets "popent"
// sur ~1-2 s pendant que le monde est déjà jouable.
//
// - `active=false` court-circuite tout : la liste entière est rendue
//   immédiatement (mode édition, où le pop-in n'est pas souhaitable).
// - `batchSize` = nombre d'éléments révélés par tick.
// - On préfère requestIdleCallback (montage uniquement quand le navigateur a du
//   budget → jank minimal), avec repli sur requestAnimationFrame.
//
// Le compteur est MONOTONE (jamais remis à zéro tant que `active` reste vrai) :
// si la liste grandit en cours de route — typiquement la réconciliation de la
// sauvegarde cloud — on continue la révélation à partir du point atteint au lieu
// de tout démonter/remonter (ce qui re-bloquerait le thread). Les éléments déjà
// révélés gardent leur position (la liste grandit par ajout en fin).
export function useStaggeredReveal(items, { active = true, batchSize = 2 } = {}) {
  const total = items.length
  const [count, setCount] = useState(() => (active ? 0 : total))
  const countRef = useRef(count)
  countRef.current = count

  useEffect(() => {
    if (!active) {
      setCount(total)
      return undefined
    }
    if (countRef.current >= total) return undefined

    let cancelled = false
    let handle = 0

    const schedule = typeof window.requestIdleCallback === 'function'
      ? (cb) => window.requestIdleCallback(cb, { timeout: 64 })
      : (cb) => window.requestAnimationFrame(cb)
    const cancel = typeof window.cancelIdleCallback === 'function'
      ? (h) => window.cancelIdleCallback(h)
      : (h) => window.cancelAnimationFrame(h)

    const step = () => {
      if (cancelled) return
      const next = Math.min(total, countRef.current + batchSize)
      countRef.current = next
      setCount(next)
      if (next < total) handle = schedule(step)
    }
    handle = schedule(step)

    return () => {
      cancelled = true
      if (handle) cancel(handle)
    }
  }, [active, total, batchSize])

  return active ? items.slice(0, Math.min(count, total)) : items
}
