import { describe, expect, it } from 'vitest'
import { haveSameMobIds, resolveMobResidentIds } from './mobStreaming'

const slots = [
  { id: 'near', spawnPosition: [20, 0, 0] },
  { id: 'edge', spawnPosition: [120, 0, 0] },
  { id: 'far', spawnPosition: [160, 0, 0] },
]

describe('resolveMobResidentIds', () => {
  it('mounts only slots inside the entry radius', () => {
    const result = resolveMobResidentIds({
      slots,
      currentIds: new Set(),
      requiredIds: new Set(),
      players: [{ position: [0, 0, 0] }],
    })
    expect([...result]).toEqual(['near'])
  })

  it('uses a wider exit radius to prevent mount thrashing', () => {
    const result = resolveMobResidentIds({
      slots,
      currentIds: new Set(['edge']),
      requiredIds: new Set(),
      players: [{ position: [0, 0, 0] }],
    })
    expect(result.has('edge')).toBe(true)
  })

  it('keeps required and temporarily protected slots resident', () => {
    const result = resolveMobResidentIds({
      slots,
      currentIds: new Set(['far']),
      requiredIds: new Set(['edge']),
      players: [{ position: [0, 0, 0] }],
      canEvict: (id) => id !== 'far',
    })
    expect([...result].sort()).toEqual(['edge', 'far', 'near'])
  })

  it('uses the closest active player', () => {
    const result = resolveMobResidentIds({
      slots,
      currentIds: new Set(),
      requiredIds: new Set(),
      players: [{ position: [500, 0, 0] }, { position: [150, 0, 0] }],
    })
    expect(result.has('far')).toBe(true)
  })

  it('respects per-refresh mount and unmount budgets', () => {
    const result = resolveMobResidentIds({
      slots,
      currentIds: new Set(['edge', 'far']),
      requiredIds: new Set(),
      players: [{ position: [20, 0, 0] }],
      distances: { enter: 25, exit: 50 },
      maxAdds: 1,
      maxRemovals: 1,
    })
    expect(result.has('near')).toBe(true)
    expect([...result].filter((id) => id === 'edge' || id === 'far')).toHaveLength(1)
  })

  it('prioritizes the closest additions and farthest removals', () => {
    const result = resolveMobResidentIds({
      slots: [
        { id: 'far-add', spawnPosition: [40, 0, 0] },
        { id: 'near-add', spawnPosition: [10, 0, 0] },
        { id: 'near-remove', spawnPosition: [80, 0, 0] },
        { id: 'far-remove', spawnPosition: [120, 0, 0] },
      ],
      currentIds: new Set(['near-remove', 'far-remove']),
      requiredIds: new Set(),
      players: [{ position: [0, 0, 0] }],
      distances: { enter: 50, exit: 60 },
      maxAdds: 1,
      maxRemovals: 1,
    })
    expect(result.has('near-add')).toBe(true)
    expect(result.has('far-add')).toBe(false)
    expect(result.has('near-remove')).toBe(true)
    expect(result.has('far-remove')).toBe(false)
  })
})

describe('haveSameMobIds', () => {
  it('compares sets independently of insertion order', () => {
    expect(haveSameMobIds(new Set(['a', 'b']), new Set(['b', 'a']))).toBe(true)
    expect(haveSameMobIds(new Set(['a']), new Set(['a', 'b']))).toBe(false)
  })
})
