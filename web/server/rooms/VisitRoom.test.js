import { describe, it, expect } from 'vitest'
import {
  sanitizeCoinGain,
  sanitizeImpulse,
  sanitizeChatText,
  sanitizeSpellCast,
  sanitizeBossAction,
} from './VisitRoom.js'

// Ces tests encodent les règles de validation réseau du serveur Colyseus.
// Le serveur est un relais non autoritatif (cf. web/CLAUDE.md), donc ces
// sanitizers sont la seule barrière contre les messages client malformés
// ou abusifs. Toute régression ici est une faille.

describe('sanitizeCoinGain', () => {
  it('accepte un gain positif et plafonne à un entier', () => {
    const gain = sanitizeCoinGain({ delta: 10.9, reason: 'kill' })
    expect(gain).not.toBeNull()
    expect(gain.delta).toBe(10)
    expect(gain.reason).toBe('kill')
  })

  it('rejette un delta négatif, nul ou non fini', () => {
    expect(sanitizeCoinGain({ delta: 0 })).toBeNull()
    expect(sanitizeCoinGain({ delta: -5 })).toBeNull()
    expect(sanitizeCoinGain({ delta: 'abc' })).toBeNull()
    expect(sanitizeCoinGain({})).toBeNull()
  })

  it('rejette un delta au-dessus du plafond anti-triche (10000)', () => {
    expect(sanitizeCoinGain({ delta: 10001 })).toBeNull()
    expect(sanitizeCoinGain({ delta: 1_000_000 })).toBeNull()
  })
})

describe('sanitizeImpulse', () => {
  it('borne chaque composante dans les limites autorisées', () => {
    const impulse = sanitizeImpulse({ impulse: { x: 99, y: 99, z: -99 } })
    expect(impulse).toEqual({ x: 0.4, y: 0.2, z: -0.4 })
  })

  it('rejette une impulsion absente ou non numérique', () => {
    expect(sanitizeImpulse({})).toBeNull()
    expect(sanitizeImpulse({ impulse: { x: 'a', y: 0, z: 0 } })).toBeNull()
  })
})

describe('sanitizeChatText', () => {
  it('normalise les espaces et tronque à 120 caractères', () => {
    const long = 'a'.repeat(200)
    expect(sanitizeChatText({ text: long }).length).toBe(120)
    expect(sanitizeChatText({ text: '  bonjour   monde  ' })).toBe('bonjour monde')
  })

  it('renvoie une chaîne vide pour une entrée non textuelle', () => {
    expect(sanitizeChatText({ text: 42 })).toBe('')
    expect(sanitizeChatText({})).toBe('')
  })
})

describe('sanitizeSpellCast', () => {
  it('accepte une boule de feu valide et normalise la direction', () => {
    const spell = sanitizeSpellCast({
      kind: 'fireball',
      position: [1, 2, 3],
      direction: [3, 4],
    })
    expect(spell).not.toBeNull()
    expect(spell.kind).toBe('fireball')
    expect(Math.hypot(spell.direction[0], spell.direction[1])).toBeCloseTo(1, 5)
  })

  it('rejette un sort de type inconnu ou une direction malformée', () => {
    expect(sanitizeSpellCast({ kind: 'meteor', position: [0, 0, 0], direction: [1, 0] })).toBeNull()
    // direction de mauvaise longueur / non numérique => rejet
    expect(sanitizeSpellCast({ kind: 'fireball', position: [0, 0, 0], direction: [1] })).toBeNull()
    expect(sanitizeSpellCast({ kind: 'fireball', position: [0, 0, 0], direction: [Number.NaN, 1] })).toBeNull()
  })

  // QUIRK CONNU (à corriger un jour, pas une régression à introduire) :
  // une direction [0, 0] n'est PAS rejetée. sanitizeVector utilise une longueur
  // par défaut de 3, donc [0,0] (longueur 2) retombe sur le fallback [0, -1].
  // Une boule de feu sans direction part donc vers le sud au lieu d'être annulée.
  it('documente le repli silencieux de la direction [0,0] vers [0,-1]', () => {
    const spell = sanitizeSpellCast({ kind: 'fireball', position: [0, 0, 0], direction: [0, 0] })
    expect(spell).not.toBeNull()
    expect(spell.direction).toEqual([0, -1])
  })
})

describe('sanitizeBossAction', () => {
  it('accepte seulement les invocations et coups formés', () => {
    expect(sanitizeBossAction({ type: 'summon', actionId: 'a-1', altarId: 'altar' })).toEqual({
      type: 'summon', actionId: 'a-1', altarId: 'altar',
    })
    expect(sanitizeBossAction({ type: 'hit', actionId: 'h-1', weaponId: 'cheat_sword', charged: true })).toEqual({
      type: 'hit', actionId: 'h-1', weaponId: 'cheat_sword', charged: true,
    })
  })

  it('rejette un type inconnu, un identifiant vide et une arme inconnue', () => {
    expect(sanitizeBossAction({ type: 'delete', actionId: 'x' })).toBeNull()
    expect(sanitizeBossAction({ type: 'hit', actionId: '' })).toBeNull()
    expect(sanitizeBossAction({ type: 'hit', actionId: 'h-2', weaponId: 'admin_blade' })?.weaponId).toBeNull()
  })
})
