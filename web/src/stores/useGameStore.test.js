import { beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from './useGameStore'

// Réinitialise les slices avant chaque test (le store est un singleton).
beforeEach(() => {
  useGameStore.getState().resetNear()
  useGameStore.getState().closeAllMenus()
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

describe('gameStore — slice menus', () => {
  it('menus est vide au départ et un menu absent est falsy', () => {
    expect(useGameStore.getState().menus).toEqual({})
    expect(useGameStore.getState().menus.skin).toBeUndefined()
  })

  it('setMenuOpen ouvre puis ferme un menu', () => {
    const { setMenuOpen } = useGameStore.getState()
    setMenuOpen('skin', true)
    expect(useGameStore.getState().menus.skin).toBe(true)
    setMenuOpen('skin', false)
    expect(useGameStore.getState().menus.skin).toBe(false)
  })

  it('les menus sont indépendants (relocalisation fidèle, pas d\'exclusivité imposée)', () => {
    const { setMenuOpen } = useGameStore.getState()
    setMenuOpen('skin', true)
    setMenuOpen('environment', true)
    expect(useGameStore.getState().menus).toEqual({ skin: true, environment: true })
  })

  it('setMenuOpen avec valeur identique ne crée pas un nouvel objet', () => {
    const { setMenuOpen } = useGameStore.getState()
    setMenuOpen('skin', true)
    const before = useGameStore.getState().menus
    setMenuOpen('skin', true)
    expect(useGameStore.getState().menus).toBe(before)
  })

  it('closeAllMenus vide tous les menus', () => {
    const { setMenuOpen, closeAllMenus } = useGameStore.getState()
    setMenuOpen('skin', true)
    setMenuOpen('character', true)
    closeAllMenus()
    expect(useGameStore.getState().menus).toEqual({})
  })
})
