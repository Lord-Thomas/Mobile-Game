import { useMemo } from 'react'
import ParticleEffect from '../effects/ParticleEffect'
import { normalizeParticlePreset } from '../effects/particlePresets'
import { MAP_BIOME_AREAS } from './biomeAreas'
import { getTerrainHeight } from './terrain/terrainGeometry'

function seededRandom(seed) {
  return Math.abs(Math.sin(seed * 12.9898) * 43758.5453) % 1
}

function makeWispPreset(area) {
  return normalizeParticlePreset({
    id: `${area.id}_wisps`,
    name: 'Bribes spectrales',
    category: 'loop',
    duration: 4.6,
    loop: true,
    emitters: [
      {
        shape: 'circle',
        mode: 'loop',
        count: Math.round(14 + area.particleIntensity * 28),
        texture: 'soft_glow',
        blending: 'additive',
        colorStart: '#ccfff5',
        colorEnd: '#6ab9ff',
        alphaStart: 0.72 * area.particleIntensity,
        alphaEnd: 0,
        sizeStart: 0.18,
        sizeEnd: 0.035,
        sizeVariance: 0.55,
        speed: 0.42,
        speedVariance: 0.56,
        spread: 0.34,
        direction: [0.82, 0.28, -0.38],
        gravity: 0.018,
        turbulence: 0.95,
        rotationSpeed: 0.45,
        lifetime: 4.8,
        lifetimeVariance: 0.55,
        radius: area.radius * 0.18,
        offset: [0, 0.78, 0],
        delay: 0,
      },
      {
        shape: 'circle',
        mode: 'loop',
        count: Math.round(5 + area.particleIntensity * 12),
        texture: 'spark',
        blending: 'additive',
        colorStart: '#dafff8',
        colorEnd: '#83ff9e',
        alphaStart: 0.58 * area.particleIntensity,
        alphaEnd: 0,
        sizeStart: 0.09,
        sizeEnd: 0.018,
        sizeVariance: 0.6,
        speed: 0.38,
        speedVariance: 0.62,
        spread: 0.38,
        direction: [0.7, 0.36, -0.48],
        gravity: 0.012,
        turbulence: 0.82,
        rotationSpeed: 1.3,
        lifetime: 3.8,
        lifetimeVariance: 0.5,
        radius: area.radius * 0.14,
        offset: [0, 1.08, 0],
        delay: 0,
      },
    ],
    light: { enabled: false, color: '#8fe9ff', intensity: 0 },
  })
}

function makeWispClusters(area) {
  const count = Math.max(3, Math.round(3 + area.particleIntensity * 3))
  return Array.from({ length: count }, (_, index) => {
    if (index === 0) {
      return {
        id: `${area.id}_wisp_core`,
        x: 0,
        z: 0,
        phase: 0,
      }
    }

    const angle = seededRandom(index + 211) * Math.PI * 2
    const distance = (0.22 + seededRandom(index + 223) * 0.58) * area.radius
    return {
      id: `${area.id}_wisp_${index}`,
      x: Math.cos(angle) * distance,
      z: Math.sin(angle) * distance,
      phase: seededRandom(index + 229) * Math.PI * 2,
    }
  })
}

function GraveyardAmbience({ area }) {
  const preset = useMemo(() => makeWispPreset(area), [area])
  const clusters = useMemo(() => makeWispClusters(area), [area])

  return (
    <group userData={{ debugCategory: 'graveyard-ambience', biomeAreaId: area.id }}>
      {area.particleIntensity > 0.01 && clusters.map((cluster) => {
        const worldX = area.center[0] + cluster.x
        const worldZ = area.center[1] + cluster.z
        const y = getTerrainHeight(worldX, worldZ)
        return (
          <ParticleEffect
            key={cluster.id}
            preset={preset}
            playing
            loop
            playbackId={Math.round(cluster.phase * 1000)}
            position={[worldX, y + 0.16, worldZ]}
          />
        )
      })}
    </group>
  )
}

export default function BiomeAmbientEffects({ areas = MAP_BIOME_AREAS }) {
  const graveyardAreas = areas.filter((area) => area.biome === 'graveyard')

  return (
    <group userData={{ debugCategory: 'biome-ambient-effects' }}>
      {graveyardAreas.map((area) => (
        <GraveyardAmbience key={area.id} area={area} />
      ))}
    </group>
  )
}

