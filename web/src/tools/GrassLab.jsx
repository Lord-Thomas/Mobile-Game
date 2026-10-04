import { Suspense, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { Physics, RigidBody, CuboidCollider } from '@react-three/rapier'
import { ACESFilmicToneMapping, PCFShadowMap, SRGBColorSpace } from 'three'
import { Player, ControlsOverlay, SettingsPanel, FpsOverlay, RenderStatsProbe, LayeredSceneRenderer,
  AdaptiveCameraFov, RenderQualityGovernor, useViewportRenderSettings,
  loadPerformanceSettings, PERFORMANCE_SETTINGS_STORAGE_KEY, PLAYER_HEIGHT, ZONES } from '../App'
import { DEFAULT_CONTROL_SETTINGS, loadControlSettings, normalizeControlSettings, saveControlSettings } from '../game/controlSettings'
import GameFrameSchedulerDriver from '../game/runtime/GameFrameSchedulerDriver'
import ArtDirectionRuntime from '../artDirection/ArtDirectionRuntime'
import { OutdoorLighting } from '../world/OutdoorNeighborhood'
import TerrainGroundCover from '../world/TerrainGroundCover'
import { OUTDOOR_LIGHT_LAYER } from '../world/lightingLayers'
import './GrassLab.css'

const DEFAULT_FIELD = { size: 50, density: 5 }
const EMPTY_BIOMES = []
const SPAWN = { token: 'grass-lab', zone: ZONES.outside, position: [0, PLAYER_HEIGHT, 3], cameraYaw: 0, cameraPitch: -0.22 }
function LabCamera() {
  const { camera } = useThree()
  useEffect(() => { camera.layers.enable(OUTDOOR_LIGHT_LAYER) }, [camera])
  return <AdaptiveCameraFov />
}
function Ready({ onReady }) {
  useEffect(() => { onReady() }, [onReady])
  return null
}
export default function GrassLab() {
  const [settings, setSettings] = useState(loadPerformanceSettings)
  const [controls, setControls] = useState(loadControlSettings)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [spatialCulling, setSpatialCulling] = useState(true)
  const [volumeTufts, setVolumeTufts] = useState(true)
  const [draftField, setDraftField] = useState(DEFAULT_FIELD)
  const [fieldSettings, setFieldSettings] = useState(DEFAULT_FIELD)
  const [fieldStats, setFieldStats] = useState(null)
  const [fieldPending, startFieldTransition] = useTransition()
  const size = fieldSettings.size
  const area = useMemo(() => ({ minX: -size / 2 + 0.5, maxX: size / 2 - 0.5,
    minZ: -size / 2 + 0.5, maxZ: size / 2 - 0.5 }), [size])
  const applyField = () => startFieldTransition(() => setFieldSettings(draftField))
  const resetField = () => {
    setDraftField(DEFAULT_FIELD)
    startFieldTransition(() => setFieldSettings(DEFAULT_FIELD))
  }
  const [crouching, setCrouching] = useState(false)
  const [ready, setReady] = useState(false)
  const [scale, setScale] = useState(1)
  const [, setRendererInfo] = useState(null)
  const onReady = useMemo(() => () => setReady(true), [])
  const playerPositionRef = useRef({ x: 0, y: PLAYER_HEIGHT, z: 3 })
  const playerVelocityRef = useRef({ x: 0, y: 0, z: 0 })
  const playerCrouchingRef = useRef(false)
  const ballRef = useRef(null)
  const touchRef = useRef({ moveX: 0, moveY: 0, cameraYaw: 0, cameraPitch: -0.22, cameraDistance: 4.6,
    lookX: 0, lookY: 0, lookDeltaX: 0, lookDeltaY: 0, lookActive: false,
    actionQueued: false, punchQueued: false, kickQueued: false, punchChargeMs: 0, dodgeQueued: false,
    wingsQueued: false, wingsBoostQueued: false, emoteQueued: null, mountAscend: false, mountDescend: false })
  const renderScale = Math.min(settings.lowResolution ? 0.62 : 1, settings.autoQuality ? scale : 1)
  const render = useViewportRenderSettings(renderScale)
  const resetInput = () => {
    Object.assign(touchRef.current, { moveX: 0, moveY: 0, lookDeltaX: 0, lookDeltaY: 0,
      lookActive: false, actionQueued: false, punchQueued: false, kickQueued: false, dodgeQueued: false })
  }
  useEffect(() => { try { localStorage.setItem(PERFORMANCE_SETTINGS_STORAGE_KEY, JSON.stringify(settings)) } catch { /* private browsing */ } }, [settings])
  useEffect(() => { saveControlSettings(controls) }, [controls])
  useEffect(() => {
    window.addEventListener('blur', resetInput)
    document.addEventListener('visibilitychange', resetInput)
    return () => {
      window.removeEventListener('blur', resetInput)
      document.removeEventListener('visibilitychange', resetInput)
    }
  }, [])
  return <main className="app grass-lab">
    <div className="canvas-wrap">
      <Canvas dpr={render.dpr} camera={{ fov: 52, position: [0, 2.4, 6], near: 0.1, far: 420 }}
        shadows={!settings.disableShadows ? { enabled: true, type: PCFShadowMap } : false}
        gl={{ antialias: render.antialias, powerPreference: 'high-performance', stencil: true }}
        onCreated={({ gl }) => { gl.outputColorSpace = SRGBColorSpace; gl.toneMapping = ACESFilmicToneMapping; gl.toneMappingExposure = 1.1 }}>
        <color attach="background" args={['#b5d4e3']} />
        <ArtDirectionRuntime />
        <GameFrameSchedulerDriver />
        <LabCamera />
        <LayeredSceneRenderer currentZone={ZONES.outside} />
        <RenderStatsProbe active={settings.showFps} onRendererInfo={setRendererInfo} resetKey={`grass-lab:${size}:${fieldSettings.density}:${volumeTufts}:${spatialCulling}`} />
        {settings.autoQuality && <RenderQualityGovernor onScaleChange={setScale} />}
        <Suspense fallback={null}>
          <OutdoorLighting active showSky={false} castShadows={!settings.disableShadows}
            playerPositionRef={playerPositionRef} biomeAreas={EMPTY_BIOMES} />
          <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow onUpdate={mesh => mesh.layers.enable(OUTDOOR_LIGHT_LAYER)}>
            <planeGeometry args={[size, size]} />
            <meshStandardMaterial color="#438f32" roughness={1} />
          </mesh>
          {settings.grass && <TerrainGroundCover spatialCulling={spatialCulling} volumeTufts={volumeTufts} flatTestSize={size} flatTestDensity={fieldSettings.density} onFieldReady={setFieldStats} biomeAreas={EMPTY_BIOMES}
            playerPositionRef={playerPositionRef} ballRef={ballRef} />}
          <Physics gravity={[0, -9.81, 0]}>
            <RigidBody key={size} type="fixed" colliders={false}><CuboidCollider args={[size / 2, 0.1, size / 2]} position={[0, -0.1, 0]} /></RigidBody>
            <Player testArea={area} touchRef={touchRef} ballRef={ballRef} playerPositionRef={playerPositionRef}
              playerVelocityRef={playerVelocityRef} playerCrouchingRef={playerCrouchingRef}
              crouching={crouching} mode="play" currentZone={ZONES.outside} spawnRequest={SPAWN}
              movementLocked={settingsOpen} loadOptionalAnimations />
          </Physics>
          <Ready onReady={onReady} />
        </Suspense>
      </Canvas>
    </div>
    {!ready && <div className="grass-lab-loading" role="status">Chargement du joueur et de l’herbe…</div>}
    {ready && !settingsOpen && <ControlsOverlay touchRef={touchRef} crouching={crouching}
      onToggleCrouch={() => setCrouching(value => !value)} controlSettings={controls} showDodgeAction />}
    {ready && settings.showFps && <FpsOverlay />}
    <nav className="grass-lab-toolbar" aria-label="Scène de test">
      <span>Herbe · {spatialCulling ? 'Optimisée' : 'Référence'} · {size} × {size} m · ×{fieldSettings.density}</span>
      <button onClick={() => { resetInput(); setSettingsOpen(value => !value) }}>Paramètres</button>
      <a href="/">Retour au jeu</a>
    </nav>
    {settingsOpen && <div className="grass-lab-settings" role="dialog" aria-modal="true" aria-label="Paramètres">
      <button className="grass-lab-close" onClick={() => setSettingsOpen(false)}>Fermer</button>
      <div className="settings-group-title">Terrain de test</div>
      <label className="settings-range-row">
        <span><strong>Densité de l’herbe</strong><output>×{draftField.density.toFixed(2)}</output></span>
        <input type="range" aria-label="Densité de l’herbe" min="0.5" max="6" step="0.25" value={draftField.density}
          onChange={event => setDraftField(current => ({ ...current, density: Number(event.target.value) }))}
          onPointerUp={applyField} onKeyUp={applyField} onBlur={applyField} />
      </label>
      <label className="settings-range-row">
        <span><strong>Taille du terrain</strong><output>{draftField.size} × {draftField.size} m</output></span>
        <input type="range" aria-label="Taille du terrain" min="10" max="200" step="10" value={draftField.size}
          onChange={event => setDraftField(current => ({ ...current, size: Number(event.target.value) }))}
          onPointerUp={applyField} onKeyUp={applyField} onBlur={applyField} />
      </label>
      <p className="grass-lab-field-info" role="status">{fieldPending ? 'Préparation du terrain…' : !settings.grass ? 'Herbe désactivée' :
        `${(fieldStats?.count ?? 0).toLocaleString('fr-FR')} touffes · ${(size * size).toLocaleString('fr-FR')} m²`}</p>
      <button type="button" className="settings-action-row" onClick={resetField}>Revenir à 50 m / ×5</button>
      <p className="grass-lab-field-info">Relâche le curseur pour appliquer. Pour comparer les FPS à résolution constante, désactive « Qualité auto ».</p>
      <label className="settings-toggle-row">
        <input type="checkbox" checked={spatialCulling} onChange={event => setSpatialCulling(event.target.checked)} />
        <span><strong>Optimisation par blocs</strong><small>Blocs de 8 m hors champ ignorés. Désactive pour comparer avec les quatre grands blocs d’origine, à densité identique.</small></span>
      </label>
      <label className="settings-toggle-row">
        <input type="checkbox" checked={volumeTufts} onChange={event => setVolumeTufts(event.target.checked)} />
        <span><strong>Touffes en volume</strong><small>Désactiver pour comparer avec la forme d’origine, à densité identique.</small></span>
      </label>
      <SettingsPanel settings={settings} onToggle={key => setSettings(value => ({ ...value, [key]: !value[key] }))}
        controlSettings={controls} onControlSettingChange={(key, value) => setControls(current => normalizeControlSettings({ ...current, [key]: value }))}
        onResetControlSettings={() => setControls({ ...DEFAULT_CONTROL_SETTINGS })}
        onToggleFullscreen={() => { if (document.fullscreenElement) document.exitFullscreen?.(); else document.documentElement.requestFullscreen?.() }} />
    </div>}
  </main>
}
