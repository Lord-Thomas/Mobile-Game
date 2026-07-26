export const ATTACK_TYPE = Object.freeze({
  DODGEABLE: 'dodgeable',
  GROUND_WAVE: 'groundWave',
  PERSISTENT_AREA: 'persistentArea',
})

export function isDamageIgnoredByDodge(attackType, dodgeInvulnerable) {
  return dodgeInvulnerable === true && attackType === ATTACK_TYPE.DODGEABLE
}
