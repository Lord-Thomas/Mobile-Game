// Convertit les modèles d'ennemis de FBX vers GLB via FBX2glTF.
//
// Pourquoi : les FBX d'ennemis (~2,5–3 Mo) sont lents à parser au runtime (FBXLoader)
// et déclenchent des warnings (`Vertex has more than 4 skinning weights`, `Image type
// "fbm" is not supported`). FBX2glTF produit des GLB plus légers, au parse quasi nul,
// avec la texture embarquée — exactement le même pipeline que les animations joueur
// (cf. scripts/convert-anims-glb.mjs).
//
// IMPORTANT — pièges Mixamo gérés CÔTÉ RUNTIME (pas ici), comme pour le joueur :
//   - les os gardent le `:` Mixamo (mixamorig:Hips) → renormalisés en mixamorigHips
//     par normalizeMixamoObjectName au chargement, sinon le retarget des anims joueur
//     ne matche rien (anims perdues) ;
//   - le nœud `Armature` porte une rotation +90° X et une échelle 0.01 → réinitialisés
//     (rotation 0 / scale 1) au chargement, sinon le monstre est couché / mal taillé
//     (la normalisation par bounding box gère ensuite la taille finale).
// Voir SmallMushroomEnemy / prepareEnemyGlbTransforms dans src/App.jsx.
//
// Usage : node scripts/convert-enemies-glb.mjs [nom]
//   sans argument : convertit tous les ennemis ci-dessous
//   avec un nom (ex. "mushroom") : ne convertit que celui-là (utile pour un pilote)

import convert from 'fbx2gltf'

// nom logique -> { src FBX, out GLB } (les deux dans public/)
const ENEMIES = {
  mushroom: {
    src: 'public/models/enemies/mushroom_man/model.fbx',
    out: 'public/models/enemies/mushroom_man/model.glb',
  },
  skeleton: {
    src: 'public/models/enemies/skeleton/model.fbx',
    out: 'public/models/enemies/skeleton/model.glb',
  },
}

const only = process.argv[2]
const entries = only ? [[only, ENEMIES[only]]] : Object.entries(ENEMIES)

for (const [name, entry] of entries) {
  if (!entry) {
    console.warn(`skip ${name} : inconnu`)
    continue
  }
  try {
    // PAS de `--keep-attribute auto` ici (contrairement aux anims) : sur un MODÈLE,
    // ce flag SUPPRIME l'attribut NORMAL → Three retombe sur des normales de FACE
    // (rendu facetté/« bisoté »). On garde les normales source et on les calcule
    // seulement si le modèle n'en a pas (ex. mushroom rigué via Tripo).
    await convert(entry.src, entry.out, ['--binary', '--compute-normals', 'missing'])
    console.log(`OK ${name} : ${entry.src} -> ${entry.out}`)
  } catch (err) {
    console.error(`ECHEC ${name} (${entry.src}):`, String(err).slice(0, 250))
  }
}
