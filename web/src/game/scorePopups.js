function getPopupExpiry(popup) {
  const expiry = Number(popup?.startAt) + Number(popup?.duration)
  return Number.isFinite(expiry) ? expiry : 0
}

export function getNextScorePopupExpiry(popups) {
  if (!Array.isArray(popups) || popups.length === 0) return null
  return popups.reduce(
    (nextExpiry, popup) => Math.min(nextExpiry, getPopupExpiry(popup)),
    Infinity,
  )
}

export function pruneExpiredScorePopups(popups, now) {
  if (!Array.isArray(popups) || popups.length === 0) return popups
  const remaining = popups.filter((popup) => now < getPopupExpiry(popup))
  return remaining.length === popups.length ? popups : remaining
}
