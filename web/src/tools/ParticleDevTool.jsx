import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import ParticleEffect from '../effects/ParticleEffect'
import {
  BUILTIN_PARTICLE_PRESETS,
  EMITTER_BLENDINGS,
  EMITTER_MODES,
  EMITTER_SHAPES,
  EMITTER_TEXTURES,
  MAX_EMITTERS,
  MAX_SHELLS,
  PARTICLE_CATEGORIES,
} from '../effects/particlePresets'
import { getTerrainHeight } from '../world/terrain/terrainGeometry'
import { OUTDOOR_LIGHT_LAYER } from '../world/lightingLayers'
import { ColorField, Section, SelectField, SliderField } from './editorControls'
import { styles } from './editorStyles'
import {
  addParticleEmitter,
  addParticleShell,
  deleteParticleFromLibrary,
  duplicateParticlePreset,
  getParticleEditorState,
  loadParticleFromLibrary,
  playParticleEffect,
  randomizeParticlePreset,
  removeParticleEmitter,
  removeParticleShell,
  replaceParticlePreset,
  saveParticleToLibrary,
  setParticleApiKey,
  setParticleEditorState,
  setParticleEmitter,
  setParticlePreset,
  setParticleShell,
  stopParticleEffect,
  useParticleEditorStore,
} from './particleEditorStore'
import { buildClipboardPrompt, generateParticlePreset } from './particleAi'

const TARGETS = [
  { value: 'player', label: 'Joueur' },
  { value: 'chest', label: 'Coffre' },
  { value: 'mob', label: 'Mob' },
  { value: 'none', label: 'Aucun' },
]

function TargetDummy({ target }) {
  if (target === 'player') {
    return (
      <group>
        <mesh castShadow position={[0, 0.85, 0]}>
          <capsuleGeometry args={[0.32, 0.85, 6, 14]} />
          <meshStandardMaterial color="#d9b38c" roughness={0.8} />
        </mesh>
        <mesh castShadow position={[0, 1.62, 0]}>
          <sphereGeometry args={[0.24, 14, 12]} />
          <meshStandardMaterial color="#e8c9a0" roughness={0.8} />
        </mesh>
      </group>
    )
  }
  if (target === 'chest') {
    return (
      <group>
        <mesh castShadow position={[0, 0.28, 0]}>
          <boxGeometry args={[0.95, 0.55, 0.6]} />
          <meshStandardMaterial color="#8a5a2b" roughness={0.85} />
        </mesh>
        <mesh castShadow position={[0, 0.62, -0.08]} rotation={[-0.6, 0, 0]}>
          <boxGeometry args={[0.95, 0.12, 0.62]} />
          <meshStandardMaterial color="#6e4520" roughness={0.85} />
        </mesh>
        <mesh position={[0, 0.32, 0.31]}>
          <boxGeometry args={[0.14, 0.18, 0.04]} />
          <meshStandardMaterial color="#e7c252" metalness={0.4} roughness={0.4} />
        </mesh>
      </group>
    )
  }
  if (target === 'mob') {
    return (
      <group>
        <mesh castShadow position={[0, 0.5, 0]}>
          <sphereGeometry args={[0.5, 16, 14]} />
          <meshStandardMaterial color="#6b4d8f" roughness={0.7} />
        </mesh>
        <mesh position={[-0.18, 0.62, 0.42]}>
          <sphereGeometry args={[0.08, 8, 8]} />
          <meshStandardMaterial color="#1c1424" />
        </mesh>
        <mesh position={[0.18, 0.62, 0.42]}>
          <sphereGeometry args={[0.08, 8, 8]} />
          <meshStandardMaterial color="#1c1424" />
        </mesh>
      </group>
    )
  }
  return null
}

export function ParticleDevScene() {
  const { preset, playing, loopPreview, playbackId, target } = useParticleEditorStore()
  const groundY = useMemo(() => getTerrainHeight(0, 0), [])
  const groupRef = useRef()

  // Particle Points are rebuilt whenever the preset changes; re-tag everything
  // so it stays on the outdoor light layer used by the editor camera.
  useLayoutEffect(() => {
    groupRef.current?.traverse((object) => {
      object.layers.set(OUTDOOR_LIGHT_LAYER)
    })
  })

  return (
    <group ref={groupRef} position={[0, groundY, 0]}>
      <TargetDummy target={target} />
      <ParticleEffect
        preset={preset}
        playing={playing}
        loop={loopPreview}
        playbackId={playbackId}
        onComplete={stopParticleEffect}
      />
    </group>
  )
}

function TextField({ label, value, onChange }) {
  return (
    <label style={styles.blockField}>
      <span style={styles.label}>{label}</span>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={{ ...styles.select, fontFamily: 'inherit' }}
      />
    </label>
  )
}

function EmitterSection({ emitter, index, total }) {
  const update = (key) => (value) => setParticleEmitter(index, { [key]: value })
  const updateOffsetY = (value) => setParticleEmitter(index, {
    offset: [emitter.offset[0], value, emitter.offset[2]],
  })

  return (
    <Section title={`Émetteur ${index + 1}`}>
      <SelectField label="Forme" value={emitter.shape} options={EMITTER_SHAPES} onChange={update('shape')} />
      <SelectField label="Mode" value={emitter.mode} options={EMITTER_MODES} onChange={update('mode')} />
      <SelectField label="Texture" value={emitter.texture} options={EMITTER_TEXTURES} onChange={update('texture')} />
      <SelectField label="Blending" value={emitter.blending} options={EMITTER_BLENDINGS} onChange={update('blending')} />
      <SliderField label="Particules" value={emitter.count} min={1} max={500} step={1} onChange={update('count')} />
      <SliderField label="Durée de vie" value={emitter.lifetime} min={0.05} max={4} step={0.05} onChange={update('lifetime')} />
      <SliderField label="Vitesse" value={emitter.speed} min={0} max={10} step={0.1} onChange={update('speed')} />
      <SliderField label="Ralentissement global" value={emitter.motionScale} min={0} max={1} step={0.01} onChange={update('motionScale')} />
      <SliderField label="Dispersion" value={emitter.spread} min={0} max={1} step={0.01} onChange={update('spread')} />
      <SliderField label="Gravité" value={emitter.gravity} min={-12} max={6} step={0.1} onChange={update('gravity')} />
      <SliderField label="Turbulence" value={emitter.turbulence} min={0} max={2} step={0.05} onChange={update('turbulence')} />
      <SliderField label="Taille début" value={emitter.sizeStart} min={0} max={1.5} step={0.01} onChange={update('sizeStart')} />
      <SliderField label="Taille fin" value={emitter.sizeEnd} min={0} max={1.5} step={0.01} onChange={update('sizeEnd')} />
      <SliderField label="Rotation sprite" value={emitter.rotationSpeed} min={-8} max={8} step={0.1} onChange={update('rotationSpeed')} />
      <SliderField label="Rayon de spawn" value={emitter.radius} min={0} max={2} step={0.02} onChange={update('radius')} />
      <SliderField label="Hauteur (offset Y)" value={emitter.offset[1]} min={-1} max={3} step={0.05} onChange={updateOffsetY} />
      <SliderField label="Délai" value={emitter.delay} min={0} max={2} step={0.05} onChange={update('delay')} />
      <ColorField label="Couleur début" value={emitter.colorStart} onChange={update('colorStart')} />
      <ColorField label="Couleur fin" value={emitter.colorEnd} onChange={update('colorEnd')} />
      <SliderField label="Alpha début" value={emitter.alphaStart} min={0} max={1} step={0.01} onChange={update('alphaStart')} />
      <SliderField label="Alpha fin" value={emitter.alphaEnd} min={0} max={1} step={0.01} onChange={update('alphaEnd')} />
      {total > 1 && (
        <button type="button" onClick={() => removeParticleEmitter(index)} style={styles.dangerButton}>
          Supprimer cet émetteur
        </button>
      )}
    </Section>
  )
}

function ShellSection({ shell, index }) {
  const update = (key) => (value) => setParticleShell(index, { [key]: value })
  const updateOffsetY = (value) => setParticleShell(index, {
    offset: [shell.offset[0], value, shell.offset[2]],
  })

  return (
    <Section title={`Coquille shader ${index + 1}`}>
      <SliderField label="Rayon" value={shell.radius} min={0.05} max={1.5} step={0.01} onChange={update('radius')} />
      <SliderField label="Distorsion" value={shell.distortion} min={0} max={1.2} step={0.01} onChange={update('distortion')} />
      <SliderField label="Échelle du bruit" value={shell.noiseScale} min={0.2} max={4} step={0.05} onChange={update('noiseScale')} />
      <SliderField label="Vitesse animation" value={shell.speed} min={0} max={4} step={0.05} onChange={update('speed')} />
      <SliderField label="Opacité" value={shell.opacity} min={0} max={1} step={0.01} onChange={update('opacity')} />
      <SliderField label="Pulsation" value={shell.wobble} min={0} max={2.5} step={0.05} onChange={update('wobble')} />
      <SliderField label="Rotation" value={shell.spin} min={-4} max={4} step={0.1} onChange={update('spin')} />
      <SliderField label="Échelle de fin" value={shell.scaleEnd} min={0} max={4} step={0.05} onChange={update('scaleEnd')} />
      <SliderField label="Hauteur (offset Y)" value={shell.offset[1]} min={-1} max={3} step={0.05} onChange={updateOffsetY} />
      <ColorField label="Couleur chaude" value={shell.colorHot} onChange={update('colorHot')} />
      <ColorField label="Couleur moyenne" value={shell.colorMid} onChange={update('colorMid')} />
      <ColorField label="Couleur sombre" value={shell.colorDark} onChange={update('colorDark')} />
      <label style={styles.checkboxRow}>
        <input
          type="checkbox"
          checked={shell.fadeOut}
          onChange={(event) => setParticleShell(index, { fadeOut: event.target.checked })}
        />
        <span>Fondu sur la durée de l'effet</span>
      </label>
      <button type="button" onClick={() => removeParticleShell(index)} style={styles.dangerButton}>
        Supprimer cette coquille
      </button>
    </Section>
  )
}

export function ParticleDevPanel() {
  const { preset, library, playing, loopPreview, target, apiKey, aiBusy, aiError } = useParticleEditorStore()
  const [message, setMessage] = useState('')
  const [promptText, setPromptText] = useState('')
  const [importText, setImportText] = useState('')
  const exportJson = useMemo(() => JSON.stringify(preset, null, 2), [preset])

  const showMessage = (nextMessage) => {
    setMessage(nextMessage)
    window.setTimeout(() => setMessage(''), 2200)
  }

  const copyJson = async () => {
    await navigator.clipboard.writeText(exportJson)
    showMessage('Preset copié')
  }

  const importJson = () => {
    try {
      replaceParticlePreset(JSON.parse(importText))
      setImportText('')
      showMessage('Preset importé')
    } catch {
      showMessage('JSON invalide')
    }
  }

  const saveToLibrary = () => {
    const { entry, updated } = saveParticleToLibrary()
    showMessage(`${entry.name} ${updated ? 'mis à jour' : 'sauvegardé'}`)
  }

  const copyAiPrompt = async () => {
    const text = buildClipboardPrompt(promptText || 'Crée un nouvel effet', preset)
    await navigator.clipboard.writeText(text)
    showMessage('Prompt copié — colle-le dans Claude puis importe le JSON')
  }

  const generate = async () => {
    if (!promptText.trim() || aiBusy) return
    const { apiKey: key, preset: current } = getParticleEditorState()
    if (!key) {
      setParticleEditorState({ aiError: 'Pas de clé API : ajoute-la dans la section IA, ou utilise "Copier le prompt".' })
      return
    }
    setParticleEditorState({ aiBusy: true, aiError: '' })
    try {
      const next = await generateParticlePreset({ apiKey: key, userText: promptText, currentPreset: current })
      replaceParticlePreset(next)
      showMessage(`Effet "${next.name}" généré`)
    } catch (error) {
      setParticleEditorState({ aiError: error?.message ?? 'Erreur IA' })
    } finally {
      setParticleEditorState({ aiBusy: false })
    }
  }

  return (
    <>
      {/* Bibliothèque (gauche) */}
      <aside style={libraryPanelStyle}>
        <strong style={styles.title}>Effets</strong>
        <div style={{ ...styles.section, borderTop: 'none', marginTop: 4, paddingTop: 0 }}>
          <span style={styles.label}>Présets du jeu</span>
          <div style={{ ...styles.libraryList, marginTop: 6 }}>
            {BUILTIN_PARTICLE_PRESETS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => {
                  loadParticleFromLibrary(entry.id)
                  showMessage(`${entry.name} chargé`)
                }}
                style={libraryEntryStyle}
              >
                <span>{entry.name}</span>
                <span style={categoryTagStyle}>{entry.category}</span>
              </button>
            ))}
          </div>
        </div>
        <div style={styles.section}>
          <span style={styles.label}>Mes effets</span>
          <div style={{ ...styles.libraryList, marginTop: 6 }}>
            {library.length === 0 && <span style={styles.libraryEmpty}>Aucun effet sauvegardé</span>}
            {library.map((entry) => (
              <div key={entry.id} style={styles.libraryItem}>
                <span>{entry.name}</span>
                <div style={styles.libraryActions}>
                  <button type="button" onClick={() => loadParticleFromLibrary(entry.id)} style={styles.smallButton}>Charger</button>
                  <button type="button" onClick={() => deleteParticleFromLibrary(entry.id)} style={styles.smallButton}>Suppr.</button>
                </div>
              </div>
            ))}
          </div>
        </div>
        <button type="button" onClick={saveToLibrary} style={{ ...styles.primaryButton, marginTop: 10 }}>
          Sauvegarder l'effet actuel
        </button>
      </aside>

      {/* Paramètres (droite) */}
      <aside style={styles.panel}>
        <header style={styles.header}>
          <div>
            <strong style={styles.title}>Éditeur de particules</strong>
            <span style={styles.subtitle}>Presets JSON, rendu GPU, IA + curseurs</span>
          </div>
        </header>

        <Section title="Général">
          <TextField label="Nom" value={preset.name} onChange={(name) => setParticlePreset({ name })} />
          <TextField label="ID" value={preset.id} onChange={(id) => setParticlePreset({ id })} />
          <SelectField label="Catégorie" value={preset.category} options={PARTICLE_CATEGORIES} onChange={(category) => setParticlePreset({ category })} />
          <SliderField label="Durée (s)" value={preset.duration} min={0.1} max={5} step={0.05} onChange={(duration) => setParticlePreset({ duration })} />
          <label style={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={preset.loop}
              onChange={(event) => setParticlePreset({ loop: event.target.checked })}
            />
            <span>Effet en boucle (aura, feu...)</span>
          </label>
        </Section>

        {preset.emitters.map((emitter, index) => (
          <EmitterSection key={index} emitter={emitter} index={index} total={preset.emitters.length} />
        ))}
        {preset.emitters.length < MAX_EMITTERS && (
          <button type="button" onClick={addParticleEmitter} style={{ ...styles.primaryButton, marginTop: 10 }}>
            Ajouter un émetteur
          </button>
        )}

        {preset.shells.map((shell, index) => (
          <ShellSection key={index} shell={shell} index={index} />
        ))}
        {preset.shells.length < MAX_SHELLS && (
          <button type="button" onClick={addParticleShell} style={{ ...styles.secondaryButton, width: '100%', marginTop: 10 }}>
            Ajouter une coquille shader (boule d'énergie)
          </button>
        )}

        <Section title="Lumière">
          <label style={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={preset.light.enabled}
              onChange={(event) => setParticlePreset({ light: { ...preset.light, enabled: event.target.checked } })}
            />
            <span>Lumière dynamique</span>
          </label>
          <ColorField label="Couleur" value={preset.light.color} onChange={(color) => setParticlePreset({ light: { ...preset.light, color } })} />
          <SliderField label="Intensité" value={preset.light.intensity} min={0} max={10} step={0.1} onChange={(intensity) => setParticlePreset({ light: { ...preset.light, intensity } })} />
        </Section>

        <Section title="IA">
          <label style={styles.blockField}>
            <span style={styles.label}>Clé API Anthropic (stockée en local)</span>
            <input
              type="password"
              value={apiKey}
              placeholder="sk-ant-..."
              onChange={(event) => setParticleApiKey(event.target.value)}
              style={{ ...styles.select, fontFamily: 'Consolas, monospace' }}
            />
          </label>
          <p style={styles.footer}>
            Sans clé : "Copier le prompt" dans la barre du bas, colle-le dans Claude, puis importe le JSON ci-dessous.
          </p>
        </Section>

        <Section title="Export jeu">
          <textarea readOnly value={exportJson} style={styles.textarea} />
          <div style={styles.actions}>
            <button type="button" onClick={copyJson} style={styles.primaryButton}>Copier JSON</button>
            <button type="button" onClick={duplicateParticlePreset} style={styles.secondaryButton}>Dupliquer</button>
          </div>
        </Section>

        <Section title="Importer JSON">
          <textarea
            value={importText}
            onChange={(event) => setImportText(event.target.value)}
            placeholder="Colle un preset JSON ici..."
            style={styles.textarea}
          />
          <button type="button" onClick={importJson} style={styles.primaryButton}>Importer</button>
        </Section>

        {message && <p style={styles.message}>{message}</p>}
      </aside>

      {/* Barre de lecture + IA (bas) */}
      <div style={bottomBarStyle}>
        <button type="button" onClick={playParticleEffect} style={playing ? activePlayButtonStyle : playButtonStyle}>
          ▶ Play
        </button>
        <button
          type="button"
          onClick={() => setParticleEditorState({ loopPreview: !loopPreview })}
          style={loopPreview ? activePlayButtonStyle : playButtonStyle}
        >
          ⟳ Loop
        </button>
        <button type="button" onClick={stopParticleEffect} style={playButtonStyle}>■ Stop</button>
        <button type="button" onClick={randomizeParticlePreset} style={playButtonStyle}>🎲 Random</button>
        <select
          value={target}
          onChange={(event) => setParticleEditorState({ target: event.target.value })}
          style={{ ...styles.select, width: 110 }}
        >
          {TARGETS.map((entry) => (
            <option key={entry.value} value={entry.value}>{entry.value === 'none' ? 'Sans cible' : `Sur ${entry.label.toLowerCase()}`}</option>
          ))}
        </select>
        <input
          type="text"
          value={promptText}
          onChange={(event) => setPromptText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') generate()
          }}
          placeholder='Décris un effet... ex : "coffre magique violet avec des étoiles, court et satisfaisant"'
          style={promptInputStyle}
        />
        <button
          type="button"
          onClick={generate}
          disabled={aiBusy}
          style={{ ...styles.primaryButton, flex: 'none', opacity: aiBusy ? 0.6 : 1 }}
        >
          {aiBusy ? 'Génération...' : '✨ Générer'}
        </button>
        <button type="button" onClick={copyAiPrompt} style={playButtonStyle}>Copier le prompt</button>
        {aiError && <span style={errorStyle}>{aiError}</span>}
      </div>
    </>
  )
}

const libraryPanelStyle = {
  position: 'fixed',
  top: 70,
  left: 14,
  zIndex: 20,
  width: 230,
  maxHeight: 'calc(100vh - 160px)',
  overflowY: 'auto',
  padding: 14,
  color: '#eef4f2',
  background: 'rgba(13, 18, 20, 0.92)',
  border: '1px solid rgba(223, 229, 233, 0.14)',
  borderRadius: 8,
  boxShadow: '0 18px 42px rgba(0, 0, 0, 0.26)',
  backdropFilter: 'blur(12px)',
  fontSize: 13,
}

const libraryEntryStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 8,
  width: '100%',
  textAlign: 'left',
  border: '1px solid rgba(223, 229, 233, 0.14)',
  background: 'rgba(26, 32, 36, 0.92)',
  color: '#eef4f2',
  borderRadius: 6,
  padding: '8px 10px',
  cursor: 'pointer',
}

const categoryTagStyle = {
  fontSize: 10,
  textTransform: 'uppercase',
  color: '#88c7a8',
}

const bottomBarStyle = {
  position: 'fixed',
  left: 14,
  right: 'min(390px, calc(28px + 360px))',
  bottom: 14,
  zIndex: 20,
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 8,
  padding: 10,
  borderRadius: 8,
  background: 'rgba(13, 18, 20, 0.92)',
  border: '1px solid rgba(223, 229, 233, 0.14)',
  backdropFilter: 'blur(12px)',
  color: '#eef4f2',
  fontSize: 13,
}

const playButtonStyle = {
  border: '1px solid rgba(223, 229, 233, 0.18)',
  background: 'rgba(26, 32, 36, 0.92)',
  color: '#eef4f2',
  borderRadius: 6,
  padding: '8px 12px',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

const activePlayButtonStyle = {
  ...playButtonStyle,
  color: '#0e1814',
  background: '#9fe0bc',
  borderColor: '#9fe0bc',
  fontWeight: 700,
}

const promptInputStyle = {
  flex: 1,
  minWidth: 200,
  border: '1px solid rgba(223, 229, 233, 0.18)',
  background: 'rgba(26, 32, 36, 0.92)',
  color: '#eef4f2',
  borderRadius: 6,
  padding: '9px 10px',
  fontSize: 13,
}

const errorStyle = {
  width: '100%',
  margin: 0,
  color: '#ffb7b0',
  fontSize: 12,
}
