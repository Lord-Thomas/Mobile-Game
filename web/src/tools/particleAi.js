import Anthropic from '@anthropic-ai/sdk'
import { normalizeParticlePreset } from '../effects/particlePresets'

// "Vibe coding" bridge: a prompt goes in, a particle preset JSON comes out.
// The AI never touches the engine — it only fills the preset recipe, which the
// user can then refine with the sliders.

const ENUMS = {
  category: ['impact', 'burst', 'loop', 'trail', 'death'],
  shape: ['point', 'sphere', 'cone', 'circle', 'box'],
  mode: ['burst', 'loop'],
  texture: ['soft_glow', 'circle', 'star', 'spark', 'smoke', 'flame'],
  blending: ['additive', 'normal'],
}

const EMITTER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    shape: { type: 'string', enum: ENUMS.shape },
    mode: { type: 'string', enum: ENUMS.mode, description: 'burst = tout émis d\'un coup, loop = émission continue' },
    count: { type: 'integer', description: '1 à 500 particules' },
    texture: { type: 'string', enum: ENUMS.texture },
    blending: { type: 'string', enum: ENUMS.blending },
    colorStart: { type: 'string', description: 'Couleur hex #rrggbb au spawn' },
    colorEnd: { type: 'string', description: 'Couleur hex #rrggbb en fin de vie' },
    alphaStart: { type: 'number', description: '0 à 1' },
    alphaEnd: { type: 'number', description: '0 à 1' },
    sizeStart: { type: 'number', description: 'Taille monde au spawn, 0.02 à 1.5 typique' },
    sizeEnd: { type: 'number' },
    sizeVariance: { type: 'number', description: '0 à 1' },
    speed: { type: 'number', description: 'Vitesse initiale en m/s, 0 à 8 typique' },
    speedVariance: { type: 'number', description: '0 à 1' },
    spread: { type: 'number', description: '0 = directionnel, 1 = toutes directions' },
    direction: { type: 'array', items: { type: 'number' }, description: 'Direction de base [x,y,z], souvent [0,1,0]' },
    gravity: { type: 'number', description: 'Négatif = retombe, positif = monte (fumée ~0.5)' },
    turbulence: { type: 'number', description: '0 à 2, bruit organique' },
    rotationSpeed: { type: 'number', description: 'Rotation du sprite en rad/s' },
    lifetime: { type: 'number', description: 'Durée de vie en secondes, 0.2 à 3 typique' },
    lifetimeVariance: { type: 'number', description: '0 à 1' },
    radius: { type: 'number', description: 'Rayon de la zone de spawn en mètres' },
    offset: { type: 'array', items: { type: 'number' }, description: 'Décalage [x,y,z] depuis l\'origine de l\'effet' },
    delay: { type: 'number', description: 'Délai de démarrage en secondes' },
  },
  required: [
    'shape', 'mode', 'count', 'texture', 'blending',
    'colorStart', 'colorEnd', 'alphaStart', 'alphaEnd',
    'sizeStart', 'sizeEnd', 'sizeVariance',
    'speed', 'speedVariance', 'spread', 'direction',
    'gravity', 'turbulence', 'rotationSpeed',
    'lifetime', 'lifetimeVariance', 'radius', 'offset', 'delay',
  ],
}

const PRESET_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string', description: 'snake_case, ex: fireball_hit' },
    name: { type: 'string', description: 'Nom court en français' },
    category: { type: 'string', enum: ENUMS.category },
    duration: { type: 'number', description: 'Durée de l\'effet en secondes (0.3 à 2 typique)' },
    loop: { type: 'boolean', description: 'true pour les auras/feux permanents' },
    emitters: { type: 'array', items: EMITTER_SCHEMA, description: '1 à 4 émetteurs' },
    light: {
      type: 'object',
      additionalProperties: false,
      properties: {
        enabled: { type: 'boolean' },
        color: { type: 'string', description: 'Couleur hex #rrggbb' },
        intensity: { type: 'number', description: '0 à 8' },
      },
      required: ['enabled', 'color', 'intensity'],
    },
  },
  required: ['id', 'name', 'category', 'duration', 'loop', 'emitters', 'light'],
}

const SYSTEM_PROMPT = `Tu es un artiste VFX pour un jeu 3D low-poly cosy (style village, vue troisième personne, jouable sur mobile).
Tu produis des presets JSON d'effets de particules. Tu ne génères jamais de code, uniquement le preset.

Principes pour des effets réussis et lisibles :
- Court et satisfaisant : un impact dure 0.4-0.8s, une ouverture de coffre 0.8-1.5s.
- Combine 2-3 émetteurs complémentaires : un coeur lumineux (soft_glow additif), des accents (spark/star additif), parfois fumée (smoke, blending normal).
- additive pour tout ce qui brille, normal pour fumée/poussière.
- La fumée monte (gravity positif ~0.5) et grossit (sizeEnd > sizeStart). Les étincelles retombent (gravity -4 à -8).
- alphaEnd est presque toujours 0 pour une disparition propre.
- Mobile : reste sous ~200 particules au total. Lumière dynamique seulement si l'effet le mérite.
- mode "loop" pour les émissions continues (aura, feu), "burst" pour les explosions.`

export function buildParticlePrompt(userText, currentPreset) {
  return `Demande : ${userText}

Preset actuel de l'éditeur (à modifier si la demande est une retouche, à remplacer si c'est un nouvel effet) :
${JSON.stringify(currentPreset, null, 2)}

Réponds uniquement avec le preset JSON complet.`
}

// Clipboard fallback when no API key is configured: the user pastes this into
// Claude (or Claude Code) and pastes the JSON back via "Importer JSON".
export function buildClipboardPrompt(userText, currentPreset) {
  return `${SYSTEM_PROMPT}

Le preset JSON doit suivre exactement ce schéma :
${JSON.stringify(PRESET_SCHEMA, null, 2)}

${buildParticlePrompt(userText, currentPreset)}`
}

export async function generateParticlePreset({ apiKey, userText, currentPreset }) {
  const client = new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true,
  })

  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    output_config: {
      format: {
        type: 'json_schema',
        schema: PRESET_SCHEMA,
      },
    },
    messages: [
      { role: 'user', content: buildParticlePrompt(userText, currentPreset) },
    ],
  })

  const text = response.content.find((block) => block.type === 'text')?.text
  if (!text) throw new Error('Réponse vide de l\'IA')
  return normalizeParticlePreset(JSON.parse(text))
}
