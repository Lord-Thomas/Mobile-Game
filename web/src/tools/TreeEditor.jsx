import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { MathUtils } from 'three'
import OutdoorNeighborhood from '../world/OutdoorNeighborhood'
import { TreeDevScene, TreeDevPanel } from './TreeDevTool'
import { HouseDevPanel, HouseDevScene } from './HouseDevTool'
import { estimateTreeHeight } from '../world/trees/proceduralTreeConfig'
import { getTerrainHeight } from '../world/terrain/terrainGeometry'
import { useTreeEditorStore } from './treeEditorStore'

function TreeEditorCamera({ controlsRef, mode }) {
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

export default function TreeEditor() {
  const noPlayerRef = useRef({ x: 9999, y: 0, z: 9999 })
  const controlsRef = useRef(null)
  const [mode, setMode] = useState('tree')

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <Canvas
        shadows
        camera={{ fov: 52, position: [30, 18, 30], near: 0.1, far: 300 }}
        gl={{ antialias: true }}
      >
        <Suspense fallback={null}>
          <OutdoorNeighborhood lightingActive={true} playerPositionRef={noPlayerRef} showAuthoredTrees={false} />
          {mode === 'tree' ? <TreeDevScene /> : <HouseDevScene />}
        </Suspense>
        <TreeEditorCamera controlsRef={controlsRef} mode={mode} />
        <OrbitControls ref={controlsRef} target={[0, 8, 0]} minDistance={3} maxDistance={150} />
      </Canvas>
      <div style={modeSwitchStyle}>
        <button type="button" onClick={() => setMode('tree')} style={mode === 'tree' ? activeModeButtonStyle : modeButtonStyle}>Arbre</button>
        <button type="button" onClick={() => setMode('house')} style={mode === 'house' ? activeModeButtonStyle : modeButtonStyle}>Maison</button>
      </div>
      {mode === 'tree' ? <TreeDevPanel /> : <HouseDevPanel />}
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
