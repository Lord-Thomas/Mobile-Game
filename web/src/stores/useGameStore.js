import { create } from 'zustand'

// Store d'état de jeu (Zustand) — chantier de décomposition d'`App.jsx`.
//
// POURQUOI : `App()` concentre ~96 useState et fait ~17 000 lignes. Un setState
// parent re-rend tout l'arbre 3D (d'où les React.memo défensifs et une partie des
// long tasks de chargement). On extrait l'état d'`App()` vers ce store, domaine
// par domaine, pour que chaque composant s'abonne à SA tranche et ne re-rende que
// quand cette tranche change.
//
// MÉTHODE (chaque étape laisse le jeu jouable, npm run check vert avant commit) :
//   1. Relocaliser l'état : le state quitte `App()` et vit ici. `App` peut encore
//      le lire via un sélecteur (comportement identique, pas encore de gain perf).
//   2. Descendre les lecteurs : extraire les morceaux de JSX qui lisent cette
//      tranche en petits composants qui s'abonnent directement au store → `App`
//      cesse de re-rendre pour cette tranche (c'est là qu'est le gain).
//
// CONVENTIONS (validées avec l'utilisateur, cf. mémoire zustand-refactor-conventions) :
// - Sélecteur FIN toujours : `useGameStore(s => s.near.lightSwitch)`, jamais
//   `useGameStore()` entier. Si un sélecteur renvoie un objet/tableau calculé,
//   l'envelopper dans `useShallow` (`import { useShallow } from 'zustand/react/shallow'`)
//   pour éviter des rendus sur une nouvelle référence à valeurs égales.
// - Écrire hors composant via `useGameStore.getState().setX(...)` (callback
//   `useFrame`/onNearChange) → aucun rendu côté émetteur.
// - JAMAIS d'état temps réel ici (position joueur/ballon, caméra, physique, anim
//   mobs, distance recalculée par frame) : ça reste `useRef` + `useFrame`. Seul
//   l'état ÉVÉNEMENTIEL (proximité on/off, zone, mode, achats, quêtes…) va au store.
// - Préférer des ACTIONS MÉTIER (`spendCoins`, `buyItem`…) aux `setX` génériques
//   quand il y a une règle de jeu à centraliser.
// - PLUSIEURS stores par domaine (`useGameStore`, `useInventoryStore`,
//   `useQuestStore`…), pas un fourre-tout. Ce store = état de jeu global/transverse.
//
// PERSISTANCE : on n'utilise PAS le middleware `persist`. La sauvegarde reste
// `src/services/progressService.js` (Supabase + repli local, cf. CLAUDE.md) — pas
// de 2e système concurrent. Ici uniquement de l'état runtime éphémère ou dérivé.

export const useGameStore = create((set) => ({
  // --- Slice "proximité" -------------------------------------------------
  // Flags éphémères : de quel objet interactif le joueur est à portée. Écrits
  // depuis les détecteurs `useFrame` (via getState, donc sans rendu côté émetteur),
  // lus par les invites d'UI et quelques props de scène. Aucune persistance.
  near: {},
  setNear: (key, value) => set((state) => {
    if (state.near[key] === value) return state // no-op : pas de nouveau rendu inutile
    return { near: { ...state.near, [key]: value } }
  }),
  resetNear: () => set({ near: {} }),
}))
