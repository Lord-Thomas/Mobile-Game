export const CONTROL_SETTINGS_STORAGE_KEY = 'game-control-settings-v1'

export const DEFAULT_CONTROL_SETTINGS = Object.freeze({
  size: 100,
  opacity: 90,
  leftHanded: false,
  vibration: true,
  joystickOffsetX: 0,
  joystickOffsetY: 0,
  actionsOffsetX: 0,
  actionsOffsetY: 0,
})

const RANGES = Object.freeze({
  size: [75, 140],
  opacity: [35, 100],
  joystickOffsetX: [-100, 100],
  joystickOffsetY: [-100, 100],
  actionsOffsetX: [-140, 140],
  actionsOffsetY: [-100, 100],
})

function clampNumber(value, [min, max], fallback) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.round(Math.min(max, Math.max(min, number)))
}

export function normalizeControlSettings(settings = {}) {
  return {
    size: clampNumber(settings.size, RANGES.size, DEFAULT_CONTROL_SETTINGS.size),
    opacity: clampNumber(settings.opacity, RANGES.opacity, DEFAULT_CONTROL_SETTINGS.opacity),
    leftHanded: typeof settings.leftHanded === 'boolean'
      ? settings.leftHanded
      : DEFAULT_CONTROL_SETTINGS.leftHanded,
    vibration: typeof settings.vibration === 'boolean'
      ? settings.vibration
      : DEFAULT_CONTROL_SETTINGS.vibration,
    joystickOffsetX: clampNumber(
      settings.joystickOffsetX,
      RANGES.joystickOffsetX,
      DEFAULT_CONTROL_SETTINGS.joystickOffsetX,
    ),
    joystickOffsetY: clampNumber(
      settings.joystickOffsetY,
      RANGES.joystickOffsetY,
      DEFAULT_CONTROL_SETTINGS.joystickOffsetY,
    ),
    actionsOffsetX: clampNumber(
      settings.actionsOffsetX,
      RANGES.actionsOffsetX,
      DEFAULT_CONTROL_SETTINGS.actionsOffsetX,
    ),
    actionsOffsetY: clampNumber(
      settings.actionsOffsetY,
      RANGES.actionsOffsetY,
      DEFAULT_CONTROL_SETTINGS.actionsOffsetY,
    ),
  }
}

export function loadControlSettings(storage = globalThis?.localStorage) {
  if (!storage) return { ...DEFAULT_CONTROL_SETTINGS }
  try {
    const stored = JSON.parse(storage.getItem(CONTROL_SETTINGS_STORAGE_KEY) || '{}')
    return normalizeControlSettings(stored)
  } catch {
    return { ...DEFAULT_CONTROL_SETTINGS }
  }
}

export function saveControlSettings(settings, storage = globalThis?.localStorage) {
  if (!storage) return false
  try {
    storage.setItem(CONTROL_SETTINGS_STORAGE_KEY, JSON.stringify(normalizeControlSettings(settings)))
    return true
  } catch {
    return false
  }
}

export function getControlCssVariables(settings) {
  const normalized = normalizeControlSettings(settings)
  return {
    '--control-scale': normalized.size / 100,
    '--control-opacity': normalized.opacity / 100,
    '--joystick-offset-x': `${normalized.joystickOffsetX}px`,
    '--joystick-offset-y': `${-normalized.joystickOffsetY}px`,
    '--actions-offset-x': `${normalized.actionsOffsetX}px`,
    '--actions-offset-y': `${-normalized.actionsOffsetY}px`,
  }
}

export function triggerControlHaptic(enabled, duration = 18, navigatorObject = globalThis?.navigator) {
  if (!enabled || typeof navigatorObject?.vibrate !== 'function') return false
  return navigatorObject.vibrate(duration)
}
