// Constantes de tuning combat / physique du joueur.
// Extraites de App.jsx pour pouvoir être partagées avec les modules de gameplay
// (ex. combatGeometry.js) sans dépendre du monolithe.

export const GOAL_Z = -3.42
export const BALL_RADIUS = 0.138
export const PLAYER_CAPSULE_HALF_HEIGHT = 0.2
export const PLAYER_CAPSULE_RADIUS = 0.22

export const PLAYER_KICK_DURATION = 1.15
export const PLAYER_KICK_CONTACT_DELAY = 0.43
export const PLAYER_KICK_CONTACT_WINDOW = 0.16
export const PLAYER_KICK_RANGE = 1.05
export const PLAYER_KICK_FRONT_MIN = 0.08
export const PLAYER_KICK_LATERAL_RANGE = 0.55
export const PLAYER_KICK_FOOT_FORWARD_OFFSET = 0.46
export const PLAYER_KICK_FOOT_SIDE_OFFSET = 0.1
export const PLAYER_KICK_FOOT_CONTACT_RADIUS = 0.28

export const PLAYER_PUNCH_DURATION = 0.82
export const PLAYER_PUNCH_CONTACT_DELAY = 0.28
export const PLAYER_PUNCH_CONTACT_WINDOW = 0.14
export const PLAYER_PUNCH_DAMAGE = 10
export const PLAYER_PUNCH_COMBO_STEP = 5    // +dégâts par coup enchaîné
export const PLAYER_PUNCH_DAMAGE_MAX = 30   // plafond des dégâts de combo
export const PUNCH_COMBO_WINDOW = 2.0       // secondes max entre deux coups pour garder le combo
export const PLAYER_PUNCH_RANGE = 1.15
export const PLAYER_PUNCH_FRONT_MIN = 0.15
export const PLAYER_PUNCH_LATERAL_RANGE = 0.62
