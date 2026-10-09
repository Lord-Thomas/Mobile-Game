import { DynamicDrawUsage, InstancedBufferGeometry, InstancedBufferAttribute, Sphere } from 'three'

export function createStreamedGeometry(base, slot, sharedRanks = null) {
  const geometry = new InstancedBufferGeometry().copy(base)
  // BufferGeometry.copy shares userData by reference. Upload tracking must
  // belong to this slot, or another slot can suppress its GPU buffer update.
  geometry.userData = { version: -1 }
  geometry.setAttribute('instancePlacement', new InstancedBufferAttribute(slot.data, 4).setUsage(DynamicDrawUsage))
  geometry.setAttribute('instanceDensityRank', sharedRanks
    ?? new InstancedBufferAttribute(slot.ranks, 1).setUsage(DynamicDrawUsage))
  geometry.instanceCount = 0
  geometry.boundingBox = slot.bounds.clone()
  geometry.boundingSphere = slot.bounds.getBoundingSphere(new Sphere())
  return geometry
}

export function syncStreamedGeometry(geometry, slot, surface) {
  if (geometry.userData.version === slot.version) return false
  const attribute = geometry.attributes.instancePlacement
  attribute.clearUpdateRanges()
  attribute.addUpdateRange(0, slot.count * 4)
  attribute.needsUpdate = true
  if (surface) {
    const rankAttribute = geometry.attributes.instanceDensityRank
    rankAttribute.clearUpdateRanges()
    rankAttribute.addUpdateRange(0, slot.count)
    rankAttribute.needsUpdate = true
    geometry.boundingBox.copy(slot.bounds)
    slot.bounds.getBoundingSphere(geometry.boundingSphere)
  }
  geometry.userData.version = slot.version
  return true
}
