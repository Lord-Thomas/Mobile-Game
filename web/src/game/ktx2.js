import { useMemo } from 'react'
import { useKTX2 } from '@react-three/drei'

// Transcodeur Basis hébergé localement (public/basis/), copié depuis three.
export const BASIS_TRANSCODER_PATH = '/basis/'

// Remappe un chemin d'image vers son équivalent .ktx2 encodé (scripts/encode-ktx2.mjs).
// Permet à useGameTexture d'être un drop-in de useTexture : on passe les chemins
// .png/.jpg d'origine (y compris ceux persistés en localStorage pour les skins),
// et c'est le .ktx2 GPU-compressé qui est chargé.
export const toKtx2Path = (path) =>
  typeof path === 'string' ? path.replace(/\.(png|jpe?g)$/i, '.ktx2') : path

// Drop-in pour useTexture : charge des .ktx2 (GPU-compressé, reste compressé en
// VRAM). Accepte un chemin, un tableau ou un objet de chemins, comme useKTX2/useTexture.
// IMPORTANT : ne l'utiliser que pour des textures effectivement encodées en .ktx2
// (surfaces). Les masks/textures d'ennemis non encodés restent sur useTexture.
// NOTE : les .ktx2 sont pré-flippés verticalement (flipY=false) → rendu identique au PNG.
export function useGameTexture(input) {
  const remapped = useMemo(() => {
    if (Array.isArray(input)) return input.map(toKtx2Path)
    if (input && typeof input === 'object') {
      return Object.fromEntries(Object.entries(input).map(([k, v]) => [k, toKtx2Path(v)]))
    }
    return toKtx2Path(input)
  }, [input])
  return useKTX2(remapped, BASIS_TRANSCODER_PATH)
}
