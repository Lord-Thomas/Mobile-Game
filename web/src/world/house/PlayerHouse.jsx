import HouseExteriorShell from './HouseExteriorShell'

function PlayerHouse({ exteriorVisible = true, children }) {
  return (
    <group name="PlayerHouse">
      <HouseExteriorShell visible={exteriorVisible} />
      {children}
    </group>
  )
}

export default PlayerHouse
