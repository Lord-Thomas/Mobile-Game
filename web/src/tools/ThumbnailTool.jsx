import { useEffect, useMemo, useState } from 'react'
import { objectCatalog } from '../gameObjects/placeableObjects'
import { downloadBlob, generateThumbnailBlob } from './thumbnails/generateThumbnailBlob'

const ROTATION_STEP = Math.PI / 4 // 45°

function ThumbnailTool() {
  const [captures, setCaptures] = useState({})
  const [saved, setSaved] = useState({})
  const [busyObjectId, setBusyObjectId] = useState(null)
  const [toolMessage, setToolMessage] = useState('')
  const [rotationOffsets, setRotationOffsets] = useState({})
  const catalogItems = Object.values(objectCatalog)
  const isThumbnailGeneratable = (item) => {
    const url = item.thumbnailModelUrl ?? item.modelUrl
    return ['glb', 'fbx'].includes(url?.split('?')[0].split('.').pop()?.toLowerCase())
  }
  const generatableItems = catalogItems.filter(isThumbnailGeneratable)
  const captureObjectId = useMemo(() => {
    try {
      return new URLSearchParams(window.location.search).get('capture')
    } catch {
      return null
    }
  }, [])

  const getRotationY = (item) => {
    const offset = rotationOffsets[item.id] ?? 0
    return (item.modelRotationY ?? 0) + (item.thumbnailRotationY ?? 0) + offset
  }

  const rotateItem = (item, direction) => {
    setRotationOffsets((current) => ({
      ...current,
      [item.id]: ((current[item.id] ?? 0) + direction * ROTATION_STEP),
    }))
    setCaptures((current) => {
      const next = { ...current }
      delete next[item.id]
      return next
    })
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

  const generateMissingThumbnails = async () => {
    for (const item of generatableItems) {
      if (!captures[item.id]) await generateItemThumbnail(item)
    }
    setToolMessage('Generation terminee. Telecharge les miniatures validees en WebP.')
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
    generateItemThumbnail(item)
  }, [captureObjectId])

  if (captureObjectId) {
    const capture = captures[captureObjectId]
    return (
      <main className="thumbnail-capture-page">
        {capture?.url ? <img src={capture.url} alt="" /> : null}
      </main>
    )
  }

  return (
    <main className="thumbnail-tool">
      <div className="thumbnail-tool-panel">
        <div className="thumbnail-tool-header">
          <div>
            <h1>Object thumbnails</h1>
            <p>Outil dev : genere des WebP carres depuis les GLB. Le jeu charge ensuite seulement les images sauvegardees.</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={generateMissingThumbnails} disabled={Boolean(busyObjectId)}>
              Generer les manquantes
            </button>
            <button
              type="button"
              onClick={async () => {
                for (const item of generatableItems) {
                  if (captures[item.id] && !saved[item.id]) await saveCapture(item.id)
                }
                setToolMessage('Toutes les miniatures generees ont ete sauvegardees.')
              }}
              disabled={Boolean(busyObjectId) || Object.keys(captures).length === 0}
              style={{ background: 'rgba(100,220,140,0.18)', borderColor: 'rgba(100,220,140,0.4)', color: '#7ef5a0' }}
            >
              Tout sauvegarder
            </button>
          </div>
        </div>
        {toolMessage && <div className="thumbnail-tool-message">{toolMessage}</div>}
        <div className="thumbnail-tool-grid">
          {catalogItems.map((item) => (
            <div className="thumbnail-tool-card" key={item.id}>
              <div className="thumbnail-tool-preview">
                {captures[item.id]?.url ? (
                  <img src={captures[item.id].url} alt="" />
                ) : item.thumbnail ? (
                  <img src={item.thumbnail} alt="" />
                ) : (
                  <span>Aucune image</span>
                )}
              </div>
              <div className="thumbnail-tool-info">
                <strong>{item.name}</strong>
                <span>{isThumbnailGeneratable(item) ? 'Compatible' : 'Miniature manuelle'}</span>
                {isThumbnailGeneratable(item) && (
                  <div className="thumbnail-rotation-row">
                    <button
                      type="button"
                      className="thumbnail-rotate-btn"
                      onClick={() => rotateItem(item, -1)}
                      disabled={Boolean(busyObjectId)}
                      title="Tourner à gauche 45°"
                    >
                      ↺
                    </button>
                    <span className="thumbnail-rotation-label">
                      {Math.round(((rotationOffsets[item.id] ?? 0) * 180) / Math.PI)}°
                    </span>
                    <button
                      type="button"
                      className="thumbnail-rotate-btn"
                      onClick={() => rotateItem(item, 1)}
                      disabled={Boolean(busyObjectId)}
                      title="Tourner à droite 45°"
                    >
                      ↻
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => generateItemThumbnail(item)}
                  disabled={Boolean(busyObjectId) || !isThumbnailGeneratable(item)}
                >
                  {captures[item.id] ? 'Regenerer' : 'Generer'}
                </button>
                <button type="button" onClick={() => downloadCapture(item.id)} disabled={!captures[item.id]}>
                  Telecharger
                </button>
                <button
                  type="button"
                  className={`thumbnail-save-btn ${saved[item.id] ? 'saved' : ''}`}
                  onClick={() => saveCapture(item.id)}
                  disabled={!captures[item.id] || saved[item.id]}
                >
                  {saved[item.id] ? '✓ Sauvegarde' : 'Sauvegarder'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}

export default ThumbnailTool
