function PlayerHouse({ children }) {
  return (
    <group name="PlayerHouse" userData={{ debugCategory: 'house' }}>
      {children}
    </group>
  )
}

export default PlayerHouse
