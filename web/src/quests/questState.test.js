import { describe, expect, it } from 'vitest'
import {
  NPC_MARKER,
  QUEST_STATUS,
  completeQuest,
  getJournalQuests,
  getNpcMarker,
  getObjectiveProgress,
  getQuestStatus,
  isReadyToComplete,
  normalizeQuestProgress,
  registerKill,
  startQuest,
} from './questState'
import { FIRST_QUEST_ID } from './questDefinitions'

const Q = FIRST_QUEST_ID

describe('questState', () => {
  it('considère une quête absente comme non commencée', () => {
    expect(getQuestStatus({}, Q)).toBe(QUEST_STATUS.NOT_STARTED)
    expect(getNpcMarker({}, Q)).toBe(NPC_MARKER.AVAILABLE)
  })

  it('compatibilité descendante : entrée invalide → état vide', () => {
    expect(normalizeQuestProgress(null)).toEqual({})
    expect(normalizeQuestProgress([1, 2, 3])).toEqual({})
    expect(normalizeQuestProgress({ unknown_quest: { status: 'active' } })).toEqual({})
  })

  it('démarre une quête avec des compteurs à zéro et est idempotent', () => {
    const started = startQuest({}, Q)
    expect(started[Q].status).toBe('active')
    expect(started[Q].counts).toEqual({ skeleton: 0, mushroom: 0 })
    expect(getQuestStatus(started, Q)).toBe(QUEST_STATUS.ACTIVE)
    expect(getNpcMarker(started, Q)).toBe(NPC_MARKER.IN_PROGRESS)

    started[Q].counts.skeleton = 5
    const reStarted = startQuest(started, Q)
    expect(reStarted[Q].counts.skeleton).toBe(5) // pas de reset
  })

  it("n'incrémente pas une quête non démarrée", () => {
    const after = registerKill({}, 'skeleton')
    expect(after).toEqual({})
  })

  it('incrémente le bon type de monstre sans dépasser l’objectif', () => {
    let progress = startQuest({}, Q)
    for (let i = 0; i < 12; i += 1) progress = registerKill(progress, 'skeleton')
    expect(progress[Q].counts.skeleton).toBe(10) // plafonné à goal
    expect(progress[Q].counts.mushroom).toBe(0)
    expect(getObjectiveProgress(progress, Q)).toEqual([
      { mobType: 'skeleton', label: 'Squelettes', current: 10, goal: 10 },
      { mobType: 'mushroom', label: 'Champignons', current: 0, goal: 10 },
    ])
  })

  it('ignore un type de monstre hors objectif', () => {
    const progress = startQuest({}, Q)
    expect(registerKill(progress, 'dragon')).toBe(progress) // même référence
  })

  it('passe en ready puis completed', () => {
    let progress = startQuest({}, Q)
    for (let i = 0; i < 10; i += 1) progress = registerKill(progress, 'skeleton')
    expect(isReadyToComplete(progress, Q)).toBe(false) // champignons manquants
    for (let i = 0; i < 10; i += 1) progress = registerKill(progress, 'mushroom')
    expect(isReadyToComplete(progress, Q)).toBe(true)
    expect(getQuestStatus(progress, Q)).toBe(QUEST_STATUS.READY)
    expect(getNpcMarker(progress, Q)).toBe(NPC_MARKER.READY)

    const done = completeQuest(progress, Q)
    expect(done[Q].status).toBe('completed')
    expect(getQuestStatus(done, Q)).toBe(QUEST_STATUS.COMPLETED)
    expect(getNpcMarker(done, Q)).toBeNull()
  })

  it('getJournalQuests ne renvoie que les quêtes commencées', () => {
    expect(getJournalQuests({})).toEqual([])
    const started = startQuest({}, Q)
    const journal = getJournalQuests(started)
    expect(journal).toHaveLength(1)
    expect(journal[0].questId).toBe(Q)
    expect(journal[0].status).toBe(QUEST_STATUS.ACTIVE)
    expect(journal[0].objectives).toHaveLength(2)
  })

  it('refuse de compléter une quête non prête (anti-triche client)', () => {
    const progress = startQuest({}, Q)
    expect(completeQuest(progress, Q)).toBe(progress)
  })

  it('ne compte plus les kills après complétion', () => {
    let progress = startQuest({}, Q)
    for (let i = 0; i < 10; i += 1) progress = registerKill(progress, 'skeleton')
    for (let i = 0; i < 10; i += 1) progress = registerKill(progress, 'mushroom')
    progress = completeQuest(progress, Q)
    const after = registerKill(progress, 'skeleton')
    expect(after).toBe(progress) // aucune mutation
  })
})
