// Textures de base d'une maison neuve : peinture blanche au sol comme au mur.
// Toute zone construite et non peinte les reçoit. Partagé par le store, la
// persistance et l'UI pour éviter des littéraux divergents.
export const DEFAULT_FLOOR_SKIN_ID = 'floor-peinture-blanche'
export const DEFAULT_WALL_SKIN_ID = 'wall-classic'

// Skins gratuits, possédés dès le départ.
export const DEFAULT_OWNED_FLOOR_SKIN_IDS = [DEFAULT_FLOOR_SKIN_ID, 'floor-classic']
export const DEFAULT_OWNED_WALL_SKIN_IDS = [DEFAULT_WALL_SKIN_ID]
