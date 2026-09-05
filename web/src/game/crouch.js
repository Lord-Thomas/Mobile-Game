export const CROUCH_WALK_SPEED = 1.05

export function getBirdApproachLimits(crouched) {
  return crouched
    ? { fearDistance: 0.38, runningDistance: 1.1, runningSpeed: 1.65, feedingDistance: 0.38 }
    : { fearDistance: 0.82, runningDistance: 3.1, runningSpeed: 1.65, feedingDistance: 0.82 }
}
