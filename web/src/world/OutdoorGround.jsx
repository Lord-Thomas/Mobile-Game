import { Suspense, useMemo } from 'react'
import NaturalTerrainMaterial from './NaturalTerrainMaterial'
import TerrainTextureDiagnosticMaterial from './TerrainTextureDiagnosticMaterial'
import { getCachedVisualGeometry } from './terrain/terrainGeometry'
import { useArtDirectionValues } from '../artDirection/artDirectionStore'

function OutdoorGround({ biomeAreas, renderMode = 'full' }) {
  const artDirection = useArtDirectionValues()
  const terrainSurface = artDirection.surfaces.terrain
  const terrain = useMemo(() => getCachedVisualGeometry(), [])
  const simple = renderMode === 'simple'
  const receivesShadows = (
    renderMode === 'full'
    || renderMode === 'lambert'
    || renderMode === 'standard'
  )

  return (
    <group userData={{ debugCategory: 'terrain' }}>
      <mesh geometry={terrain.geometry} receiveShadow={receivesShadows}>
        {simple && <meshBasicMaterial color={terrainSurface.color} toneMapped={false} />}
        {renderMode === 'texture' && (
          <Suspense fallback={<NaturalTerrainMaterial biomeAreas={biomeAreas} />}>
            <TerrainTextureDiagnosticMaterial />
          </Suspense>
        )}
        {renderMode === 'standard' && (
          <meshStandardMaterial
            color={terrainSurface.color}
            emissive="#3c7010"
            emissiveIntensity={0.07}
            roughness={terrainSurface.roughness}
          />
        )}
        {renderMode === 'lambert' && (
          <NaturalTerrainMaterial biomeAreas={biomeAreas} lightingModel="lambert" />
        )}
        {renderMode === 'full' && <NaturalTerrainMaterial biomeAreas={biomeAreas} />}
      </mesh>
    </group>
  )
}

export default OutdoorGround
