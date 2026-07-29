import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  CircleGeometry,
  Color,
  DoubleSide,
  NormalBlending,
} from 'three'

const ZONE_GEOMETRY = new CircleGeometry(1, 96)

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
  uniform float uRadiusRatio;
  uniform float uEdgeSoftness;
  uniform float uNoiseScale;
  uniform float uNoiseStrength;
  uniform float uFlowSpeed;
  uniform float uPulseSpeed;
  uniform float uRimThickness;
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
      p = p * 2.03 + vec2(9.7, 4.3);
      amplitude *= 0.48;
    }
    return value;
  }

  void main() {
    float radius = length(vLocal);
    float angle = atan(vLocal.y, vLocal.x) / 6.2831853 + 0.5;
    float flow = uTime * uFlowSpeed;
    float broad = fbm(vec2(angle * uNoiseScale, radius * uNoiseScale - flow));
    float fine = fbm(vLocal * uNoiseScale * 2.4 + vec2(flow * 0.32, -flow * 0.47));
    float edge = uRadiusRatio + (broad - 0.5) * uNoiseStrength;
    float softness = max(0.005, uEdgeSoftness * 0.18);
    float mask = 1.0 - smoothstep(edge - softness, edge + softness, radius);
    float rimDistance = abs(radius - edge);
    float rim = 1.0 - smoothstep(
      max(0.005, uRimThickness * 0.18),
      max(0.01, uRimThickness),
      rimDistance
    );
    float veins = pow(max(0.0, 1.0 - abs(sin(
      (angle * 24.0 + radius * 13.0 + fine * 4.0) * 3.1415926
    ))), 9.0);
    float pulse = 0.72 + 0.28 * sin(uTime * uPulseSpeed + broad * 5.0);
    float heat = clamp(rim * 0.86 + veins * 0.55 + fine * 0.22 + pulse * 0.16, 0.0, 1.0);
    vec3 color = mix(uColorDark, uColorMid, smoothstep(0.08, 0.72, heat));
    color = mix(color, uColorHot, smoothstep(0.66, 1.0, heat));
    float alpha = mask * (0.24 + fine * 0.2 + veins * 0.34 + rim * 0.42) * uOpacity;

    if (alpha < 0.01) discard;
    gl_FragColor = vec4(color * uIntensity, alpha);
    #include <colorspace_fragment>
  }
`

export default function ShaderGroundZone({ zone, timeRef }) {
  const meshRef = useRef(null)
  const materialRef = useRef(null)
  const extent = useMemo(
    () => Math.max(zone.startRadius, zone.endRadius) * (1 + zone.noiseStrength + zone.edgeSoftness * 0.25),
    [zone.edgeSoftness, zone.endRadius, zone.noiseStrength, zone.startRadius],
  )
  const signature = JSON.stringify(zone)
  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uRadiusRatio: { value: zone.startRadius / extent },
    uEdgeSoftness: { value: zone.edgeSoftness },
    uNoiseScale: { value: zone.noiseScale },
    uNoiseStrength: { value: zone.noiseStrength * Math.max(zone.startRadius, zone.endRadius) / extent },
    uFlowSpeed: { value: zone.flowSpeed },
    uPulseSpeed: { value: zone.pulseSpeed },
    uRimThickness: { value: zone.rimThickness },
    uIntensity: { value: zone.intensity },
    uOpacity: { value: 0 },
    uColorHot: { value: new Color(zone.colorHot) },
    uColorMid: { value: new Color(zone.colorMid) },
    uColorDark: { value: new Color(zone.colorDark) },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [signature, extent])

  useFrame(() => {
    const time = timeRef.current
    const localTime = time - zone.delay
    const progress = Math.min(1, Math.max(0, localTime / Math.max(0.05, zone.duration)))
    const active = zone.enabled && localTime >= 0 && localTime <= zone.duration
    const eased = 1 - Math.pow(1 - progress, 3)
    const radius = zone.startRadius + (zone.endRadius - zone.startRadius) * eased
    const fadeIn = zone.fadeIn ? Math.min(1, progress / 0.12) : 1
    const fadeOut = zone.fadeOut ? Math.min(1, (1 - progress) / 0.16) : 1
    const envelope = active ? fadeIn * fadeOut : 0

    if (meshRef.current) meshRef.current.visible = envelope > 0.001
    if (!materialRef.current) return
    materialRef.current.uniforms.uTime.value = time
    materialRef.current.uniforms.uRadiusRatio.value = radius / extent
    materialRef.current.uniforms.uOpacity.value = zone.opacity * envelope
  })

  return (
    <mesh
      ref={meshRef}
      geometry={ZONE_GEOMETRY}
      position={[0, zone.offsetY, 0]}
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
        blending={NormalBlending}
        side={DoubleSide}
        toneMapped={false}
      />
    </mesh>
  )
}
