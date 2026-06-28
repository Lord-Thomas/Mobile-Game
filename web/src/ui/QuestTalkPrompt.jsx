import { useGameStore } from '../stores/useGameStore'

// Invite « Parler » au-dessus du PNJ de quête.
//
// Patron de référence "étape 2" du chantier Zustand (cf. src/stores/useGameStore.js) :
// ce composant s'abonne LUI-MÊME au flag de proximité (`near.questNpcId`) au lieu
// de le recevoir d'App. Conséquence : approcher/quitter le PNJ ne re-rend plus le
// monolithe App (qui ne lit plus ce flag), seulement ce bouton.
//
// `canShow` regroupe les conditions d'UI qui, elles, vivent encore dans App
// (mode jeu, aucun menu ouvert, dialogue fermé…). App ne re-rend donc que sur ces
// états-là — plus sur la proximité.
export default function QuestTalkPrompt({ canShow, onTalk }) {
  const nearbyQuestNpcId = useGameStore((s) => s.near.questNpcId ?? null)
  if (!canShow || !nearbyQuestNpcId) return null

  return (
    <button className="skin-open-btn custom-open-btn" type="button" onClick={onTalk}>
      Parler
    </button>
  )
}
