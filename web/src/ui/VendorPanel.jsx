import { useState } from 'react'
import { getMaterialEntries, sellAll } from '../items/materialsInventory'

// Icône d'objet : tente l'image, retombe sur l'emoji si l'image n'existe pas.
function ItemIcon({ def }) {
  const [failed, setFailed] = useState(false)
  if (def?.icon && !failed) {
    return <img className="vendor-item-icon" src={def.icon} alt={def.name} onError={() => setFailed(true)} />
  }
  return <span className="vendor-item-icon vendor-item-emoji">{def?.emoji ?? '❔'}</span>
}

// Panneau marchand du PNJ : revente des matériaux lootés contre des pièces.
export default function VendorPanel({ materials, onSell, onSellAll, onClose }) {
  const entries = getMaterialEntries(materials)
  const totalValue = sellAll(materials).coins

  return (
    <div className="vendor-overlay" onClick={onClose}>
      <div className="vendor-panel" onClick={(event) => event.stopPropagation()}>
        <div className="vendor-header">
          <strong>🪙 Vendre des objets</strong>
          <button type="button" className="vendor-close" onClick={onClose} aria-label="Fermer">✕</button>
        </div>

        {entries.length === 0 ? (
          <p className="vendor-empty">Tu n'as rien à vendre pour l'instant. Va chasser des squelettes et des champignons !</p>
        ) : (
          <>
            <ul className="vendor-list">
              {entries.map(({ itemId, def, count, unitPrice, totalPrice }) => (
                <li key={itemId} className="vendor-item">
                  <ItemIcon def={def} />
                  <div className="vendor-item-info">
                    <div className="vendor-item-name">{def?.name ?? itemId}</div>
                    <div className="vendor-item-sub">x{count} · {unitPrice} 🪙 pièce</div>
                  </div>
                  <button
                    type="button"
                    className="vendor-sell-btn"
                    onClick={() => onSell(itemId, count)}
                  >
                    Vendre ({totalPrice} 🪙)
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="vendor-sell-all" onClick={onSellAll}>
              Tout vendre ({totalValue} 🪙)
            </button>
          </>
        )}
      </div>
    </div>
  )
}
