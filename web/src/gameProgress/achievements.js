// Hauts faits locaux (stockés dans la progression du joueur, pas côté serveur).
// Contrairement aux titres limités (TITLES), ceux-ci se débloquent pour tout le
// monde, en solo comme connecté, et ne donnent pas forcément de titre.
//
// - `metric` + `goal` : haut fait basé sur un état mesurable (réévalué en continu).
//   metric ∈ 'mobKills' | 'furniture' | 'coins'.
// - sans metric : haut fait événementiel, débloqué au moment de l'action.

export const LOCAL_ACHIEVEMENTS = [
  { id: 'slime_tamer', icon: 'S', name: 'Dompteur de slime', description: 'Debloquer un slime en familier.', category: 'Collection' },
  // ── Combat ────────────────────────────────────────────────────────────────
  { id: 'kill_first_mob', icon: '⚔️', name: 'Premier sang', description: 'Vaincre ton premier monstre.', metric: 'mobKills', goal: 1, category: 'Combat' },
  { id: 'kill_skeleton', icon: '💀', name: 'Brise-os', description: 'Vaincre un squelette.', category: 'Combat' },
  { id: 'kill_10_mobs', icon: '🗡️', name: 'Exterminateur', description: 'Vaincre 10 monstres.', metric: 'mobKills', goal: 10, category: 'Combat' },
  { id: 'kill_50_mobs', icon: '☠️', name: 'Fléau', description: 'Vaincre 50 monstres.', metric: 'mobKills', goal: 50, category: 'Combat' },
  { id: 'first_summon', icon: '🧙', name: 'Nécromancien', description: 'Invoquer des squelettes pour la première fois.', category: 'Combat' },

  // ── Possessions ─────────────────────────────────────────────────────────────
  { id: 'own_weapon', icon: '🪄', name: 'Armé', description: 'Posséder une arme.', category: 'Collection' },
  { id: 'own_furniture_1', icon: '🪑', name: 'Décorateur', description: 'Posséder 1 meuble.', metric: 'furniture', goal: 1, category: 'Collection' },
  { id: 'own_furniture_10', icon: '🛋️', name: 'Aménageur', description: 'Posséder 10 meubles.', metric: 'furniture', goal: 10, category: 'Collection' },
  { id: 'own_furniture_50', icon: '🏠', name: 'Architecte d’intérieur', description: 'Posséder 50 meubles.', metric: 'furniture', goal: 50, category: 'Collection' },
  { id: 'own_mount', icon: '🐎', name: 'Cavalier', description: 'Posséder une monture.', category: 'Collection' },
  { id: 'rich_1000', icon: '💰', name: 'Petite fortune', description: 'Accumuler 1000 pièces.', metric: 'coins', goal: 1000, category: 'Collection' },

  // ── Exploration ───────────────────────────────────────────────────────────
  { id: 'first_fly', icon: '🐉', name: 'Tête en l’air', description: 'Voler pour la première fois.', category: 'Exploration' },
]

const LOCAL_ACHIEVEMENTS_BY_ID = LOCAL_ACHIEVEMENTS.reduce((map, achievement) => {
  map[achievement.id] = achievement
  return map
}, {})

export function getLocalAchievement(id) {
  return LOCAL_ACHIEVEMENTS_BY_ID[id] ?? null
}

// Renvoie les ids débloqués à partir des métriques d'état courantes.
export function evaluateMetricAchievements({ mobKills = 0, furniture = 0, coins = 0 } = {}) {
  const values = { mobKills, furniture, coins }
  return LOCAL_ACHIEVEMENTS
    .filter((achievement) => achievement.metric && values[achievement.metric] >= achievement.goal)
    .map((achievement) => achievement.id)
}
