// Instrumentation du temps de chargement.
//
// But : savoir EXACTEMENT ce qui prend du temps entre le boot et l'affichage du
// monde. On pose des jalons (performance.mark) aux frontières des 3 phases :
//   1. boot JS          (jsBoot → assetsStart)
//   2. téléchargement   (assetsStart → assetsLoaded)   ← réseau + parse GLB/FBX/textures
//   3. warmup shaders   (assetsLoaded → warmupEnd)      ← gl.compileAsync
//
// À la fin, reportLoadTiming() imprime un tableau lisible + les ressources réseau
// les plus lentes (Resource Timing API). Aucun coût en prod : ce sont juste des
// marks ; le report ne tourne qu'une fois, au moment où l'overlay disparaît.

const marks = []

export function markLoad(name) {
  if (typeof performance === 'undefined') return
  const t = performance.now()
  marks.push({ name, t })
  try { performance.mark(`load:${name}`) } catch { /* ignore */ }
}

function fmt(ms) {
  return `${ms.toFixed(0)} ms`
}

let reported = false

export function reportLoadTiming() {
  if (reported || typeof performance === 'undefined') return
  reported = true

  // Phases consécutives entre jalons. performance.now() est relatif au début de
  // navigation, donc la 1re marque (jsBoot) = durée HTML + bundle JS (download+parse).
  const phases = []
  if (marks.length) {
    phases.push({ phase: 'navigation → jsBoot (HTML+JS)', durée: fmt(marks[0].t) })
  }
  for (let i = 1; i < marks.length; i += 1) {
    phases.push({
      phase: `${marks[i - 1].name} → ${marks[i].name}`,
      durée: fmt(marks[i].t - marks[i - 1].t),
    })
  }

  // Temps total depuis le tout début de la navigation (téléchargement du HTML/JS inclus).
  const nav = performance.getEntriesByType?.('navigation')?.[0]
  const totalSinceNav = nav ? performance.now() - nav.startTime : null

  // Top des ressources réseau les plus lentes (durée de transfert).
  const resources = (performance.getEntriesByType?.('resource') || [])
    .map((r) => ({
      url: r.name.replace(/^https?:\/\/[^/]+/, '').slice(0, 60),
      durée: fmt(r.duration),
      ko: Math.round((r.encodedBodySize || 0) / 1024),
      _d: r.duration,
    }))
    .sort((a, b) => b._d - a._d)
    .slice(0, 12)
    .map(({ _d, ...rest }) => rest)

  console.group('%c⏱️ Temps de chargement', 'font-weight:bold;font-size:13px')
  if (totalSinceNav != null) console.log(`Total (navigation → monde affiché) : ${fmt(totalSinceNav)}`)
  // Version texte (lisible dans toute console) + console.table (jolie dans DevTools).
  phases.forEach((p) => console.log(`  ${p.phase.padEnd(34)} ${p.durée}`))
  console.table(phases)
  console.log('Ressources réseau les plus lentes :')
  resources.forEach((r) => console.log(`  ${String(r.ko).padStart(5)} Ko  ${r.durée.padStart(7)}  ${r.url}`))
  console.table(resources)
  console.groupEnd()
}
