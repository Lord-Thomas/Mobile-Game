import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html, OrthographicCamera } from '@react-three/drei'
import { BufferGeometry, Float32BufferAttribute, MathUtils, Plane, Raycaster, Vector2, Vector3 } from 'three'
import MapObjectPlaceables from '../world/MapObjectPlaceables'
import {
  MAP_OBJECT_CATALOG,
  MAP_OBJECT_LIBRARY,
  MONSTER_SPAWNER_TYPE_IDS,
  MONSTER_SPAWNER_TYPES,
  normalizeMapObjectPlacement,
  normalizeMonsterSpawner,
} from '../world/mapObjects'
import { OUTDOOR_HALF_SIZE } from '../world/outdoorData'
import { OUTDOOR_LIGHT_LAYER } from '../world/lightingLayers'
import { getTerrainHeight } from '../world/terrain/terrainGeometry'
import { NumberField, Section, SelectField, SliderField } from './editorControls'
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

function snap(value, gridSize = MAP_GRID_SIZE) {
  return Math.round(value / gridSize) * gridSize
}

function clampMapPosition(x, z) {
  return [
    MathUtils.clamp(snap(x), -MAP_EDIT_HALF_SIZE, MAP_EDIT_HALF_SIZE),
    MathUtils.clamp(snap(z), -MAP_EDIT_HALF_SIZE, MAP_EDIT_HALF_SIZE),
  ]
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
    id: `${objectId}_${Date.now().toString(36)}`,
    objectId,
    position: [x, getTerrainHeight(x, z), z],
    rotationY: 0,
    scale: MAP_OBJECT_CATALOG[objectId]?.defaultScale ?? 1,
  }, existingCount)
}

function createMonsterSpawner(monsterType, existingCount) {
  const [x, z] = clampMapPosition(existingCount * 3, -4)

  return normalizeMonsterSpawner({
    id: `monster_spawner_${Date.now().toString(36)}`,
    monsterType,
    position: [x, getTerrainHeight(x, z), z],
    diameter: 14,
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

function MapEditorCamera({ active }) {
  const { gl } = useThree()
  const camRef = useRef()
  const zoomRef = useRef(MAP_ZOOM_DEFAULT)

  // Place the camera once when the top view becomes active. After that the pan
  // handler on the floor mutates position imperatively, so we must NOT pass a
  // position prop (R3F would re-apply it on every render and reset the pan).
  useEffect(() => {
    const cam = camRef.current
    if (!active || !cam) return
    cam.position.set(0, MAP_CAMERA_HEIGHT, 0)
    cam.rotation.set(-Math.PI / 2, 0, 0)
    cam.layers.enable(OUTDOOR_LIGHT_LAYER)
    cam.zoom = MAP_ZOOM_DEFAULT
    zoomRef.current = MAP_ZOOM_DEFAULT
    cam.updateProjectionMatrix()
  }, [active])

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
  selectedId,
  selectedSpawnerId = null,
  movingId,
  draggingId,
  cameraView,
  onSelect,
  onSelectSpawner,
  onStartDragging,
  onStopDragging,
  onMove,
  onMoveSpawner,
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
  const isTopView = cameraView === 'top'

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

  return (
    <group>
      <MapEditorCamera active={isTopView} />
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
          onSelect(null)
          onSelectSpawner?.(null)
          if (isTopView) panRef.current = { x: event.clientX, y: event.clientY }
        }}
        onPointerMove={(event) => {
          if (draggingId) {
            // Active object drag: follow the cursor (deterministic ground point).
            event.stopPropagation()
            moveToPoint(draggingId, groundPointFromEvent(event))
            return
          }
          if (spawnerDragRef.current) {
            event.stopPropagation()
            moveSpawnerToPoint(spawnerDragRef.current, groundPointFromEvent(event))
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
        }}
        onClick={(event) => {
          // Click-to-place once "Deplacer" was pressed in the panel.
          if (!movingId || draggingId) return
          event.stopPropagation()
          moveToPoint(movingId, groundPointFromEvent(event))
        }}
        onPointerUp={(event) => {
          panRef.current = null
          spawnerDragRef.current = null
          if (!draggingId) return
          event.stopPropagation()
          onStopDragging()
        }}
        onPointerMissed={() => {
          panRef.current = null
          spawnerDragRef.current = null
          if (draggingId) onStopDragging()
          else if (!movingId) {
            onSelect(null)
            onSelectSpawner?.(null)
          }
        }}
      >
        <planeGeometry args={[OUTDOOR_HALF_SIZE * 2, OUTDOOR_HALF_SIZE * 2]} />
        <meshBasicMaterial transparent opacity={0.015} depthWrite={false} />
      </mesh>
      <TerrainFollowingGrid />
      <MonsterSpawnerMarkers
        spawners={spawners}
        selectedSpawnerId={selectedSpawnerId}
        onSpawnerPointerDown={handleSpawnerPointerDown}
        onSpawnerPointerMove={handleSpawnerPointerMove}
        onSpawnerPointerUp={handleSpawnerPointerUp}
      />
      <MapObjectPlaceables
        objects={objects}
        selectedId={selectedId}
        onSelect={onSelect}
        onStartDragging={onStartDragging}
      />
    </group>
  )
}

export function MapEditorPanel({
  objects,
  spawners = [],
  selectedId,
  selectedSpawnerId = null,
  movingId,
  cameraView,
  onObjectsChange,
  onSpawnersChange,
  onSelect,
  onSelectSpawner,
  onBeginMove,
  onConfirmMove,
  onCancelMove,
  onCameraViewChange,
}) {
  const [objectId, setObjectId] = useState(MAP_OBJECT_LIBRARY[0])
  const [spawnerType, setSpawnerType] = useState(MONSTER_SPAWNER_TYPE_IDS[0])
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const selected = objects.find((object) => object.id === selectedId) ?? null
  const selectedSpawner = spawners.find((spawner) => spawner.id === selectedSpawnerId) ?? null
  const options = useMemo(() => MAP_OBJECT_LIBRARY.map((id) => ({
    value: id,
    label: MAP_OBJECT_CATALOG[id]?.name ?? id,
  })), [])
  const spawnerTypeOptions = useMemo(() => MONSTER_SPAWNER_TYPE_IDS.map((id) => ({
    value: id,
    label: MONSTER_SPAWNER_TYPES[id]?.name ?? id,
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

  const addObject = () => {
    const next = createPlacement(objectId, objects.length)
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

  const duplicateSelected = () => {
    if (!selected) return
    const [x, , z] = selected.position
    const heightOffset = getPlacementHeightOffset(selected)
    const next = normalizeMapObjectPlacement({
      ...selected,
      id: `${selected.objectId}_${Date.now().toString(36)}`,
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
        }),
      })
      if (!response.ok) throw new Error(await response.text())
      setMessage('Map sauvegardee dans src/world/mapObjects.generated.js')
    } catch (error) {
      setMessage(`Sauvegarde impossible: ${error.message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <aside style={styles.panel}>
      <div style={styles.header}>
        <div>
          <strong style={styles.title}>Edition map</strong>
          <span style={styles.subtitle}>{objects.length} objet(s) places</span>
        </div>
      </div>

      <Section title="Bibliotheque">
        <SelectField label="Objet" value={objectId} options={options} onChange={setObjectId} />
        <button type="button" style={styles.primaryButton} onClick={addObject}>
          Ajouter
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

      <Section title="Objets places">
        {objects.length ? (
          <div style={styles.libraryList}>
            {objects.map((object, index) => {
              const isSelected = object.id === selectedId
              const isMoving = object.id === movingId
              const catalogItem = MAP_OBJECT_CATALOG[object.objectId]

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
        {selectedSpawner ? (
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
              <strong>{MAP_OBJECT_CATALOG[selected.objectId]?.name ?? selected.objectId}</strong>
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
          <div style={styles.libraryEmpty}>Selectionne une tour, un spawner, ou ajoute un element.</div>
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
