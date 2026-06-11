import { CanvasTexture, ClampToEdgeWrapping, SRGBColorSpace } from 'three'

// Procedural sprite textures for the particle engine. Drawn once on a canvas,
// cached per name. All textures are white + alpha so the shader can tint them.

const SIZE = 64
const cache = new Map()

function makeCanvas() {
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  return canvas
}

function drawSoftGlow(ctx) {
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(0.35, 'rgba(255,255,255,0.65)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, SIZE, SIZE)
}

function drawCircle(ctx) {
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 30)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(0.8, 'rgba(255,255,255,1)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, SIZE, SIZE)
}

function drawStar(ctx) {
  ctx.translate(32, 32)
  ctx.fillStyle = 'rgba(255,255,255,1)'
  ctx.beginPath()
  const spikes = 5
  const outer = 28
  const inner = 11
  for (let i = 0; i < spikes * 2; i += 1) {
    const radius = i % 2 === 0 ? outer : inner
    const angle = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2
    const x = Math.cos(angle) * radius
    const y = Math.sin(angle) * radius
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
  ctx.fill()
  // Soft halo so the star reads when small
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 30)
  gradient.addColorStop(0, 'rgba(255,255,255,0.5)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(-32, -32, SIZE, SIZE)
}

function drawSpark(ctx) {
  ctx.translate(32, 32)
  // Vertical streak + small cross, like an electric spark
  const vertical = ctx.createLinearGradient(0, -30, 0, 30)
  vertical.addColorStop(0, 'rgba(255,255,255,0)')
  vertical.addColorStop(0.5, 'rgba(255,255,255,1)')
  vertical.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = vertical
  ctx.fillRect(-2.5, -30, 5, 60)
  const horizontal = ctx.createLinearGradient(-18, 0, 18, 0)
  horizontal.addColorStop(0, 'rgba(255,255,255,0)')
  horizontal.addColorStop(0.5, 'rgba(255,255,255,0.9)')
  horizontal.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = horizontal
  ctx.fillRect(-18, -2, 36, 4)
  const core = ctx.createRadialGradient(0, 0, 0, 0, 0, 9)
  core.addColorStop(0, 'rgba(255,255,255,1)')
  core.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = core
  ctx.fillRect(-9, -9, 18, 18)
}

function drawSmoke(ctx) {
  // A few overlapping soft blobs make a believable puff
  const blobs = [
    [32, 34, 22, 0.5],
    [22, 28, 14, 0.4],
    [42, 26, 13, 0.4],
    [30, 20, 11, 0.35],
    [38, 40, 13, 0.4],
  ]
  for (const [x, y, radius, alpha] of blobs) {
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius)
    gradient.addColorStop(0, `rgba(255,255,255,${alpha})`)
    gradient.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, SIZE, SIZE)
  }
}

function drawFlame(ctx) {
  // Teardrop: bright round base, fading tapered tip
  const base = ctx.createRadialGradient(32, 42, 0, 32, 42, 18)
  base.addColorStop(0, 'rgba(255,255,255,1)')
  base.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = base
  ctx.fillRect(0, 0, SIZE, SIZE)
  for (let i = 0; i < 5; i += 1) {
    const y = 38 - i * 6.5
    const radius = 13 - i * 2.2
    const gradient = ctx.createRadialGradient(32, y, 0, 32, y, radius)
    gradient.addColorStop(0, `rgba(255,255,255,${0.85 - i * 0.14})`)
    gradient.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, SIZE, SIZE)
  }
}

const DRAWERS = {
  soft_glow: drawSoftGlow,
  circle: drawCircle,
  star: drawStar,
  spark: drawSpark,
  smoke: drawSmoke,
  flame: drawFlame,
}

export const PARTICLE_TEXTURE_NAMES = Object.keys(DRAWERS)

export function getParticleTexture(name) {
  const key = DRAWERS[name] ? name : 'soft_glow'
  if (cache.has(key)) return cache.get(key)
  const canvas = makeCanvas()
  const ctx = canvas.getContext('2d')
  DRAWERS[key](ctx)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.wrapS = ClampToEdgeWrapping
  texture.wrapT = ClampToEdgeWrapping
  cache.set(key, texture)
  return texture
}
