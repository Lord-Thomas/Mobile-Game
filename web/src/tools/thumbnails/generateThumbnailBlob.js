import * as THREE from 'three'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

function disposeObject(object) {
  object.traverse((child) => {
    if (child.geometry) child.geometry.dispose()
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    materials.filter(Boolean).forEach((material) => material.dispose())
  })
}

function blobFromCanvas(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Thumbnail canvas export failed.'))
    }, type, quality)
  })
}

export async function generateThumbnailBlob({
  modelUrl,
  textureUrl = null,
  size = 512,
  margin = 1.24,
  rotationY = 0,
  view = 'front',
  format = 'image/webp',
  quality = 0.9,
}) {
  const scene = new THREE.Scene()
  const cameraFov = 35
  const camera = new THREE.PerspectiveCamera(cameraFov, 1, 0.01, 1000)
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: true,
  })

  renderer.setSize(size, size)
  renderer.setPixelRatio(1)
  renderer.outputColorSpace = THREE.SRGBColorSpace

  scene.add(new THREE.AmbientLight(0xffffff, 1.75))

  const keyLight = new THREE.DirectionalLight(0xffffff, 2.3)
  keyLight.position.set(3, 4, 5)
  scene.add(keyLight)

  const fillLight = new THREE.DirectionalLight(0xffffff, 0.85)
  fillLight.position.set(-4, 2, 3)
  scene.add(fillLight)

  const extension = modelUrl.split('?')[0].split('.').pop()?.toLowerCase()
  const model = extension === 'fbx'
    ? await new FBXLoader().loadAsync(modelUrl)
    : (await new GLTFLoader().loadAsync(modelUrl)).scene

  if (textureUrl) {
    const texture = await new THREE.TextureLoader().loadAsync(textureUrl)
    texture.colorSpace = THREE.SRGBColorSpace
    model.traverse((child) => {
      if (child.isMesh && child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material]
        materials.forEach((material) => {
          material.map = texture
          material.needsUpdate = true
        })
      }
    })
  }

  model.rotation.y = rotationY
  scene.add(model)

  const box = new THREE.Box3().setFromObject(model)
  const center = box.getCenter(new THREE.Vector3())
  model.position.sub(center)
  model.updateWorldMatrix(true, true)

  const centeredBox = new THREE.Box3().setFromObject(model)
  const centeredSize = centeredBox.getSize(new THREE.Vector3())
  const fovRad = THREE.MathUtils.degToRad(cameraFov)

  if (view === 'top') {
    const maxVisibleSize = Math.max(centeredSize.x, centeredSize.z, 0.001)
    const cameraDistance = (maxVisibleSize / 2 / Math.tan(fovRad / 2)) * margin
    camera.position.set(0, centeredBox.max.y + cameraDistance, 0)
    camera.up.set(0, 0, -1)
  } else {
    const maxVisibleSize = Math.max(centeredSize.y, centeredSize.z, 0.001)
    const cameraDistance = (maxVisibleSize / 2 / Math.tan(fovRad / 2)) * margin
    camera.position.set(centeredBox.max.x + cameraDistance, 0, 0)
    camera.up.set(0, 1, 0)
  }

  camera.lookAt(0, 0, 0)
  camera.near = 0.01
  camera.far = Math.max(100, camera.position.length() + centeredSize.length() * 2)
  camera.updateProjectionMatrix()

  renderer.render(scene, camera)
  const blob = await blobFromCanvas(renderer.domElement, format, quality)

  disposeObject(model)
  renderer.dispose()

  return blob
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
