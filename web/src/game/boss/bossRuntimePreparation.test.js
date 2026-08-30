import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import {
  collectBossRuntimeTextures,
  createBossWarmupRoot,
  prepareBossRuntime,
} from './bossRuntimePreparation'

describe('boss runtime preparation', () => {
  it('includes hidden renderables without copying lights into the warmup root', () => {
    const runtimeRoot = new THREE.Group()
    const hidden = new THREE.Group()
    hidden.visible = false
    hidden.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()))
    hidden.add(new THREE.PointLight())
    runtimeRoot.add(hidden)

    const warmupRoot = createBossWarmupRoot(runtimeRoot)

    expect(warmupRoot.children).toHaveLength(1)
    expect(warmupRoot.children[0].isMesh).toBe(true)
    expect(warmupRoot.children[0].visible).toBe(true)
  })

  it('finds standard and shader-uniform textures only once', () => {
    const texture = new THREE.Texture()
    const standard = new THREE.MeshStandardMaterial({ map: texture })
    const shader = new THREE.ShaderMaterial({ uniforms: { uTexture: { value: texture } } })
    const root = new THREE.Group()
    root.add(new THREE.Mesh(new THREE.BoxGeometry(), standard))
    root.add(new THREE.Mesh(new THREE.BoxGeometry(), shader))

    expect(collectBossRuntimeTextures(root)).toEqual([texture])
  })

  it('uploads textures before asynchronously compiling the detached runtime graph', async () => {
    const texture = new THREE.Texture()
    const root = new THREE.Group()
    root.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ map: texture })))
    const calls = []
    const renderer = {
      initTexture: vi.fn(() => calls.push('texture')),
      compileAsync: vi.fn(async (warmupRoot) => {
        expect(warmupRoot.parent).toBe(null)
        calls.push('compile')
      }),
      compile: vi.fn(),
      info: { programs: [1, 2] },
    }

    const result = await prepareBossRuntime({
      renderer,
      scene: new THREE.Scene(),
      camera: new THREE.PerspectiveCamera(),
      runtimeRoot: root,
    })

    expect(calls).toEqual(['texture', 'compile'])
    expect(renderer.compile).not.toHaveBeenCalled()
    expect(result).toEqual({ textures: 1, programs: 2 })
  })
})
