import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  NormalBlending,
  ShaderMaterial,
  Vector3,
} from 'three'
import { getParticleTexture } from './particleTextures'
import ShaderShell from './ShaderShell'

// GPU particle renderer. Each emitter is a single THREE.Points whose particles
// are fully simulated in the vertex shader: the only per-frame CPU work is one
// uTime uniform update. Particles are a fixed pool baked into the geometry and
// recycled by wrapping time, so nothing is allocated during playback.

const VERTEX_SHADER = /* glsl */ `
  attribute vec3 aVelocity;
  attribute vec4 aRandom;

  uniform float uTime;
  uniform float uDuration;
  uniform float uLoop;
  uniform float uMode; // 0 = burst, 1 = continuous
  uniform float uDelay;
  uniform float uLifetime;
  uniform float uLifetimeVariance;
  uniform float uMotionScale;
  uniform float uGravity;
  uniform float uTurbulence;
  uniform float uRotationSpeed;
  uniform float uSizeStart;
  uniform float uSizeEnd;
  uniform float uSizeVariance;
  uniform vec3 uColorStart;
  uniform vec3 uColorEnd;
  uniform float uAlphaStart;
  uniform float uAlphaEnd;
  uniform float uPixelScale;

  varying vec3 vColor;
  varying float vAlpha;
  varying float vRotation;

  void main() {
    float life = max(0.05, uLifetime * (1.0 + (aRandom.y * 2.0 - 1.0) * uLifetimeVariance));
    float birth = uDelay + (uMode > 0.5 ? aRandom.x * life : aRandom.x * 0.04);
    float elapsed = uTime - birth;

    float t = -1.0;
    if (uLoop > 0.5) {
      float period = uMode > 0.5 ? life : max(uDuration, life + uDelay);
      t = mod(elapsed, period) / life;
    } else if (uMode > 0.5) {
      // Continuous emission: each slot respawns until the effect duration ends.
      if (elapsed >= 0.0) {
        float cycles = floor(elapsed / life);
        float spawnTime = birth + cycles * life;
        t = spawnTime <= uDuration + 0.0001 ? (uTime - spawnTime) / life : -1.0;
      }
    } else {
      t = elapsed / life;
    }

    if (t < 0.0 || t > 1.0) {
      gl_Position = vec4(0.0, 0.0, -2.0, 1.0);
      gl_PointSize = 0.0;
      vColor = vec3(0.0);
      vAlpha = 0.0;
      vRotation = 0.0;
      return;
    }

    float age = t * life;
    float motionAge = age * uMotionScale;
    vec3 pos = position + aVelocity * motionAge;
    pos.y += 0.5 * uGravity * motionAge * motionAge;
    pos += vec3(
      sin(motionAge * 7.0 + aRandom.w * 41.0),
      sin(motionAge * 5.3 + aRandom.z * 37.0),
      cos(motionAge * 6.1 + aRandom.x * 43.0)
    ) * uTurbulence * uMotionScale * 0.25 * t;

    vColor = mix(uColorStart, uColorEnd, t);
    vAlpha = mix(uAlphaStart, uAlphaEnd, t);
    vRotation = aRandom.w * 6.2831 + uRotationSpeed * motionAge;

    float size = mix(uSizeStart, uSizeEnd, t) * (1.0 + (aRandom.z * 2.0 - 1.0) * uSizeVariance);
    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = clamp(size * uPixelScale / max(0.1, -mvPosition.z), 0.0, 320.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`

const FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D uMap;

  varying vec3 vColor;
  varying float vAlpha;
  varying float vRotation;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float c = cos(vRotation);
    float s = sin(vRotation);
    uv = vec2(c * uv.x - s * uv.y, s * uv.x + c * uv.y);
    if (abs(uv.x) > 0.5 || abs(uv.y) > 0.5) discard;
    vec4 tex = texture2D(uMap, uv + 0.5);
    float alpha = tex.a * vAlpha;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(vColor * tex.rgb, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function randomUnitVector(rng, target) {
  const z = rng() * 2 - 1
  const angle = rng() * Math.PI * 2
  const r = Math.sqrt(Math.max(0, 1 - z * z))
  return target.set(r * Math.cos(angle), z, r * Math.sin(angle))
}

const tmpDir = new Vector3()
const tmpRandom = new Vector3()
const tmpBase = new Vector3()

function buildGeometry(emitter, seed) {
  const rng = mulberry32(seed)
  const count = emitter.count
  const positions = new Float32Array(count * 3)
  const velocities = new Float32Array(count * 3)
  const randoms = new Float32Array(count * 4)

  tmpBase.set(emitter.direction[0], emitter.direction[1], emitter.direction[2])
  if (tmpBase.lengthSq() < 1e-6) tmpBase.set(0, 1, 0)
  tmpBase.normalize()

  for (let i = 0; i < count; i += 1) {
    let px = 0
    let py = 0
    let pz = 0

    randomUnitVector(rng, tmpRandom)

    switch (emitter.shape) {
      case 'sphere': {
        px = tmpRandom.x * emitter.radius
        py = tmpRandom.y * emitter.radius
        pz = tmpRandom.z * emitter.radius
        // Outward burst, bent toward the base direction as spread decreases
        tmpDir.copy(tmpRandom).lerp(tmpBase, 1 - emitter.spread).normalize()
        break
      }
      case 'circle': {
        const angle = rng() * Math.PI * 2
        const r = Math.sqrt(rng()) * emitter.radius
        px = Math.cos(angle) * r
        pz = Math.sin(angle) * r
        tmpDir.copy(tmpBase).lerp(tmpRandom, emitter.spread).normalize()
        break
      }
      case 'cone': {
        const angle = rng() * Math.PI * 2
        const r = Math.sqrt(rng()) * emitter.radius
        px = Math.cos(angle) * r
        pz = Math.sin(angle) * r
        // Cone half-angle grows with spread; particles fly up and out
        const coneAngle = emitter.spread * Math.PI * 0.5
        const theta = rng() * coneAngle
        const phi = rng() * Math.PI * 2
        tmpDir.set(
          Math.sin(theta) * Math.cos(phi),
          Math.cos(theta),
          Math.sin(theta) * Math.sin(phi),
        )
        break
      }
      case 'box': {
        px = (rng() * 2 - 1) * emitter.radius
        py = (rng() * 2 - 1) * emitter.radius
        pz = (rng() * 2 - 1) * emitter.radius
        tmpDir.copy(tmpBase).lerp(tmpRandom, emitter.spread).normalize()
        break
      }
      case 'point':
      default: {
        tmpDir.copy(tmpBase).lerp(tmpRandom, emitter.spread).normalize()
        break
      }
    }

    const speed = emitter.speed * (1 + (rng() * 2 - 1) * emitter.speedVariance)
    positions[i * 3] = px
    positions[i * 3 + 1] = py
    positions[i * 3 + 2] = pz
    velocities[i * 3] = tmpDir.x * speed
    velocities[i * 3 + 1] = tmpDir.y * speed
    velocities[i * 3 + 2] = tmpDir.z * speed
    randoms[i * 4] = rng()
    randoms[i * 4 + 1] = rng()
    randoms[i * 4 + 2] = rng()
    randoms[i * 4 + 3] = rng()
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('aVelocity', new BufferAttribute(velocities, 3))
  geometry.setAttribute('aRandom', new BufferAttribute(randoms, 4))
  // Particles travel; skip culling instead of recomputing bounds per frame.
  geometry.boundingSphere = null
  return geometry
}

function buildMaterial(emitter, preset, loop) {
  return new ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    blending: emitter.blending === 'additive' ? AdditiveBlending : NormalBlending,
    uniforms: {
      uTime: { value: -1 },
      uDuration: { value: preset.duration },
      uLoop: { value: loop ? 1 : 0 },
      uMode: { value: emitter.mode === 'loop' ? 1 : 0 },
      uDelay: { value: emitter.delay },
      uLifetime: { value: emitter.lifetime },
      uLifetimeVariance: { value: emitter.lifetimeVariance },
      uMotionScale: { value: emitter.motionScale },
      uGravity: { value: emitter.gravity },
      uTurbulence: { value: emitter.turbulence },
      uRotationSpeed: { value: emitter.rotationSpeed },
      uSizeStart: { value: emitter.sizeStart },
      uSizeEnd: { value: emitter.sizeEnd },
      uSizeVariance: { value: emitter.sizeVariance },
      uColorStart: { value: new Color(emitter.colorStart) },
      uColorEnd: { value: new Color(emitter.colorEnd) },
      uAlphaStart: { value: emitter.alphaStart },
      uAlphaEnd: { value: emitter.alphaEnd },
      uPixelScale: { value: 400 },
      uMap: { value: getParticleTexture(emitter.texture) },
    },
  })
}

function EmitterPoints({ emitter, preset, loop, seed, registerMaterial }) {
  const signature = JSON.stringify(emitter)
  const geometry = useMemo(
    () => buildGeometry(emitter, seed),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [signature, seed],
  )
  const material = useMemo(
    () => buildMaterial(emitter, preset, loop),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [signature, preset.duration, loop],
  )

  useEffect(() => {
    registerMaterial(material)
    return () => registerMaterial(material, true)
  }, [material, registerMaterial])

  useEffect(() => () => {
    geometry.dispose()
  }, [geometry])
  useEffect(() => () => {
    material.dispose()
  }, [material])

  return (
    <points
      geometry={geometry}
      material={material}
      position={emitter.offset}
      frustumCulled={false}
    />
  )
}

function computeEffectTotalTime(preset) {
  let total = preset.duration
  for (const emitter of preset.emitters) {
    const maxLife = emitter.lifetime * (1 + emitter.lifetimeVariance)
    const end = emitter.mode === 'loop'
      ? preset.duration + maxLife
      : emitter.delay + maxLife
    total = Math.max(total, end)
  }
  return total
}

export default function ParticleEffect({
  preset,
  playing = true,
  loop = false,
  playbackId = 0,
  position = [0, 0, 0],
  onComplete,
}) {
  const isLoop = loop || preset.loop
  const startRef = useRef(null)
  const doneRef = useRef(false)
  const materialsRef = useRef(new Set())
  const lightRef = useRef()
  // Shared effect clock read by the shader shells so they stay in sync.
  const timeRef = useRef(0)
  const totalTime = useMemo(() => computeEffectTotalTime(preset), [preset])

  useEffect(() => {
    startRef.current = null
    doneRef.current = false
  }, [playbackId, preset, isLoop, playing])

  const registerMaterial = useMemo(() => (material, remove = false) => {
    if (remove) materialsRef.current.delete(material)
    else materialsRef.current.add(material)
  }, [])

  useFrame((state) => {
    if (!playing) return
    if (startRef.current === null) startRef.current = state.clock.elapsedTime
    const time = state.clock.elapsedTime - startRef.current
    timeRef.current = time
    const pixelScale = (state.size.height * state.viewport.dpr)
      / (2 * Math.tan((state.camera.fov * Math.PI) / 360))

    for (const material of materialsRef.current) {
      // eslint-disable-next-line react-hooks/immutability -- per-frame uniform writes are the standard r3f pattern
      material.uniforms.uTime.value = time
      material.uniforms.uPixelScale.value = pixelScale
    }

    if (lightRef.current) {
      const base = preset.light.intensity
      if (isLoop) {
        lightRef.current.intensity = base * (0.8 + 0.2 * Math.sin(time * 9))
      } else {
        const t = time / Math.max(0.05, preset.duration)
        lightRef.current.intensity = t >= 1 ? 0 : base * (1 - t) * (1 - t)
      }
    }

    if (!isLoop && !doneRef.current && time > totalTime) {
      doneRef.current = true
      onComplete?.()
    }
  })

  return (
    <group position={position} visible={playing}>
      {preset.emitters.map((emitter, index) => (
        <EmitterPoints
          key={index}
          emitter={emitter}
          preset={preset}
          loop={isLoop}
          seed={1337 + index * 101}
          registerMaterial={registerMaterial}
        />
      ))}
      {(preset.shells ?? []).map((shell, index) => (
        <ShaderShell
          key={index}
          shell={shell}
          duration={preset.duration}
          loop={isLoop}
          timeRef={timeRef}
          phase={index * 7.3}
        />
      ))}
      {preset.light.enabled && (
        <pointLight
          ref={lightRef}
          color={preset.light.color}
          intensity={0}
          distance={7}
          decay={2}
          position={[0, 0.6, 0]}
        />
      )}
    </group>
  )
}
