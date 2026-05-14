import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BackSide, Color, Vector3 } from 'three'

const SKY_VERTEX_SHADER = `
varying vec3 vWorldDirection;

void main() {
  vWorldDirection = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const SKY_FRAGMENT_SHADER = `
uniform float uTime;
uniform vec3 uSunDirection;
uniform vec3 uHorizonColor;
uniform vec3 uZenithColor;
uniform vec3 uCloudBaseColor;
uniform vec3 uCloudWarmColor;
uniform vec3 uCloudShadeColor;
varying vec3 vWorldDirection;

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

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  mat2 rotate = mat2(0.8, -0.6, 0.6, 0.8);

  for (int i = 0; i < 5; i++) {
    value += amplitude * noise(p);
    p = rotate * p * 2.02 + 17.13;
    amplitude *= 0.52;
  }

  return value;
}

float cloudLayer(vec2 uv, float altitude, float scale, float coverage, float softness, vec2 wind) {
  float broad = fbm(uv * scale + wind);
  float detail = fbm(uv * scale * 3.2 - wind * 0.7);
  float wisps = fbm(uv * scale * 7.5 + vec2(wind.y, -wind.x) * 0.35);
  float shaped = broad * 0.72 + detail * 0.22 + wisps * 0.06;
  shaped *= smoothstep(0.02, 0.55, altitude) * (1.0 - smoothstep(0.92, 1.0, altitude));
  return smoothstep(coverage, coverage + softness, shaped);
}

void main() {
  vec3 direction = normalize(vWorldDirection);
  float altitude = clamp(direction.y * 0.5 + 0.5, 0.0, 1.0);
  float horizon = 1.0 - smoothstep(0.0, 0.36, altitude);
  float zenith = smoothstep(0.18, 1.0, altitude);

  vec3 skyColor = mix(uHorizonColor, uZenithColor, pow(zenith, 0.72));
  skyColor += horizon * vec3(0.075, 0.065, 0.048);

  vec2 skyUv = direction.xz / max(direction.y + 0.38, 0.16);
  vec2 windA = vec2(uTime * 0.006, -uTime * 0.0025);
  vec2 windB = vec2(-uTime * 0.003, uTime * 0.004);
  float upperClouds = cloudLayer(skyUv + vec2(8.0, -2.0), altitude, 0.72, 0.51, 0.21, windA);
  float lowClouds = cloudLayer(skyUv + vec2(-3.5, 6.0), altitude, 1.05, 0.60, 0.18, windB) * 0.56;
  float cloudDensity = clamp(upperClouds + lowClouds, 0.0, 1.0);

  float sunDot = clamp(dot(direction, normalize(uSunDirection)), 0.0, 1.0);
  float sunGlow = pow(sunDot, 96.0) * 1.7 + pow(sunDot, 16.0) * 0.22;
  float cloudLight = 0.55 + 0.45 * pow(clamp(dot(normalize(vec3(direction.x, 0.34, direction.z)), normalize(uSunDirection)), 0.0, 1.0), 1.4);
  float silverEdge = pow(sunDot, 18.0) * smoothstep(0.18, 0.86, cloudDensity);

  vec3 cloudColor = mix(uCloudShadeColor, uCloudBaseColor, cloudLight);
  cloudColor = mix(cloudColor, uCloudWarmColor, silverEdge * 0.55 + sunGlow * 0.12);
  cloudColor += vec3(0.16, 0.13, 0.08) * silverEdge;

  float cloudMask = cloudDensity * smoothstep(0.14, 0.44, altitude) * (1.0 - smoothstep(0.94, 1.0, altitude));
  vec3 color = mix(skyColor, cloudColor, cloudMask * 0.66);
  color += vec3(1.0, 0.82, 0.48) * sunGlow * smoothstep(0.05, 0.5, altitude);
  color = mix(color, uHorizonColor, horizon * 0.22);
  color *= 1.12;

  gl_FragColor = vec4(color, 1.0);
}
`

const DEFAULT_SUN_DIRECTION = [0.62, 0.74, 0.2]

function CloudSky({ sunDirection = DEFAULT_SUN_DIRECTION }) {
  const skyRef = useRef()
  const materialRef = useRef()
  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uSunDirection: { value: new Vector3(...sunDirection).normalize() },
    uHorizonColor: { value: new Color('#d7edf6') },
    uZenithColor: { value: new Color('#8fc5e8') },
    uCloudBaseColor: { value: new Color('#fff8e9') },
    uCloudWarmColor: { value: new Color('#ffe9b8') },
    uCloudShadeColor: { value: new Color('#bfd2d8') },
  }), [sunDirection])

  useFrame(({ clock, camera }) => {
    if (!materialRef.current) return
    skyRef.current?.position.copy(camera.position)
    materialRef.current.uniforms.uTime.value = clock.elapsedTime
    materialRef.current.uniforms.uSunDirection.value.set(...sunDirection).normalize()
  })

  return (
    <mesh ref={skyRef} scale={120} renderOrder={-100} frustumCulled={false}>
      <sphereGeometry args={[1, 40, 20]} />
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={SKY_VERTEX_SHADER}
        fragmentShader={SKY_FRAGMENT_SHADER}
        side={BackSide}
        depthWrite={false}
        depthTest={false}
        fog={false}
        toneMapped
      />
    </mesh>
  )
}

export default CloudSky
