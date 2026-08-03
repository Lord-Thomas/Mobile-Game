import { useEffect, useMemo } from 'react'
import { CanvasTexture, LinearFilter, SRGBColorSpace } from 'three'

function createTexture(width, height, draw) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  draw(context, width, height)

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.generateMipmaps = false
  return texture
}

function roundedRect(context, x, y, width, height, radius) {
  const r = Math.min(radius, width * 0.5, height * 0.5)
  context.beginPath()
  context.moveTo(x + r, y)
  context.lineTo(x + width - r, y)
  context.quadraticCurveTo(x + width, y, x + width, y + r)
  context.lineTo(x + width, y + height - r)
  context.quadraticCurveTo(x + width, y + height, x + width - r, y + height)
  context.lineTo(x + r, y + height)
  context.quadraticCurveTo(x, y + height, x, y + height - r)
  context.lineTo(x, y + r)
  context.quadraticCurveTo(x, y, x + r, y)
  context.closePath()
}

// Sprite WebGL natif : le depth buffer masque automatiquement le HUD derrière
// le décor. Aucun raycast et aucune opération JavaScript ne sont faits par frame.
export function WorldHealthBarSprite({ hp, maxHp, color = '#ef4444', width = 1.15, height = 0.29 }) {
  const safeMaxHp = Math.max(1, Number(maxHp) || 1)
  const safeHp = Math.max(0, Math.min(safeMaxHp, Number(hp) || 0))
  const ratio = safeHp / safeMaxHp
  const texture = useMemo(() => createTexture(256, 64, (context) => {
    context.clearRect(0, 0, 256, 64)
    roundedRect(context, 4, 4, 248, 56, 15)
    context.fillStyle = 'rgba(9, 14, 24, 0.92)'
    context.fill()
    context.lineWidth = 3
    context.strokeStyle = 'rgba(232, 240, 255, 0.82)'
    context.stroke()

    roundedRect(context, 13, 13, 230, 22, 9)
    context.fillStyle = 'rgba(35, 42, 55, 0.95)'
    context.fill()
    if (ratio > 0) {
      roundedRect(context, 13, 13, 230 * ratio, 22, 9)
      context.fillStyle = color
      context.fill()
    }

    context.font = '700 18px Inter, Arial, sans-serif'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillStyle = '#ffffff'
    context.shadowColor = 'rgba(0, 0, 0, 0.9)'
    context.shadowBlur = 3
    context.fillText(`${Math.ceil(safeHp)} / ${Math.ceil(safeMaxHp)}`, 128, 48)
  }), [color, ratio, safeHp, safeMaxHp])

  useEffect(() => () => texture.dispose(), [texture])

  return (
    <sprite scale={[width, height, 1]}>
      <spriteMaterial map={texture} transparent alphaTest={0.02} depthTest depthWrite={false} toneMapped={false} />
    </sprite>
  )
}

const QUEST_MARKER_STYLE = {
  available: { color: '#ffd45c', border: '#fff0a8' },
  in_progress: { color: '#63b3ff', border: '#c8e7ff' },
  ready: { color: '#68dc87', border: '#d4ffdf' },
}

export function WorldQuestMarkerSprite({ marker, glyph }) {
  const style = QUEST_MARKER_STYLE[marker] ?? QUEST_MARKER_STYLE.available
  const texture = useMemo(() => createTexture(128, 128, (context) => {
    context.clearRect(0, 0, 128, 128)
    context.shadowColor = style.color
    context.shadowBlur = 18
    context.beginPath()
    context.arc(64, 64, 43, 0, Math.PI * 2)
    context.fillStyle = 'rgba(10, 18, 30, 0.94)'
    context.fill()
    context.lineWidth = 7
    context.strokeStyle = style.border
    context.stroke()

    context.shadowBlur = 9
    context.font = '800 72px Inter, Arial, sans-serif'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillStyle = style.color
    context.fillText(glyph, 64, 66)
  }), [glyph, style.border, style.color])

  useEffect(() => () => texture.dispose(), [texture])

  return (
    <sprite scale={[0.58, 0.58, 1]}>
      <spriteMaterial map={texture} transparent alphaTest={0.04} depthTest depthWrite={false} toneMapped={false} />
    </sprite>
  )
}
