const jimp = require('jimp')
const fs = require('fs')
const cp = require('child_process')

const files = cp
  .execSync('find public/textures public/models -type f \\( -iname "*.png" -o -iname "*.jpg" -o -iname "*.jpeg" \\)')
  .toString()
  .trim()
  .split('\n')
  .filter(Boolean)

;(async () => {
  const rows = []
  for (const f of files) {
    try {
      const i = await jimp.read(f)
      const sz = fs.statSync(f).size
      rows.push({ f, w: i.bitmap.width, h: i.bitmap.height, kb: Math.round(sz / 1024) })
    } catch (e) { /* ignore unreadable */ }
  }
  rows.sort((a, b) => b.w * b.h - a.w * a.h)
  let bigVram = 0
  for (const r of rows) {
    const npot = (r.w & (r.w - 1)) !== 0 || (r.h & (r.h - 1)) !== 0
    const vram = Math.round((r.w * r.h * 4 * 1.33) / 1048576)
    bigVram += vram
    const dim = (r.w + 'x' + r.h).padEnd(11)
    console.log(
      String(r.kb).padStart(5) + 'KB ' + dim + ' VRAM~' + String(vram).padStart(3) + 'MB ' +
      (npot ? 'NPOT' : '    ') + ' ' + r.f.replace('public/', ''),
    )
  }
  console.log('--- TOTAL VRAM si tout chargé: ~' + bigVram + 'MB sur ' + rows.length + ' textures ---')
})()
