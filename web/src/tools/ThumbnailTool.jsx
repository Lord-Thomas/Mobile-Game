import { useEffect, useMemo, useState } from 'react'
import { objectCatalog } from '../gameObjects/placeableObjects'
import { downloadBlob, generateThumbnailBlob } from './thumbnails/generateThumbnailBlob'

function ThumbnailTool() {
  const [captures, setCaptures] = useState({})
  const [busyObjectId, setBusyObjectId] = useState(null)
  const [toolMessage, setToolMessage] = useState('')
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

  const generateItemThumbnail = async (item) => {
    const modelUrl = item.thumbnailModelUrl ?? item.modelUrl
    if (!isThumbnailGeneratable(item)) return
    setBusyObjectId(item.id)
    setToolMessage(`Generation de ${item.name}...`)
    try {
      const blob = await generateThumbnailBlob({
        modelUrl,
        textureUrl: item.thumbnailTextureUrl,
        rotationY: (item.modelRotationY ?? 0) + (item.thumbnailRotationY ?? 0),
        margin: item.thumbnailMargin ?? 1.24,
        view: item.thumbnailView ?? 'front',
      })
      const url = URL.createObjectURL(blob)
      setCaptures((current) => {
        if (current[item.id]?.url) URL.revokeObjectURL(current[item.id].url)
        return { ...current, [item.id]: { url, blob } }
      })
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
          <button type="button" onClick={generateMissingThumbnails} disabled={Boolean(busyObjectId)}>
            Generer les manquantes
          </button>
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
                <button
                  type="button"
                  onClick={() => generateItemThumbnail(item)}
                  disabled={Boolean(busyObjectId) || !isThumbnailGeneratable(item)}
                >
                  {captures[item.id] ? 'Regenerer' : 'Generer'}
                </button>
                <button type="button" onClick={() => downloadCapture(item.id)} disabled={!captures[item.id]}>
                  Telecharger PNG
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
