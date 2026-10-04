import React, { Component, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Color, Float32BufferAttribute, PlaneGeometry } from 'three'
import LushVegetation from '../src/world/vegetation/LushVegetation'
import { createLushLayout, seededRandom } from '../src/world/vegetation/lushLayout'
import './style.css'
const heightAt = (x, z) => Math.sin(x * 0.3) * Math.cos(z * 0.28) * 0.18
const plants = createLushLayout({ heightAt })
function Ground() {
  const geometry = useMemo(() => {
    const g = new PlaneGeometry(80, 80, 120, 120); g.rotateX(-Math.PI / 2)
    const colors = [], p = g.attributes.position
    const green = new Color('#71854b'), dirt = new Color('#ae9870')
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i); p.setY(i, heightAt(x, z) - 0.045)
      const path = 1 - Math.min(1, Math.max(0, (Math.abs(x - Math.sin(z * 0.2) * 0.45) - 1.25) / 0.8))
      const c = green.clone().lerp(dirt, path).multiplyScalar(0.93 + Math.sin(x * 3 + z * 5) * 0.07)
      colors.push(c.r, c.g, c.b)
    }
    g.setAttribute('color', new Float32BufferAttribute(colors, 3)); g.computeVertexNormals(); return g
  }, [])
  return <mesh geometry={geometry} receiveShadow><meshStandardMaterial vertexColors roughness={1}/></mesh>
}
function FrameMeter({ onUpdate }) {
  const stats = useRef({ time: 0, frames: 0 })
  useFrame((_, delta) => {
    stats.current.time += delta; stats.current.frames++
    if (stats.current.time > 1.5) { onUpdate(Math.round(stats.current.frames / stats.current.time)); stats.current = { time: 0, frames: 0 } }
  }); return null
}
function ContextTrees() {
  const trees = useMemo(() => {
    const random = seededRandom(91)
    return Array.from({length: 16}, (_, i) => ({ x: (i % 2 ? 1 : -1) * (10 + random() * 8), z: -14 + random() * 29, s: 0.8 + random() * 0.5 }))
  }, [])
  return <group>{trees.map((t, i) => <group key={i} position={[t.x, heightAt(t.x, t.z), t.z]} scale={t.s}>
    <mesh position={[0, 2.2, 0]} castShadow><cylinderGeometry args={[0.16, 0.27, 4.4, 7]}/><meshStandardMaterial color="#665742" roughness={1}/></mesh>
    {[[0,4.2,0,1.8],[-0.9,4.8,0.3,1.6],[0.65,5.35,-0.3,1.65]].map(([x,y,z,s], j) => <mesh key={j} position={[x,y,z]} scale={[s,s * 0.8,s]} castShadow><icosahedronGeometry args={[1,2]}/><meshStandardMaterial color={j === 1 ? '#5a784a' : '#45653e'} roughness={1}/></mesh>)}
  </group>)}</group>
}
class SceneBoundary extends Component {
  state = { error: false }
  static getDerivedStateFromError() { return { error: true } }
  render() { return this.state.error ? <div className="fallback">La scène 3D n’a pas pu démarrer. Essaie dans Safari ou recharge la page.</div> : this.props.children }
}
function App() {
  const [lush, setLush] = useState(true), [wind, setWind] = useState(true), [light, setLight] = useState(false)
  const [view, setView] = useState(0), [fps, setFps] = useState(null)
  const cameras = [[14, 10, 19], [2.5, 2.6, 9], [0, 22, 5]]
  return <main>
    <div className="scene"><SceneBoundary><Canvas key={view} shadows dpr={[1, light ? 1 : 1.5]} camera={{position:cameras[view],fov:48,near:0.1,far:130}} gl={{antialias: !light}}>
      <color attach="background" args={['#b9c5b0']}/><fog attach="fog" args={['#b9c5b0',28,72]}/>
      <hemisphereLight args={['#e7f0d8','#5f6042',1.7]}/>
      <directionalLight position={[-8,14,6]} intensity={2.5} color="#fff0ce" castShadow shadow-mapSize={[1024,1024]} shadow-camera-left={-24} shadow-camera-right={24} shadow-camera-top={24} shadow-camera-bottom={-24} shadow-normalBias={0.03}/>
      <Ground/><ContextTrees/><LushVegetation plants={plants} active={lush} wind={wind} reducedDensity={light}/>
      <OrbitControls target={[0,0.8,0]} minDistance={2} maxDistance={36} maxPolarAngle={Math.PI * 0.49} enablePan={false}/><FrameMeter onUpdate={setFps}/>
    </Canvas></SceneBoundary></div>
    <header><span className="eyebrow">MOBILE GAME / ÉTUDE 01</span><h1>Un peu plus sauvage.</h1><p>Buissons, fougères & herbes hautes.</p></header>
    <div className="badge"><span className="dot"/>{lush ? 'Végétation ajoutée' : 'Sol témoin'}<span className="fps">{fps ?? '—'} FPS</span></div>
    <section className="panel" aria-label="Réglages de la scène">
      <div className="compare"><button className={!lush ? 'selected' : ''} onClick={()=>setLush(false)}>Avant</button><button className={lush ? 'selected' : ''} onClick={()=>setLush(true)}>Luxuriant</button></div>
      <div className="options"><button onClick={()=>setView((view+1)%3)}>↗ {['Vue d’ensemble','Au sol','Vue du dessus'][view]}</button><button aria-pressed={wind} onClick={()=>setWind(!wind)}>Vent {wind?'activé':'arrêté'}</button><button aria-pressed={light} onClick={()=>setLight(!light)}>Mode léger {light?'oui':'non'}</button></div>
      <p className="hint">Glisse pour tourner · Pince pour zoomer</p>
    </section><footer>Étude isolée : mêmes plantes que la branche du jeu, décor de présentation simplifié.</footer>
  </main>
}
createRoot(document.getElementById('root')).render(<App/> )
