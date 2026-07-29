import { useEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import { Color, FogExp2 } from 'three'
import { useArtDirectionValues } from './artDirectionStore'

function getCanvasFilter({ contrast, saturation, temperature }) {
  const amount = Math.abs(temperature)
  const thermalFilter = temperature === 0
    ? ''
    : temperature > 0
      ? ` sepia(${amount * 0.18}) hue-rotate(${-amount * 12}deg)`
      : ` sepia(${amount * 0.14}) hue-rotate(${amount * 168}deg)`
  return `contrast(${contrast}) saturate(${saturation})${thermalFilter}`.trim()
}

function applyCanvasGrade(renderer, grading) {
  renderer.toneMappingExposure = grading.exposure
  renderer.domElement.style.filter = getCanvasFilter(grading)
}

function clearCanvasGrade(renderer) {
  renderer.domElement.style.filter = ''
}

function mountAtmosphere(scene, fog, backgroundColor) {
  const previousFog = scene.fog
  const previousBackground = scene.background
  scene.fog = fog
  scene.background = new Color(backgroundColor)
  return () => {
    if (scene.fog === fog) scene.fog = previousFog
    scene.background = previousBackground
  }
}

export default function ArtDirectionRuntime({ manageAtmosphere = false }) {
  const { gl, scene } = useThree()
  const values = useArtDirectionValues()
  const fog = useMemo(
    () => new FogExp2(values.fog.color, values.fog.density),
    [values.fog.color, values.fog.density],
  )

  useEffect(() => {
    applyCanvasGrade(gl, values.grading)
  }, [gl, values.grading])

  useEffect(() => () => clearCanvasGrade(gl), [gl])

  useEffect(() => {
    if (!manageAtmosphere) return undefined
    return mountAtmosphere(scene, fog, values.fog.backgroundColor)
  }, [fog, manageAtmosphere, scene, values.fog.backgroundColor])

  return null
}
