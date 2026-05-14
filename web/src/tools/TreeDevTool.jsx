import { useEffect, useMemo, useState } from 'react'
import { TreePreset } from '@dgreenheck/ez-tree'
import ProceduralTree from '../world/trees/ProceduralTree'
import { DEFAULT_TREE_CONFIG, getTreeEditorValues } from '../world/trees/proceduralTreeConfig'
import {
  getTreeEditorState,
  setTreeEditorConfig,
  setTreeEditorState,
  useTreeEditorStore,
} from './treeEditorStore'

const PRESETS = Object.keys(TreePreset)

function toHex(value) {
  return `#${Math.max(0, value).toString(16).padStart(6, '0')}`
}

function fromHex(value) {
  return parseInt(value.slice(1), 16)
}

function NumberField({ label, value, min, max, step = 1, onChange }) {
  return (
    <label style={styles.row}>
      <span style={styles.label}>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        style={styles.numberInput}
      />
    </label>
  )
}

function SliderField({ label, value, min, max, step = 1, onChange }) {
  const precision = step < 0.01 ? 3 : step < 1 ? 2 : 0
  return (
    <label style={styles.blockField}>
      <span style={styles.sliderLabel}>
        <span>{label}</span>
        <span>{value.toFixed(precision)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        style={styles.slider}
      />
    </label>
  )
}

function ColorField({ label, value, onChange }) {
  return (
    <label style={styles.row}>
      <span style={styles.label}>{label}</span>
      <input
        type="color"
        value={toHex(value)}
        onChange={(event) => onChange(fromHex(event.target.value))}
        style={styles.colorInput}
      />
    </label>
  )
}

function SelectField({ label, value, options, onChange }) {
  return (
    <label style={styles.blockField}>
      <span style={styles.label}>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} style={styles.select}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  )
}

function Section({ title, children }) {
  const [open, setOpen] = useState(true)

  return (
    <section style={styles.section}>
      <button type="button" onClick={() => setOpen((current) => !current)} style={styles.sectionButton}>
        <span>{title}</span>
        <span>{open ? 'v' : '>'}</span>
      </button>
      {open && <div style={styles.sectionBody}>{children}</div>}
    </section>
  )
}

export function TreeDevScene() {
  const { config } = useTreeEditorStore()
  return <ProceduralTree config={config} />
}

export function TreeDevPanel() {
  const { config, panelOpen } = useTreeEditorStore()
  const [message, setMessage] = useState('')
  const exportJson = useMemo(() => JSON.stringify(config, null, 2), [config])

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 't') {
        setTreeEditorState({ panelOpen: !getTreeEditorState().panelOpen })
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const values = useMemo(() => getTreeEditorValues(config), [config])
  const updatePosition = (axis) => (value) => setTreeEditorConfig({ position: { [axis]: value } })
  const updateBranch = (key) => (value) => setTreeEditorConfig({ branch: { [key]: value } })
  const updateLeaves = (key) => (value) => setTreeEditorConfig({ leaves: { [key]: value } })
  const showMessage = (nextMessage) => {
    setMessage(nextMessage)
    window.setTimeout(() => setMessage(''), 1800)
  }

  const copyConfig = async () => {
    await navigator.clipboard.writeText(exportJson)
    showMessage('Config copiee')
  }

  const resetConfig = () => {
    setTreeEditorConfig(DEFAULT_TREE_CONFIG)
    showMessage('Arbre remis a zero')
  }

  if (!panelOpen) {
    return (
      <button type="button" onClick={() => setTreeEditorState({ panelOpen: true })} style={styles.fab}>
        Tree tool
      </button>
    )
  }

  return (
    <aside style={styles.panel}>
      <header style={styles.header}>
        <div>
          <strong style={styles.title}>Editeur d'arbre</strong>
          <span style={styles.subtitle}>Preview branchee sur le monde du jeu</span>
        </div>
        <button type="button" onClick={() => setTreeEditorState({ panelOpen: false })} style={styles.closeButton}>
          x
        </button>
      </header>

      <Section title="Modele">
        <label style={styles.blockField}>
          <span style={styles.label}>Preset</span>
          <select
            value={config.preset}
            onChange={(event) => setTreeEditorConfig({ preset: event.target.value })}
            style={styles.select}
          >
            {PRESETS.map((preset) => (
              <option key={preset} value={preset}>{preset}</option>
            ))}
          </select>
        </label>
        <div style={styles.inlineControls}>
          <NumberField label="Graine" value={config.seed} min={0} max={999999} onChange={(seed) => setTreeEditorConfig({ seed })} />
          <button
            type="button"
            onClick={() => setTreeEditorConfig({ seed: Math.floor(Math.random() * 999999) })}
            style={styles.smallButton}
          >
            Aleatoire
          </button>
        </div>
      </Section>

      <Section title="Placement">
        <SliderField label="X" value={config.position.x} min={-38} max={38} step={0.25} onChange={updatePosition('x')} />
        <SliderField label="Z" value={config.position.z} min={-38} max={38} step={0.25} onChange={updatePosition('z')} />
        <SliderField label="Hauteur offset" value={config.position.y} min={-2} max={8} step={0.05} onChange={updatePosition('y')} />
        <SliderField label="Rotation" value={config.rotationY} min={-3.14} max={3.14} step={0.01} onChange={(rotationY) => setTreeEditorConfig({ rotationY })} />
        <SliderField label="Echelle jeu" value={config.scale} min={0.03} max={0.35} step={0.01} onChange={(scale) => setTreeEditorConfig({ scale })} />
        <label style={styles.checkboxRow}>
          <input
            type="checkbox"
            checked={config.snapToGround}
            onChange={(event) => setTreeEditorConfig({ snapToGround: event.target.checked })}
          />
          <span>Coller au terrain du monde</span>
        </label>
      </Section>

      <Section title="Forme">
        <SliderField label="Niveaux branches" value={values.levels} min={1} max={4} step={1} onChange={updateBranch('levels')} />
        <SliderField label="Hauteur tronc" value={values.trunkLength} min={0.1} max={80} step={0.5} onChange={updateBranch('trunkLength')} />
        <SliderField label="Largeur tronc" value={values.trunkRadius} min={0.1} max={4} step={0.05} onChange={updateBranch('trunkRadius')} />
        <SliderField label="Branches tronc" value={values.trunkChildren} min={0} max={18} step={1} onChange={updateBranch('trunkChildren')} />
        <SliderField label="Branches secondaires" value={values.branchChildren} min={0} max={12} step={1} onChange={updateBranch('branchChildren')} />
        <SliderField label="Angle branches bas" value={values.firstBranchAngle} min={0} max={90} step={1} onChange={updateBranch('firstBranchAngle')} />
        <SliderField label="Angle branches haut" value={values.secondBranchAngle} min={0} max={90} step={1} onChange={updateBranch('secondBranchAngle')} />
        <SliderField label="Torsion tronc" value={values.trunkGnarliness} min={-0.2} max={0.6} step={0.01} onChange={updateBranch('trunkGnarliness')} />
        <SliderField label="Force verticale" value={values.forceStrength} min={-0.12} max={0.08} step={0.005} onChange={updateBranch('forceStrength')} />
      </Section>

      <Section title="Matiere">
        <ColorField label="Ecorce" value={config.bark.tint} onChange={(tint) => setTreeEditorConfig({ bark: { tint } })} />
        <ColorField label="Feuilles" value={config.leaves.tint} onChange={(tint) => setTreeEditorConfig({ leaves: { tint } })} />
        <SelectField
          label="Couleur feuilles"
          value={values.leafColorMode}
          options={[
            { value: 'gameGrass', label: 'Palette herbe du jeu' },
            { value: 'ezTree', label: 'Texture EZ Tree' },
          ]}
          onChange={updateLeaves('colorMode')}
        />
        <SliderField label="Variation couleur" value={values.leafColorVariation} min={0} max={0.5} step={0.01} onChange={updateLeaves('colorVariation')} />
        <SliderField label="Teinte feuilles" value={values.leafHueShift} min={-0.18} max={0.18} step={0.01} onChange={updateLeaves('hueShift')} />
        <SliderField label="Saturation feuilles" value={values.leafSaturation} min={0.35} max={1.8} step={0.01} onChange={updateLeaves('saturation')} />
        <SliderField label="Luminosite feuilles" value={values.leafBrightness} min={0.45} max={1.6} step={0.01} onChange={updateLeaves('brightness')} />
        <SliderField label="Taille feuilles" value={values.leafSize} min={0.5} max={10} step={0.1} onChange={updateLeaves('size')} />
        <SliderField label="Nombre feuilles" value={values.leafCount} min={0} max={80} step={1} onChange={updateLeaves('count')} />
        <SliderField label="Depart feuilles" value={values.leafStart} min={0} max={1} step={0.01} onChange={updateLeaves('start')} />
        <SliderField label="Variation feuilles" value={values.leafSizeVariance} min={0} max={2} step={0.01} onChange={updateLeaves('sizeVariance')} />
        <SliderField label="Decoupe alpha" value={values.leafAlphaTest} min={0} max={1} step={0.01} onChange={updateLeaves('alphaTest')} />
        <SelectField
          label="Normals feuilles"
          value={values.leafNormalMode}
          options={[
            { value: 'canopy', label: 'Canopy doux' },
            { value: 'upward', label: 'Vers le haut' },
            { value: 'generated', label: 'Original EZ Tree' },
          ]}
          onChange={updateLeaves('normalMode')}
        />
        <SliderField label="Force normals" value={values.leafNormalStrength} min={0} max={1} step={0.01} onChange={updateLeaves('normalStrength')} />
      </Section>

      <Section title="Export jeu">
        <textarea readOnly value={exportJson} style={styles.textarea} />
        <div style={styles.actions}>
          <button type="button" onClick={copyConfig} style={styles.primaryButton}>Copier JSON</button>
          <button type="button" onClick={resetConfig} style={styles.secondaryButton}>Reset</button>
        </div>
        {message && <p style={styles.message}>{message}</p>}
      </Section>

      <p style={styles.footer}>Ctrl+Shift+T masque le panneau. La config est gardee en local.</p>
    </aside>
  )
}

const controlBase = {
  border: '1px solid rgba(223, 229, 233, 0.18)',
  background: 'rgba(26, 32, 36, 0.92)',
  color: '#eef4f2',
}

const styles = {
  panel: {
    position: 'fixed',
    top: 14,
    right: 14,
    zIndex: 20,
    width: 'min(340px, calc(100vw - 28px))',
    maxHeight: 'calc(100vh - 28px)',
    overflowY: 'auto',
    padding: 14,
    color: '#eef4f2',
    background: 'rgba(13, 18, 20, 0.92)',
    border: '1px solid rgba(223, 229, 233, 0.14)',
    borderRadius: 8,
    boxShadow: '0 18px 42px rgba(0, 0, 0, 0.26)',
    backdropFilter: 'blur(12px)',
    fontSize: 13,
  },
  fab: {
    position: 'fixed',
    top: 14,
    right: 14,
    zIndex: 20,
    ...controlBase,
    borderRadius: 8,
    padding: '9px 12px',
    cursor: 'pointer',
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  title: {
    display: 'block',
    fontSize: 16,
    lineHeight: 1.15,
  },
  subtitle: {
    display: 'block',
    marginTop: 3,
    color: '#9fb3ac',
    fontSize: 12,
  },
  closeButton: {
    ...controlBase,
    width: 28,
    height: 28,
    borderRadius: 6,
    cursor: 'pointer',
  },
  section: {
    borderTop: '1px solid rgba(223, 229, 233, 0.12)',
    paddingTop: 10,
    marginTop: 10,
  },
  sectionButton: {
    width: '100%',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    border: 0,
    padding: '0 0 8px',
    background: 'transparent',
    color: '#a7d2c0',
    cursor: 'pointer',
    fontWeight: 700,
    textTransform: 'uppercase',
    fontSize: 11,
  },
  sectionBody: {
    display: 'grid',
    gap: 8,
  },
  blockField: {
    display: 'grid',
    gap: 5,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  label: {
    color: '#b9c8c3',
  },
  select: {
    ...controlBase,
    width: '100%',
    borderRadius: 6,
    padding: '7px 8px',
  },
  inlineControls: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  numberInput: {
    ...controlBase,
    width: 86,
    borderRadius: 6,
    padding: '6px 7px',
  },
  smallButton: {
    ...controlBase,
    borderRadius: 6,
    padding: '7px 9px',
    cursor: 'pointer',
  },
  sliderLabel: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 10,
    color: '#b9c8c3',
  },
  slider: {
    width: '100%',
    accentColor: '#88c7a8',
  },
  colorInput: {
    width: 48,
    height: 28,
    padding: 0,
    border: 0,
    borderRadius: 6,
    cursor: 'pointer',
    background: 'transparent',
  },
  checkboxRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    color: '#b9c8c3',
  },
  textarea: {
    ...controlBase,
    width: '100%',
    minHeight: 138,
    borderRadius: 6,
    padding: 8,
    resize: 'vertical',
    fontFamily: 'Consolas, monospace',
    fontSize: 11,
  },
  actions: {
    display: 'flex',
    gap: 8,
  },
  primaryButton: {
    flex: 1,
    border: 0,
    borderRadius: 6,
    padding: '9px 10px',
    color: '#0e1814',
    background: '#9fe0bc',
    cursor: 'pointer',
    fontWeight: 700,
  },
  secondaryButton: {
    ...controlBase,
    borderRadius: 6,
    padding: '9px 10px',
    cursor: 'pointer',
  },
  message: {
    margin: 0,
    color: '#9fe0bc',
    fontSize: 12,
  },
  footer: {
    margin: '12px 0 0',
    color: '#7f918c',
    fontSize: 11,
  },
}
