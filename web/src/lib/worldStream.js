import { useEffect, useState } from 'react'

// Planificateur de "stream" du monde : après la chute de l'overlay, on révèle les
// sous-arbres lourds (ennemis, objets, animaux…) UN PAR FRAME au lieu de tous
// dans le commit initial. Chaque <Defer level={k}> ne monte ses enfants que quand
// le niveau de révélation atteint k.
//
// Pourquoi par requestAnimationFrame et pas requestIdleCallback : le rAF se cale
// naturellement sur la durée réelle de la frame précédente (si monter un ennemi
// prend 250 ms, le prochain rAF ne tire qu'après ces 250 ms). Donc jamais deux
// montages lourds dans la même frame, et la progression continue même thread
// chargé — contrairement à rIC qui était affamé quand le thread restait occupé.

let revealLevel = 0
let running = false
const listeners = new Set()

// Plafond de sécurité : on arrête de tirer des frames une fois tous les niveaux
// utilisés révélés. Largement au-dessus du nombre de sous-arbres différés.
const MAX_LEVEL = 64
const REVEAL_STEP_DELAY_MS = 320

function tick() {
  revealLevel += 1
  listeners.forEach((notify) => {
    try { notify(revealLevel) } catch { /* ignore */ }
  })
  if (revealLevel < MAX_LEVEL) {
    window.setTimeout(tick, REVEAL_STEP_DELAY_MS)
  } else {
    running = false
  }
}

// À appeler quand l'overlay tombe : démarre la révélation progressive.
export function startWorldStream() {
  if (running || revealLevel >= MAX_LEVEL) return
  running = true
  window.setTimeout(tick, REVEAL_STEP_DELAY_MS)
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

function useRevealLevel() {
  const [level, setLevel] = useState(revealLevel)
  useEffect(() => {
    const notify = (value) => setLevel(value)
    listeners.add(notify)
    return () => listeners.delete(notify)
  }, [])
  return level
}

// Monte ses enfants seulement quand le stream atteint `level`. Avant ça : rien
// (donc aucun chargement/clone déclenché, le commit initial reste léger).
export function Defer({ level = 1, children }) {
  const current = useRevealLevel()
  return current >= level ? children : null
}
