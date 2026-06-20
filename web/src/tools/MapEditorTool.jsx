import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { OrthographicCamera } from '@react-three/drei'
import { BufferGeometry, Float32BufferAttribute, MathUtils } from 'three'
import MapObjectPlaceables from '../world/MapObjectPlaceables'
import { MAP_OBJECT_CATALOG, MAP_OBJECT_LIBRARY, normalizeMapObjectPlacement } from '../world/mapObjects'
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

function toSavedPlacements(objects) {
  return objects.map((object, index) => {
    const placement = normalizeMapObjectPlacement(object, index)
    const [x, , z] = placement.position
    return {
      id: placement.id,
      objectId: placement.objectId,
      position: [x, getTerrainHeight(x, z), z],
      rotationY: placement.rotationY,
      scale: placement.scale,
    }
  })
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
  selectedId,
  movingId,
  draggingId,
  cameraView,
  onSelect,
  onStartDragging,
  onStopDragging,
  onMove,
}) {
  // Ported from the in-game room editor (CustomizationCamera + EditableFloor):
  //  - a top-down ortho camera that never follows the selection,
  //  - one big invisible ground plane that, while an object is grabbed, makes it
  //    follow the cursor (absolute, grid-snapped), and otherwise pans the camera
  //    when you drag empty ground,
  //  - objects start their own drag on pointerdown and carry no move handler, so
  //    moves fall through to this plane.
  const { camera } = useThree()
  const panRef = useRef(null)
  const isTopView = cameraView === 'top'
  if (typeof window !== 'undefined') window.__mapCam = camera

  const moveToPoint = (id, point) => {
    if (!id) return
    const [x, z] = clampMapPosition(point.x, point.z)
    onMove(id, [x, getTerrainHeight(x, z), z])
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
          onSelect(null)
          if (isTopView) panRef.current = { x: event.clientX, y: event.clientY }
        }}
        onPointerMove={(event) => {
          if (draggingId) {
            // Active object drag: follow the cursor.
            event.stopPropagation()
            moveToPoint(draggingId, event.point)
            return
          }
          // Otherwise drag-pan the camera (top view only).
          if (!panRef.current || !isTopView) return
          const dx = event.clientX - panRef.current.x
          const dy = event.clientY - panRef.current.y
          panRef.current = { x: event.clientX, y: event.clientY }
          const worldPerPixel = 1 / camera.zoom
          camera.position.x = MathUtils.clamp(camera.position.x - dx * worldPerPixel, -MAP_PAN_BOUND, MAP_PAN_BOUND)
          camera.position.z = MathUtils.clamp(camera.position.z - dy * worldPerPixel, -MAP_PAN_BOUND, MAP_PAN_BOUND)
        }}
        onClick={(event) => {
          // Click-to-place once "Deplacer" was pressed in the panel.
          if (!movingId || draggingId) return
          event.stopPropagation()
          moveToPoint(movingId, event.point)
        }}
        onPointerUp={(event) => {
          panRef.current = null
          if (!draggingId) return
          event.stopPropagation()
          onStopDragging()
        }}
        onPointerMissed={() => {
          panRef.current = null
          if (draggingId) onStopDragging()
          else if (!movingId) onSelect(null)
        }}
      >
        <planeGeometry args={[OUTDOOR_HALF_SIZE * 2, OUTDOOR_HALF_SIZE * 2]} />
        <meshBasicMaterial transparent opacity={0.015} depthWrite={false} />
      </mesh>
      <TerrainFollowingGrid />
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
  selectedId,
  movingId,
  cameraView,
  onObjectsChange,
  onSelect,
  onBeginMove,
  onConfirmMove,
  onCancelMove,
  onCameraViewChange,
}) {
  const [objectId, setObjectId] = useState(MAP_OBJECT_LIBRARY[0])
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const selected = objects.find((object) => object.id === selectedId) ?? null
  const options = useMemo(() => MAP_OBJECT_LIBRARY.map((id) => ({
    value: id,
    label: MAP_OBJECT_CATALOG[id]?.name ?? id,
  })), [])

  const patchSelected = (patch) => {
    if (!selected) return
    onObjectsChange(objects.map((object) => (
      object.id === selected.id ? normalizeMapObjectPlacement({ ...object, ...patch }) : object
    )))
  }

  const addObject = () => {
    const next = createPlacement(objectId, objects.length)
    onObjectsChange([...objects, next])
    onSelect(next.id)
    setMessage('Objet ajoute et selectionne. Clique sur "Deplacer" pour le poser ailleurs, puis valide.')
  }

  const duplicateSelected = () => {
    if (!selected) return
    const [x, , z] = selected.position
    const next = normalizeMapObjectPlacement({
      ...selected,
      id: `${selected.objectId}_${Date.now().toString(36)}`,
      position: [x + 2, getTerrainHeight(x + 2, z + 2), z + 2],
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

  const saveObjects = async () => {
    setSaving(true)
    setMessage('')
    try {
      const response = await fetch('/dev/save-map-objects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ placements: toSavedPlacements(objects) }),
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
                    {isMoving ? 'Deplacement en cours' : `x ${object.position[0].toFixed(1)} / z ${object.position[2].toFixed(1)}`}
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
        {selected ? (
          <>
            <div style={styles.subcard}>
              <strong>{MAP_OBJECT_CATALOG[selected.objectId]?.name ?? selected.objectId}</strong>
              <NumberField label="X" value={selected.position[0]} step={0.5} onChange={(value) => {
                const [, , z] = selected.position
                const [x, nextZ] = clampMapPosition(value, z)
                patchSelected({ position: [x, getTerrainHeight(x, nextZ), nextZ] })
              }} />
              <NumberField label="Z" value={selected.position[2]} step={0.5} onChange={(value) => {
                const [currentX] = selected.position
                const [x, z] = clampMapPosition(currentX, value)
                patchSelected({ position: [x, getTerrainHeight(x, z), z] })
              }} />
              <SliderField label="Rotation" value={selected.rotationY} min={-Math.PI} max={Math.PI} step={0.01} onChange={(rotationY) => patchSelected({ rotationY })} />
              <div style={styles.actions}>
                <button type="button" style={styles.secondaryButton} onClick={() => patchSelected({ rotationY: selected.rotationY - Math.PI / 4 })}>-45 deg</button>
                <button type="button" style={styles.secondaryButton} onClick={() => patchSelected({ rotationY: selected.rotationY + Math.PI / 4 })}>+45 deg</button>
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
          <div style={styles.libraryEmpty}>Selectionne une tour ou ajoute un objet.</div>
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
