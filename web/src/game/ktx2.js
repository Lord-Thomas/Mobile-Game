import { useTexture } from '@react-three/drei'

// Transcodeur Basis hébergé localement (public/basis/), copié depuis three.
export const BASIS_TRANSCODER_PATH = '/basis/'

// Remappe un chemin d'image vers son équivalent .ktx2 encodé (scripts/encode-ktx2.mjs).
// Permet à useGameTexture d'être un drop-in de useTexture : on passe les chemins
// .png/.jpg d'origine (y compris ceux persistés en localStorage pour les skins),
// et c'est le .ktx2 GPU-compressé qui est chargé.
export const toKtx2Path = (path) =>
  typeof path === 'string' ? path.replace(/\.(png|jpe?g)$/i, '.ktx2') : path

// Drop-in pour useTexture. Les derniers timings montrent que Basis/KTX2 ajoute un
// gros transcodage au chargement mobile ; on garde donc les PNG/JPG source pour
// tester le chemin sans transcode, sans perte de qualité visuelle.
export function useGameTexture(input) {
  return useTexture(input)
}
