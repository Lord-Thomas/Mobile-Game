import { Room } from 'colyseus'

const MAX_CLIENTS = 2
const PLAYER_STATE_INTERVAL_MS = 50
const BALL_ACTIVE_INTERVAL_MS = 50
const BALL_IDLE_INTERVAL_MS = 200

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

function sanitizePlayerState(message, client, player) {
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

function sanitizeImpulse(message) {
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

export class VisitRoom extends Room {
  maxClients = MAX_CLIENTS

  onCreate(options) {
    this.sessionId = options.sessionId
    this.players = new Map()
    this.hostClient = null
    this.ballState = null
    this.pendingPlayerStates = new Map()
    this.pendingBallState = null
    this.lastPlayerBroadcastAt = 0
    this.lastBallBroadcastAt = 0

    this.setMetadata({
      sessionId: this.sessionId,
      hostUserId: options.hostUserId,
      guestUserId: options.guestUserId,
    })

    this.setSimulationInterval(() => this.flushNetworkState(), 1000 / 30)

    this.onMessage('player-state', (client, message) => this.handlePlayerState(client, message))
    this.onMessage('ball-state', (client, message) => this.handleBallState(client, message))
    this.onMessage('guest-kick', (client, message) => this.handleGuestKick(client, message))
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
    }

    this.players.set(client.sessionId, player)
    if (role === 'host') this.hostClient = client

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
  }

  onLeave(client) {
    const player = this.players.get(client.sessionId)
    this.players.delete(client.sessionId)
    if (this.hostClient?.sessionId === client.sessionId) this.hostClient = null

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
    this.pendingPlayerStates.set(client.sessionId, state)
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

  flushNetworkState() {
    const time = now()
    if (this.pendingPlayerStates.size && time - this.lastPlayerBroadcastAt >= PLAYER_STATE_INTERVAL_MS) {
      this.pendingPlayerStates.forEach((state, sessionId) => {
        this.broadcast('player-state', state, { except: this.clients.find((client) => client.sessionId === sessionId) })
      })
      this.pendingPlayerStates.clear()
      this.lastPlayerBroadcastAt = time
    }

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
