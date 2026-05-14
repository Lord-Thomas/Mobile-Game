import { getHouseFootprintColliders } from './house/houseLayout'
import { roadLayout } from './roads/roadLayout'
import { getRoadLotTransform } from './roads/roadGeometry'

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

const baseTreeConfig = {
  preset: 'Ash Medium',
  seed: 717902,
  position: {
    x: 8.6,
    y: -0.4,
    z: 12.2,
  },
  rotationY: 0,
  scale: 0.12,
  snapToGround: true,
  bark: {
    tint: 14207690,
  },
  branch: {
    levels: null,
    trunkLength: null,
    trunkRadius: null,
    firstBranchAngle: null,
    secondBranchAngle: null,
    trunkChildren: null,
    branchChildren: null,
    trunkGnarliness: null,
    forceStrength: null,
  },
  leaves: {
    tint: 15657192,
    size: 5.5,
    count: 55,
    start: 0.42,
    sizeVariance: null,
    alphaTest: null,
    normalMode: 'generated',
    normalStrength: 0.78,
    colorMode: 'gameGrass',
    colorVariation: 0.34,
    hueShift: 0.03,
    saturation: 0.98,
    brightness: 1,
  },
}

const naturalTreePlacements = [
  ['player_plot_ash_medium_01', 'player_plot_lawn', 8.6, 12.2, 717902, 0, 0.12, 5.5, 55, 0.03],
  ['player_plot_ash_small_02', 'player_plot_lawn', -9.8, 10.9, 346181, 1.7, 0.1, 4.8, 46, -0.02],
  ['player_plot_ash_young_03', 'player_plot_lawn', 12.4, -8.6, 823441, 2.9, 0.085, 4.25, 38, 0.05],
  ['meadow_ash_medium_01', 'wild_grass', -24.2, 7.8, 184977, 0.6, 0.11, 5.1, 50, -0.04],
  ['meadow_ash_medium_02', 'wild_grass', 21.8, -13.7, 616294, 2.2, 0.118, 5.4, 54, 0.02],
  ['meadow_ash_small_03', 'wild_grass', -18.6, -23.3, 931728, 4.1, 0.095, 4.65, 43, 0.06],
  ['meadow_ash_small_04', 'wild_grass', 27.4, 9.6, 254390, 5.4, 0.105, 4.9, 48, -0.01],
  ['forest_edge_ash_01', 'forest_edge', -31.6, -18.4, 475910, 3.2, 0.13, 5.8, 60, 0.04],
  ['forest_edge_ash_02', 'forest_edge', -35.4, 30.8, 759311, 1.1, 0.122, 5.55, 56, -0.03],
  ['forest_edge_ash_03', 'forest_edge', 30.9, -25.8, 579403, 4.7, 0.136, 6.0, 62, 0.01],
  ['forest_edge_ash_04', 'forest_edge', 32.8, 26.4, 868052, 2.6, 0.128, 5.7, 58, 0.05],
  ['forest_edge_ash_05', 'forest_edge', 5.4, -32.6, 402887, 5.8, 0.115, 5.25, 52, -0.05],
  ['southwest_forest_ash_01', 'dense_forest', -35.2, -34.4, 128734, 0.3, 0.132, 5.9, 62, -0.03],
  ['southwest_forest_ash_02', 'dense_forest', -31.8, -36.1, 582013, 1.6, 0.118, 5.45, 57, 0.02],
  ['southwest_forest_ash_03', 'dense_forest', -27.6, -34.8, 773904, 2.8, 0.125, 5.7, 59, 0.05],
  ['southwest_forest_ash_04', 'dense_forest', -23.4, -36.6, 934118, 4.4, 0.108, 5.0, 51, -0.05],
  ['southwest_forest_ash_05', 'dense_forest', -36.6, -30.7, 436227, 5.5, 0.122, 5.55, 58, 0.01],
  ['southwest_forest_ash_06', 'dense_forest', -32.9, -31.5, 691542, 2.1, 0.139, 6.15, 64, 0.04],
  ['southwest_forest_ash_07', 'dense_forest', -28.8, -30.1, 204861, 3.7, 0.112, 5.2, 53, -0.02],
  ['southwest_forest_ash_08', 'dense_forest', -24.7, -31.8, 859310, 0.9, 0.128, 5.8, 60, 0.03],
  ['southwest_forest_ash_09', 'dense_forest', -37.1, -26.6, 315486, 2.5, 0.106, 4.95, 50, -0.04],
  ['southwest_forest_ash_10', 'dense_forest', -33.7, -25.4, 790251, 4.9, 0.13, 5.95, 62, 0.06],
  ['southwest_forest_ash_11', 'dense_forest', -29.5, -26.7, 547806, 1.2, 0.116, 5.35, 55, 0],
  ['southwest_forest_ash_12', 'dense_forest', -25.6, -24.9, 173695, 5.9, 0.121, 5.55, 57, -0.01],
  ['southwest_forest_ash_13', 'dense_forest', -36.0, -21.8, 668402, 3.3, 0.114, 5.3, 54, 0.05],
  ['southwest_forest_ash_14', 'dense_forest', -31.7, -22.2, 246039, 0.5, 0.136, 6.05, 63, -0.02],
  ['southwest_forest_ash_15', 'dense_forest', -27.8, -20.7, 902614, 2.0, 0.109, 5.1, 52, 0.02],
  ['southwest_forest_ash_16', 'dense_forest', -23.1, -22.5, 380175, 4.0, 0.126, 5.75, 59, -0.06],
]

const distantTreePlacements = [
  ['distant_north_ash_01', 'distant_tree', -72.0, 58.0, 927411, 0.8, 0.096, 4.55, 30, -0.04],
  ['distant_north_ash_02', 'distant_tree', -54.0, 68.5, 640128, 2.1, 0.088, 4.25, 26, 0.03],
  ['distant_north_ash_03', 'distant_tree', -35.5, 61.0, 183904, 4.8, 0.102, 4.75, 32, 0.01],
  ['distant_north_ash_04', 'distant_tree', 46.0, 65.0, 731695, 3.5, 0.092, 4.4, 28, -0.02],
  ['distant_north_ash_05', 'distant_tree', 70.0, 55.5, 408217, 5.7, 0.1, 4.65, 31, 0.04],
  ['distant_east_ash_01', 'distant_tree', 59.0, 34.5, 519472, 1.3, 0.09, 4.3, 27, -0.03],
  ['distant_east_ash_02', 'distant_tree', 76.5, 19.0, 264813, 2.7, 0.106, 4.9, 34, 0.02],
  ['distant_east_ash_03', 'distant_tree', 66.0, -8.0, 895146, 4.2, 0.094, 4.45, 29, 0],
  ['distant_east_ash_04', 'distant_tree', 79.5, -35.0, 372508, 0.4, 0.098, 4.6, 30, 0.05],
  ['distant_south_ash_01', 'distant_tree', -69.0, -58.5, 613284, 5.2, 0.104, 4.85, 33, -0.01],
  ['distant_south_ash_02', 'distant_tree', -50.5, -74.0, 148602, 1.0, 0.086, 4.15, 25, 0.03],
  ['distant_south_ash_03', 'distant_tree', -14.0, -67.5, 780391, 2.9, 0.094, 4.45, 29, -0.05],
  ['distant_south_ash_04', 'distant_tree', 25.0, -72.5, 356720, 4.5, 0.1, 4.7, 31, 0.02],
  ['distant_south_ash_05', 'distant_tree', 61.5, -60.0, 904573, 0.2, 0.09, 4.3, 27, -0.02],
  ['distant_west_ash_01', 'distant_tree', -73.0, 22.5, 237849, 3.8, 0.097, 4.55, 30, 0.01],
  ['distant_west_ash_02', 'distant_tree', -82.0, -9.0, 570216, 5.1, 0.092, 4.35, 28, 0.04],
  ['distant_west_ash_03', 'distant_tree', -64.5, -42.0, 819305, 1.8, 0.106, 4.9, 34, -0.03],
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
  seed,
  rotationY,
  scale,
  leafSize,
  leafCount,
  hueShift,
  ]) => ({
    id,
    ...(includeCollider ? { colliderRadius: 0.42 + scale * 1.35 } : {}),
    placement: {
      rule: 'authored_tree',
      area,
      x,
      z,
    },
    config: {
      ...baseTreeConfig,
      seed,
      position: {
        ...baseTreeConfig.position,
        x,
        z,
      },
      rotationY,
      scale,
      leaves: {
        ...baseTreeConfig.leaves,
        size: leafSize,
        count: leafCount,
        hueShift,
        colorVariation: 0.28 + (seed % 9) * 0.018,
        brightness: 0.96 + (seed % 7) * 0.015,
      },
    },
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
