import { GENERATED_MAP_OBJECT_DEFINITIONS } from './mapObjectLibrary.generated'

// Les objets du dossier public/models/map sont ajoutes ici automatiquement par
// le bouton "Importer modeles" de l'editeur de map.
const MANUAL_MAP_OBJECT_DEFINITIONS = []

export const MAP_OBJECT_DEFINITIONS = [
  ...GENERATED_MAP_OBJECT_DEFINITIONS,
  ...MANUAL_MAP_OBJECT_DEFINITIONS,
]
