import { meadowSurfaceGlsl } from '../world/grass/meadowSurface'
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, MeshStandardMaterial, Vector2 } from 'three'
import { OUTDOOR_LIGHT_LAYER } from '../world/lightingLayers'

// Colour only: the same two-triangle plane and flat collider remain unchanged.
export default function GrassLabGround({ size, meadow, originRef = null }) {
  const shaderRef = useRef(null)
  useFrame(() => {
    const shader = shaderRef.current
    if (!shader || !originRef) return
    const { x, z } = originRef.current
    const rx = 0.8 * x + 0.6 * z, rz = -0.6 * x + 0.8 * z
    shader.uniforms.meadowOriginBroad.value.set((x * 0.17) % 4096, (z * 0.17) % 4096)
    shader.uniforms.meadowOriginMedium.value.set((rx * 1.3) % 4096, (rz * 1.3) % 4096)
    shader.uniforms.meadowOriginGrain.value.set((rx * 16) % 4096, (rz * 8) % 4096)
  })
  const material = useMemo(() => {
    const mat = new MeshStandardMaterial({ color: meadow ? '#ffffff' : '#438f32', roughness: 1 })
    if (meadow) {
      mat.customProgramCacheKey = () => `grass-lab-meadow-ground-v2-${Boolean(originRef)}`
      mat.onBeforeCompile = shader => {
        shaderRef.current = shader
        shader.uniforms.meadowOriginBroad = { value: new Vector2() }
        shader.uniforms.meadowOriginMedium = { value: new Vector2() }
        shader.uniforms.meadowOriginGrain = { value: new Vector2() }
        shader.uniforms.meadowDark = { value: new Color('#438f32') }
        shader.uniforms.meadowLight = { value: new Color('#74bd3c') }
        shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
          varying vec2 vMeadowPosition;`)
        shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
          vMeadowPosition = (modelMatrix * vec4(position, 1.0)).xz;`)
        shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
          varying vec2 vMeadowPosition;
          ${originRef ? meadowSurfaceGlsl
            .replace('uniform vec3 meadowDark;', 'uniform vec2 meadowOriginBroad; uniform vec2 meadowOriginMedium; uniform vec2 meadowOriginGrain; uniform vec3 meadowDark;')
            .replace('vec3 p3 =', 'p = mod(p, 4096.0); vec3 p3 =')
            .replace('p * 0.17 +', 'p * 0.17 + meadowOriginBroad +')
            .replace('rotated * 1.3 +', 'rotated * 1.3 + meadowOriginMedium +')
            .replace('rotated * vec2(16.0, 8.0) +', 'rotated * vec2(16.0, 8.0) + meadowOriginGrain +')
            : meadowSurfaceGlsl}`)
        shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
          diffuseColor.rgb *= meadowSurfaceColor(vMeadowPosition);`)
      }
    }
    return mat
  }, [meadow, originRef])
  useEffect(() => () => material.dispose(), [material])
  return <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow onUpdate={mesh => mesh.layers.enable(OUTDOOR_LIGHT_LAYER)}>
    <planeGeometry args={[size, size]} />
    <primitive object={material} attach="material" />
  </mesh>
}
