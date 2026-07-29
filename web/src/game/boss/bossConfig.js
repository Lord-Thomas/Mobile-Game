// Config statique du Boss Slime (V1). Data-driven pour permettre d'autres boss
// plus tard sans cas particulier (cf. docs/decisions/0002-autorite-boss.md).
const SUMMONING_ALTAR_OBJECT_ID = 'summoning_altar'

export const SLIME_BOSS = {
  id: 'slime_boss',
  name: 'Roi Slime',
  modelUrl: '/models/enemies/slime_boss.glb',
  maxHp: 2000,
  targetHeight: 4.5, // hauteur visuelle cible (unités monde), normalisée depuis la bbox
  spawnForwardOffset: 9, // distance d'apparition devant l'autel
  summonRange: 3.0, // portée d'interaction avec l'autel
  // Seuils de phase (fraction de vie). Les attaques accélèrent selon la phase.
  phaseThresholds: [0.6, 0.3],
  noDamageResetMs: 60_000,
  chaseSpeed: [2.45, 2.9, 3.35],
  attackRange: 8.5,

  // Attaque « bond écrasant + onde de choc ». Séparation volontaire (cf. brief) :
  // ces durées pilotent la MACHINE À ÉTATS ; le rendu (bond, anneau) et la DÉTECTION
  // (bande de l'anneau + hauteur du joueur pour l'esquive) en découlent.
  shockwave: {
    telegraphMs: 850, // le boss se ramasse (télégraphe) avant de sauter
    jumpMs: 700, // bond en l'air
    shockMs: 800, // propagation de l'onde au sol
    recoverMs: 1100, // récupération
    idleGapMs: 1600, // pause avant l'attaque suivante
    jumpHeight: 3.4, // hauteur du bond (unités monde)
    impactRadius: 3.1,
    impactDamage: 22,
    maxRadius: 10, // rayon max de l’onde
    band: 1.7, // épaisseur du front qui inflige les dégâts
    damage: 18,
    dodgeHeight: 0.9, // le joueur doit être à cette hauteur (sauter) pour esquiver
  },

  // Multiplicateur de vitesse d'attaque par phase (1 → 3). Le boss devient plus agressif.
  phaseSpeed: [1, 1.18, 1.42],

  projectile: {
    telegraphMs: 1050,
    poolDurationMs: 7200,
    poolTickMs: 850,
    impactDamage: 14,
    poolDamage: 5,
    poolRadius: 1.75,
    slowMultiplier: 0.58,
    countByPhase: [0, 3, 5],
  },

  summons: {
    phases: [2, 3],
    countByPhase: [0, 3, 5],
    radius: 0.75,
    speed: 1.55,
    damage: 7,
    attackCooldownMs: 1250,
    maxHpByKind: {
      green: 45,
      blue: 70,
    },
    greenModelUrl: '/models/enemies/cute+slime+3d+model.glb',
    blueModelUrl: '/models/enemies/blue_slime.glb',
  },

  // Mêlée : le boss s'enregistre comme cible de combat → la frappe du joueur
  // (poing / épée) le touche via le système existant (arc + combo). L'épée « ultra
  // cheat » inflige des dégâts massifs (bonus anti-slime intégré au montant élevé).
  melee: {
    hitRadius: 2.85, // rayon minimal, complété au runtime à partir du gabarit visible
    hitPadding: 0.3,
  },
}

export { SUMMONING_ALTAR_OBJECT_ID }

export function hpToPhase(hp, maxHp) {
  const frac = maxHp > 0 ? hp / maxHp : 0
  if (frac > SLIME_BOSS.phaseThresholds[0]) return 1
  if (frac > SLIME_BOSS.phaseThresholds[1]) return 2
  return 3
}
