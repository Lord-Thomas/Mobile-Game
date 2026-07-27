export function patchNaturalTerrainVertexShader(vertexShader) {
  return vertexShader
    .replace(
      '#include <common>',
      `
      #include <common>
      varying vec3 vNaturalWorldPosition;
      `,
    )
    .replace(
      '#include <worldpos_vertex>',
      `
      #include <worldpos_vertex>
      vNaturalWorldPosition = transformed;
      `,
    )
}
