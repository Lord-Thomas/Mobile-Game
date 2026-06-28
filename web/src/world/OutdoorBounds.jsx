import { CuboidCollider, RigidBody, TrimeshCollider } from '@react-three/rapier'
import { useEffect, useMemo } from 'react'
import { OUTDOOR_HALF_SIZE } from './outdoorData'
import { houseLayout } from './house/houseLayout'
import { TERRAIN_VISUAL_SEGMENTS, TERRAIN_VISUAL_SIZE, createTerrainGeometry } from './terrain/terrainGeometry'
import { PERF_NO_TERRAIN_TRIMESH } from '../lib/perfFlags'

function OutdoorBounds({ includeHouseFootprint = true }) {
  const terrain = useMemo(() => (PERF_NO_TERRAIN_TRIMESH ? null : createTerrainGeometry({
    size: TERRAIN_VISUAL_SIZE,
    segments: TERRAIN_VISUAL_SEGMENTS,
  })), [])

  useEffect(() => () => terrain?.geometry.dispose(), [terrain])

  return (
    <RigidBody type="fixed" colliders={false}>
      {PERF_NO_TERRAIN_TRIMESH
        ? <CuboidCollider args={[OUTDOOR_HALF_SIZE, 0.5, OUTDOOR_HALF_SIZE]} position={[0, -0.5, 0]} />
        : <TrimeshCollider args={[terrain.vertices, terrain.indices]} />}
      <CuboidCollider args={[0.45, 2.2, OUTDOOR_HALF_SIZE]} position={[-OUTDOOR_HALF_SIZE, 1.9, 0]} />
      <CuboidCollider args={[0.45, 2.2, OUTDOOR_HALF_SIZE]} position={[OUTDOOR_HALF_SIZE, 1.9, 0]} />
      <CuboidCollider args={[OUTDOOR_HALF_SIZE, 2.2, 0.45]} position={[0, 1.9, -OUTDOOR_HALF_SIZE]} />
      <CuboidCollider args={[OUTDOOR_HALF_SIZE, 2.2, 0.45]} position={[0, 1.9, OUTDOOR_HALF_SIZE]} />
      {includeHouseFootprint && houseLayout.rooms.map((room) => {
        return (
          <CuboidCollider
            key={room.id}
            args={[room.size[0] * 0.5, room.size[1] * 0.5, room.size[2] * 0.5]}
            position={[room.position[0], room.size[1] * 0.5, room.position[2]]}
          />
        )
      })}
    </RigidBody>
  )
}

export default OutdoorBounds
