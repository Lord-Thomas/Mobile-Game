const OBJECT_FRONT_AXIS = '+x'
const OBJECT_FRONT_ROTATION_Y = Math.PI / 2
let nextObjectInstanceId = 1

const rugImageModules = import.meta.glob('./tapis/*.{avif,jpeg,jpg,png,svg,webp}', {
  eager: true,
  import: 'default',
  query: '?url',
})

function getRugFileStem(path) {
  return path.split('/').pop()?.replace(/\.[^.]+$/, '') ?? 'tapis'
}

function normalizeObjectId(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function getRugName(fileStem) {
  const cleanedName = fileStem
    .replace(/^tapis[-_ ]*/i, '')
    .replace(/[-_]+/g, ' ')
    .trim()

  if (!cleanedName) return 'Tapis'

  return `Tapis ${cleanedName.replace(/\b\w/g, (letter) => letter.toUpperCase())}`
}

const rugCatalog = Object.fromEntries(
  Object.entries(rugImageModules)
    .sort(([leftPath], [rightPath]) => leftPath.localeCompare(rightPath))
    .map(([path, imageUrl]) => {
      const fileStem = getRugFileStem(path)
      const objectId = `rug_${normalizeObjectId(fileStem)}`

      return [objectId, {
        id: objectId,
        type: 'rug',
        name: getRugName(fileStem),
        category: 'rugs',
        thumbnail: imageUrl,
        imageUrl,
        price: 55,
        targetLongSideMeters: 2.15,
        frontAxis: OBJECT_FRONT_AXIS,
      }]
    }),
)

function generateSeats({
  objectId,
  width,
  seatWidth = 1.03,
  frontX = 0.38,
  zCenter = 0,
  y = 0,
  localRotationY = OBJECT_FRONT_ROTATION_Y,
  seatedForwardOffset = 0.14,
  standUpForwardOffset = 0.24,
  interactionDistance = 1.1,
}) {
  const seatCount = Math.max(1, Math.floor(width / seatWidth))
  const spacing = width / seatCount

  return Array.from({ length: seatCount }, (_, index) => {
    const z = zCenter - width / 2 + spacing / 2 + index * spacing

    return {
      id: `${objectId}_seat_${index + 1}`,
      localPosition: [frontX, y, z],
      localRotationY,
      seatedForwardOffset,
      standUpForwardOffset,
      interactionDistance,
    }
  })
}

function generateSingleSeat({
  objectId,
  x = 0,
  y = 0,
  z = 0,
  localRotationY = OBJECT_FRONT_ROTATION_Y,
  seatedForwardOffset = 0.08,
  standUpForwardOffset = 0.16,
  interactionDistance = 0.65,
}) {
  return [
    {
      id: `${objectId}_seat_1`,
      localPosition: [x, y, z],
      localRotationY,
      seatedForwardOffset,
      standUpForwardOffset,
      interactionDistance,
    },
  ]
}

export const objectCatalog = {
  soccer_goal: {
    id: 'soccer_goal',
    type: 'goal',
    name: 'Cage',
    category: 'furniture',
    thumbnail: '/ui/object-thumbnails/soccer_goal.png',
    price: 0,
    frontAxis: OBJECT_FRONT_AXIS,
    thumbnailRotationY: Math.PI * 1.78,
    thumbnailScale: 0.62,
  },
  modular_sofa: {
    id: 'modular_sofa',
    type: 'sofa',
    name: 'Canape modulaire',
    category: 'furniture',
    thumbnail: '/ui/object-thumbnails/modular_sofa.webp',
    thumbnailModelUrl: '/models/placeables/modular-sofa/modular-sofa.fbx',
    thumbnailTextureUrl: '/models/placeables/modular-sofa/tripo_convert_9412eb1b-7c85-49b7-86b8-96b1b5cc9732.fbm/modularsofa3dmodel_basecolor.JPEG',
    price: 180,
    frontAxis: OBJECT_FRONT_AXIS,
    thumbnailRotationY: Math.PI * 1.72,
    thumbnailScale: 0.94,
    seating: {
      kind: 'sofa',
      width: 2.07,
      seatWidth: 1.03,
      frontX: 0.38,
    },
  },
  wooden_desk: {
    id: 'wooden_desk',
    type: 'desk',
    name: 'Bureau bois',
    category: 'furniture',
    modelUrl: '/models/placeables/wooden+desk+3d+model.glb',
    thumbnail: '/ui/object-thumbnails/wooden_desk.webp',
    price: 120,
    targetWidthMeters: 0.82,
    frontAxis: OBJECT_FRONT_AXIS,
    thumbnailRotationY: Math.PI * 0.18,
    thumbnailScale: 0.86,
  },
  beige_table: {
    id: 'beige_table',
    type: 'table',
    name: 'Table beige',
    category: 'furniture',
    modelUrl: '/models/placeables/beige_table/model.glb',
    thumbnail: '/ui/object-thumbnails/beige_table.webp',
    price: 110,
    targetWidthMeters: 1.15,
    frontAxis: OBJECT_FRONT_AXIS,
    thumbnailRotationY: Math.PI * 0.18,
    thumbnailScale: 0.88,
  },
  office_chair: {
    id: 'office_chair',
    type: 'chair',
    name: 'Chaise bureau',
    category: 'furniture',
    modelUrl: '/models/placeables/office+chair+3d+model.glb',
    thumbnail: '/ui/object-thumbnails/office_chair.webp',
    price: 90,
    targetWidthMeters: 0.5,
    frontAxis: OBJECT_FRONT_AXIS,
    thumbnailRotationY: Math.PI * 1.68,
    thumbnailScale: 1,
    seating: {
      kind: 'single',
      y: 0.08,
      seatedForwardOffset: 0.05,
      standUpForwardOffset: 0.12,
      interactionDistance: 0.48,
    },
  },
  modern_chair: {
    id: 'modern_chair',
    type: 'chair',
    name: 'Chaise moderne',
    category: 'furniture',
    modelUrl: '/models/placeables/modern_chair/model.glb',
    thumbnail: '/ui/object-thumbnails/modern_chair.webp',
    price: 285,
    targetWidthMeters: 0.38,
    frontAxis: OBJECT_FRONT_AXIS,
    modelRotationY: Math.PI,
    thumbnailRotationY: Math.PI * 1.65,
    thumbnailScale: 1,
    seating: {
      kind: 'single',
      y: 0.06,
      seatedForwardOffset: 0.05,
      standUpForwardOffset: 0.12,
      interactionDistance: 0.5,
    },
  },
  orange_chair: {
    id: 'orange_chair',
    type: 'chair',
    name: 'Chaise orange',
    category: 'furniture',
    modelUrl: '/models/placeables/orange_chair/model.glb',
    thumbnail: '/ui/object-thumbnails/orange_chair.webp',
    price: 95,
    targetWidthMeters: 0.45,
    frontAxis: OBJECT_FRONT_AXIS,
    modelRotationY: Math.PI,
    thumbnailRotationY: Math.PI * 1.65,
    thumbnailScale: 1,
    seating: {
      kind: 'single',
      y: 0.06,
      seatedForwardOffset: 0.05,
      standUpForwardOffset: 0.12,
      interactionDistance: 0.5,
    },
  },
  orange_egg_chair: {
    id: 'orange_egg_chair',
    type: 'chair',
    name: 'Fauteuil oeuf orange',
    category: 'furniture',
    modelUrl: '/models/placeables/orange_egg_chair/model.glb',
    thumbnail: '/ui/object-thumbnails/orange_egg_chair.webp',
    price: 150,
    targetWidthMeters: 0.82,
    frontAxis: OBJECT_FRONT_AXIS,
    thumbnailRotationY: Math.PI * 1.62,
    thumbnailScale: 0.9,
    seating: {
      kind: 'single',
      y: 0.05,
      seatedForwardOffset: 0.08,
      standUpForwardOffset: 0.18,
      interactionDistance: 0.65,
    },
  },
  throne_chair: {
    id: 'throne_chair',
    type: 'chair',
    name: 'Fauteuil trone',
    category: 'furniture',
    modelUrl: '/models/placeables/throne_chair/model.glb',
    thumbnail: '/ui/object-thumbnails/throne_chair.webp',
    price: 220,
    targetWidthMeters: 0.72,
    frontAxis: OBJECT_FRONT_AXIS,
    modelRotationY: Math.PI,
    thumbnailRotationY: Math.PI * 1.64,
    thumbnailScale: 0.9,
    seating: {
      kind: 'single',
      y: 0.07,
      seatedForwardOffset: 0.06,
      standUpForwardOffset: 0.16,
      interactionDistance: 0.58,
    },
  },
  amber_stool: {
    id: 'amber_stool',
    type: 'table',
    name: 'Table ambre',
    category: 'furniture',
    modelUrl: '/models/placeables/amber_stool/model.glb',
    thumbnail: '/ui/object-thumbnails/amber_stool.webp',
    price: 80,
    targetHeightMeters: 0.34,
    frontAxis: OBJECT_FRONT_AXIS,
    thumbnailRotationY: Math.PI * 1.55,
    thumbnailScale: 1,
  },
  pink_plush_sofa: {
    id: 'pink_plush_sofa',
    type: 'sofa',
    name: 'Canape peluche rose',
    category: 'furniture',
    modelUrl: '/models/placeables/pink_plush_sofa/model.glb',
    thumbnail: '/ui/object-thumbnails/pink_plush_sofa.webp',
    price: 210,
    targetWidthMeters: 1.55,
    frontAxis: OBJECT_FRONT_AXIS,
    thumbnailRotationY: Math.PI * 1.7,
    thumbnailScale: 0.86,
    seating: {
      kind: 'sofa',
      width: 2.14,
      seatWidth: 1.07,
      frontX: 0.38,
    },
  },
  pink_sofa: {
    id: 'pink_sofa',
    type: 'sofa',
    name: 'Canape rose',
    category: 'furniture',
    modelUrl: '/models/placeables/pink_sofa/model.glb',
    thumbnail: '/ui/object-thumbnails/pink_sofa.webp',
    price: 190,
    targetWidthMeters: 1.55,
    frontAxis: OBJECT_FRONT_AXIS,
    thumbnailRotationY: Math.PI * 1.7,
    thumbnailScale: 0.86,
    seating: {
      kind: 'sofa',
      width: 2.14,
      seatWidth: 1.07,
      frontX: 0.38,
    },
  },
  red_sofa: {
    id: 'red_sofa',
    type: 'sofa',
    name: 'Canape rouge',
    category: 'furniture',
    modelUrl: '/models/placeables/red_sofa/model.glb',
    thumbnail: '/ui/object-thumbnails/red_sofa.webp',
    price: 240,
    targetWidthMeters: 1.65,
    frontAxis: OBJECT_FRONT_AXIS,
    thumbnailRotationY: Math.PI * 1.7,
    thumbnailScale: 0.82,
    seating: {
      kind: 'sofa',
      width: 2.28,
      seatWidth: 1.14,
      frontX: 0.4,
    },
  },
  flat_screen_display: {
    id: 'flat_screen_display',
    type: 'interactive_tv',
    name: 'Tele',
    category: 'electronics',
    modelUrl: '/models/placeables/flat_screen_display/model.glb',
    thumbnail: '/ui/object-thumbnails/flat_screen_display.webp',
    price: 260,
    targetWidthMeters: 0.95,
    frontAxis: OBJECT_FRONT_AXIS,
    thumbnailRotationY: Math.PI * 1.75,
    thumbnailScale: 0.82,
    screenName: 'TV_SCREEN',
    screen: {
      position: [0.045, 0.78, 0],
      rotation: [0, Math.PI / 2, 0],
      size: [1.16, 0.65],
    },
  },
  youtube_subscriber_frame: {
    id: 'youtube_subscriber_frame',
    type: 'youtube_subscriber_frame',
    name: 'Cadre YouTube Thoms_gail',
    category: 'decoration',
    thumbnail: '/ui/object-thumbnails/youtube_subscriber_frame.svg',
    price: 175,
    placementSurface: 'wall',
    width: 1.5,
    height: 0.86,
    depth: 0.07,
    channelHandle: '@Thoms_gail',
    channelUrl: 'https://www.youtube.com/@Thoms_gail',
    frontAxis: '+z',
  },
  monstera_plant: {
    id: 'monstera_plant',
    type: 'plant',
    name: 'Plante monstera',
    category: 'decoration',
    modelUrl: '/models/placeables/monstera+plant+3d+model.glb',
    thumbnail: '/ui/object-thumbnails/monstera_plant.webp',
    price: 70,
    targetHeightMeters: 1.05,
    frontAxis: OBJECT_FRONT_AXIS,
    thumbnailRotationY: Math.PI * 0.08,
    thumbnailScale: 0.94,
  },
  crystal_egg: {
    id: 'crystal_egg',
    type: 'decoration',
    name: 'Oeuf de cristal',
    category: 'decoration',
    modelUrl: '/models/placeables/crystal_egg/model.glb',
    thumbnail: '/ui/object-thumbnails/crystal_egg.webp',
    price: 150,
    targetHeightMeters: 0.55,
    frontAxis: OBJECT_FRONT_AXIS,
    thumbnailRotationY: Math.PI * 0.25,
    thumbnailScale: 1.0,
  },
  crystal_rock: {
    id: 'crystal_rock',
    type: 'decoration',
    name: 'Cristal lumineux',
    category: 'decoration',
    modelUrl: '/models/placeables/crystal_rock/model.glb',
    thumbnail: '/ui/object-thumbnails/crystal_rock.webp',
    price: 120,
    targetHeightMeters: 1.8,
    frontAxis: OBJECT_FRONT_AXIS,
    thumbnailRotationY: Math.PI * 0.15,
    thumbnailScale: 1.0,
  },
  training_dummy: {
    id: 'training_dummy',
    type: 'training_dummy',
    name: 'Mannequin d entrainement',
    category: 'training',
    modelUrl: '/models/placeables/training_dummy/model.glb',
    thumbnail: '/ui/object-thumbnails/training_dummy.webp',
    price: 500,
    targetHeightMeters: 1.55,
    frontAxis: OBJECT_FRONT_AXIS,
    modelRotationY: Math.PI,
    thumbnailRotationY: Math.PI * 1.62,
    thumbnailScale: 0.9,
    combat: {
      kind: 'training_dummy',
      maxHp: 100,
      radius: 0.5,
      height: 1.9,
    },
  },
  wooden_cabinet: {
    id: 'wooden_cabinet',
    type: 'decoration',
    name: 'Armoire bois',
    category: 'furniture',
    modelUrl: '/models/placeables/wooden_cabinet/model.glb',
    thumbnail: '/ui/object-thumbnails/wooden_cabinet.webp',
    price: 350,
    targetHeightMeters: 1.38,
    frontAxis: OBJECT_FRONT_AXIS,
    thumbnailRotationY: Math.PI * 1.65,
    thumbnailScale: 0.92,
  },
  penguin_toy: {
    id: 'penguin_toy',
    type: 'decoration',
    name: 'Pingouin',
    category: 'decoration',
    modelUrl: '/models/placeables/penguin_toy/model.glb',
    thumbnail: '/ui/object-thumbnails/penguin_toy.webp',
    price: 285,
    targetHeightMeters: 0.62,
    frontAxis: OBJECT_FRONT_AXIS,
    thumbnailRotationY: Math.PI * 1.65,
    thumbnailScale: 1.0,
  },
  cat: {
    id: 'cat',
    type: 'animal',
    name: 'Chat',
    category: 'animals',
    modelUrl: '/models/cat.glb',
    thumbnail: '/ui/object-thumbnails/cat.webp',
    frontAxis: OBJECT_FRONT_AXIS,
    thumbnailRotationY: Math.PI * 1.7,
    thumbnailScale: 1.0,
  },
  magic_book: {
    id: 'magic_book',
    type: 'weapon',
    name: 'Livre Magique',
    category: 'weapons',
    modelUrl: '/models/weapons/magic_book.glb',
    thumbnail: '/ui/object-thumbnails/magic_book.webp',
    frontAxis: OBJECT_FRONT_AXIS,
    thumbnailRotationY: Math.PI * 1.7,
    thumbnailMargin: 1.2,
  },
  magic_skull: {
    id: 'magic_skull',
    type: 'weapon',
    name: 'Crâne Nécromancien',
    category: 'weapons',
    modelUrl: '/models/weapons/magic_skull_necromancer.glb',
    thumbnail: '/ui/object-thumbnails/magic_skull.webp',
    frontAxis: OBJECT_FRONT_AXIS,
    thumbnailRotationY: Math.PI * 1.7,
    thumbnailMargin: 1.2,
  },
  wolf: {
    id: 'wolf',
    type: 'mount',
    name: 'Loup noir',
    category: 'mounts',
    modelUrl: '/models/wolf.glb',
    thumbnail: '/ui/object-thumbnails/wolf.webp',
    frontAxis: OBJECT_FRONT_AXIS,
    thumbnailRotationY: Math.PI * 1.7,
    thumbnailMargin: 1.18,
  },
  horse: {
    id: 'horse',
    type: 'mount',
    name: 'Cheval',
    category: 'mounts',
    modelUrl: '/models/horse.glb',
    thumbnail: '/ui/object-thumbnails/horse.webp',
    frontAxis: OBJECT_FRONT_AXIS,
    thumbnailRotationY: Math.PI * 1.7,
    thumbnailMargin: 1.18,
  },
  dragon: {
    id: 'dragon',
    type: 'mount',
    name: 'Dragon',
    category: 'mounts',
    modelUrl: '/models/dragon.glb',
    thumbnail: '/ui/object-thumbnails/dragon.webp',
    frontAxis: OBJECT_FRONT_AXIS,
    thumbnailRotationY: Math.PI * 1.7,
    thumbnailMargin: 1.22,
  },
  ...rugCatalog,
}

export const defaultEditableObjects = [
  {
    id: 'goal_01',
    objectId: 'soccer_goal',
    type: 'goal',
    position: [0, 0, -3.42],
    rotationY: 0,
    status: 'placed',
    canMove: true,
    canRotate: true,
    canStore: true,
  },
]

export const shopObjectIds = [
  'modular_sofa',
  'pink_plush_sofa',
  'pink_sofa',
  'red_sofa',
  'wooden_desk',
  'beige_table',
  'office_chair',
  'modern_chair',
  'orange_chair',
  'orange_egg_chair',
  'throne_chair',
  'amber_stool',
  'flat_screen_display',
  'youtube_subscriber_frame',
  'monstera_plant',
  'crystal_egg',
  'crystal_rock',
  'training_dummy',
  'wooden_cabinet',
  'penguin_toy',
  ...Object.keys(rugCatalog),
]

export function createEditableObjectInstance(objectId, overrides = {}) {
  const catalogItem = objectCatalog[objectId]
  if (!catalogItem || !shopObjectIds.includes(objectId)) return null

  const id = overrides.id ?? `${objectId}_${nextObjectInstanceId++}`
  const baseObject = {
    id,
    objectId,
    type: catalogItem.type,
    position: overrides.position ?? null,
    rotationY: overrides.rotationY ?? 0,
    status: overrides.status ?? 'stored',
    canMove: true,
    canRotate: catalogItem.placementSurface !== 'wall',
    canStore: true,
  }

  if (catalogItem.placementSurface === 'wall') {
    baseObject.wallId = overrides.wallId ?? null
  }
  if (catalogItem.type === 'youtube_subscriber_frame') {
    baseObject.channelUrl = overrides.channelUrl ?? catalogItem.channelUrl
  }

  if (catalogItem.seating?.kind === 'sofa') {
    baseObject.seats = generateSeats({
      objectId: id,
      width: catalogItem.seating.width,
      seatWidth: catalogItem.seating.seatWidth,
      frontX: catalogItem.seating.frontX,
      zCenter: catalogItem.seating.zCenter ?? 0,
      y: catalogItem.seating.y ?? 0,
      seatedForwardOffset: catalogItem.seating.seatedForwardOffset ?? 0.14,
      standUpForwardOffset: catalogItem.seating.standUpForwardOffset ?? 0.24,
      interactionDistance: catalogItem.seating.interactionDistance ?? 1.1,
    })
  }

  if (catalogItem.seating?.kind === 'single') {
    baseObject.seats = generateSingleSeat({
      objectId: id,
      x: catalogItem.seating.x ?? 0,
      y: catalogItem.seating.y ?? 0,
      z: catalogItem.seating.z ?? 0,
      seatedForwardOffset: catalogItem.seating.seatedForwardOffset ?? 0.08,
      standUpForwardOffset: catalogItem.seating.standUpForwardOffset ?? 0.16,
      interactionDistance: catalogItem.seating.interactionDistance ?? 0.65,
    })
  }

  return baseObject
}
