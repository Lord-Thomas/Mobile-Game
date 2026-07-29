import { create } from 'zustand'
import {
  createInactiveBossState,
  damageBoss,
  damageBossMinion,
  resetBoss,
  sanitizeBossSnapshot,
  stepBoss,
  summonBoss,
} from './bossSimulation'

const initialState = createInactiveBossState()

export const useBossStore = create((set, get) => ({
  ...initialState,
  nearAltarId: null,

  setNearAltar: (id) => set((state) => (state.nearAltarId === id ? state : { nearAltarId: id })),

  summon: (payload) => {
    const previous = get()
    const next = summonBoss(previous, payload)
    if (next !== previous) set(next)
    return next.active
  },

  damage: (amount, options) => {
    const previous = get()
    const next = damageBoss(previous, amount, options)
    if (next !== previous) set(next)
    return next.hp < previous.hp
  },

  damageMinion: (minionId, amount) => {
    const previous = get()
    const next = damageBossMinion(previous, minionId, amount)
    if (next !== previous) set(next)
    return next !== previous
  },

  step: (inputs) => {
    const previous = get()
    const next = stepBoss(previous, inputs)
    if (next !== previous) set(next)
    return next
  },

  applySnapshot: (snapshot) => {
    const safe = sanitizeBossSnapshot(snapshot)
    if (!safe) return false
    set(safe)
    return true
  },

  reset: (reason = 'manual') => set((state) => resetBoss(state, reason)),
}))

export function createBossNetworkSnapshot(state = useBossStore.getState()) {
  const {
    version,
    revision,
    active,
    state: combatState,
    hp,
    maxHp,
    phase,
    altarId,
    spawn,
    position,
    attack,
    nextAttackAt,
    attackSequence,
    hazards,
    minions,
    summonedPhases,
    lastPlayerInArenaAt,
    lastDamagedAt,
    dyingEndsAt,
    victoryId,
    resetReason,
    stuckSince,
  } = state
  return {
    version,
    revision,
    active,
    state: combatState,
    hp,
    maxHp,
    phase,
    altarId,
    spawn,
    position,
    attack,
    nextAttackAt,
    attackSequence,
    hazards,
    minions,
    summonedPhases,
    lastPlayerInArenaAt,
    lastDamagedAt,
    dyingEndsAt,
    victoryId,
    resetReason,
    stuckSince,
  }
}
