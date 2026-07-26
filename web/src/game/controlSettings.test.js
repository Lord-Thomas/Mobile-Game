import { describe, expect, it, vi } from 'vitest'
import {
  CONTROL_SETTINGS_STORAGE_KEY,
  DEFAULT_CONTROL_SETTINGS,
  getControlCssVariables,
  loadControlSettings,
  normalizeControlSettings,
  saveControlSettings,
  triggerControlHaptic,
} from './controlSettings'

describe('control settings', () => {
  it('normalise et borne les valeurs enregistrées', () => {
    expect(normalizeControlSettings({
      size: 250,
      opacity: 10,
      leftHanded: true,
      vibration: false,
      joystickOffsetX: -500,
      actionsOffsetY: 42.4,
    })).toEqual({
      ...DEFAULT_CONTROL_SETTINGS,
      size: 140,
      opacity: 35,
      leftHanded: true,
      vibration: false,
      joystickOffsetX: -100,
      actionsOffsetY: 42,
    })
  })

  it('charge et sauvegarde les préférences avec la même clé', () => {
    const values = new Map()
    const storage = {
      getItem: vi.fn((key) => values.get(key) ?? null),
      setItem: vi.fn((key, value) => values.set(key, value)),
    }

    expect(saveControlSettings({ size: 115, vibration: false }, storage)).toBe(true)
    expect(storage.setItem).toHaveBeenCalledWith(CONTROL_SETTINGS_STORAGE_KEY, expect.any(String))
    expect(loadControlSettings(storage)).toMatchObject({ size: 115, vibration: false })
  })

  it('produit les variables CSS de taille, opacité et position', () => {
    expect(getControlCssVariables({
      size: 120,
      opacity: 75,
      joystickOffsetY: 20,
      actionsOffsetX: -30,
    })).toMatchObject({
      '--control-scale': 1.2,
      '--control-opacity': 0.75,
      '--joystick-offset-y': '-20px',
      '--actions-offset-x': '-30px',
    })
  })

  it('ne vibre que si l’option et l’API sont disponibles', () => {
    const vibrate = vi.fn(() => true)

    expect(triggerControlHaptic(false, 18, { vibrate })).toBe(false)
    expect(triggerControlHaptic(true, 24, { vibrate })).toBe(true)
    expect(vibrate).toHaveBeenCalledOnce()
    expect(vibrate).toHaveBeenCalledWith(24)
  })
})
