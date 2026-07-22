// Config statique du Boss Slime (V1). Data-driven pour permettre d'autres boss
// plus tard sans cas particulier (cf. docs/decisions/0002-autorite-boss.md).
import { SUMMONING_ALTAR_OBJECT_ID } from '../../world/mapObjects'

export const SLIME_BOSS = {
  id: 'slime_boss',
  name: 'Roi Slime',
  modelUrl: '/models/enemies/slime_boss.glb',
  maxHp: 2000,
  targetHeight: 3.4, // hauteur visuelle cible (unités monde), normalisée depuis la bbox
  spawnForwardOffset: 3.6, // distance d'apparition devant l'autel
  summonRange: 3.0, // portée d'interaction avec l'autel
  // Seuils de phase (fraction de vie). V1 : n'affiche que la phase, les attaques
  // viendront ensuite et brancheront leurs paramètres dessus.
  phaseThresholds: [0.6, 0.3],
}

export { SUMMONING_ALTAR_OBJECT_ID }

export function hpToPhase(hp, maxHp) {
  const frac = maxHp > 0 ? hp / maxHp : 0
  if (frac > SLIME_BOSS.phaseThresholds[0]) return 1
  if (frac > SLIME_BOSS.phaseThresholds[1]) return 2
  return 3
}
