import * as THREE from 'three'

function isRenderableObject(object) {
  return Boolean(
    object?.geometry
    && object?.material
    && (object.isMesh || object.isLine || object.isPoints || object.isSprite),
  )
}

function addTextureValue(value, textures) {
  if (value?.isTexture) {
    textures.add(value)
    return
  }
  if (Array.isArray(value)) value.forEach((entry) => addTextureValue(entry, textures))
}

export function collectBossRuntimeTextures(root) {
  const textures = new Set()
  root?.traverse((object) => {
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    materials.filter(Boolean).forEach((material) => {
      Object.values(material).forEach((value) => addTextureValue(value, textures))
      Object.values(material.uniforms ?? {}).forEach((uniform) => {
        addTextureValue(uniform?.value, textures)
      })
    })
  })
  return [...textures]
}

// compileAsync peut s'étaler sur plusieurs images. On ne révèle donc jamais les
// objets cachés de la scène jouée : ils pourraient apparaître pendant la
// préparation. Ce graphe détaché réutilise exactement les géométries et matériaux
// finaux, mais tous ses objets sont rendables et hors de la scène visible.
export function createBossWarmupRoot(runtimeRoot) {
  const warmupRoot = new THREE.Group()
  warmupRoot.name = 'slime-boss-runtime-warmup'

  runtimeRoot?.traverse((object) => {
    if (!isRenderableObject(object)) return
    const proxy = object.clone(false)
    proxy.visible = true
    proxy.frustumCulled = false
    proxy.position.set(0, 0, 0)
    proxy.rotation.set(0, 0, 0)
    proxy.scale.set(1, 1, 1)
    proxy.layers.enableAll()
    warmupRoot.add(proxy)
  })

  return warmupRoot
}

export async function prepareBossRuntime({
  renderer,
  scene,
  camera,
  runtimeRoot,
  waitFrame = () => Promise.resolve(),
}) {
  if (!renderer || !scene || !camera || !runtimeRoot) {
    throw new Error('Boss runtime preparation requires a mounted renderer, scene, camera and root.')
  }

  const textures = collectBossRuntimeTextures(runtimeRoot)
  for (const texture of textures) {
    renderer.initTexture(texture)
    // Répartit les uploads plutôt que de créer une seule longue tâche JS/GPU.
    await waitFrame()
  }

  const warmupRoot = createBossWarmupRoot(runtimeRoot)
  const warmupCamera = camera.clone()
  warmupCamera.layers.enableAll()
  warmupCamera.updateMatrixWorld(true)

  try {
    if (typeof renderer.compileAsync === 'function') {
      await renderer.compileAsync(warmupRoot, warmupCamera, scene)
    } else {
      renderer.compile(warmupRoot, warmupCamera, scene)
    }
  } catch (error) {
    // Garde-fou pour les pilotes sans KHR_parallel_shader_compile fiable. Le
    // graphe reste détaché, donc la passe synchrone ne peut rien faire apparaître.
    renderer.compile(warmupRoot, warmupCamera, scene)
    if (!renderer.info?.programs?.length) throw error
  } finally {
    warmupRoot.clear()
  }

  return {
    textures: textures.length,
    programs: renderer.info?.programs?.length ?? null,
  }
}
