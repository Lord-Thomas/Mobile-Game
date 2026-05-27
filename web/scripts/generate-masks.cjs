/**
 * Génère le masque UV pour la personnalisation du personnage.
 * Approche deux passes :
 *   1. Classification par couleur HSL (priorité : pantalon → chemise → cheveux → peau)
 *   2. Filtre majoritaire spatial pour combler les trous et supprimer les faux positifs isolés
 * Usage : node scripts/generate-masks.cjs
 */
const Jimp = require('jimp')
const path = require('path')
const fs = require('fs')

const TEXTURE_PATH = path.join(__dirname, '../public/models/player/masks/base-texture.jpg')
const OUT_DIR = path.join(__dirname, '../public/models/player/masks')

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true })

const ZONE = { UNCLASSIFIED: -1, SKIN: 0, HAIR: 1, SHIRT: 2, PANTS: 3 }

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h, s, l = (max + min) / 2
  if (max === min) { h = s = 0 }
  else {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
      case g: h = ((b - r) / d + 2) / 6; break
      case b: h = ((r - g) / d + 4) / 6; break
    }
  }
  return [h * 360, s, l]
}

function classifyPixel(h, s, l) {
  // Ordre de priorité : zones les plus distinctives en premier
  // 1. PANTALON/CHAUSSURES — zones très sombres
  if (l <= 0.17) return ZONE.PANTS

  // 2. CHEMISE — rouge saturé (filtré AVANT la peau pour éviter confusion orange/rouge)
  if ((h >= 338 || h <= 22) && s >= 0.42 && l >= 0.17 && l <= 0.70) return ZONE.SHIRT

  // 3. CHEVEUX — ambre/jaune-orange, hue clairement distinct de la peau et de la chemise
  if (h >= 33 && h <= 65 && s >= 0.38 && l >= 0.30 && l <= 0.88) return ZONE.HAIR

  // 4. PEAU — tons chauds restants (chemise et cheveux déjà filtrés)
  if (h >= 8 && h <= 44 && s >= 0.10 && s <= 0.72 && l >= 0.22 && l <= 0.92) return ZONE.SKIN

  return ZONE.UNCLASSIFIED
}

async function main() {
  console.log('Lecture de la texture...')
  const img = await Jimp.read(TEXTURE_PATH)
  const W = img.getWidth(), H = img.getHeight()
  console.log(`Texture: ${W}x${H}px`)

  // --- Passe 1 : classification par couleur ---
  const classified = new Int8Array(W * H).fill(ZONE.UNCLASSIFIED)

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const pixel = img.getPixelColor(x, y)
      const r = (pixel >>> 24) & 0xFF
      const g = (pixel >>> 16) & 0xFF
      const b = (pixel >>> 8) & 0xFF
      classified[y * W + x] = classifyPixel(...rgbToHsl(r, g, b))
    }
  }

  console.log('Passe 1 terminée')
  printStats(classified, W * H)

  // --- Passe 2 : filtre majoritaire spatial (4 itérations, rayon 4px) ---
  // Reclassifie chaque pixel selon la zone dominante dans son voisinage
  // Effet : supprime les pixels isolés erronés ET comble les trous à l'intérieur des zones
  const RADIUS = 4
  const ITERATIONS = 5
  const MAJORITY_THRESHOLD = 0.55  // 55% des voisins classifiés doivent être d'accord

  for (let iter = 0; iter < ITERATIONS; iter++) {
    const next = new Int8Array(classified)
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const counts = [0, 0, 0, 0]  // skin, hair, shirt, pants
        let total = 0
        for (let dy = -RADIUS; dy <= RADIUS; dy++) {
          const ny = y + dy
          if (ny < 0 || ny >= H) continue
          for (let dx = -RADIUS; dx <= RADIUS; dx++) {
            const nx = x + dx
            if (nx < 0 || nx >= W) continue
            const z = classified[ny * W + nx]
            if (z >= 0) { counts[z]++; total++ }
          }
        }
        if (total === 0) continue
        let maxCount = 0, dominant = ZONE.UNCLASSIFIED
        for (let z = 0; z < 4; z++) {
          if (counts[z] > maxCount) { maxCount = counts[z]; dominant = z }
        }
        if (maxCount / total >= MAJORITY_THRESHOLD) {
          next[y * W + x] = dominant
        }
      }
    }
    classified.set(next)
    process.stdout.write(`  Itération ${iter + 1}/${ITERATIONS}... `)
    printStats(classified, W * H)
  }

  // --- Génération des images de sortie ---
  const combined = new Jimp(W, H, 0x00000000)
  const debug = new Jimp(W, H, 0x1A1A1AFF)

  const DEBUG_COLORS = [0xF5C5A3FF, 0xFFD700FF, 0xCC3333FF, 0x1A1A66FF]
  const MASK_CHANNELS = [
    [255, 0, 0, 0],   // skin → R
    [0, 255, 0, 0],   // hair → G
    [0, 0, 255, 0],   // shirt → B
    [0, 0, 0, 255],   // pants → A
  ]

  for (let i = 0; i < W * H; i++) {
    const z = classified[i]
    const x = i % W, y = Math.floor(i / W)
    if (z >= 0) {
      const [mR, mG, mB, mA] = MASK_CHANNELS[z]
      const colorVal = (mR * 0x1000000 + mG * 0x10000 + mB * 0x100 + mA) >>> 0
      combined.setPixelColor(colorVal, x, y)
      debug.setPixelColor(DEBUG_COLORS[z], x, y)
    }
  }

  await combined.writeAsync(path.join(OUT_DIR, 'parts-mask.png'))
  await debug.writeAsync(path.join(OUT_DIR, 'debug-zones.png'))
  console.log('\nMasque et debug sauvegardés dans', OUT_DIR)
  console.log('\nStats finales:')
  printStats(classified, W * H, true)
}

function printStats(classified, total, verbose = false) {
  const counts = [0, 0, 0, 0, 0]  // skin, hair, shirt, pants, unclassified
  for (let i = 0; i < classified.length; i++) {
    const z = classified[i]
    counts[z >= 0 ? z : 4]++
  }
  const names = ['Peau', 'Cheveux', 'Chemise', 'Pantalon', 'Autre']
  if (verbose) {
    names.forEach((n, i) => console.log(`  ${n}: ${counts[i]} (${(counts[i]/total*100).toFixed(1)}%)`))
  } else {
    const classified_pct = ((total - counts[4]) / total * 100).toFixed(1)
    console.log(`${classified_pct}% classifié (autre: ${(counts[4]/total*100).toFixed(1)}%)`)
  }
}

main().catch(console.error)
