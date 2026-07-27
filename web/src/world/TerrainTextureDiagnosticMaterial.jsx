import { useTexture } from '@react-three/drei'
import { useEffect, useMemo } from 'react'
import { RepeatWrapping, SRGBColorSpace } from 'three'
import { TERRAIN_SURFACE_MASK_WORLD_SIZE } from './terrain/terrainSurfaceMaskConfig'

const GRASS_TEXTURE_URL = '/textures/outdoor/grass-patchy-basecolor-512.jpg'

function TerrainTextureDiagnosticMaterial() {
  const grassMap = useTexture(GRASS_TEXTURE_URL)
  const diagnosticMap = useMemo(() => {
    const texture = grassMap.clone()
    texture.wrapS = RepeatWrapping
    texture.wrapT = RepeatWrapping
    texture.colorSpace = SRGBColorSpace
    const repeat = TERRAIN_SURFACE_MASK_WORLD_SIZE * 0.155
    texture.repeat.set(repeat, repeat)
    texture.needsUpdate = true
    return texture
  }, [grassMap])

  useEffect(() => () => diagnosticMap.dispose(), [diagnosticMap])

  return <meshBasicMaterial map={diagnosticMap} color="#ffffff" toneMapped={false} />
}

export default TerrainTextureDiagnosticMaterial
