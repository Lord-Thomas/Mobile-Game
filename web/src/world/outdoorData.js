import { getHouseFootprintColliders } from './house/houseLayout'
import { roadLayout } from './roads/roadLayout'
import { getRoadLotTransform } from './roads/roadGeometry'
import { getLibraryTreeConfig } from './trees/treeLibrary'

export const PLAYER_PLOT_SIZE = 32
export const OUTDOOR_WORLD_SIZE = 80
export const OUTDOOR_HALF_SIZE = OUTDOOR_WORLD_SIZE / 2
export const MAIN_ROAD_Z = 22
export const ROAD_WIDTH = roadLayout.mainRoad.width
const SIDEWALK_WIDTH = 1.1
const FRONT_GARDEN_DEPTH = 5.8
const LOT_SETBACK = ROAD_WIDTH * 0.5 + SIDEWALK_WIDTH + FRONT_GARDEN_DEPTH
const TREE_ROAD_CLEARANCE = ROAD_WIDTH * 0.5 + 2.4

const neighborHouseSlots = [
  {
    id: 'neighbor_coral',
    t: 0.08,
    side: -1,
    color: '#ff8a80',
    trim: '#7b3f35',
    size: [5.8, 3.2, 4.8],
    lotSize: [12, 11],
    doorWall: 'north',
  },
  {
    id: 'neighbor_blue',
    t: 0.28,
    side: 1,
    color: '#80d8ff',
    trim: '#37474f',
    size: [6.2, 3.4, 5.1],
    lotSize: [12.5, 11],
    doorWall: 'south',
  },
  {
    id: 'neighbor_amber',
    t: 0.66,
    side: 1,
    color: '#ffd180',
    trim: '#5d4037',
    size: [5.2, 3, 4.4],
    lotSize: [12, 10.5],
    doorWall: 'south',
  },
  {
    id: 'neighbor_green',
    t: 0.86,
    side: 1,
    color: '#ccff90',
    trim: '#5d4037',
    size: [6.4, 3.2, 4.8],
    lotSize: [12.5, 11],
    doorWall: 'south',
  },
]

export const NEIGHBOR_HOUSES = neighborHouseSlots.map((slot) => {
  const transform = getRoadLotTransform({
    road: roadLayout.mainRoad,
    t: slot.t,
    side: slot.side,
    setback: LOT_SETBACK,
  })

  return {
    ...slot,
    position: transform.position,
    rotationY: transform.rotationY,
    roadPosition: transform.roadPosition,
  }
})

export const FOREST_TREES = [
  [-37, -34, 1.1], [-31, -38, 0.85], [-22, -36, 1], [-12, -39, 0.9], [0, -37, 1.05],
  [11, -39, 0.82], [22, -36, 1.15], [33, -38, 0.92], [38, -29, 1.06], [36, -18, 0.86],
  [39, -7, 1.08], [37, 6, 0.96], [39, 18, 1.12], [35, 31, 0.9], [27, 38, 1.04],
  [14, 36, 0.85], [3, 39, 1.14], [-9, 36, 0.9], [-21, 39, 1.05], [-34, 35, 0.88],
  [-39, 25, 1.12], [-36, 13, 0.96], [-39, 0, 1.05], [-36, -12, 0.86], [-39, -24, 1],
  [-28, -31, 0.75], [28, -29, 0.78], [29, 31, 0.82], [-28, 27, 0.8],
]

const naturalTreePlacements = [
  ['player_plot_ash_medium_01', 'player_plot_lawn', 8.6, 12.2, 'ashMedium', 0, 1],
  ['player_plot_ash_small_02', 'player_plot_lawn', -9.8, 10.9, 'ashSmall', 1.7, 1],
  ['player_plot_ash_young_03', 'player_plot_lawn', 12.4, -8.6, 'ashYoung', 2.9, 1],
  ['meadow_ash_medium_01', 'wild_grass', -24.2, 7.8, 'ashMedium', 0.6, 0.92],
  ['meadow_ash_medium_02', 'wild_grass', 21.8, -13.7, 'ashMedium', 2.2, 0.98],
  ['meadow_ash_small_03', 'wild_grass', -18.6, -23.3, 'ashSmall', 4.1, 0.95],
  ['meadow_ash_small_04', 'wild_grass', 27.4, 9.6, 'ashSmall', 5.4, 1.05],
  ['forest_edge_ash_01', 'forest_edge', -31.6, -18.4, 'ashMedium', 3.2, 1.08],
  ['forest_edge_ash_02', 'forest_edge', -35.4, 30.8, 'ashMedium', 1.1, 1.02],
  ['forest_edge_ash_03', 'forest_edge', 30.9, -25.8, 'ashMedium', 4.7, 1.12],
  ['forest_edge_ash_04', 'forest_edge', 32.8, 26.4, 'ashMedium', 2.6, 1.06],
  ['forest_edge_ash_05', 'forest_edge', 5.4, -32.6, 'ashMedium', 5.8, 0.96],
  ['southwest_forest_ash_01', 'dense_forest', -35.2, -34.4, 'ashMedium', 0.3, 1.1],
  ['southwest_forest_ash_02', 'dense_forest', -31.8, -36.1, 'ashMedium', 1.6, 0.98],
  ['southwest_forest_ash_03', 'dense_forest', -27.6, -34.8, 'ashMedium', 2.8, 1.04],
  ['southwest_forest_ash_04', 'dense_forest', -23.4, -36.6, 'ashSmall', 4.4, 1.08],
  ['southwest_forest_ash_05', 'dense_forest', -36.6, -30.7, 'ashMedium', 5.5, 1.02],
  ['southwest_forest_ash_06', 'dense_forest', -32.9, -31.5, 'ashMedium', 2.1, 1.16],
  ['southwest_forest_ash_07', 'dense_forest', -28.8, -30.1, 'ashSmall', 3.7, 1.12],
  ['southwest_forest_ash_08', 'dense_forest', -24.7, -31.8, 'ashMedium', 0.9, 1.07],
  ['southwest_forest_ash_09', 'dense_forest', -37.1, -26.6, 'ashSmall', 2.5, 1.06],
  ['southwest_forest_ash_10', 'dense_forest', -33.7, -25.4, 'ashMedium', 4.9, 1.08],
  ['southwest_forest_ash_11', 'dense_forest', -29.5, -26.7, 'ashMedium', 1.2, 0.97],
  ['southwest_forest_ash_12', 'dense_forest', -25.6, -24.9, 'ashMedium', 5.9, 1.01],
  ['southwest_forest_ash_13', 'dense_forest', -36.0, -21.8, 'ashSmall', 3.3, 1.14],
  ['southwest_forest_ash_14', 'dense_forest', -31.7, -22.2, 'ashMedium', 0.5, 1.13],
  ['southwest_forest_ash_15', 'dense_forest', -27.8, -20.7, 'ashSmall', 2.0, 1.09],
  ['southwest_forest_ash_16', 'dense_forest', -23.1, -22.5, 'ashMedium', 4.0, 1.05],
]

const distantTreePlacements = [
  ['distant_north_ash_01', 'distant_tree', -72.0, 58.0, 'ashDistant', 0.8, 1],
  ['distant_north_ash_02', 'distant_tree', -54.0, 68.5, 'ashDistant', 2.1, 0.92],
  ['distant_north_ash_03', 'distant_tree', -35.5, 61.0, 'ashDistant', 4.8, 1.06],
  ['distant_north_ash_04', 'distant_tree', 46.0, 65.0, 'ashDistant', 3.5, 0.96],
  ['distant_north_ash_05', 'distant_tree', 70.0, 55.5, 'ashDistant', 5.7, 1.04],
  ['distant_east_ash_01', 'distant_tree', 59.0, 34.5, 'ashDistant', 1.3, 0.94],
  ['distant_east_ash_02', 'distant_tree', 76.5, 19.0, 'ashDistant', 2.7, 1.1],
  ['distant_east_ash_03', 'distant_tree', 66.0, -8.0, 'ashDistant', 4.2, 0.98],
  ['distant_east_ash_04', 'distant_tree', 79.5, -35.0, 'ashDistant', 0.4, 1.02],
  ['distant_south_ash_01', 'distant_tree', -69.0, -58.5, 'ashDistant', 5.2, 1.08],
  ['distant_south_ash_02', 'distant_tree', -50.5, -74.0, 'ashDistant', 1.0, 0.9],
  ['distant_south_ash_03', 'distant_tree', -14.0, -67.5, 'ashDistant', 2.9, 0.98],
  ['distant_south_ash_04', 'distant_tree', 25.0, -72.5, 'ashDistant', 4.5, 1.04],
  ['distant_south_ash_05', 'distant_tree', 61.5, -60.0, 'ashDistant', 0.2, 0.94],
  ['distant_west_ash_01', 'distant_tree', -73.0, 22.5, 'ashDistant', 3.8, 1.01],
  ['distant_west_ash_02', 'distant_tree', -82.0, -9.0, 'ashDistant', 5.1, 0.96],
  ['distant_west_ash_03', 'distant_tree', -64.5, -42.0, 'ashDistant', 1.8, 1.1],
]

function clamp01(value) {
  return Math.min(1, Math.max(0, value))
}

function getDistanceToRoadPoints(x, z, points) {
  let minDistance = Infinity

  for (let index = 0; index < points.length - 1; index += 1) {
    const [ax, , az] = points[index]
    const [bx, , bz] = points[index + 1]
    const abX = bx - ax
    const abZ = bz - az
    const apX = x - ax
    const apZ = z - az
    const lengthSq = abX * abX + abZ * abZ
    const t = lengthSq > 0 ? clamp01((apX * abX + apZ * abZ) / lengthSq) : 0
    const closestX = ax + abX * t
    const closestZ = az + abZ * t

    minDistance = Math.min(minDistance, Math.hypot(x - closestX, z - closestZ))
  }

  return minDistance
}

function hasTreeRoadClearance(x, z) {
  return getDistanceToRoadPoints(x, z, roadLayout.mainRoad.points) > TREE_ROAD_CLEARANCE
}

function createTreeEntries(placements, includeCollider = true) {
  return placements.map(([
  id,
  area,
  x,
  z,
  variantId,
  rotationY,
  scaleMultiplier,
  ]) => ({
    id,
    ...(includeCollider ? { colliderRadius: 0.42 + scaleMultiplier * 0.18 } : {}),
    placement: {
      rule: 'authored_tree',
      area,
      x,
      z,
    },
    variantId,
    config: getLibraryTreeConfig(variantId, { x, z, rotationY, scaleMultiplier }),
  })).filter(({ config }) => hasTreeRoadClearance(config.position.x, config.position.z))
}

export const AUTHORED_TREES = createTreeEntries(naturalTreePlacements)
export const DISTANT_TREES = createTreeEntries(distantTreePlacements, false)

export const OUTDOOR_PLAYER_COLLIDERS = [
  ...getHouseFootprintColliders(),
  ...NEIGHBOR_HOUSES.map((house) => ({
    x: house.position[0],
    z: house.position[2],
    hx: house.size[0] * 0.5 + 0.45,
    hz: house.size[2] * 0.5 + 0.45,
  })),
  ...AUTHORED_TREES.map(({ config, colliderRadius }) => ({
    x: config.position.x,
    z: config.position.z,
    hx: colliderRadius,
    hz: colliderRadius,
  })),
]
