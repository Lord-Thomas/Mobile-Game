import { describe, expect, it } from 'vitest'
import { nearestBirdFood, nearestFeedingBird } from './birdFeeding'
const food = { id: 'seed', from: [0, 0, 0] }
describe('ground-only bird feeding', () => {
  it('ignores food during flight, takeoff and landing', () => {
    for (const y of [14, 1, 0.03]) {
      expect(nearestBirdFood([food], { x: 0, y, z: 0 }, new Set(), false)).toBe(null)
    }
  })
  it('detects nearby food only while grounded', () => {
    expect(nearestBirdFood([food], { x: 2, z: 0 }, new Set(), true)).toBe(food)
    expect(nearestBirdFood([food], { x: 3.1, z: 0 }, new Set(), true)).toBe(null)
  })
  it('selects a grounded bird over a flying bird directly above food', () => {
    const birds = new Map([
      ['primary', { position: { x: 0, z: 0 }, grounded: false }],
      ['flock-2', { position: { x: 2, z: 0 }, grounded: true }],
    ])
    expect(nearestFeedingBird(birds, [food])).toBe('flock-2')
    birds.get('flock-2').grounded = false
    expect(nearestFeedingBird(birds, [food])).toBe(null)
  })
  it('ignores removed or consumed food', () => {
    expect(nearestBirdFood([], { x: 0, z: 0 }, new Set(), true)).toBe(null)
    expect(nearestBirdFood([food], { x: 0, z: 0 }, new Set([food.id]), true)).toBe(null)
  })
})
