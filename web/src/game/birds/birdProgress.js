export const BIRD_TRUST_MAX = 3
export const BIRD_BOND_MAX = 5

export function normalizeBirdProgress(raw) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const adopted = Boolean(source.adopted)
  const trust = adopted
    ? BIRD_TRUST_MAX
    : Math.max(0, Math.min(BIRD_TRUST_MAX, Math.floor(Number(source.trust) || 0)))
  return {
    adopted,
    active: adopted && source.active !== false,
    trust,
    bond: adopted
      ? Math.max(0, Math.min(BIRD_BOND_MAX, Math.floor(Number(source.bond) || 0)))
      : 0,
  }
}

export function gainBirdTrust(raw) {
  const current = normalizeBirdProgress(raw)
  if (current.adopted) return current
  return { ...current, trust: Math.min(BIRD_TRUST_MAX, current.trust + 1) }
}

export function adoptBird(raw) {
  const current = normalizeBirdProgress(raw)
  if (current.trust < BIRD_TRUST_MAX) return current
  return { ...current, adopted: true, active: true, trust: BIRD_TRUST_MAX }
}

export function gainBirdBond(raw) {
  const current = normalizeBirdProgress(raw)
  if (!current.adopted) return current
  return { ...current, bond: Math.min(BIRD_BOND_MAX, current.bond + 1) }
}
