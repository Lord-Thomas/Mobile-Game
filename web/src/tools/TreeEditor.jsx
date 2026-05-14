import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { MathUtils } from 'three'
import OutdoorNeighborhood from '../world/OutdoorNeighborhood'
import { TreeDevScene, TreeDevPanel } from './TreeDevTool'
import { estimateTreeHeight } from '../world/trees/proceduralTreeConfig'
import { getTerrainHeight } from '../world/terrain/terrainGeometry'
import { useTreeEditorStore } from './treeEditorStore'

function TreeEditorCamera({ controlsRef }) {
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
  }, [camera, cameraSignature, config, controlsRef])

  return null
}

export default function TreeEditor() {
  const noPlayerRef = useRef({ x: 9999, y: 0, z: 9999 })
  const controlsRef = useRef(null)

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <Canvas
        shadows
        camera={{ fov: 52, position: [30, 18, 30], near: 0.1, far: 300 }}
        gl={{ antialias: true }}
      >
        <Suspense fallback={null}>
          <OutdoorNeighborhood lightingActive={true} playerPositionRef={noPlayerRef} showAuthoredTrees={false} />
          <TreeDevScene />
        </Suspense>
        <TreeEditorCamera controlsRef={controlsRef} />
        <OrbitControls ref={controlsRef} target={[0, 8, 0]} minDistance={3} maxDistance={150} />
      </Canvas>
      <TreeDevPanel />
    </div>
  )
}
