import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, DoubleSide, MeshStandardMaterial, Object3D } from 'three'
import { createPlantGeometry } from './plantGeometry'

function PlantBatch({ kind, plants, active, wind, layer, reducedDensity }) {
  const meshRef = useRef()
  const clock = useMemo(() => ({ value: 0 }), [])
  const geometry = useMemo(() => createPlantGeometry(kind), [kind])
  const material = useMemo(() => {
    const mat = new MeshStandardMaterial({ vertexColors: true, side: DoubleSide, roughness: 0.92 })
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uLushTime = clock
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float uLushTime;')
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
        #include <begin_vertex>
        float phase = instanceMatrix[3].x * 0.7 + instanceMatrix[3].z * 0.45;
        float sway = sin(uLushTime * 1.1 + phase) * 0.028 + sin(uLushTime * 2.1 + phase * 1.7) * 0.009;
        transformed.x += sway * position.y * position.y;
        transformed.z += sway * position.y * 0.45;
      `)
    }
    mat.customProgramCacheKey = () => 'lush-leaf-wind-v1'
    return mat
  }, [clock])
  const selected = useMemo(() => plants.filter((p, i) => p.kind === kind && (!reducedDensity || kind === 'shrub' || i % 2 === 0)), [plants, kind, reducedDensity])
  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const dummy = new Object3D()
    selected.forEach((plant, i) => {
      dummy.position.set(...plant.position)
      dummy.rotation.set(0, plant.rotation, 0)
      dummy.scale.setScalar(plant.scale)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      mesh.setColorAt(i, new Color().setRGB(0.85 + plant.tint * 0.15, 0.9 + plant.tint * 0.1, 0.8 + plant.tint * 0.15))
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    // Wind can move the top by ~10 cm; inflate the bound to avoid edge popping.
    mesh.computeBoundingSphere()
    if (mesh.boundingSphere) mesh.boundingSphere.radius += 0.2
    mesh.layers.set(layer)
  }, [selected, layer])
  useFrame((_, delta) => { if (active && wind) clock.value += Math.min(delta, 0.05) })
  useEffect(() => () => { geometry.dispose(); material.dispose() }, [geometry, material])
  return <instancedMesh ref={meshRef} args={[geometry, material, selected.length]} visible={active} receiveShadow frustumCulled />
}

export default function LushVegetation({ plants, active = true, wind = true, layer = 0, reducedDensity = false }) {
  return <group userData={{ debugCategory: 'lush-vegetation' }}>
    {['shrub', 'fern', 'grass'].map(kind => <PlantBatch key={kind} {...{kind, plants, active, wind, layer, reducedDensity}} />)}
  </group>
}
