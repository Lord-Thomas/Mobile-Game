import { useMemo, useState } from 'react'
import { MathUtils } from 'three'
import MapObjectPlaceables from '../world/MapObjectPlaceables'
import { MAP_OBJECT_CATALOG, MAP_OBJECT_LIBRARY, normalizeMapObjectPlacement } from '../world/mapObjects'
import { OUTDOOR_HALF_SIZE } from '../world/outdoorData'
import { getTerrainHeight } from '../world/terrain/terrainGeometry'
import { NumberField, Section, SelectField, SliderField } from './editorControls'
import { styles } from './editorStyles'

const MAP_GRID_SIZE = 0.5
const MAP_EDIT_HALF_SIZE = OUTDOOR_HALF_SIZE - 2

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

export function MapEditorScene({
  objects,
  selectedId,
  movingId,
  draggingId,
  onSelect,
  onStartDragging,
  onStopDragging,
  onMove,
}) {
  const moveFromPoint = (point, id = movingId) => {
    if (!id) return
    const [x, z] = clampMapPosition(point.x, point.z)
    onMove(id, [x, getTerrainHeight(x, z), z])
  }

  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.06, 0]}
        onPointerDown={(event) => {
          if (!movingId) return
          if (event.button !== 0) return
          event.stopPropagation()
          moveFromPoint(event.point)
          onStartDragging(movingId)
        }}
        onPointerMove={(event) => {
          if (!draggingId) return
          event.stopPropagation()
          moveFromPoint(event.point, draggingId)
        }}
        onPointerUp={(event) => {
          event.stopPropagation()
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
      <gridHelper args={[OUTDOOR_HALF_SIZE * 2, OUTDOOR_HALF_SIZE * 4, '#7aa88e', '#30403a']} position={[0, 0.09, 0]} />
      <MapObjectPlaceables
        objects={objects}
        selectedId={selectedId}
        onSelect={onSelect}
        onStartDragging={onStartDragging}
        canStartDragging={(placement) => placement.id === movingId}
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
    setMessage('Objet ajoute. Glisse-le ou clique sur la map pour le placer.')
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
