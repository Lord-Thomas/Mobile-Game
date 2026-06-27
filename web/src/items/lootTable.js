// Tables de loot par type de monstre — FONCTION PURE (testable, rng injectable).
//
// Chaque entrée est un tirage indépendant : `chance` ∈ [0, 1]. Pour l'instant
// 50% de chance de looter l'objet associé au type de monstre.

export const LOOT_TABLES = {
  skeleton: [
    { itemId: 'bone', chance: 0.5 },
    { itemId: 'blue_crystal', chance: 0.06 },
  ],
  skeleton_archer: [
    { itemId: 'bone', chance: 0.5 },
    { itemId: 'blue_crystal', chance: 0.06 },
  ],
  skeleton_mage: [
    { itemId: 'bone', chance: 0.5 },
    { itemId: 'blue_crystal', chance: 0.06 },
  ],
  mushroom: [
    { itemId: 'mushroom', chance: 0.5 },
    { itemId: 'red_crystal', chance: 0.06 },
  ],
}

// Renvoie la liste des itemId lootés à la mort d'un monstre `mobType`.
// rng() doit renvoyer un nombre dans [0, 1[ (Math.random par défaut ; injectable
// pour les tests).
export function rollLoot(mobType, rng = Math.random) {
  const table = LOOT_TABLES[mobType]
  if (!table) return []
  const drops = []
  for (const entry of table) {
    if (rng() < entry.chance) drops.push(entry.itemId)
  }
  return drops
}
