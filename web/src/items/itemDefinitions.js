// Définition des objets lootables / vendables — STATIQUE et data-driven.
//
// `model`     : modèle 3D affiché quand l'objet tombe au sol (public/items/...).
// `icon`      : (optionnel) image 2D pour l'inventaire/marchand. Absente pour
//               l'instant → l'UI retombe sur `emoji`.
// `emoji`     : repli visuel (inventaire/marchand + drop si pas de modèle).
// `sellPrice` : prix de revente unitaire au PNJ (en pièces). Ajustable librement.

export const ITEMS = {
  bone: {
    id: 'bone',
    name: 'Os',
    model: '/items/bone+3d+model.glb',
    emoji: '🦴',
    sellPrice: 8,
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

export const ALL_ITEM_IDS = Object.keys(ITEMS)

export function getItemDefinition(itemId) {
  return ITEMS[itemId] ?? null
}
