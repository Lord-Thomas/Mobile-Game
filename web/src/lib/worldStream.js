import { useEffect, useState } from 'react'

// Planificateur de "stream" du monde : après la chute de l'overlay, on révèle les
// sous-arbres lourds (ennemis, objets, animaux…) UN PAR FRAME au lieu de tous
// dans le commit initial. Chaque <Defer level={k}> ne monte ses enfants que quand
// le niveau de révélation atteint k.
//
// Cadencement par requestAnimationFrame, PAS par un délai fixe : le rAF se cale
// sur le rythme réel de rendu. Si monter un ennemi prend 250 ms, le navigateur ne
// rappelle le rAF qu'après cette frame de 250 ms → jamais deux montages lourds
// collés, et la révélation va aussi vite que la machine le permet (un PC inactif
// révèle en ~16 ms/niveau au lieu d'un plancher artificiel). Un délai plancher
// optionnel (REVEAL_STEP_FLOOR_MS) laisse le navigateur souffler entre deux
// montages sur les machines rapides ; mis à 0 il révèle au rythme du rAF pur.
//
// Repli sur setTimeout si rAF indisponible (onglet en arrière-plan au boot, SSR…).

let revealLevel = 0
let running = false
let fastUntilLevel = 0
const listeners = new Set()

// Plafond de sécurité : on arrête de tirer des frames une fois tous les niveaux
// utilisés révélés. Largement au-dessus du nombre de sous-arbres différés.
const MAX_LEVEL = 64
// Délai plancher entre deux niveaux. Le rAF cadence déjà sur la frame ; ce plancher
// évite juste de tout révéler en 6 frames d'affilée sur une machine très rapide,
// pour étaler la création GPU. Bien plus court que l'ancien 320 ms fixe.
const REVEAL_STEP_FLOOR_MS = 90

export function getWorldStreamStepDelay(level, acceleratedUntilLevel = 0) {
  return level < acceleratedUntilLevel ? 0 : REVEAL_STEP_FLOOR_MS
}

const raf = typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
  ? (cb) => window.requestAnimationFrame(cb)
  : (cb) => window.setTimeout(cb, 16)

function tick() {
  revealLevel += 1
  listeners.forEach((notify) => {
    try { notify(revealLevel) } catch { /* ignore */ }
  })
  if (revealLevel >= MAX_LEVEL) {
    running = false
    return
  }
  // On attend le plancher (souffle GPU) PUIS la prochaine frame : ainsi le montage
  // du niveau suivant tombe en début de frame, jamais à la suite du précédent.
  const stepDelay = getWorldStreamStepDelay(revealLevel, fastUntilLevel)
  if (stepDelay > 0) {
    window.setTimeout(() => raf(tick), stepDelay)
  } else {
    raf(tick)
  }
}

// À appeler quand l'overlay tombe : démarre la révélation progressive.
export function startWorldStream({ acceleratedUntilLevel = 0 } = {}) {
  fastUntilLevel = Math.max(fastUntilLevel, acceleratedUntilLevel)
  if (running || revealLevel >= MAX_LEVEL) return
  running = true
  raf(tick)
}

export function getRevealLevel() {
  return revealLevel
}

export function waitForRevealLevel(targetLevel, timeoutMs = 6000) {
  if (revealLevel >= targetLevel) return Promise.resolve({ ready: true })

  return new Promise((resolve) => {
    let settled = false
    let timeoutId = 0

    const finish = (ready) => {
      if (settled) return
      settled = true
      listeners.delete(notify)
      if (timeoutId) window.clearTimeout(timeoutId)
      resolve({ ready })
    }

    const notify = (value) => {
      if (value >= targetLevel) finish(true)
    }

    listeners.add(notify)
    timeoutId = window.setTimeout(() => finish(false), timeoutMs)
  })
}

function useRevealReady(targetLevel) {
  const [ready, setReady] = useState(() => revealLevel >= targetLevel)

  useEffect(() => {
    if (ready) return undefined
    if (revealLevel >= targetLevel) {
      const timeoutId = window.setTimeout(() => setReady(true), 0)
      return () => window.clearTimeout(timeoutId)
    }

    const notify = (value) => {
      if (value < targetLevel) return
      listeners.delete(notify)
      setReady(true)
    }
    listeners.add(notify)
    return () => listeners.delete(notify)
  }, [ready, targetLevel])

  return ready
}

// Monte ses enfants seulement quand le stream atteint `level`. Avant ça : rien
// (donc aucun chargement/clone déclenché, le commit initial reste léger).
export function Defer({ level = 1, children }) {
  const ready = useRevealReady(level)
  return ready ? children : null
}
