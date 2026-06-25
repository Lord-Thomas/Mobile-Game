import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { CanvasTexture, ClampToEdgeWrapping, Color, DoubleSide, InstancedBufferAttribute, InstancedBufferGeometry, LinearFilter, LinearMipmapLinearFilter, MeshBasicMaterial, NormalBlending, PlaneGeometry, SRGBColorSpace } from 'three'
import ParticleEffect from '../effects/ParticleEffect'
import { normalizeParticlePreset } from '../effects/particlePresets'
import { MAP_BIOME_AREAS } from './biomeAreas'
import { getTerrainHeight } from './terrain/terrainGeometry'

const PAINTED_FOG_MAX_AREAS = 180

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
  // Mipmaps trilinéaires + anisotropie : sans ça, les plans de fog (surtout les
  // 'ground' à plat vus en angle rasant) sont minifiés SANS filtrage → le bord
  // d'alphaTest et les blobs aliasent en motif pointillé. Très visible sur mobile
  // (DPR élevé + render-scale dynamique) → "points colorés". 256² = POT, OK partout.
  texture.generateMipmaps = true
  texture.minFilter = LinearMipmapLinearFilter
  texture.magFilter = LinearFilter
  texture.anisotropy = 4 // clampé à la limite GPU par three (négligeable en coût)
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
  const billboardCount = Math.max(10, Math.round(10 + area.fogIntensity * 13))
  const highBillboardCount = Math.max(7, Math.round(7 + area.fogIntensity * 9))
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
      y: getTerrainHeight(area.center[0] + x, area.center[1] + z) + 0.95 + seededRandom(index + 523) * 1.55,
      scale: [size, size * (0.58 + seededRandom(index + 541) * 0.52), 1],
      rotation: 0,
      phase: seededRandom(index + 547) * Math.PI * 2,
      driftX: (seededRandom(index + 557) - 0.5) * 0.02,
      driftZ: (seededRandom(index + 563) - 0.5) * 0.02,
      opacity: (0.18 + seededRandom(index + 569) * 0.18) * area.fogIntensity,
    }
  })

  const highBillboards = Array.from({ length: highBillboardCount }, (_, index) => {
    const angle = seededRandom(index + 601) * Math.PI * 2
    const distance = (0.12 + seededRandom(index + 607) * 0.78) * area.radius
    const x = Math.cos(angle) * distance
    const z = Math.sin(angle) * distance
    const size = area.radius * (0.52 + seededRandom(index + 613) * 0.42)
    return {
      id: `${area.id}_fog_high_billboard_${index}`,
      type: 'billboard',
      x,
      z,
      y: getTerrainHeight(area.center[0] + x, area.center[1] + z) + 2.35 + seededRandom(index + 617) * 2.25,
      scale: [size, size * (0.64 + seededRandom(index + 619) * 0.58), 1],
      rotation: 0,
      phase: seededRandom(index + 631) * Math.PI * 2,
      driftX: (seededRandom(index + 641) - 0.5) * 0.018,
      driftZ: (seededRandom(index + 643) - 0.5) * 0.018,
      opacity: (0.12 + seededRandom(index + 647) * 0.14) * area.fogIntensity,
    }
  })

  return [...ground, ...billboards, ...highBillboards]
}

// ─── Brume instanciée ────────────────────────────────────────────────────────
// Avant : chaque patch de brume = un <mesh> séparé → ~4500 draw calls + autant de
// géométries/matériaux montés d'un coup en sortant de la maison (freeze) + un
// useFrame qui parcourait tous les enfants par frame. Désormais : tous les patches
// d'un même type (ground/billboard) sont fusionnés dans UN InstancedBufferGeometry.
// Le drift, le pulse d'opacité et le billboard (face caméra) sont calculés dans le
// shader (onBeforeCompile sur un MeshBasicMaterial pour garder couleur/tonemapping/
// alphaTest de three intacts). Coût par frame ≈ une seule écriture d'uniform uTime.

// Paramètres d'animation par couche (anciennes valeurs des useFrame conservées).
const GRAVEYARD_GROUND_PARAMS = { billboard: false, pulseBase: 0.82, pulseAmp: 0.18, pulseSpeed: 0.18, opacityCap: 0.82, driftSpeedX: 0.11, driftSpeedZ: 0.09, rotSpeed: 0.012, wobbleAmp: 0 }
const GRAVEYARD_BILLBOARD_PARAMS = { billboard: true, pulseBase: 0.82, pulseAmp: 0.18, pulseSpeed: 0.18, opacityCap: 0.82, driftSpeedX: 0.11, driftSpeedZ: 0.09, rotSpeed: 0.16, wobbleAmp: 0.4 }
const PAINTED_GROUND_PARAMS = { billboard: false, pulseBase: 0.78, pulseAmp: 0.22, pulseSpeed: 0.16, opacityCap: 0.56, driftSpeedX: 0.08, driftSpeedZ: 0.07, rotSpeed: 0.01, wobbleAmp: 0 }
const PAINTED_BILLBOARD_PARAMS = { billboard: true, pulseBase: 0.78, pulseAmp: 0.22, pulseSpeed: 0.16, opacityCap: 0.56, driftSpeedX: 0.08, driftSpeedZ: 0.07, rotSpeed: 0.14, wobbleAmp: 0.28 }

const FOG_INSTANCE_HEADER = /* glsl */ `
  attribute vec3 aOffset;
  attribute vec2 aScale;
  attribute float aPhase;
  attribute float aOpacity;
  attribute vec2 aDrift;
  attribute float aRot;
  uniform float uTime;
  uniform float uBillboard;
  uniform float uPulseBase;
  uniform float uPulseAmp;
  uniform float uPulseSpeed;
  uniform float uOpacityCap;
  uniform float uDriftSpeedX;
  uniform float uDriftSpeedZ;
  uniform float uRotSpeed;
  uniform float uWobbleAmp;
  varying float vFogOpacity;
`

// Convertit une liste de patches (coords absolues) en InstancedBufferGeometry.
function buildFogGeometry(items) {
  const base = new PlaneGeometry(1, 1)
  const geometry = new InstancedBufferGeometry()
  geometry.index = base.index
  geometry.setAttribute('position', base.getAttribute('position'))
  geometry.setAttribute('uv', base.getAttribute('uv'))

  const count = items.length
  const offset = new Float32Array(count * 3)
  const scale = new Float32Array(count * 2)
  const phase = new Float32Array(count)
  const opacity = new Float32Array(count)
  const drift = new Float32Array(count * 2)
  const rot = new Float32Array(count)
  items.forEach((it, i) => {
    offset[i * 3] = it.x; offset[i * 3 + 1] = it.y; offset[i * 3 + 2] = it.z
    scale[i * 2] = it.w; scale[i * 2 + 1] = it.h
    phase[i] = it.phase
    opacity[i] = it.opacity
    drift[i * 2] = it.driftAmpX; drift[i * 2 + 1] = it.driftAmpZ
    rot[i] = it.rot
  })
  geometry.setAttribute('aOffset', new InstancedBufferAttribute(offset, 3))
  geometry.setAttribute('aScale', new InstancedBufferAttribute(scale, 2))
  geometry.setAttribute('aPhase', new InstancedBufferAttribute(phase, 1))
  geometry.setAttribute('aOpacity', new InstancedBufferAttribute(opacity, 1))
  geometry.setAttribute('aDrift', new InstancedBufferAttribute(drift, 2))
  geometry.setAttribute('aRot', new InstancedBufferAttribute(rot, 1))
  geometry.instanceCount = count
  return geometry
}

function buildFogMaterial(texture, color, params) {
  const material = new MeshBasicMaterial({
    map: texture,
    color: new Color(color),
    transparent: true,
    depthWrite: false,
    blending: NormalBlending,
    side: DoubleSide,
    alphaTest: 0.015,
    fog: false,
  })
  const uniforms = {
    uTime: { value: 0 },
    uBillboard: { value: params.billboard ? 1 : 0 },
    uPulseBase: { value: params.pulseBase },
    uPulseAmp: { value: params.pulseAmp },
    uPulseSpeed: { value: params.pulseSpeed },
    uOpacityCap: { value: params.opacityCap },
    uDriftSpeedX: { value: params.driftSpeedX },
    uDriftSpeedZ: { value: params.driftSpeedZ },
    uRotSpeed: { value: params.rotSpeed },
    uWobbleAmp: { value: params.wobbleAmp ?? 0 },
  }
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = FOG_INSTANCE_HEADER + shader.vertexShader
      .replace('#include <begin_vertex>', /* glsl */ `
        vFogOpacity = min(uOpacityCap, aOpacity * (uPulseBase + sin(uTime * uPulseSpeed + aPhase) * uPulseAmp));
        vec3 fogCenter = aOffset;
        fogCenter.x += sin(uTime * uDriftSpeedX + aPhase) * aDrift.x;
        fogCenter.z += cos(uTime * uDriftSpeedZ + aPhase) * aDrift.y;
        float fogAngle = (uBillboard > 0.5) ? (sin(uTime * uRotSpeed + aPhase) * uWobbleAmp) : (aRot + uTime * uRotSpeed);
        float fogCos = cos(fogAngle);
        float fogSin = sin(fogAngle);
        vec2 fogQuad = position.xy * aScale;
        vec2 fogRot = vec2(fogCos * fogQuad.x - fogSin * fogQuad.y, fogSin * fogQuad.x + fogCos * fogQuad.y);
        vec2 fogBillboardQuad = vec2(0.0);
        vec3 transformed;
        if (uBillboard > 0.5) {
          transformed = fogCenter;
          fogBillboardQuad = fogRot;
        } else {
          transformed = fogCenter + vec3(fogRot.x, 0.0, fogRot.y);
        }
      `)
      .replace('#include <project_vertex>', /* glsl */ `
        vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
        mvPosition.xy += fogBillboardQuad;
        gl_Position = projectionMatrix * mvPosition;
      `)
    shader.fragmentShader = 'varying float vFogOpacity;\n' + shader.fragmentShader
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        'vec4 diffuseColor = vec4( diffuse, opacity * vFogOpacity );',
      )
  }
  material.userData.fogUniforms = uniforms
  return material
}

function InstancedFogLayer({ items, texture, color, params, renderOrder }) {
  const geometry = useMemo(() => buildFogGeometry(items), [items])
  const material = useMemo(() => buildFogMaterial(texture, color, params), [texture, color, params])

  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => material.dispose(), [material])

  useFrame((state) => {
    // eslint-disable-next-line react-hooks/immutability -- per-frame uniform write (r3f pattern)
    material.userData.fogUniforms.uTime.value = state.clock.elapsedTime
  })

  if (!items.length) return null
  return (
    <mesh
      geometry={geometry}
      material={material}
      frustumCulled={false}
      renderOrder={renderOrder}
      userData={{ debugCategory: 'instanced-fog' }}
    />
  )
}

// Aplatit les patches de toutes les zones en listes absolues {x,y,z,w,h,...} par type.
function flattenGraveyardFog(areas) {
  const ground = []
  const billboard = []
  for (const area of areas) {
    if (!(area.fogIntensity > 0.01)) continue
    for (const patch of makeFogPatches(area)) {
      const item = {
        x: area.center[0] + patch.x,
        y: patch.y,
        z: area.center[1] + patch.z,
        w: patch.scale[0],
        h: patch.scale[1],
        phase: patch.phase,
        opacity: patch.opacity,
        driftAmpX: patch.driftX * area.radius,
        driftAmpZ: patch.driftZ * area.radius,
        rot: patch.rotation,
      }
      ;(patch.type === 'ground' ? ground : billboard).push(item)
    }
  }
  return { ground, billboard }
}

function flattenPaintedFog(areas) {
  const ground = []
  const billboard = []
  for (const patch of makePaintedFogPatches(areas)) {
    const item = {
      x: patch.x,
      y: patch.y,
      z: patch.z,
      w: patch.scale[0],
      h: patch.scale[1],
      phase: patch.phase,
      opacity: patch.opacity,
      driftAmpX: patch.driftX * 20,
      driftAmpZ: patch.driftZ * 20,
      rot: patch.rotation,
    }
    ;(patch.type === 'ground' ? ground : billboard).push(item)
  }
  return { ground, billboard }
}

function samplePaintedFogAreas(areas) {
  if (areas.length <= PAINTED_FOG_MAX_AREAS) return areas

  const step = areas.length / PAINTED_FOG_MAX_AREAS
  return Array.from({ length: PAINTED_FOG_MAX_AREAS }, (_, index) => (
    areas[Math.floor(index * step)]
  ))
}

function makePaintedFogPatches(areas) {
  return samplePaintedFogAreas(areas).flatMap((area, areaIndex) => {
    const [centerX, centerZ] = area.center
    const seedBase = areaIndex * 997 + area.id.length * 37
    const angle = seededRandom(seedBase + 3) * Math.PI * 2
    const distance = seededRandom(seedBase + 7) * area.radius * 0.32
    const x = centerX + Math.cos(angle) * distance
    const z = centerZ + Math.sin(angle) * distance
    const y = getTerrainHeight(x, z)
    const opacity = area.fogIntensity

    return [
      {
        id: `${area.id}_paint_fog_ground`,
        type: 'ground',
        x,
        z,
        y: y + 0.26 + seededRandom(seedBase + 11) * 0.28,
        scale: [
          area.radius * (1.45 + seededRandom(seedBase + 13) * 0.65),
          area.radius * (0.82 + seededRandom(seedBase + 17) * 0.5),
          1,
        ],
        rotation: seededRandom(seedBase + 19) * Math.PI * 2,
        phase: seededRandom(seedBase + 23) * Math.PI * 2,
        driftX: (seededRandom(seedBase + 29) - 0.5) * 0.018,
        driftZ: (seededRandom(seedBase + 31) - 0.5) * 0.018,
        opacity: (0.13 + seededRandom(seedBase + 37) * 0.12) * opacity,
      },
      {
        id: `${area.id}_paint_fog_billboard`,
        type: 'billboard',
        x,
        z,
        y: y + 0.9 + seededRandom(seedBase + 41) * 1.1,
        scale: [
          area.radius * (0.95 + seededRandom(seedBase + 43) * 0.62),
          area.radius * (0.65 + seededRandom(seedBase + 47) * 0.44),
          1,
        ],
        rotation: 0,
        phase: seededRandom(seedBase + 53) * Math.PI * 2,
        driftX: (seededRandom(seedBase + 59) - 0.5) * 0.014,
        driftZ: (seededRandom(seedBase + 61) - 0.5) * 0.014,
        opacity: (0.08 + seededRandom(seedBase + 67) * 0.08) * opacity,
      },
    ]
  })
}

// Particules d'ambiance uniquement (la brume est désormais rendue en instancié
// au niveau de BiomeAmbientEffects, plus par zone).
function GraveyardAmbience({ area }) {
  const preset = useMemo(() => makeWispPreset(area), [area])
  const clusters = useMemo(() => makeWispClusters(area), [area])

  if (!(area.particleIntensity > 0.01)) return null

  return (
    <group userData={{ debugCategory: 'graveyard-ambience', biomeAreaId: area.id }}>
      {clusters.map((cluster) => {
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
  const graveyardAreas = areas.filter((area) => area.biome === 'graveyard' && area.ambient !== false)

  // Texture partagée par toutes les couches de brume (créée une seule fois).
  const fogTexture = useMemo(() => createFogSheetTexture(), [])
  useEffect(() => () => fogTexture.dispose(), [fogTexture])

  // Tous les patches de brume aplatis en 4 couches instanciées (au lieu de ~4500 meshes).
  const fog = useMemo(() => {
    const paintedFogAreas = areas.filter((area) => (
      area.biome === 'graveyard' && area.source === 'paint' && area.fogIntensity > 0.01
    ))
    return {
      graveyard: flattenGraveyardFog(graveyardAreas),
      painted: flattenPaintedFog(paintedFogAreas),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areas])

  return (
    <group userData={{ debugCategory: 'biome-ambient-effects' }}>
      {graveyardAreas.map((area) => (
        <GraveyardAmbience key={area.id} area={area} />
      ))}
      <InstancedFogLayer items={fog.graveyard.ground} texture={fogTexture} color="#b7c4b8" params={GRAVEYARD_GROUND_PARAMS} renderOrder={12} />
      <InstancedFogLayer items={fog.graveyard.billboard} texture={fogTexture} color="#adcac0" params={GRAVEYARD_BILLBOARD_PARAMS} renderOrder={12} />
      <InstancedFogLayer items={fog.painted.ground} texture={fogTexture} color="#b8c4b8" params={PAINTED_GROUND_PARAMS} renderOrder={11} />
      <InstancedFogLayer items={fog.painted.billboard} texture={fogTexture} color="#a9c5bd" params={PAINTED_BILLBOARD_PARAMS} renderOrder={11} />
    </group>
  )
}
