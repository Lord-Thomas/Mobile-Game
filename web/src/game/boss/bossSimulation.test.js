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
  it('équilibre le Roi Slime à 1 000 PV', () => {
    expect(SLIME_BOSS.maxHp).toBe(1000)
  })

  it('utilise les dégâts réduits pour toutes les attaques du boss', () => {
    expect(SLIME_BOSS.shockwave.impactDamage).toBe(16)
    expect(SLIME_BOSS.shockwave.damage).toBe(12)
    expect(SLIME_BOSS.projectile.impactDamage).toBe(10)
    expect(SLIME_BOSS.projectile.poolDamage).toBe(3)
    expect(SLIME_BOSS.summons.damage).toBe(5)
  })

  it('reprend la taille des slimes vert et bleu réellement présents sur la carte', () => {
    expect(SLIME_BOSS.summons.sizeScaleByKind.green).toBe(0.6)
    expect(SLIME_BOSS.summons.sizeScaleByKind.blue).toBe(0.95)
  })

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
    expect(state.minions.every((minion) => minion.spawnedAt === 1700)).toBe(true)
    state = stepBoss(state, { now: 1800, dt: 0.1, players: [player] })
    expect(state.minions).toHaveLength(phase2Count)

    state = damageBoss(state, SLIME_BOSS.maxHp * 0.3, { now: 1900 })
    state = stepBoss(state, { now: 2000, dt: 0.1, players: [player] })
    expect(state.minions.length).toBeGreaterThan(phase2Count)
    expect(state.summonedPhases).toEqual([2, 3])
    expect(state.minions.map((minion) => minion.slot)).toEqual([0, 1, 2, 3, 4])

    for (let index = 0; index < 80; index += 1) {
      state = stepBoss(state, { now: 2100 + index * 100, dt: 0.1, players: [player] })
    }
    const occupied = new Set(state.minions.map((minion) => (
      `${minion.position[0].toFixed(2)}:${minion.position[2].toFixed(2)}`
    )))
    expect(occupied.size).toBe(state.minions.length)
    state.minions.forEach((minion) => {
      const distanceToBoss = Math.hypot(
        minion.position[0] - state.position[0],
        minion.position[2] - state.position[2],
      )
      expect(distanceToBoss).toBeGreaterThanOrEqual(
        SLIME_BOSS.melee.hitRadius + SLIME_BOSS.summons.radius - 0.001,
      )
    })
    for (let left = 0; left < state.minions.length; left += 1) {
      for (let right = left + 1; right < state.minions.length; right += 1) {
        const distance = Math.hypot(
          state.minions[left].position[0] - state.minions[right].position[0],
          state.minions[left].position[2] - state.minions[right].position[2],
        )
        expect(distance).toBeGreaterThanOrEqual(SLIME_BOSS.summons.radius * 2 - 0.01)
      }
    }
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

  it('attribue des emplacements stables aux projectiles pour reutiliser le pool VFX', () => {
    let state = summonBoss(createInactiveBossState(), { altarId: 'a', spawn: [0, 0, 0], now: 0 })
    state = damageBoss(state, SLIME_BOSS.maxHp * 0.45, { now: 10 })
    state = stepBoss(state, { now: 1700, dt: 0.1, players: [player] })

    expect(state.attack?.kind).toBe('projectiles')
    expect(state.hazards).toHaveLength(SLIME_BOSS.projectile.countByPhase[1])
    expect(state.hazards.map((hazard) => hazard.slot)).toEqual([0, 1, 2])

    const unchanged = stepBoss(state, { now: 1800, dt: 0.1, players: [player] })
    expect(unchanged.hazards.map((hazard) => hazard.slot)).toEqual([0, 1, 2])
  })

  it('sépare l’impact esquivable du bond et l’onde à sauter', () => {
    expect(SLIME_BOSS.shockwave.impactDamage).toBeGreaterThan(0)
    expect(SLIME_BOSS.shockwave.impactRadius).toBeGreaterThan(0)
    expect(SLIME_BOSS.shockwave.dodgeHeight).toBeGreaterThan(0)
  })

  it('ne désinvoque jamais le boss lorsque les joueurs s’éloignent', () => {
    let state = summonBoss(createInactiveBossState(), { altarId: 'a', spawn: [0, 0, 0], now: 0 })
    const distantPlayer = { ...player, position: [120, 0.9, 120] }
    state = stepBoss(state, { now: 30_000, dt: 0.1, players: [distantPlayer] })
    expect(state.active).toBe(true)
    expect(state.resetReason).toBeNull()
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

  it('considère les dégâts aux slimes invoqués comme une activité de combat', () => {
    let state = summonBoss(createInactiveBossState(), { altarId: 'a', spawn: [0, 0, 0], now: 0 })
    state = damageBoss(state, SLIME_BOSS.maxHp * 0.45, { now: 10 })
    state = stepBoss(state, { now: 1700, dt: 0.1, players: [player] })
    state = damageBossMinion(state, state.minions[0].id, 5, { now: 59_000 })
    state = stepBoss(state, { now: 60_001, dt: 0.1, players: [player] })

    expect(state.active).toBe(true)
    expect(state.lastDamagedAt).toBe(59_000)
  })

  it('poursuit un joueur au-delà de l’ancienne limite d’arène', () => {
    let state = summonBoss(createInactiveBossState(), { altarId: 'a', spawn: [0, 0, 0], now: 0 })
    const distantPlayer = { ...player, position: [0, 0.9, 120] }
    for (let now = 1700; now < 20_000; now += 100) {
      state = stepBoss(state, { now, dt: 0.1, players: [distantPlayer] })
    }

    expect(state.position[2]).toBeGreaterThan(18)
    expect(state.active).toBe(true)
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

  it('recalcule la hauteur du boss et de ses invocations depuis la topologie du sol', () => {
    const getGroundHeight = (x, z) => 1.5 + x * 0.08 + z * 0.04
    let state = summonBoss(createInactiveBossState(), { altarId: 'a', spawn: [0, 0, 0], now: 0 })
    state = damageBoss(state, SLIME_BOSS.maxHp * 0.45, { now: 10 })
    state = stepBoss(state, {
      now: 1700,
      dt: 0.1,
      players: [{ ...player, position: [0, 2, 12] }],
      getGroundHeight,
    })

    expect(state.position[1]).toBeCloseTo(
      getGroundHeight(state.position[0], state.position[2]),
      5,
    )
    expect(state.minions.length).toBeGreaterThan(0)
    state.minions.forEach((minion) => {
      expect(minion.position[1]).toBeCloseTo(
        getGroundHeight(minion.position[0], minion.position[2]),
        5,
      )
    })
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
