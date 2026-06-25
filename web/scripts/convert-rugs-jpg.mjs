// Convertit les textures de tapis (src/gameObjects/tapis/*.png) en JPEG ≤1024px.
//
// Pourquoi : ces PNG (sans transparence, ~1000–1500px) pesaient ~6,9 Mo et partaient
// tels quels dans le bundle. En JPEG qualité 82, fit ≤1024px (ratio préservé), ils
// tombent à quelques centaines de Ko au total. Le glob de placeableObjects.js accepte
// déjà .jpg et l'objectId dérive du nom SANS extension → les tapis déjà posés sur les
// maps restent valides. Les PNG d'origine sont supprimés après conversion (git en garde
// l'historique).
//
// Usage : node scripts/convert-rugs-jpg.mjs

import Jimp from 'jimp'
import { readdir, unlink } from 'node:fs/promises'
import { join } from 'node:path'

const DIR = 'src/gameObjects/tapis'
const MAX = 1024
const QUALITY = 82

const files = (await readdir(DIR)).filter((f) => f.toLowerCase().endsWith('.png'))

for (const file of files) {
  const inPath = join(DIR, file)
  const outPath = join(DIR, file.replace(/\.png$/i, '.jpg'))
  const img = await Jimp.read(inPath)
  const { width, height } = img.bitmap
  if (Math.max(width, height) > MAX) img.scaleToFit(MAX, MAX) // préserve le ratio
  img.quality(QUALITY)
  await img.writeAsync(outPath)
  await unlink(inPath)
  console.log(`${file} ${width}x${height} -> ${file.replace(/\.png$/i, '.jpg')} ${img.bitmap.width}x${img.bitmap.height}`)
}
