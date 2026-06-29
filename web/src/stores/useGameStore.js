import { create } from 'zustand'
import { CHARACTER_DEFAULT_APPEARANCE } from '../game/characterAppearance'
import { defaultEditableObjects } from '../gameObjects/placeableObjects'

// Mode admin (param d'URL ?mode=admin), lu une seule fois — sert uniquement à
// reproduire l'ancien défaut de coins (useState(isAdminMode ? 850 : 0)).
const ECONOMY_ADMIN_INIT = (() => {
  try {
    return new URLSearchParams(window.location.search).get('mode') === 'admin'
  } catch {
    return false
  }
})()

// pinnedId persisté dans son propre localStorage (clé 'questPinnedId'). On
// reproduit l'ancien initialiseur lazy du useState ; l'effet de re-sync vers
// localStorage reste dans App (il dépend du sélecteur).
const QUEST_PINNED_INIT = (() => {
  try {
    return window.localStorage.getItem('questPinnedId') || null
  } catch {
    return null
  }
})()

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

  // --- Slice "menus" -----------------------------------------------------
  // Quel(s) menu(s) d'UI sont ouverts (skin, environment, character,
  // customizationChoice). Événementiel (ouvre/ferme sur action). Relocalisé
  // fidèlement depuis App() : 4 booléens indépendants. NB : en pratique ces menus
  // sont mutuellement exclusifs — une consolidation ultérieure en `activeMenu`
  // (+ action métier `openMenu`) est possible, mais ce serait un resserrement de
  // sémantique, donc traité à part de cette relocalisation fidèle.
  menus: {},
  setMenuOpen: (key, value) => set((state) => {
    if (state.menus[key] === value) return state
    return { menus: { ...state.menus, [key]: value } }
  }),
  closeAllMenus: () => set((state) => (Object.keys(state.menus).length === 0 ? state : { menus: {} })),

  // --- Slice "inventory" (cosmétiques) -----------------------------------
  // Skins ballon/sol/mur (possédés / sélectionné / aperçu), option mur->plafond,
  // chat (possédé / actif). PERSISTÉ : ces champs sont lus par App (via sélecteurs)
  // donc l'effet de sauvegarde de progressService continue de se déclencher tout
  // seul ; le chargement écrit ici via setInventory. Valeurs par défaut =
  // anciennes valeurs initiales des useState (compatibilité descendante préservée).
  //
  // setInventory(key, value) accepte une valeur OU une fonction updater
  // (prev => next), pour remplacer 1:1 les setX(...) et setX(prev => ...) d'App.
  inventory: {
    ownedSkins: ['classic'],
    selectedSkinId: 'classic',
    previewSkinId: 'classic',
    ownedFloorSkins: ['floor-classic'],
    ownedWallSkins: ['wall-classic'],
    selectedFloorSkinId: 'floor-classic',
    selectedWallSkinId: 'wall-classic',
    previewFloorSkinId: 'floor-classic',
    previewWallSkinId: 'wall-classic',
    applyWallToCeiling: false,
    ownedCat: false,
    catActive: false,
  },
  setInventory: (key, value) => set((state) => {
    const prev = state.inventory[key]
    const next = typeof value === 'function' ? value(prev) : value
    if (next === prev) return state // no-op : pas de rendu inutile
    return { inventory: { ...state.inventory, [key]: next } }
  }),

  // --- Slice "equipment" (équipement / identité) -------------------------
  // Montures possédées, arme équipée, livre/crâne magiques possédés, titres
  // (possédés / équipé), apparence du personnage. PERSISTÉ (même principe que
  // inventory : App lit via sélecteurs, progressService sauve tout seul ; le
  // chargement écrit via setEquipment). Défauts = anciennes valeurs initiales.
  // setEquipment(key, value|updater) : remplace 1:1 les setX(...) et setX(prev => ...).
  equipment: {
    ownedMounts: [],
    equippedWeapon: null,
    ownedMagicBook: false,
    ownedMagicSkull: false,
    ownedTitleIds: [],
    equippedTitleId: null,
    characterAppearance: CHARACTER_DEFAULT_APPEARANCE,
  },
  setEquipment: (key, value) => set((state) => {
    const prev = state.equipment[key]
    const next = typeof value === 'function' ? value(prev) : value
    if (next === prev) return state
    return { equipment: { ...state.equipment, [key]: next } }
  }),

  // --- Slice "economy" ---------------------------------------------------
  // coins + materials (sac de matériaux de craft/vente). PERSISTÉ. Le défaut de
  // coins reproduit l'ancien initialiseur useState(isAdminMode ? 850 : 0) — calculé
  // ici à l'init via l'URL (comme perfFlags), pour rester fidèle sans flash.
  //
  // IMPORTANT : la MUTATION métier des coins (applyCoinDelta) reste dans App car
  // elle est couplée au réseau/persistance (addPlayerCoins, savePlayerProgress,
  // partage multijoueur) — conformément à la règle "persistance hors store". Le
  // store ne fait que stocker la valeur ; setEconomy est un setter neutre.
  economy: {
    coins: ECONOMY_ADMIN_INIT ? 850 : 0,
    materials: {},
  },
  setEconomy: (key, value) => set((state) => {
    const prev = state.economy[key]
    const next = typeof value === 'function' ? value(prev) : value
    if (next === prev) return state
    return { economy: { ...state.economy, [key]: next } }
  }),

  // --- Slice "quests" ----------------------------------------------------
  // progress = le "bag" de quêtes (persisté via progressService ; la logique pure
  // est dans src/quests/questState.js, appliquée via setQuest('progress', prev => ...)).
  // dialogOpen/journalOpen/vendorOpen = UI éphémère. pinnedId = quête épinglée
  // (persistée dans son propre localStorage, cf. QUEST_PINNED_INIT + effet côté App).
  quests: {
    progress: {},
    dialogOpen: false,
    journalOpen: false,
    vendorOpen: false,
    pinnedId: QUEST_PINNED_INIT,
  },
  setQuest: (key, value) => set((state) => {
    const prev = state.quests[key]
    const next = typeof value === 'function' ? value(prev) : value
    if (next === prev) return state
    return { quests: { ...state.quests, [key]: next } }
  }),

  // --- Slice "view" (contexte courant) -----------------------------------
  // zone = aire courante ('interior' | 'secondRoom' | 'outside', = ZONES dans App).
  // mode = 'play' | 'customize'. Ce sont les états les PLUS lus du jeu (~90 et ~68
  // sites) mais très peu écrits (zone : 1 writer via transitionToZone ; mode : ~6).
  // Éphémère, non persisté (la zone de spawn/le mode sont recalculés au chargement).
  view: {
    zone: 'interior',
    mode: 'play',
  },
  setView: (key, value) => set((state) => {
    const prev = state.view[key]
    const next = typeof value === 'function' ? value(prev) : value
    if (next === prev) return state
    return { view: { ...state.view, [key]: next } }
  }),

  // --- Slice "ui" (overlays/onglets éphémères) ---------------------------
  // Ouverture des menus lumière/arme/inventaire-objets/compte + onglets actifs.
  // Éphémère, non persisté. (soloNameplateVisible reste dans App : couplé à son
  // propre localStorage, comme quests.pinnedId.)
  ui: {
    lightMenuOpen: false,
    weaponMenuOpen: false,
    objectInventoryOpen: false,
    accountOpen: false,
    mainMenuTab: 'account',
    environmentTab: 'floor',
  },
  setUi: (key, value) => set((state) => {
    const prev = state.ui[key]
    const next = typeof value === 'function' ? value(prev) : value
    if (next === prev) return state
    return { ui: { ...state.ui, [key]: next } }
  }),

  // --- Slice "editor" (monde / placement d'objets) -----------------------
  // editableObjects = objets placés par le joueur (PERSISTÉ ; défaut importé de
  // placeableObjects). Le reste = état d'édition éphémère (sélection, drag,
  // placement en cours, aperçu). setEditor(key, value|updater) remplace 1:1 les
  // setX(...) et setX(prev => ...).
  editor: {
    editableObjects: defaultEditableObjects,
    selectedObjectId: null,
    draggingObjectId: null,
    placingObjectId: null,
    placementLocked: false,
    placementPreview: null,
  },
  setEditor: (key, value) => set((state) => {
    const prev = state.editor[key]
    const next = typeof value === 'function' ? value(prev) : value
    if (next === prev) return state
    return { editor: { ...state.editor, [key]: next } }
  }),
}))
