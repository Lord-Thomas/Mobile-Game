import { useState } from 'react'

// Icône d'objet : tente l'image (public/items/...), retombe sur l'emoji si elle
// n'existe pas. Partagée par le Sac et le marchand.
export default function ItemIcon({ def, className = '' }) {
  const [failed, setFailed] = useState(false)
  if (def?.icon && !failed) {
    return (
      <img
        className={`item-icon ${className}`}
        src={def.icon}
        alt={def.name ?? ''}
        onError={() => setFailed(true)}
      />
    )
  }
  return <span className={`item-icon item-icon-emoji ${className}`}>{def?.emoji ?? '❔'}</span>
}
