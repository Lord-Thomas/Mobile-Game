// One row nearby, 3x3 tufts at medium distance, 9x9 in the coarse tier.
// Each row stays one quad; the fragment shader samples the original tuft texture
// once per pixel, independently of how many tufts that row represents.
export const BOUQUET_ROWS = [1, 3, 9]
export function bouquetWeights(fine, middle, level) {
  const width = level === 0 ? 1 : Math.sqrt(9 - 8 * fine)
  const count = level < 2 ? width : width * Math.sqrt(9 - 8 * middle)
  return { columns: count, rows: count }
}

export function addBouquetRows(geometry, level, Attribute) {
  const rows = BOUQUET_ROWS[level]
  const attributes = Object.entries(geometry.attributes)
  const vertexCount = geometry.attributes.position.count
  const originalIndices = [...geometry.index.array]
  for (const [name, attribute] of attributes) {
    const array = new Float32Array(attribute.array.length * rows)
    for (let row = 0; row < rows; row++) array.set(attribute.array, row * attribute.array.length)
    geometry.setAttribute(name, new Attribute(array, attribute.itemSize))
  }
  const rowIds = new Float32Array(vertexCount * rows)
  const indices = []
  for (let row = 0; row < rows; row++) {
    // Center row remains the exact original card; other rows form balanced pairs.
    const offset = row === 0 ? 0 : Math.ceil(row / 2) * (row % 2 ? -1 : 1)
    rowIds.fill(offset, row * vertexCount, (row + 1) * vertexCount)
    indices.push(...originalIndices.map(index => index + row * vertexCount))
  }
  geometry.setAttribute('grassRow', new Attribute(rowIds, 1))
  geometry.setIndex(indices)
  return geometry
}
