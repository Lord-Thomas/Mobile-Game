// Couleurs de base + apparence par défaut du personnage joueur.
//
// Extrait d'App.jsx pour être partagé sans dépendance circulaire : App.jsx ET le
// store (src/stores/useGameStore.js, slice "equipment") en ont besoin — le store
// pour initialiser characterAppearance à la même valeur par défaut qu'avant.

export const CHARACTER_BASE_COLORS = {
  skin:          '#c79e7b',
  hair:          '#d39b3f',
  eyes:          '#3B82C4',
  eyebrows:      '#d39b3f',
  shirt:         '#b4392e',
  pants:         '#252421',
  pants_details: '#252421',
  pants_detail_yellow: '#d39b3f',
  shoes:         '#F0F0F0',
  socks:         '#F0F0F0',
}

export const CHARACTER_DEFAULT_APPEARANCE = {
  skinColor:        CHARACTER_BASE_COLORS.skin,
  hairColor:        CHARACTER_BASE_COLORS.hair,
  eyeColor:         CHARACTER_BASE_COLORS.eyes,
  eyebrowsColor:    CHARACTER_BASE_COLORS.eyebrows,
  shirtColor:       CHARACTER_BASE_COLORS.shirt,
  pantsColor:       CHARACTER_BASE_COLORS.pants,
  pantsDetailsColor: CHARACTER_BASE_COLORS.pants_detail_yellow,
  shoesColor:       CHARACTER_BASE_COLORS.shoes,
  socksColor:       CHARACTER_BASE_COLORS.socks,
  goldCoat: false,
  auraEquipped: false,
}
