import { beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from './gameStore'

// Réinitialise le slice de proximité avant chaque test (le store est un singleton).
beforeEach(() => {
  useGameStore.getState().resetNear()
})

describe('gameStore — slice proximité', () => {
  it('near est vide au départ et un flag absent est falsy', () => {
    expect(useGameStore.getState().near).toEqual({})
    expect(useGameStore.getState().near.lightSwitch).toBeUndefined()
  })

  it('setNear pose puis retire un flag de proximité', () => {
    const { setNear } = useGameStore.getState()
    setNear('lightSwitch', true)
    expect(useGameStore.getState().near.lightSwitch).toBe(true)
    setNear('lightSwitch', false)
    expect(useGameStore.getState().near.lightSwitch).toBe(false)
  })

  it('les flags sont indépendants entre eux', () => {
    const { setNear } = useGameStore.getState()
    setNear('lightSwitch', true)
    setNear('skinStation', true)
    expect(useGameStore.getState().near).toEqual({ lightSwitch: true, skinStation: true })
    setNear('lightSwitch', false)
    expect(useGameStore.getState().near.skinStation).toBe(true)
  })

  it('setNear avec une valeur identique ne crée pas un nouvel objet (pas de rendu inutile)', () => {
    const { setNear } = useGameStore.getState()
    setNear('lightSwitch', true)
    const before = useGameStore.getState().near
    setNear('lightSwitch', true)
    expect(useGameStore.getState().near).toBe(before) // même référence => no-op
  })

  it('resetNear vide tous les flags', () => {
    const { setNear, resetNear } = useGameStore.getState()
    setNear('lightSwitch', true)
    resetNear()
    expect(useGameStore.getState().near).toEqual({})
  })
})
