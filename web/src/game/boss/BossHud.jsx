import { useEffect, useRef, useState } from 'react'
import { useBossStore } from './bossStore'
import { SLIME_BOSS } from './bossConfig'
import BossArtDirectionBridge from './BossArtDirectionBridge'

// HUD du boss (hors Canvas) : grande barre de vie en haut quand le boss est actif.
// L'invocation passe par InteractionPrompts afin qu'une seule action contextuelle
// puisse occuper le bas de l'écran et que les sorts ne la recouvrent jamais.

const barTrackStyle = {
  position: 'relative',
  height: 16,
  borderRadius: 8,
  background: 'rgba(255,255,255,0.12)',
  overflow: 'hidden',
}

export default function BossHud() {
  const active = useBossStore((s) => s.active)
  const state = useBossStore((s) => s.state)
  const hp = useBossStore((s) => s.hp)
  const maxHp = useBossStore((s) => s.maxHp)
  const phase = useBossStore((s) => s.phase)
  const [announcementVisible, setAnnouncementVisible] = useState(false)
  const previousActiveRef = useRef(false)
  const announcementTimeoutRef = useRef(0)

  useEffect(() => {
    const wasActive = previousActiveRef.current
    previousActiveRef.current = active
    if (!active || wasActive) return undefined

    window.clearTimeout(announcementTimeoutRef.current)
    setAnnouncementVisible(true)
    announcementTimeoutRef.current = window.setTimeout(() => setAnnouncementVisible(false), 3200)
    return undefined
  }, [active])

  useEffect(() => () => window.clearTimeout(announcementTimeoutRef.current), [])

  const fillPct = maxHp > 0 ? Math.max(0, Math.min(100, (hp / maxHp) * 100)) : 0

  return (
    <>
      <BossArtDirectionBridge />
      {announcementVisible && (
        <div className="boss-summon-announcement" role="status" aria-live="assertive">
          <span>Roi Slime invoqué</span>
        </div>
      )}
      {active && (
        <div className="boss-health-hud">
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
    </>
  )
}
