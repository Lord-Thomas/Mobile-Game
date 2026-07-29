import { describe, expect, it } from 'vitest'
import { SLIME_BOSS } from './bossConfig'
import {
  createInactiveBossState,
  damageBoss,
  damageBossMinion,
  getShockwaveRadius,
  stepBoss,
  summonBoss,
} from './bossSimulation'

const player = { id: 'p1', alive: true, position: [0, 0.9, 4] }

describe('bossSimulation', () => {
  it('refuse une double invocation et démarre avec tous ses PV', () => {
    const first = summonBoss(createInactiveBossState(), { altarId: 'a', spawn: [0, 0, 0], now: 100 })
    const second = summonBoss(first, { altarId: 'b', spawn: [4, 0, 4], now: 200 })
    expect(second).toBe(first)
    expect(first.hp).toBe(SLIME_BOSS.maxHp)
    expect(first.altarId).toBe('a')
  })

  it('déclenche chaque vague de slimes une seule fois aux phases 2 et 3', () => {
    let state = summonBoss(createInactiveBossState(), { altarId: 'a', spawn: [0, 0, 0], now: 0 })
    state = damageBoss(state, SLIME_BOSS.maxHp * 0.45, { now: 10 })
    state = stepBoss(state, { now: 1700, dt: 0.1, players: [player] })
    const phase2Count = state.minions.length
    state = stepBoss(state, { now: 1800, dt: 0.1, players: [player] })
    expect(state.minions).toHaveLength(phase2Count)

    state = damageBoss(state, SLIME_BOSS.maxHp * 0.3, { now: 1900 })
    state = stepBoss(state, { now: 2000, dt: 0.1, players: [player] })
    expect(state.minions.length).toBeGreaterThan(phase2Count)
    expect(state.summonedPhases).toEqual([2, 3])
  })

  it('permet de blesser puis éliminer un slime invoqué', () => {
    let state = summonBoss(createInactiveBossState(), { altarId: 'a', spawn: [0, 0, 0], now: 0 })
    state = damageBoss(state, SLIME_BOSS.maxHp * 0.45, { now: 10 })
    state = stepBoss(state, { now: 1700, dt: 0.1, players: [player] })
    const minion = state.minions[0]
    state = damageBossMinion(state, minion.id, 10)
    expect(state.minions[0].hp).toBe(minion.maxHp - 10)
    state = damageBossMinion(state, minion.id, minion.maxHp)
    expect(state.minions.some((entry) => entry.id === minion.id)).toBe(false)
  })

  it('produit une onde dont le rayon progresse dans sa fenêtre active', () => {
    let state = summonBoss(createInactiveBossState(), { altarId: 'a', spawn: [0, 0, 0], now: 0 })
    state = stepBoss(state, { now: 1700, dt: 0.1, players: [player] })
    expect(state.attack?.kind).toBe('shockwave')
    const middle = (state.attack.jumpEndsAt + state.attack.activeEndsAt) / 2
    expect(getShockwaveRadius(state.attack, middle)).toBeCloseTo(SLIME_BOSS.shockwave.maxRadius / 2, 3)
  })

  it('sépare l’impact esquivable du bond et l’onde à sauter', () => {
    expect(SLIME_BOSS.shockwave.impactDamage).toBeGreaterThan(0)
    expect(SLIME_BOSS.shockwave.impactRadius).toBeGreaterThan(0)
    expect(SLIME_BOSS.shockwave.dodgeHeight).toBeGreaterThan(0)
  })

  it('réinitialise un combat abandonné et nettoie ses entités', () => {
    let state = summonBoss(createInactiveBossState(), { altarId: 'a', spawn: [0, 0, 0], now: 0 })
    state = stepBoss(state, { now: SLIME_BOSS.resetAfterMs + 1, dt: 0.1, players: [] })
    expect(state.active).toBe(false)
    expect(state.resetReason).toBe('abandoned')
    expect(state.hazards).toEqual([])
    expect(state.minions).toEqual([])
  })

  it('réinitialise immédiatement lorsque tous les joueurs connus sont morts', () => {
    let state = summonBoss(createInactiveBossState(), { altarId: 'a', spawn: [0, 0, 0], now: 0 })
    state = stepBoss(state, {
      now: 100,
      dt: 0.1,
      players: [{ ...player, alive: false }],
    })
    expect(state.active).toBe(false)
    expect(state.resetReason).toBe('all-dead')
  })

  it('désinvoque le boss après une minute complète sans dégâts reçus', () => {
    let state = summonBoss(createInactiveBossState(), { altarId: 'a', spawn: [0, 0, 0], now: 100 })
    state = stepBoss(state, {
      now: 100 + SLIME_BOSS.noDamageResetMs - 1,
      dt: 0.1,
      players: [player],
    })
    expect(state.active).toBe(true)

    state = stepBoss(state, {
      now: 100 + SLIME_BOSS.noDamageResetMs,
      dt: 0.1,
      players: [player],
    })
    expect(state.active).toBe(false)
    expect(state.resetReason).toBe('no-damage')
  })

  it('repousse le délai de désinvocation lorsque le boss reçoit un coup', () => {
    let state = summonBoss(createInactiveBossState(), { altarId: 'a', spawn: [0, 0, 0], now: 0 })
    state = damageBoss(state, 10, { now: 50_000 })
    state = stepBoss(state, {
      now: 60_001,
      dt: 0.1,
      players: [player],
    })

    expect(state.active).toBe(true)
    expect(state.lastDamagedAt).toBe(50_000)
  })

  it('se rapproche du joueur avec une vitesse adaptée à son gabarit', () => {
    let state = summonBoss(createInactiveBossState(), { altarId: 'a', spawn: [0, 0, 0], now: 0 })
    state = stepBoss(state, {
      now: 1700,
      dt: 0.1,
      players: [{ ...player, position: [0, 0.9, 12] }],
    })

    expect(state.position[2]).toBeGreaterThan(0.2)
    expect(SLIME_BOSS.melee.hitRadius).toBeGreaterThan(SLIME_BOSS.targetHeight * 0.5)
  })

  it('passe par dying puis reset après la mort', () => {
    let state = summonBoss(createInactiveBossState(), { altarId: 'a', spawn: [0, 0, 0], now: 0 })
    state = damageBoss(state, SLIME_BOSS.maxHp, { now: 100 })
    expect(state.state).toBe('dying')
    expect(state.victoryId).toBeTruthy()
    state = stepBoss(state, { now: state.dyingEndsAt + 1, players: [player] })
    expect(state.active).toBe(false)
    expect(state.resetReason).toBe('defeated')
  })
})
