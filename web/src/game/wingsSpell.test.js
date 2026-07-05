import { describe, expect, it } from 'vitest'
import {
  WINGS_CONFIG,
  WINGS_PHASE,
  boostWings,
  canBoostWings,
  canCastWings,
  cancelWings,
  castWings,
  createWingsState,
  getWingsCooldownRemaining,
  getWingsEnergyRatio,
  isWingsFlying,
  stepWings,
} from './wingsSpell'

const DT = 1 / 60

const castOptions = (now = 0, overrides = {}) => ({
  now,
  grounded: true,
  outdoors: true,
  ...overrides,
})

// Simule `seconds` de vol avec un pitch constant, retourne l'altitude nette
// parcourue (somme des vitesses verticales) et le dernier événement.
function simulate(state, { from = 0, seconds, pitch }) {
  let altitude = 0
  let event = 'flying'
  const steps = Math.round(seconds / DT)
  for (let i = 0; i < steps; i++) {
    const now = from + (i + 1) * DT
    event = stepWings(state, { now, dt: DT, pitch, grounded: false })
    if (event !== 'flying') break
    altitude += state.verticalVelocity * DT
  }
  return { altitude, event }
}

describe('canCastWings', () => {
  it('autorise le cast au sol, dehors, sans blocage', () => {
    expect(canCastWings(createWingsState(), castOptions())).toBe(true)
  })

  it('refuse en l’air, en intérieur, sur monture, assis ou occupé', () => {
    expect(canCastWings(createWingsState(), castOptions(0, { grounded: false }))).toBe(false)
    expect(canCastWings(createWingsState(), castOptions(0, { outdoors: false }))).toBe(false)
    expect(canCastWings(createWingsState(), castOptions(0, { mounted: true }))).toBe(false)
    expect(canCastWings(createWingsState(), castOptions(0, { seated: true }))).toBe(false)
    expect(canCastWings(createWingsState(), castOptions(0, { busy: true }))).toBe(false)
  })

  it('refuse pendant le cooldown, ré-autorise après', () => {
    const state = createWingsState()
    castWings(state, castOptions(0))
    stepWings(state, { now: 1, dt: DT, pitch: 0, grounded: true }) // atterrit
    expect(canCastWings(state, castOptions(1.1))).toBe(false)
    expect(canCastWings(state, castOptions(1 + WINGS_CONFIG.cooldown + 0.01))).toBe(true)
  })
})

describe('castWings / lancement', () => {
  it('passe en launching avec une propulsion verticale', () => {
    const state = createWingsState()
    expect(castWings(state, castOptions())).toBe(true)
    expect(state.phase).toBe(WINGS_PHASE.LAUNCHING)
    expect(isWingsFlying(state)).toBe(true)
    expect(state.verticalVelocity).toBe(WINGS_CONFIG.launchSpeed)
  })

  it('refuse le cast si les conditions ne sont pas réunies', () => {
    const state = createWingsState()
    expect(castWings(state, castOptions(0, { grounded: false }))).toBe(false)
    expect(state.phase).toBe(WINGS_PHASE.READY)
  })

  it('monte pendant launchDuration puis bascule en plané', () => {
    const state = createWingsState()
    castWings(state, castOptions(0))
    const { altitude } = simulate(state, { seconds: WINGS_CONFIG.launchDuration, pitch: 0 })
    expect(altitude).toBeGreaterThan(10) // propulsion très haute (~12 m)
    expect(state.phase).toBe(WINGS_PHASE.GLIDING)
  })

  it('ignore le sol pendant la grâce du décollage', () => {
    const state = createWingsState()
    castWings(state, castOptions(0))
    const event = stepWings(state, { now: DT, dt: DT, pitch: 0, grounded: true })
    expect(event).toBe('flying')
    expect(isWingsFlying(state)).toBe(true)
  })
})

describe('plané', () => {
  function glidingState() {
    const state = createWingsState()
    castWings(state, castOptions(0))
    simulate(state, { seconds: WINGS_CONFIG.launchDuration + DT, pitch: 0 })
    return state
  }

  it('à plat : descend toujours, jamais de gain de hauteur', () => {
    const state = glidingState()
    for (let i = 0; i < 120; i++) {
      stepWings(state, { now: 1 + i * DT, dt: DT, pitch: 0, grounded: false })
      expect(state.verticalVelocity).toBeLessThan(0)
    }
  })

  it('piquer accélère et fait chuter plus vite', () => {
    const state = glidingState()
    const flatSink = -WINGS_CONFIG.baseSinkSpeed
    const speedBefore = state.forwardSpeed
    simulate(state, { from: 1, seconds: 1, pitch: WINGS_CONFIG.divePitchRef })
    expect(state.forwardSpeed).toBeGreaterThan(speedBefore)
    expect(state.verticalVelocity).toBeLessThan(flatSink)
  })

  it('la vitesse avant reste bornée [min, max]', () => {
    const state = glidingState()
    simulate(state, { from: 1, seconds: 3, pitch: WINGS_CONFIG.divePitchRef })
    expect(state.forwardSpeed).toBeLessThanOrEqual(WINGS_CONFIG.maxForwardSpeed)
    const state2 = glidingState()
    simulate(state2, { from: 1, seconds: 3, pitch: -WINGS_CONFIG.climbPitchRef })
    expect(state2.forwardSpeed).toBeGreaterThanOrEqual(WINGS_CONFIG.minForwardSpeed)
  })

  it('remonter sans énergie ne donne aucune portance positive', () => {
    const state = glidingState()
    state.energy = 0
    for (let i = 0; i < 60; i++) {
      stepWings(state, { now: 1 + i * DT, dt: DT, pitch: -WINGS_CONFIG.climbPitchRef, grounded: false })
      expect(state.verticalVelocity).toBeLessThan(0)
    }
  })

  it('remonter à vitesse minimale (décrochage) ne donne aucune portance', () => {
    const state = glidingState()
    state.energy = WINGS_CONFIG.maxEnergy
    state.forwardSpeed = WINGS_CONFIG.minForwardSpeed
    stepWings(state, { now: 1, dt: DT, pitch: -WINGS_CONFIG.climbPitchRef, grounded: false })
    expect(state.verticalVelocity).toBeLessThan(0)
  })

  it('piquer puis remonter peut donner une vitesse verticale positive', () => {
    const state = glidingState()
    simulate(state, { from: 1, seconds: 1.5, pitch: WINGS_CONFIG.divePitchRef })
    let sawClimb = false
    for (let i = 0; i < 60; i++) {
      stepWings(state, { now: 3 + i * DT, dt: DT, pitch: -WINGS_CONFIG.climbPitchRef, grounded: false })
      if (state.verticalVelocity > 0) sawClimb = true
    }
    expect(sawClimb).toBe(true)
  })

  it('un cycle piqué + remontée ne crée jamais de hauteur nette', () => {
    const state = glidingState()
    const dive = simulate(state, { from: 1, seconds: 2, pitch: WINGS_CONFIG.divePitchRef })
    const climb = simulate(state, { from: 3.5, seconds: 3, pitch: -WINGS_CONFIG.climbPitchRef })
    expect(dive.altitude + climb.altitude).toBeLessThan(0)
  })

  it('l’énergie reste bornée [0, maxEnergy]', () => {
    const state = glidingState()
    simulate(state, { from: 1, seconds: 4, pitch: WINGS_CONFIG.divePitchRef })
    expect(state.energy).toBeLessThanOrEqual(WINGS_CONFIG.maxEnergy)
    expect(getWingsEnergyRatio(state)).toBeLessThanOrEqual(1)
    simulate(state, { from: 5.5, seconds: 2, pitch: -WINGS_CONFIG.climbPitchRef })
    expect(state.energy).toBeGreaterThanOrEqual(0)
  })

  it('le boost de vol donne de la vitesse et ne peut servir qu une fois', () => {
    const state = glidingState()
    const now = WINGS_CONFIG.launchDuration + WINGS_CONFIG.boostMinDelay + DT
    const speedBefore = state.forwardSpeed
    expect(canBoostWings(state, now)).toBe(true)
    expect(boostWings(state, { now })).toBe(true)
    expect(state.forwardSpeed).toBeGreaterThan(WINGS_CONFIG.maxForwardSpeed)
    stepWings(state, { now, dt: DT, pitch: 0, grounded: false })
    expect(state.verticalVelocity).toBeLessThan(0)
    expect(state.forwardSpeed).toBeGreaterThan(speedBefore)
    const boostedSpeed = state.forwardSpeed
    simulate(state, { from: now, seconds: 1, pitch: 0 })
    expect(state.forwardSpeed).toBeLessThan(boostedSpeed)
    expect(state.forwardSpeed).toBeGreaterThanOrEqual(WINGS_CONFIG.maxForwardSpeed)
    expect(canBoostWings(state, now + DT)).toBe(false)
    expect(boostWings(state, { now: now + DT })).toBe(false)
  })

  it('le boost peut etre converti en altitude en cabrant meme sans energie', () => {
    const state = glidingState()
    state.energy = 0
    const now = WINGS_CONFIG.launchDuration + WINGS_CONFIG.boostMinDelay + DT
    expect(boostWings(state, { now })).toBe(true)
    stepWings(state, { now, dt: DT, pitch: -WINGS_CONFIG.climbPitchRef, grounded: false })
    expect(state.verticalVelocity).toBeGreaterThan(0)
  })
})

describe('fins de vol', () => {
  it('atterrissage : événement landed + cooldown', () => {
    const state = createWingsState()
    castWings(state, castOptions(0))
    const event = stepWings(state, { now: 2, dt: DT, pitch: 0, grounded: true })
    expect(event).toBe('landed')
    expect(state.phase).toBe(WINGS_PHASE.COOLDOWN)
    expect(getWingsCooldownRemaining(state, 2)).toBeCloseTo(WINGS_CONFIG.cooldown)
  })

  it('pas de limite de temps : le vol continue tant que le sol n’est pas touché', () => {
    const state = createWingsState()
    castWings(state, castOptions(0))
    const event = stepWings(state, { now: 120, dt: DT, pitch: 0, grounded: false })
    expect(event).toBe('flying')
    expect(isWingsFlying(state)).toBe(true)
  })

  it('cancelWings coupe le vol et lance le cooldown', () => {
    const state = createWingsState()
    castWings(state, castOptions(0))
    cancelWings(state, 1)
    expect(state.phase).toBe(WINGS_PHASE.COOLDOWN)
    expect(isWingsFlying(state)).toBe(false)
  })

  it('cancelWings est sans effet hors vol', () => {
    const state = createWingsState()
    cancelWings(state, 1)
    expect(state.phase).toBe(WINGS_PHASE.READY)
    expect(state.cooldownUntil).toBe(0)
  })
})
