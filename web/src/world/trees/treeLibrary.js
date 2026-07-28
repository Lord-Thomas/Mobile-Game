import { SAVED_TREE_LIBRARY } from './treeLibrary.generated'

const TREE_LIBRARY_STORAGE_KEY = 'lab_tree_library_v1'

const BUILTIN_TREE_LIBRARY = {
  ashMedium: {
    id: 'ashMedium',
    name: 'Ash medium',
    config: {
      preset: 'Ash Medium',
      seed: 717902,
      position: { x: 0, y: -0.4, z: 0 },
      rotationY: 0,
      scale: 0.12,
      snapToGround: true,
      bark: { tint: 14207690 },
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
        hueShift: 0.02,
        saturation: 0.98,
        brightness: 1,
      },
    },
  },
  ashSmall: {
    id: 'ashSmall',
    name: 'Ash small',
    config: {
      preset: 'Ash Medium',
      seed: 346181,
      position: { x: 0, y: -0.4, z: 0 },
      rotationY: 0,
      scale: 0.1,
      snapToGround: true,
      bark: { tint: 14207690 },
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
        size: 4.8,
        count: 46,
        start: 0.42,
        sizeVariance: null,
        alphaTest: null,
        normalMode: 'generated',
        normalStrength: 0.78,
        colorMode: 'gameGrass',
        colorVariation: 0.3,
        hueShift: 0,
        saturation: 0.98,
        brightness: 1,
      },
    },
  },
  ashYoung: {
    id: 'ashYoung',
    name: 'Ash young',
    config: {
      preset: 'Ash Medium',
      seed: 823441,
      position: { x: 0, y: -0.4, z: 0 },
      rotationY: 0,
      scale: 0.085,
      snapToGround: true,
      bark: { tint: 14207690 },
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
        size: 4.25,
        count: 38,
        start: 0.42,
        sizeVariance: null,
        alphaTest: null,
        normalMode: 'generated',
        normalStrength: 0.78,
        colorMode: 'gameGrass',
        colorVariation: 0.28,
        hueShift: 0.03,
        saturation: 0.98,
        brightness: 0.98,
      },
    },
  },
  ashDistant: {
    id: 'ashDistant',
    name: 'Ash distant',
    config: {
      preset: 'Ash Medium',
      seed: 927411,
      position: { x: 0, y: -0.4, z: 0 },
      rotationY: 0,
      scale: 0.096,
      snapToGround: true,
      bark: { tint: 14207690 },
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
        size: 4.55,
        count: 30,
        start: 0.42,
        sizeVariance: null,
        alphaTest: null,
        normalMode: 'generated',
        normalStrength: 0.78,
        colorMode: 'gameGrass',
        colorVariation: 0.28,
        hueShift: 0,
        saturation: 0.98,
        brightness: 0.98,
      },
    },
  },
}

export const GAME_TREE_LIBRARY = {
  ...BUILTIN_TREE_LIBRARY,
  ...SAVED_TREE_LIBRARY,
}

function getStoredTreeLibrary() {
  if (typeof window === 'undefined') return {}

  try {
    const raw = window.localStorage.getItem(TREE_LIBRARY_STORAGE_KEY)
    const entries = raw ? JSON.parse(raw) : []
    if (!Array.isArray(entries)) return {}

    return entries.reduce((accumulator, item) => {
      if (!item?.id || !item?.config) return accumulator
      accumulator[item.id] = item
      return accumulator
    }, {})
  } catch {
    return {}
  }
}

export function getRuntimeTreeLibrary() {
  return {
    ...GAME_TREE_LIBRARY,
    ...getStoredTreeLibrary(),
  }
}

export function getTreeMapObjectId(treeId) {
  const safeId = String(treeId ?? 'tree')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
  return `tree_${safeId || 'tree'}`
}

export function getTreeIdFromMapObjectId(objectId) {
  return typeof objectId === 'string' && objectId.startsWith('tree_')
    ? objectId.slice(5)
    : null
}

export function getTreeMapObjectLibrary() {
  return Object.values(getRuntimeTreeLibrary()).map((tree) => getTreeMapObjectId(tree.id))
}

export function getTreeMapObjectEntries() {
  return Object.values(getRuntimeTreeLibrary()).map((tree) => ({
    objectId: getTreeMapObjectId(tree.id),
    tree,
  }))
}

export function getTreeForMapObjectId(objectId) {
  const treeId = getTreeIdFromMapObjectId(objectId)
  return treeId ? getRuntimeTreeLibrary()[treeId] ?? null : null
}

export function getLibraryTreeConfig(variantId, placement) {
  const library = getRuntimeTreeLibrary()
  const variant = library[variantId] ?? library.ashMedium
  return {
    ...variant.config,
    position: {
      ...variant.config.position,
      x: placement.x,
      z: placement.z,
    },
    rotationY: placement.rotationY ?? 0,
    scale: variant.config.scale * (placement.scaleMultiplier ?? 1),
  }
}
