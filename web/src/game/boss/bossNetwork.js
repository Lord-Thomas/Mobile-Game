import { SLIME_BOSS } from './bossConfig'
import { useBossStore } from './bossStore'
import { getBossSpawnForAltar } from './bossSimulation'

function distance2d(a, b) {
  return Math.hypot((a?.[0] ?? 0) - (b?.[0] ?? 0), (a?.[2] ?? 0) - (b?.[2] ?? 0))
}

export function createBossActionId(prefix = 'boss') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function sendBossSummonRequest(channel, altarId) {
  return channel?.sendBossAction?.({
    type: 'summon',
    actionId: createBossActionId('summon'),
    altarId,
  })
}

export function sendBossHitRequest(channel, { weaponId = null, charged = false } = {}) {
  return channel?.sendBossAction?.({
    type: 'hit',
    actionId: createBossActionId('hit'),
    weaponId,
    charged,
  })
}

export function createBossActionGuard() {
  return { seen: new Set(), lastHitAtByPlayer: new Map() }
}

export function handleHostBossAction({
  action,
  remotePlayerState,
  placements,
  getHeight,
  guard,
  now = Date.now(),
}) {
  if (!action?.actionId || !guard || guard.seen.has(action.actionId)) return false
  guard.seen.add(action.actionId)
  if (guard.seen.size > 256) guard.seen.delete(guard.seen.values().next().value)

  if (action.type === 'summon') {
    const altar = placements.find((placement) => placement.id === action.altarId)
    if (!altar || !Array.isArray(remotePlayerState?.position)) return false
    if (distance2d(remotePlayerState.position, altar.position) > SLIME_BOSS.summonRange + 1.25) return false
    return useBossStore.getState().summon({
      altarId: altar.id,
      spawn: getBossSpawnForAltar(altar, getHeight),
      now,
    })
  }

  if (action.type !== 'hit' || !Array.isArray(remotePlayerState?.position)) return false
  const boss = useBossStore.getState()
  if (!boss.active || boss.state !== 'active' || !boss.position) return false
  if (distance2d(remotePlayerState.position, boss.position) > SLIME_BOSS.melee.hitRadius + 3.2) return false

  const playerId = String(action.userId ?? remotePlayerState.userId ?? 'remote')
  const lastHitAt = guard.lastHitAtByPlayer.get(playerId) ?? 0
  if (now - lastHitAt < 260) return false
  guard.lastHitAtByPlayer.set(playerId, now)

  const swordEquipped = remotePlayerState.equippedWeapon === 'cheat_sword'
  const baseDamage = swordEquipped ? SLIME_BOSS.melee.swordDamage : 10
  const damage = action.charged && swordEquipped
    ? baseDamage * SLIME_BOSS.melee.chargedMultiplier
    : baseDamage
  return useBossStore.getState().damage(damage, { now })
}
