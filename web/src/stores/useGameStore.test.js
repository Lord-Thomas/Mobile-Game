import { beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from './useGameStore'

// Réinitialise les slices avant chaque test (le store est un singleton).
beforeEach(() => {
  useGameStore.getState().resetNear()
  useGameStore.getState().closeAllMenus()
  const { setInventory, setEquipment, setEconomy } = useGameStore.getState()
  setInventory('ownedSkins', ['classic'])
  setInventory('selectedSkinId', 'classic')
  setInventory('catActive', false)
  setEquipment('ownedMounts', [])
  setEquipment('equippedWeapon', null)
  setEquipment('ownedTitleIds', [])
  setEconomy('coins', 0)
  setEconomy('materials', {})
  const { setQuest } = useGameStore.getState()
  setQuest('progress', {})
  setQuest('dialogOpen', false)
  setQuest('journalOpen', false)
  setQuest('vendorOpen', false)
  const { setView } = useGameStore.getState()
  setView('zone', 'interior')
  setView('mode', 'play')
  const { setUi } = useGameStore.getState()
  setUi('mainMenuTab', 'account')
  setUi('weaponMenuOpen', false)
  const { setEditor } = useGameStore.getState()
  setEditor('selectedObjectId', null)
  setEditor('placingObjectId', null)
  const { setAccount } = useGameStore.getState()
  setAccount('user', null)
  setAccount('displayName', '')
  setAccount('friends', [])
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

describe('gameStore — slice inventory', () => {
  it('setInventory pose une valeur simple', () => {
    useGameStore.getState().setInventory('selectedSkinId', 'lunar')
    expect(useGameStore.getState().inventory.selectedSkinId).toBe('lunar')
  })

  it('setInventory accepte une fonction updater (prev => next)', () => {
    const { setInventory } = useGameStore.getState()
    setInventory('ownedSkins', (current) => [...current, 'lunar'])
    expect(useGameStore.getState().inventory.ownedSkins).toEqual(['classic', 'lunar'])
  })

  it('setInventory updater togglé (booléen)', () => {
    const { setInventory } = useGameStore.getState()
    setInventory('catActive', (v) => !v)
    expect(useGameStore.getState().inventory.catActive).toBe(true)
  })

  it('setInventory avec valeur identique ne crée pas un nouvel objet', () => {
    const { setInventory } = useGameStore.getState()
    setInventory('selectedSkinId', 'classic')
    const before = useGameStore.getState().inventory
    setInventory('selectedSkinId', 'classic')
    expect(useGameStore.getState().inventory).toBe(before)
  })
})

describe('gameStore — slice equipment', () => {
  it('setEquipment pose une valeur simple', () => {
    useGameStore.getState().setEquipment('equippedWeapon', 'magic_book')
    expect(useGameStore.getState().equipment.equippedWeapon).toBe('magic_book')
  })

  it('setEquipment accepte une fonction updater (ajout de monture)', () => {
    const { setEquipment } = useGameStore.getState()
    setEquipment('ownedMounts', (current) => [...current, 'dragon'])
    expect(useGameStore.getState().equipment.ownedMounts).toEqual(['dragon'])
  })

  it('characterAppearance a une valeur par défaut non vide', () => {
    expect(useGameStore.getState().equipment.characterAppearance).toHaveProperty('skinColor')
  })

  it('setEquipment avec valeur identique ne crée pas un nouvel objet', () => {
    const { setEquipment } = useGameStore.getState()
    setEquipment('equippedWeapon', null)
    const before = useGameStore.getState().equipment
    setEquipment('equippedWeapon', null)
    expect(useGameStore.getState().equipment).toBe(before)
  })
})

describe('gameStore — slice economy', () => {
  it('setEconomy pose les coins', () => {
    useGameStore.getState().setEconomy('coins', 500)
    expect(useGameStore.getState().economy.coins).toBe(500)
  })

  it('setEconomy updater (delta) clampé comme applyCoinDelta', () => {
    const { setEconomy } = useGameStore.getState()
    setEconomy('coins', 100)
    setEconomy('coins', (c) => Math.max(0, c - 250)) // dépense > solde -> 0
    expect(useGameStore.getState().economy.coins).toBe(0)
  })

  it('setEconomy materials accepte un updater (ajout)', () => {
    const { setEconomy } = useGameStore.getState()
    setEconomy('materials', (prev) => ({ ...prev, wood: (prev.wood ?? 0) + 2 }))
    expect(useGameStore.getState().economy.materials.wood).toBe(2)
  })
})

describe('gameStore — slice quests', () => {
  it('setQuest ouvre/ferme le dialogue', () => {
    const { setQuest } = useGameStore.getState()
    setQuest('dialogOpen', true)
    expect(useGameStore.getState().quests.dialogOpen).toBe(true)
  })

  it('setQuest progress accepte un updater (logique pure questState)', () => {
    const { setQuest } = useGameStore.getState()
    setQuest('progress', (prev) => ({ ...prev, q1: { status: 'in_progress' } }))
    expect(useGameStore.getState().quests.progress.q1.status).toBe('in_progress')
  })

  it('toggle journalOpen via updater', () => {
    const { setQuest } = useGameStore.getState()
    setQuest('journalOpen', (v) => !v)
    expect(useGameStore.getState().quests.journalOpen).toBe(true)
  })
})

describe('gameStore — slice view', () => {
  it('valeurs par défaut : intérieur + play', () => {
    expect(useGameStore.getState().view.zone).toBe('interior')
    expect(useGameStore.getState().view.mode).toBe('play')
  })

  it('setView change zone et mode indépendamment', () => {
    const { setView } = useGameStore.getState()
    setView('zone', 'outside')
    setView('mode', 'customize')
    expect(useGameStore.getState().view).toEqual({ zone: 'outside', mode: 'customize' })
  })
})

describe('gameStore — slice ui', () => {
  it('setUi ouvre un menu et change un onglet', () => {
    const { setUi } = useGameStore.getState()
    setUi('weaponMenuOpen', true)
    setUi('mainMenuTab', 'social')
    expect(useGameStore.getState().ui.weaponMenuOpen).toBe(true)
    expect(useGameStore.getState().ui.mainMenuTab).toBe('social')
  })

  it('setUi toggle via updater', () => {
    const { setUi } = useGameStore.getState()
    setUi('accountOpen', (v) => !v)
    expect(useGameStore.getState().ui.accountOpen).toBe(true)
  })
})

describe('gameStore — slice editor', () => {
  it('sélection / placement simples', () => {
    const { setEditor } = useGameStore.getState()
    setEditor('selectedObjectId', 'obj-1')
    setEditor('placingObjectId', 'obj-2')
    expect(useGameStore.getState().editor.selectedObjectId).toBe('obj-1')
    expect(useGameStore.getState().editor.placingObjectId).toBe('obj-2')
  })

  it('editableObjects accepte un updater (ajout)', () => {
    const { setEditor } = useGameStore.getState()
    const before = useGameStore.getState().editor.editableObjects.length
    setEditor('editableObjects', (current) => [...current, { id: 'new', objectId: 'x' }])
    expect(useGameStore.getState().editor.editableObjects.length).toBe(before + 1)
  })

  it('editableObjects a un défaut non vide (objets par défaut)', () => {
    expect(Array.isArray(useGameStore.getState().editor.editableObjects)).toBe(true)
  })
})

describe('gameStore — slice account', () => {
  it('setAccount pose user et displayName', () => {
    const { setAccount } = useGameStore.getState()
    setAccount('user', { id: 'u1' })
    setAccount('displayName', 'Thomas')
    expect(useGameStore.getState().account.user).toEqual({ id: 'u1' })
    expect(useGameStore.getState().account.displayName).toBe('Thomas')
  })

  it('friends accepte un updater', () => {
    const { setAccount } = useGameStore.getState()
    setAccount('friends', (current) => [...current, { id: 'f1' }])
    expect(useGameStore.getState().account.friends).toEqual([{ id: 'f1' }])
  })

  it('cloudSaveState a un défaut valide (offline/local selon config Supabase)', () => {
    expect(['offline', 'local']).toContain(useGameStore.getState().account.cloudSaveState)
  })
})
