function NeighborHouse({ position, color, roof, rotationY = 0, scale = 1 }) {
  return (
    <group position={position} rotation={[0, rotationY, 0]} scale={scale}>
      <mesh position={[0, 1.25, 0]} castShadow receiveShadow>
        <boxGeometry args={[5.6, 2.5, 4.6]} />
        <meshStandardMaterial color={color} roughness={0.72} />
      </mesh>
      <mesh position={[0, 2.78, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[4.25, 1.7, 4]} />
        <meshStandardMaterial color={roof} roughness={0.84} />
      </mesh>
      <mesh position={[0, 0.78, 2.34]}>
        <boxGeometry args={[0.85, 1.36, 0.08]} />
        <meshStandardMaterial color="#6b4a36" roughness={0.65} />
      </mesh>
      {[-1.65, 1.65].map((x) => (
        <mesh key={x} position={[x, 1.46, 2.38]}>
          <boxGeometry args={[0.72, 0.62, 0.08]} />
          <meshStandardMaterial color="#dff6ff" emissive="#b7e8ff" emissiveIntensity={0.1} roughness={0.42} />
        </mesh>
      ))}
    </group>
  )
}

export default NeighborHouse
