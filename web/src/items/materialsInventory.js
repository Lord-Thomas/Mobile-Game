// Inventaire de matériaux (objets empilables lootés) — FONCTIONS PURES.
// Forme persistée (world_settings.materials) : { [itemId]: number }.

import { getItemDefinition } from './itemDefinitions'

export function normalizeMaterials(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const result = {}
  for (const [itemId, value] of Object.entries(raw)) {
    if (!getItemDefinition(itemId)) continue
    const count = Math.floor(Number(value))
    if (Number.isFinite(count) && count > 0) result[itemId] = count
  }
  return result
}

// Ajoute une liste d'itemId (avec doublons) à l'inventaire.
export function addItems(materials, itemIds = []) {
  if (!itemIds.length) return materials
  const next = normalizeMaterials(materials)
  let changed = false
  for (const itemId of itemIds) {
    if (!getItemDefinition(itemId)) continue
    next[itemId] = (next[itemId] ?? 0) + 1
    changed = true
  }
  return changed ? next : materials
}

export function getItemCount(materials, itemId) {
  return normalizeMaterials(materials)[itemId] ?? 0
}

// Vend une quantité d'un objet. Renvoie { materials, sold, coins } : `sold` est la
// quantité réellement vendue (plafonnée au stock), `coins` le gain total.
export function sellItem(materials, itemId, quantity = 1) {
  const normalized = normalizeMaterials(materials)
  const def = getItemDefinition(itemId)
  const owned = normalized[itemId] ?? 0
  const sold = Math.max(0, Math.min(Math.floor(quantity), owned))
  if (!def || sold <= 0) return { materials: normalized, sold: 0, coins: 0 }

  const next = { ...normalized }
  if (owned - sold > 0) next[itemId] = owned - sold
  else delete next[itemId]

  return { materials: next, sold, coins: sold * (def.sellPrice ?? 0) }
}

// Vend tout l'inventaire d'un coup.
export function sellAll(materials) {
  const normalized = normalizeMaterials(materials)
  let coins = 0
  for (const [itemId, count] of Object.entries(normalized)) {
    coins += count * (getItemDefinition(itemId)?.sellPrice ?? 0)
  }
  return { materials: {}, coins }
}

// Liste pour l'UI marchand : [{ itemId, def, count, unitPrice, totalPrice }].
export function getMaterialEntries(materials) {
  const normalized = normalizeMaterials(materials)
  return Object.entries(normalized).map(([itemId, count]) => {
    const def = getItemDefinition(itemId)
    const unitPrice = def?.sellPrice ?? 0
    return { itemId, def, count, unitPrice, totalPrice: unitPrice * count }
  })
}
