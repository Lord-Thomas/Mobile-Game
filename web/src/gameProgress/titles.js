export const TITLE_IDS = {
  firstMobSlayerFounder: 'first_mob_slayer_founder',
}

export const ACHIEVEMENT_IDS = {
  firstMobDefeated: 'first_mob_defeated',
}

export const TITLE_RARITIES = {
  common: {
    id: 'common',
    label: 'Commun',
    color: '#f8fbff',
  },
  rare: {
    id: 'rare',
    label: 'Rare',
    color: '#60a5fa',
  },
  epic: {
    id: 'epic',
    label: 'Epique',
    color: '#c084fc',
  },
  limited: {
    id: 'limited',
    label: 'Limite',
    color: '#ffd166',
  },
  founder: {
    id: 'founder',
    label: 'Fondateur',
    color: '#f97316',
  },
}

export const TITLES = {
  [TITLE_IDS.firstMobSlayerFounder]: {
    id: TITLE_IDS.firstMobSlayerFounder,
    name: 'Chasseur Originel',
    description: 'Attribue aux 50 premiers joueurs connectes qui ont vaincu le premier monstre du jeu.',
    rarity: 'founder',
    limited: true,
    maxOwners: 50,
    obtainable: true,
  },
}

export const ACHIEVEMENTS = {
  [ACHIEVEMENT_IDS.firstMobDefeated]: {
    id: ACHIEVEMENT_IDS.firstMobDefeated,
    name: 'Premier monstre vaincu',
    description: 'Vaincre le premier monstre du jeu.',
    rewardTitleId: TITLE_IDS.firstMobSlayerFounder,
  },
}

export function getTitleDefinition(titleId) {
  return TITLES[titleId] ?? null
}

export function getTitleRarity(title) {
  return TITLE_RARITIES[title?.rarity] ?? TITLE_RARITIES.common
}
