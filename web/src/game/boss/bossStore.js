import { create } from 'zustand'
import { SLIME_BOSS, hpToPhase } from './bossConfig'

// Store dédié au boss (convention "plusieurs stores par domaine", cf. useGameStore).
// N'y met QUE de l'état événementiel (vie, phase, état de combat, proximité autel).
// La POSITION/animation temps réel du boss reste en useRef+useFrame côté composant.
//
// Autorité (ADR 0002) : en solo, ce store EST la source de vérité locale. En multi,
// seul l'hôte le mute et diffuse l'état ; l'invité le reçoit et rend. La forme du
// state est donc volontairement sérialisable et pilotée par des actions pures.
export const useBossStore = create((set) => ({
  active: false,
  state: 'idle', // 'idle' | 'active' | 'dying' | 'dead'
  hp: 0,
  maxHp: SLIME_BOSS.maxHp,
  phase: 1,
  altarId: null,
  spawn: null, // [x, y, z] point d'apparition (sol)
  nearAltarId: null, // proximité d'un autel invocable (écrit depuis useFrame)

  setNearAltar: (id) => set((s) => (s.nearAltarId === id ? s : { nearAltarId: id })),

  // Invocation. Idempotente : ignore si un boss est déjà actif (anti double-invocation).
  summon: ({ altarId, spawn }) => set((s) => (
    s.active
      ? s
      : {
          active: true,
          state: 'active',
          hp: SLIME_BOSS.maxHp,
          maxHp: SLIME_BOSS.maxHp,
          phase: 1,
          altarId,
          spawn,
        }
  )),

  // Application de dégâts (V1 : local ; en multi ce sera l'autorité qui l'appelle).
  damage: (amount) => set((s) => {
    if (s.state !== 'active') return s
    const hp = Math.max(0, s.hp - Math.max(0, amount))
    if (hp <= 0) return { hp: 0, phase: 3, state: 'dying' }
    return { hp, phase: hpToPhase(hp, s.maxHp) }
  }),

  // Fin de l'animation de mort → boss retiré, autel réutilisable.
  reset: () => set({
    active: false,
    state: 'idle',
    hp: 0,
    phase: 1,
    altarId: null,
    spawn: null,
  }),
}))
