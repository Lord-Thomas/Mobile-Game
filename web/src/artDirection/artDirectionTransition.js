import { normalizeArtDirectionValues } from './artDirectionStore'

function mix(start, end, progress) {
  return start + (end - start) * progress
}

function parseHexColor(value) {
  return [1, 3, 5].map((index) => Number.parseInt(value.slice(index, index + 2), 16))
}

function mixHexColor(start, end, progress) {
  const startChannels = parseHexColor(start)
  const endChannels = parseHexColor(end)
  const channels = startChannels.map((channel, index) => (
    Math.round(mix(channel, endChannels[index], progress))
      .toString(16)
      .padStart(2, '0')
  ))
  return `#${channels.join('')}`
}

function interpolateValue(start, end, progress) {
  if (typeof start === 'number' && typeof end === 'number') return mix(start, end, progress)
  if (
    typeof start === 'string' &&
    typeof end === 'string' &&
    /^#[0-9a-f]{6}$/i.test(start) &&
    /^#[0-9a-f]{6}$/i.test(end)
  ) {
    return mixHexColor(start, end, progress)
  }
  if (start && end && typeof start === 'object' && typeof end === 'object') {
    return Object.fromEntries(
      Object.keys(end).map((key) => [key, interpolateValue(start[key], end[key], progress)]),
    )
  }
  return progress < 1 ? start : end
}

export function interpolateArtDirectionValues(start, end, progress) {
  const clampedProgress = Math.min(1, Math.max(0, Number(progress) || 0))
  return normalizeArtDirectionValues(interpolateValue(start, end, clampedProgress))
}

export function createBossSlimeRuntimeTarget(baseValues, bossValues) {
  return normalizeArtDirectionValues({
    ...bossValues,
    lighting: {
      ...bossValues.lighting,
      // Rotating the sun during the summon invalidates the directional-light
      // shadow projection while the boss is entering the scene. Keep the
      // current direction and transition only colors/intensities.
      sunAzimuth: baseValues.lighting.sunAzimuth,
      sunElevation: baseValues.lighting.sunElevation,
    },
    // Changer la résolution ou l'activation des ombres pendant le combat peut
    // forcer une réallocation GPU. Le preset rouge conserve donc ce bloc.
    shadows: baseValues.shadows,
  })
}
