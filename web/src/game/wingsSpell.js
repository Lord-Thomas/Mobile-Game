// Sort d'ailes magiques « Envol Céleste » : machine à états + physique de plané.
// Logique pure extraite pour être testable (Vitest) ; aucune dépendance React/Three.
//
// Cycle : ready → launching → gliding → cooldown → ready.
// Règle centrale : on ne crée pas de hauteur gratuitement. Piquer (regarder vers
// le bas) charge une énergie ; remonter (regarder vers le haut) dépense cette
// énergie pour un gain de hauteur limité. Sans énergie ou sans vitesse avant,
// remonter ne fait que ralentir la chute — jamais monter.
//
// Convention pitch caméra (cf. Player() dans App.jsx) : pitch POSITIF = caméra
// haute qui regarde vers le bas = piqué. Pitch négatif = regarde vers le haut.

export const WINGS_PHASE = {
  READY: 'ready',
  LAUNCHING: 'launching',
  GLIDING: 'gliding',
  COOLDOWN: 'cooldown',
}

export const WINGS_CONFIG = {
  // Lancement : propulsion verticale au cast. Le saut normal est à 4.9 avec une
  // gravité de 12 — on part nettement plus haut, mais contrôlé (vitesse imposée
  // par frame pendant launchDuration, pas une impulsion balistique).
  // Hauteur gagnée ≈ launchSpeed * launchDuration / 2 ≈ 12 m.
  launchSpeed: 22,
  launchDuration: 1.1,

  // Vitesse avant pendant le plané (unités monde / s). La course max du joueur
  // est ~5.2 : planer à plat va un peu plus vite, piquer va beaucoup plus vite.
  baseForwardSpeed: 6.5,
  minForwardSpeed: 3.5,
  maxForwardSpeed: 14,

  // Verticale pendant le plané.
  baseSinkSpeed: 1.7, // chute douce en vol à plat
  diveAccel: 9, // gain de vitesse avant en piqué complet (u/s²)
  diveFallBonus: 5.5, // chute supplémentaire en piqué complet
  climbDrag: 7, // perte de vitesse avant en montée complète (u/s²)
  climbLift: 3.6, // portance max en montée (doit dépasser baseSinkSpeed)

  // Énergie : chargée en piqué, dépensée en montée. La portance s'estompe quand
  // l'énergie approche de zéro (energyFadeBand) pour éviter une coupure sèche.
  energyGainFromDive: 16,
  energyUseFromClimb: 20,
  maxEnergy: 26,
  energyFadeBand: 4,

  // Normalisation du pitch caméra (radians) vers [0..1]. Le pitch est clampé
  // par ailleurs à [-0.95, +0.62] (PLAYER_CAMERA_PITCH_MIN/MAX).
  divePitchRef: 0.55,
  climbPitchRef: 0.6,

  // Garde-fous. Pas de durée max : le vol ne s'arrête qu'au contact du sol
  // (ou annulation externe : intérieur, monture, respawn).
  cooldown: 18, // s après la fin du vol avant de pouvoir relancer
  landingGraceDelay: 0.25, // s après le cast pendant lesquelles on ignore le sol
}

// État mutable du sort, à garder dans un useRef côté React (mis à jour à 60 Hz,
// jamais dans un useState — cf. PERFORMANCE_NOTES).
export function createWingsState() {
  return {
    phase: WINGS_PHASE.READY,
    startedAt: 0,
    cooldownUntil: 0,
    forwardSpeed: 0,
    verticalVelocity: 0,
    energy: 0,
  }
}

export function isWingsFlying(state) {
  return state.phase === WINGS_PHASE.LAUNCHING || state.phase === WINGS_PHASE.GLIDING
}

// Le cast n'est autorisé qu'au sol, dehors, sans monture ni pose assise ni
// charge de sort en cours. `now` en secondes (clock.elapsedTime).
export function canCastWings(state, { now, grounded, outdoors, mounted = false, seated = false, busy = false }) {
  if (state.phase === WINGS_PHASE.COOLDOWN && now >= state.cooldownUntil) {
    state.phase = WINGS_PHASE.READY
  }
  return (
    state.phase === WINGS_PHASE.READY &&
    grounded &&
    outdoors &&
    !mounted &&
    !seated &&
    !busy
  )
}

// Démarre le vol. Retourne true si le cast a bien eu lieu.
export function castWings(state, options, config = WINGS_CONFIG) {
  if (!canCastWings(state, options)) return false
  state.phase = WINGS_PHASE.LAUNCHING
  state.startedAt = options.now
  state.forwardSpeed = config.baseForwardSpeed * 0.5
  state.verticalVelocity = config.launchSpeed
  state.energy = 0
  return true
}

// Interrompt le vol immédiatement (entrée en intérieur, monture, respawn…)
// et lance le cooldown. Sans effet si le sort n'est pas en vol.
export function cancelWings(state, now, config = WINGS_CONFIG) {
  if (!isWingsFlying(state)) return
  endFlight(state, now, config)
}

function endFlight(state, now, config) {
  state.phase = WINGS_PHASE.COOLDOWN
  state.cooldownUntil = now + config.cooldown
  state.forwardSpeed = 0
  state.verticalVelocity = 0
  state.energy = 0
}

// Avance la simulation d'une frame de vol. À appeler uniquement quand
// isWingsFlying(state). `pitch` est le pitch caméra brut (radians, positif =
// regarde vers le bas). `grounded` = le joueur a touché le sol cette frame.
// Retourne l'événement de la frame : 'flying' | 'landed'.
// Les vitesses à appliquer sont lues dans state.forwardSpeed (le long du
// forward caméra) et state.verticalVelocity.
export function stepWings(state, { now, dt, pitch, grounded }, config = WINGS_CONFIG) {
  const elapsed = now - state.startedAt

  // Contact sol (après la petite grâce du décollage) : fin naturelle du vol.
  if (grounded && elapsed >= config.landingGraceDelay) {
    endFlight(state, now, config)
    return 'landed'
  }

  if (state.phase === WINGS_PHASE.LAUNCHING) {
    // Montée contrôlée : la vitesse verticale décroît linéairement vers 0 sur
    // launchDuration, puis on bascule en plané. Pas de gravité pendant cette
    // phase — la trajectoire est imposée, donc prévisible.
    const progress = Math.min(1, elapsed / config.launchDuration)
    state.verticalVelocity = config.launchSpeed * (1 - progress)
    state.forwardSpeed = Math.min(
      config.baseForwardSpeed,
      state.forwardSpeed + config.baseForwardSpeed * 2 * dt,
    )
    if (progress >= 1) state.phase = WINGS_PHASE.GLIDING
    return 'flying'
  }

  // --- Plané ---
  const diveAmount = clamp01(pitch / config.divePitchRef)
  const climbAmount = clamp01(-pitch / config.climbPitchRef)

  // Vitesse avant : le piqué accélère, la montée freine.
  state.forwardSpeed += diveAmount * config.diveAccel * dt
  state.forwardSpeed -= climbAmount * config.climbDrag * dt
  state.forwardSpeed = Math.min(
    config.maxForwardSpeed,
    Math.max(config.minForwardSpeed, state.forwardSpeed),
  )

  // Énergie : chargée en piqué, dépensée en montée.
  state.energy = Math.min(config.maxEnergy, state.energy + diveAmount * config.energyGainFromDive * dt)
  if (climbAmount > 0) {
    state.energy = Math.max(0, state.energy - climbAmount * config.energyUseFromClimb * dt)
  }

  // Portance en montée : ne vaut plein tarif qu'avec de l'énergie ET de la
  // vitesse avant. À vitesse mini ou réserve vide, remonter ne fait que
  // ralentir la chute, jamais gagner de hauteur.
  const energyScale = clamp01(state.energy / config.energyFadeBand)
  const speedScale = clamp01(
    (state.forwardSpeed - config.minForwardSpeed) /
      (config.baseForwardSpeed - config.minForwardSpeed),
  )
  const lift = climbAmount * config.climbLift * energyScale * speedScale

  state.verticalVelocity =
    -config.baseSinkSpeed - diveAmount * config.diveFallBonus + lift

  return 'flying'
}

// Fraction d'énergie [0..1] pour la jauge UI.
export function getWingsEnergyRatio(state, config = WINGS_CONFIG) {
  return clamp01(state.energy / config.maxEnergy)
}

// Secondes de cooldown restantes (0 si prêt).
export function getWingsCooldownRemaining(state, now) {
  if (state.phase !== WINGS_PHASE.COOLDOWN) return 0
  return Math.max(0, state.cooldownUntil - now)
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value))
}
