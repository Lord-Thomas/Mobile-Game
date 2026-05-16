export const DEFAULT_HOUSE_CONFIG = {
  id: 'house_draft',
  name: 'Maison brouillon',
  color: '#80d8ff',
  trim: '#37474f',
  rotationY: 0,
  doorWall: 'south',
  parts: [
    {
      id: 'main',
      offset: [0, 0],
      size: [6.2, 3.4, 5.1],
      doorWall: 'south',
      roofType: 'gable',
    },
  ],
}

export function normalizeHouseConfig(config = DEFAULT_HOUSE_CONFIG) {
  const sourceParts = config.parts?.length ? config.parts : DEFAULT_HOUSE_CONFIG.parts

  return {
    ...DEFAULT_HOUSE_CONFIG,
    ...config,
    parts: sourceParts.map((part, index) => ({
      id: part.id ?? (index === 0 ? 'main' : `annex_${index}`),
      offset: [part.offset?.[0] ?? 0, part.offset?.[1] ?? 0],
      size: [
        part.size?.[0] ?? (index === 0 ? 6.2 : 3),
        part.size?.[1] ?? (index === 0 ? 3.4 : 2.8),
        part.size?.[2] ?? (index === 0 ? 5.1 : 3.4),
      ],
      doorWall: part.doorWall,
      roofType: part.roofType ?? (index === 0 ? 'gable' : 'lean_to'),
    })),
  }
}

export const GAME_HOUSE_LIBRARY = {
  simpleBlue: normalizeHouseConfig({
    id: 'simple_blue',
    name: 'Maison bleue simple',
  }),
  sideAnnexBlue: normalizeHouseConfig({
    id: 'side_annex_blue',
    name: 'Maison bleue avec annexe',
    parts: [
      DEFAULT_HOUSE_CONFIG.parts[0],
      { id: 'annex', offset: [4.45, 0.55], size: [2.7, 2.8, 3.6], roofType: 'lean_to' },
    ],
  }),
}
