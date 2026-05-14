import { useTexture } from '@react-three/drei'
import { useEffect, useMemo } from 'react'
import { RepeatWrapping, SRGBColorSpace } from 'three'

function cloneTexture(texture, repeatX, repeatY) {
  if (!texture) return null
  const next = texture.clone()
  next.wrapS = RepeatWrapping
  next.wrapT = RepeatWrapping
  next.repeat.set(repeatX, repeatY)
  next.colorSpace = SRGBColorSpace
  next.needsUpdate = true
  return next
}

function OutdoorSurfaceMaterial({
  colorMap,
  repeat = [1, 1],
  color = '#ffffff',
  emissive = '#000000',
  emissiveIntensity = 0,
  roughness = 0.85,
  side,
}) {
  const baseTexture = useTexture(colorMap)
  const repeatX = repeat[0]
  const repeatY = repeat[1]

  const map = useMemo(
    () => cloneTexture(baseTexture, repeatX, repeatY),
    [baseTexture, repeatX, repeatY],
  )

  useEffect(() => {
    return () => map?.dispose()
  }, [map])

  return (
    <meshStandardMaterial
      map={map}
      color={color}
      emissive={emissive}
      emissiveIntensity={emissiveIntensity}
      roughness={roughness}
      side={side}
    />
  )
}

export default OutdoorSurfaceMaterial
