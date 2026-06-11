import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { ACESFilmicToneMapping, MathUtils, SRGBColorSpace } from 'three'
import OutdoorNeighborhood from '../world/OutdoorNeighborhood'
import { TreeDevScene, TreeDevPanel } from './TreeDevTool'
import { HouseDevPanel, HouseDevScene } from './HouseDevTool'
import { ParticleDevScene, ParticleDevPanel } from './ParticleDevTool'
import { estimateTreeHeight } from '../world/trees/proceduralTreeConfig'
import { getTerrainHeight } from '../world/terrain/terrainGeometry'
import { OUTDOOR_LIGHT_LAYER } from '../world/lightingLayers'
import { useTreeEditorStore } from './treeEditorStore'

// The whole outdoor world (terrain, houses, lights) lives on OUTDOOR_LIGHT_LAYER.
// The editor camera must enable that layer or nothing renders, and the preview
// subjects must join it or the outdoor lights ignore them.
function EditorCameraLayers() {
  const { camera } = useThree()
  useEffect(() => {
    camera.layers.enable(OUTDOOR_LIGHT_LAYER)
  }, [camera])
  return null
}

function EditorStage({ children }) {
  const groupRef = useRef()
  useLayoutEffect(() => {
    groupRef.current?.traverse((object) => {
      object.layers.set(OUTDOOR_LIGHT_LAYER)
    })
  })
  return <group ref={groupRef}>{children}</group>
}

function EditorCamera({ controlsRef, mode }) {
  const { camera } = useThree()
  const { config } = useTreeEditorStore()
  const cameraSignature = useMemo(() => JSON.stringify({
    preset: config.preset,
    scale: config.scale,
    position: config.position,
    branch: config.branch,
    leaves: {
      size: config.leaves.size,
      count: config.leaves.count,
    },
    snapToGround: config.snapToGround,
  }), [config])

  useEffect(() => {
    if (mode === 'house') {
      camera.position.set(14, 9, 14)
      camera.lookAt(0, 2.2, 0)
      if (controlsRef.current) {
        controlsRef.current.target.set(0, 2.2, 0)
        controlsRef.current.minDistance = 4
        controlsRef.current.maxDistance = 50
        controlsRef.current.update()
      }
      return
    }

    if (mode === 'particles') {
      const groundY = getTerrainHeight(0, 0)
      camera.position.set(5.5, groundY + 3.2, 5.5)
      camera.lookAt(0, groundY + 1.3, 0)
      if (controlsRef.current) {
        controlsRef.current.target.set(0, groundY + 1.3, 0)
        controlsRef.current.minDistance = 1.5
        controlsRef.current.maxDistance = 45
        controlsRef.current.update()
      }
      return
    }

    const treeHeight = estimateTreeHeight(config)
    const groundY = config.snapToGround
      ? getTerrainHeight(config.position.x, config.position.z)
      : 0
    const targetY = groundY + config.position.y + Math.max(1.2, treeHeight * 0.46)
    const distance = MathUtils.clamp(treeHeight * 2.6 + 8, 9, 60)
    const cameraY = targetY + MathUtils.clamp(treeHeight * 0.45 + 4, 4.5, 28)

    camera.position.set(
      config.position.x + distance * 0.82,
      cameraY,
      config.position.z + distance * 0.82,
    )
    camera.lookAt(config.position.x, targetY, config.position.z)

    if (controlsRef.current) {
      controlsRef.current.target.set(config.position.x, targetY, config.position.z)
      controlsRef.current.minDistance = Math.max(2, treeHeight * 0.35)
      controlsRef.current.maxDistance = Math.max(35, distance * 3.5)
      controlsRef.current.update()
    }
  }, [camera, cameraSignature, config, controlsRef, mode])

  return null
}

const MODES = [
  { id: 'tree', label: 'Arbre' },
  { id: 'house', label: 'Maison' },
  { id: 'particles', label: 'Particules' },
]

export default function Editor({ initialMode = 'tree' }) {
  const noPlayerRef = useRef({ x: 9999, y: 0, z: 9999 })
  const controlsRef = useRef(null)
  const [mode, setMode] = useState(MODES.some((entry) => entry.id === initialMode) ? initialMode : 'tree')

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <Canvas
        shadows
        camera={{ fov: 52, position: [30, 18, 30], near: 0.1, far: 300 }}
        gl={{ antialias: true }}
        onCreated={({ gl }) => {
          gl.outputColorSpace = SRGBColorSpace
          gl.toneMapping = ACESFilmicToneMapping
          gl.toneMappingExposure = 1.1
        }}
      >
        <Suspense fallback={null}>
          <OutdoorNeighborhood lightingActive={true} playerPositionRef={noPlayerRef} showAuthoredTrees={false} />
          <EditorStage>
            {mode === 'tree' && <TreeDevScene />}
            {mode === 'house' && <HouseDevScene />}
            {mode === 'particles' && <ParticleDevScene />}
          </EditorStage>
        </Suspense>
        <EditorCameraLayers />
        <EditorCamera controlsRef={controlsRef} mode={mode} />
        <OrbitControls ref={controlsRef} target={[0, 8, 0]} minDistance={1.5} maxDistance={150} />
      </Canvas>
      <div style={modeSwitchStyle}>
        {MODES.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setMode(entry.id)}
            style={mode === entry.id ? activeModeButtonStyle : modeButtonStyle}
          >
            {entry.label}
          </button>
        ))}
      </div>
      {mode === 'tree' && <TreeDevPanel />}
      {mode === 'house' && <HouseDevPanel />}
      {mode === 'particles' && <ParticleDevPanel />}
    </div>
  )
}

const modeSwitchStyle = {
  position: 'fixed',
  top: 14,
  left: 14,
  zIndex: 20,
  display: 'flex',
  gap: 6,
  padding: 6,
  borderRadius: 8,
  background: 'rgba(13, 18, 20, 0.92)',
  border: '1px solid rgba(223, 229, 233, 0.14)',
}

const modeButtonStyle = {
  border: '1px solid rgba(223, 229, 233, 0.18)',
  background: 'rgba(26, 32, 36, 0.92)',
  color: '#eef4f2',
  borderRadius: 6,
  padding: '8px 10px',
  cursor: 'pointer',
}

const activeModeButtonStyle = {
  ...modeButtonStyle,
  color: '#0e1814',
  background: '#9fe0bc',
  borderColor: '#9fe0bc',
  fontWeight: 700,
}
