export const WORLD_LOADING_TIPS = Object.freeze([
  'Le slime rouge est beaucoup moins sympathique qu’il en a l’air.',
  'Une roulade bien synchronisée évite les coups, mais pas les ondes au sol.',
  'Les meubles proches sont préparés avant que la maison apparaisse.',
  'Les ennemis peuvent laisser tomber des matériaux utiles après leur défaite.',
  'Certaines attaques se contrent en sautant plutôt qu’en esquivant.',
  'L’extérieur est préparé pendant que tu explores encore la maison.',
])

export function clampLoadingPercent(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 0
  return Math.min(100, Math.max(0, Math.round(number)))
}

export function createLoadingExperience({
  kind = 'initial',
  percent = 0,
  phase = 'Connexion au monde...',
} = {}) {
  return {
    kind: kind === 'transition' ? 'transition' : 'initial',
    percent: clampLoadingPercent(percent),
    phase: String(phase || 'Préparation du monde...'),
  }
}

export function advanceLoadingExperience(current, next) {
  const normalized = createLoadingExperience({ ...current, ...next })
  if (normalized.kind !== current.kind) return normalized
  return {
    ...normalized,
    percent: Math.max(clampLoadingPercent(current.percent), normalized.percent),
  }
}
