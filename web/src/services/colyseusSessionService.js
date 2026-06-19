import { Client } from 'colyseus.js'

const DEFAULT_COLYSEUS_PORT = 2567

function getDefaultColyseusUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${protocol}://${window.location.hostname}:${DEFAULT_COLYSEUS_PORT}`
}

export function getColyseusUrl() {
  return import.meta.env.VITE_COLYSEUS_URL || getDefaultColyseusUrl()
}

export function getColyseusConnectionLabel() {
  try {
    return new URL(getColyseusUrl()).host
  } catch {
    return getColyseusUrl()
  }
}

export async function connectColyseusVisitSession({
  session,
  user,
  role,
  displayName,
  onRemotePlayerState,
  onRemoteBallState,
  onGuestKick,
  onChatMessage,
  onWorldState,
  onCoinGain,
  onPlayerLeft,
  onStatusChange,
  onServerTimeOffsetChange,
}) {
  if (!session?.id || !user?.id || role === 'solo') return null

  const client = new Client(getColyseusUrl())
  const room = await client.joinOrCreate('visit_room', {
    sessionId: session.id,
    hostUserId: session.hostUserId,
    guestUserId: session.guestUserId,
    userId: user.id,
    role,
    displayName,
  })

  onStatusChange?.('connected')
  let pingIntervalId = null

  const sendTimePing = () => {
    room.send('time-ping', {
      pingId: `${user.id}-${Date.now()}`,
      clientSentAt: Date.now(),
    })
  }

  room.onMessage('joined', () => onStatusChange?.('connected'))
  room.onMessage('time-pong', (message) => {
    if (!message?.clientSentAt || !message?.serverTime) return
    const now = Date.now()
    const rtt = Math.max(0, now - message.clientSentAt)
    onServerTimeOffsetChange?.(message.serverTime + rtt * 0.5 - now)
  })
  room.onMessage('player-state', (message) => onRemotePlayerState?.(message))
  room.onMessage('ball-state', (message) => onRemoteBallState?.(message))
  room.onMessage('guest-kick', (message) => onGuestKick?.(message))
  room.onMessage('chat-message', (message) => {
    if (message?.userId !== user.id) onChatMessage?.(message)
  })
  room.onMessage('world-state', (message) => {
    if (message?.userId !== user.id) onWorldState?.(message)
  })
  room.onMessage('coin-gain', (message) => {
    if (message?.userId !== user.id) onCoinGain?.(message)
  })
  room.onMessage('player-left', (message) => onPlayerLeft?.(message))
  room.onLeave(() => onStatusChange?.('closed'))
  room.onError(() => onStatusChange?.('error'))
  sendTimePing()
  pingIntervalId = window.setInterval(sendTimePing, 2000)

  return {
    room,
    disconnect: () => {
      if (pingIntervalId) window.clearInterval(pingIntervalId)
      room.leave(false)
    },
    sendPlayerState: (payload) => room.send('player-state', payload),
    sendBallState: (payload) => room.send('ball-state', payload),
    sendGuestKick: (payload) => room.send('guest-kick', payload),
    sendCoinGain: (payload) => room.send('coin-gain', payload),
    sendChatMessage: (text) => room.send('chat-message', { text }),
    sendWorldState: (snapshot) => room.send('world-state', { snapshot }),
    sendSessionEnded: () => room.leave(true),
  }
}
