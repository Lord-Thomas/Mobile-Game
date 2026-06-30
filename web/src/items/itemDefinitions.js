// Définition des objets lootables / vendables — STATIQUE et data-driven.
//
// `model`     : modèle 3D affiché quand l'objet tombe au sol (public/items/...).
// `icon`      : (optionnel) image 2D pour l'inventaire/marchand. Absente pour
//               l'instant → l'UI retombe sur `emoji`.
// `emoji`     : repli visuel (inventaire/marchand + drop si pas de modèle).
// `sellPrice` : prix de revente unitaire au PNJ (en pièces). Ajustable librement.

import { GENERATED_ITEM_DEFINITIONS } from './itemDefinitions.generated'

const BASE_ITEMS = {
  bone: {
    id: 'bone',
    name: 'Os',
    model: '/items/bone+3d+model.glb',
    emoji: '🦴',
    sellPrice: 10,
  },
  mushroom: {
    id: 'mushroom',
    name: 'Champignon',
    model: '/items/red+mushroom+3d+model.glb',
    emoji: '🍄',
    sellPrice: 5,
  },
  red_crystal: {
    id: 'red_crystal',
    name: 'Cristal rouge',
    model: '/items/red+crystal+3d+model.glb',
    emoji: '🔴',
    sellPrice: 100,
  },
  blue_crystal: {
    id: 'blue_crystal',
    name: 'Cristal bleu',
    model: '/items/blue+crystal+cluster+3d+model.glb',
    emoji: '🔷',
    sellPrice: 181,
  },
}

function normalizeGeneratedItem(definition) {
  const id = typeof definition?.id === 'string' && /^[a-zA-Z0-9_-]+$/.test(definition.id)
    ? definition.id
    : null
  const model = typeof definition?.model === 'string' && definition.model.trim()
    ? definition.model.trim()
    : null
  if (!id || !model || BASE_ITEMS[id]) return null

  return {
    id,
    name: typeof definition.name === 'string' && definition.name.trim()
      ? definition.name.trim()
      : id,
    model,
    icon: typeof definition.icon === 'string' && definition.icon.trim()
      ? definition.icon.trim()
      : '',
    emoji: typeof definition.emoji === 'string' && definition.emoji.trim()
      ? definition.emoji.trim()
      : '📦',
    sellPrice: Number.isFinite(Number(definition.sellPrice))
      ? Math.max(0, Math.round(Number(definition.sellPrice)))
      : 10,
  }
}

const generatedItems = GENERATED_ITEM_DEFINITIONS.reduce((items, definition) => {
  const item = normalizeGeneratedItem(definition)
  if (item) items[item.id] = item
  return items
}, {})

export const ITEMS = {
  ...BASE_ITEMS,
  ...generatedItems,
}

export const ALL_ITEM_IDS = Object.keys(ITEMS)

export function getItemDefinition(itemId) {
  return ITEMS[itemId] ?? null
}
