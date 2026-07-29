import { SLIME_BOSS, hpToPhase } from './bossConfig'

const EPSILON = 1e-6

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback
}

function safePosition(value, fallback = [0, 0, 0]) {
  if (!Array.isArray(value) || value.length !== 3) return [...fallback]
  return value.map((entry, index) => finite(entry, fallback[index] ?? 0))
}

function distance2d(a, b) {
  return Math.hypot((a?.[0] ?? 0) - (b?.[0] ?? 0), (a?.[2] ?? 0) - (b?.[2] ?? 0))
}

function activePlayers(players) {
  return (Array.isArray(players) ? players : [])
    .filter((player) => player && player.alive !== false && Array.isArray(player.position))
    .map((player, index) => ({
      id: String(player.id ?? `player-${index}`),
      position: safePosition(player.position),
    }))
}

function closestPlayer(position, players) {
  let closest = null
  let closestDistance = Infinity
  for (const player of players) {
    const distance = distance2d(position, player.position)
    if (distance < closestDistance) {
      closest = player
      closestDistance = distance
    }
  }
  return closest ? { ...closest, distance: closestDistance } : null
}

function deterministicOffset(sequence, index, radius) {
  const angle = sequence * 2.399963 + index * 2.094395
  const distance = radius * (0.28 + ((sequence * 17 + index * 29) % 67) / 100)
  return [Math.sin(angle) * distance, Math.cos(angle) * distance]
}

export function createInactiveBossState(overrides = {}) {
  return {
    version: 1,
    revision: finite(overrides.revision, 0),
    active: false,
    state: 'idle',
    hp: 0,
    maxHp: SLIME_BOSS.maxHp,
    phase: 1,
    altarId: null,
    spawn: null,
    position: null,
    attack: null,
    nextAttackAt: 0,
    attackSequence: 0,
    hazards: [],
    minions: [],
    summonedPhases: [],
    lastPlayerInArenaAt: 0,
    lastDamagedAt: 0,
    dyingEndsAt: 0,
    victoryId: null,
    resetReason: overrides.resetReason ?? null,
    stuckSince: 0,
  }
}

export function summonBoss(state, { altarId, spawn, now = Date.now() }) {
  if (state?.active) return state
  const safeSpawn = safePosition(spawn)
  return {
    ...createInactiveBossState({ revision: finite(state?.revision, 0) + 1 }),
    active: true,
    state: 'appearing',
    hp: SLIME_BOSS.maxHp,
    altarId: typeof altarId === 'string' ? altarId.slice(0, 100) : null,
    spawn: safeSpawn,
    position: safeSpawn,
    nextAttackAt: now + 1600,
    lastPlayerInArenaAt: now,
    lastDamagedAt: now,
  }
}

export function damageBoss(state, amount, { now = Date.now() } = {}) {
  if (!state?.active || !['appearing', 'active'].includes(state.state)) return state
  const damage = Math.max(0, finite(amount))
  if (damage <= 0) return state
  const hp = Math.max(0, state.hp - damage)
  if (hp <= 0) {
    return {
      ...state,
      revision: state.revision + 1,
      hp: 0,
      phase: 3,
      state: 'dying',
      attack: null,
      hazards: [],
      minions: [],
      lastDamagedAt: now,
      dyingEndsAt: now + 1200,
      victoryId: state.victoryId ?? `slime-boss-${now}`,
    }
  }
  return {
    ...state,
    revision: state.revision + 1,
    hp,
    phase: hpToPhase(hp, state.maxHp),
    lastDamagedAt: now,
  }
}

export function damageBossMinion(state, minionId, amount) {
  if (!state?.active || state.state !== 'active' || typeof minionId !== 'string') return state
  const damage = Math.max(0, finite(amount))
  const index = state.minions.findIndex((minion) => minion.id === minionId)
  if (damage <= 0 || index < 0) return state
  const minion = state.minions[index]
  const hp = Math.max(0, finite(minion.hp, minion.maxHp) - damage)
  const minions = hp <= 0
    ? state.minions.filter((entry) => entry.id !== minionId)
    : state.minions.map((entry, entryIndex) => entryIndex === index ? { ...entry, hp } : entry)
  return { ...state, revision: state.revision + 1, minions }
}

export function resetBoss(state, reason = 'manual') {
  return createInactiveBossState({
    revision: finite(state?.revision, 0) + 1,
    resetReason: reason,
  })
}

function spawnPhaseMinions(state, phase) {
  const count = SLIME_BOSS.summons.countByPhase[phase - 1] ?? 0
  if (!count || state.summonedPhases.includes(phase)) return state
  const minions = [...state.minions]
  for (let index = 0; index < count; index += 1) {
    const [ox, oz] = deterministicOffset(state.attackSequence + phase * 11, index, 4.5)
    minions.push({
      id: `boss-minion-${phase}-${index}`,
      kind: index % 2 === 0 ? 'green' : 'blue',
      position: [state.position[0] + ox, state.position[1], state.position[2] + oz],
      spawnedPhase: phase,
      hp: SLIME_BOSS.summons.maxHpByKind[index % 2 === 0 ? 'green' : 'blue'],
      maxHp: SLIME_BOSS.summons.maxHpByKind[index % 2 === 0 ? 'green' : 'blue'],
    })
  }
  return {
    ...state,
    revision: state.revision + 1,
    minions,
    summonedPhases: [...state.summonedPhases, phase],
  }
}

function chooseAttack(state) {
  if (state.phase === 1) return 'shockwave'
  if (state.phase === 2) return state.attackSequence % 2 === 0 ? 'projectiles' : 'shockwave'
  return state.attackSequence % 3 === 0 ? 'shockwave' : 'projectiles'
}

function startAttack(state, now, players) {
  const kind = chooseAttack(state)
  const sequence = state.attackSequence + 1
  if (kind === 'shockwave') {
    const cfg = SLIME_BOSS.shockwave
    const speed = SLIME_BOSS.phaseSpeed[state.phase - 1] ?? 1
    const telegraphMs = cfg.telegraphMs / speed
    const jumpMs = cfg.jumpMs / speed
    const shockMs = cfg.shockMs / speed
    const recoverMs = cfg.recoverMs / speed
    return {
      ...state,
      revision: state.revision + 1,
      attackSequence: sequence,
      attack: {
        id: `shockwave-${sequence}`,
        kind,
        startedAt: now,
        telegraphEndsAt: now + telegraphMs,
        jumpEndsAt: now + telegraphMs + jumpMs,
        activeEndsAt: now + telegraphMs + jumpMs + shockMs,
        endsAt: now + telegraphMs + jumpMs + shockMs + recoverMs,
      },
    }
  }

  const cfg = SLIME_BOSS.projectile
  const count = cfg.countByPhase[state.phase - 1] ?? 3
  const target = closestPlayer(state.position, players)?.position ?? state.position
  const hazards = []
  for (let index = 0; index < count; index += 1) {
    const [ox, oz] = deterministicOffset(sequence, index, 5.2)
    const impactAt = now + cfg.telegraphMs + index * 110
    hazards.push({
      id: `pool-${sequence}-${index}`,
      position: [target[0] + ox, state.spawn[1], target[2] + oz],
      radius: cfg.poolRadius,
      telegraphAt: now,
      impactAt,
      expiresAt: impactAt + cfg.poolDurationMs,
    })
  }
  return {
    ...state,
    revision: state.revision + 1,
    attackSequence: sequence,
    hazards: [...state.hazards, ...hazards],
    attack: {
      id: `projectiles-${sequence}`,
      kind,
      startedAt: now,
      telegraphEndsAt: now + cfg.telegraphMs,
      activeEndsAt: now + cfg.telegraphMs + 500,
      endsAt: now + cfg.telegraphMs + 900,
    },
  }
}

function moveToward(position, target, speed, dt, maxDistanceFromSpawn, spawn) {
  const dx = target[0] - position[0]
  const dz = target[2] - position[2]
  const length = Math.hypot(dx, dz)
  if (length < EPSILON) return position
  const step = Math.min(length, Math.max(0, speed * dt))
  const next = [position[0] + (dx / length) * step, position[1], position[2] + (dz / length) * step]
  if (distance2d(next, spawn) > maxDistanceFromSpawn) return position
  return next
}

export function stepBoss(state, { now = Date.now(), dt = 0, players = [] } = {}) {
  if (!state?.active) return state ?? createInactiveBossState()
  if (state.state === 'dying') {
    return now >= state.dyingEndsAt ? resetBoss(state, 'defeated') : state
  }
  if (now - finite(state.lastDamagedAt, now) >= SLIME_BOSS.noDamageResetMs) {
    return resetBoss(state, 'no-damage')
  }

  const knownPlayers = (Array.isArray(players) ? players : []).filter((player) => player && Array.isArray(player.position))
  const availablePlayers = activePlayers(knownPlayers)
  if (knownPlayers.length > 0 && availablePlayers.length === 0) {
    return resetBoss(state, 'all-dead')
  }
  const playersInResetRange = availablePlayers.filter((player) => distance2d(player.position, state.spawn) <= SLIME_BOSS.resetDistance)
  let next = state
  if (playersInResetRange.length > 0) {
    next = { ...next, lastPlayerInArenaAt: now }
  } else if (now - state.lastPlayerInArenaAt >= SLIME_BOSS.resetAfterMs) {
    return resetBoss(state, 'abandoned')
  }

  if (next.state === 'appearing') {
    if (now < next.nextAttackAt) return next
    next = { ...next, revision: next.revision + 1, state: 'active' }
  }

  for (const phase of SLIME_BOSS.summons.phases) {
    if (next.phase >= phase) next = spawnPhaseMinions(next, phase)
  }

  const hazards = next.hazards.filter((hazard) => hazard.expiresAt > now)
  if (hazards.length !== next.hazards.length) next = { ...next, revision: next.revision + 1, hazards }

  const closest = closestPlayer(next.position, availablePlayers)
  if (!next.attack && closest && closest.distance > SLIME_BOSS.melee.hitRadius + 1) {
    const position = moveToward(
      next.position,
      closest.position,
      SLIME_BOSS.chaseSpeed[next.phase - 1] ?? SLIME_BOSS.chaseSpeed[0],
      Math.min(Math.max(dt, 0), 0.25),
      SLIME_BOSS.arenaRadius,
      next.spawn,
    )
    if (position !== next.position) {
      next = { ...next, revision: next.revision + 1, position, stuckSince: 0 }
    } else if (closest.distance > SLIME_BOSS.attackRange) {
      const stuckSince = next.stuckSince || now
      if (now - stuckSince >= 8000) return resetBoss(next, 'stuck')
      if (stuckSince !== next.stuckSince) next = { ...next, revision: next.revision + 1, stuckSince }
    }
  }

  if (next.minions.length && availablePlayers.length) {
    const minions = next.minions.map((minion) => {
      const target = closestPlayer(minion.position, availablePlayers)
      if (!target) return minion
      return {
        ...minion,
        position: moveToward(
          minion.position,
          target.position,
          SLIME_BOSS.summons.speed,
          Math.min(Math.max(dt, 0), 0.25),
          SLIME_BOSS.arenaRadius + 4,
          next.spawn,
        ),
      }
    })
    next = { ...next, revision: next.revision + 1, minions }
  }

  if (next.attack && now >= next.attack.endsAt) {
    next = {
      ...next,
      revision: next.revision + 1,
      attack: null,
      nextAttackAt: now + SLIME_BOSS.shockwave.idleGapMs / (SLIME_BOSS.phaseSpeed[next.phase - 1] ?? 1),
    }
  }

  if (!next.attack && closest && closest.distance <= SLIME_BOSS.attackRange && now >= next.nextAttackAt) {
    next = startAttack(next, now, availablePlayers)
  }
  return next
}

export function getShockwaveRadius(attack, now = Date.now()) {
  if (!attack || attack.kind !== 'shockwave' || now < attack.jumpEndsAt || now >= attack.activeEndsAt) return 0
  const progress = (now - attack.jumpEndsAt) / Math.max(1, attack.activeEndsAt - attack.jumpEndsAt)
  return SLIME_BOSS.shockwave.maxRadius * Math.max(0, Math.min(1, progress))
}

export function getBossJumpOffset(attack, now = Date.now()) {
  if (!attack || attack.kind !== 'shockwave') return 0
  if (now < attack.telegraphEndsAt) {
    const progress = (now - attack.startedAt) / Math.max(1, attack.telegraphEndsAt - attack.startedAt)
    return -0.25 * Math.sin(Math.max(0, progress) * Math.PI)
  }
  if (now < attack.jumpEndsAt) {
    const progress = (now - attack.telegraphEndsAt) / Math.max(1, attack.jumpEndsAt - attack.telegraphEndsAt)
    return SLIME_BOSS.shockwave.jumpHeight * Math.sin(progress * Math.PI)
  }
  return 0
}

export function sanitizeBossSnapshot(value) {
  if (!value || typeof value !== 'object') return null
  if (!value.active) return createInactiveBossState({ revision: finite(value.revision, 0), resetReason: value.resetReason })
  if (!Array.isArray(value.spawn) || !Array.isArray(value.position)) return null
  return {
    ...createInactiveBossState(),
    ...value,
    active: true,
    hp: Math.max(0, Math.min(SLIME_BOSS.maxHp, finite(value.hp, SLIME_BOSS.maxHp))),
    maxHp: SLIME_BOSS.maxHp,
    phase: Math.max(1, Math.min(3, Math.floor(finite(value.phase, 1)))),
    spawn: safePosition(value.spawn),
    position: safePosition(value.position, value.spawn),
    hazards: Array.isArray(value.hazards) ? value.hazards.slice(0, 12) : [],
    minions: Array.isArray(value.minions)
      ? value.minions.slice(0, 12).map((minion) => {
        const kind = minion?.kind === 'blue' ? 'blue' : 'green'
        const maxHp = SLIME_BOSS.summons.maxHpByKind[kind]
        return {
          id: typeof minion?.id === 'string' ? minion.id.slice(0, 100) : `boss-minion-${kind}`,
          kind,
          position: safePosition(minion?.position, value.spawn),
          spawnedPhase: minion?.spawnedPhase === 3 ? 3 : 2,
          hp: Math.max(0, Math.min(maxHp, finite(minion?.hp, maxHp))),
          maxHp,
        }
      })
      : [],
    summonedPhases: Array.isArray(value.summonedPhases) ? value.summonedPhases.filter((phase) => phase === 2 || phase === 3) : [],
    lastDamagedAt: finite(value.lastDamagedAt, Date.now()),
  }
}

export function getBossSpawnForAltar(altar, getHeight = () => 0) {
  const [x = 0, , z = 0] = altar?.position ?? []
  const angle = finite(altar?.rotationY)
  const sx = x + Math.sin(angle) * SLIME_BOSS.spawnForwardOffset
  const sz = z + Math.cos(angle) * SLIME_BOSS.spawnForwardOffset
  return [sx, finite(getHeight(sx, sz)), sz]
}
