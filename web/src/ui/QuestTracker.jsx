import { getQuestDefinition } from '../quests/questDefinitions'
import { QUEST_STATUS, getObjectiveProgress, getQuestStatus } from '../quests/questState'

// Mini-tracker de la quête épinglée, affiché en permanence à l'écran.
// Ne rend rien si la quête épinglée n'est plus active/à rendre (ou inexistante).
export default function QuestTracker({ questId, questProgress }) {
  const def = getQuestDefinition(questId)
  if (!def) return null

  const status = getQuestStatus(questProgress, questId)
  if (status !== QUEST_STATUS.ACTIVE && status !== QUEST_STATUS.READY) return null

  const objectives = getObjectiveProgress(questProgress, questId)
  const isReady = status === QUEST_STATUS.READY

  return (
    <div className={`quest-tracker ${isReady ? 'is-ready' : ''}`}>
      <div className="quest-tracker-title">📌 {def.title}</div>
      <ul className="quest-tracker-objectives">
        {objectives.map((objective) => {
          const done = objective.current >= objective.goal
          return (
            <li key={objective.mobType} className={done ? 'is-done' : ''}>
              <span>{objective.label}</span>
              <span className="quest-tracker-count">{objective.current}/{objective.goal}</span>
            </li>
          )
        })}
      </ul>
      {isReady && <div className="quest-tracker-ready">Va rendre la quête !</div>}
    </div>
  )
}
