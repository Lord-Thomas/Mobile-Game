import { Client } from 'colyseus.js'

const DEFAULT_COLYSEUS_PORT = 2567

function getDefaultColyseusUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${protocol}://${window.location.hostname}:${DEFAULT_COLYSEUS_PORT}`
}

export function getColyseusUrl() {
  return import.meta.env.VITE_COLYSEUS_URL || getDefaultColyseusUrl()
}

export async function connectColyseusVisitSession({
  session,
  user,
  role,
  displayName,
  onRemotePlayerState,
  onRemoteBallState,
  onGuestKick,
  onPlayerLeft,
  onStatusChange,
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

  room.onMessage('joined', () => onStatusChange?.('connected'))
  room.onMessage('player-state', (message) => onRemotePlayerState?.(message))
  room.onMessage('ball-state', (message) => onRemoteBallState?.(message))
  room.onMessage('guest-kick', (message) => onGuestKick?.(message))
  room.onMessage('player-left', (message) => onPlayerLeft?.(message))
  room.onLeave(() => onStatusChange?.('closed'))
  room.onError(() => onStatusChange?.('error'))

  return {
    room,
    disconnect: () => room.leave(false),
    sendPlayerState: (payload) => room.send('player-state', payload),
    sendBallState: (payload) => room.send('ball-state', payload),
    sendGuestKick: (payload) => room.send('guest-kick', payload),
    sendSessionEnded: () => room.leave(true),
  }
}
