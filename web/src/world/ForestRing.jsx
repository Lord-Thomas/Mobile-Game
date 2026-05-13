import { FOREST_TREES } from './outdoorData'

function Tree({ x, z, scale }) {
  return (
    <group position={[x, 0, z]} scale={scale}>
      <mesh position={[0, 0.72, 0]} castShadow>
        <cylinderGeometry args={[0.16, 0.22, 1.45, 8]} />
        <meshStandardMaterial color="#735235" roughness={0.86} />
      </mesh>
      <mesh position={[0, 1.75, 0]} castShadow>
        <coneGeometry args={[0.92, 1.8, 9]} />
        <meshStandardMaterial color="#2f7752" roughness={0.8} />
      </mesh>
      <mesh position={[0, 2.42, 0]} castShadow>
        <coneGeometry args={[0.68, 1.35, 9]} />
        <meshStandardMaterial color="#3c8a5f" roughness={0.8} />
      </mesh>
    </group>
  )
}

function ForestRing() {
  return (
    <group>
      {FOREST_TREES.map(([x, z, scale], index) => (
        <Tree key={`${x}-${z}-${index}`} x={x} z={z} scale={scale} />
      ))}
      <mesh position={[0, 0.05, -39]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[70, 3]} />
        <meshStandardMaterial color="#5e8e67" roughness={0.9} />
      </mesh>
    </group>
  )
}

export default ForestRing
