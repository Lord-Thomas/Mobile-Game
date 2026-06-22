import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html, OrthographicCamera } from '@react-three/drei'
import { BufferGeometry, Float32BufferAttribute, MathUtils, Plane, Raycaster, Vector2, Vector3 } from 'three'
import MapObjectPlaceables from '../world/MapObjectPlaceables'
import {
  MONSTER_SPAWNER_TYPE_IDS,
  MONSTER_SPAWNER_TYPES,
  getMapObjectCatalogItem,
  getMapObjectLibrary,
  normalizeMapObjectPlacement,
  normalizeMonsterSpawner,
} from '../world/mapObjects'
import {
  BIOME_TYPES,
  BIOME_TYPE_IDS,
  normalizeBiomeArea,
} from '../world/biomeAreas'
import { OUTDOOR_HALF_SIZE } from '../world/outdoorData'
import { OUTDOOR_LIGHT_LAYER } from '../world/lightingLayers'
import { getTerrainHeight, terrainModifications } from '../world/terrain/terrainGeometry'
import { ColorField, NumberField, Section, SelectField, SliderField } from './editorControls'
import { styles } from './editorStyles'

const MAP_GRID_SIZE = 0.25
const MAP_EDIT_HALF_SIZE = OUTDOOR_HALF_SIZE - 2
const TERRAIN_GRID_SPACING = 4
const TERRAIN_GRID_SAMPLE_STEP = 2
const TERRAIN_GRID_MAJOR_EVERY = 16
const TERRAIN_GRID_Y_OFFSET = 0.055

// Top-down orthographic camera for the map editor, ported from the in-game room
// editor's CustomizationCamera: a fixed top-down ortho view that NEVER follows
// the selection. Panning is done by dragging the empty ground (see the floor in
// MapEditorScene) and zooming with the wheel — exactly like the in-game editor.
const MAP_ZOOM_DEFAULT = 16
const MAP_ZOOM_MIN = 2.6
const MAP_ZOOM_MAX = 130
const MAP_CAMERA_HEIGHT = 140
const MAP_CAMERA_FAR = 600
const MAP_PAN_BOUND = OUTDOOR_HALF_SIZE
const BIOME_BRUSH_PAINT_SPACING = 0.42

function snap(value, gridSize = MAP_GRID_SIZE) {
  return Math.round(value / gridSize) * gridSize
}

function clampMapPosition(x, z) {
  return [
    MathUtils.clamp(snap(x), -MAP_EDIT_HALF_SIZE, MAP_EDIT_HALF_SIZE),
    MathUtils.clamp(snap(z), -MAP_EDIT_HALF_SIZE, MAP_EDIT_HALF_SIZE),
  ]
}

function createEditorId(prefix) {
  return `${prefix}_${Date.now().toString(36)}`
}

function getPlacementHeightOffset(placement) {
  const [x = 0, y = getTerrainHeight(x, 0), z = 0] = placement?.position ?? []
  return y - getTerrainHeight(x, z)
}

function getTerrainAnchoredPosition(x, z, heightOffset = 0) {
  return [x, getTerrainHeight(x, z) + heightOffset, z]
}

function createPlacement(objectId, existingCount) {
  const [x, z] = clampMapPosition(existingCount * 2, 0)

  return normalizeMapObjectPlacement({
    id: createEditorId(objectId),
    objectId,
    position: [x, getTerrainHeight(x, z), z],
    rotationY: 0,
    scale: getMapObjectCatalogItem(objectId)?.defaultScale ?? 1,
  }, existingCount)
}

function createMonsterSpawner(monsterType, existingCount) {
  const [x, z] = clampMapPosition(existingCount * 3, -4)

  return normalizeMonsterSpawner({
    id: createEditorId('monster_spawner'),
    monsterType,
    position: [x, getTerrainHeight(x, z), z],
    diameter: 14,
  }, existingCount)
}

function createBiomeArea(biome, existingCount) {
  return normalizeBiomeArea({
    id: createEditorId(biome),
    biome,
    center: [54.25 + existingCount * 4, 148.75],
    radius: 34,
    feather: 11,
    groundIntensity: 1,
    fogIntensity: 0.62,
    particleIntensity: 0.78,
    source: 'authored',
    ambient: true,
  }, existingCount)
}

function toSavedPlacements(objects) {
  return objects.map((object, index) => {
    const placement = normalizeMapObjectPlacement(object, index)
    const [x, y, z] = placement.position
    return {
      id: placement.id,
      objectId: placement.objectId,
      position: [x, y, z],
      rotationY: placement.rotationY,
      scale: placement.scale,
    }
  })
}

function toSavedSpawners(spawners) {
  return spawners.map((spawner, index) => {
    const normalized = normalizeMonsterSpawner(spawner, index)
    const [x, , z] = normalized.position
    return {
      id: normalized.id,
      monsterType: normalized.monsterType,
      position: [x, getTerrainHeight(x, z), z],
      diameter: normalized.diameter,
    }
  })
}

function toSavedBiomes(biomes) {
  return biomes.map((area, index) => {
    const normalized = normalizeBiomeArea(area, index)
    return {
      id: normalized.id,
      biome: normalized.biome,
      center: normalized.center,
      radius: normalized.radius,
      feather: normalized.feather,
      groundIntensity: normalized.groundIntensity,
      fogIntensity: normalized.fogIntensity,
      particleIntensity: normalized.particleIntensity,
      groundColors: normalized.groundColors,
      source: normalized.source,
      ambient: normalized.ambient,
    }
  })
}

function getSpawnerColor(monsterType) {
  return monsterType === 'skeleton' ? '#d4d0c2' : '#83d37b'
}

function MonsterSpawnerMarkers({
  spawners,
  selectedSpawnerId,
  onSpawnerPointerDown,
  onSpawnerPointerMove,
  onSpawnerPointerUp,
}) {
  return (
    <group userData={{ debugCategory: 'monster-spawners' }}>
      {spawners.map((spawner) => {
        const [x, savedY, z] = spawner.position
        const y = Math.max(savedY, getTerrainHeight(x, z))
        const radius = spawner.diameter * 0.5
        const selected = spawner.id === selectedSpawnerId
        const color = getSpawnerColor(spawner.monsterType)
        const label = MONSTER_SPAWNER_TYPES[spawner.monsterType]?.name ?? spawner.monsterType

        return (
          <group key={spawner.id} position={[x, y + 0.12, z]}>
            <mesh
              rotation={[-Math.PI / 2, 0, 0]}
              onPointerDown={(event) => {
                onSpawnerPointerDown?.(spawner.id, event)
              }}
              onPointerMove={(event) => onSpawnerPointerMove?.(spawner.id, event)}
              onPointerUp={(event) => onSpawnerPointerUp?.(spawner.id, event)}
              onPointerCancel={(event) => onSpawnerPointerUp?.(spawner.id, event)}
            >
              <circleGeometry args={[radius, 72]} />
              <meshBasicMaterial color={color} transparent opacity={selected ? 0.16 : 0.075} depthWrite={false} />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
              <ringGeometry args={[Math.max(0.05, radius - 0.12), radius, 72]} />
              <meshBasicMaterial color={selected ? '#ffd447' : color} transparent opacity={selected ? 0.9 : 0.45} depthWrite={false} />
            </mesh>
            <mesh
              position={[0, 0.45, 0]}
              onPointerDown={(event) => {
                onSpawnerPointerDown?.(spawner.id, event)
              }}
              onPointerMove={(event) => onSpawnerPointerMove?.(spawner.id, event)}
              onPointerUp={(event) => onSpawnerPointerUp?.(spawner.id, event)}
              onPointerCancel={(event) => onSpawnerPointerUp?.(spawner.id, event)}
            >
              <sphereGeometry args={[selected ? 0.34 : 0.26, 18, 12]} />
              <meshBasicMaterial color={selected ? '#ffd447' : color} transparent opacity={0.96} depthWrite={false} />
            </mesh>
            {selected && (
              <Html position={[0, 1.05, 0]} center transform sprite distanceFactor={12}>
                <div style={{
                  padding: '5px 8px',
                  borderRadius: 6,
                  color: '#0e1814',
                  background: '#ffd447',
                  font: '700 11px system-ui, sans-serif',
                  whiteSpace: 'nowrap',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.24)',
                }}>
                  {label} - {spawner.diameter.toFixed(0)}m
                </div>
              </Html>
            )}
          </group>
        )
      })}
    </group>
  )
}

function BiomeAreaMarkers({
  biomes,
  selectedBiomeId,
  onBiomePointerDown,
  onBiomePointerMove,
  onBiomePointerUp,
  interactive = true,
}) {
  return (
    <group userData={{ debugCategory: 'biome-areas' }}>
      {biomes.filter((area) => area.source !== 'paint').map((area) => {
        const [x, z] = area.center
        const y = getTerrainHeight(x, z)
        const selected = area.id === selectedBiomeId
        const color = BIOME_TYPES[area.biome]?.color ?? '#83d8c4'
        const label = BIOME_TYPES[area.biome]?.name ?? area.biome
        const pointerHandlers = interactive ? {
          onPointerDown: (event) => onBiomePointerDown?.(area.id, event),
          onPointerMove: (event) => onBiomePointerMove?.(area.id, event),
          onPointerUp: (event) => onBiomePointerUp?.(area.id, event),
          onPointerCancel: (event) => onBiomePointerUp?.(area.id, event),
        } : {}

        return (
          <group key={area.id} position={[x, y + 0.1, z]}>
            <mesh
              rotation={[-Math.PI / 2, 0, 0]}
              {...pointerHandlers}
            >
              <circleGeometry args={[area.radius, 96]} />
              <meshBasicMaterial color={color} transparent opacity={selected ? 0.16 : 0.07} depthWrite={false} />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.018, 0]}>
              <ringGeometry args={[Math.max(0.05, area.radius - 0.18), area.radius, 96]} />
              <meshBasicMaterial color={selected ? '#ffd447' : color} transparent opacity={selected ? 0.95 : 0.38} depthWrite={false} />
            </mesh>
            {area.feather > 0.5 && (
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
                <ringGeometry args={[Math.max(0.05, area.radius - area.feather), Math.max(0.08, area.radius - area.feather + 0.08), 96]} />
                <meshBasicMaterial color={selected ? '#ffffff' : color} transparent opacity={selected ? 0.75 : 0.26} depthWrite={false} />
              </mesh>
            )}
            <mesh
              position={[0, 0.45, 0]}
              {...pointerHandlers}
            >
              <sphereGeometry args={[selected ? 0.34 : 0.25, 18, 12]} />
              <meshBasicMaterial color={selected ? '#ffd447' : color} transparent opacity={0.96} depthWrite={false} />
            </mesh>
            {selected && (
              <Html position={[0, 1.05, 0]} center transform sprite distanceFactor={12}>
                <div style={{
                  padding: '5px 8px',
                  borderRadius: 6,
                  color: '#0e1814',
                  background: '#ffd447',
                  font: '700 11px system-ui, sans-serif',
                  whiteSpace: 'nowrap',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.24)',
                }}>
                  {label} - {area.radius.toFixed(0)}m
                </div>
              </Html>
            )}
          </group>
        )
      })}
    </group>
  )
}

function BiomeBrushPreview({ brush, point }) {
  if (!brush?.active || !point) return null

  const [x, z] = point
  const y = getTerrainHeight(x, z)
  const color = brush.mode === 'erase'
    ? '#ff9c82'
    : BIOME_TYPES[brush.biome]?.color ?? '#83d8c4'
  const innerRadius = Math.max(0.08, brush.radius - brush.feather)

  return (
    <group position={[x, y + 0.17, z]} userData={{ debugCategory: 'biome-brush-preview' }}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={24}>
        <circleGeometry args={[brush.radius, 96]} />
        <meshBasicMaterial color={color} transparent opacity={0.075} depthWrite={false} depthTest={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]} renderOrder={25}>
        <ringGeometry args={[Math.max(0.08, brush.radius - 0.14), brush.radius, 96]} />
        <meshBasicMaterial color={color} transparent opacity={0.92} depthWrite={false} depthTest={false} />
      </mesh>
      {brush.feather > 0.2 && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.024, 0]} renderOrder={26}>
          <ringGeometry args={[innerRadius, innerRadius + 0.09, 96]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.45} depthWrite={false} depthTest={false} />
        </mesh>
      )}
    </group>
  )
}

function TerrainBrushPreview({ brush, point }) {
  if (!brush?.active || !point) return null

  const [x, z] = point
  const y = getTerrainHeight(x, z)
  const colors = {
    add: '#9fe0bc',
    dig: '#ff9c82',
    flatten: '#8ad4ff',
    reset: '#ffeb8a',
  }
  const color = colors[brush.op] || '#ffffff'

  return (
    <group position={[x, y + 0.17, z]} userData={{ debugCategory: 'terrain-brush-preview' }}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={24}>
        <circleGeometry args={[brush.radius, 96]} />
        <meshBasicMaterial color={color} transparent opacity={0.075} depthWrite={false} depthTest={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]} renderOrder={25}>
        <ringGeometry args={[Math.max(0.08, brush.radius - 0.14), brush.radius, 96]} />
        <meshBasicMaterial color={color} transparent opacity={0.92} depthWrite={false} depthTest={false} />
      </mesh>
    </group>
  )
}

function createTerrainGridGeometry({ spacing, sampleStep, major = false }) {
  const positions = []
  const min = -OUTDOOR_HALF_SIZE
  const max = OUTDOOR_HALF_SIZE
  const lineCount = Math.floor((max - min) / spacing)

  const pushSegment = (ax, az, bx, bz) => {
    positions.push(
      ax,
      getTerrainHeight(ax, az) + TERRAIN_GRID_Y_OFFSET,
      az,
      bx,
      getTerrainHeight(bx, bz) + TERRAIN_GRID_Y_OFFSET,
      bz,
    )
  }

  for (let lineIndex = 0; lineIndex <= lineCount; lineIndex += 1) {
    const fixed = min + lineIndex * spacing
    const isMajorLine = Math.abs(Math.round(fixed / TERRAIN_GRID_MAJOR_EVERY) * TERRAIN_GRID_MAJOR_EVERY - fixed) < 0.001

    if (major !== isMajorLine) continue

    for (let cursor = min; cursor < max; cursor += sampleStep) {
      const next = Math.min(cursor + sampleStep, max)
      pushSegment(fixed, cursor, fixed, next)
      pushSegment(cursor, fixed, next, fixed)
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.computeBoundingSphere()
  return geometry
}

function TerrainFollowingGrid() {
  const minorGeometry = useMemo(() => createTerrainGridGeometry({
    spacing: TERRAIN_GRID_SPACING,
    sampleStep: TERRAIN_GRID_SAMPLE_STEP,
  }), [])
  const majorGeometry = useMemo(() => createTerrainGridGeometry({
    spacing: TERRAIN_GRID_SPACING,
    sampleStep: TERRAIN_GRID_SAMPLE_STEP,
    major: true,
  }), [])

  useEffect(() => () => {
    minorGeometry.dispose()
    majorGeometry.dispose()
  }, [majorGeometry, minorGeometry])

  return (
    <>
      <lineSegments geometry={minorGeometry}>
        <lineBasicMaterial color="#7aa88e" transparent opacity={0.105} depthWrite={false} />
      </lineSegments>
      <lineSegments geometry={majorGeometry}>
        <lineBasicMaterial color="#d8f0df" transparent opacity={0.16} depthWrite={false} />
      </lineSegments>
    </>
  )
}

function MapEditorCamera({ active, focusRef }) {
  const { gl } = useThree()
  const camRef = useRef()
  const zoomRef = useRef(MAP_ZOOM_DEFAULT)
  const initedRef = useRef(false)

  // When the top view becomes active, restore the camera over the shared focus
  // point (so switching views keeps you where you were on the map) and keep the
  // previous zoom. After that the pan handler mutates position imperatively, so
  // we must NOT pass a position prop (R3F would reset the pan on every render).
  useEffect(() => {
    const cam = camRef.current
    if (!active || !cam) return
    const [fx, fz] = focusRef?.current ?? [0, 0]
    cam.position.set(fx, MAP_CAMERA_HEIGHT, fz)
    cam.rotation.set(-Math.PI / 2, 0, 0)
    cam.layers.enable(OUTDOOR_LIGHT_LAYER)
    if (!initedRef.current) {
      zoomRef.current = MAP_ZOOM_DEFAULT
      initedRef.current = true
    }
    cam.zoom = zoomRef.current
    cam.updateProjectionMatrix()
  }, [active, focusRef])

  useEffect(() => {
    if (!active) return undefined
    const canvas = gl.domElement
    const onWheel = (event) => {
      event.preventDefault()
      zoomRef.current = MathUtils.clamp(
        zoomRef.current * (event.deltaY < 0 ? 1.12 : 0.89),
        MAP_ZOOM_MIN,
        MAP_ZOOM_MAX,
      )
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [active, gl])

  useFrame(() => {
    const cam = camRef.current
    if (!cam || !active) return
    if (Math.abs(cam.zoom - zoomRef.current) > 0.01) {
      cam.zoom = MathUtils.lerp(cam.zoom, zoomRef.current, 0.2)
      cam.updateProjectionMatrix()
    }
  })

  return <OrthographicCamera ref={camRef} makeDefault={active} near={0.1} far={MAP_CAMERA_FAR} />
}

export function MapEditorScene({
  objects,
  spawners = [],
  biomes = [],
  selectedId,
  selectedSpawnerId = null,
  selectedBiomeId = null,
  movingId,
  draggingId,
  cameraView,
  focusRef,
  onSelect,
  onSelectSpawner,
  onSelectBiome,
  onStartDragging,
  onStopDragging,
  onMove,
  onMoveSpawner,
  onMoveBiome,
  biomeBrush,
  onBeginBiomePaintStroke,
  onPaintBiome,
  terrainVersion = 0,
  terrainBrush,
  onBeginTerrainPaintStroke,
  onPaintTerrain,
  onTerrainPaintStrokeEnd,
}) {
  // Ported from the in-game room editor (CustomizationCamera + EditableFloor):
  //  - a top-down ortho camera that never follows the selection,
  //  - one big invisible ground plane that, while an object is grabbed, makes it
  //    follow the cursor (absolute, grid-snapped), and otherwise pans the camera
  //    when you drag empty ground,
  //  - objects start their own drag on pointerdown and carry no move handler, so
  //    moves fall through to this plane.
  const { camera, gl } = useThree()
  const cameraRef = useRef(camera)
  useEffect(() => { cameraRef.current = camera }, [camera])
  const panRef = useRef(null)
  const spawnerDragRef = useRef(null)
  const biomeDragRef = useRef(null)
  const brushPaintingRef = useRef(false)
  const lastBrushPointRef = useRef(null)
  const terrainPaintingRef = useRef(false)
  const lastTerrainBrushPointRef = useRef(null)
  const targetHeightRef = useRef(0)
  const [brushPreviewPoint, setBrushPreviewPoint] = useState(null)
  const isTopView = cameraView === 'top'
  const editorBrushActive = Boolean(biomeBrush?.active || terrainBrush?.active)

  const paintTerrainAtPoint = (point, force = false) => {
    if (!terrainBrush?.active || !point) return
    const [x, z] = clampMapPosition(point.x, point.z)
    const last = lastTerrainBrushPointRef.current
    const spacing = Math.max(0.12, terrainBrush.radius * 0.12)
    if (!force && last && Math.hypot(x - last[0], z - last[1]) < spacing) return

    lastTerrainBrushPointRef.current = [x, z]
    setBrushPreviewPoint([x, z])
    onPaintTerrain?.([x, z], terrainBrush, targetHeightRef.current)
  }

  // Object dragging is imperative: we mutate the dragged group's position every
  // pointermove (no React state change, so nothing re-renders) and commit the
  // final position to state once on release. This keeps dragging smooth no
  // matter how many objects / spawners / biomes are on the map.
  const placeableRefs = useRef(new Map())
  const dragCommitRef = useRef(null)
  const registerPlaceable = useCallback((id, object3D) => {
    if (object3D) placeableRefs.current.set(id, object3D)
    else placeableRefs.current.delete(id)
  }, [])

  const dragObjectToPoint = (id, point) => {
    if (!id || !point) return
    const [x, z] = clampMapPosition(point.x, point.z)
    const object = objects.find((candidate) => candidate.id === id)
    const position = getTerrainAnchoredPosition(x, z, getPlacementHeightOffset(object))
    const group = placeableRefs.current.get(id)
    if (group) group.position.set(position[0], position[1], position[2])
    // Key the pending position by id so it can never be applied to the wrong
    // object (e.g. if a release lands on an overlay and skips the floor's
    // pointerup, leaving this set when the next object is selected).
    dragCommitRef.current = { id, position }
  }

  const commitDraggedObject = () => {
    const pending = dragCommitRef.current
    if (pending && draggingId === pending.id) onMove(pending.id, pending.position)
    dragCommitRef.current = null
  }

  const handleStartObjectDrag = (id) => {
    // If a previous drag never committed (pointer released over the label/HTML
    // overlay, so the floor never received pointerup), commit it now before
    // starting a new drag — otherwise its pending position leaks onto this one.
    const pending = dragCommitRef.current
    if (pending && pending.id !== id) onMove(pending.id, pending.position)
    dragCommitRef.current = null
    onStartDragging?.(id)
  }

  // Raycast the ground ourselves from clientX/clientY instead of trusting
  // event.point. R3F derives event.point from event.offsetX/offsetY, which can
  // momentarily be 0 (when a move event targets an overlay element), sending the
  // object to the top-left corner. clientX/clientY are always correct viewport
  // coordinates, so this is stable.
  const raycaster = useMemo(() => new Raycaster(), [])
  const groundPlane = useMemo(() => new Plane(new Vector3(0, 1, 0), 0), [])
  const ndc = useMemo(() => new Vector2(), [])
  const hitPoint = useMemo(() => new Vector3(), [])

  const groundPointFromEvent = (event) => {
    const rect = gl.domElement.getBoundingClientRect()
    ndc.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    )
    raycaster.setFromCamera(ndc, camera)
    return raycaster.ray.intersectPlane(groundPlane, hitPoint)
  }

  const moveToPoint = (id, point) => {
    if (!id || !point) return
    const [x, z] = clampMapPosition(point.x, point.z)
    const object = objects.find((candidate) => candidate.id === id)
    onMove(id, getTerrainAnchoredPosition(x, z, getPlacementHeightOffset(object)))
  }

  const moveSpawnerToPoint = (id, point) => {
    if (!id || !point) return
    const [x, z] = clampMapPosition(point.x, point.z)
    onMoveSpawner?.(id, [x, getTerrainHeight(x, z), z])
  }

  const moveBiomeToPoint = (id, point) => {
    if (!id || !point) return
    const [x, z] = clampMapPosition(point.x, point.z)
    onMoveBiome?.(id, [x, z])
  }

  const previewBrushAtPoint = (point) => {
    if (!biomeBrush?.active || !isTopView || !point) return
    const [x, z] = clampMapPosition(point.x, point.z)
    setBrushPreviewPoint([x, z])
  }

  const paintBiomeAtPoint = (point, force = false) => {
    if (!biomeBrush?.active || !isTopView || !point) return
    const [x, z] = clampMapPosition(point.x, point.z)
    const last = lastBrushPointRef.current
    const spacing = Math.max(0.7, biomeBrush.radius * BIOME_BRUSH_PAINT_SPACING)
    if (!force && last && Math.hypot(x - last[0], z - last[1]) < spacing) return

    lastBrushPointRef.current = [x, z]
    setBrushPreviewPoint([x, z])
    onPaintBiome?.([x, z], biomeBrush)
  }

  const handleSpawnerPointerDown = (id, event) => {
    if (event.button !== 0) return
    event.stopPropagation()
    onSelectSpawner?.(id)
    spawnerDragRef.current = id
    event.target?.setPointerCapture?.(event.pointerId)
  }

  const handleSpawnerPointerMove = (id, event) => {
    if (spawnerDragRef.current !== id) return
    event.stopPropagation()
    moveSpawnerToPoint(id, groundPointFromEvent(event))
  }

  const handleSpawnerPointerUp = (id, event) => {
    if (spawnerDragRef.current !== id) return
    event.stopPropagation()
    spawnerDragRef.current = null
    event.target?.releasePointerCapture?.(event.pointerId)
  }

  const handleBiomePointerDown = (id, event) => {
    if (event.button !== 0) return
    event.stopPropagation()
    onSelectBiome?.(id)
    biomeDragRef.current = id
    event.target?.setPointerCapture?.(event.pointerId)
  }

  const handleBiomePointerMove = (id, event) => {
    if (biomeDragRef.current !== id) return
    event.stopPropagation()
    moveBiomeToPoint(id, groundPointFromEvent(event))
  }

  const handleBiomePointerUp = (id, event) => {
    if (biomeDragRef.current !== id) return
    event.stopPropagation()
    biomeDragRef.current = null
    event.target?.releasePointerCapture?.(event.pointerId)
  }

  return (
    <group>
      <MapEditorCamera active={isTopView} focusRef={focusRef} />
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.06, 0]}
        onPointerDown={(event) => {
          // Object presses stopPropagation before reaching the floor, so a press
          // here is on empty ground: clear the selection and (top view) begin a
          // camera pan tracked by screen-space deltas, like the in-game editor.
          if (event.button !== 0) return
          if (draggingId || movingId) return
          if (spawnerDragRef.current) return
          if (biomeDragRef.current) return
          if (terrainBrush?.active) {
            event.stopPropagation()
            onSelect(null)
            onSelectSpawner?.(null)
            onSelectBiome?.(null)
            const pt = groundPointFromEvent(event)
            targetHeightRef.current = pt ? getTerrainHeight(pt.x, pt.z) : 0
            terrainPaintingRef.current = true
            lastTerrainBrushPointRef.current = null
            onBeginTerrainPaintStroke?.()
            paintTerrainAtPoint(pt, true)
            event.target?.setPointerCapture?.(event.pointerId)
            return
          }
          if (biomeBrush?.active && isTopView) {
            event.stopPropagation()
            onSelect(null)
            onSelectSpawner?.(null)
            onSelectBiome?.(null)
            brushPaintingRef.current = true
            lastBrushPointRef.current = null
            onBeginBiomePaintStroke?.()
            paintBiomeAtPoint(groundPointFromEvent(event), true)
            event.target?.setPointerCapture?.(event.pointerId)
            return
          }
          onSelect(null)
          onSelectSpawner?.(null)
          onSelectBiome?.(null)
          if (isTopView) panRef.current = { x: event.clientX, y: event.clientY }
        }}
        onPointerMove={(event) => {
          if (terrainBrush?.active && !draggingId && !movingId && !spawnerDragRef.current && !biomeDragRef.current) {
            const point = groundPointFromEvent(event)
            setBrushPreviewPoint(point ? clampMapPosition(point.x, point.z) : null)
            if (terrainPaintingRef.current) {
              event.stopPropagation()
              paintTerrainAtPoint(point)
              return
            }
          }
          if (biomeBrush?.active && isTopView && !draggingId && !movingId && !spawnerDragRef.current && !biomeDragRef.current) {
            const point = groundPointFromEvent(event)
            previewBrushAtPoint(point)
            if (brushPaintingRef.current) {
              event.stopPropagation()
              paintBiomeAtPoint(point)
              return
            }
          }
          if (draggingId) {
            // Active object drag: move the group imperatively (no re-render).
            event.stopPropagation()
            dragObjectToPoint(draggingId, groundPointFromEvent(event))
            return
          }
          if (spawnerDragRef.current) {
            event.stopPropagation()
            moveSpawnerToPoint(spawnerDragRef.current, groundPointFromEvent(event))
            return
          }
          if (biomeDragRef.current) {
            event.stopPropagation()
            moveBiomeToPoint(biomeDragRef.current, groundPointFromEvent(event))
            return
          }
          // Otherwise drag-pan the camera (top view only).
          if (!panRef.current || !isTopView) return
          const cam = cameraRef.current
          if (!cam) return
          const dx = event.clientX - panRef.current.x
          const dy = event.clientY - panRef.current.y
          panRef.current = { x: event.clientX, y: event.clientY }
          const worldPerPixel = 1 / cam.zoom
          cam.position.x = MathUtils.clamp(cam.position.x - dx * worldPerPixel, -MAP_PAN_BOUND, MAP_PAN_BOUND)
          cam.position.z = MathUtils.clamp(cam.position.z - dy * worldPerPixel, -MAP_PAN_BOUND, MAP_PAN_BOUND)
          if (focusRef) focusRef.current = [cam.position.x, cam.position.z]
        }}
        onClick={(event) => {
          // Click-to-place once "Deplacer" was pressed in the panel.
          if (!movingId || draggingId) return
          event.stopPropagation()
          moveToPoint(movingId, groundPointFromEvent(event))
        }}
        onPointerUp={(event) => {
          if (terrainPaintingRef.current) {
            terrainPaintingRef.current = false
            lastTerrainBrushPointRef.current = null
            event.target?.releasePointerCapture?.(event.pointerId)
            event.stopPropagation()
            onTerrainPaintStrokeEnd?.()
            return
          }
          if (brushPaintingRef.current) {
            brushPaintingRef.current = false
            lastBrushPointRef.current = null
            event.target?.releasePointerCapture?.(event.pointerId)
            event.stopPropagation()
            return
          }
          panRef.current = null
          spawnerDragRef.current = null
          biomeDragRef.current = null
          if (!draggingId) return
          event.stopPropagation()
          commitDraggedObject()
          onStopDragging()
        }}
        onPointerMissed={() => {
          panRef.current = null
          spawnerDragRef.current = null
          biomeDragRef.current = null
          brushPaintingRef.current = false
          lastBrushPointRef.current = null
          terrainPaintingRef.current = false
          lastTerrainBrushPointRef.current = null
          if (draggingId) {
            commitDraggedObject()
            onStopDragging()
          }
          else if (!movingId) {
            onSelect(null)
            onSelectSpawner?.(null)
            onSelectBiome?.(null)
          }
        }}
      >
        <planeGeometry args={[OUTDOOR_HALF_SIZE * 2, OUTDOOR_HALF_SIZE * 2]} />
        <meshBasicMaterial transparent opacity={0.015} depthWrite={false} />
      </mesh>
      {biomeBrush?.active ? (
        <BiomeBrushPreview brush={biomeBrush} point={brushPreviewPoint} />
      ) : terrainBrush?.active ? (
        <TerrainBrushPreview brush={terrainBrush} point={brushPreviewPoint} />
      ) : null}
      <TerrainFollowingGrid key={terrainVersion} />
      <MonsterSpawnerMarkers
        spawners={spawners}
        selectedSpawnerId={selectedSpawnerId}
        onSpawnerPointerDown={editorBrushActive ? null : handleSpawnerPointerDown}
        onSpawnerPointerMove={editorBrushActive ? null : handleSpawnerPointerMove}
        onSpawnerPointerUp={editorBrushActive ? null : handleSpawnerPointerUp}
      />
      <BiomeAreaMarkers
        biomes={biomes}
        selectedBiomeId={selectedBiomeId}
        onBiomePointerDown={handleBiomePointerDown}
        onBiomePointerMove={handleBiomePointerMove}
        onBiomePointerUp={handleBiomePointerUp}
        interactive={!editorBrushActive}
      />
      <MapObjectPlaceables
        objects={objects}
        selectedId={selectedId}
        onSelect={editorBrushActive ? null : onSelect}
        onStartDragging={editorBrushActive ? null : handleStartObjectDrag}
        registerRef={registerPlaceable}
      />
    </group>
  )
}

export function MapEditorPanel({
  objects,
  spawners = [],
  biomes = [],
  selectedId,
  selectedSpawnerId = null,
  selectedBiomeId = null,
  movingId,
  cameraView,
  onObjectsChange,
  onSpawnersChange,
  onBiomesChange,
  onSelect,
  onSelectSpawner,
  onSelectBiome,
  onBeginMove,
  onConfirmMove,
  onCancelMove,
  onCameraViewChange,
  biomeBrush,
  onBiomeBrushChange,
  onPushBiomeUndoSnapshot,
  terrainBrush,
  onTerrainBrushChange,
}) {
  const [objectId, setObjectId] = useState(getMapObjectLibrary()[0])
  const [spawnerType, setSpawnerType] = useState(MONSTER_SPAWNER_TYPE_IDS[0])
  const [biomeType, setBiomeType] = useState(BIOME_TYPE_IDS[0])
  const [saving, setSaving] = useState(false)
  const [importingModels, setImportingModels] = useState(false)
  const [message, setMessage] = useState('')
  const selected = objects.find((object) => object.id === selectedId) ?? null
  const selectedSpawner = spawners.find((spawner) => spawner.id === selectedSpawnerId) ?? null
  const selectedBiome = biomes.find((area) => area.id === selectedBiomeId) ?? null
  const editableBiomes = useMemo(() => biomes.filter((area) => area.source !== 'paint'), [biomes])
  const paintedBiomeCount = biomes.length - editableBiomes.length
  const options = getMapObjectLibrary().map((id) => ({
    value: id,
    label: getMapObjectCatalogItem(id)?.name ?? id,
  }))
  const selectedObjectId = options.some((option) => option.value === objectId)
    ? objectId
    : options[0]?.value ?? 'skeleton_tower'
  const spawnerTypeOptions = useMemo(() => MONSTER_SPAWNER_TYPE_IDS.map((id) => ({
    value: id,
    label: MONSTER_SPAWNER_TYPES[id]?.name ?? id,
  })), [])
  const biomeTypeOptions = useMemo(() => BIOME_TYPE_IDS.map((id) => ({
    value: id,
    label: BIOME_TYPES[id]?.name ?? id,
  })), [])

  const patchSelected = (patch) => {
    if (!selected) return
    onObjectsChange(objects.map((object) => (
      object.id === selected.id ? normalizeMapObjectPlacement({ ...object, ...patch }) : object
    )))
  }

  const patchSelectedSpawner = (patch) => {
    if (!selectedSpawner) return
    onSpawnersChange(spawners.map((spawner) => (
      spawner.id === selectedSpawner.id ? normalizeMonsterSpawner({ ...spawner, ...patch }) : spawner
    )))
  }

  const patchSelectedBiome = (patch) => {
    if (!selectedBiome) return
    onBiomesChange(biomes.map((area) => (
      area.id === selectedBiome.id ? normalizeBiomeArea({ ...area, ...patch }) : area
    )))
  }

  const patchBiomeBrush = (patch) => {
    if (!biomeBrush) return
    if (patch.active) onTerrainBrushChange?.({ ...terrainBrush, active: false })
    onBiomeBrushChange?.({
      ...biomeBrush,
      ...patch,
      feather: patch.radius !== undefined
        ? Math.min(biomeBrush.feather, Math.max(0.5, patch.radius - 0.1))
        : patch.feather ?? biomeBrush.feather,
    })
  }

  const patchTerrainBrush = (patch) => {
    if (!terrainBrush) return
    if (patch.active) onBiomeBrushChange?.({ ...biomeBrush, active: false })
    onTerrainBrushChange?.({
      ...terrainBrush,
      ...patch,
    })
  }

  const addObject = () => {
    const next = createPlacement(selectedObjectId, objects.length)
    onObjectsChange([...objects, next])
    onSelect(next.id)
    setMessage('Objet ajoute et selectionne. Clique sur "Deplacer" pour le poser ailleurs, puis valide.')
  }

  const addSpawner = () => {
    const next = createMonsterSpawner(spawnerType, spawners.length)
    onSpawnersChange([...spawners, next])
    onSelectSpawner(next.id)
    setMessage('Spawner ajoute. Ajuste son type, son diametre et sa position.')
  }

  const addBiome = () => {
    const next = createBiomeArea(biomeType, biomes.length)
    onBiomesChange([...biomes, next])
    onSelectBiome(next.id)
    setMessage('Biome ajoute. Glisse son marqueur ou ajuste son centre et ses intensites.')
  }

  const duplicateSelected = () => {
    if (!selected) return
    const [x, , z] = selected.position
    const heightOffset = getPlacementHeightOffset(selected)
    const next = normalizeMapObjectPlacement({
      ...selected,
      id: createEditorId(selected.objectId),
      position: getTerrainAnchoredPosition(x + 2, z + 2, heightOffset),
    }, objects.length)
    onObjectsChange([...objects, next])
    onSelect(next.id)
  }

  const deleteSelected = () => {
    if (!selected) return
    if (movingId === selected.id) onCancelMove()
    onObjectsChange(objects.filter((object) => object.id !== selected.id))
    onSelect(null)
  }

  const deleteSelectedSpawner = () => {
    if (!selectedSpawner) return
    onSpawnersChange(spawners.filter((spawner) => spawner.id !== selectedSpawner.id))
    onSelectSpawner(null)
  }

  const deleteSelectedBiome = () => {
    if (!selectedBiome) return
    onBiomesChange(biomes.filter((area) => area.id !== selectedBiome.id))
    onSelectBiome(null)
  }

  const clearPaintedBiomes = () => {
    onPushBiomeUndoSnapshot?.()
    onBiomesChange(biomes.filter((area) => area.source !== 'paint'))
    setMessage('Peinture biome effacee.')
  }

  const saveObjects = async () => {
    setSaving(true)
    setMessage('')
    try {
      const response = await fetch('/dev/save-map-objects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          placements: toSavedPlacements(objects),
          spawners: toSavedSpawners(spawners),
          biomes: toSavedBiomes(biomes),
          terrainModifications,
        }),
      })
      if (!response.ok) throw new Error(await response.text())
      setMessage('Map, biomes et terrain sauvegardes.')
    } catch (error) {
      setMessage(`Sauvegarde impossible: ${error.message}`)
    } finally {
      setSaving(false)
    }
  }

  const importMapModels = async () => {
    setImportingModels(true)
    setMessage('')
    try {
      const response = await fetch('/dev/import-map-models', { method: 'POST' })
      const raw = await response.text()
      let payload = null
      try {
        payload = raw ? JSON.parse(raw) : null
      } catch {
        payload = null
      }
      if (!response.ok) throw new Error(payload?.message ?? raw)
      setMessage(`${payload?.imported ?? 0} modele(s) importe(s). Rechargement de l'editeur...`)
      window.setTimeout(() => window.location.reload(), 350)
    } catch (error) {
      setMessage(`Import impossible: ${error.message}`)
    } finally {
      setImportingModels(false)
    }
  }

  return (
    <aside style={styles.panel}>
      <div style={styles.header}>
        <div>
          <strong style={styles.title}>Edition map</strong>
          <span style={styles.subtitle}>{objects.length} objet(s), {spawners.length} spawner(s), {biomes.length} biome(s)</span>
        </div>
      </div>

      <Section title="Bibliotheque">
        <SelectField label="Objet" value={selectedObjectId} options={options} onChange={setObjectId} />
        <button type="button" style={styles.primaryButton} onClick={addObject}>
          Ajouter
        </button>
        <button type="button" style={styles.secondaryButton} onClick={importMapModels} disabled={importingModels}>
          {importingModels ? 'Import...' : 'Importer modeles'}
        </button>
      </Section>

      <Section title="Spawners monstres">
        <SelectField label="Type" value={spawnerType} options={spawnerTypeOptions} onChange={setSpawnerType} />
        <button type="button" style={styles.primaryButton} onClick={addSpawner}>
          Ajouter spawner
        </button>
        {spawners.length ? (
          <div style={styles.libraryList}>
            {spawners.map((spawner, index) => {
              const isSelected = spawner.id === selectedSpawnerId
              const typeLabel = MONSTER_SPAWNER_TYPES[spawner.monsterType]?.name ?? spawner.monsterType

              return (
                <button
                  key={spawner.id}
                  type="button"
                  onClick={() => onSelectSpawner(spawner.id)}
                  style={{
                    ...styles.libraryItem,
                    width: '100%',
                    textAlign: 'left',
                    cursor: 'pointer',
                    background: isSelected ? 'rgba(255, 212, 71, 0.16)' : 'rgba(26, 32, 36, 0.72)',
                    border: `1px solid ${isSelected ? '#ffd447' : 'rgba(223, 229, 233, 0.12)'}`,
                    color: '#eef4f2',
                  }}
                >
                  <strong>Spawner {typeLabel} #{index + 1}</strong>
                  <span style={{ color: '#9fb3ac', fontSize: 11 }}>
                    diam. {spawner.diameter.toFixed(0)} / x {spawner.position[0].toFixed(1)} / z {spawner.position[2].toFixed(1)}
                  </span>
                </button>
              )
            })}
          </div>
        ) : (
          <div style={styles.libraryEmpty}>Aucun spawner place.</div>
        )}
      </Section>

      <Section title="Terraformation">
        {terrainBrush && (
          <div style={styles.subcard}>
            <div style={styles.actions}>
              <button
                type="button"
                style={terrainBrush.active ? styles.primaryButton : styles.secondaryButton}
                onClick={() => patchTerrainBrush({ active: !terrainBrush.active })}
              >
                {terrainBrush.active ? 'Pinceau actif' : 'Activer'}
              </button>
            </div>
            <SelectField
              label="Outil"
              value={terrainBrush.op}
              options={[
                { value: 'add', label: 'Ajouter' },
                { value: 'dig', label: 'Creuser' },
                { value: 'flatten', label: 'Aplanir' },
                { value: 'reset', label: 'Restaurer' },
              ]}
              onChange={(op) => patchTerrainBrush({ op })}
            />
            <SliderField
              label="Rayon"
              value={terrainBrush.radius}
              min={1}
              max={24}
              step={0.5}
              onChange={(radius) => patchTerrainBrush({ radius })}
            />
            <SliderField
              label="Force"
              value={terrainBrush.strength}
              min={0.01}
              max={0.75}
              step={0.01}
              onChange={(strength) => patchTerrainBrush({ strength })}
            />
          </div>
        )}
      </Section>

      <Section title="Biomes">
        <SelectField label="Biome" value={biomeType} options={biomeTypeOptions} onChange={setBiomeType} />
        <button type="button" style={styles.primaryButton} onClick={addBiome}>
          Ajouter biome
        </button>
        {biomeBrush && (
          <div style={styles.subcard}>
            <strong>Pinceau biome</strong>
            <div style={styles.actions}>
              <button
                type="button"
                style={biomeBrush.active ? styles.primaryButton : styles.secondaryButton}
                onClick={() => patchBiomeBrush({ active: !biomeBrush.active })}
              >
                {biomeBrush.active ? 'Pinceau actif' : 'Activer'}
              </button>
              <button
                type="button"
                style={biomeBrush.mode === 'erase' ? styles.dangerButton : styles.secondaryButton}
                onClick={() => patchBiomeBrush({ mode: biomeBrush.mode === 'paint' ? 'erase' : 'paint' })}
              >
                {biomeBrush.mode === 'paint' ? 'Peindre' : 'Effacer'}
              </button>
            </div>
            <SelectField label="Biome peint" value={biomeBrush.biome} options={biomeTypeOptions} onChange={(biome) => patchBiomeBrush({ biome })} />
            <SliderField
              label="Rayon pinceau"
              value={biomeBrush.radius}
              min={2}
              max={36}
              step={0.5}
              onChange={(radius) => patchBiomeBrush({ radius })}
            />
            <SliderField
              label="Transition"
              value={biomeBrush.feather}
              min={0.5}
              max={Math.max(0.5, biomeBrush.radius - 0.1)}
              step={0.5}
              onChange={(feather) => patchBiomeBrush({ feather })}
            />
            <SliderField
              label="Sol mort"
              value={biomeBrush.groundIntensity}
              min={0}
              max={1}
              step={0.01}
              onChange={(groundIntensity) => patchBiomeBrush({ groundIntensity })}
            />
            <SliderField
              label="Brume"
              value={biomeBrush.fogIntensity}
              min={0}
              max={1}
              step={0.01}
              onChange={(fogIntensity) => patchBiomeBrush({ fogIntensity })}
            />
            <div style={styles.actions}>
              <button type="button" style={styles.secondaryButton} onClick={clearPaintedBiomes} disabled={!paintedBiomeCount}>
                Effacer peinture ({paintedBiomeCount})
              </button>
            </div>
          </div>
        )}
        {editableBiomes.length ? (
          <div style={styles.libraryList}>
            {editableBiomes.map((area, index) => {
              const isSelected = area.id === selectedBiomeId
              const typeLabel = BIOME_TYPES[area.biome]?.name ?? area.biome

              return (
                <button
                  key={area.id}
                  type="button"
                  onClick={() => onSelectBiome(area.id)}
                  style={{
                    ...styles.libraryItem,
                    width: '100%',
                    textAlign: 'left',
                    cursor: 'pointer',
                    background: isSelected ? 'rgba(131, 216, 196, 0.16)' : 'rgba(26, 32, 36, 0.72)',
                    border: `1px solid ${isSelected ? '#83d8c4' : 'rgba(223, 229, 233, 0.12)'}`,
                    color: '#eef4f2',
                  }}
                >
                  <strong>{typeLabel} #{index + 1}</strong>
                  <span style={{ color: '#9fb3ac', fontSize: 11 }}>
                    rayon {area.radius.toFixed(0)} / x {area.center[0].toFixed(1)} / z {area.center[1].toFixed(1)}
                  </span>
                </button>
              )
            })}
          </div>
        ) : (
          <div style={styles.libraryEmpty}>Aucun biome place.</div>
        )}
      </Section>

      <Section title="Objets places">
        {objects.length ? (
          <div style={styles.libraryList}>
            {objects.map((object, index) => {
              const isSelected = object.id === selectedId
              const isMoving = object.id === movingId
              const catalogItem = getMapObjectCatalogItem(object.objectId)

              return (
                <button
                  key={object.id}
                  type="button"
                  onClick={() => onSelect(object.id)}
                  style={{
                    ...styles.libraryItem,
                    width: '100%',
                    textAlign: 'left',
                    cursor: 'pointer',
                    background: isSelected ? 'rgba(159, 224, 188, 0.16)' : 'rgba(26, 32, 36, 0.72)',
                    border: `1px solid ${isSelected ? '#9fe0bc' : 'rgba(223, 229, 233, 0.12)'}`,
                    color: '#eef4f2',
                  }}
                >
                  <strong>{catalogItem?.name ?? object.objectId} #{index + 1}</strong>
                  <span style={{ color: isMoving ? '#ffd447' : '#9fb3ac', fontSize: 11 }}>
                    {isMoving ? 'Deplacement en cours' : `x ${object.position[0].toFixed(1)} / y ${object.position[1].toFixed(2)} / z ${object.position[2].toFixed(1)}`}
                  </span>
                </button>
              )
            })}
          </div>
        ) : (
          <div style={styles.libraryEmpty}>Aucun objet place.</div>
        )}
      </Section>

      <Section title="Selection">
        {selectedBiome ? (
          <>
            <div style={styles.subcard}>
              <strong>{BIOME_TYPES[selectedBiome.biome]?.name ?? selectedBiome.biome}</strong>
              <SelectField
                label="Biome"
                value={selectedBiome.biome}
                options={biomeTypeOptions}
                onChange={(biome) => patchSelectedBiome({ biome })}
              />
              <NumberField label="X" value={selectedBiome.center[0]} step={0.5} onChange={(value) => {
                const [, currentZ] = selectedBiome.center
                const [x, z] = clampMapPosition(value, currentZ)
                patchSelectedBiome({ center: [x, z] })
              }} />
              <NumberField label="Z" value={selectedBiome.center[1]} step={0.5} onChange={(value) => {
                const [currentX] = selectedBiome.center
                const [x, z] = clampMapPosition(currentX, value)
                patchSelectedBiome({ center: [x, z] })
              }} />
              <SliderField
                label="Rayon"
                value={selectedBiome.radius}
                min={2}
                max={140}
                step={1}
                onChange={(radius) => patchSelectedBiome({ radius })}
              />
              <SliderField
                label="Transition"
                value={selectedBiome.feather}
                min={0.5}
                max={80}
                step={0.5}
                onChange={(feather) => patchSelectedBiome({ feather })}
              />
              <SliderField
                label="Sol mort"
                value={selectedBiome.groundIntensity}
                min={0}
                max={1}
                step={0.01}
                onChange={(groundIntensity) => patchSelectedBiome({ groundIntensity })}
              />
              <ColorField
                label="Terre sombre"
                value={selectedBiome.groundColors.darkSoil}
                onChange={(darkSoil) => patchSelectedBiome({ groundColors: { ...selectedBiome.groundColors, darkSoil } })}
              />
              <ColorField
                label="Terre seche"
                value={selectedBiome.groundColors.dryClay}
                onChange={(dryClay) => patchSelectedBiome({ groundColors: { ...selectedBiome.groundColors, dryClay } })}
              />
              <ColorField
                label="Cendre"
                value={selectedBiome.groundColors.ash}
                onChange={(ash) => patchSelectedBiome({ groundColors: { ...selectedBiome.groundColors, ash } })}
              />
              <ColorField
                label="Poussiere os"
                value={selectedBiome.groundColors.boneDust}
                onChange={(boneDust) => patchSelectedBiome({ groundColors: { ...selectedBiome.groundColors, boneDust } })}
              />
              <ColorField
                label="Ombre froide"
                value={selectedBiome.groundColors.coldShadow}
                onChange={(coldShadow) => patchSelectedBiome({ groundColors: { ...selectedBiome.groundColors, coldShadow } })}
              />
              <SliderField
                label="Brume"
                value={selectedBiome.fogIntensity}
                min={0}
                max={1}
                step={0.01}
                onChange={(fogIntensity) => patchSelectedBiome({ fogIntensity })}
              />
              <SliderField
                label="Particules"
                value={selectedBiome.particleIntensity}
                min={0}
                max={1}
                step={0.01}
                onChange={(particleIntensity) => patchSelectedBiome({ particleIntensity })}
              />
            </div>
            <div style={styles.actions}>
              <button type="button" style={styles.dangerButton} onClick={deleteSelectedBiome}>Supprimer</button>
            </div>
          </>
        ) : selectedSpawner ? (
          <>
            <div style={styles.subcard}>
              <strong>{MONSTER_SPAWNER_TYPES[selectedSpawner.monsterType]?.name ?? selectedSpawner.monsterType}</strong>
              <SelectField
                label="Monstre"
                value={selectedSpawner.monsterType}
                options={spawnerTypeOptions}
                onChange={(monsterType) => patchSelectedSpawner({ monsterType })}
              />
              <NumberField label="X" value={selectedSpawner.position[0]} step={0.5} onChange={(value) => {
                const [, , z] = selectedSpawner.position
                const [x, nextZ] = clampMapPosition(value, z)
                patchSelectedSpawner({ position: [x, getTerrainHeight(x, nextZ), nextZ] })
              }} />
              <NumberField label="Z" value={selectedSpawner.position[2]} step={0.5} onChange={(value) => {
                const [currentX] = selectedSpawner.position
                const [x, z] = clampMapPosition(currentX, value)
                patchSelectedSpawner({ position: [x, getTerrainHeight(x, z), z] })
              }} />
              <SliderField
                label="Diametre"
                value={selectedSpawner.diameter}
                min={2}
                max={80}
                step={1}
                onChange={(diameter) => patchSelectedSpawner({ diameter })}
              />
            </div>
            <div style={styles.actions}>
              <button type="button" style={styles.dangerButton} onClick={deleteSelectedSpawner}>Supprimer</button>
            </div>
          </>
        ) : selected ? (
          <>
            <div style={styles.subcard}>
              <strong>{getMapObjectCatalogItem(selected.objectId)?.name ?? selected.objectId}</strong>
              <NumberField label="X" value={selected.position[0]} step={0.5} onChange={(value) => {
                const [, , z] = selected.position
                const heightOffset = getPlacementHeightOffset(selected)
                const [x, nextZ] = clampMapPosition(value, z)
                patchSelected({ position: getTerrainAnchoredPosition(x, nextZ, heightOffset) })
              }} />
              <NumberField label="Y" value={selected.position[1]} step={0.05} onChange={(value) => {
                const [x, , z] = selected.position
                patchSelected({ position: [x, value, z] })
              }} />
              <NumberField label="Z" value={selected.position[2]} step={0.5} onChange={(value) => {
                const [currentX] = selected.position
                const heightOffset = getPlacementHeightOffset(selected)
                const [x, z] = clampMapPosition(currentX, value)
                patchSelected({ position: getTerrainAnchoredPosition(x, z, heightOffset) })
              }} />
              <SliderField
                label="Offset sol"
                value={getPlacementHeightOffset(selected)}
                min={-2}
                max={2}
                step={0.05}
                onChange={(heightOffset) => {
                  const [x, , z] = selected.position
                  patchSelected({ position: getTerrainAnchoredPosition(x, z, heightOffset) })
                }}
              />
              <SliderField label="Rotation" value={selected.rotationY} min={-Math.PI} max={Math.PI} step={0.01} onChange={(rotationY) => patchSelected({ rotationY })} />
              <div style={styles.actions}>
                <button type="button" style={styles.secondaryButton} onClick={() => patchSelected({ rotationY: selected.rotationY - Math.PI / 4 })}>-45 deg</button>
                <button type="button" style={styles.secondaryButton} onClick={() => patchSelected({ rotationY: selected.rotationY + Math.PI / 4 })}>+45 deg</button>
                <button type="button" style={styles.secondaryButton} onClick={() => {
                  const [x, , z] = selected.position
                  patchSelected({ position: getTerrainAnchoredPosition(x, z, 0) })
                }}>Sol</button>
              </div>
              <SliderField label="Echelle" value={selected.scale} min={0.35} max={2.5} step={0.05} onChange={(scale) => patchSelected({ scale })} />
            </div>
            <div style={styles.actions}>
              {movingId === selected.id ? (
                <>
                  <button type="button" style={styles.primaryButton} onClick={onConfirmMove}>Valider</button>
                  <button type="button" style={styles.secondaryButton} onClick={onCancelMove}>Annuler</button>
                </>
              ) : (
                <button type="button" style={styles.primaryButton} onClick={() => onBeginMove(selected.id)}>Deplacer</button>
              )}
              <button type="button" style={styles.secondaryButton} onClick={duplicateSelected} disabled={Boolean(movingId)}>Dupliquer</button>
              <button type="button" style={styles.dangerButton} onClick={deleteSelected}>Supprimer</button>
            </div>
          </>
        ) : (
          <div style={styles.libraryEmpty}>Selectionne une tour, un spawner, un biome, ou ajoute un element.</div>
        )}
      </Section>

      <Section title="Camera">
        <div style={styles.actions}>
          <button
            type="button"
            style={cameraView === 'top' ? styles.primaryButton : styles.secondaryButton}
            onClick={() => onCameraViewChange('top')}
          >
            Dessus
          </button>
          <button
            type="button"
            style={cameraView === 'orbit' ? styles.primaryButton : styles.secondaryButton}
            onClick={() => onCameraViewChange('orbit')}
          >
            3D
          </button>
        </div>
      </Section>

      <button type="button" style={{ ...styles.primaryButton, width: '100%', marginTop: 12 }} onClick={saveObjects} disabled={saving || Boolean(movingId)}>
        {saving ? 'Sauvegarde...' : 'Sauvegarder la map'}
      </button>
      {message && <p style={styles.message}>{message}</p>}
      <p style={styles.footer}>{movingId ? 'Clique ou glisse sur le sol, puis valide ou annule le deplacement.' : 'Glisse un objet pour le deplacer. Glisse le sol vide pour bouger la camera, molette pour zoomer.'}</p>
    </aside>
  )
}
