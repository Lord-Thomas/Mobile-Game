import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import { FrontSide, DoubleSide, InstancedBufferAttribute, MeshBasicMaterial, SRGBColorSpace, Vector2, Vector3, Vector4 } from 'three'
import { createGrassCardGeometry, buildGrassHandleBeforeCompile, GrassArtDirectionUpdater } from '../TerrainGroundCover'
import { createVolumeTuftGeometry } from './tuftGeometry'
import { densityDrawCount } from './densityLod'
import { createStreamedField } from './streamedField'
import { createStreamedGeometry, syncStreamedGeometry } from './streamedGeometry'
import { BIOME_SHADER_MAX_AREAS } from '../biomeAreas'

const ZERO_ORIGIN = { current: { x: 0, z: 0 } }
const EMPTY_BIOMES = { areas: Array.from({ length: BIOME_SHADER_MAX_AREAS }, () => new Vector4(0, 0, 0, 1)),
  groundIntensities: new Float32Array(BIOME_SHADER_MAX_AREAS), count: 0 }

export default function StreamedGrass({ density, size, playerPositionRef, originRef = ZERO_ORIGIN,
  volumeTufts = false, freezeDistantAnimation = false, onStats, onReady, resetToken,
  surface = null, biomeData = EMPTY_BIOMES, active = true, ballRef = null }) {
  const field = useMemo(() => createStreamedField(density, size, surface), [density, size, surface])
  const meshes = useRef([])
  const shaderRef = useRef(null)
  const biomeRef = useRef(biomeData)
  biomeRef.current = biomeData
  const reportedReady = useRef(false)
  const lastReport = useRef(-Infinity)
  const forward = useMemo(() => new Vector3(), [])
  const baseTexture = useTexture('/textures/outdoor/grass-001-white.png')
  const texture = useMemo(() => { const t = baseTexture.clone(); t.colorSpace = SRGBColorSpace; t.needsUpdate = true; return t }, [baseTexture])
  const geometries = useMemo(() => {
    const card = createGrassCardGeometry()
    const base = volumeTufts ? createVolumeTuftGeometry(card) : card
    const ranks = new InstancedBufferAttribute(field.slots[0].ranks, 1)
    const list = field.slots.map(slot => createStreamedGeometry(base, slot, surface ? null : ranks))
    base.dispose(); if (base !== card) card.dispose()
    return list
  }, [field, volumeTufts, surface])
  const material = useMemo(() => {
    const mat = new MeshBasicMaterial({ map: texture, alphaTest: 0.45, side: volumeTufts ? DoubleSide : FrontSide,
      transparent: false, depthWrite: true, color: 0xffffff, vertexColors: true })
    const compile = buildGrassHandleBeforeCompile(shader => { shaderRef.current = shader }, () => biomeRef.current, volumeTufts, freezeDistantAnimation, true)
    mat.onBeforeCompile = shader => {
      compile(shader)
      shader.uniforms.uStreamWindPhase = { value: new Vector2() }
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform vec2 uStreamWindPhase;')
        .replace('sin(windPhase)', 'sin(windPhase + uStreamWindPhase.x)')
        .replace('sin(windPhase * 2.37 + grassOrigin.x * 0.11 + grassOrigin.z * 0.07)', 'sin(windPhase * 2.37 + grassOrigin.x * 0.11 + grassOrigin.z * 0.07 + uStreamWindPhase.y)')
        .replace('vec3 grassOrigin = instancePlacement.xyz;', 'vec3 grassOrigin = (modelMatrix * vec4(instancePlacement.xyz, 1.0)).xyz;')
        .replace('abs(instancePlacement.x - uPlayerPosition.x), abs(instancePlacement.z - uPlayerPosition.z)',
          'abs(grassOrigin.x - uPlayerPosition.x), abs(grassOrigin.z - uPlayerPosition.z)')
        // Keep blade variation stable when the local rendering origin shifts.
        .replaceAll('grassHash(grassOrigin.xz', 'grassHash(instancePlacement.xz')
    }
    mat.customProgramCacheKey = () => `grass-stream-v1-${volumeTufts}-${freezeDistantAnimation}`
    return mat
  }, [texture, volumeTufts, freezeDistantAnimation])
  useEffect(() => { reportedReady.current = false }, [field, resetToken])
  useEffect(() => () => geometries.forEach(geometry => geometry.dispose()), [geometries])
  useEffect(() => () => material.dispose(), [material])
  useEffect(() => () => texture.dispose(), [texture])
  useFrame(({ camera, clock }) => {
    if (!active) return
    const player = playerPositionRef.current, origin = originRef.current
    field.target(origin.x + player.x, origin.z + player.z)
    field.step(3, 6)
    for (let i = 0; i < field.slots.length; i++) {
      const slot = field.slots[i], mesh = meshes.current[i], geometry = geometries[i]
      if (!mesh) continue
      mesh.visible = slot.key !== null && slot.count > 0
      if (!mesh.visible) { geometry.instanceCount = 0; continue }
      mesh.position.set(slot.cx * 8 - origin.x, 0, slot.cz * 8 - origin.z)
      syncStreamedGeometry(geometry, slot, surface)
      geometry.instanceCount = densityDrawCount(slot.count, slot.bounds, player.x - mesh.position.x, player.z - mesh.position.z)
    }
    const shader = shaderRef.current
    if (shader) {
      forward.set(0, 0, -1).applyQuaternion(camera.quaternion); forward.y = 0; forward.normalize()
      shader.uniforms.uCameraForward.value.copy(forward)
      shader.uniforms.uPlayerPosition.value.set(player.x, player.y, player.z)
      shader.uniforms.uTime.value = clock.elapsedTime
      const direction = shader.uniforms.uWindDirection.value
      const phase = -(origin.x * direction.x + origin.z * direction.z) * shader.uniforms.uWindScale.value
        + (-origin.x * direction.z + origin.z * direction.x) * 0.06
      shader.uniforms.uStreamWindPhase.value.set(phase % (2 * Math.PI), (phase * 2.37 + origin.x * 0.11 + origin.z * 0.07) % (2 * Math.PI))
      const ball = ballRef?.current?.translation?.()
      if (ball) shader.uniforms.uBallPosition.value.set(ball.x, ball.y, ball.z)
      else shader.uniforms.uBallPosition.value.set(9999, 0, 9999)
      shader.uniforms.uGraveyardAreas.value = biomeData.areas
      shader.uniforms.uGraveyardGroundIntensities.value = biomeData.groundIntensities
      shader.uniforms.uGraveyardAreaCount.value = biomeData.count
    }
    if (clock.elapsedTime - lastReport.current > 0.5 || !reportedReady.current) {
      const stats = field.stats()
      if (!stats.pending && !reportedReady.current) { reportedReady.current = true; onReady?.() }
      if (clock.elapsedTime - lastReport.current > 0.5) {
        onStats?.({ ...stats, memoryMb: field.byteLength / 1048576,
          worldX: origin.x + player.x, worldZ: origin.z + player.z })
        lastReport.current = clock.elapsedTime
      }
    }
  })
  return <group visible={active} dispose={null} userData={{ debugCategory: 'grass' }}>
    <GrassArtDirectionUpdater grassMaterial={material} shaderRef={shaderRef} />
    {geometries.map((geometry, i) => <mesh key={i} ref={mesh => { meshes.current[i] = mesh }}
      geometry={geometry} material={material} visible={false} frustumCulled userData={{ debugCategory: 'grass-mesh' }} />)}
  </group>
}
