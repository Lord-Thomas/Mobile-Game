import { describe, expect, it } from 'vitest'
import { evaluateMetricAchievements } from './achievements'
import { TITLE_IDS, getTitleDefinition } from './titles'

describe('progression du Roi Slime', () => {
  it('débloque les hauts faits à une puis cinq victoires', () => {
    expect(evaluateMetricAchievements({ bossKills: 1 })).toContain('defeat_slime_king')
    expect(evaluateMetricAchievements({ bossKills: 1 })).not.toContain('defeat_slime_king_5')
    expect(evaluateMetricAchievements({ bossKills: 5 })).toEqual(expect.arrayContaining([
      'defeat_slime_king',
      'defeat_slime_king_5',
    ]))
  })

  it('expose le titre obtenu après cinq victoires', () => {
    expect(getTitleDefinition(TITLE_IDS.slimeKingSlayer)).toEqual(expect.objectContaining({
      name: 'Tueur du roi des slimes',
      local: true,
    }))
  })
})
