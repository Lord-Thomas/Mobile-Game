import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useLoader, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Box3, MathUtils, SRGBColorSpace, TextureLoader, Vector3 } from 'three'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { objectCatalog } from '../gameObjects/placeableObjects'
import { downloadBlob, generateThumbnailBlob } from './thumbnails/generateThumbnailBlob'

const ROTATION_STEP = Math.PI / 4

function isThumbnailGeneratable(item) {
  const url = item?.thumbnailModelUrl ?? item?.modelUrl
  return ['glb', 'fbx'].includes(url?.split('?')[0].split('.').pop()?.toLowerCase())
}

function getModelLoader(modelUrl) {
  return modelUrl?.split('?')[0].split('.').pop()?.toLowerCase() === 'fbx'
    ? FBXLoader
    : GLTFLoader
}

function cloneLoadedModel(loaded, modelUrl, texture = null) {
  const isFbx = modelUrl?.split('?')[0].split('.').pop()?.toLowerCase() === 'fbx'
  const source = isFbx ? loaded : loaded.scene
  const model = clone(source)

  model.traverse((child) => {
    if (!child.isMesh || !child.material) return
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    const clonedMaterials = materials.map((material) => {
      const next = material.clone()
      if (texture) {
        next.map = texture
        next.needsUpdate = true
      }
      return next
    })
    child.material = Array.isArray(child.material) ? clonedMaterials : clonedMaterials[0]
    child.castShadow = true
    child.receiveShadow = true
  })

  model.updateWorldMatrix(true, true)
  const box = new Box3().setFromObject(model)
  const center = box.getCenter(new Vector3())
  if (Number.isFinite(center.x) && Number.isFinite(center.y) && Number.isFinite(center.z)) {
    model.position.sub(center)
    model.updateWorldMatrix(true, true)
  }

  return model
}

function fitCameraToModel(camera, controls, model) {
  if (!model) return
  model.updateWorldMatrix(true, true)
  const box = new Box3().setFromObject(model)
  const size = box.getSize(new Vector3())
  const maxSize = Math.max(size.x, size.y, size.z, 0.001)
  const distance = (maxSize / 2 / Math.tan(MathUtils.degToRad(camera.fov) / 2)) * 1.45

  camera.position.set(distance * 0.82, distance * 0.42, distance * 0.82)
  camera.near = Math.max(0.001, distance / 100)
  camera.far = Math.max(100, distance * 10)
  camera.lookAt(0, 0, 0)
  camera.updateProjectionMatrix()

  if (controls) {
    controls.target.set(0, 0, 0)
    controls.update()
  }
}

function PlainPreviewModel({ item, rotationY, controlsRef }) {
  const modelUrl = item.thumbnailModelUrl ?? item.modelUrl
  const loaded = useLoader(getModelLoader(modelUrl), modelUrl)
  const model = useMemo(() => cloneLoadedModel(loaded, modelUrl), [loaded, modelUrl])
  const { camera } = useThree()

  useEffect(() => {
    fitCameraToModel(camera, controlsRef.current, model)
  }, [camera, controlsRef, model])

  return (
    <group rotation={[0, rotationY, 0]}>
      <primitive object={model} />
    </group>
  )
}

function TexturedPreviewModel({ item, rotationY, controlsRef }) {
  const modelUrl = item.thumbnailModelUrl ?? item.modelUrl
  const loaded = useLoader(getModelLoader(modelUrl), modelUrl)
  const texture = useLoader(TextureLoader, item.thumbnailTextureUrl)
  const model = useMemo(() => {
    const nextTexture = texture.clone()
    nextTexture.colorSpace = SRGBColorSpace
    return cloneLoadedModel(loaded, modelUrl, nextTexture)
  }, [loaded, modelUrl, texture])
  const { camera } = useThree()

  useEffect(() => {
    fitCameraToModel(camera, controlsRef.current, model)
  }, [camera, controlsRef, model])

  return (
    <group rotation={[0, rotationY, 0]}>
      <primitive object={model} />
    </group>
  )
}

function PreviewModel({ item, rotationY, controlsRef }) {
  const ModelComponent = item.thumbnailTextureUrl ? TexturedPreviewModel : PlainPreviewModel

  return <ModelComponent item={item} rotationY={rotationY} controlsRef={controlsRef} />
}

function ThumbnailStudioCanvas({ item, rotationY, canvasRef }) {
  const controlsRef = useRef(null)

  return (
    <Canvas
      gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true }}
      camera={{ fov: 35, position: [3.2, 1.8, 3.2], near: 0.01, far: 1000 }}
      onCreated={({ gl }) => {
        canvasRef.current = gl.domElement
      }}
    >
      <ambientLight intensity={1.75} />
      <directionalLight position={[3, 4, 5]} intensity={2.3} />
      <directionalLight position={[-4, 2, 3]} intensity={0.85} />
      <Suspense fallback={null}>
        <PreviewModel item={item} rotationY={rotationY} controlsRef={controlsRef} />
      </Suspense>
      <OrbitControls ref={controlsRef} makeDefault target={[0, 0, 0]} enableDamping dampingFactor={0.08} />
    </Canvas>
  )
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Capture canvas impossible.'))
    }, 'image/webp', 0.9)
  })
}

function ThumbnailTool() {
  const [captures, setCaptures] = useState({})
  const [saved, setSaved] = useState({})
  const [busyObjectId, setBusyObjectId] = useState(null)
  const [toolMessage, setToolMessage] = useState('')
  const [rotationOffsets, setRotationOffsets] = useState({})
  const canvasRef = useRef(null)
  const catalogItems = useMemo(
    () => Object.values(objectCatalog).filter(isThumbnailGeneratable),
    [],
  )
  const captureObjectId = useMemo(() => {
    try {
      return new URLSearchParams(window.location.search).get('capture')
    } catch {
      return null
    }
  }, [])
  const [selectedObjectId, setSelectedObjectId] = useState(catalogItems[0]?.id ?? '')
  const selectedItem = catalogItems.find((item) => item.id === selectedObjectId) ?? catalogItems[0] ?? null

  const getRotationY = (item) => {
    const offset = rotationOffsets[item.id] ?? 0
    return (item.modelRotationY ?? 0) + (item.thumbnailRotationY ?? 0) + offset
  }

  const rotateItem = (item, direction) => {
    setRotationOffsets((current) => ({
      ...current,
      [item.id]: ((current[item.id] ?? 0) + direction * ROTATION_STEP),
    }))
  }

  const generateItemThumbnail = async (item) => {
    const modelUrl = item.thumbnailModelUrl ?? item.modelUrl
    if (!isThumbnailGeneratable(item)) return
    setBusyObjectId(item.id)
    setToolMessage(`Generation de ${item.name}...`)
    try {
      const blob = await generateThumbnailBlob({
        modelUrl,
        textureUrl: item.thumbnailTextureUrl,
        rotationY: getRotationY(item),
        margin: item.thumbnailMargin ?? 1.24,
        view: item.thumbnailView ?? 'front',
      })
      const url = URL.createObjectURL(blob)
      setCaptures((current) => {
        if (current[item.id]?.url) URL.revokeObjectURL(current[item.id].url)
        return { ...current, [item.id]: { url, blob } }
      })
      setSaved((current) => { const next = { ...current }; delete next[item.id]; return next })
      setToolMessage(`Miniature prete : ${item.name}`)
    } catch (error) {
      setToolMessage(`Generation impossible pour ${item.name}: ${error.message}`)
    } finally {
      setBusyObjectId(null)
    }
  }

  const captureCurrentView = async () => {
    if (!selectedItem || !canvasRef.current) return
    setBusyObjectId(selectedItem.id)
    setToolMessage(`Capture de ${selectedItem.name}...`)
    try {
      const blob = await canvasToBlob(canvasRef.current)
      const url = URL.createObjectURL(blob)
      setCaptures((current) => {
        if (current[selectedItem.id]?.url) URL.revokeObjectURL(current[selectedItem.id].url)
        return { ...current, [selectedItem.id]: { url, blob } }
      })
      setSaved((current) => { const next = { ...current }; delete next[selectedItem.id]; return next })
      setToolMessage(`Vue capturee : ${selectedItem.name}`)
    } catch (error) {
      setToolMessage(`Capture impossible pour ${selectedItem.name}: ${error.message}`)
    } finally {
      setBusyObjectId(null)
    }
  }

  const downloadCapture = (objectId) => {
    const blob = captures[objectId]?.blob
    if (blob) downloadBlob(blob, `${objectId}.webp`)
  }

  const saveCapture = async (objectId) => {
    const blob = captures[objectId]?.blob
    if (!blob) return
    try {
      const res = await fetch('/dev/save-thumbnail', {
        method: 'POST',
        headers: { 'x-object-id': objectId, 'content-type': 'image/webp' },
        body: blob,
      })
      if (res.ok) {
        setSaved((current) => ({ ...current, [objectId]: true }))
        setToolMessage(`Sauvegarde : ${objectId}.webp`)
      } else {
        setToolMessage(`Erreur sauvegarde ${objectId}: ${await res.text()}`)
      }
    } catch (err) {
      setToolMessage(`Erreur sauvegarde ${objectId}: ${err.message}`)
    }
  }

  useEffect(() => {
    if (!captureObjectId) return
    const item = objectCatalog[captureObjectId]
    if (!item || !isThumbnailGeneratable(item)) return
    const timeout = window.setTimeout(() => {
      generateItemThumbnail(item)
    }, 0)
    return () => window.clearTimeout(timeout)
    // Auto-capture mode intentionally runs once from the URL parameter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captureObjectId])

  if (captureObjectId) {
    const capture = captures[captureObjectId]
    return (
      <main className="thumbnail-capture-page">
        {capture?.url ? <img src={capture.url} alt="" /> : null}
      </main>
    )
  }

  if (!selectedItem) {
    return (
      <main className="thumbnail-tool">
        <div className="thumbnail-tool-panel">
          <div className="thumbnail-tool-message">Aucun modele compatible.</div>
        </div>
      </main>
    )
  }

  const selectedCapture = captures[selectedItem.id]
  const currentRotationDegrees = Math.round(((rotationOffsets[selectedItem.id] ?? 0) * 180) / Math.PI)

  return (
    <main className="thumbnail-tool">
      <div className="thumbnail-studio">
        <aside className="thumbnail-studio-sidebar">
          <div className="thumbnail-tool-header compact">
            <div>
              <h1>Miniatures</h1>
              <p>Selectionne un objet, ajuste la vue 3D, puis capture.</p>
            </div>
          </div>

          <label className="thumbnail-field">
            <span>Objet</span>
            <select
              value={selectedItem.id}
              onChange={(event) => {
                setSelectedObjectId(event.target.value)
                setToolMessage('')
              }}
            >
              {catalogItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>

          <div className="thumbnail-selected-card">
            <div className="thumbnail-tool-preview">
              {selectedCapture?.url ? (
                <img src={selectedCapture.url} alt="" />
              ) : selectedItem.thumbnail ? (
                <img src={selectedItem.thumbnail} alt="" />
              ) : (
                <span>Aucune image</span>
              )}
            </div>
            <strong>{selectedItem.name}</strong>
            <span>{selectedCapture ? 'Nouvelle capture prete' : 'Miniature actuelle'}</span>
          </div>

          <div className="thumbnail-rotation-row">
            <button
              type="button"
              className="thumbnail-rotate-btn"
              onClick={() => rotateItem(selectedItem, -1)}
              disabled={Boolean(busyObjectId)}
              title="Tourner le modele a gauche 45 degres"
            >
              {'<'}
            </button>
            <span className="thumbnail-rotation-label">{currentRotationDegrees} deg</span>
            <button
              type="button"
              className="thumbnail-rotate-btn"
              onClick={() => rotateItem(selectedItem, 1)}
              disabled={Boolean(busyObjectId)}
              title="Tourner le modele a droite 45 degres"
            >
              {'>'}
            </button>
          </div>

          <div className="thumbnail-actions">
            <button type="button" onClick={captureCurrentView} disabled={Boolean(busyObjectId)}>
              Capturer la vue
            </button>
            <button type="button" onClick={() => downloadCapture(selectedItem.id)} disabled={!selectedCapture}>
              Telecharger
            </button>
            <button
              type="button"
              className={`thumbnail-save-btn ${saved[selectedItem.id] ? 'saved' : ''}`}
              onClick={() => saveCapture(selectedItem.id)}
              disabled={!selectedCapture || saved[selectedItem.id]}
            >
              {saved[selectedItem.id] ? 'Sauvegarde' : 'Sauvegarder'}
            </button>
          </div>

          {toolMessage && <div className="thumbnail-tool-message">{toolMessage}</div>}
        </aside>

        <section className="thumbnail-studio-stage">
          <div className="thumbnail-canvas-wrap">
            <ThumbnailStudioCanvas
              key={selectedItem.id}
              item={selectedItem}
              rotationY={getRotationY(selectedItem)}
              canvasRef={canvasRef}
            />
          </div>
        </section>
      </div>
    </main>
  )
}

export default ThumbnailTool
