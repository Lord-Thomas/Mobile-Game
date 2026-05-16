import { useMemo, useState } from 'react'
import NeighborHouse from '../world/NeighborHouse'
import { DEFAULT_HOUSE_CONFIG } from '../world/house/housePresets'
import {
  addCurrentHouseToLibrary,
  addHousePart,
  deleteHouseFromLibrary,
  deleteHousePart,
  loadHouseFromLibrary,
  setHouseEditorConfig,
  updateHousePart,
  useHouseEditorStore,
} from './houseEditorStore'
import { ColorField, Section, SelectField, SliderField } from './editorControls'
import { styles } from './editorStyles'

const ROOF_TYPES = [
  { value: 'gable', label: 'Double pente' },
  { value: 'lean_to', label: 'Appentis' },
  { value: 'flat', label: 'Plat' },
]

export function HouseDevScene() {
  const { config } = useHouseEditorStore()
  const mainPart = config.parts[0]

  return (
    <NeighborHouse
      position={[0, 0, 0]}
      color={config.color}
      trim={config.trim}
      rotationY={config.rotationY}
      size={mainPart.size}
      doorWall={config.doorWall}
      parts={config.parts}
    />
  )
}

export function HouseDevPanel() {
  const { config, library } = useHouseEditorStore()
  const [message, setMessage] = useState('')
  const exportJson = useMemo(() => JSON.stringify(config, null, 2), [config])

  const showMessage = (nextMessage) => {
    setMessage(nextMessage)
    window.setTimeout(() => setMessage(''), 1800)
  }

  const copyConfig = async () => {
    await navigator.clipboard.writeText(exportJson)
    showMessage('Config copiee')
  }

  const resetConfig = () => {
    setHouseEditorConfig(DEFAULT_HOUSE_CONFIG)
    showMessage('Maison remise a zero')
  }

  const addToLibrary = () => {
    const item = addCurrentHouseToLibrary()
    showMessage(`${item.name} ajoutee`)
  }

  return (
    <aside style={styles.panel}>
      <header style={styles.header}>
        <div>
          <strong style={styles.title}>Editeur de maison</strong>
          <span style={styles.subtitle}>Volumes, dependances et toitures</span>
        </div>
      </header>
      <Section title="Maison">
        <ColorField label="Teinte murs" value={config.color} onChange={(color) => setHouseEditorConfig({ color })} />
        <ColorField label="Toit / bordures" value={config.trim} onChange={(trim) => setHouseEditorConfig({ trim })} />
        <SliderField label="Rotation" value={config.rotationY} min={-3.14} max={3.14} step={0.01} onChange={(rotationY) => setHouseEditorConfig({ rotationY })} />
        <SelectField
          label="Mur de porte"
          value={config.doorWall}
          options={[
            { value: 'north', label: 'Nord' },
            { value: 'south', label: 'Sud' },
            { value: 'east', label: 'Est' },
            { value: 'west', label: 'Ouest' },
          ]}
          onChange={(doorWall) => setHouseEditorConfig({
            doorWall,
            parts: config.parts.map((part, index) => index === 0 ? { ...part, doorWall } : part),
          })}
        />
      </Section>

      <Section title="Volumes">
        {config.parts.map((part, index) => (
          <div key={part.id} style={styles.subcard}>
            <strong>{index === 0 ? 'Volume principal' : `Dependance ${index}`}</strong>
            <SliderField label="Offset X" value={part.offset[0]} min={-8} max={8} step={0.1} onChange={(value) => updateHousePart(part.id, { offset: [value, part.offset[1]] })} />
            <SliderField label="Offset Z" value={part.offset[1]} min={-8} max={8} step={0.1} onChange={(value) => updateHousePart(part.id, { offset: [part.offset[0], value] })} />
            <SliderField label="Largeur" value={part.size[0]} min={1.8} max={10} step={0.1} onChange={(value) => updateHousePart(part.id, { size: [value, part.size[1], part.size[2]] })} />
            <SliderField label="Hauteur murs" value={part.size[1]} min={2.2} max={5.5} step={0.1} onChange={(value) => updateHousePart(part.id, { size: [part.size[0], value, part.size[2]] })} />
            <SliderField label="Profondeur" value={part.size[2]} min={1.8} max={10} step={0.1} onChange={(value) => updateHousePart(part.id, { size: [part.size[0], part.size[1], value] })} />
            <SelectField label="Type de toit" value={part.roofType} options={ROOF_TYPES} onChange={(roofType) => updateHousePart(part.id, { roofType })} />
            {index > 0 && (
              <button type="button" onClick={() => deleteHousePart(part.id)} style={styles.dangerButton}>
                Supprimer
              </button>
            )}
          </div>
        ))}
        <button type="button" onClick={addHousePart} style={styles.primaryButton}>Ajouter une dependance</button>
      </Section>

      <Section title="Export jeu">
        <textarea readOnly value={exportJson} style={styles.textarea} />
        <div style={styles.actions}>
          <button type="button" onClick={copyConfig} style={styles.primaryButton}>Copier JSON</button>
          <button type="button" onClick={resetConfig} style={styles.secondaryButton}>Reset</button>
        </div>
        {message && <p style={styles.message}>{message}</p>}
      </Section>

      <Section title="Bibliotheque">
        <button type="button" onClick={addToLibrary} style={styles.primaryButton}>Ajouter a la bibliotheque</button>
        <div style={styles.libraryList}>
          {library.length === 0 && <span style={styles.libraryEmpty}>Aucune maison ajoutee</span>}
          {library.map((item) => (
            <div key={item.id} style={styles.libraryItem}>
              <span>{item.name}</span>
              <div style={styles.libraryActions}>
                <button type="button" onClick={() => loadHouseFromLibrary(item.id)} style={styles.smallButton}>Charger</button>
                <button type="button" onClick={() => deleteHouseFromLibrary(item.id)} style={styles.smallButton}>Supprimer</button>
              </div>
            </div>
          ))}
        </div>
      </Section>
    </aside>
  )
}
