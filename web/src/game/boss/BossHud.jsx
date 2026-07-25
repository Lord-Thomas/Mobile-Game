import { useGameStore } from '../../stores/useGameStore'
import { getTerrainHeight } from '../../world/terrain/terrainGeometry'
import { useBossStore } from './bossStore'
import { SLIME_BOSS } from './bossConfig'
import { getBossSpawnForAltar } from './bossSimulation'

// HUD du boss (hors Canvas) : grande barre de vie en haut quand le boss est actif,
// et bouton "Invoquer" en bas quand le joueur est à portée d'un autel libre.
// S'abonne directement aux stores (aucun re-render d'App).

const barShellStyle = {
  position: 'absolute',
  top: 18,
  left: '50%',
  transform: 'translateX(-50%)',
  width: 'min(560px, 82vw)',
  padding: '8px 12px 10px',
  borderRadius: 12,
  background: 'rgba(15, 6, 10, 0.72)',
  boxShadow: '0 6px 22px rgba(0,0,0,0.45)',
  border: '1px solid rgba(255, 80, 80, 0.35)',
  color: '#fff',
  pointerEvents: 'none',
  zIndex: 40,
  fontFamily: 'inherit',
}

const barTrackStyle = {
  position: 'relative',
  height: 16,
  borderRadius: 8,
  background: 'rgba(255,255,255,0.12)',
  overflow: 'hidden',
}

export default function BossHud({ placements = [], authority = true, onRequestSummon }) {
  const mode = useGameStore((s) => s.view.mode)
  const active = useBossStore((s) => s.active)
  const state = useBossStore((s) => s.state)
  const hp = useBossStore((s) => s.hp)
  const maxHp = useBossStore((s) => s.maxHp)
  const phase = useBossStore((s) => s.phase)
  const nearAltarId = useBossStore((s) => s.nearAltarId)

  const fillPct = maxHp > 0 ? Math.max(0, Math.min(100, (hp / maxHp) * 100)) : 0
  const showSummon = mode === 'play' && !active && nearAltarId

  const onSummon = () => {
    const altar = placements.find((placement) => placement.id === nearAltarId)
    if (!altar) return
    if (!authority) {
      onRequestSummon?.({ type: 'summon', altarId: altar.id })
      return
    }
    useBossStore.getState().summon({
      altarId: altar.id,
      spawn: getBossSpawnForAltar(altar, getTerrainHeight),
    })
  }

  return (
    <>
      {active && (
        <div style={barShellStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 14 }}>
            <strong style={{ letterSpacing: 0.4 }}>{SLIME_BOSS.name}</strong>
            <span style={{ opacity: 0.85 }}>
              {state === 'dying' ? 'Vaincu !' : `Phase ${phase}`} · {Math.ceil(hp)} / {maxHp}
            </span>
          </div>
          <div style={barTrackStyle}>
            <div
              style={{
                position: 'absolute',
                inset: 0,
                width: `${fillPct}%`,
                background: 'linear-gradient(90deg, #ff5252, #ff1744)',
                transition: 'width 120ms linear',
              }}
            />
          </div>
        </div>
      )}

      {showSummon && (
        <button className="skin-open-btn custom-open-btn" type="button" onClick={onSummon}>
          Invoquer le Boss
        </button>
      )}

    </>
  )
}
