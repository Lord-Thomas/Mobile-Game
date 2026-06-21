// POC : encode quelques textures en .ktx2 (Basis) côté Node.
// ETC1S pour albédo (petit), UASTC pour normal maps (qualité).
import { readFile, writeFile, stat } from 'node:fs/promises'
import { encodeToKTX2 } from 'ktx2-encoder'
import jimp from 'jimp'

// Node n'a pas de canvas : on décode PNG/JPG -> RGBA brut avec jimp.
const imageDecoder = async (buffer) => {
  const img = await jimp.read(Buffer.from(buffer))
  return { data: img.bitmap.data, width: img.bitmap.width, height: img.bitmap.height }
}

const JOBS = [
  { src: 'public/textures/environment/floors/sol-parquet-01.png', uastc: false }, // albédo -> ETC1S
  { src: 'public/textures/outdoor/asphalt-clean-normal.jpg', uastc: true },        // normal -> UASTC
]

for (const job of JOBS) {
  const buf = await readFile(job.src)
  const before = (await stat(job.src)).size
  const out = job.src.replace(/\.(png|jpe?g)$/i, '.ktx2')
  try {
    const ktx2 = await encodeToKTX2(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), {
      isUASTC: job.uastc,
      generateMipmap: true,
      imageDecoder,
    })
    await writeFile(out, Buffer.from(ktx2))
    const after = (await stat(out)).size
    console.log(`${job.uastc ? 'UASTC' : 'ETC1S'}  ${(before / 1024) | 0}KB -> ${(after / 1024) | 0}KB  ${out.replace('public/', '')}`)
  } catch (e) {
    console.log('ERREUR', job.src, e.message)
  }
}
