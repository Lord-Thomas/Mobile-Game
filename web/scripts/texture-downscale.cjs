const jimp = require('jimp')
const fs = require('fs')
const cp = require('child_process')

// Downscale oversized / NPOT textures to <=1024 power-of-two, in place.
// Runtime is untouched (same paths/formats) ; git history garde les originaux.
// EXCLUSIONS : masks du joueur (recoloration précise), variantes -512 déjà faites.
const MAX = 1024
const EXCLUDE = [/models\/player\/masks\//, /-512\./, /face-details|parts-mask/]

const nearestPotLeq = (n, cap) => {
  let p = 1
  while (p * 2 <= Math.min(n, cap)) p *= 2
  return p
}

const files = cp
  .execSync('find public/textures public/models/ball/textures -type f \\( -iname "*.png" -o -iname "*.jpg" -o -iname "*.jpeg" \\)')
  .toString().trim().split('\n').filter(Boolean)

;(async () => {
  let touched = 0
  let savedVram = 0
  for (const f of files) {
    if (EXCLUDE.some((re) => re.test(f))) continue
    let img
    try { img = await jimp.read(f) } catch { continue }
    const w = img.bitmap.width
    const h = img.bitmap.height
    const npot = (w & (w - 1)) !== 0 || (h & (h - 1)) !== 0
    const tooBig = w > MAX || h > MAX
    if (!npot && !tooBig) continue
    const tw = nearestPotLeq(w, MAX)
    const th = nearestPotLeq(h, MAX)
    if (tw === w && th === h) continue
    const beforeVram = (w * h * 4 * 1.33) / 1048576
    const afterVram = (tw * th * 4 * 1.33) / 1048576
    if (/\.jpe?g$/i.test(f)) img.quality(85)
    img.resize(tw, th, jimp.RESIZE_BICUBIC)
    await img.writeAsync(f)
    savedVram += beforeVram - afterVram
    touched += 1
    console.log(`${w}x${h} -> ${tw}x${th}  ${f.replace('public/', '')}`)
  }
  console.log(`--- ${touched} textures redimensionnées, ~${Math.round(savedVram)}MB de VRAM économisés ---`)
})()
