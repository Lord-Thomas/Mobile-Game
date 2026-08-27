import {
  MOB_ACTIVITY_TIERS,
  getMobActivityInterval,
  resolveMobActivityTier,
} from '../mobs/mobActivity'
import { FRAME_PHASES } from './frameScheduler'
import { useGameFrameTask } from './useGameFrameTask'

const MOB_ACTIVITY_REFRESH_INTERVAL = 0.25

function getActivityPlayers(enabled, localPlayerPositionRef, remotePlayerStateRef) {
  if (!enabled) return []

  const players = []
  const localPosition = localPlayerPositionRef?.current
  if (localPosition) players.push({ position: localPosition })

  const remote = remotePlayerStateRef?.current
  if (remote?.position && (!remote.zone || remote.zone === 'outside')) {
    players.push({ position: remote.position })
  }
  return players
}

export default function MobActivitySystem({
  enabled,
  mobGroupRef,
  localPlayerPositionRef,
  remotePlayerStateRef,
}) {
  useGameFrameTask(() => {
    const mobs = mobGroupRef?.current
    if (!mobs) return

    const players = getActivityPlayers(enabled, localPlayerPositionRef, remotePlayerStateRef)
    for (const mob of mobs.values()) {
      if (!mob?.activityTierRef || typeof mob.getPosition !== 'function') continue
      const currentTier = mob.activityTierRef.current ?? MOB_ACTIVITY_TIERS.DORMANT
      const nextTier = resolveMobActivityTier(currentTier, mob.getPosition(), players)
      if (nextTier === currentTier) continue

      mob.activityTierRef.current = nextTier
      if (mob.activityIntervalRef) {
        mob.activityIntervalRef.current = getMobActivityInterval(nextTier)
      }
      mob.applyActivityTier?.(nextTier)
    }
  }, {
    label: 'mob-activity',
    phase: FRAME_PHASES.PRE_SIMULATION,
    interval: MOB_ACTIVITY_REFRESH_INTERVAL,
  })

  return null
}
