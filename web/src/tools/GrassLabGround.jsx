import { meadowSurfaceGlsl } from '../world/grass/meadowSurface'
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
          ${meadowSurfaceGlsl}`)
        shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
          diffuseColor.rgb *= meadowSurfaceColor(vMeadowPosition);`)
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
