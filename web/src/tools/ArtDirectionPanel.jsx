import { useEffect, useRef, useState } from 'react'
import {
  publishSharedDevArtDirection,
  serializeArtDirectionDocument,
  useArtDirectionStore,
} from '../artDirection/artDirectionStore'
import { styles } from './editorStyles'

function NumberField({ label, value, min, max, step, onChange }) {
  return (
    <label style={styles.blockField}>
      <span style={styles.sliderLabel}>
        <span>{label}</span>
        <strong>{Number(value).toFixed(step < 0.01 ? 4 : step < 1 ? 2 : 0)}</strong>
      </span>
      <input
        style={styles.slider}
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  )
}

function ColorField({ label, value, onChange }) {
  return (
    <label style={styles.row}>
      <span style={styles.label}>{label}</span>
      <span style={styles.inlineControls}>
        <code>{value}</code>
        <input
          style={styles.colorInput}
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </span>
    </label>
  )
}

function Section({ title, children, initiallyOpen = false }) {
  return (
    <details style={styles.section} open={initiallyOpen}>
      <summary style={{ ...styles.sectionButton, listStyle: 'none' }}>{title}</summary>
      <div style={styles.sectionBody}>{children}</div>
    </details>
  )
}

function SurfaceFields({ label, value, path, setValue }) {
  return (
    <div style={styles.subcard}>
      <strong>{label}</strong>
      <ColorField
        label="Couleur"
        value={value.color}
        onChange={(next) => setValue(`${path}.color`, next)}
      />
      <NumberField
        label="Rugosité"
        value={value.roughness}
        min={0}
        max={1}
        step={0.01}
        onChange={(next) => setValue(`${path}.roughness`, next)}
      />
    </div>
  )
}

export default function ArtDirectionPanel() {
  const {
    presets,
    activePresetId,
    comparisonPresetId,
    comparisonView,
    selectPreset,
    setValue,
    createPreset,
    duplicatePreset,
    renamePreset,
    restorePreset,
    deletePreset,
    setComparisonPreset,
    toggleComparisonView,
    importDocument,
  } = useArtDirectionStore()
  const activePreset = presets.find((preset) => preset.id === activePresetId) ?? presets[0]
  const values = activePreset.values
  const [newPresetName, setNewPresetName] = useState('')
  const [message, setMessage] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      publishSharedDevArtDirection().catch(() => {})
    }, 250)
    return () => window.clearTimeout(timeoutId)
  }, [activePresetId, comparisonPresetId, presets])

  const showMessage = (text) => {
    setMessage(text)
    window.setTimeout(() => setMessage(''), 2600)
  }

  const exportPresets = () => {
    const blob = new Blob([serializeArtDirectionDocument()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `direction-artistique-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
    showMessage('Presets exportés.')
  }

  const importPresets = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const count = importDocument(await file.text())
      showMessage(`${count} preset${count > 1 ? 's' : ''} importé${count > 1 ? 's' : ''}.`)
    } catch (error) {
      showMessage(error?.message || 'Import impossible.')
    }
  }

  return (
    <aside style={{ ...styles.panel, width: 'min(390px, calc(100vw - 28px))' }}>
      <header style={styles.header}>
        <div>
          <strong style={styles.title}>Direction artistique</strong>
          <span style={styles.subtitle}>Ajustements temps réel — aucun rechargement</span>
        </div>
        <span
          style={{
            padding: '4px 7px',
            borderRadius: 999,
            color: '#8ef0ba',
            background: 'rgba(79, 190, 128, 0.14)',
            fontSize: 10,
            fontWeight: 800,
          }}
        >
          DEV
        </span>
      </header>

      <div style={styles.subcard}>
        <label style={styles.blockField}>
          <span style={styles.label}>Preset actif</span>
          <select
            style={styles.select}
            value={activePresetId}
            onChange={(event) => selectPreset(event.target.value)}
          >
            {presets.map((preset) => (
              <option key={preset.id} value={preset.id}>{preset.name}</option>
            ))}
          </select>
        </label>

        <div style={styles.inlineControls}>
          <input
            style={styles.textInput}
            value={activePreset.name}
            maxLength={80}
            onChange={(event) => renamePreset(event.target.value)}
            aria-label="Nom du preset actif"
          />
          <span style={{ color: '#7f918c', fontSize: 11 }}>auto</span>
        </div>

        <div style={{ ...styles.actions, flexWrap: 'wrap' }}>
          <button style={styles.secondaryButton} type="button" onClick={duplicatePreset}>
            Dupliquer
          </button>
          <button
            style={styles.secondaryButton}
            type="button"
            onClick={() => {
              if (window.confirm(`Restaurer « ${activePreset.name} » à son état d’origine ?`)) {
                restorePreset()
                showMessage('Preset restauré.')
              }
            }}
          >
            Restaurer
          </button>
          <button
            style={styles.dangerButton}
            type="button"
            disabled={presets.length <= 1}
            onClick={() => {
              if (window.confirm(`Supprimer « ${activePreset.name} » ?`)) deletePreset()
            }}
          >
            Supprimer
          </button>
        </div>

        <div style={styles.inlineControls}>
          <input
            style={styles.textInput}
            value={newPresetName}
            placeholder="Nom du nouveau preset"
            onChange={(event) => setNewPresetName(event.target.value)}
          />
          <button
            style={styles.primaryButton}
            type="button"
            onClick={() => {
              createPreset(newPresetName)
              setNewPresetName('')
            }}
          >
            Créer
          </button>
        </div>
      </div>

      <Section title="Comparaison A / B">
        <label style={styles.blockField}>
          <span style={styles.label}>Preset de comparaison</span>
          <select
            style={styles.select}
            value={comparisonPresetId}
            onChange={(event) => setComparisonPreset(event.target.value)}
          >
            {presets.map((preset) => (
              <option key={preset.id} value={preset.id}>{preset.name}</option>
            ))}
          </select>
        </label>
        <button style={styles.primaryButton} type="button" onClick={toggleComparisonView}>
          Vue {comparisonView === 'active' ? `A — ${activePreset.name}` : 'B — comparaison'}
          {' · '}
          afficher {comparisonView === 'active' ? 'B' : 'A'}
        </button>
      </Section>

      <Section title="Éclairage" initiallyOpen>
        <NumberField label="Azimut du soleil" value={values.lighting.sunAzimuth} min={-180} max={180} step={1} onChange={(value) => setValue('lighting.sunAzimuth', value)} />
        <NumberField label="Élévation du soleil" value={values.lighting.sunElevation} min={1} max={89} step={1} onChange={(value) => setValue('lighting.sunElevation', value)} />
        <ColorField label="Couleur du soleil" value={values.lighting.sunColor} onChange={(value) => setValue('lighting.sunColor', value)} />
        <NumberField label="Intensité du soleil" value={values.lighting.sunIntensity} min={0} max={12} step={0.05} onChange={(value) => setValue('lighting.sunIntensity', value)} />
        <NumberField label="Intensité ambiante" value={values.lighting.hemisphereIntensity} min={0} max={6} step={0.05} onChange={(value) => setValue('lighting.hemisphereIntensity', value)} />
        <ColorField label="Lumière du ciel" value={values.lighting.skyLightColor} onChange={(value) => setValue('lighting.skyLightColor', value)} />
        <ColorField label="Lumière du sol" value={values.lighting.groundLightColor} onChange={(value) => setValue('lighting.groundLightColor', value)} />
      </Section>

      <Section title="Ombres">
        <label style={styles.checkboxRow}>
          <input type="checkbox" checked={values.shadows.enabled} onChange={(event) => setValue('shadows.enabled', event.target.checked)} />
          Ombres dynamiques
        </label>
        <label style={styles.blockField}>
          <span style={styles.label}>Résolution</span>
          <select style={styles.select} value={values.shadows.mapSize} onChange={(event) => setValue('shadows.mapSize', Number(event.target.value))}>
            {[256, 512, 1024, 2048].map((size) => <option key={size} value={size}>{size} × {size}</option>)}
          </select>
        </label>
        <NumberField label="Étendue" value={values.shadows.extent} min={8} max={80} step={1} onChange={(value) => setValue('shadows.extent', value)} />
        <NumberField label="Bias" value={values.shadows.bias} min={-0.01} max={0.01} step={0.00005} onChange={(value) => setValue('shadows.bias', value)} />
        <NumberField label="Normal bias" value={values.shadows.normalBias} min={0} max={0.2} step={0.001} onChange={(value) => setValue('shadows.normalBias', value)} />
        <NumberField label="Adoucissement" value={values.shadows.radius} min={0} max={8} step={0.05} onChange={(value) => setValue('shadows.radius', value)} />
      </Section>

      <Section title="Ciel">
        <ColorField label="Horizon" value={values.sky.horizon} onChange={(value) => setValue('sky.horizon', value)} />
        <ColorField label="Zénith" value={values.sky.zenith} onChange={(value) => setValue('sky.zenith', value)} />
        <ColorField label="Base des nuages" value={values.sky.cloudBase} onChange={(value) => setValue('sky.cloudBase', value)} />
        <ColorField label="Lumière chaude" value={values.sky.cloudWarm} onChange={(value) => setValue('sky.cloudWarm', value)} />
        <ColorField label="Ombre des nuages" value={values.sky.cloudShade} onChange={(value) => setValue('sky.cloudShade', value)} />
        <NumberField label="Luminosité" value={values.sky.brightness} min={0.2} max={3} step={0.01} onChange={(value) => setValue('sky.brightness', value)} />
        <NumberField label="Couverture nuageuse" value={values.sky.cloudCoverage} min={-0.4} max={0.45} step={0.01} onChange={(value) => setValue('sky.cloudCoverage', value)} />
      </Section>

      <Section title="Brouillard">
        <ColorField label="Fond" value={values.fog.backgroundColor} onChange={(value) => setValue('fog.backgroundColor', value)} />
        <ColorField label="Couleur" value={values.fog.color} onChange={(value) => setValue('fog.color', value)} />
        <NumberField label="Densité" value={values.fog.density} min={0} max={0.025} step={0.0001} onChange={(value) => setValue('fog.density', value)} />
      </Section>

      <Section title="Matières">
        <SurfaceFields label="Terrain" value={values.surfaces.terrain} path="surfaces.terrain" setValue={setValue} />
        <SurfaceFields label="Herbe" value={values.surfaces.grass} path="surfaces.grass" setValue={setValue} />
        <SurfaceFields label="Feuilles" value={values.surfaces.leaves} path="surfaces.leaves" setValue={setValue} />
        <SurfaceFields label="Troncs" value={values.surfaces.trunks} path="surfaces.trunks" setValue={setValue} />
      </Section>

      <Section title="Étalonnage global" initiallyOpen>
        <NumberField label="Exposition" value={values.grading.exposure} min={0.2} max={3} step={0.01} onChange={(value) => setValue('grading.exposure', value)} />
        <NumberField label="Contraste" value={values.grading.contrast} min={0.4} max={2} step={0.01} onChange={(value) => setValue('grading.contrast', value)} />
        <NumberField label="Saturation" value={values.grading.saturation} min={0} max={2.5} step={0.01} onChange={(value) => setValue('grading.saturation', value)} />
        <NumberField label="Température" value={values.grading.temperature} min={-1} max={1} step={0.01} onChange={(value) => setValue('grading.temperature', value)} />
      </Section>

      <Section title="Import / export">
        <div style={styles.actions}>
          <button style={styles.primaryButton} type="button" onClick={exportPresets}>Exporter JSON</button>
          <button style={styles.secondaryButton} type="button" onClick={() => inputRef.current?.click()}>Importer JSON</button>
          <input ref={inputRef} type="file" accept="application/json,.json" hidden onChange={importPresets} />
        </div>
      </Section>

      {message && <p style={styles.message}>{message}</p>}
      <p style={styles.footer}>
        Les valeurs sont sauvegardées sur cet ordinateur et partagées avec les appareils connectés au serveur local.
      </p>
    </aside>
  )
}
