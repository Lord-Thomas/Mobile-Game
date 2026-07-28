import { useState } from 'react'
import { getQuestDefinition } from '../quests/questDefinitions'
import { QUEST_STATUS, getObjectiveProgress, getQuestStatus } from '../quests/questState'

// Rend un texte de dialogue qui peut être une chaîne ou un tableau de lignes.
function DialogueText({ value }) {
  const lines = Array.isArray(value) ? value : [value]
  return (
    <div className="quest-dialog-text">
      {lines.filter(Boolean).map((line, index) => <p key={index}>{line}</p>)}
    </div>
  )
}

function Objectives({ objectives }) {
  return (
    <ul className="quest-dialog-objectives">
      {objectives.map((objective) => {
        const done = objective.current >= objective.goal
        return (
          <li key={objective.mobType} className={done ? 'is-done' : ''}>
            <span>{objective.label}</span>
            <span className="quest-dialog-count">{objective.current} / {objective.goal}</span>
          </li>
        )
      })}
    </ul>
  )
}

// Boîte de dialogue du PNJ de quête — UI HTML responsive (hors canvas 3D).
// Présentationnel : l'état vient de `questProgress`, les actions sont déléguées.
export default function QuestDialog({ questId, questProgress, onAccept, onComplete, onClose, onOpenVendor }) {
  // Affiche l'écran de confirmation juste après avoir accepté (réinitialisé à
  // chaque ouverture puisque le composant est démonté à la fermeture).
  const [justAccepted, setJustAccepted] = useState(false)

  const def = getQuestDefinition(questId)
  if (!def) return null

  const status = getQuestStatus(questProgress, questId)
  const objectives = getObjectiveProgress(questProgress, questId)
  const dialogue = def.dialogue ?? {}
  const rewardCoins = def.reward?.coins ?? 0

  const handleAccept = () => {
    onAccept(questId)
    setJustAccepted(true)
  }

  const text =
    justAccepted ? dialogue.accepted
    : status === QUEST_STATUS.NOT_STARTED ? dialogue.intro
    : status === QUEST_STATUS.READY ? dialogue.ready
    : status === QUEST_STATUS.COMPLETED ? dialogue.completed
    : dialogue.inProgress

  const showObjectives = justAccepted || status === QUEST_STATUS.ACTIVE || status === QUEST_STATUS.READY
  const showReward = rewardCoins > 0 && status !== QUEST_STATUS.COMPLETED

  return (
    <div className="quest-dialog-overlay">
      <div className="quest-dialog" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="quest-dialog-close" onClick={onClose} aria-label="Fermer">✕</button>
        <div className="quest-dialog-npc">{def.npcName}</div>
        <div className="quest-dialog-title">{def.title}</div>

        <DialogueText value={text} />

        {showObjectives && <Objectives objectives={objectives} />}
        {showReward && <div className="quest-dialog-reward">Récompense : {rewardCoins} 🪙</div>}

        <div className="quest-dialog-actions">
          {justAccepted ? (
            <button type="button" className="quest-dialog-btn primary" onClick={onClose}>C'est parti !</button>
          ) : status === QUEST_STATUS.NOT_STARTED ? (
            <>
              <button type="button" className="quest-dialog-btn primary" onClick={handleAccept}>Accepter</button>
              <button type="button" className="quest-dialog-btn" onClick={onClose}>Plus tard</button>
            </>
          ) : status === QUEST_STATUS.READY ? (
            <>
              <button type="button" className="quest-dialog-btn primary" onClick={() => onComplete(questId)}>Terminer</button>
              <button type="button" className="quest-dialog-btn" onClick={onClose}>Plus tard</button>
            </>
          ) : (
            <button type="button" className="quest-dialog-btn" onClick={onClose}>Fermer</button>
          )}
        </div>

        {onOpenVendor && !justAccepted && (
          <button type="button" className="quest-dialog-vendor" onClick={onOpenVendor}>
            🪙 Vendre des objets
          </button>
        )}
      </div>
    </div>
  )
}
