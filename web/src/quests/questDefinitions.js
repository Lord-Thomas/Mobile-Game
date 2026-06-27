// Données de quêtes — STATIQUES et data-driven.
// Pas de logique ici : seulement la description des quêtes (objectifs, dialogues,
// récompenses). La logique d'état vit dans questState.js (fonctions pures, testées).
//
// Pour ajouter une quête : ajouter une entrée dans QUESTS. Pour la rattacher au
// PNJ plaçable depuis l'éditeur, voir QUEST_NPC_OBJECT_ID ci-dessous.

// Id de l'objet de catalogue (éditeur de map) qui représente le PNJ de quête.
// Doit correspondre à l'entrée ajoutée dans BASE_MAP_OBJECT_CATALOG (mapObjects.js).
export const QUEST_NPC_OBJECT_ID = 'village_quest_npc'

export const QUESTS = {
  village_hunt_1: {
    id: 'village_hunt_1',
    npcName: 'Doyen du village',
    title: 'Nettoyage du village',
    // Objectifs : tuer N monstres d'un type. `mobType` doit correspondre aux clés
    // de MOB_CONFIGS / MONSTER_SPAWNER_TYPES ('skeleton', 'mushroom', ...).
    objectives: [
      { mobType: 'skeleton', goal: 10, label: 'Squelettes' },
      { mobType: 'mushroom', goal: 10, label: 'Champignons' },
    ],
    reward: { coins: 500 },
    // Chaque champ peut être une chaîne ou un tableau de lignes (rendu en
    // paragraphes par QuestDialog).
    dialogue: {
      // Accueil (quête non commencée) : lore + l'annonce de la quête.
      intro: [
        'Salut !',
        'Tu es nouveau ici, pas vrai ?',
        'Les Clairières changent sans arrêt.',
        'Certains disent que le monde grandit de lui-même.',
        "D'autres pensent qu'une force mystérieuse façonne ces terres.",
        "Moi, je me contente d'observer.",
        'Enfin... quand les squelettes me laissent tranquille.',
        'Justement, si tu croises quelques squelettes ou ces drôles de créatures champignons de la forêt, élimine-en 10 de chaque.',
      ],
      // Confirmation affichée juste après avoir accepté la quête.
      accepted: [
        "Parfait. Reviens me voir quand ce sera fait — le village t'en sera reconnaissant, et moi aussi.",
      ],
      inProgress: [
        'Alors, ces squelettes et ces champignons ? Reviens me voir quand tu en auras éliminé 10 de chaque.',
      ],
      ready: ['Tu les as tous vaincus ? Magnifique ! Voici ta récompense.'],
      completed: ['Merci encore, le village te doit beaucoup.'],
    },
  },
}

// Quête donnée par défaut par le PNJ de quête (Phase 1 : un seul PNJ, une quête).
export const FIRST_QUEST_ID = 'village_hunt_1'

export const ALL_QUEST_IDS = Object.keys(QUESTS)

export function getQuestDefinition(questId) {
  return QUESTS[questId] ?? null
}
