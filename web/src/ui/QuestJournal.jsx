import { QUEST_STATUS, getJournalQuests } from '../quests/questState'

const STATUS_LABEL = {
  [QUEST_STATUS.ACTIVE]: 'En cours',
  [QUEST_STATUS.READY]: 'À rendre',
  [QUEST_STATUS.COMPLETED]: 'Terminée',
}

// Journal de quêtes — ouvrable à tout moment (pas seulement en parlant au PNJ).
// Liste les quêtes acceptées, leur progression, et permet d'épingler une quête
// active à l'écran (mini-tracker, voir QuestTracker).
export default function QuestJournal({ questProgress, pinnedQuestId, onPin, onClose }) {
  const quests = getJournalQuests(questProgress)

  return (
    <div className="quest-journal-overlay">
      <div className="quest-journal" onClick={(event) => event.stopPropagation()}>
        <div className="quest-journal-header">
          <strong>📜 Journal de quêtes</strong>
          <button type="button" className="quest-journal-close" onClick={onClose} aria-label="Fermer">✕</button>
        </div>

        {quests.length === 0 ? (
          <p className="quest-journal-empty">Aucune quête en cours. Parle aux villageois marqués d'un « ! ».</p>
        ) : (
          <ul className="quest-journal-list">
            {quests.map(({ questId, def, status, objectives }) => {
              const canPin = status === QUEST_STATUS.ACTIVE || status === QUEST_STATUS.READY
              const isPinned = pinnedQuestId === questId
              return (
                <li key={questId} className={`quest-journal-item is-${status}`}>
                  <div className="quest-journal-item-head">
                    <div>
                      <div className="quest-journal-item-title">{def.title}</div>
                      <div className="quest-journal-item-npc">{def.npcName}</div>
                    </div>
                    <span className={`quest-journal-badge is-${status}`}>{STATUS_LABEL[status] ?? ''}</span>
                  </div>

                  {status !== QUEST_STATUS.COMPLETED && (
                    <ul className="quest-journal-objectives">
                      {objectives.map((objective) => {
                        const done = objective.current >= objective.goal
                        return (
                          <li key={objective.mobType} className={done ? 'is-done' : ''}>
                            <span>{objective.label}</span>
                            <span className="quest-journal-count">{objective.current} / {objective.goal}</span>
                          </li>
                        )
                      })}
                    </ul>
                  )}

                  {canPin && (
                    <button
                      type="button"
                      className={`quest-journal-pin ${isPinned ? 'is-pinned' : ''}`}
                      onClick={() => onPin(isPinned ? null : questId)}
                    >
                      {isPinned ? '📌 Épinglée' : '📍 Épingler'}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
