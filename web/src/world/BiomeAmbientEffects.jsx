import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CanvasTexture, ClampToEdgeWrapping, DoubleSide, LinearFilter, NormalBlending, SRGBColorSpace } from 'three'
import ParticleEffect from '../effects/ParticleEffect'
import { normalizeParticlePreset } from '../effects/particlePresets'
import { MAP_BIOME_AREAS } from './biomeAreas'
import { getTerrainHeight } from './terrain/terrainGeometry'

function seededRandom(seed) {
  return Math.abs(Math.sin(seed * 12.9898) * 43758.5453) % 1
}

function createFogSheetTexture() {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, size, size)

  const base = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size * 0.52)
  base.addColorStop(0, 'rgba(255,255,255,0.45)')
  base.addColorStop(0.48, 'rgba(255,255,255,0.24)')
  base.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = base
  ctx.fillRect(0, 0, size, size)

  for (let index = 0; index < 34; index += 1) {
    const seed = index * 91 + 17
    const x = size * (0.12 + seededRandom(seed) * 0.76)
    const y = size * (0.14 + seededRandom(seed + 3) * 0.72)
    const radius = size * (0.12 + seededRandom(seed + 7) * 0.22)
    const alpha = 0.12 + seededRandom(seed + 11) * 0.28
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius)
    gradient.addColorStop(0, `rgba(255,255,255,${alpha})`)
    gradient.addColorStop(0.58, `rgba(255,255,255,${alpha * 0.42})`)
    gradient.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, size, size)
  }

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.wrapS = ClampToEdgeWrapping
  texture.wrapT = ClampToEdgeWrapping
  texture.needsUpdate = true
  return texture
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

function makeFogPatches(area) {
  const groundCount = Math.max(18, Math.round(20 + area.fogIntensity * 24))
  const billboardCount = Math.max(9, Math.round(9 + area.fogIntensity * 12))
  const ground = Array.from({ length: groundCount }, (_, index) => {
    const angle = seededRandom(index + 401) * Math.PI * 2
    const distance = Math.sqrt(seededRandom(index + 409)) * area.radius * 0.92
    const x = Math.cos(angle) * distance
    const z = Math.sin(angle) * distance
    const width = area.radius * (0.42 + seededRandom(index + 419) * 0.58)
    const depth = area.radius * (0.28 + seededRandom(index + 421) * 0.42)
    return {
      id: `${area.id}_fog_ground_${index}`,
      type: 'ground',
      x,
      z,
      y: getTerrainHeight(area.center[0] + x, area.center[1] + z) + 0.22 + seededRandom(index + 431) * 0.42,
      scale: [width, depth, 1],
      rotation: seededRandom(index + 433) * Math.PI * 2,
      phase: seededRandom(index + 439) * Math.PI * 2,
      driftX: (seededRandom(index + 443) - 0.5) * 0.025,
      driftZ: (seededRandom(index + 449) - 0.5) * 0.025,
      opacity: (0.28 + seededRandom(index + 457) * 0.24) * area.fogIntensity,
    }
  })

  const billboards = Array.from({ length: billboardCount }, (_, index) => {
    const angle = seededRandom(index + 503) * Math.PI * 2
    const distance = (0.18 + seededRandom(index + 509) * 0.74) * area.radius
    const x = Math.cos(angle) * distance
    const z = Math.sin(angle) * distance
    const size = area.radius * (0.42 + seededRandom(index + 521) * 0.38)
    return {
      id: `${area.id}_fog_billboard_${index}`,
      type: 'billboard',
      x,
      z,
      y: getTerrainHeight(area.center[0] + x, area.center[1] + z) + 0.85 + seededRandom(index + 523) * 1.35,
      scale: [size, size * (0.58 + seededRandom(index + 541) * 0.52), 1],
      rotation: 0,
      phase: seededRandom(index + 547) * Math.PI * 2,
      driftX: (seededRandom(index + 557) - 0.5) * 0.02,
      driftZ: (seededRandom(index + 563) - 0.5) * 0.02,
      opacity: (0.18 + seededRandom(index + 569) * 0.18) * area.fogIntensity,
    }
  })

  return [...ground, ...billboards]
}

function GraveyardFogPlanes({ area }) {
  const groupRef = useRef()
  const patches = useMemo(() => makeFogPatches(area), [area])
  const fogTexture = useMemo(() => createFogSheetTexture(), [])

  useFrame((state) => {
    const group = groupRef.current
    if (!group) return
    const time = state.clock.elapsedTime
    group.children.forEach((child, index) => {
      const patch = patches[index]
      if (!patch) return
      const pulse = 0.82 + Math.sin(time * 0.18 + patch.phase) * 0.18
      child.position.x = patch.x + Math.sin(time * 0.11 + patch.phase) * patch.driftX * area.radius
      child.position.z = patch.z + Math.cos(time * 0.09 + patch.phase) * patch.driftZ * area.radius
      child.material.opacity = Math.min(0.82, patch.opacity * pulse)
      if (patch.type === 'ground') {
        child.rotation.z = patch.rotation + time * 0.012
      } else {
        child.lookAt(state.camera.position)
        child.rotation.z += Math.sin(time * 0.16 + patch.phase) * 0.08
      }
    })
  })

  return (
    <group ref={groupRef} position={[area.center[0], 0, area.center[1]]} userData={{ debugCategory: 'graveyard-fog-planes' }}>
      {patches.map((patch) => (
        <mesh
          key={patch.id}
          position={[patch.x, patch.y, patch.z]}
          rotation={patch.type === 'ground' ? [-Math.PI / 2, 0, patch.rotation] : [0, patch.rotation, 0]}
          scale={patch.scale}
          renderOrder={12}
        >
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial
            map={fogTexture}
            color={patch.type === 'ground' ? '#b7c4b8' : '#adcac0'}
            transparent
            opacity={patch.opacity}
            alphaTest={0.015}
            depthTest={false}
            depthWrite={false}
            fog={false}
            blending={NormalBlending}
            side={DoubleSide}
          />
        </mesh>
      ))}
    </group>
  )
}

function GraveyardAmbience({ area }) {
  const preset = useMemo(() => makeWispPreset(area), [area])
  const clusters = useMemo(() => makeWispClusters(area), [area])

  return (
    <group userData={{ debugCategory: 'graveyard-ambience', biomeAreaId: area.id }}>
      {area.fogIntensity > 0.01 && <GraveyardFogPlanes area={area} />}
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
