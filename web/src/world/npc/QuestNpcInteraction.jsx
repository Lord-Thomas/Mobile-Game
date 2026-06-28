import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { getMapObjectCatalogItem } from '../mapObjects'
import { getTerrainHeight } from '../terrain/terrainGeometry'
import { FIRST_QUEST_ID } from '../../quests/questDefinitions'
import { getNpcMarker } from '../../quests/questState'

const MARKER_GLYPH = { available: '!', in_progress: '…', ready: '?' }
const MARKER_CLASS = { available: 'is-available', in_progress: 'is-active', ready: 'is-ready' }

const PLAYER_REFERENCE_HEIGHT_METERS = 1.63
const PLAYER_REFERENCE_HEIGHT_WORLD_UNITS = 2.25
const WORLD_UNITS_PER_METER = PLAYER_REFERENCE_HEIGHT_WORLD_UNITS / PLAYER_REFERENCE_HEIGHT_METERS

// Distance (unités monde) à laquelle le bouton "Parler" apparaît.
export const QUEST_NPC_INTERACT_DISTANCE = 2.6

function getPlacementY(placement) {
  const [x = 0, savedY, z = 0] = placement.position ?? []
  return Number.isFinite(savedY) ? savedY : getTerrainHeight(x, z)
}

function getMarkerHeight(placement) {
  const catalogItem = getMapObjectCatalogItem(placement.objectId)
  const heightMeters = catalogItem?.targetHeightMeters ?? 1.7
  const scale = placement.scale ?? 1
  return heightMeters * WORLD_UNITS_PER_METER * scale + 0.45
}

// Marqueur flottant ("!" / "?") au-dessus d'un PNJ. CSS-animé (aucun travail JS
// par frame). Ne rend rien quand il n'y a pas de marqueur à afficher.
function QuestNpcMarker({ placement, questProgress }) {
  const marker = getNpcMarker(questProgress, FIRST_QUEST_ID)
  if (!marker) return null

  const [x = 0, , z = 0] = placement.position ?? []
  const y = getPlacementY(placement)

  return (
    <group position={[x, y, z]}>
      <Html position={[0, getMarkerHeight(placement), 0]} center distanceFactor={9} occlude={false}>
        <div className={`quest-marker ${MARKER_CLASS[marker] ?? ''}`}>{MARKER_GLYPH[marker] ?? ''}</div>
      </Html>
    </group>
  )
}

// Détecte le PNJ le plus proche dans le rayon d'interaction et le remonte au
// parent (App) via onNearChange. Lecture en useFrame avec garde sur le changement
// d'id pour ne déclencher du setState que lorsque la cible change réellement.
function QuestNpcProximity({ placements, playerPositionRef, enabled, onNearChange }) {
  const currentRef = useRef(null)

  useFrame(() => {
    if (!enabled || !placements.length) {
      if (currentRef.current !== null) {
        currentRef.current = null
        onNearChange(null)
      }
      return
    }

    const p = playerPositionRef.current
    if (!p) return

    let nearestId = null
    let nearestDistance = QUEST_NPC_INTERACT_DISTANCE
    for (const placement of placements) {
      const [x = 0, , z = 0] = placement.position ?? []
      const distance = Math.hypot(p.x - x, p.z - z)
      if (distance < nearestDistance) {
        nearestDistance = distance
        nearestId = placement.id
      }
    }

    if (nearestId !== currentRef.current) {
      currentRef.current = nearestId
      onNearChange(nearestId)
    }
  })

  return null
}

export default function QuestNpcInteraction({
  placements = [],
  playerPositionRef,
  questProgress = {},
  enabled = true,
  onNearChange,
}) {
  if (!placements.length) return null

  return (
    <>
      {/* Le marqueur "!" est un <Html distanceFactor> : sous la caméra
          orthographique du mode personnalisation, ce facteur le fait grossir
          jusqu'à recouvrir tout l'écran. On ne le rend donc que quand le PNJ est
          réellement pertinent (extérieur + mode jeu), même condition que la
          détection de proximité. */}
      {enabled && placements.map((placement) => (
        <QuestNpcMarker key={placement.id} placement={placement} questProgress={questProgress} />
      ))}
      <QuestNpcProximity
        placements={placements}
        playerPositionRef={playerPositionRef}
        enabled={enabled}
        onNearChange={onNearChange}
      />
    </>
  )
}
