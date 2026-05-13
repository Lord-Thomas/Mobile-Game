function Road() {
  return (
    <group>
      <mesh position={[0, -0.018, 23]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[78, 6]} />
        <meshStandardMaterial color="#58616a" roughness={0.74} />
      </mesh>
      <mesh position={[0, -0.01, 23]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[74, 0.18]} />
        <meshStandardMaterial color="#f1e7b7" roughness={0.7} />
      </mesh>
      <mesh position={[35, -0.017, 28]} rotation={[-Math.PI / 2, 0, -0.56]}>
        <planeGeometry args={[24, 5.8]} />
        <meshStandardMaterial color="#58616a" roughness={0.74} />
      </mesh>
    </group>
  )
}

export default Road
