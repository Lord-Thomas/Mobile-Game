import { getWallColliderTransform, splitWallIntoSolidRects } from '../world/house/wallUtils'

// Collision joueur ↔ murs/cloisons intérieurs. Le joueur est un corps
// kinématique déplacé à la main : Rapier ne le bloque pas, on résout donc
// la collision cercle-vs-AABB nous-mêmes, avec glissement par axe.
// La liste est un module mutable (même principe que PLAY_AREA_LIMITS dans
// App.jsx) : synchronisée quand le housePlan change, lue à chaque frame.

// Un volume ne bloque le joueur que s'il occupe la tranche verticale du corps
// (le linteau au-dessus d'une porte laisse passer, le mur plein bloque).
const BLOCKING_MAX_BOTTOM = 1.1
const BLOCKING_MIN_TOP = 0.05

const wallColliderBoxes = []

function pushTransformAsBox(boxes, transform) {
  const [halfLength, halfHeight, halfThickness] = transform.args
  const centerY = transform.position[1]
  if (centerY - halfHeight > BLOCKING_MAX_BOTTOM) return
  if (centerY + halfHeight < BLOCKING_MIN_TOP) return

  const cos = Math.abs(Math.cos(transform.rotation[1]))
  const sin = Math.abs(Math.sin(transform.rotation[1]))
  const halfX = halfLength * cos + halfThickness * sin
  const halfZ = halfLength * sin + halfThickness * cos
  boxes.push({
    minX: transform.position[0] - halfX,
    maxX: transform.position[0] + halfX,
    minZ: transform.position[2] - halfZ,
    maxZ: transform.position[2] + halfZ,
  })
}

export function buildInteriorWallColliderBoxes(layout) {
  const boxes = []
  ;(layout.walls ?? []).forEach((wall) => {
    splitWallIntoSolidRects(wall).forEach((rect) => {
      pushTransformAsBox(boxes, getWallColliderTransform(wall, rect))
    })

    // Le verre bloque aussi : une vitre descendue au sol (allège 0) ne doit
    // pas laisser passer le joueur comme une porte.
    ;(wall.openings ?? []).filter((opening) => opening.type === 'window').forEach((opening) => {
      const bottom = (wall.bottom ?? 0) + (opening.bottom ?? 0)
      pushTransformAsBox(boxes, getWallColliderTransform(wall, {
        center: opening.center,
        y: bottom + opening.height * 0.5,
        width: opening.width,
        height: opening.height,
      }))
    })
  })
  return boxes
}

export function syncInteriorWallColliders(boxes) {
  wallColliderBoxes.length = 0
  wallColliderBoxes.push(...boxes)
}

function circleIntersectsBox(x, z, radius, box) {
  const closestX = Math.min(Math.max(x, box.minX), box.maxX)
  const closestZ = Math.min(Math.max(z, box.minZ), box.maxZ)
  const dx = x - closestX
  const dz = z - closestZ
  return dx * dx + dz * dz < radius * radius
}

export function collidesWithInteriorWalls(x, z, radius) {
  return wallColliderBoxes.some((box) => circleIntersectsBox(x, z, radius, box))
}

// Résolution glissante : si la cible touche un mur, on garde la composante
// de mouvement qui reste libre (X ou Z), sinon on reste sur place.
export function resolveInteriorWallCollision(prevX, prevZ, nextX, nextZ, radius) {
  // Déjà dans un mur (ex. cloison posée sur le joueur en mode construction) :
  // ne pas le piéger, laisser le mouvement sortir librement.
  if (collidesWithInteriorWalls(prevX, prevZ, radius)) return { x: nextX, z: nextZ }
  if (!collidesWithInteriorWalls(nextX, nextZ, radius)) return { x: nextX, z: nextZ }
  if (!collidesWithInteriorWalls(nextX, prevZ, radius)) return { x: nextX, z: prevZ }
  if (!collidesWithInteriorWalls(prevX, nextZ, radius)) return { x: prevX, z: nextZ }
  return { x: prevX, z: prevZ }
}
