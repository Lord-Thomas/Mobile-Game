import { describe, expect, it } from 'vitest'
import {
  Bone,
  BufferAttribute,
  BufferGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  Skeleton,
  SkinnedMesh,
  Uint16BufferAttribute,
} from 'three'
import { getAngelWingsBounds } from './angelWingsBounds'

// Mesh skinné minimal : un triangle de 2 d'envergure (x ∈ [-1, 1]) entièrement
// pondéré sur un seul os. En scalant l'os, la taille RENDUE change alors que la
// géométrie (et donc une bbox naïve) ne bouge pas — c'est exactement le piège
// des ailes (Armature 0,02 / os ×50).
function makeSkinnedTriangle({ boneScale = 1 } = {}) {
  const geometry = new BufferGeometry()
  geometry.setAttribute(
    'position',
    new BufferAttribute(new Float32Array([-1, 0, 0, 1, 0, 0, 0, 1, 0]), 3),
  )
  geometry.setAttribute(
    'skinIndex',
    new Uint16BufferAttribute(new Uint16Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), 4),
  )
  geometry.setAttribute(
    'skinWeight',
    new BufferAttribute(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]), 4),
  )

  const mesh = new SkinnedMesh(geometry, new MeshBasicMaterial())
  const bone = new Bone()
  mesh.add(bone)
  mesh.bind(new Skeleton([bone]))
  // Échelle posée APRÈS le bind : comme dans le rig réel, la pose rendue
  // diverge de la pose bind — c'est ce que la bbox naïve ne voit pas.
  bone.scale.setScalar(boneScale)

  const root = new Group()
  root.add(mesh)
  return root
}

describe('getAngelWingsBounds', () => {
  it('mesure un mesh skinné sans lever (API three ≥ r155 : applyBoneTransform)', () => {
    const source = makeSkinnedTriangle()
    const bounds = getAngelWingsBounds(source, source)
    expect(bounds.span).toBeCloseTo(2)
  })

  it('mesure la taille RENDUE (échelle portée par les os), pas la géométrie', () => {
    const source = makeSkinnedTriangle({ boneScale: 50 })
    const bounds = getAngelWingsBounds(source, source)
    // La bbox naïve dirait 2 ; le rendu skinné fait 100.
    expect(bounds.span).toBeCloseTo(100)
    expect(bounds.center.y).toBeCloseTo(25)
  })

  it('met la mesure en cache par modèle source', () => {
    const source = makeSkinnedTriangle()
    const first = getAngelWingsBounds(source, source)
    const second = getAngelWingsBounds(source, source)
    expect(second).toBe(first)
  })

  it('retombe sur la bbox classique pour un mesh non skinné', () => {
    const root = new Group()
    const geometry = new BufferGeometry()
    geometry.setAttribute(
      'position',
      new BufferAttribute(new Float32Array([-3, 0, 0, 3, 0, 0, 0, 1, 0]), 3),
    )
    root.add(new Mesh(geometry, new MeshBasicMaterial()))
    const bounds = getAngelWingsBounds(root, root)
    expect(bounds.span).toBeCloseTo(6)
  })
})
