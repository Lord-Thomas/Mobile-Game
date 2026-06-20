import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { ACESFilmicToneMapping, MathUtils, MOUSE, SRGBColorSpace } from 'three'
import OutdoorNeighborhood from '../world/OutdoorNeighborhood'
import { TreeDevScene, TreeDevPanel } from './TreeDevTool'
import { HouseDevPanel, HouseDevScene } from './HouseDevTool'
import { ParticleDevScene, ParticleDevPanel } from './ParticleDevTool'
import { MapEditorPanel, MapEditorScene } from './MapEditorTool'
import { estimateTreeHeight } from '../world/trees/proceduralTreeConfig'
import { getTerrainHeight } from '../world/terrain/terrainGeometry'
import { OUTDOOR_LIGHT_LAYER } from '../world/lightingLayers'
import { useTreeEditorStore } from './treeEditorStore'
import {
  MAP_MONSTER_SPAWNERS,
  MAP_OBJECT_PLACEMENTS,
  normalizeMapObjectPlacement,
  normalizeMonsterSpawner,
} from '../world/mapObjects'

// The whole outdoor world (terrain, houses, lights) lives on OUTDOOR_LIGHT_LAYER.
// The editor camera must enable that layer or nothing renders, and the preview
// subjects must join it or the outdoor lights ignore them.
//
// EditorStage forces every descendant onto OUTDOOR_LIGHT_LAYER via layers.set(),
// which also DISABLES layer 0. R3F's picking raycaster only tests layer 0 by
// default, so without this the map editor's objects (and ground plane) are
// invisible to pointer raycasts and can never be selected or dragged. Enabling
// the layer on the raycaster too is what lets clicking/dragging work, mirroring
// the in-game room editor whose objects simply stay on layer 0.
function EditorCameraLayers() {
  const { camera, raycaster } = useThree()
  useEffect(() => {
    camera.layers.enable(OUTDOOR_LIGHT_LAYER)
    raycaster.layers.enable(OUTDOOR_LIGHT_LAYER)
  }, [camera, raycaster])
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

function EditorCamera({ controlsRef, mode, mapCameraView }) {
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
    if (mode === 'map') {
      // Top view is fully owned by MapEditorCamera (in-game-style ortho cam that
      // never follows the selection); leave it alone here. Only the optional 3D
      // view uses OrbitControls, and it stays centered on the origin rather than
      // chasing the selected object.
      if (mapCameraView === 'orbit') {
        camera.position.set(40, 30, 40)
        camera.lookAt(0, 1.4, 0)
        if (controlsRef.current) {
          controlsRef.current.target.set(0, 1.4, 0)
          controlsRef.current.minDistance = 4
          controlsRef.current.maxDistance = 320
          controlsRef.current.enableRotate = true
          controlsRef.current.enablePan = true
          controlsRef.current.screenSpacePanning = false
          controlsRef.current.update()
        }
      }
      return
    }

    if (mode === 'house') {
      camera.position.set(14, 9, 14)
      camera.lookAt(0, 2.2, 0)
      if (controlsRef.current) {
        controlsRef.current.target.set(0, 2.2, 0)
        controlsRef.current.minDistance = 4
        controlsRef.current.maxDistance = 50
        controlsRef.current.enableRotate = true
        controlsRef.current.enablePan = true
        controlsRef.current.screenSpacePanning = false
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
        controlsRef.current.enableRotate = true
        controlsRef.current.enablePan = true
        controlsRef.current.screenSpacePanning = false
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
      controlsRef.current.enableRotate = true
      controlsRef.current.enablePan = true
      controlsRef.current.screenSpacePanning = false
      controlsRef.current.update()
    }
  }, [camera, cameraSignature, config, controlsRef, mapCameraView, mode])

  return null
}

const MODES = [
  { id: 'tree', label: 'Arbre' },
  { id: 'house', label: 'Maison' },
  { id: 'particles', label: 'Particules' },
  { id: 'map', label: 'Map' },
]

function useMapEditorState() {
  const [objects, setObjects] = useState(() => MAP_OBJECT_PLACEMENTS.map(normalizeMapObjectPlacement))
  const [spawners, setSpawners] = useState(() => MAP_MONSTER_SPAWNERS.map(normalizeMonsterSpawner))
  const [selectedId, setSelectedId] = useState(objects[0]?.id ?? null)
  const [selectedSpawnerId, setSelectedSpawnerId] = useState(null)
  const [movingId, setMovingId] = useState(null)
  const [moveOriginal, setMoveOriginal] = useState(null)
  const [draggingId, setDraggingId] = useState(null)
  const [cameraView, setCameraView] = useState('top')

  return {
    objects,
    spawners,
    selectedId,
    selectedSpawnerId,
    movingId,
    moveOriginal,
    draggingId,
    cameraView,
    setObjects,
    setSpawners,
    setSelectedId,
    setSelectedSpawnerId,
    setMovingId,
    setMoveOriginal,
    setDraggingId,
    setCameraView,
  }
}

export default function Editor({ initialMode = 'tree' }) {
  const noPlayerRef = useRef({ x: 9999, y: 0, z: 9999 })
  const controlsRef = useRef(null)
  const mapEditor = useMapEditorState()
  const [mode, setMode] = useState(MODES.some((entry) => entry.id === initialMode) ? initialMode : 'tree')

  const selectMapObject = (id) => {
    mapEditor.setSelectedId(id)
    if (id) mapEditor.setSelectedSpawnerId(null)
  }

  const selectMapSpawner = (id) => {
    mapEditor.setSelectedSpawnerId(id)
    if (id) {
      mapEditor.setSelectedId(null)
      mapEditor.setMovingId(null)
      mapEditor.setDraggingId(null)
      mapEditor.setMoveOriginal(null)
    }
  }

  const beginMapMove = (id) => {
    const object = mapEditor.objects.find((nextObject) => nextObject.id === id)
    if (!object) return
    selectMapObject(id)
    mapEditor.setMovingId(id)
    mapEditor.setDraggingId(null)
    mapEditor.setMoveOriginal({ id, position: object.position })
  }

  const confirmMapMove = () => {
    mapEditor.setMovingId(null)
    mapEditor.setDraggingId(null)
    mapEditor.setMoveOriginal(null)
  }

  const cancelMapMove = () => {
    const original = mapEditor.moveOriginal
    if (original) {
      mapEditor.setObjects((current) => current.map((object) => (
        object.id === original.id ? { ...object, position: original.position } : object
      )))
    }
    mapEditor.setMovingId(null)
    mapEditor.setDraggingId(null)
    mapEditor.setMoveOriginal(null)
  }

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
          <OutdoorNeighborhood
            lightingActive={true}
            playerPositionRef={noPlayerRef}
            showAuthoredTrees={false}
            showMapObjects={mode !== 'map'}
          />
          <EditorStage>
            {mode === 'tree' && <TreeDevScene />}
            {mode === 'house' && <HouseDevScene />}
            {mode === 'particles' && <ParticleDevScene />}
            {mode === 'map' && (
              <MapEditorScene
                objects={mapEditor.objects}
                spawners={mapEditor.spawners}
                selectedId={mapEditor.selectedId}
                selectedSpawnerId={mapEditor.selectedSpawnerId}
                movingId={mapEditor.movingId}
                draggingId={mapEditor.draggingId}
                cameraView={mapEditor.cameraView}
                onSelect={selectMapObject}
                onSelectSpawner={selectMapSpawner}
                onStartDragging={mapEditor.setDraggingId}
                onStopDragging={() => mapEditor.setDraggingId(null)}
                onMove={(id, position) => {
                  mapEditor.setObjects((current) => current.map((object) => (
                    object.id === id ? { ...object, position } : object
                  )))
                }}
                onMoveSpawner={(id, position) => {
                  mapEditor.setSpawners((current) => current.map((spawner) => (
                    spawner.id === id ? { ...spawner, position } : spawner
                  )))
                }}
              />
            )}
          </EditorStage>
        </Suspense>
        <EditorCameraLayers />
        <EditorCamera
          controlsRef={controlsRef}
          mode={mode}
          mapCameraView={mapEditor.cameraView}
        />
        <OrbitControls
          ref={controlsRef}
          target={[0, 8, 0]}
          minDistance={1.5}
          maxDistance={320}
          enableRotate={mode !== 'map' || mapEditor.cameraView === 'orbit'}
          screenSpacePanning={false}
          // Map TOP view is driven entirely by MapEditorCamera + ground panning
          // (like the in-game room editor), so OrbitControls is off there. The
          // optional 3D view uses it, minus an active object drag.
          enabled={mode === 'map'
            ? (mapEditor.cameraView === 'orbit' && !mapEditor.draggingId)
            : true}
          // In the map's 3D view the LEFT button stays free for object dragging;
          // the camera rotates with the RIGHT button. Other modes keep the
          // default left-drag orbit.
          mouseButtons={mode === 'map'
            ? { LEFT: undefined, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.ROTATE }
            : { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN }}
        />
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
      {mode === 'map' && (
        <MapEditorPanel
          objects={mapEditor.objects}
          spawners={mapEditor.spawners}
          selectedId={mapEditor.selectedId}
          selectedSpawnerId={mapEditor.selectedSpawnerId}
          movingId={mapEditor.movingId}
          cameraView={mapEditor.cameraView}
          onObjectsChange={(nextObjects) => {
            mapEditor.setObjects(nextObjects)
            if (mapEditor.selectedId && !nextObjects.some((object) => object.id === mapEditor.selectedId)) {
              mapEditor.setSelectedId(nextObjects[0]?.id ?? null)
            }
          }}
          onSpawnersChange={mapEditor.setSpawners}
          onSelect={selectMapObject}
          onSelectSpawner={selectMapSpawner}
          onBeginMove={beginMapMove}
          onConfirmMove={confirmMapMove}
          onCancelMove={cancelMapMove}
          onCameraViewChange={mapEditor.setCameraView}
        />
      )}
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
