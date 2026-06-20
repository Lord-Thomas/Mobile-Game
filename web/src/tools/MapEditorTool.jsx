import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useThree } from '@react-three/fiber'
import { BufferGeometry, Float32BufferAttribute, MathUtils, Plane, Raycaster, Vector2, Vector3 } from 'three'
import MapObjectPlaceables from '../world/MapObjectPlaceables'
import { MAP_OBJECT_CATALOG, MAP_OBJECT_LIBRARY, normalizeMapObjectPlacement } from '../world/mapObjects'
import { OUTDOOR_HALF_SIZE } from '../world/outdoorData'
import { getTerrainHeight } from '../world/terrain/terrainGeometry'
import { NumberField, Section, SelectField, SliderField } from './editorControls'
import { styles } from './editorStyles'

const MAP_GRID_SIZE = 0.25
const MAP_EDIT_HALF_SIZE = OUTDOOR_HALF_SIZE - 2
const TERRAIN_GRID_SPACING = 4
const TERRAIN_GRID_SAMPLE_STEP = 2
const TERRAIN_GRID_MAJOR_EVERY = 16
const TERRAIN_GRID_Y_OFFSET = 0.055

function snap(value, gridSize = MAP_GRID_SIZE) {
  return Math.round(value / gridSize) * gridSize
}

function clampMapPosition(x, z) {
  return [
    MathUtils.clamp(snap(x), -MAP_EDIT_HALF_SIZE, MAP_EDIT_HALF_SIZE),
    MathUtils.clamp(snap(z), -MAP_EDIT_HALF_SIZE, MAP_EDIT_HALF_SIZE),
  ]
}

function getMapObjectPickRadius(object) {
  const catalogItem = MAP_OBJECT_CATALOG[object.objectId]
  return Math.max(3.5, (catalogItem?.hitRadius ?? catalogItem?.selectionRadius ?? 1.5) * (object.scale ?? 1) + 1.4)
}

function pickObjectAtPoint(objects, point) {
  return objects
    .map((object) => {
      const [x, , z] = object.position
      return {
        object,
        distance: Math.hypot(point.x - x, point.z - z),
        radius: getMapObjectPickRadius(object),
      }
    })
    .filter(({ distance, radius }) => distance <= radius)
    .sort((left, right) => left.distance - right.distance)[0]?.object ?? null
}

function pickObjectAtScreen(objects, clientX, clientY, camera, rect) {
  const screenPoint = new Vector3()

  return objects
    .map((object) => {
      const [x, y, z] = object.position
      const catalogItem = MAP_OBJECT_CATALOG[object.objectId]
      const objectHeight = (catalogItem?.targetHeightMeters ?? 3) * 1.38 * (object.scale ?? 1)
      screenPoint.set(x, y + objectHeight * 0.5, z).project(camera)
      const screenX = rect.left + (screenPoint.x + 1) * rect.width * 0.5
      const screenY = rect.top + (1 - screenPoint.y) * rect.height * 0.5
      return {
        object,
        distance: Math.hypot(clientX - screenX, clientY - screenY),
      }
    })
    .filter(({ distance }) => distance <= 120)
    .sort((left, right) => left.distance - right.distance)[0]?.object ?? null
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

export function MapEditorScene({
  objects,
  selectedId,
  movingId,
  draggingId,
  onSelect,
  onBeginMove,
  onStartDragging,
  onStopDragging,
  onMove,
}) {
  const { camera, gl } = useThree()
  const dragIdRef = useRef(null)
  const dragStartRef = useRef(null)
  const movingIdRef = useRef(movingId)
  const objectsRef = useRef(objects)
  const raycaster = useMemo(() => new Raycaster(), [])
  const pointer = useMemo(() => new Vector2(), [])
  const groundPlane = useMemo(() => new Plane(new Vector3(0, 1, 0), 0), [])
  const pointerGroundPoint = useMemo(() => new Vector3(), [])

  useEffect(() => { movingIdRef.current = movingId }, [movingId])
  useEffect(() => { objectsRef.current = objects }, [objects])

  const getGroundPointFromClient = useCallback((clientX, clientY) => {
    const rect = gl.domElement.getBoundingClientRect()
    pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -(((clientY - rect.top) / rect.height) * 2 - 1),
    )
    raycaster.setFromCamera(pointer, camera)
    return raycaster.ray.intersectPlane(groundPlane, pointerGroundPoint) ?? null
  }, [camera, gl.domElement, groundPlane, pointer, pointerGroundPoint, raycaster])

  const getGroundPointFromEvent = (event) => {
    if (!event.ray) return event.point
    return event.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), 0), new Vector3()) ?? event.point
  }

  const moveFromPoint = useCallback((point, id = movingId) => {
    if (!id) return
    const [x, z] = clampMapPosition(point.x, point.z)
    onMove(id, [x, getTerrainHeight(x, z), z])
  }, [movingId, onMove])

  const moveFromDragPoint = useCallback((point, id) => {
    const dragStart = dragStartRef.current
    if (!id || !dragStart || dragStart.id !== id) {
      moveFromPoint(point, id)
      return
    }

    const [originX, , originZ] = dragStart.origin
    const [x, z] = clampMapPosition(
      originX + point.x - dragStart.point.x,
      originZ + point.z - dragStart.point.z,
    )
    onMove(id, [x, getTerrainHeight(x, z), z])
  }, [moveFromPoint, onMove])

  const moveFromEvent = (event, id = movingId) => {
    moveFromDragPoint(getGroundPointFromEvent(event), id)
  }

  useEffect(() => {
    const canvas = gl.domElement

    const stopCanvasEvent = (event) => {
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation?.()
    }

    const handlePointerDown = (event) => {
      if (event.button !== 0) return
      const groundPoint = getGroundPointFromClient(event.clientX, event.clientY)
      if (!groundPoint) return

      const rect = canvas.getBoundingClientRect()
      const currentMovingId = movingIdRef.current
      let targetId = currentMovingId
      let targetObject = targetId
        ? objectsRef.current.find((object) => object.id === targetId)
        : null

      if (!targetId) {
        const pickedObject =
          pickObjectAtPoint(objectsRef.current, groundPoint) ??
          pickObjectAtScreen(objectsRef.current, event.clientX, event.clientY, camera, rect)

        if (!pickedObject) return
        targetId = pickedObject.id
        targetObject = pickedObject
        onSelect(targetId)
        onBeginMove(targetId)
      }

      stopCanvasEvent(event)
      dragIdRef.current = targetId
      dragStartRef.current = {
        id: targetId,
        point: groundPoint.clone(),
        origin: targetObject?.position ?? [groundPoint.x, getTerrainHeight(groundPoint.x, groundPoint.z), groundPoint.z],
      }
      canvas.setPointerCapture?.(event.pointerId)
      onStartDragging(targetId)
    }

    const handlePointerMove = (event) => {
      const targetId = dragIdRef.current
      if (!targetId) return
      const groundPoint = getGroundPointFromClient(event.clientX, event.clientY)
      if (!groundPoint) return
      stopCanvasEvent(event)
      moveFromDragPoint(groundPoint, targetId)
    }

    const handlePointerUp = (event) => {
      if (!dragIdRef.current) return
      stopCanvasEvent(event)
      dragIdRef.current = null
      dragStartRef.current = null
      canvas.releasePointerCapture?.(event.pointerId)
      onStopDragging()
    }

    canvas.addEventListener('pointerdown', handlePointerDown, true)
    canvas.addEventListener('pointermove', handlePointerMove, true)
    canvas.addEventListener('pointerup', handlePointerUp, true)
    canvas.addEventListener('pointercancel', handlePointerUp, true)

    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown, true)
      canvas.removeEventListener('pointermove', handlePointerMove, true)
      canvas.removeEventListener('pointerup', handlePointerUp, true)
      canvas.removeEventListener('pointercancel', handlePointerUp, true)
    }
  }, [camera, getGroundPointFromClient, gl.domElement, moveFromDragPoint, onBeginMove, onSelect, onStartDragging, onStopDragging])

  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.06, 0]}
        onPointerDown={(event) => {
          if (event.button !== 0) return
          const groundPoint = getGroundPointFromEvent(event)

          if (!movingId) {
            const pickedObject = pickObjectAtPoint(objects, groundPoint)
            if (!pickedObject) {
              onSelect(null)
              return
            }
            event.stopPropagation()
            event.target?.setPointerCapture?.(event.pointerId)
            dragStartRef.current = {
              id: pickedObject.id,
              point: groundPoint.clone(),
              origin: pickedObject.position,
            }
            onSelect(pickedObject.id)
            onBeginMove(pickedObject.id)
            onStartDragging(pickedObject.id)
            return
          }

          event.stopPropagation()
          event.target?.setPointerCapture?.(event.pointerId)
          const movingObject = objects.find((object) => object.id === movingId)
          dragStartRef.current = {
            id: movingId,
            point: groundPoint.clone(),
            origin: movingObject?.position ?? [groundPoint.x, getTerrainHeight(groundPoint.x, groundPoint.z), groundPoint.z],
          }
          onStartDragging(movingId)
        }}
        onPointerMove={(event) => {
          if (!draggingId) return
          event.stopPropagation()
          moveFromEvent(event, draggingId)
        }}
        onPointerUp={(event) => {
          event.stopPropagation()
          event.target?.releasePointerCapture?.(event.pointerId)
          dragStartRef.current = null
          onStopDragging()
        }}
        onPointerMissed={() => {
          onStopDragging()
          if (!movingId) onSelect(null)
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
        onBeginMove={onBeginMove}
        onStartDragging={onStartDragging}
        canStartDragging={(placement) => placement.id === movingId}
        canBeginMove={(placement) => !movingId || placement.id === movingId}
        onDragPointerMove={(id, event) => {
          if (id !== draggingId) return
          event.stopPropagation()
          moveFromEvent(event, id)
        }}
        onDragPointerUp={(id) => {
          if (id === draggingId) onStopDragging()
        }}
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
      <p style={styles.footer}>{movingId ? 'Clique ou glisse sur le sol, puis valide ou annule le deplacement.' : 'Camera dessus ou 3D: molette pour zoomer, clic droit pour se deplacer.'}</p>
    </aside>
  )
}
