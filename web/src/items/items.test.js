import { describe, expect, it } from 'vitest'
import { rollLoot } from './lootTable'
import { getSlimePetDefinitions } from './itemDefinitions'
import {
  addItems,
  getItemCount,
  getMaterialEntries,
  normalizeMaterials,
  sellAll,
  sellItem,
} from './materialsInventory'

// rng déterministe à partir d'une liste de valeurs.
function seededRng(values) {
  let i = 0
  return () => values[i++ % values.length]
}

describe('lootTable', () => {
  it('drop quand le tirage est sous la chance', () => {
    expect(rollLoot('skeleton', seededRng([0.1]))).toEqual(['bone'])
    expect(rollLoot('mushroom', seededRng([0.49]))).toEqual(['mushroom'])
  })

  it('pas de drop quand le tirage est au-dessus de la chance', () => {
    expect(rollLoot('skeleton', seededRng([0.9]))).toEqual([])
    expect(rollLoot('mushroom', seededRng([0.5]))).toEqual([]) // 0.5 n'est pas < 0.5
  })

  it('type de monstre inconnu = aucun drop', () => {
    expect(rollLoot('dragon')).toEqual([])
  })

  it('les variantes squelette droppent des os', () => {
    expect(rollLoot('skeleton_archer', seededRng([0, 1]))).toEqual(['bone'])
    expect(rollLoot('skeleton_mage', seededRng([0, 1]))).toEqual(['bone'])
  })

  it('accepte une table de loot personnalisee', () => {
    const table = [
      { itemId: 'red_crystal', chance: 0.75 },
      { itemId: 'bone', chance: 0.25 },
    ]
    expect(rollLoot('skeleton', seededRng([0.7, 0.3]), table)).toEqual(['red_crystal'])
  })

  it('drop rare des cristaux (4%)', () => {
    // 1er tirage = objet commun (raté), 2e tirage = cristal (réussi sous 0.04).
    expect(rollLoot('skeleton', seededRng([0.9, 0.02]))).toEqual(['blue_crystal'])
    expect(rollLoot('mushroom', seededRng([0.9, 0.02]))).toEqual(['red_crystal'])
    // Au-dessus du seuil : pas de cristal.
    expect(rollLoot('skeleton', seededRng([0.9, 0.08]))).toEqual([])
    // Jackpot : commun + cristal.
    expect(rollLoot('mushroom', seededRng([0.1, 0.01]))).toEqual(['mushroom', 'red_crystal'])
  })
})

describe('materialsInventory', () => {
  it('compat descendante : entrée invalide → vide', () => {
    expect(normalizeMaterials(null)).toEqual({})
    expect(normalizeMaterials({ unknown: 5 })).toEqual({})
    expect(normalizeMaterials({ bone: -3 })).toEqual({})
    expect(normalizeMaterials({ bone: 2.7 })).toEqual({ bone: 2 })
  })

  it('ajoute des objets', () => {
    let mats = addItems({}, ['bone', 'bone', 'mushroom'])
    expect(mats).toEqual({ bone: 2, mushroom: 1 })
    expect(getItemCount(mats, 'bone')).toBe(2)
    mats = addItems(mats, ['bone'])
    expect(getItemCount(mats, 'bone')).toBe(3)
  })

  it('ignore les itemId inconnus', () => {
    expect(addItems({}, ['nope'])).toEqual({})
  })

  it('vend une quantité plafonnée au stock', () => {
    const mats = { bone: 3 }
    const r1 = sellItem(mats, 'bone', 2)
    expect(r1.sold).toBe(2)
    expect(r1.coins).toBe(20) // 2 * 10
    expect(r1.materials).toEqual({ bone: 1 })

    const r2 = sellItem(mats, 'bone', 99)
    expect(r2.sold).toBe(3)
    expect(r2.materials).toEqual({}) // supprimé quand vidé
  })

  it('vend tout', () => {
    const { materials, coins } = sellAll({ bone: 2, mushroom: 3 })
    expect(materials).toEqual({})
    expect(coins).toBe(2 * 10 + 3 * 5)
  })

  it('liste les entrées pour le marchand', () => {
    const entries = getMaterialEntries({ bone: 2 })
    expect(entries).toEqual([
      { itemId: 'bone', def: expect.objectContaining({ id: 'bone' }), count: 2, unitPrice: 10, totalPrice: 20 },
    ])
  })
})

describe('slime pet unlock items', () => {
  it('expose chaque mini-slime genere comme familier debloquable', () => {
    const petIds = getSlimePetDefinitions().map((pet) => pet.petId)
    expect(petIds).toEqual(expect.arrayContaining(['blue_slime', 'cute_slime', 'red_slime']))
  })
})
