// Encode les textures de SURFACE en .ktx2 (Basis), à côté des sources (PNG/JPG gardés).
// - normal maps / textures à alpha  -> UASTC (qualité)
// - albédo/roughness opaques         -> ETC1S (petit)
// Pré-flip vertical : les textures KTX2 ont flipY=false (ignoré pour formats GPU
// compressés) ; on flippe à l'encodage pour un rendu identique au PNG (flipY=true).
// EXCLUS : masks joueur (recoloration précise), modèles, thumbnails UI.
import { readFile, writeFile, stat } from 'node:fs/promises'
import { execSync } from 'node:child_process'
import jimp from 'jimp'
import { encodeToKTX2 } from 'ktx2-encoder'

const DIRS = [
  'public/textures/environment/floors',
  'public/textures/environment/walls',
  'public/textures/outdoor',
  'public/textures/wood',
  'public/models/ball/textures',
]

const files = execSync(
  `find ${DIRS.join(' ')} -type f \\( -iname "*.png" -o -iname "*.jpg" -o -iname "*.jpeg" \\)`,
).toString().trim().split('\n').filter(Boolean)

// jimp décode -> RGBA, avec pré-flip vertical pour compenser flipY=false du KTX2.
const makeDecoder = () => async (buffer) => {
  const img = await jimp.read(Buffer.from(buffer))
  img.flip(false, true)
  return { data: img.bitmap.data, width: img.bitmap.width, height: img.bitmap.height }
}

let n = 0
let savedVram = 0
for (const src of files) {
  const probe = await jimp.read(src)
  const hasAlpha = probe.hasAlpha()
  const isNormal = /normal/i.test(src)
  const uastc = isNormal || hasAlpha
  const out = src.replace(/\.(png|jpe?g)$/i, '.ktx2')
  const buf = await readFile(src)
  try {
    const ktx2 = await encodeToKTX2(
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
      { isUASTC: uastc, generateMipmap: true, imageDecoder: makeDecoder() },
    )
    await writeFile(out, Buffer.from(ktx2))
    const w = probe.bitmap.width
    const h = probe.bitmap.height
    savedVram += ((w * h * 4 * 1.33) - (w * h * (uastc ? 1 : 0.5))) / 1048576
    const after = Math.round((await stat(out)).size / 1024)
    n += 1
    console.log(`${uastc ? 'UASTC' : 'ETC1S'}  ${w}x${h} -> ${after}KB  ${out.replace('public/', '')}`)
  } catch (e) {
    console.log('ERREUR', src, String(e && e.message || e))
  }
}
console.log(`--- ${n}/${files.length} encodées, ~${Math.round(savedVram)}MB VRAM économisés ---`)
