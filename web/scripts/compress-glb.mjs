// Recompresse tous les .glb de public/models en géométrie Draco (KHR_draco_mesh_compression).
//
// Pourquoi : les modèles étaient livrés sans compression géométrique (~120 Mo).
// Draco réduit la géométrie de 5 à 10× et le décodage se fait dans un Web Worker
// côté client (décodeur hébergé dans public/draco/, routé via useGLTF.setDecoderPath).
// => chargement bien plus rapide, AUCUN impact sur les freezes au spawn (le mesh
//    décodé est identique, et le décodage ne bloque pas le thread principal).
//
// Usage :
//   node scripts/compress-glb.mjs            # compresse tout public/models
//   node scripts/compress-glb.mjs --dry      # affiche les gains sans réécrire
//   node scripts/compress-glb.mjs path.glb   # un fichier précis
//
// Idempotent : un .glb déjà compressé Draco est ignoré.

import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS, KHRDracoMeshCompression } from '@gltf-transform/extensions'
import { draco, textureCompress } from '@gltf-transform/functions'
import draco3d from 'draco3dgltf'
import sharp from 'sharp'
import { readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'

const MODELS_DIR = 'public/models'
const dryRun = process.argv.includes('--dry')
const explicit = process.argv.slice(2).filter((a) => !a.startsWith('--'))

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule(),
    'draco3d.encoder': await draco3d.createEncoderModule(),
  })

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (extname(full).toLowerCase() === '.glb') out.push(full)
  }
  return out
}

const files = explicit.length ? explicit : walk(MODELS_DIR)
let totalBefore = 0
let totalAfter = 0
let skipped = 0

for (const file of files) {
  const before = statSync(file).size
  const document = await io.read(file)

  // Déjà compressé ? On saute (idempotent).
  if (document.getRoot().listExtensionsUsed().some((e) => e.extensionName === KHRDracoMeshCompression.EXTENSION_NAME)) {
    skipped += 1
    console.log(`skip  ${file}  (déjà Draco)`)
    continue
  }

  await document.transform(
    // Textures embarquées → WebP (gros gain sur les .glb texturés type stone_fence,
    // sofas, ballon). Décodé nativement par le navigateur au chargement, jamais au spawn.
    // Plafond 2048px : on n'agrandit jamais, on ne réduit que les textures plus grandes.
    textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 80, resize: [2048, 2048] }),
    // Géométrie → Draco (décodage dans un Web Worker, zéro freeze).
    draco({ method: 'edgebreaker', quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }),
  )

  const glb = await io.writeBinary(document)
  const after = glb.byteLength
  totalBefore += before
  totalAfter += after
  const pct = ((1 - after / before) * 100).toFixed(0)
  console.log(`${dryRun ? 'dry ' : 'wrote'} ${file}  ${(before / 1048576).toFixed(2)}→${(after / 1048576).toFixed(2)} Mo  (-${pct}%)`)

  if (!dryRun) {
    const { writeFileSync } = await import('node:fs')
    writeFileSync(file, glb)
  }
}

const saved = totalBefore - totalAfter
console.log(`\n${dryRun ? '[DRY] ' : ''}${files.length - skipped} fichier(s) compressé(s), ${skipped} ignoré(s).`)
if (totalBefore) {
  console.log(`Total: ${(totalBefore / 1048576).toFixed(1)}→${(totalAfter / 1048576).toFixed(1)} Mo  (-${(saved / 1048576).toFixed(1)} Mo, -${((saved / totalBefore) * 100).toFixed(0)}%)`)
}
