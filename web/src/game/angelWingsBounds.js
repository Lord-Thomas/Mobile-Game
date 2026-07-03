// Mesure de la taille RENDUE d'un modèle skinné (ailes du sort Envol Céleste).
//
// Une bbox naïve (Box3.setFromObject) est fausse sur ce genre de rig : le nœud
// Armature de l'export Blender porte une échelle 0,02 et les os des unités ×50 —
// le rendu skinné suit les matrices d'os, pas le matrixWorld du mesh (même
// famille de piège que measureEnemyGlbIdleBounds, facteur ×71 chez les ennemis).
// On skinne donc chaque sommet en pose bind via applyBoneTransform (l'ancien
// nom boneTransform a disparu de three ≥ r155), ce qui donne exactement la
// taille affichée à l'écran. Mesuré une fois, mis en cache par modèle source
// (les clones SkeletonUtils sont identiques).

import { Box3, Vector3 } from 'three'

const boundsCache = new WeakMap()

export function getAngelWingsBounds(sourceScene, wings) {
  const cached = boundsCache.get(sourceScene)
  if (cached) return cached
  wings.updateMatrixWorld(true)
  const box = new Box3()
  const vertex = new Vector3()
  wings.traverse((child) => {
    if (child.isSkinnedMesh) {
      child.skeleton.update()
      const position = child.geometry.attributes.position
      for (let i = 0; i < position.count; i++) {
        // applyBoneTransform lit le sommet depuis le vecteur passé : il faut
        // le précharger avec la position locale avant d'appliquer le skinning.
        vertex.fromBufferAttribute(position, i)
        child.applyBoneTransform(i, vertex)
        vertex.applyMatrix4(child.matrixWorld)
        box.expandByPoint(vertex)
      }
    } else if (child.isMesh) {
      box.expandByObject(child, true)
    }
  })
  const size = box.getSize(new Vector3())
  const bounds = {
    span: Math.max(size.x, size.y, size.z) || 1,
    center: box.getCenter(new Vector3()),
  }
  boundsCache.set(sourceScene, bounds)
  return bounds
}
