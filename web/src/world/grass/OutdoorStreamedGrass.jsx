import { use, useCallback, useEffect, useMemo, useState } from 'react'
import { Html } from '@react-three/drei'
import StreamedGrass from './StreamedGrass'
import { createOutdoorGrassSurface } from './outdoorGrassSurface'
import { terrainReady, TERRAIN_VISUAL_SIZE } from '../terrain/terrainGeometry'
import { MAP_BIOME_AREAS } from '../biomeAreas'
import { getGrassBiomeShaderData } from '../TerrainGroundCover'

export default function OutdoorStreamedGrass({ playerPositionRef, ballRef, active,
  biomeAreas = MAP_BIOME_AREAS, debugStats = false }) {
  use(terrainReady)
  const surface = useMemo(() => createOutdoorGrassSurface(biomeAreas), [biomeAreas])
  const biomeData = useMemo(() => getGrassBiomeShaderData(biomeAreas), [biomeAreas])
  const [ready, setReady] = useState(false)
  useEffect(() => { setReady(false) }, [surface])
  const onReady = useCallback(() => setReady(true), [])
  const onStats = useCallback(stats => {
    if (debugStats) window.__grassDebug = { ...stats, system: 'streamed-outdoor', queuedChunks: stats.pending, mountedBlades: stats.count }
  }, [debugStats])
  return <>
    <StreamedGrass density={5} size={TERRAIN_VISUAL_SIZE} surface={surface} biomeData={biomeData}
      playerPositionRef={playerPositionRef} ballRef={ballRef} active={active}
      volumeTufts={false} freezeDistantAnimation onReady={onReady} onStats={onStats} />
    {active && !ready && <Html fullscreen style={{ pointerEvents: 'none' }}>
      <div role="status" style={{ position: 'absolute', bottom: 105, left: '50%',
        transform: 'translateX(-50%)', padding: '8px 14px', borderRadius: 12,
        background: 'rgba(20, 35, 27, 0.85)', color: '#fff', whiteSpace: 'nowrap' }}>
        Préparation de l’herbe autour de toi…
      </div>
    </Html>}
  </>
}
