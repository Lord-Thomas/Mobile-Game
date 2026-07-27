import { describe, expect, it } from 'vitest'
import { patchNaturalTerrainVertexShader } from './naturalTerrainShader'

describe('patchNaturalTerrainVertexShader', () => {
  it('computes the terrain world position without relying on the shadow-only worldPosition variable', () => {
    const source = `
      #include <common>
      void main() {
        vec3 transformed = position;
        #include <worldpos_vertex>
      }
    `

    const patched = patchNaturalTerrainVertexShader(source)

    expect(patched).toContain('varying vec3 vNaturalWorldPosition;')
    expect(patched).toContain('vNaturalWorldPosition = transformed;')
    expect(patched).not.toContain('modelMatrix * vec4(transformed')
    expect(patched).not.toContain('vNaturalWorldPosition = worldPosition.xyz;')
  })
})
