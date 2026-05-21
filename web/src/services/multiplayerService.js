import { isSupabaseConfigured, supabase } from '../lib/supabase'

const ONLINE_CHANNEL = 'online-players'
const PRESENCE_REFRESH_MS = 25_000

function nowIso() {
  return new Date().toISOString()
}

function getDisplayName(user, fallback = 'Joueur') {
  return (
    user?.user_metadata?.display_name ||
    user?.email?.split('@')[0] ||
    fallback
  )
}

function flattenPresenceState(state, currentUserId) {
  const players = []

  Object.entries(state ?? {}).forEach(([presenceKey, presences]) => {
    const latest = presences?.[presences.length - 1]
    if (!latest?.userId || latest.userId === currentUserId) return
    players.push({
      presenceKey,
      userId: latest.userId,
      displayName: latest.displayName || 'Joueur',
      status: latest.status || 'available',
      onlineAt: latest.onlineAt,
    })
  })

  return players.sort((a, b) => a.displayName.localeCompare(b.displayName))
}

export function isMultiplayerAvailable() {
  return Boolean(isSupabaseConfigured && supabase)
}

export function createVisitRequest({ fromUser, toUserId }) {
  return {
    id: `${fromUser.id}-${toUserId}-${Date.now()}`,
    fromUserId: fromUser.id,
    fromDisplayName: getDisplayName(fromUser),
    toUserId,
    createdAt: nowIso(),
  }
}

export function createSessionFromRequest(request) {
  return {
    id: `visit-${request.id}`,
    hostUserId: request.toUserId,
    guestUserId: request.fromUserId,
    hostDisplayName: request.toDisplayName || 'Hote',
    guestDisplayName: request.fromDisplayName || 'Visiteur',
    createdAt: nowIso(),
  }
}

export function connectOnlinePresence({
  user,
  displayName,
  status = 'available',
  onPlayers,
  onVisitRequest,
  onVisitResponse,
  onSessionEnded,
}) {
  if (!isMultiplayerAvailable() || !user) {
    onPlayers?.([])
    return { disconnect: () => {}, sendVisitRequest: async () => false, sendVisitResponse: async () => false }
  }

  const channel = supabase.channel(ONLINE_CHANNEL, {
    config: {
      broadcast: { self: false },
      presence: { key: user.id },
    },
  })

  const presencePayload = () => ({
    userId: user.id,
    displayName: displayName || getDisplayName(user),
    status,
    onlineAt: nowIso(),
  })

  const syncPlayers = () => {
    onPlayers?.(flattenPresenceState(channel.presenceState(), user.id))
  }

  channel
    .on('presence', { event: 'sync' }, syncPlayers)
    .on('broadcast', { event: 'visit-request' }, ({ payload }) => {
      if (payload?.toUserId === user.id) onVisitRequest?.(payload)
    })
    .on('broadcast', { event: 'visit-response' }, ({ payload }) => {
      if (payload?.toUserId === user.id) onVisitResponse?.(payload)
    })
    .on('broadcast', { event: 'session-ended' }, ({ payload }) => {
      if (payload?.toUserId === user.id || payload?.hostUserId === user.id || payload?.guestUserId === user.id) {
        onSessionEnded?.(payload)
      }
    })
    .subscribe(async (subscribeStatus) => {
      if (subscribeStatus === 'SUBSCRIBED') {
        await channel.track(presencePayload())
        syncPlayers()
      }
    })

  const refreshId = window.setInterval(() => {
    channel.track(presencePayload())
  }, PRESENCE_REFRESH_MS)

  return {
    disconnect: () => {
      window.clearInterval(refreshId)
      supabase.removeChannel(channel)
    },
    sendVisitRequest: (request) =>
      channel.send({ type: 'broadcast', event: 'visit-request', payload: request }),
    sendVisitResponse: (response) =>
      channel.send({ type: 'broadcast', event: 'visit-response', payload: response }),
    sendSessionEnded: (payload) =>
      channel.send({ type: 'broadcast', event: 'session-ended', payload }),
  }
}

export function connectMultiplayerSession({
  sessionId,
  userId,
  role,
  onRemotePlayerState,
  onRemoteBallState,
  onGuestKick,
  onSessionEnded,
  onStatusChange,
  onHostTimeOffsetChange,
}) {
  if (!isMultiplayerAvailable() || !sessionId || !userId) {
    return {
      disconnect: () => {},
      sendPlayerState: async () => false,
      sendBallState: async () => false,
      sendGuestKick: async () => false,
      sendSessionEnded: async () => false,
    }
  }

  const channel = supabase.channel(`session:${sessionId}`, {
    config: { broadcast: { self: false } },
  })
  let isSubscribed = false
  let timePingIntervalId = null
  const pendingMessages = []

  const flushPendingMessages = () => {
    if (!isSubscribed) return
    while (pendingMessages.length) {
      const message = pendingMessages.shift()
      channel.send(message)
    }
  }

  const sendWhenReady = (message) => {
    if (!isSubscribed) {
      pendingMessages.push(message)
      return Promise.resolve(false)
    }
    return channel.send(message)
  }

  channel
    .on('broadcast', { event: 'player-state' }, ({ payload }) => {
      if (payload?.userId !== userId) onRemotePlayerState?.(payload)
    })
    .on('broadcast', { event: 'ball-state' }, ({ payload }) => {
      if (role === 'guest') onRemoteBallState?.(payload)
    })
    .on('broadcast', { event: 'guest-kick' }, ({ payload }) => {
      if (role === 'host' && payload?.userId !== userId) onGuestKick?.(payload)
    })
    .on('broadcast', { event: 'time-ping' }, ({ payload }) => {
      if (role !== 'host' || !payload?.pingId) return
      sendWhenReady({
        type: 'broadcast',
        event: 'time-pong',
        payload: {
          pingId: payload.pingId,
          toUserId: payload.userId,
          clientSentAt: payload.clientSentAt,
          hostTime: Date.now(),
        },
      })
    })
    .on('broadcast', { event: 'time-pong' }, ({ payload }) => {
      if (role !== 'guest' || payload?.toUserId !== userId || !payload?.clientSentAt || !payload?.hostTime) return
      const now = Date.now()
      const rtt = Math.max(0, now - payload.clientSentAt)
      const offset = payload.hostTime + rtt * 0.5 - now
      onHostTimeOffsetChange?.(offset)
    })
    .on('broadcast', { event: 'session-ended' }, ({ payload }) => {
      onSessionEnded?.(payload)
    })
    .subscribe((subscribeStatus) => {
      if (subscribeStatus === 'SUBSCRIBED') {
        isSubscribed = true
        onStatusChange?.('connected')
        flushPendingMessages()
        channel.send({
          type: 'broadcast',
          event: 'player-ready',
          payload: { userId, role, sentAt: Date.now() },
        })
        if (role === 'guest') {
          const sendPing = () => {
            sendWhenReady({
              type: 'broadcast',
              event: 'time-ping',
              payload: {
                pingId: `${userId}-${Date.now()}`,
                userId,
                clientSentAt: Date.now(),
              },
            })
          }
          sendPing()
          timePingIntervalId = window.setInterval(sendPing, 5000)
        }
        return
      }

      if (subscribeStatus === 'CHANNEL_ERROR' || subscribeStatus === 'TIMED_OUT' || subscribeStatus === 'CLOSED') {
        isSubscribed = false
        onStatusChange?.('error')
      }
    })

  return {
    disconnect: () => {
      isSubscribed = false
      if (timePingIntervalId) window.clearInterval(timePingIntervalId)
      pendingMessages.length = 0
      supabase.removeChannel(channel)
    },
    sendPlayerState: (payload) =>
      sendWhenReady({ type: 'broadcast', event: 'player-state', payload: { ...payload, userId } }),
    sendBallState: (payload) =>
      sendWhenReady({ type: 'broadcast', event: 'ball-state', payload }),
    sendGuestKick: (payload) =>
      sendWhenReady({ type: 'broadcast', event: 'guest-kick', payload: { ...payload, userId } }),
    sendSessionEnded: (payload) =>
      sendWhenReady({ type: 'broadcast', event: 'session-ended', payload }),
  }
}
