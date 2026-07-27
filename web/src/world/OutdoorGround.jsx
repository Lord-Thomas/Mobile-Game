import { Suspense, useMemo } from 'react'
import NaturalTerrainMaterial from './NaturalTerrainMaterial'
import TerrainTextureDiagnosticMaterial from './TerrainTextureDiagnosticMaterial'
import { getCachedVisualGeometry } from './terrain/terrainGeometry'

function OutdoorGround({ biomeAreas, renderMode = 'full' }) {
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
        {simple && <meshBasicMaterial color="#6f9f42" toneMapped={false} />}
        {renderMode === 'texture' && (
          <Suspense fallback={<NaturalTerrainMaterial biomeAreas={biomeAreas} />}>
            <TerrainTextureDiagnosticMaterial />
          </Suspense>
        )}
        {renderMode === 'standard' && (
          <meshStandardMaterial
            color="#6f9f42"
            emissive="#3c7010"
            emissiveIntensity={0.07}
            roughness={0.88}
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
