function PlayerPlot() {
  const fenceColor = '#e8d7ad'

  return (
    <group>
      <mesh position={[0, -0.014, 11.5]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2.2, 12]} />
        <meshStandardMaterial color="#d8c18d" roughness={0.82} />
      </mesh>

      {[-16, 16].map((x) => (
        <mesh key={`plot-side-${x}`} position={[x, 0.33, 0]}>
          <boxGeometry args={[0.18, 0.66, 21]} />
          <meshStandardMaterial color={fenceColor} roughness={0.72} />
        </mesh>
      ))}
      <mesh position={[-9, 0.33, 16]}>
        <boxGeometry args={[14, 0.66, 0.18]} />
        <meshStandardMaterial color={fenceColor} roughness={0.72} />
      </mesh>
      <mesh position={[9, 0.33, 16]}>
        <boxGeometry args={[14, 0.66, 0.18]} />
        <meshStandardMaterial color={fenceColor} roughness={0.72} />
      </mesh>

      {[-11.5, 11.5].map((x) => (
        <mesh key={`flower-${x}`} position={[x, -0.006, 9.2]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.34, 12]} />
          <meshStandardMaterial color={x < 0 ? '#f9d36a' : '#f28fb4'} roughness={0.78} />
        </mesh>
      ))}
    </group>
  )
}

export default PlayerPlot
