import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, DoubleSide } from 'three'
import ParticleEffect from '../effects/ParticleEffect'
import { normalizeParticlePreset } from '../effects/particlePresets'
import { MAP_BIOME_AREAS } from './biomeAreas'
import { getTerrainHeight } from './terrain/terrainGeometry'

const MIST_VERTEX_SHADER = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const MIST_FRAGMENT_SHADER = `
uniform float uTime;
uniform float uOpacity;
uniform vec3 uColorA;
uniform vec3 uColorB;
varying vec2 vUv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

void main() {
  vec2 centered = vUv - 0.5;
  float radial = 1.0 - smoothstep(0.08, 0.52, length(centered));
  float softEdge = smoothstep(0.0, 0.28, radial);
  float slowNoise = noise(vUv * 4.4 + vec2(uTime * 0.025, -uTime * 0.018));
  float fineNoise = noise(vUv * 12.0 + vec2(-uTime * 0.055, uTime * 0.031));
  float torn = smoothstep(0.22, 0.76, slowNoise * 0.72 + fineNoise * 0.28);
  float alpha = radial * softEdge * torn * uOpacity;
  if (alpha < 0.004) discard;
  vec3 color = mix(uColorA, uColorB, slowNoise);
  gl_FragColor = vec4(color, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

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

function GraveyardMist({ area }) {
  const groupRef = useRef()
  const patches = useMemo(() => {
    const count = Math.max(18, Math.round(22 + area.fogIntensity * 20))
    return Array.from({ length: count }, (_, index) => {
      const angle = seededRandom(index + 31) * Math.PI * 2
      const distance = Math.sqrt(seededRandom(index + 73)) * area.radius * 0.92
      const x = Math.cos(angle) * distance
      const z = Math.sin(angle) * distance
      return {
        x,
        z,
        y: getTerrainHeight(area.center[0] + x, area.center[1] + z) + 0.11 + seededRandom(index + 19) * 0.22,
        scale: area.radius * (0.22 + seededRandom(index + 11) * 0.28),
        phase: seededRandom(index + 97) * Math.PI * 2,
        drift: 0.035 + seededRandom(index + 5) * 0.05,
        colorA: seededRandom(index + 59) > 0.55 ? '#9eb5ad' : '#a9b9b1',
        colorB: seededRandom(index + 61) > 0.48 ? '#c0c8b9' : '#8baaa5',
      }
    })
  }, [area])

  useFrame((state) => {
    const group = groupRef.current
    if (!group) return
    const time = state.clock.elapsedTime
    group.children.forEach((child, index) => {
      const patch = patches[index]
      if (!patch) return
      const pulse = 0.92 + Math.sin(time * patch.drift + patch.phase) * 0.08
      child.scale.setScalar(patch.scale * pulse)
      child.rotation.z = patch.phase + time * patch.drift * 0.18
      child.material.uniforms.uTime.value = time + patch.phase * 11
      child.material.uniforms.uOpacity.value = (0.085 + seededRandom(index + 17) * 0.065) * area.fogIntensity * (0.9 + pulse * 0.1)
    })
  })

  return (
    <group ref={groupRef} position={[area.center[0], 0, area.center[1]]} userData={{ debugCategory: 'graveyard-mist' }}>
      {patches.map((patch, index) => (
        <mesh key={index} rotation={[-Math.PI / 2, 0, patch.phase]} position={[patch.x, patch.y, patch.z]} renderOrder={18}>
          <circleGeometry args={[1, 36]} />
          <shaderMaterial
            uniforms={{
              uTime: { value: patch.phase },
              uOpacity: { value: 0.1 * area.fogIntensity },
              uColorA: { value: new Color(patch.colorA) },
              uColorB: { value: new Color(patch.colorB) },
            }}
            vertexShader={MIST_VERTEX_SHADER}
            fragmentShader={MIST_FRAGMENT_SHADER}
            transparent
            depthWrite={false}
            depthTest={false}
            side={DoubleSide}
          />
        </mesh>
      ))}
    </group>
  )
}

function GraveyardMistVeils({ area }) {
  const groupRef = useRef()
  const veils = useMemo(() => {
    const count = Math.max(7, Math.round(8 + area.fogIntensity * 8))
    return Array.from({ length: count }, (_, index) => {
      const angle = seededRandom(index + 331) * Math.PI * 2
      const distance = (0.18 + seededRandom(index + 337) * 0.72) * area.radius
      const x = Math.cos(angle) * distance
      const z = Math.sin(angle) * distance
      return {
        x,
        z,
        y: getTerrainHeight(area.center[0] + x, area.center[1] + z) + 0.62 + seededRandom(index + 349) * 0.55,
        width: area.radius * (0.24 + seededRandom(index + 353) * 0.2),
        height: 0.9 + seededRandom(index + 359) * 1.15,
        phase: seededRandom(index + 367) * Math.PI * 2,
        sway: 0.08 + seededRandom(index + 373) * 0.08,
        colorA: seededRandom(index + 379) > 0.5 ? '#a6bbb4' : '#91aaa6',
        colorB: seededRandom(index + 383) > 0.5 ? '#c7d0bd' : '#9fc6be',
      }
    })
  }, [area])

  useFrame((state) => {
    const group = groupRef.current
    if (!group) return
    const time = state.clock.elapsedTime
    group.children.forEach((child, index) => {
      const veil = veils[index]
      if (!veil) return
      child.rotation.y = state.camera.rotation.y + Math.sin(time * veil.sway + veil.phase) * 0.22
      child.position.y = veil.y + Math.sin(time * veil.sway * 0.7 + veil.phase) * 0.08
      child.material.uniforms.uTime.value = time + veil.phase * 7
      child.material.uniforms.uOpacity.value = (0.07 + seededRandom(index + 389) * 0.055) * area.fogIntensity
    })
  })

  return (
    <group ref={groupRef} position={[area.center[0], 0, area.center[1]]} userData={{ debugCategory: 'graveyard-mist-veils' }}>
      {veils.map((veil, index) => (
        <mesh key={index} position={[veil.x, veil.y, veil.z]} scale={[veil.width, veil.height, 1]} renderOrder={19}>
          <planeGeometry args={[1, 1]} />
          <shaderMaterial
            uniforms={{
              uTime: { value: veil.phase },
              uOpacity: { value: 0.1 * area.fogIntensity },
              uColorA: { value: new Color(veil.colorA) },
              uColorB: { value: new Color(veil.colorB) },
            }}
            vertexShader={MIST_VERTEX_SHADER}
            fragmentShader={MIST_FRAGMENT_SHADER}
            transparent
            depthWrite={false}
            depthTest={false}
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
      {area.fogIntensity > 0.01 && (
        <>
          <GraveyardMist area={area} />
          <GraveyardMistVeils area={area} />
        </>
      )}
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
