// Définition des objets lootables / vendables — STATIQUE et data-driven.
//
// `icon`  : chemin d'une image dans public/items/ (PNG ou webp). Si le fichier
//           n'existe pas encore, l'UI retombe sur `emoji`.
// `emoji` : repli visuel immédiat (avant que tu n'ajoutes les images).
// `sellPrice` : prix de revente unitaire au PNJ (en pièces). Ajustable librement.

export const ITEMS = {
  bone: {
    id: 'bone',
    name: 'Os',
    icon: '/items/bone.png',
    emoji: '🦴',
    sellPrice: 5,
  },
  mushroom: {
    id: 'mushroom',
    name: 'Champignon',
    icon: '/items/mushroom.png',
    emoji: '🍄',
    sellPrice: 4,
  },
}

export const ALL_ITEM_IDS = Object.keys(ITEMS)

export function getItemDefinition(itemId) {
  return ITEMS[itemId] ?? null
}
