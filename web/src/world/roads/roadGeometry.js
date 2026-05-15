import { BufferGeometry, CatmullRomCurve3, Float32BufferAttribute, Vector3 } from 'three'

export function createRoadCurve(points) {
  return new CatmullRomCurve3(
    points.map(([x, y, z]) => new Vector3(x, y, z)),
    false,
    'centripetal',
    0.5,
  )
}

export function getRoadFrame(road, t) {
  const curve = createRoadCurve(road.points)
  const point = curve.getPointAt(t)
  const tangent = curve.getTangentAt(t).normalize()
  const normal = new Vector3(-tangent.z, 0, tangent.x).normalize()
  return { curve, point, tangent, normal }
}

export function getRoadLotTransform({ road, t, side, setback, lateralOffset = 0 }) {
  const { point, tangent, normal } = getRoadFrame(road, t)
  const center = point
    .clone()
    .add(tangent.clone().multiplyScalar(lateralOffset))
    .add(normal.clone().multiplyScalar(side * setback))
  const directionToRoad = normal.clone().multiplyScalar(-side)

  return {
    position: [center.x, 0, center.z],
    roadFacingRotationY: Math.atan2(directionToRoad.x, directionToRoad.z),
    roadPosition: [point.x, 0, point.z],
  }
}

export function createRoadGeometry(points, width = 5, segments = 72, yOffset = 0.02, getHeight = null) {
  const curve = createRoadCurve(points)

  const positions = []
  const uvs = []
  const indices = []
  let distance = 0
  let previousPoint = null

  for (let index = 0; index <= segments; index += 1) {
    const t = index / segments
    const point = curve.getPoint(t)
    const tangent = curve.getTangent(t).normalize()
    const perpendicular = new Vector3(-tangent.z, 0, tangent.x)

    if (previousPoint) distance += point.distanceTo(previousPoint)
    previousPoint = point.clone()

    const left = point.clone().add(perpendicular.clone().multiplyScalar(width * 0.5))
    const right = point.clone().add(perpendicular.clone().multiplyScalar(-width * 0.5))
    const leftY = getHeight ? getHeight(left.x, left.z) : left.y
    const rightY = getHeight ? getHeight(right.x, right.z) : right.y

    positions.push(left.x, leftY + yOffset, left.z)
    positions.push(right.x, rightY + yOffset, right.z)
    uvs.push(0, distance / 6)
    uvs.push(1, distance / 6)

    if (index < segments) {
      const a = index * 2
      const b = a + 1
      const c = a + 2
      const d = a + 3
      indices.push(a, b, c)
      indices.push(b, d, c)
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}
