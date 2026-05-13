import { getHouseFootprintColliders } from './house/houseLayout'

export const PLAYER_PLOT_SIZE = 32
export const OUTDOOR_WORLD_SIZE = 80
export const OUTDOOR_HALF_SIZE = OUTDOOR_WORLD_SIZE / 2

export const NEIGHBOR_HOUSES = [
  { position: [-24, 0, 22], color: '#ff8a80', roof: '#7b3f35', rotationY: 0.18 },
  { position: [24, 0, 24], color: '#80d8ff', roof: '#37474f', rotationY: -0.14 },
  { position: [-31, 0, 34], color: '#ffd180', roof: '#5d4037', rotationY: 0.28 },
  { position: [31, 0, 35], color: '#ccff90', roof: '#5d4037', rotationY: -0.24 },
]

export const FOREST_TREES = [
  [-37, -34, 1.1], [-31, -38, 0.85], [-22, -36, 1], [-12, -39, 0.9], [0, -37, 1.05],
  [11, -39, 0.82], [22, -36, 1.15], [33, -38, 0.92], [38, -29, 1.06], [36, -18, 0.86],
  [39, -7, 1.08], [37, 6, 0.96], [39, 18, 1.12], [35, 31, 0.9], [27, 38, 1.04],
  [14, 36, 0.85], [3, 39, 1.14], [-9, 36, 0.9], [-21, 39, 1.05], [-34, 35, 0.88],
  [-39, 25, 1.12], [-36, 13, 0.96], [-39, 0, 1.05], [-36, -12, 0.86], [-39, -24, 1],
  [-28, -31, 0.75], [28, -29, 0.78], [29, 31, 0.82], [-28, 27, 0.8],
]

export const OUTDOOR_PLAYER_COLLIDERS = [
  ...getHouseFootprintColliders(),
  ...NEIGHBOR_HOUSES.map((house) => ({
    x: house.position[0],
    z: house.position[2],
    hx: 3.7,
    hz: 3.2,
  })),
  ...FOREST_TREES
    .filter(([x, z]) => Math.abs(x) > 34 || Math.abs(z) > 34)
    .map(([x, z, scale]) => ({ x, z, hx: 0.28 * scale, hz: 0.28 * scale })),
]
