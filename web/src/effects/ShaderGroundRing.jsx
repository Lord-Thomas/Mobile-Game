import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending,
  CircleGeometry,
  Color,
  DoubleSide,
} from 'three'

const RING_GEOMETRY = new CircleGeometry(1, 128)

const VERTEX_SHADER = /* glsl */ `
  varying vec2 vLocal;

  void main() {
    vLocal = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const FRAGMENT_SHADER = /* glsl */ `
  varying vec2 vLocal;

  uniform float uTime;
  uniform float uRadius;
  uniform float uExtent;
  uniform float uThickness;
  uniform float uEdgeSoftness;
  uniform float uNoiseScale;
  uniform float uNoiseStrength;
  uniform float uFlowSpeed;
  uniform float uFlameHeight;
  uniform float uFlameFrequency;
  uniform float uIntensity;
  uniform float uOpacity;
  uniform vec3 uColorHot;
  uniform vec3 uColorMid;
  uniform vec3 uColorDark;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise21(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
      mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.55;
    for (int i = 0; i < 4; i++) {
      value += noise21(p) * amplitude;
      p = p * 2.07 + vec2(7.1, 13.7);
      amplitude *= 0.48;
    }
    return value;
  }

  void main() {
    float worldRadius = length(vLocal) * uExtent;
    float angle = atan(vLocal.y, vLocal.x) / 6.2831853 + 0.5;
    float flow = uTime * uFlowSpeed;

    float broadNoise = fbm(vec2(angle * uNoiseScale, flow * 0.34));
    float fineNoise = fbm(vec2(angle * uNoiseScale * 2.35 + 4.7, -flow * 0.58));
    float flameWave = 0.5 + 0.5 * sin(
      angle * 6.2831853 * uFlameFrequency
      + flow * 2.2
      + broadNoise * 5.0
    );
    float flameNoise = smoothstep(0.2, 0.95, broadNoise * 0.62 + fineNoise * 0.38);
    float outerFlame = flameWave * flameNoise * uFlameHeight * uThickness;
    float warpedRadius = uRadius
      + (broadNoise - 0.5) * uNoiseStrength * uThickness
      + outerFlame;
    float distanceToRing = abs(worldRadius - warpedRadius);
    float distanceFromBase = worldRadius - uRadius;
    float flameReach = uThickness * (
      0.42
      + uFlameHeight * (0.18 + flameWave * flameNoise * 1.55)
    );

    float softness = max(0.01, uEdgeSoftness * uThickness);
    float core = 1.0 - smoothstep(
      max(0.01, uThickness * 0.08),
      max(0.02, uThickness * 0.34 + softness),
      distanceToRing
    );
    float body = 1.0 - smoothstep(
      max(0.02, uThickness * 0.3),
      max(0.04, uThickness * 0.72 + softness),
      distanceToRing
    );
    float halo = 1.0 - smoothstep(
      max(0.04, uThickness * 0.6),
      max(0.08, uThickness * 1.9 + softness * 2.0),
      distanceToRing
    );
    float tongues = (
      1.0 - smoothstep(flameReach - softness, flameReach + softness, distanceFromBase)
    ) * smoothstep(-uThickness * 0.08, uThickness * 0.24, distanceFromBase);
    tongues *= smoothstep(0.18, 0.72, flameNoise + flameWave * 0.34);
    body = max(body, tongues * 0.82);
    halo = max(halo, tongues * 0.56);

    float heat = clamp(core * 0.9 + body * 0.42 + fineNoise * body * 0.24 + tongues * 0.2, 0.0, 1.0);
    vec3 color = mix(uColorDark, uColorMid, smoothstep(0.08, 0.7, heat));
    color = mix(color, uColorHot, smoothstep(0.62, 1.0, heat));
    float alpha = (halo * 0.22 + body * 0.64 + core * 0.44) * uOpacity;

    if (alpha < 0.01) discard;
    gl_FragColor = vec4(color * uIntensity, alpha);
    #include <colorspace_fragment>
  }
`

export default function ShaderGroundRing({ ring, timeRef }) {
  const meshRef = useRef(null)
  const materialRef = useRef(null)
  const extent = useMemo(() => (
    Math.max(ring.startRadius, ring.endRadius)
      + ring.thickness * (2.2 + ring.flameHeight)
  ), [ring.endRadius, ring.flameHeight, ring.startRadius, ring.thickness])
  const signature = JSON.stringify(ring)
  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uRadius: { value: ring.startRadius },
    uExtent: { value: extent },
    uThickness: { value: ring.thickness },
    uEdgeSoftness: { value: ring.edgeSoftness },
    uNoiseScale: { value: ring.noiseScale },
    uNoiseStrength: { value: ring.noiseStrength },
    uFlowSpeed: { value: ring.flowSpeed },
    uFlameHeight: { value: ring.flameHeight },
    uFlameFrequency: { value: ring.flameFrequency },
    uIntensity: { value: ring.intensity },
    uOpacity: { value: 0 },
    uColorHot: { value: new Color(ring.colorHot) },
    uColorMid: { value: new Color(ring.colorMid) },
    uColorDark: { value: new Color(ring.colorDark) },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [signature, extent])

  useFrame(() => {
    const time = timeRef.current
    const localTime = time - ring.delay
    const progress = Math.min(1, Math.max(0, localTime / Math.max(0.05, ring.duration)))
    const active = ring.enabled && localTime >= 0 && localTime <= ring.duration
    const eased = 1 - Math.pow(1 - progress, 3)
    const radius = ring.startRadius + (ring.endRadius - ring.startRadius) * eased
    const envelope = active
      ? (ring.fadeOut ? Math.pow(1 - progress, 0.7) : 1)
      : 0

    if (meshRef.current) meshRef.current.visible = envelope > 0.001
    if (!materialRef.current) return
    materialRef.current.uniforms.uTime.value = time
    materialRef.current.uniforms.uRadius.value = radius
    materialRef.current.uniforms.uOpacity.value = ring.opacity * envelope
  })

  return (
    <mesh
      ref={meshRef}
      geometry={RING_GEOMETRY}
      position={[0, ring.offsetY, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      scale={[extent, extent, 1]}
      visible={false}
      frustumCulled={false}
      userData={{ shaderWarmupWhenHidden: true, debugCategory: 'warmup' }}
    >
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={VERTEX_SHADER}
        fragmentShader={FRAGMENT_SHADER}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
        side={DoubleSide}
        toneMapped={false}
      />
    </mesh>
  )
}
