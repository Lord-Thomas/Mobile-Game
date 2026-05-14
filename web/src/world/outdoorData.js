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

export const AUTHORED_TREES = [
  {
    id: 'player_plot_ash_medium_01',
    colliderRadius: 0.55,
    placement: {
      rule: 'authored_tree',
      area: 'player_plot_lawn',
      x: 8.6,
      z: 12.2,
    },
    config: {
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
    },
  },
]

export const OUTDOOR_PLAYER_COLLIDERS = [
  ...getHouseFootprintColliders(),
  ...NEIGHBOR_HOUSES.map((house) => ({
    x: house.position[0],
    z: house.position[2],
    hx: house.size[0] * 0.5 + 0.45,
    hz: house.size[2] * 0.5 + 0.45,
  })),
  ...FOREST_TREES
    .filter(([x, z]) => Math.abs(x) > 34 || Math.abs(z) > 34)
    .map(([x, z, scale]) => ({ x, z, hx: 0.28 * scale, hz: 0.28 * scale })),
  ...AUTHORED_TREES.map(({ config, colliderRadius }) => ({
    x: config.position.x,
    z: config.position.z,
    hx: colliderRadius,
    hz: colliderRadius,
  })),
]
