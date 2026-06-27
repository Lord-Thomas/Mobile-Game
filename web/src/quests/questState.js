// Logique d'état des quêtes — FONCTIONS PURES (aucun effet, aucun React).
// Sérialisable tel quel dans la sauvegarde joueur (world_settings.quests).
//
// Forme de l'état persistant (`progress`) :
//   {
//     [questId]: { status: 'active' | 'completed', counts: { [mobType]: number } }
//   }
// Une quête absente de l'objet = non commencée (not_started). Compatibilité
// descendante : une vieille sauvegarde sans `quests` donne un objet vide.

import { ALL_QUEST_IDS, getQuestDefinition } from './questDefinitions'

export const QUEST_STATUS = {
  NOT_STARTED: 'not_started',
  ACTIVE: 'active',
  READY: 'ready',
  COMPLETED: 'completed',
}

export function normalizeQuestProgress(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const result = {}
  for (const [questId, entry] of Object.entries(raw)) {
    if (!getQuestDefinition(questId)) continue
    if (!entry || typeof entry !== 'object') continue
    const status = entry.status === QUEST_STATUS.COMPLETED ? QUEST_STATUS.COMPLETED : QUEST_STATUS.ACTIVE
    const counts = {}
    if (entry.counts && typeof entry.counts === 'object') {
      for (const [mobType, value] of Object.entries(entry.counts)) {
        const n = Number(value)
        if (Number.isFinite(n) && n >= 0) counts[mobType] = Math.floor(n)
      }
    }
    result[questId] = { status, counts }
  }
  return result
}

export function getQuestEntry(progress, questId) {
  return normalizeQuestProgress(progress)[questId] ?? null
}

// Démarre une quête (idempotent : ne réinitialise pas une quête déjà présente).
export function startQuest(progress, questId) {
  const def = getQuestDefinition(questId)
  if (!def) return progress
  const next = normalizeQuestProgress(progress)
  if (next[questId]) return next
  const counts = {}
  def.objectives.forEach((objective) => { counts[objective.mobType] = 0 })
  next[questId] = { status: QUEST_STATUS.ACTIVE, counts }
  return next
}

// Enregistre la mort d'un monstre `mobType` : incrémente le compteur de toutes les
// quêtes actives qui ciblent ce type (sans dépasser l'objectif). Renvoie le même
// objet si rien n'a changé (utile pour éviter des re-renders inutiles).
export function registerKill(progress, mobType) {
  if (!mobType) return progress
  const normalized = normalizeQuestProgress(progress)
  let changed = false
  const next = { ...normalized }
  for (const [questId, entry] of Object.entries(normalized)) {
    if (entry.status !== QUEST_STATUS.ACTIVE) continue
    const def = getQuestDefinition(questId)
    const objective = def?.objectives.find((o) => o.mobType === mobType)
    if (!objective) continue
    const current = entry.counts?.[mobType] ?? 0
    if (current >= objective.goal) continue
    next[questId] = { ...entry, counts: { ...entry.counts, [mobType]: current + 1 } }
    changed = true
  }
  return changed ? next : progress
}

export function isReadyToComplete(progress, questId) {
  const entry = getQuestEntry(progress, questId)
  const def = getQuestDefinition(questId)
  if (!entry || !def || entry.status !== QUEST_STATUS.ACTIVE) return false
  return def.objectives.every((objective) => (entry.counts?.[objective.mobType] ?? 0) >= objective.goal)
}

// Termine une quête (récompense gérée par l'appelant). Ne fait rien si la quête
// n'est pas prête (sécurité contre une complétion forcée par un client modifié).
export function completeQuest(progress, questId) {
  if (!isReadyToComplete(progress, questId)) return progress
  const next = normalizeQuestProgress(progress)
  next[questId] = { ...next[questId], status: QUEST_STATUS.COMPLETED }
  return next
}

export function getQuestStatus(progress, questId) {
  const entry = getQuestEntry(progress, questId)
  if (!entry) return QUEST_STATUS.NOT_STARTED
  if (entry.status === QUEST_STATUS.COMPLETED) return QUEST_STATUS.COMPLETED
  return isReadyToComplete(progress, questId) ? QUEST_STATUS.READY : QUEST_STATUS.ACTIVE
}

// Progression par objectif, pour l'UI (dialogue / tracker).
export function getObjectiveProgress(progress, questId) {
  const entry = getQuestEntry(progress, questId)
  const def = getQuestDefinition(questId)
  if (!def) return []
  return def.objectives.map((objective) => ({
    mobType: objective.mobType,
    label: objective.label ?? objective.mobType,
    current: Math.min(entry?.counts?.[objective.mobType] ?? 0, objective.goal),
    goal: objective.goal,
  }))
}

// Type de marqueur flottant au-dessus du PNJ pour une quête donnée.
//  'available'   → quête disponible (non commencée)        → "!"
//  'in_progress' → quête acceptée, objectifs non atteints   → "…"
//  'ready'       → quête prête à être rendue                → "?"
//  null          → rien (quête terminée)
export const NPC_MARKER = {
  AVAILABLE: 'available',
  IN_PROGRESS: 'in_progress',
  READY: 'ready',
}

export function getNpcMarker(progress, questId) {
  const status = getQuestStatus(progress, questId)
  if (status === QUEST_STATUS.NOT_STARTED) return NPC_MARKER.AVAILABLE
  if (status === QUEST_STATUS.ACTIVE) return NPC_MARKER.IN_PROGRESS
  if (status === QUEST_STATUS.READY) return NPC_MARKER.READY
  return null
}

// Liste des quêtes connues du joueur (acceptées, prêtes ou terminées) pour le
// journal de quêtes. Exclut les quêtes jamais commencées.
export function getJournalQuests(progress) {
  return ALL_QUEST_IDS
    .map((questId) => ({
      questId,
      def: getQuestDefinition(questId),
      status: getQuestStatus(progress, questId),
      objectives: getObjectiveProgress(progress, questId),
    }))
    .filter((quest) => quest.def && quest.status !== QUEST_STATUS.NOT_STARTED)
}
