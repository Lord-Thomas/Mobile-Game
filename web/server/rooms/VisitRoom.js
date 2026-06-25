import { Room } from 'colyseus'

const MAX_CLIENTS = 2
const PLAYER_STATE_INTERVAL_MS = 50
const PLAYER_ACTIVE_GRACE_MS = 220
const BALL_ACTIVE_INTERVAL_MS = 50
const BALL_IDLE_INTERVAL_MS = 200
const CHAT_MAX_LENGTH = 120
const APPEARANCE_COLOR_KEYS = [
  'skinColor',
  'hairColor',
  'eyeColor',
  'eyebrowsColor',
  'shirtColor',
  'pantsColor',
  'pantsDetailsColor',
  'shoesColor',
  'socksColor',
]

function now() {
  return Date.now()
}

function isFiniteNumber(value) {
  return Number.isFinite(Number(value))
}

function isVector(value, length = 3) {
  return Array.isArray(value) && value.length === length && value.every(isFiniteNumber)
}

function sanitizeVector(value, fallback = [0, 0, 0]) {
  return isVector(value) ? value.map((entry) => Number(entry)) : fallback
}

function sanitizeMount(value) {
  if (!value || typeof value !== 'object') return null

  const id = typeof value.id === 'string' ? value.id.trim().slice(0, 40) : ''
  if (!id || !isVector(value.position)) return null

  return {
    id,
    position: sanitizeVector(value.position),
    yaw: isFiniteNumber(value.yaw) ? Number(value.yaw) : 0,
    airborne: Boolean(value.airborne),
    moving: Boolean(value.moving),
    movingForward: Boolean(value.movingForward),
    jumping: Boolean(value.jumping),
  }
}

function sanitizeCharacterAppearance(value) {
  if (!value || typeof value !== 'object') return null

  const appearance = {}
  APPEARANCE_COLOR_KEYS.forEach((key) => {
    if (typeof value[key] === 'string' && /^#[0-9a-f]{6}$/i.test(value[key])) {
      appearance[key] = value[key]
    }
  })
  appearance.goldCoat = Boolean(value.goldCoat)
  appearance.auraEquipped = Boolean(value.auraEquipped)
  return appearance
}

function sanitizeEquippedWeapon(value) {
  return value === 'magic_book' ? 'magic_book' : null
}

function sanitizeCatState(value) {
  if (!value || typeof value !== 'object' || !isVector(value.position)) return null

  return {
    position: sanitizeVector(value.position),
    rotationY: isFiniteNumber(value.rotationY) ? Number(value.rotationY) : 0,
    motion: typeof value.motion === 'string' ? value.motion.slice(0, 24) : 'Idle',
  }
}

function sanitizePlayerState(message, client, player) {
  const equippedTitleId = typeof message?.equippedTitleId === 'string'
    ? message.equippedTitleId.slice(0, 80)
    : null

  return {
    seq: Number.isFinite(message?.seq) ? message.seq : player.lastSeq + 1,
    serverTime: now(),
    userId: player.userId,
    sessionId: client.sessionId,
    displayName: player.displayName,
    role: player.role,
    position: sanitizeVector(message?.position, player.position),
    rotationY: isFiniteNumber(message?.rotationY) ? Number(message.rotationY) : player.rotationY,
    velocity: sanitizeVector(message?.velocity),
    grounded: Boolean(message?.grounded ?? true),
    motion: typeof message?.motion === 'string' ? message.motion.slice(0, 32) : 'idle',
    zone: typeof message?.zone === 'string' ? message.zone.slice(0, 32) : 'interior',
    mount: sanitizeMount(message?.mount),
    catActive: Boolean(message?.catActive),
    cat: sanitizeCatState(message?.cat),
    equippedWeapon: sanitizeEquippedWeapon(message?.equippedWeapon),
    equippedTitleId,
    characterAppearance: sanitizeCharacterAppearance(message?.characterAppearance),
  }
}

function sanitizeBallState(message) {
  return {
    seq: Number.isFinite(message?.seq) ? message.seq : 0,
    serverTime: now(),
    position: sanitizeVector(message?.position, [0, 0.5, -1]),
    linvel: sanitizeVector(message?.linvel),
    angvel: sanitizeVector(message?.angvel),
  }
}

export function sanitizeImpulse(message) {
  const impulse = message?.impulse
  if (!impulse) return null

  const x = Number(impulse.x)
  const y = Number(impulse.y)
  const z = Number(impulse.z)
  if (![x, y, z].every(Number.isFinite)) return null

  return {
    x: Math.max(-0.4, Math.min(0.4, x)),
    y: Math.max(-0.1, Math.min(0.2, y)),
    z: Math.max(-0.4, Math.min(0.4, z)),
  }
}

export function sanitizeChatText(message) {
  if (typeof message?.text !== 'string') return ''
  return message.text.replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX_LENGTH)
}

export function sanitizeCoinGain(message) {
  const delta = Number(message?.delta)
  if (!Number.isFinite(delta) || delta <= 0 || delta > 10000) return null

  return {
    id: typeof message?.id === 'string' ? message.id.slice(0, 80) : `${now()}`,
    delta: Math.floor(delta),
    reason: typeof message?.reason === 'string' ? message.reason.slice(0, 40) : 'reward',
    position: isVector(message?.position) ? sanitizeVector(message.position) : null,
  }
}

export function sanitizeSpellCast(message) {
  if (!message || typeof message !== 'object') return null
  if (message.kind !== 'fireball') return null
  if (!isVector(message.position) || !isVector(message.direction, 2)) return null

  const direction = sanitizeVector(message.direction, [0, -1]).slice(0, 2)
  const length = Math.hypot(direction[0], direction[1])
  if (length < 0.001) return null

  return {
    id: typeof message.id === 'string' ? message.id.slice(0, 80) : `${now()}`,
    kind: 'fireball',
    position: sanitizeVector(message.position),
    direction: [direction[0] / length, direction[1] / length],
    startedAt: isFiniteNumber(message.startedAt) ? Number(message.startedAt) : null,
    sentAt: isFiniteNumber(message.sentAt) ? Number(message.sentAt) : null,
    phase: isFiniteNumber(message.phase) ? Number(message.phase) : 0,
  }
}

export class VisitRoom extends Room {
  maxClients = MAX_CLIENTS

  onCreate(options) {
    this.sessionId = options.sessionId
    this.players = new Map()
    this.hostClient = null
    this.ballState = null
    this.pendingBallState = null
    this.lastBallBroadcastAt = 0
    this.chatSeq = 0
    this.worldSeq = 0
    this.latestWorldState = null

    this.setMetadata({
      sessionId: this.sessionId,
      hostUserId: options.hostUserId,
      guestUserId: options.guestUserId,
    })

    console.log(`[colyseus] room created session=${this.sessionId}`)

    this.setSimulationInterval(() => this.flushNetworkState(), 1000 / 30)

    this.onMessage('player-state', (client, message) => this.handlePlayerState(client, message))
    this.onMessage('ball-state', (client, message) => this.handleBallState(client, message))
    this.onMessage('guest-kick', (client, message) => this.handleGuestKick(client, message))
    this.onMessage('chat-message', (client, message) => this.handleChatMessage(client, message))
    this.onMessage('world-state', (client, message) => this.handleWorldState(client, message))
    this.onMessage('coin-gain', (client, message) => this.handleCoinGain(client, message))
    this.onMessage('spell-cast', (client, message) => this.handleSpellCast(client, message))
    this.onMessage('time-ping', (client, message) => {
      client.send('time-pong', {
        pingId: message?.pingId,
        clientSentAt: message?.clientSentAt,
        serverTime: now(),
      })
    })
  }

  onJoin(client, options) {
    const role = options.role === 'host' ? 'host' : 'guest'
    const player = {
      userId: options.userId || client.sessionId,
      displayName: options.displayName || (role === 'host' ? 'Hote' : 'Visiteur'),
      role,
      lastSeq: -1,
      position: [0, 0.42, 2.2],
      rotationY: 0,
      velocity: [0, 0, 0],
      grounded: true,
      motion: 'idle',
      zone: 'interior',
      mount: null,
      catActive: false,
      cat: null,
      equippedWeapon: null,
      equippedTitleId: null,
      characterAppearance: null,
      lastUpdateAt: 0,
      lastBroadcastAt: 0,
    }

    this.players.set(client.sessionId, player)
    if (role === 'host') this.hostClient = client

    console.log(`[colyseus] join session=${this.sessionId} role=${role} user=${player.userId}`)

    client.send('joined', {
      sessionId: this.sessionId,
      roomId: this.roomId,
      serverTime: now(),
      role,
    })

    this.broadcast('player-joined', {
      sessionId: client.sessionId,
      userId: player.userId,
      displayName: player.displayName,
      role,
      serverTime: now(),
    }, { except: client })

    if (role === 'guest' && this.latestWorldState) {
      client.send('world-state', this.latestWorldState)
    }
  }

  onLeave(client) {
    const player = this.players.get(client.sessionId)
    this.players.delete(client.sessionId)
    if (this.hostClient?.sessionId === client.sessionId) this.hostClient = null

    console.log(`[colyseus] leave session=${this.sessionId} role=${player?.role ?? 'unknown'} user=${player?.userId ?? client.sessionId}`)

    this.broadcast('player-left', {
      sessionId: client.sessionId,
      userId: player?.userId,
      role: player?.role,
      serverTime: now(),
    })
  }

  handlePlayerState(client, message) {
    const player = this.players.get(client.sessionId)
    if (!player) return

    const seq = Number.isFinite(message?.seq) ? message.seq : player.lastSeq + 1
    if (seq <= player.lastSeq) return

    const state = sanitizePlayerState({ ...message, seq }, client, player)
    player.lastSeq = seq
    player.position = state.position
    player.rotationY = state.rotationY
    player.velocity = state.velocity
    player.grounded = state.grounded
    player.motion = state.motion
    player.zone = state.zone
    player.mount = state.mount
    player.catActive = state.catActive
    player.cat = state.cat
    player.equippedWeapon = state.equippedWeapon
    player.equippedTitleId = state.equippedTitleId
    player.characterAppearance = state.characterAppearance
    player.lastUpdateAt = now()
  }

  handleBallState(client, message) {
    const player = this.players.get(client.sessionId)
    if (player?.role !== 'host') return
    this.pendingBallState = sanitizeBallState(message)
    this.ballState = this.pendingBallState
  }

  handleGuestKick(client, message) {
    const player = this.players.get(client.sessionId)
    if (player?.role !== 'guest' || !this.hostClient) return

    const impulse = sanitizeImpulse(message)
    if (!impulse) return

    this.hostClient.send('guest-kick', {
      seq: Number.isFinite(message?.seq) ? message.seq : 0,
      serverTime: now(),
      userId: player.userId,
      impulse,
      kind: message?.kind === 'body-push' ? 'body-push' : 'kick',
    })
  }

  handleChatMessage(client, message) {
    const player = this.players.get(client.sessionId)
    if (!player) return

    const text = sanitizeChatText(message)
    if (!text) return

    this.chatSeq += 1
    this.broadcast('chat-message', {
      id: `${this.roomId}-${this.chatSeq}`,
      seq: this.chatSeq,
      serverTime: now(),
      userId: player.userId,
      sessionId: client.sessionId,
      displayName: player.displayName,
      role: player.role,
      text,
    })
  }

  handleWorldState(client, message) {
    const player = this.players.get(client.sessionId)
    if (player?.role !== 'host' || !message?.snapshot || typeof message.snapshot !== 'object') return

    this.worldSeq += 1
    this.latestWorldState = {
      seq: this.worldSeq,
      serverTime: now(),
      userId: player.userId,
      sessionId: client.sessionId,
      snapshot: message.snapshot,
    }

    this.broadcast('world-state', this.latestWorldState, { except: client })
  }

  handleCoinGain(client, message) {
    const player = this.players.get(client.sessionId)
    if (!player) return

    const gain = sanitizeCoinGain(message)
    if (!gain) return

    this.broadcast('coin-gain', {
      ...gain,
      serverTime: now(),
      userId: player.userId,
      sessionId: client.sessionId,
      displayName: player.displayName,
      role: player.role,
    }, { except: client })
  }

  handleSpellCast(client, message) {
    const player = this.players.get(client.sessionId)
    if (!player) return

    const spell = sanitizeSpellCast(message)
    if (!spell) return

    this.broadcast('spell-cast', {
      ...spell,
      serverTime: now(),
      userId: player.userId,
      sessionId: client.sessionId,
      displayName: player.displayName,
      role: player.role,
    }, { except: client })
  }

  flushNetworkState() {
    const time = now()
    this.players.forEach((player, sessionId) => {
      const sourceClient = this.clients.find((client) => client.sessionId === sessionId)
      if (!sourceClient) return
      if (time - player.lastBroadcastAt < PLAYER_STATE_INTERVAL_MS) return
      if (time - player.lastUpdateAt > PLAYER_ACTIVE_GRACE_MS && player.motion === 'idle') return

      this.broadcast('player-state', {
        seq: player.lastSeq,
        serverTime: time,
        userId: player.userId,
        sessionId,
        displayName: player.displayName,
        role: player.role,
        position: player.position,
        rotationY: player.rotationY,
        velocity: player.velocity,
        grounded: player.grounded,
        motion: player.motion,
        zone: player.zone,
        mount: player.mount,
        catActive: player.catActive,
        cat: player.cat,
        equippedWeapon: player.equippedWeapon,
        equippedTitleId: player.equippedTitleId,
        characterAppearance: player.characterAppearance,
      }, { except: sourceClient })
      player.lastBroadcastAt = time
    })

    if (!this.pendingBallState) return

    const speed = Math.hypot(
      this.pendingBallState.linvel[0],
      this.pendingBallState.linvel[1],
      this.pendingBallState.linvel[2],
    )
    const interval = speed > 0.08 ? BALL_ACTIVE_INTERVAL_MS : BALL_IDLE_INTERVAL_MS

    if (time - this.lastBallBroadcastAt >= interval) {
      this.broadcast('ball-state', this.pendingBallState, { except: this.hostClient ?? undefined })
      this.pendingBallState = null
      this.lastBallBroadcastAt = time
    }
  }
}
