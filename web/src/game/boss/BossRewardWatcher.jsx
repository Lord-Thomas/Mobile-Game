import { useEffect, useRef, useState } from 'react'
import { useBossStore } from './bossStore'

// Détecte la défaite du boss et attribue la récompense (une seule fois par combat).
// L'attribution réelle (ajout à l'inventaire + sauvegarde) est faite par onDefeated,
// fourni par App : l'épée est ajoutée à ownedWeapons (union → garantie 1×/joueur,
// idempotente, marche en solo local ET Supabase, cf. ADR 0002).
//
// En multi, chaque client exécute son propre watcher → chaque joueur présent à la
// mort reçoit l'épée individuellement (conforme au brief).

const toastStyle = {
  position: 'absolute',
  top: 70,
  left: '50%',
  transform: 'translateX(-50%)',
  padding: '10px 18px',
  borderRadius: 12,
  background: 'rgba(20, 8, 4, 0.86)',
  border: '1px solid rgba(255, 180, 60, 0.5)',
  color: '#ffd76a',
  fontWeight: 700,
  letterSpacing: 0.3,
  boxShadow: '0 8px 26px rgba(0,0,0,0.5)',
  pointerEvents: 'none',
  zIndex: 41,
}

export default function BossRewardWatcher({ onDefeated }) {
  const state = useBossStore((s) => s.state)
  const grantedRef = useRef(false)
  const [showToast, setShowToast] = useState(false)

  useEffect(() => {
    if (state === 'dying' && !grantedRef.current) {
      grantedRef.current = true
      onDefeated?.()
      setShowToast(true)
      const id = window.setTimeout(() => setShowToast(false), 4500)
      return () => window.clearTimeout(id)
    }
    if (state === 'idle') grantedRef.current = false
    return undefined
  }, [state, onDefeated])

  if (!showToast) return null
  return <div style={toastStyle}>🗡️ Épée Ultra Cheat obtenue !</div>
}
