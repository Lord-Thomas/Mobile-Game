import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, Color, DoubleSide, SphereGeometry } from 'three'

// Noise-displaced "energy ball" shell — the generalized, preset-driven version
// of the fireball flame shader from App.jsx. Combined with particle emitters it
// lets a single preset describe complex spells (fire, lightning, ice...).

const SHELL_GEOMETRY = new SphereGeometry(1, 32, 32)

const NOISE_GLSL = /* glsl */ `
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  vec3 fade3(vec3 f) {
    return f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  }

  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = fade3(f);
    return mix(
      mix(
        mix(hash(i + vec3(0.0, 0.0, 0.0)), hash(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x),
        f.y
      ),
      mix(
        mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x),
        f.y
      ),
      f.z
    );
  }

  float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 4; i++) {
      value += amplitude * noise(p);
      p = p * 2.03 + vec3(11.7, 3.1, 8.3);
      amplitude *= 0.5;
    }
    return value;
  }

  float turbulenceNoise(vec3 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 4; i++) {
      value += abs(noise(p) * 2.0 - 1.0) * amplitude;
      p = p * 2.11 + vec3(6.4, 2.8, 12.1);
      amplitude *= 0.48;
    }
    return value;
  }

  float ridgedFbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.55;
    for (int i = 0; i < 4; i++) {
      float n = noise(p);
      n = 1.0 - abs(n * 2.0 - 1.0);
      n *= n;
      value += n * amplitude;
      p = p * 2.17 + vec3(4.2, 10.8, 1.7);
      amplitude *= 0.5;
    }
    return value;
  }

  vec2 rotate2d(vec2 p, float angle) {
    float s = sin(angle);
    float c = cos(angle);
    return mat2(c, -s, s, c) * p;
  }
`

const VERTEX_SHADER = /* glsl */ `
  varying vec3 vLocalPosition;
  varying vec3 vViewNormal;
  varying vec3 vViewDirection;

  uniform float uTime;
  uniform float uDistortion;
  uniform float uNoiseScale;

  ${NOISE_GLSL}

  void main() {
    vLocalPosition = position;

    vec3 flowPosition = position * uNoiseScale;
    flowPosition.xz = rotate2d(flowPosition.xz, noise(flowPosition * 2.1 + uTime * 0.3) * 1.8);
    flowPosition.y += uTime * 0.42;

    float body = fbm(flowPosition * 3.2 + vec3(0.0, uTime * 1.9, 0.0));
    float tongues = ridgedFbm(flowPosition * 6.8 + vec3(uTime * 0.3, -uTime * 2.8, uTime * 0.18));
    float displacement = ((body - 0.34) * 0.74 + tongues * 0.46) * uDistortion;
    vec3 displaced = position + normal * displacement;

    vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
    vViewNormal = normalize(normalMatrix * normal);
    vViewDirection = normalize(-mvPosition.xyz);

    gl_Position = projectionMatrix * mvPosition;
  }
`

const FRAGMENT_SHADER = /* glsl */ `
  varying vec3 vLocalPosition;
  varying vec3 vViewNormal;
  varying vec3 vViewDirection;

  uniform float uTime;
  uniform float uOpacity;
  uniform float uNoiseScale;
  uniform vec3 uColorHot;
  uniform vec3 uColorMid;
  uniform vec3 uColorDark;

  ${NOISE_GLSL}

  void main() {
    vec3 normal = normalize(vViewNormal);
    vec3 viewDirection = normalize(vViewDirection);
    float fresnel = pow(1.0 - max(dot(normal, viewDirection), 0.0), 1.25);
    float radial = clamp(length(vLocalPosition), 0.0, 1.3);

    vec3 flowPosition = vLocalPosition * uNoiseScale;
    float swirl = fbm(flowPosition * 2.1 + vec3(0.0, uTime * 0.55, 0.0));
    flowPosition.xz = rotate2d(flowPosition.xz, (swirl - 0.5) * 2.3 + uTime * 0.28);
    flowPosition.y += uTime * 0.62;

    float body = fbm(flowPosition * 3.35 + vec3(uTime * 0.15, uTime * 2.25, -uTime * 0.08));
    float tongues = ridgedFbm(flowPosition * 6.8 + vec3(-uTime * 0.38, uTime * 3.55, uTime * 0.24));
    float tornEdge = turbulenceNoise(flowPosition * 9.4 + vec3(uTime * 0.9, -uTime * 2.2, uTime * 0.35));
    float energyNoise = body * 0.48 + tongues * 0.42 + (1.0 - tornEdge) * 0.1;
    float innerHeat = smoothstep(0.92, 0.18, radial);
    float heat = smoothstep(0.12, 1.0, energyNoise + fresnel * 0.36 + innerHeat * 0.34);

    vec3 color = mix(uColorDark, uColorMid, heat);
    color = mix(color, uColorHot, smoothstep(0.72, 1.0, heat));

    float holes = smoothstep(0.36, 0.72, tornEdge - body * 0.18);
    float edgeBreakup = smoothstep(0.18, 0.94, energyNoise + fresnel * 0.32);
    float shellFade = smoothstep(0.08, 0.92, radial) * (1.0 - smoothstep(1.08, 1.26, radial));
    float alpha = edgeBreakup * shellFade * (1.0 - holes * 0.42) * uOpacity;

    if (alpha < 0.025) discard;
    gl_FragColor = vec4(color, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

// timeRef is the shared effect clock owned by ParticleEffect, so shells stay in
// sync with the particle emitters (fade-out, scaleEnd over the effect duration).
export default function ShaderShell({ shell, duration, loop, timeRef, phase = 0 }) {
  const meshRef = useRef(null)
  const materialRef = useRef(null)

  const signature = JSON.stringify(shell)
  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uOpacity: { value: shell.opacity },
    uDistortion: { value: shell.distortion },
    uNoiseScale: { value: shell.noiseScale },
    uColorHot: { value: new Color(shell.colorHot) },
    uColorMid: { value: new Color(shell.colorMid) },
    uColorDark: { value: new Color(shell.colorDark) },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [signature])

  useFrame(() => {
    const time = timeRef.current
    const progress = loop ? 0 : Math.min(1, Math.max(0, time / Math.max(0.05, duration)))
    const envelope = shell.fadeOut && !loop ? Math.max(0, 1 - progress) : 1

    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = time * shell.speed + phase
      materialRef.current.uniforms.uOpacity.value = shell.opacity * envelope
    }
    if (meshRef.current) {
      const growth = loop ? 1 : 1 + (shell.scaleEnd - 1) * progress
      const wobbleTime = (time + phase) * shell.speed
      const wobble = shell.wobble * 0.08
      meshRef.current.rotation.x += 0.035 * shell.spin
      meshRef.current.rotation.y += 0.058 * shell.spin
      meshRef.current.scale.set(
        shell.radius * growth * (1.06 + Math.sin(wobbleTime * 17.0) * wobble),
        shell.radius * growth * (0.92 + Math.cos(wobbleTime * 14.0) * wobble),
        shell.radius * growth * (1.1 + Math.sin(wobbleTime * 12.0) * wobble),
      )
      meshRef.current.visible = envelope > 0.01 && (loop || time <= duration)
    }
  })

  return (
    <mesh ref={meshRef} position={shell.offset} geometry={SHELL_GEOMETRY}>
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={VERTEX_SHADER}
        fragmentShader={FRAGMENT_SHADER}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
        side={DoubleSide}
      />
    </mesh>
  )
}
