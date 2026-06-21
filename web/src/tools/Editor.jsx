import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { ACESFilmicToneMapping, MathUtils, MOUSE, SRGBColorSpace } from 'three'
import OutdoorNeighborhood from '../world/OutdoorNeighborhood'
import { TreeDevScene, TreeDevPanel } from './TreeDevTool'
import { HouseDevPanel, HouseDevScene } from './HouseDevTool'
import { ParticleDevScene, ParticleDevPanel } from './ParticleDevTool'
import { MapEditorPanel, MapEditorScene } from './MapEditorTool'
import { estimateTreeHeight } from '../world/trees/proceduralTreeConfig'
import { getTerrainHeight, terrainModifications, updateCachedVisualGeometryHeights, MODIFICATION_GRID_SPACING } from '../world/terrain/terrainGeometry'
import { OUTDOOR_LIGHT_LAYER } from '../world/lightingLayers'
import { useTreeEditorStore } from './treeEditorStore'
import {
  MAP_MONSTER_SPAWNERS,
  MAP_OBJECT_PLACEMENTS,
  normalizeMapObjectPlacement,
  normalizeMonsterSpawner,
} from '../world/mapObjects'
import {
  MAP_BIOME_AREAS,
  normalizeBiomeArea,
} from '../world/biomeAreas'

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

function EditorCamera({ controlsRef, mode, mapCameraView, mapFocusRef }) {
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
        // Enter 3D over the same map spot the top view was centered on.
        const [fx, fz] = mapFocusRef?.current ?? [0, 0]
        camera.position.set(fx + 40, 30, fz + 40)
        camera.lookAt(fx, 1.4, fz)
        if (controlsRef.current) {
          controlsRef.current.target.set(fx, 1.4, fz)
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
  }, [camera, cameraSignature, config, controlsRef, mapCameraView, mapFocusRef, mode])

  return null
}

const MODES = [
  { id: 'tree', label: 'Arbre' },
  { id: 'house', label: 'Maison' },
  { id: 'particles', label: 'Particules' },
  { id: 'map', label: 'Map' },
]

const MAX_BIOME_UNDO_STEPS = 80

function createInitialBiomeBrush() {
  const area = normalizeBiomeArea({
    biome: 'graveyard',
    radius: 8,
    feather: 4,
    groundIntensity: 1,
    fogIntensity: 0.72,
    particleIntensity: 0,
    source: 'paint',
    ambient: false,
  })

  return {
    active: false,
    mode: 'paint',
    biome: area.biome,
    radius: area.radius,
    feather: area.feather,
    groundIntensity: area.groundIntensity,
    fogIntensity: area.fogIntensity,
    particleIntensity: area.particleIntensity,
    groundColors: area.groundColors,
  }
}

function useMapEditorState() {
  const [objects, setObjects] = useState(() => MAP_OBJECT_PLACEMENTS.map(normalizeMapObjectPlacement))
  const [spawners, setSpawners] = useState(() => MAP_MONSTER_SPAWNERS.map(normalizeMonsterSpawner))
  const [biomes, setBiomes] = useState(() => MAP_BIOME_AREAS.map(normalizeBiomeArea))
  const [biomeBrush, setBiomeBrush] = useState(createInitialBiomeBrush)
  const [terrainBrush, setTerrainBrush] = useState({
    active: false,
    op: 'add',
    radius: 6,
    strength: 0.15,
  })
  const [selectedId, setSelectedId] = useState(objects[0]?.id ?? null)
  const [selectedSpawnerId, setSelectedSpawnerId] = useState(null)
  const [selectedBiomeId, setSelectedBiomeId] = useState(null)
  const [movingId, setMovingId] = useState(null)
  const [moveOriginal, setMoveOriginal] = useState(null)
  const [draggingId, setDraggingId] = useState(null)
  const [cameraView, setCameraView] = useState('top')

  return {
    objects,
    spawners,
    biomes,
    biomeBrush,
    terrainBrush,
    selectedId,
    selectedSpawnerId,
    selectedBiomeId,
    movingId,
    moveOriginal,
    draggingId,
    cameraView,
    setObjects,
    setSpawners,
    setBiomes,
    setBiomeBrush,
    setTerrainBrush,
    setSelectedId,
    setSelectedSpawnerId,
    setSelectedBiomeId,
    setMovingId,
    setMoveOriginal,
    setDraggingId,
    setCameraView,
  }
}

export default function Editor({ initialMode = 'tree' }) {
  const noPlayerRef = useRef({ x: 9999, y: 0, z: 9999 })
  const controlsRef = useRef(null)
  const mapViewFocusRef = useRef([0, 0])
  const paintStampCounterRef = useRef(0)
  const biomeUndoStackRef = useRef([])
  const terrainUndoStackRef = useRef([])
  const [terrainVersion, setTerrainVersion] = useState(0)
  const mapEditor = useMapEditorState()
  useTreeEditorStore()
  const [mode, setMode] = useState(MODES.some((entry) => entry.id === initialMode) ? initialMode : 'tree')

  const pushBiomeUndoSnapshot = useCallback(() => {
    biomeUndoStackRef.current.push(mapEditor.biomes.map((area) => normalizeBiomeArea({
      ...area,
      center: [...area.center],
      groundColors: { ...area.groundColors },
    })))
    if (biomeUndoStackRef.current.length > MAX_BIOME_UNDO_STEPS) {
      biomeUndoStackRef.current.shift()
    }
  }, [mapEditor.biomes])

  const undoLastBiomeEdit = useCallback(() => {
    const previous = biomeUndoStackRef.current.pop()
    if (!previous) return
    mapEditor.setBiomes(previous.map(normalizeBiomeArea))
    mapEditor.setSelectedBiomeId((selectedBiomeId) => (
      selectedBiomeId && previous.some((area) => area.id === selectedBiomeId)
        ? selectedBiomeId
        : null
    ))
  }, [mapEditor])

  const pushTerrainUndoSnapshot = useCallback(() => {
    terrainUndoStackRef.current.push({ ...terrainModifications })
    if (terrainUndoStackRef.current.length > MAX_BIOME_UNDO_STEPS) {
      terrainUndoStackRef.current.shift()
    }
  }, [])

  const undoLastTerrainEdit = useCallback(() => {
    const previous = terrainUndoStackRef.current.pop()
    if (!previous) return
    for (const key of Object.keys(terrainModifications)) {
      delete terrainModifications[key]
    }
    Object.assign(terrainModifications, previous)
    updateCachedVisualGeometryHeights()
    setTerrainVersion((v) => v + 1)
  }, [])

  const paintTerrainAt = useCallback((center, brush, targetHeight) => {
    if (!brush || !Array.isArray(center)) return
    const [x, z] = center

    const spacing = MODIFICATION_GRID_SPACING
    const radius = brush.radius
    const strength = brush.strength
    const op = brush.op

    const gMinX = Math.floor((x - radius) / spacing)
    const gMaxX = Math.ceil((x + radius) / spacing)
    const gMinZ = Math.floor((z - radius) / spacing)
    const gMaxZ = Math.ceil((z + radius) / spacing)

    for (let gz = gMinZ; gz <= gMaxZ; gz++) {
      for (let gx = gMinX; gx <= gMaxX; gx++) {
        const wx = gx * spacing
        const wz = gz * spacing
        const dist = Math.hypot(wx - x, wz - z)

        if (dist < radius) {
          const t = dist / radius
          const falloff = 1 - t * t * (3 - 2 * t)

          const key = `${gx}_${gz}`
          const currentOffset = terrainModifications[key] || 0

          if (op === 'add') {
            terrainModifications[key] = currentOffset + strength * falloff * 0.5
          } else if (op === 'dig') {
            terrainModifications[key] = currentOffset - strength * falloff * 0.5
          } else if (op === 'flatten') {
            const baseHeight = getTerrainHeight(wx, wz, true)
            const currentHeight = baseHeight + currentOffset
            const target = targetHeight
            const newHeight = currentHeight + (target - currentHeight) * strength * falloff
            terrainModifications[key] = newHeight - baseHeight
          } else if (op === 'reset') {
            terrainModifications[key] = currentOffset * (1 - strength * falloff)
            if (Math.abs(terrainModifications[key]) < 0.001) {
              delete terrainModifications[key]
            }
          }
        }
      }
    }

    updateCachedVisualGeometryHeights()
  }, [])

  useEffect(() => {
    if (mode !== 'map') return undefined

    const handleKeyDown = (event) => {
      const target = event.target
      const tagName = target?.tagName
      const editingText = target?.isContentEditable
        || tagName === 'INPUT'
        || tagName === 'TEXTAREA'
        || tagName === 'SELECT'
      if (editingText) return
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.key.toLowerCase() !== 'z') return

      event.preventDefault()
      if (mapEditor.terrainBrush.active) {
        undoLastTerrainEdit()
      } else {
        undoLastBiomeEdit()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [mode, undoLastBiomeEdit, undoLastTerrainEdit, mapEditor.terrainBrush.active])

  const selectMapObject = (id) => {
    mapEditor.setSelectedId(id)
    if (id) {
      mapEditor.setSelectedSpawnerId(null)
      mapEditor.setSelectedBiomeId(null)
    }
  }

  const selectMapSpawner = (id) => {
    mapEditor.setSelectedSpawnerId(id)
    if (id) {
      mapEditor.setSelectedId(null)
      mapEditor.setSelectedBiomeId(null)
      mapEditor.setMovingId(null)
      mapEditor.setDraggingId(null)
      mapEditor.setMoveOriginal(null)
    }
  }

  const selectMapBiome = (id) => {
    mapEditor.setSelectedBiomeId(id)
    if (id) {
      mapEditor.setSelectedId(null)
      mapEditor.setSelectedSpawnerId(null)
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

  const paintMapBiomeAt = (center, brush) => {
    if (!brush || !Array.isArray(center)) return
    const [x = 0, z = 0] = center

    mapEditor.setBiomes((current) => {
      if (brush.mode === 'erase') {
        return current.filter((area) => {
          if (area.source !== 'paint') return true
          const [areaX, areaZ] = area.center
          return Math.hypot(areaX - x, areaZ - z) > brush.radius + area.radius * 0.35
        })
      }

      paintStampCounterRef.current += 1
      const stamp = normalizeBiomeArea({
        id: `${brush.biome}_paint_${Date.now().toString(36)}_${paintStampCounterRef.current}`,
        biome: brush.biome,
        center: [x, z],
        radius: MathUtils.clamp(brush.radius, 2, 36),
        feather: MathUtils.clamp(brush.feather, 0.5, Math.max(0.5, brush.radius - 0.1)),
        groundIntensity: MathUtils.clamp(brush.groundIntensity, 0, 1),
        fogIntensity: MathUtils.clamp(brush.fogIntensity, 0, 1),
        particleIntensity: MathUtils.clamp(brush.particleIntensity ?? 0, 0, 1),
        groundColors: brush.groundColors,
        source: 'paint',
        ambient: false,
      }, current.length)
      return [...current, stamp]
    })
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
            biomeAreas={mapEditor.biomes}
          />
          <EditorStage>
            {mode === 'tree' && <TreeDevScene />}
            {mode === 'house' && <HouseDevScene />}
            {mode === 'particles' && <ParticleDevScene />}
            {mode === 'map' && (
              <MapEditorScene
                objects={mapEditor.objects}
                spawners={mapEditor.spawners}
                biomes={mapEditor.biomes}
                selectedId={mapEditor.selectedId}
                selectedSpawnerId={mapEditor.selectedSpawnerId}
                selectedBiomeId={mapEditor.selectedBiomeId}
                movingId={mapEditor.movingId}
                draggingId={mapEditor.draggingId}
                cameraView={mapEditor.cameraView}
                focusRef={mapViewFocusRef}
                onSelect={selectMapObject}
                onSelectSpawner={selectMapSpawner}
                onSelectBiome={selectMapBiome}
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
                onMoveBiome={(id, center) => {
                  mapEditor.setBiomes((current) => current.map((area) => (
                    area.id === id ? normalizeBiomeArea({ ...area, center }) : area
                  )))
                }}
                biomeBrush={mapEditor.biomeBrush}
                onBeginBiomePaintStroke={pushBiomeUndoSnapshot}
                onPaintBiome={paintMapBiomeAt}
                terrainVersion={terrainVersion}
                terrainBrush={mapEditor.terrainBrush}
                onBeginTerrainPaintStroke={pushTerrainUndoSnapshot}
                onPaintTerrain={paintTerrainAt}
                onTerrainPaintStrokeEnd={() => setTerrainVersion((v) => v + 1)}
              />
            )}
          </EditorStage>
        </Suspense>
        <EditorCameraLayers />
        <EditorCamera
          controlsRef={controlsRef}
          mode={mode}
          mapCameraView={mapEditor.cameraView}
          mapFocusRef={mapViewFocusRef}
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
          onChange={() => {
            // Keep the shared focus in sync while orbiting in 3D, so switching
            // back to the top view returns to the same map spot.
            const controls = controlsRef.current
            if (mode === 'map' && mapEditor.cameraView === 'orbit' && controls) {
              mapViewFocusRef.current = [controls.target.x, controls.target.z]
            }
          }}
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
          biomes={mapEditor.biomes}
          selectedId={mapEditor.selectedId}
          selectedSpawnerId={mapEditor.selectedSpawnerId}
          selectedBiomeId={mapEditor.selectedBiomeId}
          movingId={mapEditor.movingId}
          cameraView={mapEditor.cameraView}
          biomeBrush={mapEditor.biomeBrush}
          onObjectsChange={(nextObjects) => {
            mapEditor.setObjects(nextObjects)
            if (mapEditor.selectedId && !nextObjects.some((object) => object.id === mapEditor.selectedId)) {
              mapEditor.setSelectedId(nextObjects[0]?.id ?? null)
            }
          }}
          onSpawnersChange={mapEditor.setSpawners}
          onBiomesChange={mapEditor.setBiomes}
          onSelect={selectMapObject}
          onSelectSpawner={selectMapSpawner}
          onSelectBiome={selectMapBiome}
          onBeginMove={beginMapMove}
          onConfirmMove={confirmMapMove}
          onCancelMove={cancelMapMove}
          onCameraViewChange={mapEditor.setCameraView}
          onBiomeBrushChange={mapEditor.setBiomeBrush}
          onPushBiomeUndoSnapshot={pushBiomeUndoSnapshot}
          terrainBrush={mapEditor.terrainBrush}
          onTerrainBrushChange={mapEditor.setTerrainBrush}
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
