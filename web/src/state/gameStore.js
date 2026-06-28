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
// RÈGLE D'ABONNEMENT : toujours sélectionner la valeur la plus fine
// (`useGameStore(s => s.near.lightSwitch)`), jamais l'objet entier, sinon on
// re-rend à chaque changement d'un voisin. Hors composant, écrire via
// `useGameStore.getState().setX(...)` (ex. depuis un callback `useFrame`/onNearChange,
// pour ne déclencher aucun rendu côté émetteur).
//
// PÉRIMÈTRE : uniquement de l'état RUNTIME éphémère ou dérivé. La persistance
// reste gérée par `src/services/progressService.js` (cf. CLAUDE.md) ; on ne met
// PAS ici de donnée permanente du joueur tant qu'on n'a pas migré proprement le
// chemin de sauvegarde.

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
