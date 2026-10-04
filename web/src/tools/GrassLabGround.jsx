import { useEffect, useMemo } from 'react'
import { Color, MeshStandardMaterial } from 'three'
import { OUTDOOR_LIGHT_LAYER } from '../world/lightingLayers'

// Colour only: the same two-triangle plane and flat collider remain unchanged.
export default function GrassLabGround({ size, meadow }) {
  const material = useMemo(() => {
    const mat = new MeshStandardMaterial({ color: meadow ? '#ffffff' : '#438f32', roughness: 1 })
    if (meadow) {
      mat.customProgramCacheKey = () => 'grass-lab-meadow-ground-v1'
      mat.onBeforeCompile = shader => {
        shader.uniforms.meadowDark = { value: new Color('#438f32') }
        shader.uniforms.meadowLight = { value: new Color('#74bd3c') }
        shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
          varying vec2 vMeadowPosition;`)
        shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
          vMeadowPosition = (modelMatrix * vec4(position, 1.0)).xz;`)
        shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
          varying vec2 vMeadowPosition;
          uniform vec3 meadowDark;
          uniform vec3 meadowLight;
          float meadowHash(vec2 p) {
            vec3 p3 = fract(vec3(p.xyx) * 0.1031);
            p3 += dot(p3, p3.yzx + 33.33);
            return fract((p3.x + p3.y) * p3.z);
          }
          float meadowNoise(vec2 p) {
            vec2 cell = floor(p), f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(mix(meadowHash(cell), meadowHash(cell + vec2(1, 0)), f.x),
              mix(meadowHash(cell + vec2(0, 1)), meadowHash(cell + vec2(1, 1)), f.x), f.y);
          }
          float meadowFilteredNoise(vec2 p) {
            float footprint = max(length(dFdx(p)), length(dFdy(p)));
            return mix(meadowNoise(p), 0.5, smoothstep(0.3, 1.2, footprint));
          }`)
        shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
          vec2 p = vMeadowPosition;
          float broad = meadowNoise(p * 0.17 + vec2(13.7, -8.2));
          vec2 rotated = mat2(0.8, -0.6, 0.6, 0.8) * p;
          float medium = meadowFilteredNoise(rotated * 1.3 + vec2(-4.1, 21.8));
          float grain = meadowFilteredNoise(rotated * vec2(16.0, 8.0) + vec2(9.3, 2.1));
          float tone = clamp(0.55 + (broad - 0.5) * 0.32 + (medium - 0.5) * 0.22 + (grain - 0.5) * 0.28, 0.0, 1.0);
          diffuseColor.rgb *= mix(meadowDark, meadowLight, tone);`)
      }
    }
    return mat
  }, [meadow])
  useEffect(() => () => material.dispose(), [material])
  return <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow onUpdate={mesh => mesh.layers.enable(OUTDOOR_LIGHT_LAYER)}>
    <planeGeometry args={[size, size]} />
    <primitive object={material} attach="material" />
  </mesh>
}
