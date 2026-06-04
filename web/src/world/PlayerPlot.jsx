import { useLayoutEffect, useMemo, useRef } from 'react'
import { Object3D } from 'three'
import { PLAYER_PLOT_SIZE } from './outdoorData'

const _plotMatrixObject = new Object3D()

function PlayerPlot() {
  const dashRefs = useRef([])
  const halfSize = PLAYER_PLOT_SIZE * 0.5
  const dashLength = 0.72
  const dashGap = 0.42
  const dashY = 0.19
  const perimeterLength = PLAYER_PLOT_SIZE

  const dashCenters = useMemo(() => {
    const centers = []
    for (let offset = -halfSize + dashLength * 0.5; offset <= halfSize - dashLength * 0.5; offset += dashLength + dashGap) {
      centers.push(offset)
    }
    return centers
  }, [dashLength, dashGap, halfSize])

  useLayoutEffect(() => {
    dashRefs.current.forEach((mesh, side) => {
      if (!mesh) return
      dashCenters.forEach((offset, index) => {
        if (side === 0) {
          _plotMatrixObject.position.set(offset, dashY, halfSize)
          _plotMatrixObject.rotation.set(-Math.PI / 2, 0, 0)
        } else if (side === 1) {
          _plotMatrixObject.position.set(offset, dashY, -halfSize)
          _plotMatrixObject.rotation.set(-Math.PI / 2, 0, 0)
        } else if (side === 2) {
          _plotMatrixObject.position.set(halfSize, dashY, offset)
          _plotMatrixObject.rotation.set(-Math.PI / 2, 0, Math.PI / 2)
        } else {
          _plotMatrixObject.position.set(-halfSize, dashY, offset)
          _plotMatrixObject.rotation.set(-Math.PI / 2, 0, Math.PI / 2)
        }
        _plotMatrixObject.updateMatrix()
        mesh.setMatrixAt(index, _plotMatrixObject.matrix)
      })
      mesh.instanceMatrix.needsUpdate = true
    })
  }, [dashCenters, dashY, halfSize])

  return (
    <group userData={{ debugCategory: 'plot' }}>
      <mesh position={[0, 0.046, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[perimeterLength, perimeterLength]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.16} depthWrite={false} />
      </mesh>
      {[0, 1, 2, 3].map((side) => (
        <instancedMesh
          key={side}
          ref={(mesh) => { dashRefs.current[side] = mesh }}
          args={[null, null, dashCenters.length]}
          renderOrder={10}
        >
          <planeGeometry args={[dashLength, 0.12]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.92} depthWrite={false} />
        </instancedMesh>
      ))}
    </group>
  )
}

export default PlayerPlot
