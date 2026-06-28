import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Html, OrthographicCamera, useAnimations, useFBX, useGLTF, useTexture } from '@react-three/drei'
import { BallCollider, CapsuleCollider, CuboidCollider, Physics, RigidBody, useRapier } from '@react-three/rapier'
import { ACESFilmicToneMapping, AdditiveBlending, AlwaysStencilFunc, BackSide, Box3, BoxGeometry, BufferGeometry, CanvasTexture, Color, DefaultLoadingManager, DoubleSide, Euler, Float32BufferAttribute, FogExp2, FrontSide, KeepStencilOp, LinearFilter, Matrix4, LoopOnce, LoopPingPong, LoopRepeat, MathUtils, Mesh, MeshBasicMaterial, NotEqualStencilFunc, Object3D, OrthographicCamera as ThreeOrthographicCamera, PCFShadowMap, PerspectiveCamera, PlaneGeometry, Quaternion, Raycaster, RepeatWrapping, ReplaceStencilOp, RingGeometry, ShaderMaterial, Shape, SphereGeometry, SRGBColorSpace, Vector2, Vector3 } from 'three'
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { Profiler, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import ParticleEffect from './effects/ParticleEffect'
import { charHexToVec, getCharacterMaterialKey, makePantsDetailsTintApplyGlsl, makeSkinWithDetailsTintApplyGlsl, makeTintApplyGlsl, normalizeMixamoObjectName, TINT_RECOLOR_UNIFORM_DECL } from './game/characterShaders'
import { BALL_RADIUS, GOAL_Z, PLAYER_CAPSULE_HALF_HEIGHT, PLAYER_CAPSULE_RADIUS, PLAYER_KICK_CONTACT_DELAY, PLAYER_KICK_CONTACT_WINDOW, PLAYER_KICK_DURATION, PLAYER_PUNCH_COMBO_STEP, PLAYER_PUNCH_CONTACT_DELAY, PLAYER_PUNCH_CONTACT_WINDOW, PLAYER_PUNCH_DAMAGE, PLAYER_PUNCH_DAMAGE_MAX, PLAYER_PUNCH_DURATION, PUNCH_COMBO_WINDOW } from './game/constants'
import { collidesWithGoalFrame, getKickContact, getNearestPunchTarget, getPunchContact } from './game/combatGeometry'
import { useGameTexture } from './game/ktx2'
import { forceInitialAssetBatchReady, installAssetLoadProfiler, installLongTaskObserver, isInitialAssetBatchReady, lockInitialAssetBatch, markLoad, recordRenderProfile, reportLoadTiming, startInitialAssetBatchCollection, subscribeInitialAssetBatch } from './lib/loadTiming'
import { PERF_NO_MAP_COLLIDERS, PERF_RUNTIME_WARMUP_RIG, PERF_SHADER_WARMUP } from './lib/perfFlags'
import { Defer, startWorldStream, waitForRevealLevel } from './lib/worldStream'
import { BUILTIN_PARTICLE_PRESETS } from './effects/particlePresets'
import { NECRO_WEAPON_PARTICLE_NAME, useStoredParticlePreset } from './effects/storedParticlePresets'
import { createEditableObjectInstance, defaultEditableObjects, objectCatalog, shopObjectIds } from './gameObjects/placeableObjects'
import { isSupabaseConfigured } from './lib/supabase'
import { addPlayerCoins, claimFirstMobDefeatRewards, equipPlayerTitle, getCurrentUser, loadPlayerProgress, loadPlayerPublicWorld, loadPlayerTitles, onAuthStateChange, savePlayerProgress, signInWithPassword, signOut, signUpWithPassword } from './services/progressService'
import { connectMultiplayerSession, connectOnlinePresence, createSessionFromRequest, createVisitRequest, isMultiplayerAvailable, VISIT_REQUEST_TIMEOUT_MS } from './services/multiplayerService'
import { connectColyseusVisitSession, getColyseusConnectionLabel } from './services/colyseusSessionService'
import { downloadBlob, generateThumbnailBlob } from './tools/thumbnails/generateThumbnailBlob'
import { TITLES, getTitleDefinition, getTitleRarity } from './gameProgress/titles'
import { LOCAL_ACHIEVEMENTS, getLocalAchievement, evaluateMetricAchievements } from './gameProgress/achievements'
import OutdoorNeighborhood from './world/OutdoorNeighborhood'
import OutdoorBounds from './world/OutdoorBounds'
import MapObjectPhysicsColliders from './world/MapObjectPhysicsColliders'
import { OUTDOOR_LIGHT_LAYER } from './world/lightingLayers'
import { NEIGHBOR_HOUSES, OUTDOOR_HALF_SIZE, OUTDOOR_PLAYER_COLLIDERS, PLAYER_PLOT_SIZE, getNeighborHouseParts } from './world/outdoorData'
import { collidesWithMapObjectSolid, getMapObjectBaseY, getOutdoorWalkableHeight } from './world/mapObjectCollision'
import { collisionReady } from './world/mapObjectCollisionData'
import { MAGIC_SKULL_DISCOVERY_OBJECT_ID, MAP_MONSTER_SPAWNERS, MAP_OBJECT_CATALOG, MAP_OBJECT_PLACEMENTS } from './world/mapObjects'
import QuestNpcInteraction from './world/npc/QuestNpcInteraction'
import LootDrops from './world/loot/LootDrops'
import QuestDialog from './ui/QuestDialog'
import QuestJournal from './ui/QuestJournal'
import QuestTracker from './ui/QuestTracker'
import VendorPanel from './ui/VendorPanel'
import ItemIcon from './ui/ItemIcon'
import { FIRST_QUEST_ID, QUEST_NPC_OBJECT_ID, getQuestDefinition } from './quests/questDefinitions'
import { completeQuest as completeQuestState, isReadyToComplete, normalizeQuestProgress, registerKill, startQuest } from './quests/questState'
import { rollLoot } from './items/lootTable'
import { addItems, getMaterialEntries, normalizeMaterials, sellAll, sellItem } from './items/materialsInventory'
import { getItemDefinition } from './items/itemDefinitions'
import { BIOME_VISUALS, MAP_BIOME_AREAS, getBiomeInfluence } from './world/biomeAreas'
import { getTerrainHeight } from './world/terrain/terrainGeometry'
import { getRoomBounds, houseLayout, mainRoom, outsideDoorOpening, secondRoom } from './world/house/houseLayout'
import { getWallColliderTransform, splitWallIntoSolidRects } from './world/house/wallUtils'
import GableRoof from './world/house/GableRoof'
import LeanToRoof from './world/house/LeanToRoof'
import PlayerHouse from './world/house/PlayerHouse'

const ROOM_LIMIT = 4.95
const PLAYER_HEIGHT = PLAYER_CAPSULE_HALF_HEIGHT + PLAYER_CAPSULE_RADIUS
const PLAYER_GROUNDED_DROP_TO_FALL = 0.85
const PLAYER_LEDGE_FALL_INITIAL_VELOCITY = -0.35
const PLAYER_MODEL_SCALE = 0.0129
const PLAYER_MODEL_VERTICAL_OFFSET = 0.1
const PLAYER_REFERENCE_HEIGHT_METERS = 1.63
const PLAYER_REFERENCE_HEIGHT_WORLD_UNITS = 2.25
const WORLD_UNITS_PER_METER = PLAYER_REFERENCE_HEIGHT_WORLD_UNITS / PLAYER_REFERENCE_HEIGHT_METERS
const MAX_RENDER_DPR = 1.5
const MIN_RENDER_DPR = 0.45
const TARGET_MAX_RENDER_PIXELS = 2_200_000
const MIN_DYNAMIC_RENDER_SCALE = 0.5
const MAX_DYNAMIC_RENDER_SCALE = 1
const LOW_FPS_THRESHOLD = 48
const HIGH_FPS_THRESHOLD = 57
const FPS_SAMPLE_WINDOW_SECONDS = 2
const RENDER_SCALE_STEP = 0.05
const BASE_CAMERA_VERTICAL_FOV = 52
const MAX_CAMERA_HORIZONTAL_FOV = 72
const MULTIPLAYER_INTERP_DELAY_MS = 150
const MULTIPLAYER_PLAYER_SEND_INTERVAL = 1 / 15
const MULTIPLAYER_PLAYER_IDLE_SEND_INTERVAL = 1 / 4
const MULTIPLAYER_PLAYER_PET_SEND_INTERVAL = 1 / 8
const MULTIPLAYER_BALL_ACTIVE_SEND_INTERVAL = 1 / 20
const MULTIPLAYER_BALL_SLEEP_SEND_INTERVAL = 1 / 5
const MULTIPLAYER_MAX_EXTRAPOLATION_MS = 180
const MULTIPLAYER_REMOTE_SNAP_DISTANCE = 4
const MULTIPLAYER_REMOTE_VISUAL_SMOOTHING = 10
const REMOTE_SPELL_LATENCY_COMPENSATION_MAX_MS = 450
const CHAT_BUBBLE_LIFETIME_MS = 5600
const CHAT_MAX_LENGTH = 120
const CHAT_MAX_VISIBLE_BUBBLES = 4
const SOCIAL_MENU_TABS = ['account', 'achievements', 'social', 'friends', 'settings']
const PUBLIC_BUILD_FLAGS = {
  showObjectInventory: true,
  showWeaponInventory: true,
  showWeaponShop: true,
  showCharacterCustomization: true,
}
const WORLD_CHAT_Z_INDEX_RANGE = [3, 0]
const WORLD_NAMEPLATE_Z_INDEX_RANGE = [2, 0]
const FREE_CAMERA_SPEED = 8
const SOLO_NAMEPLATE_STORAGE_KEY = 'lab_show_solo_nameplate_v1'
// Remembers an active multiplayer session so a reload can rejoin it if it is
// still live. Keyed per user. Expires after a short window.
const ACTIVE_SESSION_STORAGE_PREFIX = 'lab_active_session_v1:'
const ACTIVE_SESSION_MAX_AGE_MS = 10 * 60 * 1000
const ACTIVE_SESSION_REJOIN_TIMEOUT_MS = 20000
const activeSessionStorageKey = (userId) => `${ACTIVE_SESSION_STORAGE_PREFIX}${userId}`

// Reads the persisted session (if any) for a user without applying it.
function readSavedSession(userId) {
  if (typeof window === 'undefined' || !userId) return null
  try {
    const raw = localStorage.getItem(activeSessionStorageKey(userId))
    if (!raw) return null
    const saved = JSON.parse(raw)
    if (!saved?.session || !saved.role || saved.role === 'solo') return null
    if (!saved.savedAt || Date.now() - saved.savedAt > ACTIVE_SESSION_MAX_AGE_MS) return null
    return saved
  } catch {
    return null
  }
}

// True when this user has a pending guest-visit session to rejoin — used to keep
// own-progress loads from overwriting the host's world during a reconnect.
function hasSavedGuestSession(userId) {
  return readSavedSession(userId)?.role === 'guest'
}
const PERFORMANCE_SETTINGS_STORAGE_KEY = 'lab_performance_settings_v1'
const LOCAL_COIN_BUTTON_STORAGE_KEY = 'lab_show_local_coin_button_v1'
const LOW_RESOLUTION_RENDER_SCALE = 0.62
const SOFA_WIDTH_METERS = 1.5
const MAGIC_SKULL_LEARN_INTERACTION_DISTANCE = 1.65
const MUSHROOM_ENEMY_MODEL_URL = '/models/enemies/mushroom_man/model.fbx'
const MUSHROOM_ENEMY_COUNT = 4
const MUSHROOM_ENEMY_MAX_HP = 30
const MUSHROOM_ENEMY_REWARD_COINS = 10  // 0.33 pièce/PV
const MUSHROOM_ENEMY_RESPAWN_MS = 30000
const MUSHROOM_ENEMY_VISIBILITY_RANGE = 9.0   // vue frontale (cône) — portée allongée
const MUSHROOM_ENEMY_VIEW_CONE_DEGREES = 140  // champ de vision élargi
const MUSHROOM_ENEMY_CLOSE_ALERT_RANGE = 4.2  // perception 360° (ouïe) : repère le joueur même hors du cône
const MUSHROOM_ENEMY_CLOSE_ALERT_SECONDS = 0.55 // temps de réaction au bord de l'ouïe (réduit près du mob)
const MUSHROOM_ENEMY_INVESTIGATE_LOOK_SECONDS = 2.0 // temps passé à fouiller la dernière position connue
const MUSHROOM_ENEMY_LOSE_INTEREST_RANGE = 14
const MUSHROOM_ENEMY_LEASH_RANGE = 18
const MUSHROOM_ENEMY_STOP_DISTANCE = 0.95
const MUSHROOM_ENEMY_MOVE_SPEED = 1.25
const MUSHROOM_ENEMY_CHASE_SPEED = 2.6
const MUSHROOM_ENEMY_RETURN_SPEED = 4.5
const MUSHROOM_ENEMY_LEASH_TIME = 10     // secondes de combat hors-zone avant abandon
const MUSHROOM_ENEMY_LEASH_COMBAT_BONUS = 2 // secondes récupérées à chaque échange de coups
const MUSHROOM_ENEMY_RESPAWN_PLAYER_SAFE_RANGE = 4
const MUSHROOM_ENEMY_SPAWN_TREE_RADIUS = 6.8
const MUSHROOM_ENEMY_MIN_TREES_NEAR_SPAWN = 5
const MUSHROOM_ENEMY_HOUSE_CLEARANCE = 8.5
const MUSHROOM_ENEMY_SPAWN_CLEARANCE = 1.35
const MUSHROOM_ENEMY_MIN_SPAWN_SPACING = 6.5
const MUSHROOM_ENEMY_SPAWN_YAW = Math.PI * 0.72
const MUSHROOM_ENEMY_WANDER_RADIUS = 5.5
const MUSHROOM_ENEMY_WANDER_SPEED = 0.72
const MUSHROOM_ENEMY_WANDER_MIN_WAIT = 1.2
const MUSHROOM_ENEMY_WANDER_MAX_WAIT = 3.2
const MUSHROOM_ENEMY_WANDER_TARGET_REACHED_DISTANCE = 0.18
const MUSHROOM_ENEMY_ATTACK_DAMAGE = 10
const MUSHROOM_ENEMY_ATTACK_RANGE = 1.2
const MUSHROOM_ENEMY_ATTACK_COOLDOWN = 1.65
const MUSHROOM_ENEMY_ATTACK_DURATION = 0.82
const MUSHROOM_ENEMY_ATTACK_CONTACT_DELAY = 0.34
const SKELETON_ENEMY_MODEL_URL = '/models/enemies/skeleton/model.fbx'
const SKELETON_ENEMY_TEXTURE_URL = '/models/enemies/skeleton/skeleton.fbm'
const SKELETON_ENEMY_MAX_HP = 80          // réduit (150 était abusé)
const SKELETON_ENEMY_REWARD_COINS = 30    // réduit (40 était trop rentable)
const SKELETON_ENEMY_ATTACK_DAMAGE = 25
const MOB_GROUNDED_DROP_TO_FALL = 1.25
const MOB_TARGET_VERTICAL_WEIGHT = 1.1

// ── Config système ─────────────────────────────────────────────────────────────
// Ajouter un nouveau type de mob = créer une nouvelle entrée ici.
const MOB_CONFIGS = {
  mushroom: {
    modelFormat: 'fbx',
    modelUrl: MUSHROOM_ENEMY_MODEL_URL,
    maxHp: MUSHROOM_ENEMY_MAX_HP,
    rewardCoins: MUSHROOM_ENEMY_REWARD_COINS,
    respawnMs: MUSHROOM_ENEMY_RESPAWN_MS,
    respawnPlayerSafeRange: MUSHROOM_ENEMY_RESPAWN_PLAYER_SAFE_RANGE,
    visibilityRange: MUSHROOM_ENEMY_VISIBILITY_RANGE,
    viewConeDegrees: MUSHROOM_ENEMY_VIEW_CONE_DEGREES,
    closeAlertRange: MUSHROOM_ENEMY_CLOSE_ALERT_RANGE,
    closeAlertSeconds: MUSHROOM_ENEMY_CLOSE_ALERT_SECONDS,
    investigateLookSeconds: MUSHROOM_ENEMY_INVESTIGATE_LOOK_SECONDS,
    loseInterestRange: MUSHROOM_ENEMY_LOSE_INTEREST_RANGE,
    leashRange: MUSHROOM_ENEMY_LEASH_RANGE,
    leashTime: MUSHROOM_ENEMY_LEASH_TIME,
    leashCombatBonus: MUSHROOM_ENEMY_LEASH_COMBAT_BONUS,
    stopDistance: MUSHROOM_ENEMY_STOP_DISTANCE,
    moveSpeed: MUSHROOM_ENEMY_MOVE_SPEED,
    chaseSpeed: MUSHROOM_ENEMY_CHASE_SPEED,
    returnSpeed: MUSHROOM_ENEMY_RETURN_SPEED,
    spawnYaw: MUSHROOM_ENEMY_SPAWN_YAW,
    wanderRadius: MUSHROOM_ENEMY_WANDER_RADIUS,
    wanderSpeed: MUSHROOM_ENEMY_WANDER_SPEED,
    wanderMinWait: MUSHROOM_ENEMY_WANDER_MIN_WAIT,
    wanderMaxWait: MUSHROOM_ENEMY_WANDER_MAX_WAIT,
    wanderReachedDistance: MUSHROOM_ENEMY_WANDER_TARGET_REACHED_DISTANCE,
    attackDamage: MUSHROOM_ENEMY_ATTACK_DAMAGE,
    attackRange: MUSHROOM_ENEMY_ATTACK_RANGE,
    attackCooldown: MUSHROOM_ENEMY_ATTACK_COOLDOWN,
    attackDuration: MUSHROOM_ENEMY_ATTACK_DURATION,
    attackContactDelay: MUSHROOM_ENEMY_ATTACK_CONTACT_DELAY,
    modelTargetHeight: 1.15,
    targetRadius: 0.48,
    targetHeight: 1.2,
    hudHeight: 2.0,
  },
  skeleton: {
    modelFormat: 'fbx',
    modelUrl: SKELETON_ENEMY_MODEL_URL,
    textureUrl: SKELETON_ENEMY_TEXTURE_URL,
    maxHp: SKELETON_ENEMY_MAX_HP,
    rewardCoins: SKELETON_ENEMY_REWARD_COINS,
    respawnMs: MUSHROOM_ENEMY_RESPAWN_MS,
    respawnPlayerSafeRange: MUSHROOM_ENEMY_RESPAWN_PLAYER_SAFE_RANGE,
    visibilityRange: MUSHROOM_ENEMY_VISIBILITY_RANGE,
    viewConeDegrees: MUSHROOM_ENEMY_VIEW_CONE_DEGREES,
    closeAlertRange: MUSHROOM_ENEMY_CLOSE_ALERT_RANGE,
    closeAlertSeconds: MUSHROOM_ENEMY_CLOSE_ALERT_SECONDS,
    investigateLookSeconds: MUSHROOM_ENEMY_INVESTIGATE_LOOK_SECONDS,
    loseInterestRange: MUSHROOM_ENEMY_LOSE_INTEREST_RANGE,
    leashRange: MUSHROOM_ENEMY_LEASH_RANGE,
    leashTime: MUSHROOM_ENEMY_LEASH_TIME,
    leashCombatBonus: MUSHROOM_ENEMY_LEASH_COMBAT_BONUS,
    stopDistance: 1.05,
    moveSpeed: MUSHROOM_ENEMY_MOVE_SPEED,
    chaseSpeed: 2.35,
    returnSpeed: MUSHROOM_ENEMY_RETURN_SPEED,
    spawnYaw: Math.PI * 0.26,
    wanderRadius: MUSHROOM_ENEMY_WANDER_RADIUS,
    wanderSpeed: MUSHROOM_ENEMY_WANDER_SPEED,
    wanderMinWait: MUSHROOM_ENEMY_WANDER_MIN_WAIT,
    wanderMaxWait: MUSHROOM_ENEMY_WANDER_MAX_WAIT,
    wanderReachedDistance: MUSHROOM_ENEMY_WANDER_TARGET_REACHED_DISTANCE,
    attackDamage: SKELETON_ENEMY_ATTACK_DAMAGE,
    attackRange: 1.35,
    attackCooldown: MUSHROOM_ENEMY_ATTACK_COOLDOWN,
    attackDuration: MUSHROOM_ENEMY_ATTACK_DURATION,
    attackContactDelay: MUSHROOM_ENEMY_ATTACK_CONTACT_DELAY,
    modelTargetHeight: 0.85,
    targetRadius: 0.48,
    targetHeight: 0.85,
    hudHeight: 1.6,
  },
}

MOB_CONFIGS.skeleton_archer = {
  ...MOB_CONFIGS.skeleton,
  maxHp: 60,
  rewardCoins: 35,
  materialColor: '#d8c48a',
  attackDamage: 18,
  attackRange: 4.8,
  stopDistance: 3.8,
  chaseSpeed: 2.15,
}

MOB_CONFIGS.skeleton_mage = {
  ...MOB_CONFIGS.skeleton,
  maxHp: 55,
  rewardCoins: 45,
  materialColor: '#8bb7ff',
  attackDamage: 30,
  attackRange: 5.6,
  stopDistance: 4.4,
  chaseSpeed: 2.05,
}

// ── Séparation des monstres (anti-chevauchement) ────────────────────────────────
const MOB_SEPARATION_DISTANCE = 0.95 // distance min entre deux monstres
const MOB_SEPARATION_STRENGTH = 4.0  // force de répulsion mutuelle

// ── Aggro / table de menace ──────────────────────────────────────────────────────
// Chaque ennemi mémorise la menace générée par ceux qui le frappent (joueur +
// squelettes invoqués) et attaque la cible à la plus haute menace. La menace
// décroît avec le temps pour que la cible puisse changer.
const THREAT_DECAY_PER_SEC = 5

// ── Aggro de groupe ────────────────────────────────────────────────────────────
const GROUP_AGGRO_RADIUS = 5.5    // rayon dans lequel les alliés réagissent
const GROUP_AGGRO_MAX_MOBS = 2    // max 2 mobs rejoignent le combat
const GROUP_AGGRO_DELAY_MIN = 300 // délai min avant qu'un allié aggro (ms)
const GROUP_AGGRO_DELAY_MAX = 700 // délai max
const MAGIC_BOOK_PRICE = 600
const FIREBALL_DAMAGE = 20
const FIREBALL_SPEED = 12
const FIREBALL_LIFETIME_MS = 2500
const FIREBALL_COOLDOWN_MS = 800
const FIREBALL_COLLISION_RADIUS = 0.9
const MAX_ACTIVE_FIREBALLS = 5
const FIREBALL_PROJECTILE_POOL = Array.from({ length: MAX_ACTIVE_FIREBALLS }, (_, index) => index)
const FIREBALL_IMPACT_POOL = Array.from({ length: MAX_ACTIVE_FIREBALLS }, (_, index) => index)
const MAGIC_SKULL_DISCOVERY_CHARGE_MS = 5000
const CHARGE_TIME_MS = 1200
const MIN_CHARGE_RATIO = 0.2

// ── Crâne nécromancien : invocation de squelettes alliés ─────────────────────
const MAGIC_SKULL_PRICE = 1200
const SUMMON_SKELETON_COUNT = 3                 // squelettes invoqués par sort
const SUMMON_SKELETON_DURATION_MS = 30000       // durée de vie avant disparition
const SUMMON_RECAST_EXTRA_MS = 15000            // délai supplémentaire avant réinvocation
const SUMMON_SKELETON_MAX_HP = 60               // points de vie de chaque squelette
const SUMMON_SKELETON_DAMAGE = 18               // dégâts infligés par coup
const SUMMON_SKELETON_ATTACK_COOLDOWN = 1.1     // secondes entre deux coups
const SUMMON_SKELETON_ATTACK_RANGE = 1.45       // portée d'attaque
const SUMMON_SKELETON_MOVE_SPEED = 3.0          // vitesse de poursuite
const SUMMON_SKELETON_AGGRO_RANGE = 16          // distance de détection d'un ennemi
const SUMMON_SKELETON_FOLLOW_DISTANCE = 2.4     // distance de suivi du joueur au repos
const SUMMON_SKELETON_SEPARATION_DISTANCE = 1.0 // distance min entre deux squelettes
const SUMMON_SKELETON_SEPARATION_STRENGTH = 5.0 // force de répulsion mutuelle
const PLAYER_MAX_HP = 100
const PLAYER_DAMAGE_INVULNERABILITY_MS = 420
const PLAYER_REGEN_DELAY_MS = 20000
const PLAYER_REGEN_TICK_MS = 500
const PLAYER_REGEN_HP_PER_TICK = 2
const PLAYER_JUMP_START_DURATION = 0.62
const PLAYER_JUMP_LAND_DURATION = 0.38
const PLAYER_LANDING_PREPARE_DISTANCE = 0.95
const PLAYER_DEFAULT_ANIMATION_FADE = 0.18
const PLAYER_LANDING_ANIMATION_FADE = 0.12
const PLAYER_AIR_ANIMATION_FADE = 0.18
const PLAYER_JUMP_TO_FALL_ANIMATION_FADE = 0.24
const PLAYER_WAVE_DURATION = 2.1
const PLAYER_DANCE_DURATION = 15.97
const PLAYER_POINTING_UP_DURATION = 2.4
const PLAYER_SIT_DOWN_DURATION = 1.05
const PLAYER_STAND_UP_DURATION = 1.05
const MOB_DEATH_PARTICLE_PRESET = BUILTIN_PARTICLE_PRESETS.find(({ id }) => id === 'mob_death')
const HEAL_AURA_PARTICLE_PRESET = BUILTIN_PARTICLE_PRESETS.find(({ id }) => id === 'heal_aura')
const INTERACTION_PARTICLE_PRESET = BUILTIN_PARTICLE_PRESETS.find(({ id }) => id === 'interaction')
const EFFECT_WARMUP_FRAMES = 4
const PLAYER_SITTING_HEIGHT = 0.34
const SEAT_INTERACTION_DISTANCE = 1.1
const EMOTE_LONG_PRESS_MS = 420
const EMOTE_CANCEL_DISTANCE = 14
const EMOTE_MENU_RADIUS = 86
const EMOTE_MENU_DEADZONE = 26
const EMOTE_MENU_ARC_START = -Math.PI / 2 - Math.PI / 3
const EMOTE_MENU_ARC_END = -Math.PI / 2 + Math.PI / 3
const CAMERA_DISTANCE = 4.6
const CAMERA_MIN_DISTANCE = 0.85
const CAMERA_MAX_DISTANCE = 8.5
const CAMERA_HEIGHT = 1.55
const ZONES = {
  interior: 'interior',
  secondRoom: 'secondRoom',
  outside: 'outside',
}
const MAIN_ROOM_BOUNDS = getRoomBounds(mainRoom)
const OUTDOOR_DOOR_POSITION = {
  x: MAIN_ROOM_BOUNDS.minX,
  y: 1.1,
  z: outsideDoorOpening.centerZ,
}
const OUTDOOR_EXIT_POSITION = {
  x: MAIN_ROOM_BOUNDS.minX + 1.2,
  y: 0.35,
  z: outsideDoorOpening.centerZ,
}
const OUTDOOR_ENTRY_POSITION = {
  x: MAIN_ROOM_BOUNDS.minX - 2.2,
  y: 0.35,
  z: outsideDoorOpening.centerZ,
}
const PLAYER_SPAWNS = {
  interior: [0, PLAYER_HEIGHT, 2.2],
  outside: [OUTDOOR_ENTRY_POSITION.x, PLAYER_HEIGHT, OUTDOOR_ENTRY_POSITION.z],
}
const DOOR_INTERACTION_DISTANCE = 1.25
const PLAY_AREA_LIMITS = {
  interior: { minX: -ROOM_LIMIT, maxX: ROOM_LIMIT, minZ: -ROOM_LIMIT, maxZ: ROOM_LIMIT },
  secondRoom: { minX: -ROOM_LIMIT, maxX: ROOM_LIMIT, minZ: -ROOM_LIMIT, maxZ: ROOM_LIMIT },
  outside: { minX: -OUTDOOR_HALF_SIZE + 2, maxX: OUTDOOR_HALF_SIZE - 2, minZ: -OUTDOOR_HALF_SIZE + 2, maxZ: OUTDOOR_HALF_SIZE - 2 },
}

function getUserDisplayName(user) {
  return (
    user?.user_metadata?.display_name ||
    user?.user_metadata?.name ||
    user?.user_metadata?.full_name ||
    ''
  )
}

function getVisiblePlayerName(displayName, user, fallback = 'Joueur') {
  return displayName?.trim() || getUserDisplayName(user)?.trim() || fallback
}

function isLikelyMobileDevice() {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(pointer: coarse)').matches ||
    /android|iphone|ipad|ipod/i.test(window.navigator.userAgent)
  )
}

// Anisotropie : 16× (max) est coûteux par fragment sur mobile pour un gain visuel
// marginal. On plafonne à 4× sur mobile, valeur native sur desktop.
const MOBILE_MAX_ANISOTROPY = 4
function getCappedAnisotropy(gl) {
  const max = gl.capabilities.getMaxAnisotropy()
  return isLikelyMobileDevice() ? Math.min(max, MOBILE_MAX_ANISOTROPY) : max
}

function getDefaultPerformanceSettings() {
  const mobile = isLikelyMobileDevice()
  return {
    autoQuality: true,
    lowResolution: mobile,
    showFps: false,
    shadows: !mobile,
    grass: true,
    trees: true,
    sky: true,
  }
}

function loadPerformanceSettings() {
  const defaults = getDefaultPerformanceSettings()
  if (typeof window === 'undefined') return defaults
  try {
    const stored = JSON.parse(localStorage.getItem(PERFORMANCE_SETTINGS_STORAGE_KEY) || '{}')
    return { ...defaults, ...stored }
  } catch {
    return defaults
  }
}

const CAMERA_SETTINGS = {
  interior: { distance: CAMERA_DISTANCE, height: CAMERA_HEIGHT, minY: 0.35, maxY: 4.7 },
  secondRoom: { distance: CAMERA_DISTANCE, height: CAMERA_HEIGHT, minY: 0.35, maxY: 4.7 },
  outside: { distance: 6.5, height: 2.2, minY: 0.55, maxY: 28 },
}
const EDGE_TRIGGER_PX = 14
// Plage de pitch caméra du joueur (à pied + monture).
// MIN (négatif) = regarder vers le haut (caméra plus basse → plus de ciel).
// MAX (positif) = regarder vers le bas (caméra plus haute → vue plongeante).
// La caméra ne traverse pas le sol : un raycast (focus → caméra) + clampCameraInPlayableVolume
// la ramènent automatiquement devant tout obstacle, donc on peut élargir sans risque.
const PLAYER_CAMERA_PITCH_MIN = -0.95
const PLAYER_CAMERA_PITCH_MAX = 0.62
const CAMERA_DRAG_SENSITIVITY = 0.007
const CAMERA_WHEEL_ZOOM_SENSITIVITY = 0.0025
const SHOW_FLOOR_GRID = false
const GOAL_POINTS = 10
const SKIN_STORAGE_KEY = 'lab_ball_skins_v1'
const LEGACY_STARTER_FURNITURE_IDS = new Set(['sofa_01', 'desk_01', 'office_chair_01', 'plant_01'])
const SKIN_STATION_POSITION = { x: -3.5, y: 0.35, z: 1.8 }
const ENV_STATION_POSITION = { x: 3.5, y: 0.35, z: 1.8 }
const CUSTOM_STATION_POSITION = { x: 0, y: 0.35, z: 3.55 }
const PARCEL_HALF = PLAYER_PLOT_SIZE / 2
const CUSTOM_ROOM_BOUNDS = { minX: -PARCEL_HALF, maxX: PARCEL_HALF, minZ: -PARCEL_HALF, maxZ: PARCEL_HALF }
const CUSTOM_GRID_SIZE = 0.25
const CUSTOM_PLACEMENT_RAY_START_Y = 30
const TV_INTERACTION_DISTANCE = 1.35
const TV_MENU_EVENT = 'lab-tv-open-menu'
let activeNearbyTvId = null
const MAIN_ROOM = { width: mainRoom.size[0], depth: mainRoom.size[2], height: mainRoom.size[1] }
const WALL_REPEAT_X_PER_UNIT = 3.4 / 12
const WALL_REPEAT_Y_PER_UNIT = 1.9 / 5
const DEFAULT_CEILING_TEXTURE = '/textures/environment/walls/mur-paint.png'
const EXTERIOR_WALL_TEXTURE = '/textures/environment/walls/mur-paint.png'
const EXTERIOR_WALL_COLOR = '#f3ead6'

const ballSkins = [
  { id: 'classic', name: 'Classique', price: 0, texture: '/models/ball/textures/ballon-classique.png', defaultUnlocked: true },
  { id: 'moon', name: 'Lune', price: 100, texture: '/models/ball/textures/ballon-lune.png' },
  { id: 'mars', name: 'Mars', price: 210, texture: '/models/ball/textures/ballon-mars.png' },
  { id: 'earth', name: 'Terre', price: 300, texture: '/models/ball/textures/ballon-terre.png' },
  { id: 'planet-x', name: 'Planete X', price: 150, texture: '/models/ball/textures/ballon-planete-x.png' },
]

const SKIN_TONE_PALETTE = ['#FDDBB4', '#F5C5A3', '#E8A87C', '#D4895A', '#C06840', '#8D4A2B']
const HAIR_COLOR_PALETTE = [
  '#cf973a', '#E8B84A', '#FFD700', '#F5DEB3', '#C19A6B', '#8B4513',
  '#5C3317', '#2C1810', '#1A0A00', '#CC2200', '#4B0082', '#FFFFFF',
]
const EYE_COLOR_PALETTE = [
  '#2C1810', '#4A2E1A', '#3B82C4', '#1E4D8C', '#2ECC71', '#1A7A3A',
  '#808080', '#5C5C5C', '#9B59B6', '#CC7722',
]
const CLOTHING_COLOR_PALETTE = [
  '#CC3333', '#E67E22', '#F1C40F', '#2ECC71', '#3498DB', '#9B59B6',
  '#1A1A2E', '#FFFFFF', '#95A5A6', '#2C3E50', '#E91E63', '#00BCD4',
]
// Couleurs moyennes réelles du modèle — extraites programmatiquement de la texture (player.glb)
// skin H=28° S=0.40 L=0.63 | hair H=37° S=0.63 L=0.54 | shirt H=5° S=0.59 L=0.44 | pants H=45° S=0.06 L=0.14
const CHARACTER_BASE_COLORS = {
  skin:          '#c79e7b',
  hair:          '#d39b3f',
  eyes:          '#3B82C4',
  eyebrows:      '#d39b3f',
  shirt:         '#b4392e',
  pants:         '#252421',
  pants_details: '#252421',
  pants_detail_yellow: '#d39b3f',
  shoes:         '#F0F0F0',
  socks:         '#F0F0F0',
}
const CHARACTER_DEFAULT_APPEARANCE = {
  skinColor:        CHARACTER_BASE_COLORS.skin,
  hairColor:        CHARACTER_BASE_COLORS.hair,
  eyeColor:         CHARACTER_BASE_COLORS.eyes,
  eyebrowsColor:    CHARACTER_BASE_COLORS.eyebrows,
  shirtColor:       CHARACTER_BASE_COLORS.shirt,
  pantsColor:       CHARACTER_BASE_COLORS.pants,
  pantsDetailsColor: CHARACTER_BASE_COLORS.pants_detail_yellow,
  shoesColor:       CHARACTER_BASE_COLORS.shoes,
  socksColor:       CHARACTER_BASE_COLORS.socks,
  goldCoat: false,
  auraEquipped: false,
}

const PLAYER_MODEL_URL = '/models/player/player.glb'
const PLAYER_FACE_DETAILS_MASK_URL = '/models/player/masks/face-details-mask.png'
const MAGIC_BOOK_MODEL_URL = '/models/weapons/magic_book.glb'
const MAGIC_SKULL_MODEL_URL = '/models/weapons/magic_skull_necromancer.glb'
const MAGIC_SKULL_TOWER_PLACEMENT = MAP_OBJECT_PLACEMENTS.find((placement) => placement.objectId === 'skeleton_tower') ?? null
const MAGIC_SKULL_DISCOVERY_PLACEMENT = MAP_OBJECT_PLACEMENTS.find((placement) => placement.objectId === MAGIC_SKULL_DISCOVERY_OBJECT_ID) ?? null
// PNJ de quête placés depuis l'éditeur (statique au chargement, comme les autres
// placements). Vide tant qu'aucun PNJ n'a été placé + sauvegardé.
const QUEST_NPC_PLACEMENTS = MAP_OBJECT_PLACEMENTS.filter((placement) => placement.objectId === QUEST_NPC_OBJECT_ID)
// Plafond d'objets lootés au sol affichés simultanément (anti-lag : ils
// s'absorbent en ~0,8 s, ce plafond ne mord qu'en cas de massacre simultané).
const LOOT_DROP_MAX = 60
const EDITABLE_TREE_PLACEMENTS = MAP_OBJECT_PLACEMENTS
  .map((placement) => ({
    placement,
    catalogItem: MAP_OBJECT_CATALOG[placement.objectId],
  }))
  .filter(({ catalogItem }) => catalogItem?.type === 'tree')
const SKELETON_TOWER_CAMERA_ENTER_LOCAL_RADIUS = 2.22
const SKELETON_TOWER_CAMERA_LOCAL_RADIUS = 2.03
const SKELETON_TOWER_CAMERA_DISTANCE = 2.75
const SKELETON_TOWER_CAMERA_HEIGHT = 1.05
const SKELETON_TOWER_CAMERA_MIN_LOCAL_Y = 0.35
const SKELETON_TOWER_CAMERA_TOP_MARGIN = 0.55
const MAGIC_SKULL_DISCOVERY_POSITION = (() => {
  if (MAGIC_SKULL_DISCOVERY_PLACEMENT) return MAGIC_SKULL_DISCOVERY_PLACEMENT.position
  if (!MAGIC_SKULL_TOWER_PLACEMENT) return null
  const [x = 0, , z = 0] = MAGIC_SKULL_TOWER_PLACEMENT.position ?? []
  const tower = MAP_OBJECT_CATALOG.skeleton_tower
  const topY = getMapObjectBaseY(MAGIC_SKULL_TOWER_PLACEMENT)
    + (tower?.targetHeightMeters ?? 7.2) * WORLD_UNITS_PER_METER * (MAGIC_SKULL_TOWER_PLACEMENT.scale ?? 1)
  return [x, topY + 0.14, z]
})()

function getEditableTreePosition(treeEntry) {
  const [x = 0, , z = 0] = treeEntry.placement.position ?? []
  return { x, z }
}

function getEditableTreeCollisionRadius(treeEntry) {
  return Math.max(0.25, (treeEntry.catalogItem.colliderRadius ?? 0.5) * (treeEntry.placement.scale ?? 1))
}

function getEditableTreeAreaPriority(treeEntry) {
  const id = treeEntry.placement.id ?? ''
  if (id.includes('dense_forest') || id.includes('southwest_forest')) return 1
  if (id.includes('forest_edge')) return 0
  return null
}

function getSkeletonTowerHeightWorld() {
  const scale = MAGIC_SKULL_TOWER_PLACEMENT?.scale ?? 1
  return (MAP_OBJECT_CATALOG.skeleton_tower?.targetHeightMeters ?? 7.2) * WORLD_UNITS_PER_METER * scale
}

function worldToSkeletonTowerLocal(x, y, z) {
  if (!MAGIC_SKULL_TOWER_PLACEMENT) return null
  const [px = 0, , pz = 0] = MAGIC_SKULL_TOWER_PLACEMENT.position ?? []
  const baseY = getMapObjectBaseY(MAGIC_SKULL_TOWER_PLACEMENT)
  const scale = MAGIC_SKULL_TOWER_PLACEMENT.scale ?? 1
  const rotationY = MAGIC_SKULL_TOWER_PLACEMENT.rotationY ?? 0
  const dx = x - px
  const dz = z - pz
  const cos = Math.cos(rotationY)
  const sin = Math.sin(rotationY)

  return {
    x: (dx * cos - dz * sin) / scale,
    y: (y - baseY) / scale,
    z: (dx * sin + dz * cos) / scale,
    baseY,
    scale,
    rotationY,
    worldX: px,
    worldZ: pz,
  }
}

function skeletonTowerLocalToWorld(localX, localY, localZ, context) {
  const cos = Math.cos(context.rotationY)
  const sin = Math.sin(context.rotationY)
  return {
    x: context.worldX + (localX * cos + localZ * sin) * context.scale,
    y: context.baseY + localY * context.scale,
    z: context.worldZ + (-localX * sin + localZ * cos) * context.scale,
  }
}

function getSkeletonTowerCameraContext(x, y, z) {
  const local = worldToSkeletonTowerLocal(x, y, z)
  if (!local) return null
  const topLocalY = getSkeletonTowerHeightWorld() / local.scale
  const radialDistance = Math.hypot(local.x, local.z)
  const inside =
    radialDistance <= SKELETON_TOWER_CAMERA_ENTER_LOCAL_RADIUS &&
    local.y >= SKELETON_TOWER_CAMERA_MIN_LOCAL_Y &&
    local.y <= topLocalY + SKELETON_TOWER_CAMERA_TOP_MARGIN

  return inside ? { ...local, topLocalY } : null
}

function constrainCameraToSkeletonTower(x, y, z, context) {
  const local = worldToSkeletonTowerLocal(x, y, z)
  if (!local) return { x, y, z }
  const radius = SKELETON_TOWER_CAMERA_LOCAL_RADIUS
  const distance = Math.hypot(local.x, local.z)
  let localX = local.x
  let localZ = local.z

  if (distance > radius) {
    const inv = radius / distance
    localX *= inv
    localZ *= inv
  }

  return skeletonTowerLocalToWorld(
    localX,
    MathUtils.clamp(local.y, SKELETON_TOWER_CAMERA_MIN_LOCAL_Y, context.topLocalY + 0.25),
    localZ,
    context,
  )
}
const CHARACTER_MATERIAL_COLOR_KEYS = {
  skin:          'skinColor',
  hair:          'hairColor',
  shirt:         'shirtColor',
  pants:         'pantsColor',
  pants_details: 'pantsDetailsColor',
  shoes:         'shoesColor',
  socks:         'socksColor',
}

const floorSkins = [
  {
    id: 'floor-classic',
    name: 'Parquet Classique',
    price: 0,
    texture: '/textures/wood/parquet-color.png',
    defaultUnlocked: true,
  },
  {
    id: 'floor-beton',
    name: 'Beton',
    price: 65,
    texture: '/textures/environment/floors/sol-beton.png',
  },
  {
    id: 'floor-parquet-loft',
    name: 'Parquet Loft',
    price: 95,
    texture: '/textures/environment/floors/sol-parquet-01.png',
  },
  {
    id: 'floor-parquet-clair',
    name: 'Parquet Clair',
    price: 125,
    texture: '/textures/environment/floors/sol-parquet-02.png',
  },
  {
    id: 'floor-tomette',
    name: 'Tomette',
    price: 160,
    texture: '/textures/environment/floors/sol-tomette.png',
  },
  {
    id: 'floor-damier-doux',
    name: 'Damier Doux',
    price: 65,
    texture: '/textures/environment/floors/sol-damier-doux.png',
  },
  {
    id: 'floor-carreaux-retro',
    name: 'Carreaux Retro',
    price: 95,
    texture: '/textures/environment/floors/sol-carreaux-retro.png',
  },
  {
    id: 'floor-chevron-beurre',
    name: 'Chevron Beurre',
    price: 125,
    texture: '/textures/environment/floors/sol-chevron-beurre.png',
  },
  {
    id: 'floor-peinture-blanche',
    name: 'Peinture Blanche',
    price: 50,
    texture: '/textures/environment/walls/mur-paint.png',
  },
  {
    id: 'floor-brun-mat',
    name: 'Brun Mat',
    price: 70,
    texture: '/textures/environment/walls/mur-brun-mat.png',
  },
  {
    id: 'floor-stuc-beige-doux',
    name: 'Stuc Beige Doux',
    price: 105,
    texture: '/textures/environment/walls/mur-stuc-beige-doux.png',
  },
]

const wallSkins = [
  {
    id: 'wall-classic',
    name: 'Peinture Blanche',
    price: 0,
    texture: '/textures/environment/walls/mur-paint.png',
    defaultUnlocked: true,
  },
  {
    id: 'wall-brique-02',
    name: 'Brique 02',
    price: 70,
    texture: '/textures/environment/walls/mur-brique-02.png',
  },
  {
    id: 'wall-briques-01',
    name: 'Briques 01',
    price: 105,
    texture: '/textures/environment/walls/mur-briques-01.png',
  },
  {
    id: 'wall-brun-mat',
    name: 'Brun Mat',
    price: 70,
    texture: '/textures/environment/walls/mur-brun-mat.png',
  },
  {
    id: 'wall-stuc-beige-doux',
    name: 'Stuc Beige Doux',
    price: 105,
    texture: '/textures/environment/walls/mur-stuc-beige-doux.png',
  },
  {
    id: 'wall-tomette',
    name: 'Tomette',
    price: 160,
    texture: '/textures/environment/floors/sol-tomette.png',
  },
  {
    id: 'wall-damier-doux',
    name: 'Damier Doux',
    price: 65,
    texture: '/textures/environment/floors/sol-damier-doux.png',
  },
  {
    id: 'wall-carreaux-retro',
    name: 'Carreaux Retro',
    price: 95,
    texture: '/textures/environment/floors/sol-carreaux-retro.png',
  },
  {
    id: 'wall-chevron-beurre',
    name: 'Chevron Beurre',
    price: 125,
    texture: '/textures/environment/floors/sol-chevron-beurre.png',
  },
  {
    id: 'wall-fond-vert',
    name: 'Fond Vert',
    price: 0,
    texture: '/textures/environment/walls/Fond%20Vert.png',
    adminOnly: true,
  },
]

const placementRaycaster = new Raycaster()
const placementRayOrigin = new Vector3()
const placementRayDirection = new Vector3(0, -1, 0)

const emotes = [
  { id: 'wave', label: 'Salut', glyph: '👋' },
  { id: 'dance', label: 'Danse', glyph: '♫' },
]

function snap(value, gridSize = CUSTOM_GRID_SIZE) {
  return Math.round(value / gridSize) * gridSize
}

function clampToCustomRoom(x, z) {
  return [
    MathUtils.clamp(x, CUSTOM_ROOM_BOUNDS.minX, CUSTOM_ROOM_BOUNDS.maxX),
    MathUtils.clamp(z, CUSTOM_ROOM_BOUNDS.minZ, CUSTOM_ROOM_BOUNDS.maxZ),
  ]
}

function clampToEditableWorld(x, z) {
  return [
    MathUtils.clamp(x, -OUTDOOR_HALF_SIZE + 1, OUTDOOR_HALF_SIZE - 1),
    MathUtils.clamp(z, -OUTDOOR_HALF_SIZE + 1, OUTDOOR_HALF_SIZE - 1),
  ]
}

function normalizeSavedObjectPosition(position, fallbackPosition = [0, 0, 0]) {
  const source = Array.isArray(position) && position.length === 3 ? position : fallbackPosition
  const fallback = Array.isArray(fallbackPosition) && fallbackPosition.length === 3 ? fallbackPosition : [0, 0, 0]
  const rawX = Number(source[0])
  const rawY = Number(source[1])
  const rawZ = Number(source[2])
  const [x, z] = clampToEditableWorld(
    Number.isFinite(rawX) ? rawX : fallback[0],
    Number.isFinite(rawZ) ? rawZ : fallback[2],
  )

  return [
    x,
    Number.isFinite(rawY) ? rawY : fallback[1],
    z,
  ]
}

function getRotatedGoalCollider(goalObject, localPosition) {
  const goalPosition = goalObject?.position ?? [0, 0, GOAL_Z]
  const rotationY = goalObject?.rotationY ?? 0
  const cos = Math.cos(rotationY)
  const sin = Math.sin(rotationY)
  const [localX, localY, localZ] = localPosition

  return {
    position: [
      goalPosition[0] + localX * cos + localZ * sin,
      goalPosition[1] + localY,
      goalPosition[2] - localX * sin + localZ * cos,
    ],
    rotation: [0, rotationY, 0],
  }
}

function transformLocalPoint(object, localPosition) {
  const rotationY = object?.rotationY ?? 0
  const cos = Math.cos(rotationY)
  const sin = Math.sin(rotationY)
  const [localX, localY, localZ] = localPosition
  const position = object?.position ?? [0, 0, 0]

  return [
    position[0] + localX * cos + localZ * sin,
    position[1] + localY,
    position[2] - localX * sin + localZ * cos,
  ]
}

function getSeatWorldData(object, seat) {
  const basePosition = transformLocalPoint(object, seat.localPosition)
  const rotationY = (object.rotationY ?? 0) + (seat.localRotationY ?? 0)
  const seatedForwardOffset = seat.seatedForwardOffset ?? 0
  const position = [
    basePosition[0] + Math.sin(rotationY) * seatedForwardOffset,
    basePosition[1],
    basePosition[2] + Math.cos(rotationY) * seatedForwardOffset,
  ]
  const standUpForwardOffset = seat.standUpForwardOffset ?? seatedForwardOffset
  const exitPosition = [
    basePosition[0] + Math.sin(rotationY) * standUpForwardOffset,
    basePosition[1],
    basePosition[2] + Math.cos(rotationY) * standUpForwardOffset,
  ]

  return {
    id: seat.id,
    objectId: object.id,
    position,
    exitPosition,
    rotationY,
    sittingHeight: PLAYER_SITTING_HEIGHT + basePosition[1],
  }
}

function getObjectLabel(object) {
  const catalogItem = objectCatalog[object.objectId]
  if (catalogItem?.name) return catalogItem.name
  if (object.type === 'sofa') return 'Canape'
  if (object.type === 'goal') return 'Cage'
  return object.type
}

function getInventoryCards(objects) {
  const grouped = {}

  objects
    .filter((object) => object.canStore)
    .forEach((object) => {
      const objectId = object.objectId ?? object.type
      const catalogItem = objectCatalog[objectId]
      if (!grouped[objectId]) {
        grouped[objectId] = {
          objectId,
          type: object.type,
          name: getObjectLabel(object),
          category: catalogItem?.category ?? 'misc',
          thumbnail: catalogItem?.thumbnail ?? null,
          total: 0,
          stored: 0,
          placed: 0,
          storedInstanceId: null,
        }
      }

      grouped[objectId].total += 1
      if (object.status === 'stored') {
        grouped[objectId].stored += 1
        grouped[objectId].storedInstanceId = grouped[objectId].storedInstanceId ?? object.id
      } else {
        grouped[objectId].placed += 1
      }
    })

  return Object.values(grouped)
}

function normalizeSocialFriend(friend) {
  if (!friend?.userId) return null
  return {
    userId: friend.userId,
    displayName: friend.displayName || 'Joueur',
    addedAt: friend.addedAt || new Date().toISOString(),
    lastSeenAt: friend.lastSeenAt || null,
  }
}

function mergeSocialFriends(left = [], right = []) {
  const byUserId = new Map()
  ;[...left, ...right].forEach((friend) => {
    const normalized = normalizeSocialFriend(friend)
    if (!normalized) return
    const existing = byUserId.get(normalized.userId)
    byUserId.set(normalized.userId, {
      ...existing,
      ...normalized,
      displayName: normalized.displayName || existing?.displayName || 'Joueur',
      lastSeenAt: normalized.lastSeenAt || existing?.lastSeenAt || null,
    })
  })
  return Array.from(byUserId.values())
}

function formatRelativeLastSeen(value) {
  if (!value) return 'Derniere connexion inconnue'
  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp)) return 'Derniere connexion inconnue'
  const elapsedSeconds = Math.max(1, Math.floor((Date.now() - timestamp) / 1000))

  if (elapsedSeconds < 60) return 'Derniere connexion a l instant'
  const elapsedMinutes = Math.floor(elapsedSeconds / 60)
  if (elapsedMinutes < 60) return `Derniere connexion il y a ${elapsedMinutes} minute${elapsedMinutes > 1 ? 's' : ''}`
  const elapsedHours = Math.floor(elapsedMinutes / 60)
  if (elapsedHours < 24) return `Derniere connexion il y a ${elapsedHours} heure${elapsedHours > 1 ? 's' : ''}`
  const elapsedDays = Math.floor(elapsedHours / 24)
  return `Derniere connexion il y a ${elapsedDays} jour${elapsedDays > 1 ? 's' : ''}`
}

function getEmoteAngle(index, count) {
  if (count <= 1) return -Math.PI / 2
  const t = index / (count - 1)
  return EMOTE_MENU_ARC_START + t * (EMOTE_MENU_ARC_END - EMOTE_MENU_ARC_START)
}

function getEmoteSelection(dx, dy) {
  const distance = Math.hypot(dx, dy)
  if (distance < EMOTE_MENU_DEADZONE) return null

  if (emotes.length === 1) {
    return dy < -EMOTE_MENU_DEADZONE ? emotes[0].id : null
  }

  const angle = Math.atan2(dy, dx)
  const arcPadding = (EMOTE_MENU_ARC_END - EMOTE_MENU_ARC_START) / Math.max(2, emotes.length - 1) / 2
  if (angle < EMOTE_MENU_ARC_START - arcPadding || angle > EMOTE_MENU_ARC_END + arcPadding) return null

  let bestIndex = 0
  let bestDistance = Infinity
  for (let index = 0; index < emotes.length; index += 1) {
    const delta = Math.abs(angle - getEmoteAngle(index, emotes.length))
    if (delta < bestDistance) {
      bestDistance = delta
      bestIndex = index
    }
  }
  return emotes[bestIndex].id
}

function getHipsRestHeight(clip) {
  const track = clip?.tracks.find((nextTrack) => nextTrack.name === 'mixamorigHips.position')
  return track ? track.values[1] : null
}

function lockEmoteHipsHeight(clip, restHeight) {
  if (restHeight === null) return clip
  const track = clip.tracks.find((nextTrack) => nextTrack.name === 'mixamorigHips.position')
  if (!track) return clip

  for (let index = 1; index < track.values.length; index += 3) {
    track.values[index] = restHeight
  }
  return clip
}

function lockHipsPlanarPosition(clip) {
  const track = clip?.tracks.find((nextTrack) => nextTrack.name === 'mixamorigHips.position')
  if (!track) return clip

  const baseX = track.values[0]
  const baseZ = track.values[2]
  for (let index = 0; index < track.values.length; index += 3) {
    track.values[index] = baseX
    track.values[index + 2] = baseZ
  }
  return clip
}

function getObjectHipsRestHeight(object) {
  const hips = object?.getObjectByName?.('mixamorigHips')
  if (hips) return hips.position.y

  let fallback = null
  object?.traverse?.((child) => {
    if (fallback !== null) return
    if (typeof child.name === 'string' && child.name.toLowerCase().endsWith('hips')) {
      fallback = child.position.y
    }
  })
  return fallback
}

function dampAngle(current, target, damping, delta) {
  let diff = (target - current + Math.PI) % (Math.PI * 2)
  if (diff < 0) diff += Math.PI * 2
  diff -= Math.PI
  return current + diff * Math.min(1, damping * delta)
}

function getKeyboardKey(event) {
  if (typeof event?.key === 'string') return event.key.toLowerCase()
  if (typeof event?.code !== 'string') return ''
  if (event.code.startsWith('Key') && event.code.length === 4) return event.code.slice(3).toLowerCase()
  return event.code.toLowerCase()
}

function isTextInputEvent(event) {
  const target = event?.target
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  )
}

function clampCameraInPlayableVolume(x, y, z, currentZone = ZONES.interior) {
  const limits = PLAY_AREA_LIMITS[currentZone] ?? PLAY_AREA_LIMITS.interior
  const settings = CAMERA_SETTINGS[currentZone] ?? CAMERA_SETTINGS.interior
  const zMax = currentZone === ZONES.interior || currentZone === ZONES.secondRoom ? 4.94 : limits.maxZ
  const clampedX = MathUtils.clamp(x, limits.minX, limits.maxX)
  const clampedY = MathUtils.clamp(y, settings.minY, settings.maxY)
  const clampedZ = MathUtils.clamp(z, limits.minZ, zMax)
  return { x: clampedX, y: clampedY, z: clampedZ }
}

function useCombatActionsAvailability(actionsRef) {
  const [actions, setActions] = useState({ canKick: false, canPunch: false })

  useEffect(() => {
    const interval = window.setInterval(() => {
      const next = actionsRef.current ?? { canKick: false, canPunch: false }
      setActions((current) => (
        current.canKick === next.canKick && current.canPunch === next.canPunch
          ? current
          : { canKick: next.canKick, canPunch: next.canPunch }
      ))
    }, 50)
    return () => window.clearInterval(interval)
  }, [actionsRef])

  return actions
}

function CombatActionDock({
  touchRef,
  canKick,
  canPunch,
  showSpell,
  onSpellPress,
}) {
  const count = (canPunch ? 1 : 0) + (canKick ? 1 : 0) + (showSpell ? 1 : 0)
  if (count === 0) return null

  const queuePunch = () => {
    touchRef.current.punchQueued = true
  }

  const queueKick = () => {
    touchRef.current.kickQueued = true
  }

  return (
    <div className={`combat-action-dock combat-action-dock--count-${count}`}>
      {canPunch && (
        <button
          className="combat-action-btn combat-action-btn--punch"
          type="button"
          aria-label="Taper"
          onPointerDown={(event) => {
            event.preventDefault()
            queuePunch()
          }}
        >
          <span className="combat-action-icon" aria-hidden="true">👊</span>
          <span className="combat-action-label">Taper</span>
        </button>
      )}
      {canKick && (
        <button
          className="combat-action-btn combat-action-btn--kick"
          type="button"
          aria-label="Tirer"
          onPointerDown={(event) => {
            event.preventDefault()
            queueKick()
          }}
        >
          <span className="combat-action-icon" aria-hidden="true">⚽</span>
          <span className="combat-action-label">Tirer</span>
        </button>
      )}
      {showSpell && (
        <button
          className="combat-action-btn combat-action-btn--spell"
          type="button"
          aria-label="Lancer un sort"
          onPointerDown={(event) => {
            event.preventDefault()
            onSpellPress?.()
          }}
        >
          <span className="combat-action-icon" aria-hidden="true">🔥</span>
          <span className="combat-action-label">Sort</span>
        </button>
      )}
    </div>
  )
}

function SummonCooldownBadge({ until }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(interval)
  }, [])
  const remaining = Math.max(0, until - now)
  if (remaining <= 0) return null
  return (
    <div className="charge-bar-wrap summon-cooldown-wrap">
      <span className="charge-bar-label">💀 Réinvocation dans {Math.ceil(remaining / 1000)}s</span>
    </div>
  )
}

function useKeyboardInput() {
  const keysRef = useRef({
    forward: false,
    back: false,
    left: false,
    right: false,
    actionQueued: false,
    punchQueued: false,
    kickQueued: false,
  })

  useEffect(() => {
    const resetKeys = () => {
      keysRef.current.forward = false
      keysRef.current.back = false
      keysRef.current.left = false
      keysRef.current.right = false
      keysRef.current.actionQueued = false
      keysRef.current.punchQueued = false
      keysRef.current.kickQueued = false
    }

    const resetKeysWhenInactive = () => {
      resetKeys()
    }

    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') resetKeys()
    }

    const onKeyDown = (event) => {
      if (isTextInputEvent(event)) {
        resetKeys()
        return
      }

      const key = getKeyboardKey(event)

      if (key === 'z' || key === 'arrowup' || key === 'w') keysRef.current.forward = true
      if (key === 's' || key === 'arrowdown') keysRef.current.back = true
      if (key === 'q' || key === 'arrowleft' || key === 'a') keysRef.current.left = true
      if (key === 'd' || key === 'arrowright') keysRef.current.right = true

      if (key === ' ' || key === 'space') {
        event.preventDefault()
        keysRef.current.actionQueued = true
      }
    }

    const onKeyUp = (event) => {
      if (isTextInputEvent(event)) {
        resetKeys()
        return
      }

      const key = getKeyboardKey(event)

      if (key === 'z' || key === 'arrowup' || key === 'w') keysRef.current.forward = false
      if (key === 's' || key === 'arrowdown') keysRef.current.back = false
      if (key === 'q' || key === 'arrowleft' || key === 'a') keysRef.current.left = false
      if (key === 'd' || key === 'arrowright') keysRef.current.right = false
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', resetKeysWhenInactive)
    window.addEventListener('pagehide', resetKeysWhenInactive)
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', resetKeysWhenInactive)
      window.removeEventListener('pagehide', resetKeysWhenInactive)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])

  return keysRef
}

function HouseInterior({ floorTexturePath, wallTexturePath, ceilingTexturePath, hideCeiling, hideRoof, exteriorOnly = false }) {
  const floorColorMap = useGameTexture(floorTexturePath)
  const wallColorMap = useGameTexture(wallTexturePath)
  const ceilingColorMap = useGameTexture(ceilingTexturePath)
  const exteriorWallTexture = useTexture(EXTERIOR_WALL_TEXTURE)
  floorColorMap.wrapS = RepeatWrapping
  floorColorMap.wrapT = RepeatWrapping
  floorColorMap.repeat.set(3.2, 3.2)
  floorColorMap.colorSpace = SRGBColorSpace
  wallColorMap.wrapS = RepeatWrapping
  wallColorMap.wrapT = RepeatWrapping
  wallColorMap.colorSpace = SRGBColorSpace
  ceilingColorMap.wrapS = RepeatWrapping
  ceilingColorMap.wrapT = RepeatWrapping
  ceilingColorMap.colorSpace = SRGBColorSpace
  const ceilingTexture = useMemo(() => {
    const next = ceilingColorMap.clone()
    next.wrapS = RepeatWrapping
    next.wrapT = RepeatWrapping
    next.repeat.set(
      Math.max(0.01, MAIN_ROOM.width * WALL_REPEAT_X_PER_UNIT),
      Math.max(0.01, MAIN_ROOM.depth * WALL_REPEAT_X_PER_UNIT),
    )
    next.colorSpace = SRGBColorSpace
    next.needsUpdate = true
    return next
  }, [ceilingColorMap])
  useEffect(() => () => ceilingTexture.dispose(), [ceilingTexture])

  return (
    <group userData={{ debugCategory: exteriorOnly ? 'house-exterior' : 'house-shell' }}>
      <group visible={exteriorOnly}>
        <MergedPlayerExteriorShell />
      </group>
      <group visible={!exteriorOnly}>
        <HouseWalls wallTexture={wallColorMap} />
        <mesh position={[0, MAIN_ROOM.height - 0.02, 0]} visible={!hideCeiling}>
          <boxGeometry args={[MAIN_ROOM.width, 0.1, MAIN_ROOM.depth]} />
          <meshStandardMaterial map={ceilingTexture} color="#e6edf6" side={BackSide} />
        </mesh>
        <mesh position={[secondRoom.position[0], secondRoom.size[1] - 0.02, secondRoom.position[2]]} visible={!hideCeiling}>
          <boxGeometry args={[secondRoom.size[0], 0.1, secondRoom.size[2]]} />
          <meshStandardMaterial map={ceilingTexture} color="#edf1f5" side={BackSide} />
        </mesh>
      </group>
      <group visible={!hideRoof}>
          <GableRoof
            width={MAIN_ROOM.width}
            depth={MAIN_ROOM.depth}
            wallTopY={MAIN_ROOM.height}
            gableBaseY={MAIN_ROOM.height}
            pitch={32}
            overhang={0.42}
            thickness={0.14}
            wallThickness={houseLayout.wallThickness}
            color="#8b4c3f"
            gableColor={EXTERIOR_WALL_COLOR}
            gableTexture={exteriorWallTexture}
          />
          <group position={secondRoom.position}>
            <LeanToRoof
              width={secondRoom.size[0]}
              depth={secondRoom.size[2]}
              wallTopY={secondRoom.size[1]}
              attachSide="south"
              rise={MAIN_ROOM.height - secondRoom.size[1]}
              overhang={0.34}
              overhangAttached={0}
              thickness={0.12}
              wallThickness={houseLayout.wallThickness}
              color="#8b4c3f"
              gableColor={EXTERIOR_WALL_COLOR}
              gableTexture={exteriorWallTexture}
            />
          </group>
      </group>

      <group visible={!exteriorOnly}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
          <planeGeometry args={[MAIN_ROOM.width, MAIN_ROOM.depth]} />
          <meshStandardMaterial
            map={floorColorMap}
            roughness={0.66}
            metalness={0.08}
            color="#b8ad9b"
          />
        </mesh>
      </group>

      <gridHelper
        args={[10, 20, '#c3ccd6', '#d8e0e8']}
        position={[0, 0.01, 0]}
        visible={!exteriorOnly && SHOW_FLOOR_GRID}
      />

    </group>
  )
}

function createColoredGeometryCollector() {
  return {
    positions: [],
    normals: [],
    colors: [],
  }
}

function pushColoredGeometry(collector, geometry, colorValue, matrix = null) {
  const color = new Color(colorValue)
  const workingGeometry = geometry.index ? geometry.toNonIndexed() : geometry.clone()
  if (matrix) workingGeometry.applyMatrix4(matrix)
  if (!workingGeometry.attributes.normal) workingGeometry.computeVertexNormals()

  const positions = workingGeometry.attributes.position.array
  const normals = workingGeometry.attributes.normal.array

  for (let index = 0; index < positions.length; index += 3) {
    collector.positions.push(positions[index], positions[index + 1], positions[index + 2])
    collector.normals.push(normals[index], normals[index + 1], normals[index + 2])
    collector.colors.push(color.r, color.g, color.b)
  }

  workingGeometry.dispose()
}

function pushColoredBox(collector, position, rotationY, size, color, depthBoost = 0) {
  const geometry = new BoxGeometry(size[0], size[1], size[2] + depthBoost)
  const matrix = new Matrix4().makeRotationY(rotationY)
  matrix.setPosition(position[0], position[1], position[2])
  pushColoredGeometry(collector, geometry, color, matrix)
  geometry.dispose()
}

function getWallExteriorColor(wall) {
  return wall.sideA?.type === 'outside'
    ? wall.sideA.color
    : wall.sideB?.type === 'outside'
      ? wall.sideB.color
      : EXTERIOR_WALL_COLOR
}

function createPlayerExteriorShellGeometry() {
  const collector = createColoredGeometryCollector()

  houseLayout.walls.forEach((wall) => {
    const color = getWallExteriorColor(wall)
    splitWallIntoSolidRects(wall).forEach((rect) => {
      const transform = getWallColliderTransform(wall, rect)
      pushColoredBox(
        collector,
        transform.position,
        transform.rotation[1],
        [transform.args[0] * 2, transform.args[1] * 2, transform.args[2] * 2],
        color,
      )
    })

    ;(wall.openings ?? []).forEach((opening) => {
      const wallBottom = wall.bottom ?? wall.bottomY ?? 0
      const bottom = opening.bottom ?? 0
      const top = bottom + opening.height
      const topHeight = wall.height - top
      const min = opening.center - opening.width * 0.5
      const max = opening.center + opening.width * 0.5
      const centerY = wallBottom + bottom + opening.height * 0.5
      const revealRects = [
        { center: min, y: centerY, width: 0.05, height: opening.height },
        { center: max, y: centerY, width: 0.05, height: opening.height },
      ]

      if (topHeight > 0.001) {
        revealRects.push({ center: opening.center, y: wallBottom + top, width: opening.width, height: 0.05 })
      }

      if (bottom > 0.001) {
        revealRects.push({ center: opening.center, y: wallBottom + bottom, width: opening.width, height: 0.05 })
      }

      revealRects.forEach((rect) => {
        const transform = getWallColliderTransform(wall, rect)
        pushColoredBox(
          collector,
          transform.position,
          transform.rotation[1],
          [transform.args[0] * 2, transform.args[1] * 2, transform.args[2] * 2],
          '#d8d0c4',
          0.03,
        )
      })
    })
  })

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(collector.positions, 3))
  geometry.setAttribute('normal', new Float32BufferAttribute(collector.normals, 3))
  geometry.setAttribute('color', new Float32BufferAttribute(collector.colors, 3))
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return geometry
}

function MergedPlayerExteriorShell() {
  const geometry = useMemo(() => createPlayerExteriorShellGeometry(), [])

  useEffect(() => () => geometry.dispose(), [geometry])

  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial vertexColors roughness={0.78} side={DoubleSide} />
    </mesh>
  )
}

function WallBlockMaterial({ attach, side, width, height, wallTexture, exteriorTexture, capColor = '#d8d0c4' }) {
  const materialColor = side?.color ?? capColor
  const sideMaterial = side?.material
  const isExterior = side?.type === 'outside'
  const repeatedTexture = useMemo(() => {
    if (!side) return null
    const sourceTexture = isExterior ? exteriorTexture : wallTexture
    if (!isExterior && sideMaterial !== 'active_wall') return null
    const next = sourceTexture.clone()
    next.wrapS = RepeatWrapping
    next.wrapT = RepeatWrapping
    next.repeat.set(
      Math.max(0.01, width * WALL_REPEAT_X_PER_UNIT),
      Math.max(0.01, height * WALL_REPEAT_Y_PER_UNIT),
    )
    next.colorSpace = SRGBColorSpace
    next.needsUpdate = true
    return next
  }, [exteriorTexture, height, isExterior, side, sideMaterial, wallTexture, width])

  useEffect(() => {
    return () => repeatedTexture?.dispose()
  }, [repeatedTexture])

  if (isExterior) {
    return (
      <meshStandardMaterial
        attach={attach}
        map={repeatedTexture}
        color={EXTERIOR_WALL_COLOR}
        roughness={0.82}
        polygonOffset
        polygonOffsetFactor={-1}
        polygonOffsetUnits={-1}
      />
    )
  }

  if (sideMaterial === 'active_wall') {
    return (
      <meshStandardMaterial
        attach={attach}
        map={repeatedTexture}
        color="#e6edf6"
        roughness={0.68}
        metalness={0.03}
        polygonOffset
        polygonOffsetFactor={-0.5}
        polygonOffsetUnits={-0.5}
      />
    )
  }

  return <meshStandardMaterial attach={attach} color={materialColor} roughness={0.78} />
}

function getWallMaterialSlots(wall) {
  const slots = [null, null, null, null, null, null]
  const dx = wall.endCorner.x - wall.startCorner.x
  const dz = wall.endCorner.z - wall.startCorner.z
  const length = Math.hypot(dx, dz) || 1
  const leftNormal = [-dz / length, 0, dx / length]

  ;[wall.sideA, wall.sideB].forEach((side) => {
    const sideDot = side.normal[0] * leftNormal[0] + side.normal[2] * leftNormal[2]
    if (sideDot >= 0) slots[4] = side
    if (sideDot < 0) slots[5] = side
  })

  return slots
}

function WallVolume({ wall, rect, wallTexture, exteriorTexture }) {
  const transform = getWallColliderTransform(wall, rect)
  const materialSlots = useMemo(() => getWallMaterialSlots(wall), [wall])
  const args = [
    transform.args[0] * 2,
    transform.args[1] * 2,
    transform.args[2] * 2,
  ]
  const textureWidth = transform.renderWidth ?? rect.width
  const textureHeight = rect.height
  const hasExterior = materialSlots.some((side) => side?.type === 'outside')
  const capColor = hasExterior ? EXTERIOR_WALL_COLOR : '#d8d0c4'

  return (
    <mesh position={transform.position} rotation={transform.rotation} castShadow receiveShadow>
      <boxGeometry args={args} />
      {materialSlots.map((side, index) => (
        <WallBlockMaterial
          key={`${rect.id}-material-${index}`}
          attach={`material-${index}`}
          side={side}
          width={textureWidth}
          height={textureHeight}
          wallTexture={wallTexture}
          exteriorTexture={exteriorTexture}
          capColor={capColor}
        />
      ))}
    </mesh>
  )
}

function HouseWalls({ wallTexture }) {
  const exteriorTexture = useTexture(EXTERIOR_WALL_TEXTURE)
  const walls = houseLayout.walls

  return (
    <>
      {walls.flatMap((wall) =>
        splitWallIntoSolidRects(wall).map((rect) => (
          <WallVolume
            key={rect.id}
            wall={wall}
            rect={rect}
            wallTexture={wallTexture}
            exteriorTexture={exteriorTexture}
          />
        )),
      )}
      <HouseOpeningReveals walls={walls} />
    </>
  )
}

function HouseOpeningReveals({ walls }) {
  const revealColor = '#d8d0c4'

  const makeReveal = (wall, key, center, y, width, height) => {
    const transform = getWallColliderTransform(wall, { center, y, width, height })
    return (
      <mesh key={key} position={transform.position} rotation={transform.rotation}>
        <boxGeometry args={[width, height, wall.thickness + 0.03]} />
        <meshStandardMaterial color={revealColor} roughness={0.72} />
      </mesh>
    )
  }

  return (
    <>
      {walls.flatMap((wall) =>
        (wall.openings ?? []).flatMap((opening) => {
          const wallBottom = wall.bottom ?? wall.bottomY ?? 0
          const bottom = opening.bottom ?? 0
          const min = opening.center - opening.width * 0.5
          const max = opening.center + opening.width * 0.5
          const centerY = wallBottom + bottom + opening.height * 0.5
          const topY = wallBottom + bottom + opening.height
          const topHeight = wall.height - (bottom + opening.height)
          const bottomRevealY = wallBottom + bottom

          return [
            makeReveal(wall, `${wall.id}-${opening.id}-reveal-left`, min, centerY, 0.05, opening.height),
            makeReveal(wall, `${wall.id}-${opening.id}-reveal-right`, max, centerY, 0.05, opening.height),
            topHeight > 0.001 && makeReveal(wall, `${wall.id}-${opening.id}-reveal-top`, opening.center, topY, opening.width, 0.05),
            bottom > 0.001 && makeReveal(wall, `${wall.id}-${opening.id}-reveal-bottom`, opening.center, bottomRevealY, opening.width, 0.05),
          ].filter(Boolean)
        }),
      )}
    </>
  )
}

const BASE_SCENE_BACKGROUND = new Color('#ecfdff')
const BASE_SCENE_FOG = new Color('#fbffff')
const GRAVEYARD_ATMOSPHERE = BIOME_VISUALS.graveyard.atmosphere
const GRAVEYARD_SCENE_BACKGROUND = new Color(GRAVEYARD_ATMOSPHERE.background)
const GRAVEYARD_SCENE_FOG = new Color(GRAVEYARD_ATMOSPHERE.fog)

function SceneAtmosphere({
  currentZone,
  playerPositionRef,
  biomeAreas = MAP_BIOME_AREAS,
}) {
  const { scene } = useThree()
  const isOutside = currentZone === ZONES.outside
  const backgroundColor = '#ecfdff'
  const backgroundRef = useRef()
  const atmosphereFog = useMemo(() => new FogExp2(BASE_SCENE_FOG, 0.0008), [])
  const influenceRef = useRef(0)

  useEffect(() => {
    scene.fog = atmosphereFog
    return () => {
      if (scene.fog === atmosphereFog) {
        scene.fog = null
      }
    }
  }, [atmosphereFog, scene])

  useFrame((_, delta) => {
    const position = playerPositionRef?.current
    const targetInfluence = isOutside && position
      ? getBiomeInfluence('graveyard', position.x, position.z, 'fogIntensity', biomeAreas)
      : 0
    influenceRef.current = MathUtils.lerp(
      influenceRef.current,
      targetInfluence,
      1 - Math.exp(-delta * 0.85),
    )
    const influence = influenceRef.current
    const fogInfluence = influence

    if (backgroundRef.current) {
      backgroundRef.current.copy(BASE_SCENE_BACKGROUND).lerp(GRAVEYARD_SCENE_BACKGROUND, fogInfluence)
    }

    atmosphereFog.color.copy(BASE_SCENE_FOG).lerp(GRAVEYARD_SCENE_FOG, fogInfluence)
    atmosphereFog.density = MathUtils.lerp(isOutside ? 0.0008 : 0.0016, GRAVEYARD_ATMOSPHERE.fogDensity, fogInfluence)
  })

  return (
    <>
      <color ref={backgroundRef} attach="background" args={[backgroundColor]} />
    </>
  )
}

function LayeredSceneRenderer({ currentZone }) {
  const { gl, scene, camera } = useThree()

  useFrame(() => {
    const previousAutoClear = gl.autoClear
    const previousLayerMask = camera.layers.mask
    const previousBackground = scene.background

    if (currentZone === ZONES.outside) {
      camera.layers.enable(OUTDOOR_LIGHT_LAYER)
      gl.autoClear = previousAutoClear
      gl.render(scene, camera)
      camera.layers.mask = previousLayerMask
      return
    }

    // Inside the house, render the outdoor world and the indoor house in
    // separate passes. A single camera seeing both layers would let the
    // outdoor sun be collected as a global light and brighten the interior.
    gl.autoClear = true
    camera.layers.set(OUTDOOR_LIGHT_LAYER)
    gl.render(scene, camera)

    gl.autoClear = false
    scene.background = null
    camera.layers.set(0)
    gl.render(scene, camera)

    scene.background = previousBackground
    camera.layers.mask = previousLayerMask
    gl.autoClear = previousAutoClear
  }, 1)

  return null
}

function InteriorLighting({ active, roomLightOn = true, lightColor = '#ffffff', lightIntensity = 2 }) {
  const activeIntensity = active ? 1 : 0
  const roomIntensity = roomLightOn ? lightIntensity : 0.1
  const ambientIntensity = 0.36 * roomIntensity
  const hemisphereIntensity = 0.56 * roomIntensity

  return (
    <>
      {/* Keep the same light set mounted across indoor/outdoor transitions.
          Changing light/fog/environment topology can force first-use shader variants. */}
      <ambientLight intensity={ambientIntensity * activeIntensity} color={roomLightOn ? lightColor : '#182238'} />
      <hemisphereLight args={[roomLightOn ? lightColor : '#141d30', '#020308', hemisphereIntensity * activeIntensity]} />
      <directionalLight position={[4, 7, 5]} intensity={1.16 * roomIntensity * activeIntensity} color={roomLightOn ? lightColor : '#ffffff'} />
      <directionalLight position={[-3, 5, -4]} intensity={0.32 * roomIntensity * activeIntensity} color={roomLightOn ? lightColor : '#ffffff'} />
    </>
  )
}

const LIGHT_SWITCH_POS = { x: -4.86, z: -1.3 }
const LIGHT_SWITCH_DISTANCE = 1.5

function LightSwitchTrigger({ playerPositionRef, enabled, onNearChange }) {
  const nearRef = useRef(false)
  useFrame(() => {
    if (!enabled) {
      if (nearRef.current) { nearRef.current = false; onNearChange(false) }
      return
    }
    const p = playerPositionRef.current
    const dist = Math.hypot(p.x - LIGHT_SWITCH_POS.x, p.z - LIGHT_SWITCH_POS.z)
    const next = dist <= LIGHT_SWITCH_DISTANCE
    if (next !== nearRef.current) { nearRef.current = next; onNearChange(next) }
  })
  return null
}

function LightSwitch({ isOn, isNear, onOpen, mode }) {
  const WALL_X = -4.86
  const SWITCH_Y = 1.1
  const SWITCH_Z = -1.3
  const plateColor = '#f0ece4'
  const rockerOnColor = '#fffbe6'
  const rockerOffColor = '#444'

  return (
    <group position={[WALL_X, SWITCH_Y, SWITCH_Z]} rotation={[0, Math.PI / 2, 0]}>
      <mesh>
        <boxGeometry args={[0.086, 0.086, 0.018]} />
        <meshStandardMaterial color={plateColor} roughness={0.7} metalness={0.05} />
      </mesh>
      <mesh position={[0, isOn ? 0.012 : -0.012, 0.01]} rotation={[isOn ? -0.18 : 0.18, 0, 0]}>
        <boxGeometry args={[0.042, 0.056, 0.012]} />
        <meshStandardMaterial
          color={isOn ? rockerOnColor : rockerOffColor}
          emissive={isOn ? '#fff8c0' : '#000000'}
          emissiveIntensity={isOn ? 0.4 : 0}
          roughness={0.4}
        />
      </mesh>
      {isNear && mode === 'play' && (
        <Html position={[0, 0, 0.02]} center>
          <div
            onPointerDown={(e) => { e.stopPropagation(); onOpen() }}
            style={{ width: 60, height: 60, cursor: 'pointer', borderRadius: 4 }}
          />
        </Html>
      )}
    </group>
  )
}

function PhysicsBounds() {
  const wallSegments = houseLayout.walls
    .flatMap((wall) =>
      splitWallIntoSolidRects(wall).map((rect) => ({
        id: rect.id,
        ...getWallColliderTransform(wall, rect),
      })),
    )

  return (
    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider args={[5, 0.2, 5]} position={[0, -0.2, 0]} />
      {wallSegments.map((segment) => (
        <CuboidCollider key={segment.id} args={segment.args} position={segment.position} rotation={segment.rotation} />
      ))}
    </RigidBody>
  )
}

function LightColorWheel({ onChange }) {
  const canvasRef = useRef(null)
  const isDragging = useRef(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const size = canvas.width
    const cx = size / 2
    const cy = size / 2
    const radius = size / 2 - 1
    const imageData = ctx.createImageData(size, size)
    const data = imageData.data

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - cx
        const dy = y - cy
        const dist = Math.hypot(dx, dy)
        if (dist <= radius) {
          const hue = ((Math.atan2(dy, dx) * 180 / Math.PI) + 360) % 360
          const sat = dist / radius
          const h = hue / 60
          const i = Math.floor(h)
          const f = h - i
          const p = 1 - sat
          const q = 1 - sat * f
          const t = 1 - sat * (1 - f)
          let r, g, b
          switch (i % 6) {
            case 0: r = 1; g = t; b = p; break
            case 1: r = q; g = 1; b = p; break
            case 2: r = p; g = 1; b = t; break
            case 3: r = p; g = q; b = 1; break
            case 4: r = t; g = p; b = 1; break
            default: r = 1; g = p; b = q; break
          }
          const idx = (y * size + x) * 4
          data[idx] = Math.round(r * 255)
          data[idx + 1] = Math.round(g * 255)
          data[idx + 2] = Math.round(b * 255)
          data[idx + 3] = 255
        }
      }
    }

    ctx.putImageData(imageData, 0, 0)
  }, [])

  function pickColor(e) {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const clientX = e.clientX ?? e.touches?.[0]?.clientX
    const clientY = e.clientY ?? e.touches?.[0]?.clientY
    if (clientX == null) return
    const x = Math.round((clientX - rect.left) * (canvas.width / rect.width))
    const y = Math.round((clientY - rect.top) * (canvas.height / rect.height))
    const cx = canvas.width / 2
    const cy = canvas.height / 2
    if (Math.hypot(x - cx, y - cy) > canvas.width / 2) return
    const pixel = canvas.getContext('2d').getImageData(x, y, 1, 1).data
    const hex = '#' + [pixel[0], pixel[1], pixel[2]].map((v) => v.toString(16).padStart(2, '0')).join('')
    onChange(hex)
  }

  return (
    <canvas
      ref={canvasRef}
      width={140}
      height={140}
      style={{ width: '100%', aspectRatio: '1', borderRadius: '50%', cursor: 'crosshair', touchAction: 'none', display: 'block' }}
      onPointerDown={(e) => { isDragging.current = true; pickColor(e); e.currentTarget.setPointerCapture(e.pointerId) }}
      onPointerMove={(e) => { if (isDragging.current) pickColor(e) }}
      onPointerUp={() => { isDragging.current = false }}
    />
  )
}

function GlassContainmentRoom({ roomLightOn = true, lightColor = '#ffffff', lightweight = false }) {
  const [roomWidth, roomHeight, roomDepth] = secondRoom.size
  const halfWidth = roomWidth * 0.5
  const halfDepth = roomDepth * 0.5

  return (
    <group position={secondRoom.position}>
      <mesh position={[0, 0.012, 0]}>
        <boxGeometry args={[roomWidth, 0.05, roomDepth]} />
        <meshStandardMaterial color="#d4dbe3" />
      </mesh>

      <mesh position={[0, roomHeight * 0.5, -halfDepth + 0.02]}>
        <boxGeometry args={[roomWidth, roomHeight, 0.06]} />
        {lightweight ? (
          <meshStandardMaterial
            color={roomLightOn ? '#9ed8e8' : '#05080d'}
            transparent
            opacity={roomLightOn ? 0.24 : 0.48}
            roughness={0.18}
            metalness={0.04}
            depthWrite={false}
            side={BackSide}
          />
        ) : (
          <meshPhysicalMaterial
            color={roomLightOn ? '#bfefff' : '#05080d'}
            transparent
            opacity={1}
            roughness={0.05}
            metalness={0}
            transmission={1}
            thickness={0.2}
            ior={1.5}
            reflectivity={roomLightOn ? 0.32 : 0}
            envMapIntensity={roomLightOn ? 0.18 : 0}
            side={BackSide}
          />
        )}
      </mesh>

      <mesh position={[0, roomHeight + 0.03, -halfDepth + 0.055]}>
        <boxGeometry args={[roomWidth + 0.12, 0.06, 0.06]} />
        <meshStandardMaterial color={roomLightOn ? '#9da8b3' : '#05070b'} metalness={0.18} roughness={0.58} />
      </mesh>
      <mesh position={[0, -0.03, -halfDepth + 0.055]}>
        <boxGeometry args={[roomWidth + 0.12, 0.06, 0.06]} />
        <meshStandardMaterial color={roomLightOn ? '#9da8b3' : '#05070b'} metalness={0.18} roughness={0.58} />
      </mesh>
      <mesh position={[-halfWidth - 0.03, roomHeight * 0.5, -halfDepth + 0.055]}>
        <boxGeometry args={[0.06, roomHeight + 0.12, 0.06]} />
        <meshStandardMaterial color={roomLightOn ? '#9da8b3' : '#05070b'} metalness={0.18} roughness={0.58} />
      </mesh>
      <mesh position={[halfWidth + 0.03, roomHeight * 0.5, -halfDepth + 0.055]}>
        <boxGeometry args={[0.06, roomHeight + 0.12, 0.06]} />
        <meshStandardMaterial color={roomLightOn ? '#9da8b3' : '#05070b'} metalness={0.18} roughness={0.58} />
      </mesh>


    </group>
  )
}

function GlassContainmentColliders() {
  const [roomWidth, roomHeight, roomDepth] = secondRoom.size
  const halfWidth = roomWidth * 0.5
  const halfDepth = roomDepth * 0.5
  const halfHeight = roomHeight * 0.5
  const [, , roomZ] = secondRoom.position

  return (
    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider args={[halfWidth, halfHeight, 0.06]} position={[0, halfHeight, roomZ - halfDepth + 0.02]} />
    </RigidBody>
  )
}

function Ball({ ballRef, skinTexturePath, spawnPosition = [0, 3.2, 0], linearDamping = 0.35, angularDamping = 0.4 }) {
  const { gl } = useThree()
  const ballSkin = useGLTF('/models/ball/ballon.glb')
  const skinTexture = useGameTexture(skinTexturePath)
  skinTexture.colorSpace = SRGBColorSpace
  skinTexture.anisotropy = getCappedAnisotropy(gl)
  const visual = useMemo(() => {
    const candidates = []

    ballSkin.scene.traverse((object) => {
      if (!(object instanceof Mesh) || !object.geometry) return
      const geometry = object.geometry
      if (!geometry.boundingBox) geometry.computeBoundingBox()
      if (!geometry.boundingBox) return

      const size = geometry.boundingBox.getSize(new Vector3())
      const maxSide = Math.max(size.x, size.y, size.z)
      const minSide = Math.min(size.x, size.y, size.z)
      if (maxSide <= 0) return

      const roundness = minSide / maxSide
      const volume = size.x * size.y * size.z
      const score = roundness * roundness * volume
      candidates.push({ object, score })
    })

    const picked = candidates.sort((a, b) => b.score - a.score)[0]?.object
    if (!picked) return null

    const geometry = picked.geometry.clone()
    if (!geometry.boundingBox) geometry.computeBoundingBox()
    const center = geometry.boundingBox.getCenter(new Vector3())
    const size = geometry.boundingBox.getSize(new Vector3())
    const maxSide = Math.max(size.x, size.y, size.z) || 1

    geometry.translate(-center.x, -center.y, -center.z)

    const material = picked.material.clone()
    material.map = skinTexture
    material.needsUpdate = true

    return {
      geometry,
      material,
      scale: (BALL_RADIUS * 2) / maxSide,
    }
  }, [ballSkin.scene, skinTexture])

  return (
    <RigidBody
      ref={ballRef}
      name="ball"
      colliders={false}
      position={spawnPosition}
      restitution={0.82}
      friction={0.55}
      linearDamping={linearDamping}
      angularDamping={angularDamping}
      mass={1}
      ccd
    >
      <BallCollider args={[BALL_RADIUS]} />
      <group name="ball" userData={{ debugCategory: 'ball' }}>
        {visual && (
          <mesh
            geometry={visual.geometry}
            material={visual.material}
            scale={visual.scale}
            castShadow
            frustumCulled={false}
          />
        )}
      </group>
    </RigidBody>
  )
}

const DRAGON_POSITION = { x: 0, y: 0.03, z: 7.03 }
const DRAGON_WAKE_DISTANCE = 5
const DRAGON_WAKE_DELAY = 2
const DRAGON_SLEEP_DELAY = 4

const DRAGON_RIDE_MODEL_YAW_OFFSET = Math.PI / 2
const PLAYER_MAX_RUN_SPEED = 3.4
const DRAGON_RIDE_GROUND_SPEED = PLAYER_MAX_RUN_SPEED * 1.6
const DRAGON_RIDE_FLY_SPEED = PLAYER_MAX_RUN_SPEED * 3
const DRAGON_RIDE_TURN_SPEED = 2.2
const DRAGON_RIDE_CLIMB_SPEED = 4.5
const DRAGON_RIDE_MAX_ALTITUDE = 32
const DRAGON_RIDE_RIDER_HEIGHT = 1.0
const DRAGON_RIDE_CAMERA_HORIZONTAL_DAMPING = 9
const DRAGON_RIDE_CAMERA_VERTICAL_DAMPING = 5
const DRAGON_RIDE_CAMERA_ZOOM_DAMPING = 10
const DRAGON_RIDE_SADDLE_BONE_NAMES = {
  spine2: 'NPC_Spine2_021',
  spine3: 'NPC_Spine3_022',
  neck1: 'NPC_Neck1_040',
  calibration: 'NPC_Neck2_041',
}
const DRAGON_RIDE_SADDLE_VERTICAL_DAMPING = 8
const DRAGON_RIDE_SADDLE_FORWARD_DAMPING = 18
const DRAGON_RIDE_SADDLE_LATERAL_DAMPING = 32
const DRAGON_RIDE_SADDLE_ROTATION_DAMPING = 20
// This rig's local -X points above the back.
const DRAGON_RIDE_SADDLE_LOCAL_POSITION = new Vector3(-1.55, 0, 0)
const DRAGON_RIDE_RIDER_LIFT = 0.32
const DRAGON_RIDE_RIDER_WORLD_CLEARANCE = 0.28
const REMOTE_MOUNT_RIDER_VISUAL_LIFT = DRAGON_RIDE_RIDER_WORLD_CLEARANCE
const DRAGON_RIDE_DEFAULT_BODY_WIDTH = 0.72
const DRAGON_RIDE_MIN_BODY_WIDTH = 0.38
const DRAGON_RIDE_MAX_BODY_WIDTH = 1.35
const DRAGON_RIDE_HAND_RAY_HEIGHT = 0.9
// Geometric grip pose: hands rest this far forward of, and just below, the
// saddle socket so they settle on the dragon's back.
const DRAGON_RIDE_HAND_FALLBACK_FORWARD = -0.5
const DRAGON_RIDE_HAND_FALLBACK_DROP = 0.7
// Forward lean of the rider's upper torso (radians) so the arms can reach down
// onto the dragon's back. Larger = leans further forward.
const DRAGON_RIDE_TORSO_LEAN = -0.7
const DRAGON_RIDE_SEAT_SURFACE_OFFSET = 0.195
const DRAGON_RIDE_MIN_RIDER_LIFT = 0.18
const DRAGON_RIDE_MAX_RIDER_LIFT = 0.52
const MOUNT_JUMP_GRAVITY = 22

// Per-mount configuration. Everything that differs between a rideable creature
// (model, scale, orientation, animations, saddle bones, speeds, rider pose)
// lives here so the mount component and the rider logic stay generic. The
// dragon entry reuses the tuned DRAGON_RIDE_* constants so its behaviour is
// unchanged; new mounts only need a new entry.
const MOUNT_CONFIGS = {
  dragon: {
    id: 'dragon',
    label: 'le dragon',
    icon: '\u{1F409}',
    price: 5000,
    currencyLabel: "pieces d'or",
    modelUrl: '/models/dragon.glb',
    scale: 2,
    modelYawOffset: DRAGON_RIDE_MODEL_YAW_OFFSET,
    canFly: true,
    groundSpeed: DRAGON_RIDE_GROUND_SPEED,
    flySpeed: DRAGON_RIDE_FLY_SPEED,
    turnSpeed: DRAGON_RIDE_TURN_SPEED,
    climbSpeed: DRAGON_RIDE_CLIMB_SPEED,
    maxAltitude: DRAGON_RIDE_MAX_ALTITUDE,
    saddleBones: DRAGON_RIDE_SADDLE_BONE_NAMES,
    saddleLocalPosition: DRAGON_RIDE_SADDLE_LOCAL_POSITION,
    riderLift: DRAGON_RIDE_RIDER_LIFT,
    defaultBodyWidth: DRAGON_RIDE_DEFAULT_BODY_WIDTH,
    torsoLean: DRAGON_RIDE_TORSO_LEAN,
    handForward: DRAGON_RIDE_HAND_FALLBACK_FORWARD,
    handDrop: DRAGON_RIDE_HAND_FALLBACK_DROP,
    anims: {
      idle: { name: 'Dragon_Ancient_Dialogue_Relaxed_Idle', fallback: 'Dragon_Ancient_Patrol_Idle' },
      run: { name: 'Dragon_Run', timeScale: 1.15 },
      fly: { name: 'Dragon_Fly' },
      flyIdle: { name: 'Dragon_Fly_Idle', fallback: 'Dragon_Fly' },
    },
  },
  wolf: {
    id: 'wolf',
    label: 'le loup noir',
    icon: '\u{1F43A}',
    price: 2500,
    currencyLabel: 'euros',
    modelUrl: '/models/wolf.glb',
    // Terrestrial-only mount, faster than the dragon on the ground.
    scale: 0.6,
    modelYawOffset: 0,
    canFly: false,
    canJump: true,
    jumpSpeed: 8,
    groundSpeed: PLAYER_MAX_RUN_SPEED * 2.6,
    flySpeed: PLAYER_MAX_RUN_SPEED * 2.6,
    turnSpeed: 2.8,
    climbSpeed: 0,
    maxAltitude: 0,
    saddleBones: {
      spine2: 'Back',
      spine3: 'Torso',
      neck1: 'Torso',
      calibration: 'Torso',
    },
    saddleLocalPosition: new Vector3(0, 0, 0),
    liftWorldUp: true,
    // Manual lift on this rig: the auto back-height raycast is disabled so the
    // value below is used directly (set autoRiderLift: true to re-enable the
    // automatic measurement, which would otherwise overwrite riderLift).
    autoRiderLift: false,
    riderLift: -0.2,
    seatSurfaceOffset: 0.10,
    minRiderLift: -2,
    maxRiderLift: 0.4,
    defaultBodyWidth: 0.42,
    torsoLean: -0.35,
    // Anchor the rider's hands to a specific bone (the neck base) instead of the
    // geometric forward/down guess. handForward/handDrop then fine-tune from it.
    handBone: 'Torso3',
    handForward: -0.25,
    handDrop: 0.4,
    anims: {
      idle: { name: 'AnimalArmature|AnimalArmature|Idle' },
      run: { name: 'AnimalArmature|AnimalArmature|Gallop', timeScale: 1 },
      fly: { name: 'AnimalArmature|AnimalArmature|Gallop' },
      flyIdle: { name: 'AnimalArmature|AnimalArmature|Idle' },
      jump: { name: 'AnimalArmature|AnimalArmature|Jump_ToIdle' },
    },
  },
  horse: {
    id: 'horse',
    label: 'le cheval',
    icon: '\u{1F40E}',
    price: 2500,
    currencyLabel: 'euros',
    modelUrl: '/models/horse.glb',
    // Same AnimalArmature rig as the wolf. Terrestrial, fast. The horse model
    // has no Jump or Walk clip, so the hop plays the gallop/idle (jump physics
    // still apply); run uses Gallop.
    scale: 0.45,
    modelYawOffset: 0,
    canFly: false,
    canJump: true,
    jumpSpeed: 8,
    groundSpeed: PLAYER_MAX_RUN_SPEED * 2.4,
    flySpeed: PLAYER_MAX_RUN_SPEED * 2.4,
    turnSpeed: 2.6,
    climbSpeed: 0,
    maxAltitude: 0,
    // Bone Z grows toward the head: Back(-1.43)=hindquarters, Torso(-0.72)=rear,
    // Torso2(+0.09)=centre of the back, Torso3(+1.02)=withers. Anchor on Torso2
    // so the rider sits centred. (Shift toward Torso3 to move forward.)
    saddleBones: {
      spine2: 'Torso2',
      spine3: 'Torso2',
      neck1: 'Torso2',
      calibration: 'Torso2',
    },
    saddleLocalPosition: new Vector3(0, 0, 0),
    liftWorldUp: true,
    autoRiderLift: true,
    riderLift: 0.01,
    seatSurfaceOffset: 0.10,
    // Lowers the rider by the bent-leg height of the seated pose so the butt
    // (not the feet) rests on the back. Increase if the feet still touch.
    riderSeatDrop: 0.4,
    minRiderLift: -2,
    maxRiderLift: 0.4,
    defaultBodyWidth: 0.42,
    torsoLean: -0.35,
    handBone: 'Neck1',
    handForward: -0.25,
    handDrop: 0.4,
    anims: {
      idle: { name: 'AnimalArmature|AnimalArmature|Idle' },
      run: { name: 'AnimalArmature|AnimalArmature|Gallop', timeScale: 1 },
      fly: { name: 'AnimalArmature|AnimalArmature|Gallop' },
      flyIdle: { name: 'AnimalArmature|AnimalArmature|Idle' },
      jump: { name: 'AnimalArmature|AnimalArmature|Jump_toIdle' },
    },
  },
}

function getMountConfig(id) {
  return MOUNT_CONFIGS[id] ?? null
}

const MOUNT_SHOP_ITEMS = ['wolf', 'horse', 'dragon']
  .map((id) => {
    const mount = MOUNT_CONFIGS[id]
    const catalogItem = objectCatalog[id]
    return mount ? {
      ...mount,
      name: catalogItem?.name ?? mount.label,
      thumbnail: catalogItem?.thumbnail ?? null,
    } : null
  })
  .filter(Boolean)

const VALID_MOUNT_IDS = new Set(Object.keys(MOUNT_CONFIGS))

function formatMountPrice(mount) {
  return `${mount.price} ${mount.currencyLabel ?? 'pieces'}`
}

function preloadMountModel(mountId) {
  const config = getMountConfig(mountId)
  if (!config?.modelUrl) return
  useGLTF.preload(config.modelUrl)
}

function aimBoneAtWorldPoint(bone, childBone, target, scratch) {
  if (!bone?.parent || !childBone || !target) return false

  bone.updateWorldMatrix(true, false)
  childBone.updateWorldMatrix(true, false)
  scratch.start.setFromMatrixPosition(bone.matrixWorld)
  scratch.end.setFromMatrixPosition(childBone.matrixWorld)
  scratch.currentDirection.subVectors(scratch.end, scratch.start)
  scratch.targetDirection.subVectors(target, scratch.start)
  if (
    scratch.currentDirection.lengthSq() < 1e-8 ||
    scratch.targetDirection.lengthSq() < 1e-8
  ) {
    return false
  }

  scratch.currentDirection.normalize()
  scratch.targetDirection.normalize()
  scratch.deltaQuaternion.setFromUnitVectors(
    scratch.currentDirection,
    scratch.targetDirection,
  )
  bone.getWorldQuaternion(scratch.worldQuaternion)
  scratch.worldQuaternion.premultiply(scratch.deltaQuaternion)
  bone.parent.getWorldQuaternion(scratch.parentQuaternion).invert()
  bone.quaternion.copy(
    scratch.parentQuaternion.multiply(scratch.worldQuaternion),
  )
  bone.updateWorldMatrix(false, true)
  return true
}

function solveMountedArmIk(upperArm, foreArm, hand, target, scratch) {
  if (!upperArm || !foreArm || !hand || !target) return

  upperArm.updateWorldMatrix(true, false)
  foreArm.updateWorldMatrix(true, false)
  hand.updateWorldMatrix(true, false)
  scratch.shoulder.setFromMatrixPosition(upperArm.matrixWorld)
  scratch.elbow.setFromMatrixPosition(foreArm.matrixWorld)
  scratch.hand.setFromMatrixPosition(hand.matrixWorld)

  const upperLength = scratch.shoulder.distanceTo(scratch.elbow)
  const lowerLength = scratch.elbow.distanceTo(scratch.hand)
  scratch.shoulderToTarget.subVectors(target, scratch.shoulder)
  const targetDistance = scratch.shoulderToTarget.length()
  if (upperLength < 1e-5 || lowerLength < 1e-5 || targetDistance < 1e-5) return

  scratch.targetAxis.copy(scratch.shoulderToTarget).normalize()
  scratch.currentElbowDirection
    .subVectors(scratch.elbow, scratch.shoulder)
    .normalize()
  scratch.bendNormal.crossVectors(
    scratch.targetAxis,
    scratch.currentElbowDirection,
  )
  if (scratch.bendNormal.lengthSq() < 1e-6) {
    scratch.bendNormal.crossVectors(scratch.targetAxis, scratch.worldUp)
  }
  scratch.bendNormal.normalize()
  scratch.bendDirection
    .crossVectors(scratch.bendNormal, scratch.targetAxis)
    .normalize()

  const reachableDistance = Math.min(
    Math.max(targetDistance, Math.abs(upperLength - lowerLength) + 1e-4),
    upperLength + lowerLength - 1e-4,
  )
  const elbowAlong =
    (reachableDistance * reachableDistance +
      upperLength * upperLength -
      lowerLength * lowerLength) /
    (2 * reachableDistance)
  const elbowOut = Math.sqrt(
    Math.max(upperLength * upperLength - elbowAlong * elbowAlong, 0),
  )
  scratch.elbowTarget
    .copy(scratch.shoulder)
    .addScaledVector(scratch.targetAxis, elbowAlong)
    .addScaledVector(scratch.bendDirection, elbowOut)

  aimBoneAtWorldPoint(upperArm, foreArm, scratch.elbowTarget, scratch)
  aimBoneAtWorldPoint(foreArm, hand, target, scratch)
}

function getMountedRiderWorldPosition(
  riderSocket,
  riderLift,
  target,
  socketQuaternion,
  localLiftOffset,
  liftWorldUp = false,
) {
  riderSocket.getWorldPosition(target)
  if (liftWorldUp) {
    // Lift the rider straight up in world space. Rig-independent and keeps the
    // rider centred on the back regardless of how the mount's bones are
    // oriented.
    target.y += riderLift
  } else {
    // Dragon rig: local -X points above the back, so lift along that axis to
    // stay perpendicular to the back as the dragon pitches in flight.
    riderSocket.getWorldQuaternion(socketQuaternion)
    localLiftOffset
      .set(-riderLift, 0, 0)
      .applyQuaternion(socketQuaternion)
    target.add(localLiftOffset)
  }
  target.y += DRAGON_RIDE_RIDER_WORLD_CLEARANCE
  return target
}

function MountedMount({
  config,
  positionRef,
  yawRef,
  animStateRef,
  riderTransformRef,
  riderSocketRef,
  mountProfileRef,
  currentZone = ZONES.interior,
}) {
  const { scene, animations } = useGLTF(config.modelUrl)
  const dragon = useMemo(() => clone(scene), [scene])
  const { actions, mixer } = useAnimations(animations, dragon)
  const groupRef = useRef()
  const currentActionRef = useRef(null)
  const revealPendingRef = useRef(true)
  const saddleBonesRef = useRef(null)
  const virtualSaddleReadyRef = useRef(false)
  const saddleSocket = useMemo(() => {
    const socket = new Object3D()
    socket.name = 'DragonRideSocket'
    return socket
  }, [])
  const boneWorldPosition = useMemo(() => new Vector3(), [])
  const boneWorldQuaternion = useMemo(() => new Quaternion(), [])
  const saddleSpine2Position = useMemo(() => new Vector3(), [])
  const saddleSpine3Position = useMemo(() => new Vector3(), [])
  const saddleNeck1Position = useMemo(() => new Vector3(), [])
  const saddleCalibrationPosition = useMemo(() => new Vector3(), [])
  const saddleTargetPosition = useMemo(() => new Vector3(), [])
  const saddleFilteredPosition = useMemo(() => new Vector3(), [])
  const saddleFrameOffset = useMemo(() => new Vector3(), [])
  const saddleRotatedOffset = useMemo(() => new Vector3(), [])
  const saddleSpine2Quaternion = useMemo(() => new Quaternion(), [])
  const saddleSpine3Quaternion = useMemo(() => new Quaternion(), [])
  const saddleNeck1Quaternion = useMemo(() => new Quaternion(), [])
  const saddleCalibrationQuaternion = useMemo(() => new Quaternion(), [])
  const saddleFrameQuaternion = useMemo(() => new Quaternion(), [])
  const saddleTargetQuaternion = useMemo(() => new Quaternion(), [])
  const saddleFilteredQuaternion = useMemo(() => new Quaternion(), [])
  const saddleSocketQuaternion = useMemo(() => new Quaternion(), [])
  const saddleDragonWorldQuaternion = useMemo(() => new Quaternion(), [])
  const saddleInverseDragonQuaternion = useMemo(() => new Quaternion(), [])
  const widthRaycaster = useMemo(() => new Raycaster(), [])
  const widthRayCenter = useMemo(() => new Vector3(), [])
  const widthRayRight = useMemo(() => new Vector3(), [])
  const widthRayOrigin = useMemo(() => new Vector3(), [])
  const widthRayDirection = useMemo(() => new Vector3(), [])
  const handRayForward = useMemo(() => new Vector3(), [])
  const handRayRight = useMemo(() => new Vector3(), [])
  const handAnchorWorld = useMemo(() => new Vector3(), [])
  const handBoneRef = useRef(null)
  const widthMeasureFramesRef = useRef(0)

  const playAction = useCallback((name, { fallback = null, loop = true, pingpong = false, timeScale = 1, fade = 0.35 } = {}) => {
    const action = actions[name] ?? (fallback ? actions[fallback] : null)
    if (!action) return action
    if (currentActionRef.current === action) {
      action.setEffectiveTimeScale(timeScale)
      return action
    }
    const prev = currentActionRef.current
    action.reset()
    const loopMode = !loop ? LoopOnce : pingpong ? LoopPingPong : LoopRepeat
    const loopCount = loop ? Infinity : 1
    action.setLoop(loopMode, loopCount)
    action.enabled = true
    action.paused = false
    action.setEffectiveWeight(1)
    action.setEffectiveTimeScale(timeScale)
    action.play()
    if (prev && fade > 0) {
      action.crossFadeFrom(prev, fade, true)
    } else if (fade > 0) {
      action.fadeIn(fade)
    }
    action.clampWhenFinished = !loop
    currentActionRef.current = action
    return action
  }, [actions])

  useLayoutEffect(() => {
    if (groupRef.current) groupRef.current.visible = false
    revealPendingRef.current = true
    dragon.traverse((object) => {
      object.layers.set(currentZone === ZONES.outside ? OUTDOOR_LIGHT_LAYER : 0)
      if (object instanceof Mesh) {
        object.castShadow = true
        object.receiveShadow = true
      }
    })
    saddleBonesRef.current = {
      spine2: dragon.getObjectByName(config.saddleBones.spine2),
      spine3: dragon.getObjectByName(config.saddleBones.spine3),
      neck1: dragon.getObjectByName(config.saddleBones.neck1),
      calibration: dragon.getObjectByName(config.saddleBones.calibration),
    }
    handBoneRef.current = config.handBone ? dragon.getObjectByName(config.handBone) : null
    dragon.add(saddleSocket)
    virtualSaddleReadyRef.current = false
    widthMeasureFramesRef.current = 0
    if (riderSocketRef) riderSocketRef.current = saddleSocket
    if (riderTransformRef) riderTransformRef.current.ready = false
    if (mountProfileRef) {
      mountProfileRef.current.width = config.defaultBodyWidth
      mountProfileRef.current.riderLift = config.riderLift
      mountProfileRef.current.torsoLean = config.torsoLean
      mountProfileRef.current.leftHandTarget ??= new Vector3()
      mountProfileRef.current.rightHandTarget ??= new Vector3()
      mountProfileRef.current.leftHandLocalTarget ??= new Vector3()
      mountProfileRef.current.rightHandLocalTarget ??= new Vector3()
      mountProfileRef.current.handTargetsReady = false
      mountProfileRef.current.handTargetsMeasured = false
      mountProfileRef.current.seatHeightMeasured = false
      mountProfileRef.current.ready = false
    }
    const initialAction = playAction(config.anims.idle.name, {
      fallback: config.anims.idle.fallback ?? null,
      fade: 0,
    })
    if (initialAction) {
      mixer.update(1 / 60)
      dragon.updateMatrixWorld(true)

      const saddleBones = saddleBonesRef.current
      if (
        saddleBones?.spine2 &&
        saddleBones.spine3 &&
        saddleBones.neck1 &&
        saddleBones.calibration
      ) {
        dragon.getWorldQuaternion(saddleDragonWorldQuaternion)
        saddleInverseDragonQuaternion.copy(saddleDragonWorldQuaternion).invert()

        saddleBones.spine2.getWorldPosition(saddleSpine2Position)
        saddleBones.spine3.getWorldPosition(saddleSpine3Position)
        saddleBones.neck1.getWorldPosition(saddleNeck1Position)
        dragon.worldToLocal(saddleSpine2Position)
        dragon.worldToLocal(saddleSpine3Position)
        dragon.worldToLocal(saddleNeck1Position)
        saddleTargetPosition
          .copy(saddleSpine2Position)
          .multiplyScalar(0.4)
          .addScaledVector(saddleSpine3Position, 0.4)
          .addScaledVector(saddleNeck1Position, 0.2)

        saddleBones.spine2.getWorldQuaternion(saddleSpine2Quaternion)
        saddleBones.spine3.getWorldQuaternion(saddleSpine3Quaternion)
        saddleBones.neck1.getWorldQuaternion(saddleNeck1Quaternion)
        saddleSpine2Quaternion.premultiply(saddleInverseDragonQuaternion)
        saddleSpine3Quaternion.premultiply(saddleInverseDragonQuaternion)
        saddleNeck1Quaternion.premultiply(saddleInverseDragonQuaternion)
        saddleTargetQuaternion
          .copy(saddleSpine2Quaternion)
          .slerp(saddleSpine3Quaternion, 0.5)
          .slerp(saddleNeck1Quaternion, 0.2)

        saddleBones.calibration.localToWorld(
          saddleCalibrationPosition.copy(config.saddleLocalPosition),
        )
        saddleBones.calibration.getWorldQuaternion(saddleCalibrationQuaternion)
        dragon.worldToLocal(saddleCalibrationPosition)
        saddleCalibrationQuaternion.premultiply(saddleInverseDragonQuaternion)
        saddleFrameOffset
          .subVectors(saddleCalibrationPosition, saddleTargetPosition)
          .applyQuaternion(
            saddleFilteredQuaternion.copy(saddleTargetQuaternion).invert(),
          )
        saddleFrameQuaternion
          .copy(saddleTargetQuaternion)
          .invert()
          .multiply(saddleCalibrationQuaternion)
        saddleFilteredPosition.copy(saddleTargetPosition)
        saddleFilteredQuaternion.copy(saddleTargetQuaternion)
        virtualSaddleReadyRef.current = true
      }

      mixer.update(0.08)
    }
    dragon.updateMatrixWorld(true)
    return () => {
      revealPendingRef.current = true
      if (groupRef.current) groupRef.current.visible = false
      saddleSocket.removeFromParent()
      if (riderSocketRef?.current === saddleSocket) riderSocketRef.current = null
      saddleBonesRef.current = null
      virtualSaddleReadyRef.current = false
      if (riderTransformRef) riderTransformRef.current.ready = false
      if (mountProfileRef) mountProfileRef.current.ready = false
    }
  }, [currentZone, dragon, mixer, mountProfileRef, playAction, riderTransformRef, riderSocketRef, saddleSocket])

  useFrame((_, delta) => {
    if (!groupRef.current) return
    const pos = positionRef.current
    groupRef.current.position.set(pos.x, pos.y, pos.z)
    groupRef.current.rotation.y = yawRef.current + config.modelYawOffset

    const state = animStateRef?.current
    if (state) {
      const anims = config.anims
      if (config.canJump && state.jumping && anims.jump) {
        playAction(anims.jump.name, { fallback: anims.jump.fallback ?? null, timeScale: anims.jump.timeScale ?? 1, fade: 0.18 })
      } else if (config.canFly && state.airborne) {
        if (state.movingForward) {
          playAction(anims.fly.name, { fallback: anims.fly.fallback ?? null, timeScale: anims.fly.timeScale ?? 1, fade: 0.42 })
        } else {
          playAction(anims.flyIdle.name, { fallback: anims.flyIdle.fallback ?? null, timeScale: anims.flyIdle.timeScale ?? 1, fade: 0.42 })
        }
      } else if (state.moving) {
        playAction(anims.run.name, { fallback: anims.run.fallback ?? null, timeScale: anims.run.timeScale ?? 1, fade: 0.28 })
      } else {
        playAction(anims.idle.name, { fallback: anims.idle.fallback ?? null, timeScale: anims.idle.timeScale ?? 1, fade: 0.35 })
      }
    }

    if (!riderTransformRef) return

    const saddleBones = saddleBonesRef.current
    if (
      !saddleBones?.spine2 ||
      !saddleBones.spine3 ||
      !saddleBones.neck1 ||
      !saddleBones.calibration ||
      saddleSocket.parent !== dragon
    ) {
      return
    }

    dragon.updateWorldMatrix(true, false)
    dragon.getWorldQuaternion(saddleDragonWorldQuaternion)
    saddleInverseDragonQuaternion.copy(saddleDragonWorldQuaternion).invert()

    saddleBones.spine2.getWorldPosition(saddleSpine2Position)
    saddleBones.spine3.getWorldPosition(saddleSpine3Position)
    saddleBones.neck1.getWorldPosition(saddleNeck1Position)
    dragon.worldToLocal(saddleSpine2Position)
    dragon.worldToLocal(saddleSpine3Position)
    dragon.worldToLocal(saddleNeck1Position)
    saddleTargetPosition
      .copy(saddleSpine2Position)
      .multiplyScalar(0.4)
      .addScaledVector(saddleSpine3Position, 0.4)
      .addScaledVector(saddleNeck1Position, 0.2)

    saddleBones.spine2.getWorldQuaternion(saddleSpine2Quaternion)
    saddleBones.spine3.getWorldQuaternion(saddleSpine3Quaternion)
    saddleBones.neck1.getWorldQuaternion(saddleNeck1Quaternion)
    saddleSpine2Quaternion.premultiply(saddleInverseDragonQuaternion)
    saddleSpine3Quaternion.premultiply(saddleInverseDragonQuaternion)
    saddleNeck1Quaternion.premultiply(saddleInverseDragonQuaternion)
    saddleTargetQuaternion
      .copy(saddleSpine2Quaternion)
      .slerp(saddleSpine3Quaternion, 0.5)
      .slerp(saddleNeck1Quaternion, 0.2)

    if (!virtualSaddleReadyRef.current) {
      saddleBones.calibration.localToWorld(
        saddleCalibrationPosition.copy(DRAGON_RIDE_SADDLE_LOCAL_POSITION),
      )
      saddleBones.calibration.getWorldQuaternion(saddleCalibrationQuaternion)
      dragon.worldToLocal(saddleCalibrationPosition)
      saddleCalibrationQuaternion.premultiply(saddleInverseDragonQuaternion)
      saddleFrameOffset
        .subVectors(saddleCalibrationPosition, saddleTargetPosition)
        .applyQuaternion(
          saddleFilteredQuaternion.copy(saddleTargetQuaternion).invert(),
        )
      saddleFrameQuaternion
        .copy(saddleTargetQuaternion)
        .invert()
        .multiply(saddleCalibrationQuaternion)
      saddleFilteredPosition.copy(saddleTargetPosition)
      saddleFilteredQuaternion.copy(saddleTargetQuaternion)
      virtualSaddleReadyRef.current = true
    } else {
      const safeDelta = Math.min(delta, 0.05)
      saddleFilteredPosition.x = MathUtils.damp(
        saddleFilteredPosition.x,
        saddleTargetPosition.x,
        DRAGON_RIDE_SADDLE_VERTICAL_DAMPING,
        safeDelta,
      )
      saddleFilteredPosition.y = MathUtils.damp(
        saddleFilteredPosition.y,
        saddleTargetPosition.y,
        DRAGON_RIDE_SADDLE_FORWARD_DAMPING,
        safeDelta,
      )
      saddleFilteredPosition.z = MathUtils.damp(
        saddleFilteredPosition.z,
        saddleTargetPosition.z,
        DRAGON_RIDE_SADDLE_LATERAL_DAMPING,
        safeDelta,
      )
      saddleFilteredQuaternion.slerp(
        saddleTargetQuaternion,
        1 - Math.exp(-DRAGON_RIDE_SADDLE_ROTATION_DAMPING * safeDelta),
      )
    }

    saddleRotatedOffset
      .copy(saddleFrameOffset)
      .applyQuaternion(saddleFilteredQuaternion)
    saddleSocket.position
      .copy(saddleFilteredPosition)
      .add(saddleRotatedOffset)
    saddleSocketQuaternion
      .copy(saddleFilteredQuaternion)
      .multiply(saddleFrameQuaternion)
    saddleSocket.quaternion.copy(saddleSocketQuaternion)
    saddleSocket.updateWorldMatrix(true, false)
    saddleSocket.getWorldPosition(boneWorldPosition)
    saddleSocket.getWorldQuaternion(boneWorldQuaternion)

    if (mountProfileRef && !mountProfileRef.current.ready) {
      widthMeasureFramesRef.current += 1
      if (widthMeasureFramesRef.current >= 3) {
        widthRayCenter.copy(boneWorldPosition)
        widthRayCenter.y -= 0.18
        widthRayRight.set(Math.cos(yawRef.current), 0, -Math.sin(yawRef.current))
        const rayDistance = DRAGON_RIDE_MAX_BODY_WIDTH

        widthRayOrigin.copy(widthRayCenter).addScaledVector(widthRayRight, rayDistance)
        widthRayDirection.copy(widthRayRight).multiplyScalar(-1)
        widthRaycaster.set(widthRayOrigin, widthRayDirection)
        widthRaycaster.far = rayDistance * 2
        const rightHits = widthRaycaster.intersectObject(dragon, true)

        widthRayOrigin.copy(widthRayCenter).addScaledVector(widthRayRight, -rayDistance)
        widthRayDirection.copy(widthRayRight)
        widthRaycaster.set(widthRayOrigin, widthRayDirection)
        widthRaycaster.far = rayDistance * 2
        const leftHits = widthRaycaster.intersectObject(dragon, true)

        if (rightHits.length > 0 && leftHits.length > 0) {
          mountProfileRef.current.width = MathUtils.clamp(
            rightHits[0].point.distanceTo(leftHits[0].point),
            DRAGON_RIDE_MIN_BODY_WIDTH,
            DRAGON_RIDE_MAX_BODY_WIDTH,
          )
        }
        mountProfileRef.current.ready = true
      }
    }

    if (mountProfileRef && !config.handBone && !mountProfileRef.current.handTargetsMeasured) {
      // Hands are placed geometrically just in front of the seat, not via a
      // mesh raycast: raycasting the skinned dragon is unreliable and tends to
      // hit the folded wings or the raised back spines, which pulls the hand
      // targets (and therefore the arms) upward. A deterministic forward/down
      // offset from the saddle socket keeps the hands resting on the back.
      const gripHalfWidth = MathUtils.clamp(
        mountProfileRef.current.width * 0.3,
        0.14,
        0.34,
      )
      handRayForward.set(Math.sin(yawRef.current), 0, Math.cos(yawRef.current))
      handRayRight.set(Math.cos(yawRef.current), 0, -Math.sin(yawRef.current))

      mountProfileRef.current.leftHandLocalTarget
        .copy(boneWorldPosition)
        .addScaledVector(handRayForward, config.handForward)
        .addScaledVector(handRayRight, -gripHalfWidth)
        .addScaledVector(widthRayDirection.set(0, 1, 0), -config.handDrop)
      saddleSocket.worldToLocal(mountProfileRef.current.leftHandLocalTarget)
      mountProfileRef.current.rightHandLocalTarget
        .copy(boneWorldPosition)
        .addScaledVector(handRayForward, config.handForward)
        .addScaledVector(handRayRight, gripHalfWidth)
        .addScaledVector(widthRayDirection.set(0, 1, 0), -config.handDrop)
      saddleSocket.worldToLocal(mountProfileRef.current.rightHandLocalTarget)
      mountProfileRef.current.handTargetsMeasured = true
    }

    if (config.autoRiderLift !== false && mountProfileRef && !mountProfileRef.current.seatHeightMeasured) {
      handRayRight.set(Math.cos(yawRef.current), 0, -Math.sin(yawRef.current))
      const seatHalfWidth = MathUtils.clamp(
        mountProfileRef.current.width * 0.28,
        0.12,
        0.3,
      )
      let measuredSeatY = Infinity
      let seatSamples = 0
      for (const side of [-1, -0.55, 0.55, 1]) {
        widthRayOrigin
          .copy(boneWorldPosition)
          .addScaledVector(handRayRight, seatHalfWidth * side)
          .addScaledVector(widthRayDirection.set(0, 1, 0), DRAGON_RIDE_HAND_RAY_HEIGHT)
        widthRaycaster.set(widthRayOrigin, widthRayDirection.set(0, -1, 0))
        widthRaycaster.far = DRAGON_RIDE_HAND_RAY_HEIGHT * 2.5
        const seatHits = widthRaycaster.intersectObject(dragon, true)
        if (seatHits.length === 0) continue
        measuredSeatY = Math.min(measuredSeatY, seatHits[0].point.y)
        seatSamples += 1
      }
      if (seatSamples >= 2) {
        // Auto rider lift: place the rider just above the measured back surface.
        // measuredSeatY is the back surface in world space; the socket sits on
        // the spine, so the gap (+ a small clearance) is the lift. riderSeatDrop
        // lowers the rider by the bent-leg height of the seated pose so the
        // BUTT (not the feet) rests on the back.
        mountProfileRef.current.riderLift = MathUtils.clamp(
          measuredSeatY -
            boneWorldPosition.y +
            (config.seatSurfaceOffset ?? DRAGON_RIDE_SEAT_SURFACE_OFFSET) -
            (config.riderSeatDrop ?? 0),
          config.minRiderLift ?? DRAGON_RIDE_MIN_RIDER_LIFT,
          config.maxRiderLift ?? DRAGON_RIDE_MAX_RIDER_LIFT,
        )
        mountProfileRef.current.seatHeightMeasured = true
      }
    }

    if (mountProfileRef && config.handBone && handBoneRef.current) {
      // Hands grip a specific bone (e.g. the neck). Recomputed live each frame
      // so they track that bone through the animation. handForward/handDrop are
      // fine offsets in world forward/up; the grip spreads the two hands apart.
      const gripHalfWidth = MathUtils.clamp(mountProfileRef.current.width * 0.3, 0.14, 0.34)
      handRayForward.set(Math.sin(yawRef.current), 0, Math.cos(yawRef.current))
      handRayRight.set(Math.cos(yawRef.current), 0, -Math.sin(yawRef.current))
      handBoneRef.current.getWorldPosition(handAnchorWorld)
      mountProfileRef.current.leftHandTarget
        .copy(handAnchorWorld)
        .addScaledVector(handRayForward, config.handForward)
        .addScaledVector(handRayRight, -gripHalfWidth)
        .addScaledVector(widthRayDirection.set(0, 1, 0), -config.handDrop)
      mountProfileRef.current.rightHandTarget
        .copy(handAnchorWorld)
        .addScaledVector(handRayForward, config.handForward)
        .addScaledVector(handRayRight, gripHalfWidth)
        .addScaledVector(widthRayDirection.set(0, 1, 0), -config.handDrop)
      mountProfileRef.current.handTargetsReady = true
    } else if (mountProfileRef?.current.handTargetsMeasured) {
      mountProfileRef.current.leftHandTarget
        .copy(mountProfileRef.current.leftHandLocalTarget)
      saddleSocket.localToWorld(mountProfileRef.current.leftHandTarget)
      mountProfileRef.current.rightHandTarget
        .copy(mountProfileRef.current.rightHandLocalTarget)
      saddleSocket.localToWorld(mountProfileRef.current.rightHandTarget)
      mountProfileRef.current.handTargetsReady = true
    }

    const riderTransform = riderTransformRef.current
    riderTransform.position.copy(boneWorldPosition)
    riderTransform.quaternion.copy(boneWorldQuaternion)
    riderTransform.ready = true

    if (revealPendingRef.current) {
      const initialAction =
        actions.Dragon_Ancient_Dialogue_Relaxed_Idle ??
        actions.Dragon_Ancient_Patrol_Idle
      if (initialAction) {
        initialAction
          .reset()
          .setLoop(LoopRepeat, Infinity)
          .setEffectiveWeight(1)
          .setEffectiveTimeScale(1)
          .play()
        initialAction.enabled = true
        initialAction.paused = false
        currentActionRef.current = initialAction
        mixer.update(1 / 30)
      }
      dragon.updateMatrixWorld(true)
      groupRef.current.visible = true
      revealPendingRef.current = false
    }

  }, 0.1)

  return (
    <group ref={groupRef} scale={config.scale} userData={{ debugCategory: 'npcs' }}>
      <primitive object={dragon} />
    </group>
  )
}

function Dragon({ playerPositionRef, visible = true }) {
  const { scene, animations } = useGLTF('/models/dragon.glb')
  const dragon = useMemo(() => clone(scene), [scene])
  const { actions, mixer } = useAnimations(animations, dragon)
  const stateRef = useRef('patrol')
  const nearTimeRef = useRef(0)
  const awayTimeRef = useRef(0)
  const currentActionRef = useRef(null)

  const playAction = (name, { loop = true, fade = 0.25, force = false } = {}) => {
    const action = actions[name]
    if (!action || (!force && currentActionRef.current === action)) return action

    if (currentActionRef.current !== action) currentActionRef.current?.fadeOut(fade)
    if (!action.isRunning()) action.reset()
    action.setLoop(loop ? LoopRepeat : LoopOnce, loop ? Infinity : 1).play()
    action.setEffectiveWeight(1)
    action.setEffectiveTimeScale(1)
    if (fade > 0) action.fadeIn(fade)
    action.clampWhenFinished = !loop
    currentActionRef.current = action

    return action
  }

  useEffect(() => {
    dragon.traverse((object) => {
      if (object instanceof Mesh) {
        object.castShadow = true
        object.receiveShadow = true
      }
    })
  }, [dragon])

  useEffect(() => {
    const onFinished = (event) => {
      if (
        stateRef.current === 'entering' &&
        event.action === actions.Dragon_Ancient_Dialogue_Entry_Neutral
      ) {
        stateRef.current = 'dialogue'
        playAction('Dragon_Ancient_Dialogue_Relaxed_Idle')
      }

      if (stateRef.current === 'leaving' && event.action === actions.Dragon_Ancient_Dialogue_Out) {
        stateRef.current = 'patrol'
        nearTimeRef.current = 0
        awayTimeRef.current = 0
        playAction('Dragon_Ancient_Patrol_Idle')
      }
    }

    mixer.addEventListener('finished', onFinished)
    return () => mixer.removeEventListener('finished', onFinished)
  }, [actions, mixer])

  useFrame((_, delta) => {
    if (!visible) return

    const playerPosition = playerPositionRef.current
    const distanceToPlayer = Math.hypot(
      playerPosition.x - DRAGON_POSITION.x,
      playerPosition.z - DRAGON_POSITION.z,
    )
    const isNear = distanceToPlayer <= DRAGON_WAKE_DISTANCE

    if (stateRef.current === 'patrol') {
      const patrolIdle = playAction('Dragon_Ancient_Patrol_Idle', { fade: 0, force: true })
      if (!patrolIdle) return

      nearTimeRef.current = isNear ? nearTimeRef.current + delta : 0
      if (nearTimeRef.current >= DRAGON_WAKE_DELAY) {
        stateRef.current = 'entering'
        awayTimeRef.current = 0
        playAction('Dragon_Ancient_Dialogue_Entry_Neutral', { loop: false })
      }
      return
    }

    if (stateRef.current === 'dialogue') {
      awayTimeRef.current = isNear ? 0 : awayTimeRef.current + delta
      if (awayTimeRef.current >= DRAGON_SLEEP_DELAY) {
        stateRef.current = 'leaving'
        nearTimeRef.current = 0
        playAction('Dragon_Ancient_Dialogue_Out', { loop: false })
      }
    }
  })

  return (
    <group
      position={[DRAGON_POSITION.x, DRAGON_POSITION.y, DRAGON_POSITION.z]}
      rotation={[0, Math.PI + Math.PI / 2, 0]}
      scale={2}
      visible={visible}
      userData={{ debugCategory: 'npcs' }}
    >
      <primitive object={dragon} />
    </group>
  )
}

function GoalVisual({ selected = false, ballRef = null, goalObject = null }) {
  return (
    <>
      <mesh position={[-1.5, 1, 0]}>
        <boxGeometry args={[0.1, 2, 0.1]} />
        <meshStandardMaterial color="#a5afb9" metalness={0.28} roughness={0.45} />
      </mesh>
      <mesh position={[1.5, 1, 0]}>
        <boxGeometry args={[0.1, 2, 0.1]} />
        <meshStandardMaterial color="#a5afb9" metalness={0.28} roughness={0.45} />
      </mesh>
      <mesh position={[0, 2, 0]}>
        <boxGeometry args={[3.1, 0.1, 0.1]} />
        <meshStandardMaterial color="#a5afb9" metalness={0.28} roughness={0.45} />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, -0.55]}>
        <planeGeometry args={[2.9, 1.25]} />
        <meshStandardMaterial
          color="#2c8fe0"
          emissive="#1f6fb2"
          emissiveIntensity={0.35}
          transparent
          opacity={0.58}
        />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.016, -0.55]}>
        <planeGeometry args={[2.1, 0.62]} />
        <meshStandardMaterial
          color="#9dddff"
          emissive="#6cc7ff"
          emissiveIntensity={0.2}
          transparent
          opacity={0.42}
        />
      </mesh>

      {ballRef && goalObject && <GoalNet ballRef={ballRef} goalObject={goalObject} />}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.035, -0.45]}>
        <ringGeometry args={[1.82, 1.9, 42]} />
        <meshBasicMaterial color="#ffd447" transparent opacity={selected ? 0.95 : 0} />
      </mesh>
    </>
  )
}

function Goal({
  object,
  mode,
  selected,
  onSelect,
  onStartDragging,
  onBallZoneEnter,
  onBallZoneExit,
  ballRef,
}) {
  if (!object || object.status === 'stored') return null

  const goalPosition = object?.position ?? [0, 0, GOAL_Z]
  const isCustomizeMode = mode === 'customize'
  const leftPostCollider = getRotatedGoalCollider(object, [-1.5, 1, 0])
  const rightPostCollider = getRotatedGoalCollider(object, [1.5, 1, 0])
  const crossbarCollider = getRotatedGoalCollider(object, [0, 2, 0])
  const backCollider = getRotatedGoalCollider(object, [0, 1, -1.14])
  const scoreZoneCollider = getRotatedGoalCollider(object, [0, 1, -0.5])

  const handlePointerDown = (event) => {
    if (!isCustomizeMode || !object?.canMove) return
    event.stopPropagation()
    onSelect(object.id)
    onStartDragging(object.id)
  }

  const handleGoalSensorEnter = (event) => {
    const bodyName = event.other.rigidBodyObject?.name
    const colliderName = event.other.colliderObject?.name
    if (bodyName === 'ball' || colliderName === 'ball') onBallZoneEnter()
  }

  const handleGoalSensorExit = (event) => {
    const bodyName = event.other.rigidBodyObject?.name
    const colliderName = event.other.colliderObject?.name
    if (bodyName === 'ball' || colliderName === 'ball') onBallZoneExit()
  }

  return (
    <>
      <RigidBody
        key={`goal-frame-${goalPosition.join(':')}-${object?.rotationY ?? 0}`}
        type="fixed"
        colliders={false}
      >
        <CuboidCollider args={[0.11, 1, 0.11]} position={leftPostCollider.position} restitution={0.72} friction={0.5} />
        <CuboidCollider args={[0.11, 1, 0.11]} position={rightPostCollider.position} restitution={0.72} friction={0.5} />
        <CuboidCollider args={[1.58, 0.11, 0.11]} position={crossbarCollider.position} rotation={crossbarCollider.rotation} restitution={0.72} friction={0.5} />
        <CuboidCollider args={[1.5, 1, 0.05]} position={backCollider.position} rotation={backCollider.rotation} restitution={0.52} friction={0.45} />
      </RigidBody>

      <RigidBody
        key={`goal-zone-${goalPosition.join(':')}-${object?.rotationY ?? 0}`}
        type="fixed"
        colliders={false}
      >
        <CuboidCollider
          args={[1.34, 0.86, 0.44]}
          position={scoreZoneCollider.position}
          rotation={scoreZoneCollider.rotation}
          sensor
          onIntersectionEnter={handleGoalSensorEnter}
          onIntersectionExit={handleGoalSensorExit}
        />
      </RigidBody>

      <group
        position={goalPosition}
        rotation={[0, object?.rotationY ?? 0, 0]}
        onPointerDown={handlePointerDown}
        userData={{ debugCategory: 'goal' }}
      >
        <GoalVisual selected={selected} ballRef={ballRef} goalObject={object} />
      </group>
    </>
  )
}

function GoalNet({ ballRef, goalObject }) {
  const NET_WIDTH = 3.02
  const NET_HEIGHT = 1.96
  const NET_DEPTH = 1.28
  const netRef = useRef()
  const baseRef = useRef(null)
  const displacementRef = useRef(null)
  const velocityRef = useRef(null)
  const fixedRef = useRef(null)
  const netGeometry = useMemo(() => {
    const width = NET_WIDTH
    const height = NET_HEIGHT
    const segX = 22
    const segY = 14
    const depth = NET_DEPTH
    const geometry = new PlaneGeometry(width, height, segX, segY)
    const pos = geometry.attributes.position

    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i)
      const y = pos.getY(i)
      const yNormalized = (y + height * 0.5) / height
      const depthFactor = 1 - yNormalized

      // Front edge attached to posts/top bar, bottom goes deeper.
      let z = -depth * depthFactor
      // Small natural relaxation to avoid a perfectly straight sheet.
      z -= Math.sin((x / (width * 0.5)) * Math.PI) * 0.08 * depthFactor
      z -= (1 - Math.abs(x) / (width * 0.5)) * 0.03 * depthFactor

      pos.setZ(i, z)
    }

    pos.needsUpdate = true
    return geometry
  }, [])
  const sideGeometry = useMemo(() => {
    const sideHeight = NET_HEIGHT - 0.08
    const geometry = new PlaneGeometry(NET_DEPTH, sideHeight, 8, 12)
    const pos = geometry.attributes.position
    const halfDepth = NET_DEPTH * 0.5
    const halfHeight = sideHeight * 0.5

    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i)
      const y = pos.getY(i)
      const topFactor = 1 - (y + halfHeight) / sideHeight
      const t = (x + halfDepth) / NET_DEPTH

      // Top is close to the frame, bottom goes deeper, like a real net side.
      const depth = t * NET_DEPTH * topFactor
      pos.setX(i, depth)
      pos.setZ(i, 0)
    }

    pos.needsUpdate = true
    return geometry
  }, [])

  useEffect(() => {
    if (!netRef.current) return
    const positions = netRef.current.geometry.attributes.position.array
    baseRef.current = new Float32Array(positions)
    displacementRef.current = new Float32Array(positions.length / 3)
    velocityRef.current = new Float32Array(positions.length / 3)
    fixedRef.current = new Uint8Array(positions.length / 3)

    const widthHalf = NET_WIDTH * 0.5
    const heightHalf = NET_HEIGHT * 0.5
    for (let i = 0; i < fixedRef.current.length; i += 1) {
      const i3 = i * 3
      const x = baseRef.current[i3]
      const y = baseRef.current[i3 + 1]
      // Keep all borders rigidly attached to the frame.
      const fixed =
        Math.abs(x) > widthHalf - 0.0001 ||
        Math.abs(y) > heightHalf - 0.0001
      fixedRef.current[i] = fixed ? 1 : 0
    }
  }, [])

  useFrame((_, delta) => {
    if (
      !netRef.current ||
      !baseRef.current ||
      !displacementRef.current ||
      !velocityRef.current ||
      !fixedRef.current
    ) return

    const positions = netRef.current.geometry.attributes.position.array
    const base = baseRef.current
    const displacement = displacementRef.current
    const velocity = velocityRef.current
    const fixed = fixedRef.current
    const vertexCount = displacement.length

    const ball = ballRef.current
    if (ball) {
      const p = ball.translation()
      const v = ball.linvel()
      const goalX = goalObject?.position?.[0] ?? 0
      const goalZ = goalObject?.position?.[2] ?? GOAL_Z
      const goalRotationY = goalObject?.rotationY ?? 0
      const dx = p.x - goalX
      const dz = p.z - goalZ
      const cos = Math.cos(goalRotationY)
      const sin = Math.sin(goalRotationY)
      const vx = dx * cos - dz * sin
      const vy = p.y
      const vzLocal = dx * sin + dz * cos
      const speed = Math.hypot(v.x, v.y, v.z)
      const impactRadius = 0.9
      const impactForce = Math.min(0.11, 0.016 + speed * 0.0065)

      for (let i = 0; i < vertexCount; i += 1) {
        if (fixed[i]) continue
        const i3 = i * 3
        const px = base[i3]
        const py = base[i3 + 1]
        const pz = base[i3 + 2]

        const dx = px - vx
        const dy = py - vy
        const dz = pz - vzLocal
        const dist = Math.hypot(dx, dy, dz)

        if (dist < impactRadius) {
          const force = (1 - dist / impactRadius) * impactForce
          velocity[i] -= force
        }
      }
    }

    const spring = Math.min(1, 8.2 * delta)
    const damp = Math.max(0.84, 1 - 7.2 * delta)
    const maxPush = 0.34

    for (let i = 0; i < vertexCount; i += 1) {
      const i3 = i * 3
      if (fixed[i]) {
        displacement[i] = 0
        velocity[i] = 0
        positions[i3 + 2] = base[i3 + 2]
        continue
      }
      velocity[i] *= damp
      displacement[i] += velocity[i]
      displacement[i] += (0 - displacement[i]) * spring
      displacement[i] = Math.max(-maxPush, Math.min(maxPush * 0.35, displacement[i]))
      positions[i3 + 2] = base[i3 + 2] + displacement[i]
    }

    netRef.current.geometry.attributes.position.needsUpdate = true
  })

  return (
    <group>
      <mesh ref={netRef} geometry={netGeometry} position={[0, 1, -0.02]}>
        <meshStandardMaterial
          color="#9ec5ff"
          emissive="#4f7fc7"
          emissiveIntensity={0.2}
          wireframe
          transparent
          opacity={0.92}
          roughness={0.62}
          metalness={0.03}
        />
      </mesh>

      <mesh position={[-1.5, 0.98, -0.01]} rotation={[0, Math.PI / 2, 0]} geometry={sideGeometry}>
        <meshStandardMaterial
          color="#9ec5ff"
          emissive="#4f7fc7"
          emissiveIntensity={0.16}
          wireframe
          transparent
          opacity={0.86}
          roughness={0.68}
          metalness={0.03}
        />
      </mesh>

      <mesh position={[1.5, 0.98, -0.01]} rotation={[0, Math.PI / 2, 0]} geometry={sideGeometry}>
        <meshStandardMaterial
          color="#9ec5ff"
          emissive="#4f7fc7"
          emissiveIntensity={0.16}
          wireframe
          transparent
          opacity={0.86}
          roughness={0.68}
          metalness={0.03}
        />
      </mesh>
    </group>
  )
}

function Player({
  touchRef,
  ballRef,
  playerPositionRef,
  playerVelocityRef,
  mode,
  currentZone,
  spawnRequest,
  goalObject,
  seatedState,
  onSeatedPhaseChange,
  cameraOnCat = false,
  catPositionRef = null,
  localPlayerStateRef = null,
  onKickIntent = null,
  combatTargetsRef = null,
  onCombatHit = null,
  equippedWeapon = null,
  playerBodyYawRef = null,
  playerCombatActionsRef = null,
  appearance = null,
  freeCameraActive = false,
  movementLocked = false,
  dragonRide = null,
}) {
  const playerBodyRef = useRef()
  const visualRef = useRef()
  const playerPosRef = useRef({ x: 0, y: PLAYER_HEIGHT, z: 2.2 })
  const planarVelocityRef = useRef({ x: 0, z: 0 })
  const filteredInputRef = useRef({ x: 0, y: 0 })
  const cameraLookRef = useRef({ x: 0, y: PLAYER_HEIGHT + 0.55, z: 2.2 })
  const dragonCameraFocusRef = useRef({ x: 0, y: 0, z: 0, ready: false })
  const dragonCameraRideOffsetRef = useRef({ x: 0, y: 0, z: 0 })
  const dragonCameraDistanceRef = useRef({ value: 5, ready: false })
  const dragonCameraSocketPosition = useMemo(() => new Vector3(), [])
  const mountedRiderSocketQuaternion = useMemo(() => new Quaternion(), [])
  const mountedRiderLiftOffset = useMemo(() => new Vector3(), [])
  const kickUntilRef = useRef(0)
  const pendingKickRef = useRef(null)
  const handBoneRef = useRef(null)
  const mountedPlayerLocalPosition = useMemo(() => new Vector3(), [])
  const punchUntilRef = useRef(0)
  const pendingPunchRef = useRef(null)
  // Combo de coups de poing : enchaîner dans le délai augmente les dégâts.
  const punchComboRef = useRef({ count: 0, lastHitAt: -Infinity })
  const jumpStartUntilRef = useRef(0)
  const jumpLandUntilRef = useRef(0)
  const waveUntilRef = useRef(0)
  const danceUntilRef = useRef(0)
  const pointingUpUntilRef = useRef(0)
  const seatPhaseRef = useRef(null)
  const seatTimerRef = useRef(0)
  const velocityYRef = useRef(0)
  const onGroundRef = useRef(true)
  const wasOnGroundRef = useRef(true)
  const landingPreparedRef = useRef(false)
  const [isPlayerVisible, setIsPlayerVisible] = useState(true)
  const [playerMotion, setPlayerMotion] = useState('idle')
  const keyboardRef = useKeyboardInput()
  const dragonFlightInputRef = useRef({ up: false, down: false })
  const mountJumpRef = useRef({ vy: 0, wasPressed: false })
  const { camera } = useThree()
  const { world, rapier } = useRapier()

  useLayoutEffect(() => {
    visualRef.current?.position.set(...PLAYER_SPAWNS.interior)
  }, [])

  useEffect(() => {
    const onKeyDown = (event) => {
      if (isTextInputEvent(event)) return
      const key = getKeyboardKey(event)
      if (key === ' ' || key === 'space') dragonFlightInputRef.current.up = true
      if (key === 'shift') dragonFlightInputRef.current.down = true
    }
    const onKeyUp = (event) => {
      const key = getKeyboardKey(event)
      if (key === ' ' || key === 'space') dragonFlightInputRef.current.up = false
      if (key === 'shift') dragonFlightInputRef.current.down = false
    }
    const resetFlightInput = () => {
      dragonFlightInputRef.current.up = false
      dragonFlightInputRef.current.down = false
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', resetFlightInput)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', resetFlightInput)
    }
  }, [])

  useEffect(() => {
    if (!spawnRequest) return
    const [x, y, z] = spawnRequest.position
    playerPosRef.current.x = x
    playerPosRef.current.y = y
    playerPosRef.current.z = z
    playerPositionRef.current.x = x
    playerPositionRef.current.y = y
    playerPositionRef.current.z = z
    planarVelocityRef.current.x = 0
    planarVelocityRef.current.z = 0
    filteredInputRef.current.x = 0
    filteredInputRef.current.y = 0
    velocityYRef.current = 0
    onGroundRef.current = true
    wasOnGroundRef.current = true
    playerBodyRef.current?.setNextKinematicTranslation({ x, y, z })
    visualRef.current?.position.set(x, y, z)
    cameraLookRef.current.x = x
    cameraLookRef.current.y = y + 0.55
    cameraLookRef.current.z = z

    if (spawnRequest.zone === ZONES.outside) {
      const touch = touchRef.current
      const cameraSettings = CAMERA_SETTINGS.outside
      const cameraDistance = cameraSettings.distance
      const cameraPitch = MathUtils.clamp(touch.cameraPitch ?? -0.22, -0.8, 0.35)
      const cameraYaw = -Math.PI / 2
      const horizontalDistance = cameraDistance * Math.cos(cameraPitch)
      const targetCamera = clampCameraInPlayableVolume(
        x + Math.sin(cameraYaw) * horizontalDistance,
        y + cameraSettings.height + Math.sin(cameraPitch) * cameraDistance,
        z + Math.cos(cameraYaw) * horizontalDistance,
        ZONES.outside,
      )

      touch.cameraYaw = cameraYaw
      touch.cameraPitch = cameraPitch
      touch.cameraDistance = cameraDistance
      camera.position.set(targetCamera.x, targetCamera.y, targetCamera.z)
      camera.lookAt(cameraLookRef.current.x, cameraLookRef.current.y, cameraLookRef.current.z)
    }
  }, [camera, spawnRequest, playerPositionRef, touchRef])

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return
      if (getKeyboardKey(event) !== '=' && event.code !== 'Equal') return

      const target = event.target
      const isTyping =
        target instanceof HTMLElement &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      if (isTyping) return

      event.preventDefault()
      setIsPlayerVisible((current) => !current)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useFrame((state, delta) => {
    if (!playerBodyRef.current || !visualRef.current) return

    const key = keyboardRef.current
    const touch = touchRef.current

    if (freeCameraActive || movementLocked) {
      key.forward = false
      key.back = false
      key.left = false
      key.right = false
      key.actionQueued = false
      touch.moveX = 0
      touch.moveY = 0
      touch.actionQueued = false
      planarVelocityRef.current.x = 0
      planarVelocityRef.current.z = 0
      filteredInputRef.current.x = 0
      filteredInputRef.current.y = 0
      setPlayerMotion((current) => (current === 'idle' ? current : 'idle'))
      if (movementLocked) {
        const current = playerPosRef.current
        playerBodyRef.current.setNextKinematicTranslation(current)
        visualRef.current.position.set(current.x, current.y, current.z)
      }
      if (freeCameraActive) return
    }

    if (!movementLocked && dragonRide?.active && dragonRide.positionRef && dragonRide.yawRef) {
      const mountConfig = dragonRide.config ?? MOUNT_CONFIGS.dragon
      const flight = dragonFlightInputRef.current
      const pos = dragonRide.positionRef.current
      let yaw = dragonRide.yawRef.current

      // Keyboard and mobile joystick both pick a camera-relative direction,
      // then reuse the normal forward movement.
      //  - the jump button (mountAscend) jumps on the ground / climbs in flight
      //  - the descend button (mountDescend) lowers a flying mount
      const ascendInput = flight.up || touch.mountAscend
      const descendInput = flight.down || touch.mountDescend
      const joystickX = touch.moveX ?? 0
      const joystickY = touch.moveY ?? 0
      const joystickLength = Math.hypot(joystickX, joystickY)
      const keyboardX = (key.right ? 1 : 0) - (key.left ? 1 : 0)
      const keyboardY = (key.forward ? 1 : 0) - (key.back ? 1 : 0)
      const keyboardLength = Math.hypot(keyboardX, keyboardY)
      const controlX = joystickLength > 0.08 ? joystickX : keyboardX
      const controlY = joystickLength > 0.08 ? joystickY : keyboardY
      const controlLength = joystickLength > 0.08 ? joystickLength : keyboardLength
      let forwardInput = 0

      if (controlLength > 0.08) {
        const cameraYaw = touch.cameraYaw
        const worldX = Math.cos(cameraYaw) * controlX - Math.sin(cameraYaw) * controlY
        const worldZ = -Math.sin(cameraYaw) * controlX - Math.cos(cameraYaw) * controlY
        yaw = dampAngle(yaw, Math.atan2(worldX, worldZ), 12, delta)
        forwardInput = MathUtils.clamp(controlLength, 0, 1)
      }

      const groundY = currentZone === ZONES.outside ? getTerrainHeight(pos.x, pos.z) : 0
      const altitude = pos.y - groundY
      let nextAltitude = altitude
      let nextIsJumping = false
      if (mountConfig.canFly && ascendInput) {
        nextAltitude = Math.min(
          mountConfig.maxAltitude,
          altitude + mountConfig.climbSpeed * delta,
        )
      } else if (mountConfig.canFly && descendInput) {
        nextAltitude = Math.max(
          0,
          altitude - mountConfig.climbSpeed * delta,
        )
      } else if (mountConfig.canJump) {
        // Terrestrial hop: the jump button launches the mount, then gravity
        // pulls it back.
        const jump = mountJumpRef.current
        const grounded = altitude <= 0.02
        if (ascendInput && !jump.wasPressed && grounded) {
          jump.vy = mountConfig.jumpSpeed
        }
        jump.wasPressed = ascendInput
        jump.vy -= MOUNT_JUMP_GRAVITY * delta
        nextAltitude = altitude + jump.vy * delta
        if (nextAltitude <= 0) {
          nextAltitude = 0
          jump.vy = 0
        }
        nextIsJumping = nextAltitude > 0.02
      }

      const nextIsFlying = mountConfig.canFly && nextAltitude > 0.05
      if (nextIsFlying) dragonRide.onFlight?.()
      const speed = nextIsFlying ? mountConfig.flySpeed : mountConfig.groundSpeed
      const dirX = Math.sin(yaw)
      const dirZ = Math.cos(yaw)

      const limits = PLAY_AREA_LIMITS[currentZone] ?? PLAY_AREA_LIMITS.interior
      let nextX = MathUtils.clamp(pos.x + dirX * forwardInput * speed * delta, limits.minX, limits.maxX)
      let nextZ = MathUtils.clamp(pos.z + dirZ * forwardInput * speed * delta, limits.minZ, limits.maxZ)
      const nextGroundY = currentZone === ZONES.outside ? getTerrainHeight(nextX, nextZ) : 0
      const nextY = nextGroundY + nextAltitude

      dragonRide.positionRef.current.x = nextX
      dragonRide.positionRef.current.y = nextY
      dragonRide.positionRef.current.z = nextZ

      if (dragonRide.animStateRef) {
        dragonRide.animStateRef.current.airborne = nextIsFlying
        dragonRide.animStateRef.current.moving = forwardInput !== 0
        dragonRide.animStateRef.current.movingForward = forwardInput > 0
        dragonRide.animStateRef.current.jumping = nextIsJumping
      }
      dragonRide.yawRef.current = yaw

      const riderTransform = dragonRide.riderTransformRef?.current
      const riderLift = dragonRide.mountProfileRef?.current?.riderLift ?? DRAGON_RIDE_RIDER_LIFT
      let riderX = nextX
      let riderY = nextY + DRAGON_RIDE_RIDER_HEIGHT + riderLift
      let riderZ = nextZ
      if (riderTransform?.ready && dragonRide.riderSocketRef?.current) {
        getMountedRiderWorldPosition(
          dragonRide.riderSocketRef.current,
          riderLift,
          mountedPlayerLocalPosition,
          mountedRiderSocketQuaternion,
          mountedRiderLiftOffset,
          mountConfig.liftWorldUp,
        )
        riderX = mountedPlayerLocalPosition.x
        riderY = mountedPlayerLocalPosition.y
        riderZ = mountedPlayerLocalPosition.z
      }

      key.actionQueued = false
      touch.actionQueued = false
      planarVelocityRef.current.x = 0
      planarVelocityRef.current.z = 0
      filteredInputRef.current.x = 0
      filteredInputRef.current.y = 0
      velocityYRef.current = 0
      onGroundRef.current = true

      playerPosRef.current.x = riderX
      playerPosRef.current.y = riderY
      playerPosRef.current.z = riderZ
      playerPositionRef.current.x = riderX
      playerPositionRef.current.y = riderY
      playerPositionRef.current.z = riderZ
      playerBodyRef.current.setNextKinematicTranslation({ x: riderX, y: riderY, z: riderZ })
      if (playerBodyYawRef) playerBodyYawRef.current = yaw

      setPlayerMotion((current) => (current === 'mountedIdle' ? current : 'mountedIdle'))
      if (localPlayerStateRef) {
        localPlayerStateRef.current = {
          position: [riderX, riderY, riderZ],
          rotationY: yaw,
          motion: 'mountedIdle',
          zone: currentZone,
          // Mount transform so remote players can render this mount under us.
          mount: {
            id: mountConfig.id,
            position: [nextX, nextY, nextZ],
            yaw,
            airborne: nextIsFlying,
            moving: forwardInput !== 0,
            movingForward: forwardInput > 0,
            jumping: nextIsJumping,
          },
        }
      }

      if (!touch.lookActive) {
        touch.lookX = 0
        touch.lookY = 0
      }
      touch.cameraYaw -= touch.lookX * 2.9 * delta
      touch.cameraPitch = MathUtils.clamp(touch.cameraPitch + touch.lookY * 2.1 * delta, PLAYER_CAMERA_PITCH_MIN, PLAYER_CAMERA_PITCH_MAX)
      return
    }

    dragonCameraFocusRef.current.ready = false
    dragonCameraDistanceRef.current.ready = false

    if (seatedState?.phase) {
      const seat = seatedState.seat
      const isStandingUp = seatedState.phase === 'standUp'
      const target = seat.position
      const targetYaw = seat.rotationY
      const cameraYawSpeed = 2.9
      const cameraPitchSpeed = 2.1

      if (!touch.lookActive) {
        touch.lookX = 0
        touch.lookY = 0
      }
      touch.cameraYaw -= touch.lookX * cameraYawSpeed * delta
      touch.cameraPitch = MathUtils.clamp(
        touch.cameraPitch + touch.lookY * cameraPitchSpeed * delta,
        PLAYER_CAMERA_PITCH_MIN,
        PLAYER_CAMERA_PITCH_MAX,
      )

      if (seatPhaseRef.current !== seatedState.phase) {
        seatPhaseRef.current = seatedState.phase
        seatTimerRef.current = 0
      }

      seatTimerRef.current += delta
      key.actionQueued = false
      touch.moveX = 0
      touch.moveY = 0
      touch.actionQueued = false
      touch.emoteQueued = null
      planarVelocityRef.current.x = 0
      planarVelocityRef.current.z = 0
      filteredInputRef.current.x = 0
      filteredInputRef.current.y = 0
      velocityYRef.current = 0
      onGroundRef.current = true

      const nextX = target[0]
      const nextY = isStandingUp ? PLAYER_HEIGHT : (seat.sittingHeight ?? PLAYER_SITTING_HEIGHT)
      const nextZ = target[2]
      playerPosRef.current.x = nextX
      playerPosRef.current.y = nextY
      playerPosRef.current.z = nextZ
      playerPositionRef.current.x = nextX
      playerPositionRef.current.y = nextY
      playerPositionRef.current.z = nextZ
      playerBodyRef.current.setNextKinematicTranslation({ x: nextX, y: nextY, z: nextZ })
      visualRef.current.position.set(nextX, nextY, nextZ)
      visualRef.current.rotation.y = targetYaw

      const nextMotion =
        seatedState.phase === 'sitDown'
          ? 'sitDown'
          : seatedState.phase === 'standUp'
            ? 'standUp'
            : 'sittingIdle'
      setPlayerMotion((current) => (current === nextMotion ? current : nextMotion))
      if (localPlayerStateRef) {
        localPlayerStateRef.current = {
          position: [nextX, nextY, nextZ],
          rotationY: targetYaw,
          motion: nextMotion,
          zone: currentZone,
        }
      }

      if (seatedState.phase === 'sitDown' && seatTimerRef.current >= PLAYER_SIT_DOWN_DURATION) {
        onSeatedPhaseChange('sitting')
      }
      if (seatedState.phase === 'standUp' && seatTimerRef.current >= PLAYER_STAND_UP_DURATION) {
        playerPosRef.current.x = seat.exitPosition[0]
        playerPosRef.current.y = PLAYER_HEIGHT
        playerPosRef.current.z = seat.exitPosition[2]
        playerPositionRef.current.x = seat.exitPosition[0]
        playerPositionRef.current.y = PLAYER_HEIGHT
        playerPositionRef.current.z = seat.exitPosition[2]
        playerBodyRef.current.setNextKinematicTranslation({
          x: seat.exitPosition[0],
          y: PLAYER_HEIGHT,
          z: seat.exitPosition[2],
        })
        visualRef.current.position.set(seat.exitPosition[0], PLAYER_HEIGHT, seat.exitPosition[2])
        seatPhaseRef.current = null
        onSeatedPhaseChange(null)
      }

      cameraLookRef.current.x = MathUtils.damp(cameraLookRef.current.x, nextX, 12, delta)
      cameraLookRef.current.y = MathUtils.damp(cameraLookRef.current.y, nextY + 0.75, 12, delta)
      cameraLookRef.current.z = MathUtils.damp(cameraLookRef.current.z, nextZ, 12, delta)
      const pitch = touch.cameraPitch
      const cameraDistance = touch.cameraDistance ?? 3
      const horizontalDistance = cameraDistance * Math.cos(pitch)
      const seatCameraX = nextX + Math.sin(touch.cameraYaw) * horizontalDistance
      const seatCameraY = nextY + 1.45 + Math.sin(pitch) * cameraDistance
      const seatCameraZ = nextZ + Math.cos(touch.cameraYaw) * horizontalDistance
      let targetCameraX = seatCameraX
      let targetCameraY = seatCameraY
      let targetCameraZ = seatCameraZ

      const originY = nextY + 0.75
      const dirX = seatCameraX - nextX
      const dirY = seatCameraY - originY
      const dirZ = seatCameraZ - nextZ
      const rayDistance = Math.hypot(dirX, dirY, dirZ)

      if (rayDistance > 0.001) {
        const inv = 1 / rayDistance
        const rayDir = { x: dirX * inv, y: dirY * inv, z: dirZ * inv }
        const ray = new rapier.Ray({ x: nextX, y: originY, z: nextZ }, rayDir)
        const hit = world.castRay(ray, rayDistance, true)
        if (hit && hit.toi < rayDistance) {
          const safe = Math.max(0.2, hit.toi - 0.14)
          targetCameraX = nextX + rayDir.x * safe
          targetCameraY = originY + rayDir.y * safe
          targetCameraZ = nextZ + rayDir.z * safe
        }
      }

      const clampedCamera = clampCameraInPlayableVolume(targetCameraX, targetCameraY, targetCameraZ, currentZone)
      camera.position.x = MathUtils.damp(camera.position.x, clampedCamera.x, 7, delta)
      camera.position.y = MathUtils.damp(camera.position.y, clampedCamera.y, 7, delta)
      camera.position.z = MathUtils.damp(camera.position.z, clampedCamera.z, 7, delta)
      camera.lookAt(cameraLookRef.current.x, cameraLookRef.current.y, cameraLookRef.current.z)
      return
    }

    if (seatPhaseRef.current) {
      seatPhaseRef.current = null
      seatTimerRef.current = 0
    }

    if (mode === 'customize') {
      key.actionQueued = false
      touch.moveX = 0
      touch.moveY = 0
      touch.lookX = 0
      touch.lookY = 0
      touch.lookActive = false
      touch.actionQueued = false
      touch.emoteQueued = null
      planarVelocityRef.current.x = 0
      planarVelocityRef.current.z = 0
      filteredInputRef.current.x = 0
      filteredInputRef.current.y = 0
      setPlayerMotion((current) => (current === 'idle' ? current : 'idle'))
      return
    }

    const cameraYawSpeed = 2.9
    const cameraPitchSpeed = 2.1
    if (!touch.lookActive) {
      touch.lookX = 0
      touch.lookY = 0
    }
    touch.cameraYaw -= touch.lookX * cameraYawSpeed * delta
    touch.cameraPitch = MathUtils.clamp(
      touch.cameraPitch + touch.lookY * cameraPitchSpeed * delta,
      PLAYER_CAMERA_PITCH_MIN,
      PLAYER_CAMERA_PITCH_MAX,
    )

    let isEmoting =
      state.clock.elapsedTime < waveUntilRef.current ||
      state.clock.elapsedTime < danceUntilRef.current ||
      state.clock.elapsedTime < pointingUpUntilRef.current
    const keyboardAxisX = (key.right ? 1 : 0) - (key.left ? 1 : 0)
    const keyboardAxisY = (key.forward ? 1 : 0) - (key.back ? 1 : 0)
    const controlX = MathUtils.clamp(touch.moveX + keyboardAxisX, -1, 1)
    const controlY = MathUtils.clamp(touch.moveY + keyboardAxisY, -1, 1)
    const wantsControlCancel =
      isEmoting &&
      (Math.hypot(controlX, controlY) > 0.12 || key.actionQueued || touch.actionQueued)

    if (wantsControlCancel) {
      waveUntilRef.current = 0
      danceUntilRef.current = 0
      pointingUpUntilRef.current = 0
      isEmoting = false
    }

    const rawX = isEmoting ? 0 : controlX
    const rawY = isEmoting ? 0 : controlY
    const rawLength = Math.hypot(rawX, rawY)

    const moveFilter = 16
    filteredInputRef.current.x +=
      (rawX - filteredInputRef.current.x) * Math.min(1, moveFilter * delta)
    filteredInputRef.current.y +=
      (rawY - filteredInputRef.current.y) * Math.min(1, moveFilter * delta)

    let moveX = filteredInputRef.current.x
    let moveY = filteredInputRef.current.y
    const inputLength = Math.hypot(moveX, moveY)
    if (rawLength < 0.08 && inputLength < 0.12) {
      moveX = 0
      moveY = 0
      filteredInputRef.current.x = 0
      filteredInputRef.current.y = 0
    } else if (inputLength > 1) {
      moveX /= inputLength
      moveY /= inputLength
    }

    const yaw = touch.cameraYaw
    const forwardX = -Math.sin(yaw)
    const forwardZ = -Math.cos(yaw)
    const rightX = Math.cos(yaw)
    const rightZ = -Math.sin(yaw)

    let worldX = rightX * moveX + forwardX * moveY
    let worldZ = rightZ * moveX + forwardZ * moveY

    const isMoving = worldX !== 0 || worldZ !== 0

    if (isMoving) {
      const length = Math.hypot(worldX, worldZ)
      worldX /= length
      worldZ /= length
    }

    const moveIntensity = MathUtils.clamp(rawLength, 0, 1)
    const speed = isMoving
      ? MathUtils.lerp(1.65, PLAYER_MAX_RUN_SPEED, MathUtils.smoothstep(moveIntensity, 0.25, 0.95))
      : 0
    const targetVelX = worldX * speed
    const targetVelZ = worldZ * speed
    const planarDamping = 14
    planarVelocityRef.current.x +=
      (targetVelX - planarVelocityRef.current.x) * Math.min(1, planarDamping * delta)
    planarVelocityRef.current.z +=
      (targetVelZ - planarVelocityRef.current.z) * Math.min(1, planarDamping * delta)
    if (Math.abs(targetVelX) < 0.0001 && Math.abs(planarVelocityRef.current.x) < 0.02) {
      planarVelocityRef.current.x = 0
    }
    if (Math.abs(targetVelZ) < 0.0001 && Math.abs(planarVelocityRef.current.z) < 0.02) {
      planarVelocityRef.current.z = 0
    }

    const prevX = playerPosRef.current.x
    const prevZ = playerPosRef.current.z
    let nextX = prevX + planarVelocityRef.current.x * delta
    let nextZ = prevZ + planarVelocityRef.current.z * delta

    if (isMoving) {
      const targetYaw = Math.atan2(worldX, worldZ)
      visualRef.current.rotation.y = dampAngle(visualRef.current.rotation.y, targetYaw, 12, delta)
    }
    if (playerBodyYawRef) playerBodyYawRef.current = visualRef.current.rotation.y

    const limits = PLAY_AREA_LIMITS[currentZone] ?? PLAY_AREA_LIMITS.interior
    nextX = MathUtils.clamp(nextX, limits.minX, limits.maxX)
    nextZ = MathUtils.clamp(nextZ, limits.minZ, limits.maxZ)

    const playerYaw = visualRef.current.rotation.y
    const punchTarget = getNearestPunchTarget({
      targets: combatTargetsRef?.current,
      playerX: nextX,
      playerZ: nextZ,
      yaw: playerYaw,
    })
    let kickInArc = false
    const ball = ballRef.current
    if (ball) {
      const ballPos = ball.translation()
      kickInArc = getKickContact({
        playerX: nextX,
        playerZ: nextZ,
        yaw: playerYaw,
        ballX: ballPos.x,
        ballZ: ballPos.z,
      }).isInKickArc
    }

    if (playerCombatActionsRef) {
      const inPlay = mode === 'play'
      playerCombatActionsRef.current.canPunch = inPlay && Boolean(punchTarget && onGroundRef.current)
      playerCombatActionsRef.current.canKick = inPlay && Boolean(kickInArc && onGroundRef.current)
    }

    const wantsEmote = touch.emoteQueued
    const isAttackLocked =
      state.clock.elapsedTime < punchUntilRef.current ||
      state.clock.elapsedTime < kickUntilRef.current
    const wantsPunch = !isEmoting && !isAttackLocked && (touch.punchQueued || key.punchQueued)
    const wantsKick = !isEmoting && !isAttackLocked && (touch.kickQueued || key.kickQueued)
    const wantsGenericAction = !isEmoting && !isAttackLocked && (key.actionQueued || touch.actionQueued)
    if (wantsEmote === 'wave' && onGroundRef.current) {
      waveUntilRef.current = state.clock.elapsedTime + PLAYER_WAVE_DURATION
      danceUntilRef.current = 0
      pointingUpUntilRef.current = 0
      kickUntilRef.current = 0
      pendingKickRef.current = null
      punchUntilRef.current = 0
      pendingPunchRef.current = null
      jumpStartUntilRef.current = 0
      jumpLandUntilRef.current = 0
      planarVelocityRef.current.x = 0
      planarVelocityRef.current.z = 0
      filteredInputRef.current.x = 0
      filteredInputRef.current.y = 0
    } else if (wantsEmote === 'dance' && onGroundRef.current) {
      danceUntilRef.current = state.clock.elapsedTime + PLAYER_DANCE_DURATION
      waveUntilRef.current = 0
      pointingUpUntilRef.current = 0
      kickUntilRef.current = 0
      pendingKickRef.current = null
      punchUntilRef.current = 0
      pendingPunchRef.current = null
      jumpStartUntilRef.current = 0
      jumpLandUntilRef.current = 0
      planarVelocityRef.current.x = 0
      planarVelocityRef.current.z = 0
      filteredInputRef.current.x = 0
      filteredInputRef.current.y = 0
    } else if (wantsEmote === 'pointingUp' && onGroundRef.current) {
      pointingUpUntilRef.current = state.clock.elapsedTime + PLAYER_POINTING_UP_DURATION
      waveUntilRef.current = 0
      danceUntilRef.current = 0
      kickUntilRef.current = 0
      pendingKickRef.current = null
      punchUntilRef.current = 0
      pendingPunchRef.current = null
      jumpStartUntilRef.current = 0
      jumpLandUntilRef.current = 0
      planarVelocityRef.current.x = 0
      planarVelocityRef.current.z = 0
      filteredInputRef.current.x = 0
      filteredInputRef.current.y = 0
    } else if (wantsPunch && punchTarget && onGroundRef.current) {
      const contactAt = state.clock.elapsedTime + PLAYER_PUNCH_CONTACT_DELAY
      punchUntilRef.current = state.clock.elapsedTime + PLAYER_PUNCH_DURATION
      pendingPunchRef.current = {
        targetId: punchTarget.target.id,
        contactAt,
        expiresAt: contactAt + PLAYER_PUNCH_CONTACT_WINDOW,
        fired: false,
      }
    } else if (wantsKick && kickInArc && onGroundRef.current) {
      const contactAt = state.clock.elapsedTime + PLAYER_KICK_CONTACT_DELAY
      kickUntilRef.current = state.clock.elapsedTime + PLAYER_KICK_DURATION
      pendingKickRef.current = {
        contactAt,
        expiresAt: contactAt + PLAYER_KICK_CONTACT_WINDOW,
        fired: false,
        running: speed > 2.45,
      }
    } else if (wantsGenericAction) {
      if (punchTarget && onGroundRef.current) {
        const contactAt = state.clock.elapsedTime + PLAYER_PUNCH_CONTACT_DELAY
        punchUntilRef.current = state.clock.elapsedTime + PLAYER_PUNCH_DURATION
        pendingPunchRef.current = {
          targetId: punchTarget.target.id,
          contactAt,
          expiresAt: contactAt + PLAYER_PUNCH_CONTACT_WINDOW,
          fired: false,
        }
      } else if (ball) {
        const ballPos = ball.translation()
        const kickContact = getKickContact({
          playerX: nextX,
          playerZ: nextZ,
          yaw: playerYaw,
          ballX: ballPos.x,
          ballZ: ballPos.z,
        })

        if (kickContact.isInKickArc && onGroundRef.current) {
          const contactAt = state.clock.elapsedTime + PLAYER_KICK_CONTACT_DELAY
          kickUntilRef.current = state.clock.elapsedTime + PLAYER_KICK_DURATION
          pendingKickRef.current = {
            contactAt,
            expiresAt: contactAt + PLAYER_KICK_CONTACT_WINDOW,
            fired: false,
            running: speed > 2.45,
          }
        } else if (onGroundRef.current) {
          velocityYRef.current = 4.9
          onGroundRef.current = false
          jumpStartUntilRef.current = state.clock.elapsedTime + PLAYER_JUMP_START_DURATION
          jumpLandUntilRef.current = 0
          landingPreparedRef.current = false
        }
      } else if (onGroundRef.current) {
        velocityYRef.current = 4.9
        onGroundRef.current = false
        jumpStartUntilRef.current = state.clock.elapsedTime + PLAYER_JUMP_START_DURATION
        jumpLandUntilRef.current = 0
        landingPreparedRef.current = false
      }
    }

    key.actionQueued = false
    touch.actionQueued = false
    touch.punchQueued = false
    touch.kickQueued = false
    key.punchQueued = false
    key.kickQueued = false
    touch.emoteQueued = null

    if (!onGroundRef.current) {
      velocityYRef.current -= 12 * delta
    } else {
      velocityYRef.current = 0
    }
    const currentFootY = playerPosRef.current.y - PLAYER_HEIGHT
    const outdoorGroundY = currentZone === ZONES.outside
      ? getOutdoorWalkableHeight(nextX, nextZ, currentFootY)
      : 0
    const floorY = currentZone === ZONES.outside
      ? outdoorGroundY + PLAYER_HEIGHT
      : PLAYER_HEIGHT
    const currentPlayerY = playerPosRef.current.y
    const isSteppingOffLedge =
      onGroundRef.current &&
      currentZone === ZONES.outside &&
      currentPlayerY - floorY > PLAYER_GROUNDED_DROP_TO_FALL

    if (isSteppingOffLedge) {
      onGroundRef.current = false
      velocityYRef.current = Math.min(velocityYRef.current, PLAYER_LEDGE_FALL_INITIAL_VELOCITY)
      jumpStartUntilRef.current = 0
      landingPreparedRef.current = false
    }

    let nextY = onGroundRef.current ? floorY : currentPlayerY + velocityYRef.current * delta
    const distanceToGround = Math.max(0, nextY - floorY)
    const shouldPrepareLanding =
      !onGroundRef.current &&
      !landingPreparedRef.current &&
      state.clock.elapsedTime >= jumpStartUntilRef.current &&
      velocityYRef.current < -1 &&
      distanceToGround < PLAYER_LANDING_PREPARE_DISTANCE

    if (shouldPrepareLanding) {
      landingPreparedRef.current = true
      jumpLandUntilRef.current = state.clock.elapsedTime + PLAYER_JUMP_LAND_DURATION
    }

    if (nextY <= floorY) {
      nextY = floorY
      velocityYRef.current = 0
      onGroundRef.current = true
    }

    if (!wasOnGroundRef.current && onGroundRef.current) {
      if (!landingPreparedRef.current) {
        jumpLandUntilRef.current = state.clock.elapsedTime + PLAYER_JUMP_LAND_DURATION
      }
      landingPreparedRef.current = false
    }
    wasOnGroundRef.current = onGroundRef.current

    if (
      currentZone !== ZONES.outside &&
      collidesWithGoalFrame(nextX, nextY, nextZ, goalObject)
    ) {
      nextX = prevX
      nextZ = prevZ
      planarVelocityRef.current.x = 0
      planarVelocityRef.current.z = 0
    }

    if (currentZone === ZONES.outside && collidesWithOutdoorObstacle(nextX, nextZ, nextY - PLAYER_HEIGHT)) {
      nextX = prevX
      nextZ = prevZ
      planarVelocityRef.current.x = 0
      planarVelocityRef.current.z = 0
    }

    playerPosRef.current.x = nextX
    playerPosRef.current.y = nextY
    playerPosRef.current.z = nextZ
    playerPositionRef.current.x = nextX
    playerPositionRef.current.y = nextY
    playerPositionRef.current.z = nextZ
    if (playerVelocityRef) {
      playerVelocityRef.current.x = planarVelocityRef.current.x
      playerVelocityRef.current.z = planarVelocityRef.current.z
    }

    playerBodyRef.current.setNextKinematicTranslation({ x: nextX, y: nextY, z: nextZ })
    if (visualRef.current) {
      visualRef.current.position.set(nextX, nextY, nextZ)
    }

    const pendingPunch = pendingPunchRef.current
    if (pendingPunch && !pendingPunch.fired && state.clock.elapsedTime >= pendingPunch.contactAt) {
      const target = combatTargetsRef?.current?.get(pendingPunch.targetId)
      if (target && !target.disabled && state.clock.elapsedTime <= pendingPunch.expiresAt) {
        const contact = getPunchContact({
          playerX: nextX,
          playerZ: nextZ,
          yaw: visualRef.current.rotation.y,
          targetX: target.position.x,
          targetZ: target.position.z,
          targetRadius: target.radius,
        })

        if (contact.isInPunchArc) {
          // Combo : si on enchaîne dans la fenêtre, les dégâts montent
          // (10 → 15 → 20 → 25 → 30). Sinon le combo repart de zéro.
          const nowSec = state.clock.elapsedTime
          const combo = punchComboRef.current
          if (nowSec - combo.lastHitAt > PUNCH_COMBO_WINDOW) combo.count = 0
          const punchDamage = Math.min(
            PLAYER_PUNCH_DAMAGE_MAX,
            PLAYER_PUNCH_DAMAGE + combo.count * PLAYER_PUNCH_COMBO_STEP,
          )
          combo.count += 1
          combo.lastHitAt = nowSec
          onCombatHit?.({
            targetId: target.id,
            damage: punchDamage,
            direction: { x: contact.forwardX, z: contact.forwardZ },
            hitPoint: [
              target.position.x,
              (target.position.y ?? 0) + Math.min(target.height ?? 1.4, 1.25),
              target.position.z,
            ],
          })
        }
      }
      pendingPunch.fired = true
      pendingPunchRef.current = null
    } else if (pendingPunch && state.clock.elapsedTime > pendingPunch.expiresAt) {
      pendingPunchRef.current = null
    }

    const pendingKick = pendingKickRef.current
    if (pendingKick && !pendingKick.fired && state.clock.elapsedTime >= pendingKick.contactAt) {
      const ball = ballRef.current
      if (ball && state.clock.elapsedTime <= pendingKick.expiresAt) {
        const ballPos = ball.translation()
        const kickContact = getKickContact({
          playerX: nextX,
          playerZ: nextZ,
          yaw: visualRef.current.rotation.y,
          ballX: ballPos.x,
          ballZ: ballPos.z,
        })

        if (kickContact.isInKickArc && kickContact.isTouchingFoot) {
          const power = pendingKick.running ? 0.22 : 0.17
          const lift = pendingKick.running ? 0.08 : 0.06
          const impulse = { x: kickContact.forwardX * power, y: lift, z: kickContact.forwardZ * power }
          const shouldApplyLocalImpulse = onKickIntent?.({ impulse, power, lift }) !== false
          if (shouldApplyLocalImpulse) {
            ball.applyImpulse(impulse, true)
          }
        }
      }
      pendingKick.fired = true
      pendingKickRef.current = null
    } else if (pendingKick && state.clock.elapsedTime > pendingKick.expiresAt) {
      pendingKickRef.current = null
    }

    const nextMotion =
      state.clock.elapsedTime < jumpLandUntilRef.current
        ? 'jumpLand'
        : !onGroundRef.current && state.clock.elapsedTime < jumpStartUntilRef.current
          ? 'jumpStart'
          : !onGroundRef.current
            ? 'fallingIdle'
            : state.clock.elapsedTime < waveUntilRef.current
              ? 'wave'
              : state.clock.elapsedTime < danceUntilRef.current
                ? 'dance'
                : state.clock.elapsedTime < pointingUpUntilRef.current
                  ? 'pointingUp'
                  : state.clock.elapsedTime < punchUntilRef.current
                    ? 'punch'
                  : state.clock.elapsedTime < kickUntilRef.current
                    ? 'kick'
                    : isMoving
                      ? speed > 2.45
                        ? 'run'
                        : 'walk'
                      : 'idle'
    setPlayerMotion((current) => (current === nextMotion ? current : nextMotion))
    if (localPlayerStateRef) {
      localPlayerStateRef.current = {
        position: [nextX, nextY, nextZ],
        rotationY: visualRef.current.rotation.y,
        motion: nextMotion,
        zone: currentZone,
      }
    }

    const pitch = touch.cameraPitch
    const cameraSettings = CAMERA_SETTINGS[currentZone] ?? CAMERA_SETTINGS.interior

    const focusX = cameraOnCat && catPositionRef ? catPositionRef.current.x : nextX
    const focusY = cameraOnCat && catPositionRef ? catPositionRef.current.y : nextY
    const focusZ = cameraOnCat && catPositionRef ? catPositionRef.current.z : nextZ
    const lookHeight = cameraOnCat ? 0.3 : 0.55
    const towerCameraContext = currentZone === ZONES.outside && !cameraOnCat
      ? getSkeletonTowerCameraContext(focusX, focusY, focusZ)
      : null
    const effectivePitch = towerCameraContext
      ? MathUtils.clamp(pitch, -0.52, 0.32)
      : pitch
    const cameraDistance = towerCameraContext
      ? Math.min(touch.cameraDistance ?? cameraSettings.distance, SKELETON_TOWER_CAMERA_DISTANCE)
      : touch.cameraDistance ?? cameraSettings.distance
    const cameraHeight = towerCameraContext ? SKELETON_TOWER_CAMERA_HEIGHT : cameraSettings.height

    const horizontalDistance = cameraDistance * Math.cos(effectivePitch)
    const desiredX = focusX + Math.sin(yaw) * horizontalDistance
    const desiredY = focusY + cameraHeight + Math.sin(effectivePitch) * cameraDistance
    const desiredZ = focusZ + Math.cos(yaw) * horizontalDistance

    let targetX = desiredX
    let targetY = desiredY
    let targetZ = desiredZ

    const originY = focusY + 0.7
    const dirX = desiredX - focusX
    const dirY = desiredY - originY
    const dirZ = desiredZ - focusZ
    const rayDistance = Math.hypot(dirX, dirY, dirZ)

    if (rayDistance > 0.001) {
      const inv = 1 / rayDistance
      const rayDir = { x: dirX * inv, y: dirY * inv, z: dirZ * inv }
      const ray = new rapier.Ray({ x: focusX, y: originY, z: focusZ }, rayDir)
      const hit = world.castRay(ray, rayDistance, true)
      if (hit && hit.toi < rayDistance) {
        const safe = Math.max(0.2, hit.toi - 0.14)
        targetX = focusX + rayDir.x * safe
        targetY = originY + rayDir.y * safe
        targetZ = focusZ + rayDir.z * safe
      }
    }

    // Pull camera before tree trunks (trees have no Rapier colliders)
    if (currentZone === ZONES.outside) {
      const treeSegX = targetX - focusX
      const treeSegZ = targetZ - focusZ
      const treeSegLen2 = treeSegX * treeSegX + treeSegZ * treeSegZ
      if (treeSegLen2 > 0.001) {
        const treeSegLen = Math.sqrt(treeSegLen2)
        let minSafeT = 1.0
        for (const treeEntry of EDITABLE_TREE_PLACEMENTS) {
          const { x: tx, z: tz } = getEditableTreePosition(treeEntry)
          const r = getEditableTreeCollisionRadius(treeEntry) + 0.3
          const ftX = tx - focusX
          const ftZ = tz - focusZ
          const tParam = (ftX * treeSegX + ftZ * treeSegZ) / treeSegLen2
          if (tParam < 0.04 || tParam > 0.97) continue
          const closestX = focusX + treeSegX * tParam
          const closestZ = focusZ + treeSegZ * tParam
          if ((tx - closestX) ** 2 + (tz - closestZ) ** 2 >= r * r) continue
          minSafeT = Math.min(minSafeT, Math.max(0.05, tParam - r / treeSegLen))
        }
        if (minSafeT < 1.0) {
          targetX = focusX + treeSegX * minSafeT
          targetY = originY + (targetY - originY) * minSafeT
          targetZ = focusZ + treeSegZ * minSafeT
        }
      }
    }

    if (towerCameraContext) {
      const constrainedTarget = constrainCameraToSkeletonTower(targetX, targetY, targetZ, towerCameraContext)
      targetX = constrainedTarget.x
      targetY = constrainedTarget.y
      targetZ = constrainedTarget.z
    }

    const clampedTarget = clampCameraInPlayableVolume(targetX, targetY, targetZ, currentZone)
    const cameraDamping = towerCameraContext ? 20 : 12
    camera.position.x = MathUtils.damp(camera.position.x, clampedTarget.x, cameraDamping, delta)
    camera.position.y = MathUtils.damp(camera.position.y, clampedTarget.y, cameraDamping, delta)
    camera.position.z = MathUtils.damp(camera.position.z, clampedTarget.z, cameraDamping, delta)

    cameraLookRef.current.x = MathUtils.damp(cameraLookRef.current.x, focusX, 16, delta)
    cameraLookRef.current.y = MathUtils.damp(cameraLookRef.current.y, focusY + lookHeight, 16, delta)
    cameraLookRef.current.z = MathUtils.damp(cameraLookRef.current.z, focusZ, 16, delta)
    camera.lookAt(cameraLookRef.current.x, cameraLookRef.current.y, cameraLookRef.current.z)
  })

  useFrame(() => {
    const playerGroup = visualRef.current
    const riderSocket = dragonRide?.riderSocketRef?.current
    const playerParent = playerGroup?.parent
    if (!dragonRide?.active || !riderSocket || !playerGroup || !playerParent) return

    getMountedRiderWorldPosition(
      riderSocket,
      dragonRide.mountProfileRef?.current?.riderLift ?? DRAGON_RIDE_RIDER_LIFT,
      mountedPlayerLocalPosition,
      mountedRiderSocketQuaternion,
      mountedRiderLiftOffset,
      dragonRide.config?.liftWorldUp,
    )
    playerBodyRef.current?.setNextKinematicTranslation({
      x: mountedPlayerLocalPosition.x,
      y: mountedPlayerLocalPosition.y,
      z: mountedPlayerLocalPosition.z,
    })
    playerParent.worldToLocal(mountedPlayerLocalPosition)
    playerGroup.position.copy(mountedPlayerLocalPosition)
    playerGroup.rotation.set(0, dragonRide.yawRef.current, 0)
  }, 0.5)

  useFrame((_, delta) => {
    const riderSocket = dragonRide?.riderSocketRef?.current
    if (!dragonRide?.active || !riderSocket) return

    getMountedRiderWorldPosition(
      riderSocket,
      dragonRide.mountProfileRef?.current?.riderLift ?? DRAGON_RIDE_RIDER_LIFT,
      dragonCameraSocketPosition,
      mountedRiderSocketQuaternion,
      mountedRiderLiftOffset,
      dragonRide.config?.liftWorldUp,
    )
    const dragonPosition = dragonRide.positionRef.current
    const rideOffset = dragonCameraRideOffsetRef.current
    const cameraFocus = dragonCameraFocusRef.current
    const targetOffsetX = dragonCameraSocketPosition.x - dragonPosition.x
    const targetOffsetY = dragonCameraSocketPosition.y - dragonPosition.y
    const targetOffsetZ = dragonCameraSocketPosition.z - dragonPosition.z

    if (!cameraFocus.ready) {
      rideOffset.x = targetOffsetX
      rideOffset.y = targetOffsetY
      rideOffset.z = targetOffsetZ
      cameraFocus.ready = true
    } else {
      rideOffset.x = MathUtils.damp(rideOffset.x, targetOffsetX, DRAGON_RIDE_CAMERA_HORIZONTAL_DAMPING, delta)
      rideOffset.y = MathUtils.damp(rideOffset.y, targetOffsetY, DRAGON_RIDE_CAMERA_VERTICAL_DAMPING, delta)
      rideOffset.z = MathUtils.damp(rideOffset.z, targetOffsetZ, DRAGON_RIDE_CAMERA_HORIZONTAL_DAMPING, delta)
    }

    cameraFocus.x = dragonPosition.x + rideOffset.x
    cameraFocus.y = dragonPosition.y + rideOffset.y
    cameraFocus.z = dragonPosition.z + rideOffset.z

    const touch = touchRef.current
    const pitch = touch.cameraPitch
    const targetCameraDistance = touch.cameraDistance ?? 5
    const cameraDistanceState = dragonCameraDistanceRef.current
    if (!cameraDistanceState.ready) {
      cameraDistanceState.value = targetCameraDistance
      cameraDistanceState.ready = true
    } else {
      cameraDistanceState.value = MathUtils.damp(
        cameraDistanceState.value,
        targetCameraDistance,
        DRAGON_RIDE_CAMERA_ZOOM_DAMPING,
        delta,
      )
    }
    const cameraDistance = cameraDistanceState.value
    const horizontalDistance = cameraDistance * Math.cos(pitch)
    const cameraTarget = clampCameraInPlayableVolume(
      cameraFocus.x + Math.sin(touch.cameraYaw) * horizontalDistance,
      cameraFocus.y + 1.6 + Math.sin(pitch) * cameraDistance,
      cameraFocus.z + Math.cos(touch.cameraYaw) * horizontalDistance,
      currentZone,
    )

    camera.position.set(cameraTarget.x, cameraTarget.y, cameraTarget.z)
    cameraLookRef.current.x = cameraFocus.x
    cameraLookRef.current.y = cameraFocus.y + 0.6
    cameraLookRef.current.z = cameraFocus.z
    camera.lookAt(cameraLookRef.current.x, cameraLookRef.current.y, cameraLookRef.current.z)
  }, 0.75)

  return (
    <>
      <RigidBody
        ref={playerBodyRef}
        type="kinematicPosition"
        colliders={false}
        position={PLAYER_SPAWNS.interior}
      >
        <CapsuleCollider args={[PLAYER_CAPSULE_HALF_HEIGHT, PLAYER_CAPSULE_RADIUS]} />
      </RigidBody>
      <group ref={visualRef} visible={isPlayerVisible}>
        <PlayerAvatar
          motion={playerMotion}
          handBoneRef={handBoneRef}
          mountProfileRef={dragonRide?.mountProfileRef}
          equippedWeapon={equippedWeapon}
          appearance={appearance}
          currentZone={currentZone}
        />
        <FloatingMagicBook active={equippedWeapon === 'magic_book'} handBoneRef={handBoneRef} playerGroupRef={visualRef} />
        <FloatingMagicSkull active={equippedWeapon === 'magic_skull'} handBoneRef={handBoneRef} playerGroupRef={visualRef} />
      </group>
    </>
  )
}

function CharacterAuraGlow({ visible }) {
  const hazeMaterial = useMemo(() => new ShaderMaterial({
    uniforms: {
      glowColor: { value: new Color('#77d9ff') },
      opacity: { value: 0.44 },
      uTime: { value: 0 },
    },
    vertexShader: `
      varying vec2 vUv;
      varying float vFacing;
      void main() {
        vUv = uv;
        vec3 viewNormal = normalize(normalMatrix * normal);
        vFacing = smoothstep(0.10, 0.42, abs(viewNormal.z));
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 glowColor;
      uniform float opacity;
      uniform float uTime;
      varying vec2 vUv;
      varying float vFacing;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }

      float fbm(vec2 p) {
        float value = 0.0;
        float amplitude = 0.5;
        for (int i = 0; i < 4; i++) {
          value += noise(p) * amplitude;
          p *= 2.03;
          amplitude *= 0.5;
        }
        return value;
      }

      void main() {
        vec2 centered = vUv - vec2(0.5);
        centered.y *= 0.58;
        float radial = length(centered);
        float alpha = (1.0 - smoothstep(0.08, 0.52, radial)) * opacity;
        alpha *= smoothstep(0.16, 0.34, vUv.y) * (1.0 - smoothstep(0.82, 1.0, vUv.y));
        float organic = fbm(vUv * vec2(4.0, 6.5) + vec2(uTime * 0.08, -uTime * 0.16));
        float streaks = smoothstep(0.28, 0.86, organic);
        alpha *= mix(0.7, 1.55, streaks);
        alpha *= 1.0 - smoothstep(0.42, 0.56, radial) * 0.42;
        gl_FragColor = vec4(glowColor * 0.76, alpha * vFacing);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    stencilWrite: true,
    stencilWriteMask: 0x00,
    stencilRef: 1,
    stencilFunc: NotEqualStencilFunc,
    stencilFail: KeepStencilOp,
    stencilZFail: KeepStencilOp,
    stencilZPass: KeepStencilOp,
  }), [])
  const particlesMaterial = useMemo(() => new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new Color('#b8f1ff') },
      uOpacity: { value: 0.92 },
      uSize: { value: 20.5 },
    },
    vertexShader: `
      uniform float uTime;
      uniform float uSize;
      attribute float aPhase;
      attribute float aSpeed;
      attribute float aSize;
      varying float vAlpha;

      void main() {
        vec3 p = position;
        float angle = atan(p.z, p.x) + uTime * aSpeed + aPhase * 0.18;
        float radius = length(p.xz) + sin(uTime * 1.2 + aPhase) * 0.025;
        p.x = cos(angle) * radius;
        p.z = sin(angle) * radius;
        p.y += sin(uTime * aSpeed * 1.7 + aPhase) * 0.08;

        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        gl_PointSize = uSize * aSize * (1.0 / max(-mvPosition.z, 0.2));

        float verticalFade = smoothstep(-0.72, -0.12, p.y) * (1.0 - smoothstep(0.72, 1.08, p.y));
        vAlpha = verticalFade * (0.5 + 0.5 * sin(uTime * 2.2 + aPhase));
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vAlpha;

      void main() {
        float d = distance(gl_PointCoord, vec2(0.5));
        float strength = pow(max(1.0 - d * 2.0, 0.0), 2.8);
        gl_FragColor = vec4(uColor, strength * vAlpha * uOpacity);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: AdditiveBlending,
    toneMapped: false,
    stencilWrite: true,
    stencilWriteMask: 0x00,
    stencilRef: 1,
    stencilFunc: NotEqualStencilFunc,
    stencilFail: KeepStencilOp,
    stencilZFail: KeepStencilOp,
    stencilZPass: KeepStencilOp,
  }), [])
  const particleGeometry = useMemo(() => {
    const count = 96
    const positions = []
    const phases = []
    const speeds = []
    const sizes = []

    for (let index = 0; index < count; index += 1) {
      const t = index / count
      const angle = t * Math.PI * 2 * 3.7
      const band = (index % 3) / 2
      const radius = 0.34 + Math.sin(index * 12.9898) * 0.08 + band * 0.08
      const y = -0.46 + ((index * 0.61803398875) % 1) * 1.34
      positions.push(Math.cos(angle) * radius, y, Math.sin(angle) * radius)
      phases.push(index * 1.71)
      speeds.push(0.12 + ((index * 7) % 11) * 0.012)
      sizes.push(0.42 + ((index * 13) % 9) * 0.08)
    }

    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
    geometry.setAttribute('aPhase', new Float32BufferAttribute(phases, 1))
    geometry.setAttribute('aSpeed', new Float32BufferAttribute(speeds, 1))
    geometry.setAttribute('aSize', new Float32BufferAttribute(sizes, 1))
    return geometry
  }, [])

  useFrame((state) => {
    const t = state.clock.elapsedTime
    hazeMaterial.uniforms.uTime.value = t
    hazeMaterial.uniforms.opacity.value = visible ? 0.44 : 0
    particlesMaterial.uniforms.uTime.value = t
    particlesMaterial.uniforms.uOpacity.value = visible ? 0.92 : 0
  })

  useEffect(() => () => {
    hazeMaterial.dispose()
    particlesMaterial.dispose()
    particleGeometry.dispose()
  }, [hazeMaterial, particlesMaterial, particleGeometry])

  return (
    <group>
      {[0, Math.PI / 3, -Math.PI / 3].map((rotationY) => (
        <mesh key={rotationY} position={[0, 0.28, 0]} rotation={[0, rotationY, 0]} scale={[1.28, 1.92, 1]} renderOrder={-2}>
          <planeGeometry args={[1, 1, 1, 1]} />
          <primitive object={hazeMaterial} attach="material" />
        </mesh>
      ))}
      <points geometry={particleGeometry} material={particlesMaterial} position={[0, 0.16, 0]} renderOrder={-1} />
    </group>
  )
}

// FBX2glTF exporte les translations en mètres, alors que three.FBXLoader (l'ancien
// chargement) les donnait en centimètres. Les pistes de position d'un GLB Mixamo sont
// donc 100x trop petites → le perso s'enfonce dans le sol. On les remet à l'échelle cm.
const MIXAMO_GLB_POSITION_SCALE = 100

// Anim issue d'un GLB Mixamo (converti depuis FBX via FBX2glTF, cf. scripts/convert-anims-glb.mjs) :
// - renormalise les noms de pistes (mixamorig:Hips.position -> mixamorigHips.position)
//   pour qu'ils correspondent aux os de l'avatar (cf. normalizeMixamoObjectName) ;
// - remet les translations à l'échelle cm (cf. MIXAMO_GLB_POSITION_SCALE).
function cloneMixamoAnimationClip(clip) {
  const next = clip.clone()
  next.tracks.forEach((track) => {
    track.name = normalizeMixamoObjectName(track.name)
    if (track.name.endsWith('.position')) {
      for (let i = 0; i < track.values.length; i += 1) {
        track.values[i] *= MIXAMO_GLB_POSITION_SCALE
      }
    }
  })
  next.tracks = next.tracks.filter((track) => !track.name.includes('Pinky'))
  return next
}

function filterAnimationClipTracksForObject(clip, object) {
  if (!clip || !object) return clip
  clip.tracks = clip.tracks.filter((track) => {
    const separatorIndex = track.name.lastIndexOf('.')
    if (separatorIndex <= 0) return true
    const targetName = track.name.slice(0, separatorIndex)
    return Boolean(object.getObjectByName?.(targetName))
  })
  return clip
}

// Charge un GLB d'animation Mixamo (converti via FBX2glTF) et renvoie un objet de
// même forme que l'ancien useFBX ({ animations: [clip] }), pistes renormalisées.
function useMixamoGlbAnimation(url) {
  const glb = useGLTF(url)
  return useMemo(
    () => ({ animations: glb.animations.map(cloneMixamoAnimationClip) }),
    [glb],
  )
}

function PlayerAvatar({
  motion,
  handBoneRef,
  mountProfileRef,
  equippedWeapon,
  appearance,
  currentZone,
}) {
  const { gl } = useThree()
  const { scene: modelScene } = useGLTF(PLAYER_MODEL_URL)
  const faceDetailsMask = useTexture(PLAYER_FACE_DETAILS_MASK_URL)
  // Animations en GLB (converties depuis FBX via FBX2glTF) : ~15 Mo de FBX -> ~1,5 Mo.
  const idle = useMixamoGlbAnimation('/models/player/anim/idle.glb')
  const walk = useMixamoGlbAnimation('/models/player/anim/walk.glb')
  const run = useMixamoGlbAnimation('/models/player/anim/run.glb')
  const kick = useMixamoGlbAnimation('/models/player/anim/kick.glb')
  const punch = useMixamoGlbAnimation('/models/player/anim/punch.glb')
  const wave = useMixamoGlbAnimation('/models/player/anim/waving.glb')
  const dance = useMixamoGlbAnimation('/models/player/anim/dance.glb')
  const pointingUp = useMixamoGlbAnimation('/models/player/anim/pointing-up.glb')
  const jumpStart = useMixamoGlbAnimation('/models/player/anim/jump-start.glb')
  const jumpLoop = useMixamoGlbAnimation('/models/player/anim/jump-loop.glb')
  const jumpLand = useMixamoGlbAnimation('/models/player/anim/jump-land.glb')
  const sitDown = useMixamoGlbAnimation('/models/player/anim/stand-to-sit.glb')
  const sittingIdle = useMixamoGlbAnimation('/models/player/anim/sitting-idle.glb')
  const standUp = useMixamoGlbAnimation('/models/player/anim/stand-up.glb')
  const avatar = useMemo(() => {
    const next = clone(modelScene)
    next.visible = false
    const maxAnisotropy = getCappedAnisotropy(gl)
    next.traverse((object) => {
      object.name = normalizeMixamoObjectName(object.name)
      if (object.name === 'Armature') {
        object.rotation.set(0, 0, 0)
        object.scale.set(1, 1, 1)
      }
      if (object instanceof Mesh) {
        object.castShadow = true
        object.receiveShadow = false
        object.frustumCulled = false
        object.material = Array.isArray(object.material)
          ? object.material.map((mat) => mat?.clone?.() ?? mat)
          : object.material?.clone?.() ?? object.material
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        materials.forEach((mat) => {
          if (!mat) return
          mat.userData.characterMaterialKey = getCharacterMaterialKey(mat.name)
          ;[mat.map, mat.normalMap, mat.roughnessMap, mat.metalnessMap, mat.emissiveMap].forEach((tex) => {
            if (tex) {
              tex.anisotropy = maxAnisotropy
              tex.needsUpdate = true
            }
          })
        })
      }
    })
    return next
  }, [modelScene, gl])

  useLayoutEffect(() => {
    const lightingLayer = currentZone === ZONES.outside ? OUTDOOR_LIGHT_LAYER : 0
    avatar.traverse((object) => {
      object.layers.set(lightingLayer)
    })
  }, [avatar, currentZone])

  useEffect(() => {
    if (!faceDetailsMask) return
    faceDetailsMask.flipY = false
    faceDetailsMask.minFilter = LinearFilter
    faceDetailsMask.magFilter = LinearFilter
    faceDetailsMask.needsUpdate = true
  }, [faceDetailsMask])

  // Uniforms de couleur par zone matériau — stables entre les deux effects
  const zoneColorRefs = useRef({})
  // Effect 1 : injecter le shader de recoloration une fois par matériau (au chargement du modèle)
  useEffect(() => {
    const app = appearance ?? CHARACTER_DEFAULT_APPEARANCE

    avatar.traverse((obj) => {
      if (!(obj instanceof Mesh)) return
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
      mats.forEach((mat) => {
        if (!mat || mat._tintRecolorApplied) return
        const materialKey = mat.userData.characterMaterialKey ?? getCharacterMaterialKey(mat.name)
        const colorKey = materialKey === 'pants_details'
          ? 'pantsColor'
          : CHARACTER_MATERIAL_COLOR_KEYS[materialKey]
        if (!colorKey) return

        const hex = app[colorKey] ?? CHARACTER_DEFAULT_APPEARANCE[colorKey] ?? '#808080'
        const colorUniform = { value: new Vector3(...charHexToVec(hex)) }
        if (!zoneColorRefs.current[colorKey]) {
          zoneColorRefs.current[colorKey] = colorUniform
        }
        if (materialKey === 'pants_details' && !zoneColorRefs.current.pantsDetailsColor) {
          const detailHex = app.pantsDetailsColor ?? CHARACTER_DEFAULT_APPEARANCE.pantsDetailsColor
          zoneColorRefs.current.pantsDetailsColor = { value: new Vector3(...charHexToVec(detailHex)) }
        }
        if (materialKey === 'skin') {
          if (!zoneColorRefs.current.eyeColor) {
            const eyeHex = app.eyeColor ?? CHARACTER_DEFAULT_APPEARANCE.eyeColor
            zoneColorRefs.current.eyeColor = { value: new Vector3(...charHexToVec(eyeHex)) }
          }
          if (!zoneColorRefs.current.eyebrowsColor) {
            const browHex = app.eyebrowsColor ?? CHARACTER_DEFAULT_APPEARANCE.eyebrowsColor
            zoneColorRefs.current.eyebrowsColor = { value: new Vector3(...charHexToVec(browHex)) }
          }
        }

        // Couleur de base bakée dans le GLSL (calcule le ratio une seule fois)
        const baseHex = materialKey === 'pants_details'
          ? CHARACTER_BASE_COLORS.pants
          : CHARACTER_BASE_COLORS[materialKey] ?? '#808080'
        const [bR, bG, bB] = charHexToVec(baseHex)
        const [dR, dG, dB] = charHexToVec(CHARACTER_BASE_COLORS.pants_detail_yellow)
        const [eR, eG, eB] = charHexToVec(CHARACTER_BASE_COLORS.eyes)
        const [yR, yG, yB] = charHexToVec(CHARACTER_BASE_COLORS.eyebrows)

        mat._tintRecolorApplied = true
        mat.color.set('#FFFFFF') // neutre — le shader applique la couleur via le ratio
        mat.stencilWrite = true
        mat.stencilRef = 1
        mat.stencilFunc = AlwaysStencilFunc
        mat.stencilFail = KeepStencilOp
        mat.stencilZFail = KeepStencilOp
        mat.stencilZPass = ReplaceStencilOp
        mat.customProgramCacheKey = () => `tint-recolor-${materialKey}-v3`
        mat.onBeforeCompile = (shader) => {
          shader.uniforms.uZoneColor = zoneColorRefs.current[colorKey]
          shader.uniforms.uDetailColor = zoneColorRefs.current.pantsDetailsColor ?? zoneColorRefs.current[colorKey]
          shader.uniforms.uEyeColor = zoneColorRefs.current.eyeColor ?? zoneColorRefs.current[colorKey]
          shader.uniforms.uBrowColor = zoneColorRefs.current.eyebrowsColor ?? zoneColorRefs.current[colorKey]
          shader.uniforms.uFaceDetailMask = { value: faceDetailsMask }
          shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', TINT_RECOLOR_UNIFORM_DECL)
            .replace(
              '#include <map_fragment>',
              materialKey === 'pants_details'
                ? makePantsDetailsTintApplyGlsl(bR, bG, bB, dR, dG, dB)
                : materialKey === 'skin'
                  ? makeSkinWithDetailsTintApplyGlsl(bR, bG, bB, eR, eG, eB, yR, yG, yB)
                : makeTintApplyGlsl(bR, bG, bB),
            )
        }
        mat.needsUpdate = true
      })
    })
  }, [avatar, faceDetailsMask])

  // Effect 2 : mettre à jour les uniforms quand l'apparence change (sans recompiler le shader)
  useEffect(() => {
    const app = appearance ?? CHARACTER_DEFAULT_APPEARANCE
    ;[
      ...Object.values(CHARACTER_MATERIAL_COLOR_KEYS),
      'eyeColor',
      'eyebrowsColor',
    ].forEach((colorKey) => {
      const ref = zoneColorRefs.current[colorKey]
      if (!ref) return
      const hex = app[colorKey] ?? CHARACTER_DEFAULT_APPEARANCE[colorKey] ?? '#808080'
      ref.value.set(...charHexToVec(hex))
    })
    avatar.traverse((obj) => {
      if (!(obj instanceof Mesh)) return
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
      mats.forEach((mat) => {
        if (!mat) return
        const materialKey = mat.userData.characterMaterialKey ?? getCharacterMaterialKey(mat.name)
        const colorKey = materialKey === 'pants_details'
          ? 'pantsDetailsColor'
          : CHARACTER_MATERIAL_COLOR_KEYS[materialKey]
        if (!colorKey) return
        const hasGoldCoat = Boolean(app.goldCoat)
        if ('metalness' in mat) mat.metalness = hasGoldCoat ? 0.08 : 0.05
        if ('roughness' in mat) mat.roughness = hasGoldCoat ? 0.07 : 0.62
        if ('emissive' in mat) mat.emissive.set('#000000')
        if ('emissiveIntensity' in mat) mat.emissiveIntensity = 0
        if ('envMapIntensity' in mat) mat.envMapIntensity = hasGoldCoat ? 2 : 1
        mat.needsUpdate = true
      })
    })
  }, [avatar, appearance])

  const animationClips = useMemo(() => {
    const hipsRestHeight = getHipsRestHeight(idle.animations[0])
    const clips = [
      { source: idle.animations[0], name: 'idle' },
      { source: walk.animations[0], name: 'walk' },
      { source: run.animations[0], name: 'run' },
      { source: kick.animations[0], name: 'kick' },
      { source: punch.animations[0], name: 'punch' },
      { source: wave.animations[0], name: 'wave' },
      { source: dance.animations[0], name: 'dance' },
      { source: pointingUp.animations[0], name: 'pointingUp' },
      { source: jumpStart.animations[0], name: 'jumpStart' },
      { source: jumpLoop.animations[0], name: 'fallingIdle' },
      { source: jumpLand.animations[0], name: 'jumpLand' },
      { source: sitDown.animations[0], name: 'sitDown' },
      { source: sittingIdle.animations[0], name: 'sittingIdle' },
      { source: sittingIdle.animations[0], name: 'mountedIdle' },
      { source: standUp.animations[0], name: 'standUp' },
    ]

    return clips
      .filter(({ source }) => source)
      .map(({ source, name }) => {
        const clip = source.clone()
        clip.name = name
        if (name === 'wave' || name === 'dance' || name === 'pointingUp') {
          lockEmoteHipsHeight(clip, hipsRestHeight)
        }
        if (name === 'sitDown' || name === 'sittingIdle' || name === 'mountedIdle' || name === 'standUp' || name === 'walk' || name === 'run') {
          lockHipsPlanarPosition(clip)
        }
        return filterAnimationClipTracksForObject(clip, avatar)
      })
  }, [avatar, idle.animations, walk.animations, run.animations, kick.animations, punch.animations, wave.animations, dance.animations, pointingUp.animations, jumpStart.animations, jumpLoop.animations, jumpLand.animations, sitDown.animations, sittingIdle.animations, standUp.animations])

  const { actions, mixer } = useAnimations(animationClips, avatar)
  const currentActionRef = useRef(null)
  const currentMotionRef = useRef(null)
  const revealFramesRef = useRef(0)
  const [avatarReady, setAvatarReady] = useState(false)

  const rightArmBoneRef = useRef(null)
  const rightForeArmBoneRef = useRef(null)
  const rightHandBoneRef = useRef(null)
  const leftArmBoneRef = useRef(null)
  const leftForeArmBoneRef = useRef(null)
  const leftHandBoneRef = useRef(null)
  const mountedSpineBoneRef = useRef(null)
  const mountedSpine0BoneRef = useRef(null)
  const mountedSpine1BoneRef = useRef(null)
  const mountedHeadBoneRef = useRef(null)
  const leftUpLegBoneRef = useRef(null)
  const rightUpLegBoneRef = useRef(null)
  const fingerBonesRef = useRef([])
  const mountedFingerPoseRef = useRef(new Map())
  const mountedArmScratch = useMemo(() => ({
    start: new Vector3(),
    end: new Vector3(),
    currentDirection: new Vector3(),
    targetDirection: new Vector3(),
    shoulder: new Vector3(),
    elbow: new Vector3(),
    hand: new Vector3(),
    shoulderToTarget: new Vector3(),
    targetAxis: new Vector3(),
    currentElbowDirection: new Vector3(),
    bendNormal: new Vector3(),
    bendDirection: new Vector3(),
    elbowTarget: new Vector3(),
    worldUp: new Vector3(0, 1, 0),
    deltaQuaternion: new Quaternion(),
    worldQuaternion: new Quaternion(),
    parentQuaternion: new Quaternion(),
  }), [])

  useEffect(() => {
    const fingers = []
    const mountedFingerPose = new Map()
    avatar.traverse((child) => {
      if (!child.isBone) return
      if (child.name === 'mixamorigLeftUpLeg') leftUpLegBoneRef.current = child
      else if (child.name === 'mixamorigRightUpLeg') rightUpLegBoneRef.current = child
      else if (child.name === 'mixamorigSpine') mountedSpine0BoneRef.current = child
      else if (child.name === 'mixamorigSpine1') mountedSpine1BoneRef.current = child
      else if (child.name === 'mixamorigSpine2') mountedSpineBoneRef.current = child
      else if (child.name === 'mixamorigHead') mountedHeadBoneRef.current = child
      else if (child.name === 'mixamorigLeftArm') leftArmBoneRef.current = child
      else if (child.name === 'mixamorigLeftForeArm') leftForeArmBoneRef.current = child
      else if (child.name === 'mixamorigLeftHand') leftHandBoneRef.current = child
      else if (child.name === 'mixamorigRightArm') rightArmBoneRef.current = child
      else if (child.name === 'mixamorigRightForeArm') rightForeArmBoneRef.current = child
      else if (child.name === 'mixamorigRightHand') {
        rightHandBoneRef.current = child
        if (handBoneRef) handBoneRef.current = child
      } else if (
        child.name.startsWith('mixamorigRightHand') ||
        child.name.startsWith('mixamorigLeftHand')
      ) {
        fingers.push(child)
        mountedFingerPose.set(child, child.quaternion.clone())
      }
    })
    fingerBonesRef.current = fingers
    mountedFingerPoseRef.current = mountedFingerPose
  }, [avatar, handBoneRef])

  useLayoutEffect(() => {
    avatar.visible = false
    currentActionRef.current = null
    currentMotionRef.current = null
    revealFramesRef.current = 0
    setAvatarReady(false)
  }, [avatar])

  const playMotion = (nextMotion) => {
    const nextAction = actions[nextMotion]
    const previousAction = currentActionRef.current
    const previousMotion = currentMotionRef.current

    if (!nextAction) return false

    if (previousAction === nextAction) return

    const isOneShot = nextMotion === 'kick' || nextMotion === 'punch' || nextMotion === 'pointingUp' || nextMotion === 'jumpStart' || nextMotion === 'jumpLand' || nextMotion === 'sitDown' || nextMotion === 'standUp'
    const fadeDuration =
      previousMotion === 'jumpStart' && nextMotion === 'fallingIdle'
        ? PLAYER_JUMP_TO_FALL_ANIMATION_FADE
        : nextMotion === 'sitDown' || nextMotion === 'standUp' || previousMotion === 'sittingIdle'
          ? 0.12
        : nextMotion === 'jumpLand'
        ? PLAYER_LANDING_ANIMATION_FADE
        : nextMotion === 'jumpStart' || nextMotion === 'fallingIdle'
          ? PLAYER_AIR_ANIMATION_FADE
          : PLAYER_DEFAULT_ANIMATION_FADE

    nextAction
      .reset()
      .setLoop(isOneShot ? LoopOnce : LoopRepeat, isOneShot ? 1 : Infinity)
      .setEffectiveWeight(1)
      .setEffectiveTimeScale(nextMotion === 'kick' ? 1.2 : nextMotion === 'punch' ? 1.35 : 1)
      .play()
    nextAction.clampWhenFinished = isOneShot

    if (previousAction) {
      avatar.visible = true
      nextAction.crossFadeFrom(previousAction, fadeDuration, false)
    } else {
      nextAction.setEffectiveWeight(1)
      mixer.update(0)
      avatar.updateMatrixWorld(true)
      avatar.visible = false
      setAvatarReady(false)
      revealFramesRef.current = 3
    }

    currentActionRef.current = nextAction
    currentMotionRef.current = nextMotion
    return true
  }

  useEffect(() => {
    if (currentActionRef.current || !actions[motion]) return
    playMotion(motion)
  }, [actions, motion])

  useFrame((state, delta) => {
    if (currentMotionRef.current !== motion) {
      playMotion(motion)
    }

    if (revealFramesRef.current <= 0) return
    revealFramesRef.current -= 1
    if (revealFramesRef.current <= 0 && currentActionRef.current) {
      mixer.update(0)
      avatar.updateMatrixWorld(true)
      avatar.visible = true
      setAvatarReady(true)
    }
  })

  useFrame(() => {
    if (equippedWeapon !== 'magic_book' && equippedWeapon !== 'magic_skull') return
    const arm = rightArmBoneRef.current
    const foreArm = rightForeArmBoneRef.current
    const hand = rightHandBoneRef.current
    // lerp 0.9 pour dominer l'animation de marche qui reécrit les rotations chaque frame
    if (arm) {
      arm.rotation.x = MathUtils.lerp(arm.rotation.x, -0.3, 0.9)
      arm.rotation.y = MathUtils.lerp(arm.rotation.y, -0.8, 0.9)  // twist coude vers le bas
      arm.rotation.z = MathUtils.lerp(arm.rotation.z, -1.0, 0.9)  // bras vers l'avant
    }
    if (foreArm) {
      foreArm.rotation.x = MathUtils.lerp(foreArm.rotation.x, -0.75, 0.9) // coude plié
      foreArm.rotation.y = MathUtils.lerp(foreArm.rotation.y, 1.5, 0.9)   // supination = paume vers le ciel
      foreArm.rotation.z = MathUtils.lerp(foreArm.rotation.z, 0.0, 0.9)
    }
    if (hand) {
      hand.rotation.x = MathUtils.lerp(hand.rotation.x, 0.0, 0.9)
      hand.rotation.y = MathUtils.lerp(hand.rotation.y, 1.6, 0.9)   // rotation poignet pour paume vers le haut
      hand.rotation.z = MathUtils.lerp(hand.rotation.z, 0.0, 0.9)
    }
    for (const finger of fingerBonesRef.current) {
      const isBase = finger.name.endsWith('1')
      const spread = isBase
        ? finger.name.includes('Index') ? -0.3
          : finger.name.includes('Pinky') ? 0.35
          : finger.name.includes('Ring') ? 0.18
          : finger.name.includes('Thumb') ? -0.2
          : 0.0
        : 0.0
      finger.rotation.x = MathUtils.lerp(finger.rotation.x, 0.25, 0.9)  // légère pliure
      finger.rotation.y = MathUtils.lerp(finger.rotation.y, spread, 0.9)
      finger.rotation.z = MathUtils.lerp(finger.rotation.z, 0.0, 0.9)
    }
  })

  useFrame(() => {
    if (motion !== 'mountedIdle') return
    const leftUpLeg = leftUpLegBoneRef.current
    const rightUpLeg = rightUpLegBoneRef.current
    if (!leftUpLeg || !rightUpLeg) return

    const mountWidth = MathUtils.clamp(
      mountProfileRef?.current?.width ?? DRAGON_RIDE_DEFAULT_BODY_WIDTH,
      DRAGON_RIDE_MIN_BODY_WIDTH,
      DRAGON_RIDE_MAX_BODY_WIDTH,
    )
    const spread = MathUtils.lerp(
      0.12,
      0.48,
      MathUtils.smoothstep(mountWidth, DRAGON_RIDE_MIN_BODY_WIDTH, DRAGON_RIDE_MAX_BODY_WIDTH),
    )
    leftUpLeg.rotation.z += spread
    rightUpLeg.rotation.z -= spread
  }, 0.25)

  useFrame(() => {
    const profile = mountProfileRef?.current
    if (
      motion !== 'mountedIdle' ||
      !profile?.handTargetsReady
    ) {
      return
    }

    // Lean from the base of the spine upward so the whole back tips forward as
    // a unit, rather than only hunching the upper spine/neck. Weight the lower
    // vertebrae most heavily.
    const torsoLean = profile.torsoLean ?? DRAGON_RIDE_TORSO_LEAN
    const spine0 = mountedSpine0BoneRef.current
    const spine1 = mountedSpine1BoneRef.current
    const spine2 = mountedSpineBoneRef.current
    if (spine0) spine0.rotation.x -= torsoLean * 0.5
    if (spine1) spine1.rotation.x -= torsoLean * 0.3
    if (spine2) spine2.rotation.x -= torsoLean * 0.2
    // Counter-rotate the head so the rider keeps looking forward despite the
    // forward lean of the whole spine.
    const head = mountedHeadBoneRef.current
    if (head) head.rotation.x += torsoLean
    if (spine0) spine0.updateWorldMatrix(true, true)
    else if (spine2) spine2.updateWorldMatrix(true, true)

    solveMountedArmIk(
      leftArmBoneRef.current,
      leftForeArmBoneRef.current,
      leftHandBoneRef.current,
      profile.rightHandTarget,
      mountedArmScratch,
    )
    solveMountedArmIk(
      rightArmBoneRef.current,
      rightForeArmBoneRef.current,
      rightHandBoneRef.current,
      profile.leftHandTarget,
      mountedArmScratch,
    )

    for (const finger of fingerBonesRef.current) {
      const lockedPose = mountedFingerPoseRef.current.get(finger)
      if (!lockedPose) continue
      finger.quaternion.copy(lockedPose)
      const isThumb = finger.name.includes('Thumb')
      finger.rotateX(
        isThumb
          ? 0.18
          : finger.name.endsWith('1')
            ? 0.38
            : 0.24,
      )
    }
  }, 0.65)

  return (
    <group>
      <CharacterAuraGlow visible={avatarReady && appearance?.auraEquipped} />
      <primitive
        object={avatar}
        position={[0, -PLAYER_HEIGHT + PLAYER_MODEL_VERTICAL_OFFSET, 0]}
        rotation={[0, 0, 0]}
        scale={PLAYER_MODEL_SCALE}
        visible={avatarReady}
      />
    </group>
  )
}

function MagicBookMesh() {
  const { scene } = useGLTF(MAGIC_BOOK_MODEL_URL)
  const bookScene = useMemo(() => {
    const next = scene.clone(true)
    next.traverse((child) => {
      if (child instanceof Mesh) {
        child.castShadow = true
        child.frustumCulled = false
      }
    })
    return next
  }, [scene])
  return <primitive object={bookScene} scale={0.35} />
}

function FloatingMagicBook({ active, handBoneRef, playerGroupRef }) {
  const groupRef = useRef(null)
  const worldPos = useRef(new Vector3())
  const localTarget = useRef(new Vector3(0.4, 0.9, 0))

  useFrame((state, delta) => {
    const g = groupRef.current
    if (!g) return
    if (!active) {
      g.position.set(0, -500, 0)
      return
    }

    const hand = handBoneRef?.current
    const playerGroup = playerGroupRef?.current

    if (hand && playerGroup) {
      hand.getWorldPosition(worldPos.current)
      playerGroup.worldToLocal(worldPos.current)
      localTarget.current.set(
        worldPos.current.x,
        worldPos.current.y + 0.18 + Math.sin(state.clock.elapsedTime * 2.5) * 0.04,
        worldPos.current.z + 0.18,
      )
    } else {
      localTarget.current.set(
        0.4,
        0.9 + Math.sin(state.clock.elapsedTime * 2.5) * 0.04,
        0.1,
      )
    }

    g.position.lerp(localTarget.current, 0.18)
    g.rotation.y = Math.PI
  })

  return (
    <group ref={groupRef} position={[0.4, 0.9, 0]}>
      <Suspense fallback={null}>
        <MagicBookMesh />
      </Suspense>
      <pointLight color="#ff5a00" intensity={active ? 1.35 : 0} distance={2.7} />
    </group>
  )
}

function MagicSkullMesh() {
  const { scene } = useGLTF(MAGIC_SKULL_MODEL_URL)
  const skullScene = useMemo(() => {
    const next = scene.clone(true)
    next.traverse((child) => {
      if (child instanceof Mesh) {
        child.castShadow = true
        child.frustumCulled = false
      }
    })
    return next
  }, [scene])
  // Normalise l'échelle du modèle (taille inconnue) vers une hauteur de main
  const fitScale = useMemo(() => {
    const box = new Box3().setFromObject(skullScene)
    const size = box.getSize(new Vector3())
    const target = 0.2
    return target / Math.max(size.x, size.y, size.z, 0.001)
  }, [skullScene])
  return <primitive object={skullScene} scale={fitScale} />
}

function FloatingMagicSkull({ active, handBoneRef, playerGroupRef }) {
  const groupRef = useRef(null)
  const worldPos = useRef(new Vector3())
  const localTarget = useRef(new Vector3(0.4, 0.9, 0))
  const necroParticlePreset = useStoredParticlePreset(NECRO_WEAPON_PARTICLE_NAME)

  useFrame((state, delta) => {
    const g = groupRef.current
    if (!g) return
    if (!active) {
      g.position.set(0, -500, 0)
      return
    }

    const hand = handBoneRef?.current
    const playerGroup = playerGroupRef?.current

    if (hand && playerGroup) {
      hand.getWorldPosition(worldPos.current)
      playerGroup.worldToLocal(worldPos.current)
      localTarget.current.set(
        worldPos.current.x,
        worldPos.current.y + 0.2 + Math.sin(state.clock.elapsedTime * 2.2) * 0.05,
        worldPos.current.z + 0.18,
      )
    } else {
      localTarget.current.set(
        0.4,
        0.9 + Math.sin(state.clock.elapsedTime * 2.2) * 0.05,
        0.1,
      )
    }

    g.position.lerp(localTarget.current, 0.18)
    g.rotation.y = Math.PI
  })

  return (
    <group ref={groupRef} position={[0.4, 0.9, 0]}>
      <Suspense fallback={null}>
        <MagicSkullMesh />
      </Suspense>
      <RuntimeParticleEffect
        preset={necroParticlePreset}
        playing={active}
        loop
        layer={OUTDOOR_LIGHT_LAYER}
      />
      <pointLight color="#8b5cf6" intensity={active ? 1.2 : 0} distance={2.7} />
    </group>
  )
}

// Pre-allocated geometries — created once, shared by all fireball instances.
// Avoids per-cast GPU upload stutter.
function MagicSkullDiscovery({ discovered, isNear }) {
  const skullRef = useRef(null)
  const necroParticlePreset = useStoredParticlePreset(NECRO_WEAPON_PARTICLE_NAME)

  useFrame((state) => {
    if (!skullRef.current || !MAGIC_SKULL_DISCOVERY_POSITION) return
    skullRef.current.position.y = Math.sin(state.clock.elapsedTime * 2.2) * 0.055
    skullRef.current.rotation.y = Math.PI + state.clock.elapsedTime * 0.45
  })

  if (!MAGIC_SKULL_DISCOVERY_POSITION) return null

  const [x, y, z] = MAGIC_SKULL_DISCOVERY_POSITION

  return (
    <>
      <group position={[x, y, z]} userData={{ debugCategory: 'interactions' }}>
        <group ref={skullRef} scale={1.65}>
          <Suspense fallback={null}>
            <MagicSkullMesh />
          </Suspense>
          <RuntimeParticleEffect
            preset={necroParticlePreset}
            playing
            loop
            layer={OUTDOOR_LIGHT_LAYER}
          />
        </group>
        {!discovered && (
          <RuntimeParticleEffect
            preset={INTERACTION_PARTICLE_PRESET}
            playing
            loop
            layer={OUTDOOR_LIGHT_LAYER}
          />
        )}
        <pointLight color="#9f7aea" intensity={discovered ? 0.65 : isNear ? 2.5 : 1.35} distance={4.5} decay={2} />
      </group>
      {!discovered && (
        <InteractionHalo
          isNear={isNear}
          color="#b69cff"
          pulseColor="#e8ddff"
          position={[x, y - 0.28, z]}
          size={0.7}
        />
      )}
    </>
  )
}

function MagicSkullDiscoveryTrigger({ playerPositionRef, enabled, onNearChange }) {
  const wasNearRef = useRef(false)

  useFrame(() => {
    if (!enabled || !MAGIC_SKULL_DISCOVERY_POSITION) {
      if (wasNearRef.current) {
        wasNearRef.current = false
        onNearChange(false)
      }
      return
    }

    const p = playerPositionRef.current
    const [x, y, z] = MAGIC_SKULL_DISCOVERY_POSITION
    const distance = Math.hypot(p.x - x, p.y - y, p.z - z)
    const near = distance < MAGIC_SKULL_LEARN_INTERACTION_DISTANCE
    if (near !== wasNearRef.current) {
      wasNearRef.current = near
      onNearChange(near)
    }
  })

  return null
}

const FIREBALL_GEO_CORE = new SphereGeometry(0.08, 16, 16)
const FIREBALL_GEO_GLOW = new SphereGeometry(0.13, 18, 18)
const FIREBALL_GEO_SHELL = new SphereGeometry(0.18, 32, 32)
const FIREBALL_GEO_CHARGE_CORE = new SphereGeometry(0.08, 14, 14)
const FIREBALL_GEO_IMPACT_SPHERE = new SphereGeometry(0.14, 14, 14)
const FIREBALL_GEO_IMPACT_RING = new RingGeometry(0.12, 0.2, 32)

// Shared materials for projectile core/glow (opacity never changes)
const FIREBALL_MAT_CORE = new MeshBasicMaterial({ color: '#fff2aa', toneMapped: false })
const FIREBALL_MAT_GLOW = new MeshBasicMaterial({ color: '#ffb31a', transparent: true, opacity: 0.48, depthWrite: false, toneMapped: false, blending: AdditiveBlending })

const fireballFlameVertexShader = `
  varying vec3 vLocalPosition;
  varying vec3 vViewNormal;
  varying vec3 vViewDirection;

  uniform float uTime;
  uniform float uDistortion;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  vec3 fade(vec3 f) {
    return f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  }

  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = fade(f);

    return mix(
      mix(
        mix(hash(i + vec3(0.0, 0.0, 0.0)), hash(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x),
        f.y
      ),
      mix(
        mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x),
        f.y
      ),
      f.z
    );
  }

  float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.5;

    for (int i = 0; i < 4; i++) {
      value += amplitude * noise(p);
      p = p * 2.03 + vec3(13.7, 7.1, 4.9);
      amplitude *= 0.5;
    }

    return value;
  }

  float ridgedFbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.5;

    for (int i = 0; i < 3; i++) {
      float n = noise(p);
      n = 1.0 - abs(n * 2.0 - 1.0);
      value += n * amplitude;
      p = p * 2.18 + vec3(5.2, 1.3, 9.4);
      amplitude *= 0.52;
    }

    return value;
  }

  vec2 rotate2d(vec2 p, float angle) {
    float s = sin(angle);
    float c = cos(angle);
    return mat2(c, -s, s, c) * p;
  }

  void main() {
    vLocalPosition = position;

    vec3 flowPosition = position;
    flowPosition.xz = rotate2d(flowPosition.xz, noise(position * 2.1 + uTime * 0.3) * 1.8);
    flowPosition.y += uTime * 0.42;

    float body = fbm(flowPosition * 3.2 + vec3(0.0, uTime * 1.9, 0.0));
    float tongues = ridgedFbm(flowPosition * 6.8 + vec3(uTime * 0.3, -uTime * 2.8, uTime * 0.18));
    float displacement = ((body - 0.34) * 0.74 + tongues * 0.46) * uDistortion;
    vec3 displaced = position + normal * displacement;

    vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
    vViewNormal = normalize(normalMatrix * normal);
    vViewDirection = normalize(-mvPosition.xyz);

    gl_Position = projectionMatrix * mvPosition;
  }
`

const fireballFlameFragmentShader = `
  varying vec3 vLocalPosition;
  varying vec3 vViewNormal;
  varying vec3 vViewDirection;

  uniform float uTime;
  uniform float uOpacity;
  uniform float uRadius;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  vec3 fade(vec3 f) {
    return f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  }

  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = fade(f);

    return mix(
      mix(
        mix(hash(i + vec3(0.0, 0.0, 0.0)), hash(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x),
        f.y
      ),
      mix(
        mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x),
        f.y
      ),
      f.z
    );
  }

  float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.5;

    for (int i = 0; i < 4; i++) {
      value += amplitude * noise(p);
      p = p * 2.03 + vec3(11.7, 3.1, 8.3);
      amplitude *= 0.5;
    }

    return value;
  }

  float turbulence(vec3 p) {
    float value = 0.0;
    float amplitude = 0.5;

    for (int i = 0; i < 4; i++) {
      value += abs(noise(p) * 2.0 - 1.0) * amplitude;
      p = p * 2.11 + vec3(6.4, 2.8, 12.1);
      amplitude *= 0.48;
    }

    return value;
  }

  float ridgedFbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.55;

    for (int i = 0; i < 4; i++) {
      float n = noise(p);
      n = 1.0 - abs(n * 2.0 - 1.0);
      n *= n;
      value += n * amplitude;
      p = p * 2.17 + vec3(4.2, 10.8, 1.7);
      amplitude *= 0.5;
    }

    return value;
  }

  vec2 rotate2d(vec2 p, float angle) {
    float s = sin(angle);
    float c = cos(angle);
    return mat2(c, -s, s, c) * p;
  }

  void main() {
    vec3 normal = normalize(vViewNormal);
    vec3 viewDirection = normalize(vViewDirection);
    float fresnel = pow(1.0 - max(dot(normal, viewDirection), 0.0), 1.25);
    float radial = clamp(length(vLocalPosition) / max(uRadius, 0.001), 0.0, 1.0);

    vec3 flowPosition = vLocalPosition;
    float swirl = fbm(flowPosition * 2.1 + vec3(0.0, uTime * 0.55, 0.0));
    flowPosition.xz = rotate2d(flowPosition.xz, (swirl - 0.5) * 2.3 + uTime * 0.28);
    flowPosition.y += uTime * 0.62;

    float body = fbm(flowPosition * 3.35 + vec3(uTime * 0.15, uTime * 2.25, -uTime * 0.08));
    float flameTongues = ridgedFbm(flowPosition * 6.8 + vec3(-uTime * 0.38, uTime * 3.55, uTime * 0.24));
    float tornEdge = turbulence(flowPosition * 9.4 + vec3(uTime * 0.9, -uTime * 2.2, uTime * 0.35));
    float fireNoise = body * 0.48 + flameTongues * 0.42 + (1.0 - tornEdge) * 0.1;
    float innerHeat = smoothstep(0.92, 0.18, radial);
    float heat = smoothstep(0.12, 1.0, fireNoise + fresnel * 0.36 + innerHeat * 0.34);

    vec3 hotColor = vec3(1.0, 0.92, 0.38);
    vec3 midColor = vec3(1.0, 0.28, 0.02);
    vec3 darkColor = vec3(0.42, 0.025, 0.0);

    vec3 color = mix(darkColor, midColor, heat);
    color = mix(color, hotColor, smoothstep(0.72, 1.0, heat));

    float holes = smoothstep(0.36, 0.72, tornEdge - body * 0.18);
    float edgeBreakup = smoothstep(0.18, 0.94, fireNoise + fresnel * 0.32);
    float shellFade = smoothstep(0.08, 0.92, radial) * (1.0 - smoothstep(1.08, 1.26, radial));
    float alpha = edgeBreakup * shellFade * (1.0 - holes * 0.42) * uOpacity;

    if (alpha < 0.025) discard;
    gl_FragColor = vec4(color, alpha);
  }
`

// IMPORTANT PERF NOTE:
// The first-cast freeze was caused by spell meshes/materials being "preloaded"
// but hidden with visible={false} or mounted only when the spell started.
// Three.js skips invisible objects during shader/program compilation, so the
// first real cast paid the WebGL getProgramParameter/getProgramInfoLog cost on
// the main thread. For runtime effects that must be warm, keep them mounted and
// renderable off-camera, then disable them with opacity/intensity/position.
// Do not replace this with conditional mount/unmount or visible={false}.
function FireballFlameShell({ radius = 0.34, opacity = 0.85, phase = 0, wake = false, active = true }) {
  const meshRef = useRef(null)
  const materialRef = useRef(null)
  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uOpacity: { value: opacity },
    uRadius: { value: radius },
    uDistortion: { value: wake ? 0.045 : 0.075 },
  }), [opacity, radius, wake])

  useFrame((state) => {
    const t = state.clock.elapsedTime + phase
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = t
      materialRef.current.uniforms.uOpacity.value = active ? opacity : 0
    }
    if (!active) return

    if (meshRef.current) {
      meshRef.current.rotation.x += wake ? 0.025 : 0.035
      meshRef.current.rotation.y += wake ? -0.042 : 0.058
      meshRef.current.scale.set(
        (wake ? 0.9 : 1.06) + Math.sin(t * 17.0) * 0.08,
        (wake ? 0.7 : 0.86) + Math.cos(t * 14.0) * 0.07,
        (wake ? 1.25 : 1.15) + Math.sin(t * 12.0) * 0.08,
      )
    }
  })

  return (
    <mesh ref={meshRef}>
      <primitive object={FIREBALL_GEO_SHELL} attach="geometry" />
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={fireballFlameVertexShader}
        fragmentShader={fireballFlameFragmentShader}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
        side={DoubleSide}
        toneMapped={false}
      />
    </mesh>
  )
}

function FireballProjectileSlot({ projectile }) {
  const groupRef = useRef(null)
  const coreRef = useRef(null)
  const active = Boolean(projectile)

  useFrame((state) => {
    if (!projectile) {
      if (groupRef.current) groupRef.current.position.set(0, -500, 0)
      return
    }

    const t = state.clock.elapsedTime + (projectile.phase ?? 0)
    if (groupRef.current) {
      groupRef.current.position.set(projectile.x, projectile.y, projectile.z)
      groupRef.current.rotation.z = 0
    }
    if (coreRef.current) {
      const pulse = 1 + Math.sin(t * 24) * 0.07
      coreRef.current.scale.setScalar(pulse)
    }
  })

  return (
    <group ref={groupRef} position={[0, -500, 0]}>
      <mesh ref={coreRef}>
        <primitive object={FIREBALL_GEO_CORE} attach="geometry" />
        <primitive object={FIREBALL_MAT_CORE} attach="material" />
      </mesh>
      <mesh>
        <primitive object={FIREBALL_GEO_GLOW} attach="geometry" />
        <primitive object={FIREBALL_MAT_GLOW} attach="material" />
      </mesh>
      <FireballFlameShell radius={0.18} opacity={0.62} phase={projectile?.phase ?? 0} active={active} />
      <pointLight color="#ff7a00" intensity={active ? 1.2 : 0} distance={2.6} />
    </group>
  )
}

function ChargingFireball({ active, playerPositionRef, touchRef, chargeYawRef, chargeAimYawRef, chargeProgressRef, chargeStartTimeRef, chargePosRef, setChargeProgress, onCancel, onLaunch }) {
  const groupRef = useRef(null)
  const frameRef = useRef(0)
  const launchedRef = useRef(false)
  const phase = useMemo(() => Math.random() * Math.PI * 2, [])

  useEffect(() => {
    if (!active && groupRef.current) {
      groupRef.current.position.set(0, -500, 0)
      groupRef.current.scale.setScalar(1)
    }
    if (active) {
      launchedRef.current = false
      frameRef.current = 0
    }
  }, [active])

  useFrame(() => {
    const g = groupRef.current
    if (!g || !active || launchedRef.current) return
    const elapsed = Date.now() - chargeStartTimeRef.current
    const progress = Math.min(elapsed / CHARGE_TIME_MS, 1.0)
    chargeProgressRef.current = progress

    // Annuler si le joueur bouge
    const pos = playerPositionRef.current
    const start = chargePosRef.current
    if (Math.hypot(pos.x - start.x, pos.z - start.z) > 0.12) { onCancel(); return }

    // Auto-lancement à 100%
    if (progress >= 1.0) {
      launchedRef.current = true
      onLaunch()
      return
    }

    // Clamper la direction caméra dans un cône ±90° autour du "devant"
    const rawYaw = touchRef.current?.cameraYaw ?? chargeYawRef.current
    const center = chargeYawRef.current
    let diff = rawYaw - center
    while (diff > Math.PI) diff -= 2 * Math.PI
    while (diff < -Math.PI) diff += 2 * Math.PI
    diff = Math.max(-Math.PI / 4, Math.min(Math.PI / 4, diff)) // ±45°
    const yaw = center + diff
    chargeAimYawRef.current = yaw

    // Mettre à jour la barre (throttlé)
    frameRef.current++
    if (frameRef.current % 2 === 0) setChargeProgress(progress)

    // Positionner la boule dans le cône devant le joueur, plus basse
    g.position.set(pos.x - Math.sin(yaw) * 0.85, pos.y + 0.3, pos.z - Math.cos(yaw) * 0.85)
    g.scale.setScalar(0.12 + progress * 1.3)
  })

  return (
    <group ref={groupRef} position={[0, -500, 0]}>
      <mesh>
        <primitive object={FIREBALL_GEO_CHARGE_CORE} attach="geometry" />
        <primitive object={FIREBALL_MAT_CORE} attach="material" />
      </mesh>
      <FireballFlameShell radius={0.18} opacity={0.75} phase={phase} active={active} />
      <pointLight color="#ff7a00" intensity={active ? 1.0 : 0} distance={2.5} />
    </group>
  )
}

function FireballImpactSlot({ impact }) {
  const active = Boolean(impact)
  const age = active ? MathUtils.clamp((Date.now() - impact.createdAt) / 520, 0, 1) : 1
  const flashScale = 0.5 + age * 1.05
  return (
    <group position={active ? [impact.x, impact.y, impact.z] : [0, -500, 0]}>
      <mesh scale={flashScale}>
        <primitive object={FIREBALL_GEO_IMPACT_SPHERE} attach="geometry" />
        <meshBasicMaterial color="#fff1a6" transparent opacity={(1 - age) * 0.44} depthWrite={false} toneMapped={false} blending={AdditiveBlending} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} scale={0.55 + age * 1.35}>
        <primitive object={FIREBALL_GEO_IMPACT_RING} attach="geometry" />
        <meshBasicMaterial color="#ff6a00" transparent opacity={(1 - age) * 0.24} depthWrite={false} toneMapped={false} blending={AdditiveBlending} />
      </mesh>
      <pointLight color="#ff7a00" intensity={(1 - age) * 0.85} distance={1.8} />
      <Html position={[0, 0.5 + age * 1.2, 0]} center occlude={false}>
        <div style={{ color: '#ff3300', fontWeight: 'bold', fontSize: '22px', opacity: active ? 1 - age : 0, textShadow: '0 0 6px #000, 0 0 3px #000', pointerEvents: 'none', userSelect: 'none', whiteSpace: 'nowrap' }}>
          -{FIREBALL_DAMAGE}
        </div>
      </Html>
    </group>
  )
}

function FireballWarmup() {
  const groupRef = useRef(null)
  const { camera, gl } = useThree()
  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uOpacity: { value: 0 },
    uRadius: { value: 0.18 },
    uDistortion: { value: 0.075 },
  }), [])

  useEffect(() => {
    if (!groupRef.current) return
    gl.compile(groupRef.current, camera)
    groupRef.current.visible = false
  }, [camera, gl])

  return (
    <group ref={groupRef} position={[0, -500, 0]} scale={0.0001} frustumCulled={false}>
      <mesh frustumCulled={false}>
        <primitive object={FIREBALL_GEO_CORE} attach="geometry" />
        <primitive object={FIREBALL_MAT_CORE} attach="material" />
      </mesh>
      <mesh frustumCulled={false}>
        <primitive object={FIREBALL_GEO_GLOW} attach="geometry" />
        <primitive object={FIREBALL_MAT_GLOW} attach="material" />
      </mesh>
      <mesh frustumCulled={false}>
        <primitive object={FIREBALL_GEO_SHELL} attach="geometry" />
        <shaderMaterial
          uniforms={uniforms}
          vertexShader={fireballFlameVertexShader}
          fragmentShader={fireballFlameFragmentShader}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
          side={DoubleSide}
          toneMapped={false}
        />
      </mesh>
      <mesh frustumCulled={false}>
        <primitive object={FIREBALL_GEO_IMPACT_SPHERE} attach="geometry" />
        <meshBasicMaterial color="#fff1a6" transparent opacity={0} depthWrite={false} toneMapped={false} blending={AdditiveBlending} />
      </mesh>
      <mesh frustumCulled={false}>
        <primitive object={FIREBALL_GEO_IMPACT_RING} attach="geometry" />
        <meshBasicMaterial color="#ff6a00" transparent opacity={0} depthWrite={false} toneMapped={false} blending={AdditiveBlending} />
      </mesh>
    </group>
  )
}

function RuntimeWarmupRig() {
  const exteriorWallTexture = useTexture(EXTERIOR_WALL_TEXTURE)

  return (
    <group position={[0, -500, 0]} scale={0.001} frustumCulled={false} userData={{ debugCategory: 'warmup' }}>
      <Suspense fallback={null}>
        <MagicBookMesh />
      </Suspense>
      <MergedPlayerExteriorShell />
      <GableRoof
        width={MAIN_ROOM.width}
        depth={MAIN_ROOM.depth}
        wallTopY={MAIN_ROOM.height}
        gableBaseY={MAIN_ROOM.height}
        pitch={32}
        overhang={0.42}
        thickness={0.14}
        wallThickness={houseLayout.wallThickness}
        color="#8b4c3f"
        gableColor={EXTERIOR_WALL_COLOR}
        gableTexture={exteriorWallTexture}
      />
      <group position={secondRoom.position}>
        <LeanToRoof
          width={secondRoom.size[0]}
          depth={secondRoom.size[2]}
          wallTopY={secondRoom.size[1]}
          attachSide="south"
          rise={MAIN_ROOM.height - secondRoom.size[1]}
          overhang={0.34}
          overhangAttached={0}
          thickness={0.12}
          wallThickness={houseLayout.wallThickness}
          color="#8b4c3f"
          gableColor={EXTERIOR_WALL_COLOR}
          gableTexture={exteriorWallTexture}
        />
      </group>
      <gridHelper
        args={[MAIN_ROOM.width, MAIN_ROOM.width / CUSTOM_GRID_SIZE, '#f2c14e', '#d8e0e8']}
        position={[0, 0.032, 0]}
      />
      <RoomBorder width={MAIN_ROOM.width} depth={MAIN_ROOM.depth} />
      <RoomBorder
        width={secondRoom.size[0]}
        depth={secondRoom.size[2]}
        posX={secondRoom.position[0]}
        posZ={secondRoom.position[2]}
      />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.028, 0]} frustumCulled={false}>
        <planeGeometry args={[PLAYER_PLOT_SIZE + 4, PLAYER_PLOT_SIZE + 4]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.035, 0]} frustumCulled={false}>
        <ringGeometry args={[0.62, 0.68, 36]} />
        <meshBasicMaterial color="#ffd447" transparent opacity={0.95} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.045, 0]} frustumCulled={false}>
        <ringGeometry args={[1.08, 1.16, 40]} />
        <meshBasicMaterial color="#66ff9a" transparent opacity={0.92} />
      </mesh>
      <pointLight color="#ff5a00" intensity={1.35} distance={2.7} />
    </group>
  )
}

function FireballManager({ projectilesRef, combatTargetsRef, playerTargetIdRef = null }) {
  const [, setRenderTick] = useState(0)
  const impactsRef = useRef([])
  const hadVisualsRef = useRef(false)

  useFrame((_, delta) => {
    const now = Date.now()
    const projs = projectilesRef.current
    const hadVisuals = hadVisualsRef.current || projs.length > 0 || impactsRef.current.length > 0
    const next = []

    for (const p of projs) {
      if (now - p.startedAt > FIREBALL_LIFETIME_MS) continue
      const nx = p.x + p.dirX * FIREBALL_SPEED * delta
      const nz = p.z + p.dirZ * FIREBALL_SPEED * delta
      let hit = false
      if (combatTargetsRef?.current) {
        for (const [tid, target] of combatTargetsRef.current) {
          if (!target?.position || target.disabled) continue
          const dx = nx - target.position.x
          const dz = nz - target.position.z
          if (Math.hypot(dx, dz) < FIREBALL_COLLISION_RADIUS) {
            target.takeDamage?.({ damage: FIREBALL_DAMAGE, attackerId: 'player' })
            if (playerTargetIdRef) playerTargetIdRef.current = tid
            hit = true
            impactsRef.current.push({
              id: `imp_${now}_${Math.random().toString(36).slice(2, 5)}`,
              x: nx, y: p.y + 0.8, z: nz,
              createdAt: now,
            })
            break
          }
        }
      }
      if (!hit) {
        next.push({ ...p, x: nx, z: nz })
      }
    }

    impactsRef.current = impactsRef.current.filter((imp) => now - imp.createdAt < 520)
    projectilesRef.current = next
    const hasVisuals = next.length > 0 || impactsRef.current.length > 0
    if (hadVisuals || hasVisuals) {
      hadVisualsRef.current = hasVisuals
      setRenderTick((t) => t + 1)
    }
  })

  const projs = projectilesRef.current
  const impacts = impactsRef.current

  return (
    <>
      <FireballWarmup />
      {FIREBALL_PROJECTILE_POOL.map((slot) => (
        <FireballProjectileSlot key={`fireball_slot_${slot}`} projectile={projs[slot] ?? null} />
      ))}
      {FIREBALL_IMPACT_POOL.map((slot) => (
        <FireballImpactSlot key={`fireball_impact_slot_${slot}`} impact={impacts[slot] ?? null} />
      ))}
    </>
  )
}

function ChatBubbles({ bubblesRef, version = 0 }) {
  const bubbles = bubblesRef.current
  if (!bubbles.length) return null

  return (
    <Html position={[0, 1.08, 0]} distanceFactor={8} zIndexRange={WORLD_CHAT_Z_INDEX_RANGE}>
      <div className="chat-bubble-stack" data-version={version}>
        {bubbles.map((bubble) => (
          <div key={bubble.id} className="chat-bubble">
            {bubble.text}
          </div>
        ))}
      </div>
    </Html>
  )
}

function PlayerChatAnchor({ playerPositionRef, bubblesRef, version }) {
  const groupRef = useRef(null)

  useFrame(() => {
    const group = groupRef.current
    const position = playerPositionRef.current
    if (!group || !position) return
    group.position.set(position.x, position.y, position.z)
  })

  return (
    <group ref={groupRef}>
      <ChatBubbles bubblesRef={bubblesRef} version={version} />
    </group>
  )
}

function PlayerNameplateAnchor({ playerPositionRef, label, title }) {
  const groupRef = useRef(null)
  const rarity = getTitleRarity(title)

  useFrame(() => {
    const group = groupRef.current
    const position = playerPositionRef.current
    if (!group || !position) return
    group.position.set(position.x, position.y, position.z)
  })

  if (!label && !title) return null

  return (
    <group ref={groupRef}>
      <Html position={[0, 1.08, 0]} center distanceFactor={8} zIndexRange={WORLD_NAMEPLATE_Z_INDEX_RANGE}>
        <div className="remote-player-nameplate">
          {label && <div className="remote-player-label">{label}</div>}
          {title && (
            <div className="remote-player-title" style={{ '--title-color': rarity.color }}>
              {title.name}
            </div>
          )}
        </div>
      </Html>
    </group>
  )
}

function RemotePlayer({
  stateRef,
  label = 'Visiteur',
  fallbackTitleId = null,
  transport = 'none',
  currentZone = ZONES.interior,
  serverTimeOffsetRef = null,
  chatBubblesRef = null,
  chatVersion = 0,
  showOverlays = true,
}) {
  const rootRef = useRef(null)
  const groupRef = useRef(null)
  const samplesRef = useRef([])
  const lastSeqRef = useRef(-1)
  const displayedMotionRef = useRef('idle')
  const motionSwitchAtRef = useRef(0)
  const displayedTitleIdRef = useRef(stateRef.current?.equippedTitleId ?? null)
  const displayedEquippedWeaponRef = useRef(stateRef.current?.equippedWeapon ?? null)
  const displayedAppearanceRef = useRef(stateRef.current?.characterAppearance ?? null)
  const [displayedMotion, setDisplayedMotion] = useState('idle')
  const [displayedTitleId, setDisplayedTitleId] = useState(stateRef.current?.equippedTitleId ?? null)
  const [displayedEquippedWeapon, setDisplayedEquippedWeapon] = useState(stateRef.current?.equippedWeapon ?? null)
  const [displayedAppearance, setDisplayedAppearance] = useState(stateRef.current?.characterAppearance ?? null)
  const targetRef = useRef({
    position: stateRef.current?.position ?? [0, PLAYER_HEIGHT, 2.2],
    rotationY: stateRef.current?.rotationY ?? 0,
    velocity: [0, 0, 0],
    receivedAt: Date.now(),
    motion: 'idle',
  })
  // Remote mount (the creature this player rides), driven by networked state.
  const remoteMountPosRef = useRef({ x: 0, y: 0, z: 0 })
  const remoteMountYawRef = useRef(0)
  const remoteMountAnimRef = useRef({ airborne: false, moving: false, movingForward: false, jumping: false })
  const remoteMountRiderTransformRef = useRef({ position: new Vector3(), quaternion: new Quaternion(), ready: false })
  const remoteMountSocketRef = useRef(null)
  const remoteMountedPlayerPosition = useMemo(() => new Vector3(), [])
  const remoteMountedSocketQuaternion = useMemo(() => new Quaternion(), [])
  const remoteMountedLiftOffset = useMemo(() => new Vector3(), [])
  const remoteMountProfileRef = useRef({
    width: DRAGON_RIDE_DEFAULT_BODY_WIDTH,
    riderLift: DRAGON_RIDE_RIDER_LIFT,
    leftHandTarget: new Vector3(),
    rightHandTarget: new Vector3(),
    leftHandLocalTarget: new Vector3(),
    rightHandLocalTarget: new Vector3(),
    handTargetsReady: false,
    handTargetsMeasured: false,
    seatHeightMeasured: false,
    ready: false,
  })
  const remoteMountInitRef = useRef(false)
  const displayedMountIdRef = useRef(stateRef.current?.mount?.id ?? null)
  const [displayedMountId, setDisplayedMountId] = useState(stateRef.current?.mount?.id ?? null)
  const displayedCatActiveRef = useRef(Boolean(stateRef.current?.catActive))
  const [displayedCatActive, setDisplayedCatActive] = useState(Boolean(stateRef.current?.catActive))
  const remoteHandBoneRef = useRef(null)

  // Initialize group position imperatively on mount — never via JSX props
  useLayoutEffect(() => {
    const group = groupRef.current
    const state = stateRef.current
    if (!group || !state?.position) return
    group.position.fromArray(state.position)
    group.rotation.y = state.rotationY ?? 0
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useFrame((_, delta) => {
    const group = groupRef.current
    if (!group) return

    // Process new network samples directly from ref — no React cycle involved
    const state = stateRef.current
    if (rootRef.current) {
      rootRef.current.visible = !state?.zone || state.zone === currentZone
    }
    if (state?.position) {
      const seq = state.seq ?? 0
      if (seq > lastSeqRef.current) {
        lastSeqRef.current = seq
        const sample = {
          position: state.position,
          rotationY: Number.isFinite(state.rotationY) ? state.rotationY : 0,
          velocity: Array.isArray(state.velocity) ? state.velocity : [0, 0, 0],
          motion: state.motion || 'idle',
          time: transport === 'colyseus' && Number.isFinite(state.serverTime) ? state.serverTime : Date.now(),
        }
        samplesRef.current.push(sample)
        if (samplesRef.current.length > 14) samplesRef.current.splice(0, samplesRef.current.length - 14)
        targetRef.current = { position: sample.position, rotationY: sample.rotationY, velocity: sample.velocity, motion: sample.motion, receivedAt: Date.now() }
      }

      const nextTitleId = typeof state.equippedTitleId === 'string' ? state.equippedTitleId : null
      if (nextTitleId !== displayedTitleIdRef.current) {
        displayedTitleIdRef.current = nextTitleId
        setDisplayedTitleId(nextTitleId)
      }

      const nextEquippedWeapon = state.equippedWeapon === 'magic_book' ? 'magic_book' : null
      if (nextEquippedWeapon !== displayedEquippedWeaponRef.current) {
        displayedEquippedWeaponRef.current = nextEquippedWeapon
        setDisplayedEquippedWeapon(nextEquippedWeapon)
      }

      const nextAppearance = state.characterAppearance
      if (nextAppearance) {
        const cur = displayedAppearanceRef.current
        if (!cur ||
          nextAppearance.skinColor !== cur.skinColor ||
          nextAppearance.hairColor !== cur.hairColor ||
          nextAppearance.eyeColor !== cur.eyeColor ||
          nextAppearance.eyebrowsColor !== cur.eyebrowsColor ||
          nextAppearance.shirtColor !== cur.shirtColor ||
          nextAppearance.pantsColor !== cur.pantsColor ||
          nextAppearance.pantsDetailsColor !== cur.pantsDetailsColor ||
          nextAppearance.shoesColor !== cur.shoesColor ||
          nextAppearance.socksColor !== cur.socksColor ||
          nextAppearance.goldCoat !== cur.goldCoat ||
          nextAppearance.auraEquipped !== cur.auraEquipped) {
          displayedAppearanceRef.current = nextAppearance
          setDisplayedAppearance({ ...nextAppearance })
        }
      }
    }

    let x
    let y
    let z
    let rotationY

    if (transport === 'colyseus' && samplesRef.current.length) {
      const samples = samplesRef.current
      const renderAt = Date.now() + (serverTimeOffsetRef?.current ?? 0) - MULTIPLAYER_INTERP_DELAY_MS
      while (samples.length > 2 && samples[1].time <= renderAt) samples.shift()

      const previous = samples[0]
      const next = samples[1]
      x = previous.position[0]
      y = previous.position[1]
      z = previous.position[2]
      rotationY = previous.rotationY

      if (next) {
        const span = Math.max(1, next.time - previous.time)
        const alpha = MathUtils.clamp((renderAt - previous.time) / span, 0, 1)
        // Hermite cubic spline: uses velocity at both endpoints for smooth curves
        const spanSec = span / 1000
        const a2 = alpha * alpha
        const a3 = a2 * alpha
        const h00 = 2 * a3 - 3 * a2 + 1
        const h10 = a3 - 2 * a2 + alpha
        const h01 = -2 * a3 + 3 * a2
        const h11 = a3 - a2
        const v0 = previous.velocity
        const v1 = next.velocity
        x = h00 * previous.position[0] + h10 * v0[0] * spanSec + h01 * next.position[0] + h11 * v1[0] * spanSec
        y = h00 * previous.position[1] + h10 * v0[1] * spanSec + h01 * next.position[1] + h11 * v1[1] * spanSec
        z = h00 * previous.position[2] + h10 * v0[2] * spanSec + h01 * next.position[2] + h11 * v1[2] * spanSec
        const rotationDelta = MathUtils.euclideanModulo(next.rotationY - previous.rotationY + Math.PI, Math.PI * 2) - Math.PI
        rotationY = previous.rotationY + rotationDelta * alpha
      } else {
        const extrapolateSeconds = MathUtils.clamp(
          (renderAt - previous.time) / 1000,
          0,
          MULTIPLAYER_MAX_EXTRAPOLATION_MS / 1000,
        )
        x += (previous.velocity?.[0] ?? 0) * extrapolateSeconds
        y += (previous.velocity?.[1] ?? 0) * extrapolateSeconds
        z += (previous.velocity?.[2] ?? 0) * extrapolateSeconds
      }
    } else {
      const target = targetRef.current
      const ageSeconds = MathUtils.clamp((Date.now() - target.receivedAt) / 1000, 0, MULTIPLAYER_MAX_EXTRAPOLATION_MS / 1000)
      const leadSeconds = Math.min(ageSeconds + 0.06, 0.16)
      x = target.position[0] + (target.velocity?.[0] ?? 0) * leadSeconds
      y = target.position[1] + (target.velocity?.[1] ?? 0) * leadSeconds
      z = target.position[2] + (target.velocity?.[2] ?? 0) * leadSeconds
      rotationY = target.rotationY
    }

    const distance = Math.hypot(group.position.x - x, group.position.y - y, group.position.z - z)
    if (distance > MULTIPLAYER_REMOTE_SNAP_DISTANCE) {
      group.position.set(x, y, z)
    } else {
      const smoothing = transport === 'colyseus' ? MULTIPLAYER_REMOTE_VISUAL_SMOOTHING : 10
      group.position.x = MathUtils.damp(group.position.x, x, smoothing, delta)
      group.position.y = MathUtils.damp(group.position.y, y, smoothing, delta)
      group.position.z = MathUtils.damp(group.position.z, z, smoothing, delta)
    }
    group.rotation.y = dampAngle(group.rotation.y, rotationY, transport === 'colyseus' ? 10 : 12, delta)

    const nextMotion = targetRef.current.motion || 'idle'
    const now = Date.now()
    if (nextMotion !== displayedMotionRef.current && now - motionSwitchAtRef.current > 110) {
      displayedMotionRef.current = nextMotion
      motionSwitchAtRef.current = now
      setDisplayedMotion(nextMotion)
    }

    // Remote mount: mount/unmount the model when the id changes, and smoothly
    // follow the networked mount transform + animation flags.
    const mount = stateRef.current?.mount ?? null
    const mountId = mount?.id ?? null
    if (mountId !== displayedMountIdRef.current) {
      displayedMountIdRef.current = mountId
      setDisplayedMountId(mountId)
    }
    if (mount && Array.isArray(mount.position)) {
      const mp = remoteMountPosRef.current
      if (!remoteMountInitRef.current) {
        mp.x = mount.position[0]
        mp.y = mount.position[1]
        mp.z = mount.position[2]
        remoteMountYawRef.current = mount.yaw ?? 0
        remoteMountInitRef.current = true
      } else {
        mp.x = MathUtils.damp(mp.x, mount.position[0], 10, delta)
        mp.y = MathUtils.damp(mp.y, mount.position[1], 10, delta)
        mp.z = MathUtils.damp(mp.z, mount.position[2], 10, delta)
        remoteMountYawRef.current = dampAngle(remoteMountYawRef.current, mount.yaw ?? 0, 10, delta)
      }
      const a = remoteMountAnimRef.current
      a.airborne = Boolean(mount.airborne)
      a.moving = Boolean(mount.moving)
      a.movingForward = Boolean(mount.movingForward)
      a.jumping = Boolean(mount.jumping)
    } else {
      remoteMountInitRef.current = false
    }

    const catActive = Boolean(stateRef.current?.catActive)
    if (catActive !== displayedCatActiveRef.current) {
      displayedCatActiveRef.current = catActive
      setDisplayedCatActive(catActive)
    }
  })

  const remoteMountConfig = displayedMountId ? getMountConfig(displayedMountId) : null

  useFrame(() => {
    const group = groupRef.current
    const riderSocket = remoteMountSocketRef.current
    const groupParent = group?.parent
    if (!remoteMountConfig || !stateRef.current?.mount || !riderSocket || !group || !groupParent) return

    getMountedRiderWorldPosition(
      riderSocket,
      remoteMountProfileRef.current?.riderLift ?? DRAGON_RIDE_RIDER_LIFT,
      remoteMountedPlayerPosition,
      remoteMountedSocketQuaternion,
      remoteMountedLiftOffset,
      remoteMountConfig.liftWorldUp,
    )
    remoteMountedPlayerPosition.y += REMOTE_MOUNT_RIDER_VISUAL_LIFT
    groupParent.worldToLocal(remoteMountedPlayerPosition)
    group.position.copy(remoteMountedPlayerPosition)
    group.rotation.set(0, remoteMountYawRef.current, 0)
  }, 0.5)

  const displayedTitle = getTitleDefinition(displayedTitleId ?? fallbackTitleId)

  return (
    <group ref={rootRef}>
      {remoteMountConfig && (
        <MountedMount
          key={remoteMountConfig.id}
          config={remoteMountConfig}
          positionRef={remoteMountPosRef}
          yawRef={remoteMountYawRef}
          animStateRef={remoteMountAnimRef}
          riderTransformRef={remoteMountRiderTransformRef}
          riderSocketRef={remoteMountSocketRef}
          mountProfileRef={remoteMountProfileRef}
          currentZone={currentZone}
        />
      )}
      {displayedCatActive && (
        <NetworkCat stateRef={stateRef} currentZone={currentZone} />
      )}
      <group ref={groupRef}>
        <PlayerAvatar
          motion={displayedMotion}
          handBoneRef={remoteHandBoneRef}
          mountProfileRef={remoteMountProfileRef}
          equippedWeapon={displayedEquippedWeapon}
          appearance={displayedAppearance}
          currentZone={currentZone}
        />
        <FloatingMagicBook active={displayedEquippedWeapon === 'magic_book'} handBoneRef={remoteHandBoneRef} playerGroupRef={groupRef} />
        <FloatingMagicSkull active={displayedEquippedWeapon === 'magic_skull'} handBoneRef={remoteHandBoneRef} playerGroupRef={groupRef} />
        {showOverlays && (
          <Html position={[0, 1.08, 0]} center distanceFactor={8} zIndexRange={WORLD_NAMEPLATE_Z_INDEX_RANGE}>
            <div className="remote-player-nameplate">
              <div className="remote-player-label">{label}</div>
              {displayedTitle && (
                <div className="remote-player-title" style={{ '--title-color': getTitleRarity(displayedTitle).color }}>
                  {displayedTitle.name}
                </div>
              )}
            </div>
          </Html>
        )}
        {showOverlays && chatBubblesRef && <ChatBubbles bubblesRef={chatBubblesRef} version={chatVersion} />}
      </group>
    </group>
  )
}

function NetworkCat({ stateRef, currentZone }) {
  const { scene, animations } = useGLTF('/models/cat.glb')
  const cat = useMemo(() => clone(scene), [scene])
  const { actions } = useAnimations(animations, cat)
  const groupRef = useRef(null)
  const currentActionRef = useRef(null)
  const currentAnimRef = useRef('')
  const initializedRef = useRef(false)

  const playAnim = useCallback((name, loop = true, fade = 0.18) => {
    if (currentAnimRef.current === name) return
    const action = actions[name] ?? actions.Idle
    if (!action) return
    currentActionRef.current?.fadeOut(fade)
    action.reset().setLoop(loop ? LoopRepeat : LoopOnce, loop ? Infinity : 1).play()
    action.setEffectiveWeight(1).setEffectiveTimeScale(1)
    if (fade > 0) action.fadeIn(fade)
    action.clampWhenFinished = !loop
    currentActionRef.current = action
    currentAnimRef.current = name
  }, [actions])

  useEffect(() => {
    cat.traverse((obj) => {
      if (obj instanceof Mesh) { obj.castShadow = true; obj.receiveShadow = true }
    })
    playAnim('Idle')
  }, [cat, playAnim])

  useFrame((_, delta) => {
    const group = groupRef.current
    const catState = stateRef.current?.cat
    if (!group || !catState?.position) return

    const [x, y, z] = catState.position
    if (![x, y, z].every(Number.isFinite)) return
    if (!initializedRef.current) {
      group.position.set(x, y, z)
      group.rotation.y = Number.isFinite(catState.rotationY) ? catState.rotationY : 0
      initializedRef.current = true
    } else {
      group.position.x = MathUtils.damp(group.position.x, x, 18, delta)
      group.position.y = MathUtils.damp(group.position.y, y, 18, delta)
      group.position.z = MathUtils.damp(group.position.z, z, 18, delta)
      group.rotation.y = dampAngle(group.rotation.y, Number.isFinite(catState.rotationY) ? catState.rotationY : group.rotation.y, 18, delta)
    }
    if (currentZone === ZONES.outside && !Number.isFinite(y)) {
      group.position.y = getTerrainHeight(group.position.x, group.position.z)
    }
    playAnim(typeof catState.motion === 'string' ? catState.motion : 'Idle')
  })

  return (
    <group ref={groupRef} position={[0, -500, 0]} userData={{ debugCategory: 'npcs' }}>
      <primitive object={cat} />
    </group>
  )
}

function ControlsOverlay({ touchRef, adminCameraControls = false, uiHidden = false, showJumpAction = true, mountFlying = false, onTap }) {
  const joystickPointerIdRef = useRef(null)
  const lookPointerIdRef = useRef(null)
  const lookPointersRef = useRef(new Map())
  const pinchRef = useRef(null)
  const lookLastRef = useRef({ x: 0, y: 0 })
  const emoteTimerRef = useRef(null)
  const emotePressRef = useRef({ x: 0, y: 0, cancelled: false })
  const [stickVisual, setStickVisual] = useState({ x: 0, y: 0 })
  const [emoteMenu, setEmoteMenu] = useState(null)
  const [activeEmoteId, setActiveEmoteId] = useState(null)
  const [edgeGlow, setEdgeGlow] = useState({
    left: false,
    right: false,
    top: false,
    bottom: false,
  })

  useEffect(() => {
    return () => {
      if (emoteTimerRef.current) clearTimeout(emoteTimerRef.current)
    }
  }, [])

  const clearEmoteTimer = () => {
    if (!emoteTimerRef.current) return
    clearTimeout(emoteTimerRef.current)
    emoteTimerRef.current = null
  }

  const closeEmoteMenu = () => {
    clearEmoteTimer()
    setEmoteMenu(null)
    setActiveEmoteId(null)
  }

  const setCameraDistance = (distance) => {
    touchRef.current.cameraDistance = MathUtils.clamp(
      distance,
      CAMERA_MIN_DISTANCE,
      CAMERA_MAX_DISTANCE,
    )
  }

  const getPinchDistance = () => {
    const points = Array.from(lookPointersRef.current.values())
    if (points.length < 2) return 0
    return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)
  }

  const beginPinchZoom = () => {
    const distance = getPinchDistance()
    if (distance <= 0) return
    clearEmoteTimer()
    setEmoteMenu(null)
    setActiveEmoteId(null)
    setEdgeGlow({ left: false, right: false, top: false, bottom: false })
    touchRef.current.lookActive = false
    touchRef.current.lookX = 0
    touchRef.current.lookY = 0
    pinchRef.current = {
      distance,
      cameraDistance: touchRef.current.cameraDistance ?? CAMERA_DISTANCE,
    }
  }

  const updatePinchZoom = () => {
    if (!pinchRef.current) return
    const distance = getPinchDistance()
    if (distance <= 0) return
    const ratio = pinchRef.current.distance / distance
    setCameraDistance(pinchRef.current.cameraDistance * ratio)
  }

  const setJoystick = (event) => {
    const zone = event.currentTarget.getBoundingClientRect()
    const centerX = zone.left + zone.width / 2
    const centerY = zone.top + zone.height / 2
    const dx = event.clientX - centerX
    const dy = event.clientY - centerY
    const radius = zone.width * 0.36

    const distance = Math.hypot(dx, dy)
    const factor = distance > radius ? radius / distance : 1
    const clampedX = dx * factor
    const clampedY = dy * factor

    touchRef.current.moveX = clampedX / radius
    touchRef.current.moveY = -clampedY / radius
    setStickVisual({ x: clampedX, y: clampedY })
  }

  const resetJoystick = () => {
    touchRef.current.moveX = 0
    touchRef.current.moveY = 0
    setStickVisual({ x: 0, y: 0 })
    joystickPointerIdRef.current = null
  }

  const onJoystickDown = (event) => {
    joystickPointerIdRef.current = event.pointerId
    event.currentTarget.setPointerCapture(event.pointerId)
    setJoystick(event)
  }

  const onJoystickMove = (event) => {
    if (joystickPointerIdRef.current !== event.pointerId) return
    setJoystick(event)
  }

  const onJoystickUp = (event) => {
    if (joystickPointerIdRef.current !== event.pointerId) return
    resetJoystick()
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const onLookDown = (event) => {
    lookPointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    event.currentTarget.setPointerCapture(event.pointerId)
    if (event.pointerType === 'touch' && lookPointersRef.current.size >= 2) {
      lookPointerIdRef.current = null
      beginPinchZoom()
      return
    }

    lookPointerIdRef.current = event.pointerId
    lookLastRef.current.x = event.clientX
    lookLastRef.current.y = event.clientY
    emotePressRef.current = { x: event.clientX, y: event.clientY, cancelled: false }
    touchRef.current.lookActive = true
    touchRef.current.lookX = 0
    touchRef.current.lookY = 0
    setEdgeGlow({ left: false, right: false, top: false, bottom: false })
    clearEmoteTimer()
    emoteTimerRef.current = window.setTimeout(() => {
      if (lookPointerIdRef.current !== event.pointerId) return
      if (emotePressRef.current.cancelled) return
      touchRef.current.lookActive = false
      touchRef.current.lookX = 0
      touchRef.current.lookY = 0
      setEdgeGlow({ left: false, right: false, top: false, bottom: false })
      setActiveEmoteId(null)
      setEmoteMenu({ x: event.clientX, y: event.clientY })
    }, EMOTE_LONG_PRESS_MS)
  }

  const onLookMove = (event) => {
    if (lookPointersRef.current.has(event.pointerId)) {
      lookPointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    }
    if (pinchRef.current) {
      updatePinchZoom()
      return
    }
    if (lookPointerIdRef.current !== event.pointerId) return
    if (emoteMenu) {
      setActiveEmoteId(getEmoteSelection(event.clientX - emoteMenu.x, event.clientY - emoteMenu.y))
      return
    }

    const pressDx = event.clientX - emotePressRef.current.x
    const pressDy = event.clientY - emotePressRef.current.y
    if (Math.hypot(pressDx, pressDy) > EMOTE_CANCEL_DISTANCE) {
      emotePressRef.current.cancelled = true
      clearEmoteTimer()
    }

    const stepX = event.clientX - lookLastRef.current.x
    const stepY = event.clientY - lookLastRef.current.y
    touchRef.current.cameraYaw -= stepX * CAMERA_DRAG_SENSITIVITY
    touchRef.current.cameraPitch = MathUtils.clamp(
      touchRef.current.cameraPitch + stepY * CAMERA_DRAG_SENSITIVITY,
      PLAYER_CAMERA_PITCH_MIN,
      PLAYER_CAMERA_PITCH_MAX,
    )

    const viewportW = window.innerWidth
    const viewportH = window.innerHeight
    const edgeLeft = event.clientX <= EDGE_TRIGGER_PX
    const edgeRight = event.clientX >= viewportW - EDGE_TRIGGER_PX
    const edgeTop = event.clientY <= EDGE_TRIGGER_PX
    const edgeBottom = event.clientY >= viewportH - EDGE_TRIGGER_PX

    touchRef.current.lookX = 0
    touchRef.current.lookY = 0

    if (edgeLeft) touchRef.current.lookX = -1
    if (edgeRight) touchRef.current.lookX = 1
    if (edgeTop) touchRef.current.lookY = -1
    if (edgeBottom) touchRef.current.lookY = 1

    setEdgeGlow({ left: edgeLeft, right: edgeRight, top: edgeTop, bottom: edgeBottom })

    lookLastRef.current.x = event.clientX
    lookLastRef.current.y = event.clientY
  }

  const onLookUp = (event) => {
    lookPointersRef.current.delete(event.pointerId)
    if (pinchRef.current) {
      if (lookPointersRef.current.size < 2) {
        pinchRef.current = null
      } else {
        beginPinchZoom()
      }
      touchRef.current.lookActive = false
      touchRef.current.lookX = 0
      touchRef.current.lookY = 0
      setEdgeGlow({ left: false, right: false, top: false, bottom: false })
      event.currentTarget.releasePointerCapture(event.pointerId)
      return
    }
    if (lookPointerIdRef.current !== event.pointerId) return
    const selectedEmoteId = emoteMenu ? activeEmoteId : null
    closeEmoteMenu()
    lookPointerIdRef.current = null
    touchRef.current.lookActive = false
    touchRef.current.lookX = 0
    touchRef.current.lookY = 0
    setEdgeGlow({ left: false, right: false, top: false, bottom: false })
    event.currentTarget.releasePointerCapture(event.pointerId)
    if (selectedEmoteId) {
      touchRef.current.emoteQueued = selectedEmoteId
      return
    }
    const dx = event.clientX - emotePressRef.current.x
    const dy = event.clientY - emotePressRef.current.y
    const isTap = Math.hypot(dx, dy) < 8
    if (isTap && onTap) onTap(event.clientX, event.clientY)
  }

  const onCameraWheel = (event) => {
    event.preventDefault()
    const currentDistance = touchRef.current.cameraDistance ?? CAMERA_DISTANCE
    const zoomFactor = 1 + event.deltaY * CAMERA_WHEEL_ZOOM_SENSITIVITY
    setCameraDistance(currentDistance * zoomFactor)
  }

  const triggerAction = () => {
    touchRef.current.actionQueued = true
  }

  // Jump button also acts as held "ascend" while mounted (jump on ground, climb
  // in flight); the descend button lowers a flying mount.
  const onJumpDown = () => {
    touchRef.current.actionQueued = true
    touchRef.current.mountAscend = true
  }
  const onJumpUp = () => {
    touchRef.current.mountAscend = false
  }
  const onDescendDown = () => {
    touchRef.current.mountDescend = true
  }
  const onDescendUp = () => {
    touchRef.current.mountDescend = false
  }

  return (
    <div className="hud">
      <div
        className="camera-pad"
        onPointerDown={onLookDown}
        onPointerMove={onLookMove}
        onPointerUp={onLookUp}
        onPointerCancel={onLookUp}
        onWheel={onCameraWheel}
      >
        {!uiHidden && <div className={`edge-glow right ${edgeGlow.right ? 'active' : ''}`} />}
        {!uiHidden && <div className={`edge-glow left ${edgeGlow.left ? 'active' : ''}`} />}
        {!uiHidden && <div className={`edge-glow top ${edgeGlow.top ? 'active' : ''}`} />}
        {!uiHidden && <div className={`edge-glow bottom ${edgeGlow.bottom ? 'active' : ''}`} />}
        {!uiHidden && emoteMenu && (
          <div
            className="emote-radial"
            style={{ left: emoteMenu.x, top: emoteMenu.y }}
          >
            {emotes.map((emote, index) => (
              <div
                key={emote.id}
                className={`emote-choice ${activeEmoteId === emote.id ? 'active' : ''}`}
                style={{
                  '--emote-x': `${Math.cos(getEmoteAngle(index, emotes.length)) * EMOTE_MENU_RADIUS}px`,
                  '--emote-y': `${Math.sin(getEmoteAngle(index, emotes.length)) * EMOTE_MENU_RADIUS}px`,
                }}
                aria-label={emote.label}
              >
                <span className="emote-glyph">{emote.glyph}</span>
              </div>
            ))}
            <div className="emote-deadzone" />
            <div className="emote-anchor" />
          </div>
        )}
      </div>

      {!uiHidden && (
        <div className="joystick-wrap">
          <div
            className="joystick-zone"
            onPointerDown={onJoystickDown}
            onPointerMove={onJoystickMove}
            onPointerUp={onJoystickUp}
            onPointerCancel={onJoystickUp}
          >
            <div
              className="joystick-thumb"
              style={{
                transform: `translate(${stickVisual.x}px, ${stickVisual.y}px)`,
              }}
            />
          </div>
        </div>
      )}

      {!uiHidden && showJumpAction && (
        <button
          className={`action-btn${mountFlying ? ' action-btn-ascend' : ''}`}
          type="button"
          onPointerDown={onJumpDown}
          onPointerUp={onJumpUp}
          onPointerCancel={onJumpUp}
          aria-label={mountFlying ? 'Monter' : 'Sauter'}
        >
          <span className="action-symbol">{mountFlying ? '\u25b2' : '\u2423'}</span>
        </button>
      )}
      {!uiHidden && mountFlying && (
        <button
          className="action-btn action-btn-descend"
          type="button"
          onPointerDown={onDescendDown}
          onPointerUp={onDescendUp}
          onPointerCancel={onDescendUp}
          aria-label="Descendre"
        >
          <span className="action-symbol">{'\u25bc'}</span>
        </button>
      )}
    </div>
  )
}

const BAG_ITEM_DEFS = [
  { id: 'magic_book', icon: '📖', name: 'Livre Magique', desc: 'Lance des boules de feu' },
  { id: 'magic_skull', icon: '💀', name: 'Crâne Nécromancien', desc: 'Invoque 3 squelettes alliés' },
]

const BAG_GRID_SIZE = 12

function BagPanel({ open, ownedItems, equippedWeapon, onEquip, onCustomizeCharacter, ownedMountIds = [], mountedMountId, onToggleMount, onClose, materials = {} }) {
  const lastTapRef = useRef({})

  function handleSlotInteraction(itemId) {
    const now = Date.now()
    const last = lastTapRef.current[itemId] ?? 0
    if (now - last < 350) {
      onEquip(equippedWeapon === itemId ? null : itemId)
      lastTapRef.current[itemId] = 0
    } else {
      lastTapRef.current[itemId] = now
    }
  }

  if (!open) return null

  const slots = Array.from({ length: BAG_GRID_SIZE }, (_, i) => ownedItems[i] ?? null)
  const materialEntries = getMaterialEntries(materials)

  return (
    <div className="weapon-inventory-overlay" onClick={onClose}>
      <div className="bag-panel" onClick={(e) => e.stopPropagation()}>
        <div className="weapon-inventory-header">
          <span>🎒 Sac</span>
          <button type="button" className="weapon-inventory-close" onClick={onClose}>✕</button>
        </div>
        {onCustomizeCharacter && (
          <button
            type="button"
            className="bag-character-customization-btn"
            onClick={onCustomizeCharacter}
          >
            <span aria-hidden="true">{'\u{1F464}'}</span>
            Personnaliser le personnage
          </button>
        )}
        {onToggleMount && MOUNT_SHOP_ITEMS.filter((mount) => ownedMountIds.includes(mount.id)).map((mount) => (
          <button
            key={mount.id}
            type="button"
            className="bag-character-customization-btn"
            onClick={() => onToggleMount(mount.id)}
          >
            <span aria-hidden="true">{mount.icon}</span>
            {mountedMountId === mount.id ? `Désinvoquer ${mount.label}` : `Invoquer ${mount.label}`}
          </button>
        ))}
        <p className="bag-hint">Double-cliquer pour équiper</p>
        <div className="bag-grid">
          {slots.map((item, i) => {
            const isEquipped = item && equippedWeapon === item.id
            return (
              <div
                key={item ? item.id : `empty-${i}`}
                className={`bag-slot ${item ? 'has-item' : ''} ${isEquipped ? 'equipped' : ''}`}
                onClick={() => item && handleSlotInteraction(item.id)}
                title={item ? `${item.name} — ${item.desc}` : ''}
                role={item ? 'button' : undefined}
                tabIndex={item ? 0 : undefined}
                onKeyDown={item ? (e) => e.key === 'Enter' && handleSlotInteraction(item.id) : undefined}
              >
                {item && (
                  <>
                    {item.thumbnail ? (
                      <>
                        <img
                          className="bag-slot-img"
                          src={item.thumbnail}
                          alt=""
                          onError={(event) => {
                            event.currentTarget.style.display = 'none'
                            const fallback = event.currentTarget.nextElementSibling
                            if (fallback) fallback.hidden = false
                          }}
                        />
                        <span className="bag-slot-icon" hidden>{item.icon}</span>
                      </>
                    ) : (
                      <span className="bag-slot-icon">{item.icon}</span>
                    )}
                    {isEquipped && <span className="bag-slot-equipped-dot" title="Équipé" />}
                  </>
                )}
              </div>
            )
          })}
        </div>
        {materialEntries.length > 0 && (
          <>
            <p className="bag-hint">Objets</p>
            <div className="bag-materials">
              {materialEntries.map(({ itemId, def, count }) => (
                <div key={itemId} className="bag-material" title={def?.name ?? itemId}>
                  <ItemIcon def={def} className="bag-material-icon" />
                  <span className="bag-material-count">x{count}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function CoinsOverlay({ coins }) {
  return (
    <div className="score-wrap">
      <div className="score">
        <img className="score-coin-icon" src="/ui/coins.png" alt="Pieces" />
        <span className="score-value">{coins}</span>
      </div>
    </div>
  )
}

function PlayerHealthOverlay({ hp }) {
  const ratio = MathUtils.clamp(hp / PLAYER_MAX_HP, 0, 1)

  return (
    <div className={`player-health-wrap ${hp <= 0 ? 'is-down' : ''}`}>
      <div className="player-health-bar">
        <span style={{ width: `${ratio * 100}%` }} />
        <strong>{hp} / {PLAYER_MAX_HP}</strong>
      </div>
    </div>
  )
}

function AchievementToast({ toast }) {
  if (!toast) return null

  if (toast.kind === 'info') {
    return (
      <div className="achievement-toast" role="status">
        <span className="achievement-toast-kicker">{toast.kicker ?? 'Decouverte'}</span>
        <strong>{toast.name}</strong>
        {toast.description && <span>{toast.description}</span>}
      </div>
    )
  }

  if (toast.kind === 'local') {
    return (
      <div className="achievement-toast" role="status">
        <span className="achievement-toast-kicker">Haut fait débloqué</span>
        <strong>{toast.icon ? `${toast.icon} ` : ''}{toast.name}</strong>
        {toast.description && <span>{toast.description}</span>}
      </div>
    )
  }

  return (
    <div className="achievement-toast" role="status">
      <span className="achievement-toast-kicker">Titre rare obtenu</span>
      <strong>{toast.titleName}</strong>
      <span>Tu fais partie des 50 premiers joueurs. Rang #{toast.claimNumber}.</span>
    </div>
  )
}

function SettingsPanel({
  settings,
  onToggle,
  isLocalNetwork = false,
  showLocalCoinButton = true,
  onToggleLocalCoinButton,
  fullscreenSupported = false,
  fullscreenActive = false,
  onToggleFullscreen,
  pwaStandalone = false,
  deferredPrompt = null,
  isIosDevice = false,
  onInstallPwa,
  onShowPwaGuide,
}) {
  const rows = [
    ['showFps', 'Afficher les FPS', 'Montre un compteur pendant le jeu.'],
    ['autoQuality', 'Qualite auto', 'Ajuste la resolution si le telephone rame.'],
    ['lowResolution', 'Basse resolution', 'Reduit fortement le nombre de pixels a calculer.'],
    ['shadows', 'Ombres', 'Plus joli, mais couteux sur mobile.'],
    ['grass', 'Herbe', "Desactive les brins d'herbe dehors."],
  ]

  return (
    <div className="settings-panel">
      <div className="settings-group-title">Performance</div>
      {rows.map(([key, label, description]) => (
        <label className="settings-toggle-row" key={key}>
          <input
            type="checkbox"
            checked={Boolean(settings[key])}
            onChange={() => onToggle(key)}
          />
          <span>
            <strong>{label}</strong>
            <small>{description}</small>
          </span>
        </label>
      ))}
      <div className="settings-group-title">Affichage</div>

      {pwaStandalone && (
        <div className="settings-toggle-row">
          <span style={{ gridColumn: '1 / span 2', display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <strong style={{ color: '#8dffb0' }}>📱 Mode Application Actif</strong>
            <small>Le jeu est lancé depuis votre écran d'accueil en mode plein écran autonome.</small>
          </span>
        </div>
      )}

      {!pwaStandalone && (
        <button
          type="button"
          className="settings-action-row"
          onClick={onToggleFullscreen}
        >
          <span>
            <strong>
              {fullscreenActive
                ? 'Quitter le mode plein ecran'
                : isIosDevice
                  ? '✨ Plein ecran — Guide installation'
                  : 'Mode plein ecran'}
            </strong>
            <small>
              {fullscreenActive
                ? 'Plein ecran actif.'
                : isIosDevice
                  ? 'Sur iPhone, installe le jeu sur l\'écran d\'accueil pour jouer sans barres.'
                  : 'Cache les barres du navigateur pour jouer en grand.'}
            </small>
          </span>
        </button>
      )}

      {!pwaStandalone && deferredPrompt && (
        <button
          type="button"
          className="settings-action-row"
          onClick={onInstallPwa}
        >
          <span>
            <strong>✨ Installer le jeu</strong>
            <small>Ajouter un raccourci plein écran sur votre écran d'accueil.</small>
          </span>
        </button>
      )}

      {isLocalNetwork && (
        <>
          <div className="settings-group-title">Local</div>
          <label className="settings-toggle-row">
            <input
              type="checkbox"
              checked={showLocalCoinButton}
              onChange={onToggleLocalCoinButton}
            />
            <span>
              <strong>Bouton +500 pieces</strong>
              <small>Affiche le bouton de test local pour ajouter des pieces.</small>
            </span>
          </label>
        </>
      )}
    </div>
  )
}

function GameMenuPanel({
  configured,
  user,
  email,
  password,
  displayName,
  mode,
  open,
  activeTab,
  message,
  socialMessage,
  saveState,
  role,
  session,
  onlinePlayers,
  selectedPlayerId,
  incomingRequest,
  outgoingRequest,
  visitRemainingSeconds,
  sessionConnectionState,
  sessionTransport,
  hasRemotePlayer,
  friends,
  incomingFriendRequests,
  pendingFriendRequests,
  ownedTitleIds,
  equippedTitleId,
  titleActionState,
  unlockedAchievements,
  achievementProgress,
  soloNameplateVisible,
  performanceSettings,
  isLocalNetwork,
  showLocalCoinButton,
  fullscreenSupported,
  fullscreenActive,
  onToggle,
  onTabChange,
  onEmailChange,
  onPasswordChange,
  onDisplayNameChange,
  onModeChange,
  onSubmit,
  onSignOut,
  onSelectPlayer,
  onRequestVisit,
  onCancelVisit,
  onAcceptRequest,
  onRejectRequest,
  onLeaveSession,
  onRequestFriend,
  onAcceptFriend,
  onRejectFriend,
  onToggleTitle,
  onToggleSoloNameplate,
  onTogglePerformanceSetting,
  onToggleLocalCoinButton,
  onToggleFullscreen,
  pwaStandalone = false,
  deferredPrompt = null,
  isIosDevice = false,
  onInstallPwa,
  onShowPwaGuide,
}) {
  const isConnected = Boolean(user)
  const statusText = configured
    ? isConnected
      ? 'Compte connecte'
      : 'Mode invite'
    : 'Supabase non configure'
  const selectedPlayer = onlinePlayers.find((player) => player.userId === selectedPlayerId)
  const friendIds = new Set(friends.map((friend) => friend.userId))
  const pendingFriendIds = new Set(pendingFriendRequests.map((request) => request.toUserId))
  const friendsWithStatus = friends
    .map((friend) => {
      const online = onlinePlayers.find((player) => player.userId === friend.userId)
      return {
        ...friend,
        displayName: online?.displayName || friend.displayName,
        status: online?.status || 'offline',
        online: Boolean(online),
        lastSeenAt: online?.onlineAt || friend.lastSeenAt || friend.addedAt || null,
      }
    })
    .sort((a, b) => Number(b.online) - Number(a.online) || a.displayName.localeCompare(b.displayName))
  const sessionLabel = role === 'host'
    ? `${session?.guestDisplayName ?? 'Visiteur'} visite ton monde`
    : role === 'guest'
      ? `Tu visites ${session?.hostDisplayName ?? 'un monde'}`
      : null

  return (
    <div className={`account-sync ${open ? 'open' : ''}`}>
      <button className="account-sync-toggle" type="button" onClick={onToggle} aria-label="Menu">
        <span className={`account-sync-dot ${isConnected ? 'connected' : ''}`} />
        <span>Menu</span>
      </button>
      {open && (
        <div className="account-sync-panel">
          <div className="main-menu-tabs">
            {SOCIAL_MENU_TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                className={activeTab === tab ? 'active' : ''}
                onClick={() => onTabChange(tab)}
              >
                {tab === 'account' ? 'Compte' : tab === 'achievements' ? 'Haut fait' : tab === 'social' ? 'Social' : tab === 'friends' ? 'Amis' : 'Parametres'}
              </button>
            ))}
          </div>

          {activeTab === 'account' && (
            <>
              <div className="account-sync-status">
                {statusText}
                <span>{saveState}</span>
              </div>
              {!isConnected && (
                <p className="account-sync-help">
                  Ta progression invite reste sur cet appareil. Cree un compte pour la sauvegarder en ligne.
                </p>
              )}
              {configured && !isConnected && (
                <>
                  <div className="account-sync-tabs">
                    <button type="button" className={mode === 'signup' ? 'active' : ''} onClick={() => onModeChange('signup')}>Creer</button>
                    <button type="button" className={mode === 'signin' ? 'active' : ''} onClick={() => onModeChange('signin')}>Connexion</button>
                  </div>
                  <form className="account-sync-form" onSubmit={onSubmit}>
                    {mode === 'signup' && (
                      <input type="text" value={displayName} onChange={(event) => onDisplayNameChange(event.target.value)} placeholder="Pseudo" aria-label="Pseudo" minLength={2} required />
                    )}
                    <input type="email" value={email} onChange={(event) => onEmailChange(event.target.value)} placeholder="Email" aria-label="Email" required />
                    <input type="password" value={password} onChange={(event) => onPasswordChange(event.target.value)} placeholder="Mot de passe" aria-label="Mot de passe" minLength={8} required />
                    <button type="submit">{mode === 'signup' ? 'Creer mon compte' : 'Se connecter'}</button>
                  </form>
                  <div className="account-sync-social">
                    <button type="button" disabled>Google bientot</button>
                    <button type="button" disabled>Apple bientot</button>
                  </div>
                </>
              )}
              {configured && isConnected && (
                <>
                  <div className="account-sync-help">
                    {displayName || user.email}
                    <br />
                    Progression sauvegardee en ligne.
                  </div>
                  {role === 'solo' && (
                    <button className="solo-name-toggle" type="button" onClick={onToggleSoloNameplate}>
                      Pseudo en solo: {soloNameplateVisible ? 'affiche' : 'masque'}
                    </button>
                  )}
                  <button className="account-sync-out" type="button" onClick={onSignOut}>Deconnexion</button>
                </>
              )}
              {message && <div className="account-sync-message">{message}</div>}
            </>
          )}

          {activeTab === 'achievements' && (
            <AchievementsPanel
              configured={configured}
              user={user}
              ownedTitleIds={ownedTitleIds}
              equippedTitleId={equippedTitleId}
              titleActionState={titleActionState}
              onToggleTitle={onToggleTitle}
              unlockedAchievements={unlockedAchievements}
              achievementProgress={achievementProgress}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsPanel
              settings={performanceSettings}
              onToggle={onTogglePerformanceSetting}
              isLocalNetwork={isLocalNetwork}
              showLocalCoinButton={showLocalCoinButton}
              onToggleLocalCoinButton={onToggleLocalCoinButton}
              fullscreenSupported={fullscreenSupported}
              fullscreenActive={fullscreenActive}
              onToggleFullscreen={onToggleFullscreen}
              pwaStandalone={pwaStandalone}
              deferredPrompt={deferredPrompt}
              isIosDevice={isIosDevice}
              onInstallPwa={onInstallPwa}
              onShowPwaGuide={onShowPwaGuide}
            />
          )}

          {activeTab === 'social' && (
            <>
              {!configured && <p className="multiplayer-help">Supabase doit etre configure pour les visites.</p>}
              {configured && !user && <p className="multiplayer-help">Connecte ton compte pour voir les joueurs.</p>}
              {configured && user && role !== 'solo' && (
                <div className="multiplayer-session-card">
                  <strong>{sessionLabel}</strong>
                  <span>{role === 'guest' ? 'Mode visite: modification bloquee.' : 'Tu peux modifier ton monde, le visiteur voit les changements.'}</span>
                  <span>
                    Canal: {sessionConnectionState === 'connected' ? 'connecte' : 'connexion...'}
                    {sessionTransport !== 'none' ? ` (${sessionTransport})` : ''}
                    {' / '}
                    Joueur distant: {hasRemotePlayer ? 'recu' : 'en attente'}
                  </span>
                  <button type="button" onClick={onLeaveSession}>Quitter</button>
                </div>
              )}
              {configured && user && role === 'solo' && incomingRequest && (
                <div className="multiplayer-request-card">
                  <strong>{incomingRequest.fromDisplayName} veut visiter ton monde.</strong>
                  <span>Expire dans {visitRemainingSeconds}s.</span>
                  <div className="multiplayer-actions">
                    <button type="button" onClick={onAcceptRequest}>Accepter</button>
                    <button type="button" onClick={onRejectRequest}>Refuser</button>
                  </div>
                </div>
              )}
              {configured && user && role === 'solo' && outgoingRequest && (
                <div className="multiplayer-request">
                  <p className="multiplayer-help">Demande envoyee a {outgoingRequest.toDisplayName}. Expire dans {visitRemainingSeconds}s.</p>
                  <div className="multiplayer-actions">
                    <button type="button" onClick={onCancelVisit}>Annuler la demande</button>
                  </div>
                </div>
              )}
              {configured && user && (
                <>
                  <div className="multiplayer-title">Joueurs en ligne</div>
                  <div className="multiplayer-list">
                    {onlinePlayers.length === 0 && <span className="multiplayer-empty">Personne d'autre en ligne pour l'instant.</span>}
                    {onlinePlayers.map((player) => (
                      <button
                        key={player.userId}
                        type="button"
                        className={`multiplayer-player ${selectedPlayerId === player.userId ? 'selected' : ''}`}
                        onClick={() => onSelectPlayer(player)}
                      >
                        <span>{player.displayName}</span>
                        <small>{player.status === 'available' ? 'Disponible' : 'Occupe'}</small>
                      </button>
                    ))}
                  </div>
                </>
              )}
              {selectedPlayer && (
                <div className="social-player-actions">
                  <strong>{selectedPlayer.displayName}</strong>
                  <div className="multiplayer-actions">
                    <button type="button" onClick={() => onRequestVisit(selectedPlayer)} disabled={Boolean(outgoingRequest) || role !== 'solo'}>Visiter</button>
                    <button type="button" onClick={() => onRequestFriend(selectedPlayer)} disabled={friendIds.has(selectedPlayer.userId) || pendingFriendIds.has(selectedPlayer.userId)}>
                      {friendIds.has(selectedPlayer.userId) ? 'Ami' : pendingFriendIds.has(selectedPlayer.userId) ? 'Envoye' : 'Ajouter'}
                    </button>
                  </div>
                </div>
              )}
              {socialMessage && <div className="multiplayer-message">{socialMessage}</div>}
            </>
          )}

          {activeTab === 'friends' && (
            <>
              {incomingFriendRequests.length > 0 && (
                <>
                  <div className="multiplayer-title">Demandes d'amis</div>
                  <div className="multiplayer-list">
                    {incomingFriendRequests.map((request) => (
                      <div key={request.id} className="multiplayer-request-card">
                        <strong>{request.fromDisplayName}</strong>
                        <div className="multiplayer-actions">
                          <button type="button" onClick={() => onAcceptFriend(request)}>Accepter</button>
                          <button type="button" onClick={() => onRejectFriend(request)}>Refuser</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
              <div className="multiplayer-title">Liste d'amis</div>
              <div className="multiplayer-list">
                {friendsWithStatus.length === 0 && <span className="multiplayer-empty">Aucun ami pour l'instant.</span>}
                {friendsWithStatus.map((friend) => (
                  <button key={friend.userId} type="button" className="multiplayer-player" onClick={() => friend.online && onSelectPlayer(friend)}>
                    <span>{friend.displayName}</span>
                    <small className={friend.online ? 'friend-status online' : 'friend-status offline'}>
                      {friend.online ? 'En ligne' : `Hors ligne - ${formatRelativeLastSeen(friend.lastSeenAt)}`}
                    </small>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function AchievementsPanel({
  configured,
  user,
  ownedTitleIds,
  equippedTitleId,
  titleActionState,
  onToggleTitle,
  unlockedAchievements = [],
  achievementProgress = {},
}) {
  const ownedSet = new Set(ownedTitleIds)
  const unlockedAchievementSet = new Set(unlockedAchievements)
  const titles = Object.values(TITLES)

  const unlockedCount = LOCAL_ACHIEVEMENTS.filter((a) => unlockedAchievementSet.has(a.id)).length

  return (
    <div className="achievement-panel">
      {/* ── Hauts faits locaux (toujours visibles, solo comme connecté) ── */}
      <div className="multiplayer-title">
        Hauts faits ({unlockedCount}/{LOCAL_ACHIEVEMENTS.length})
      </div>
      <div className="title-list">
        {LOCAL_ACHIEVEMENTS.map((achievement) => {
          const unlocked = unlockedAchievementSet.has(achievement.id)
          const current = achievement.metric ? (achievementProgress[achievement.metric] ?? 0) : null
          const showProgress = !unlocked && achievement.metric && achievement.goal
          return (
            <div
              key={achievement.id}
              className={`title-card achievement-card ${unlocked ? 'unlocked' : 'locked'}`}
            >
              <span className="title-card-name">{achievement.icon} {achievement.name}</span>
              <span className="title-card-meta">
                {unlocked ? 'Débloqué' : 'Verrouillé'}
                {showProgress ? ` / ${Math.min(current, achievement.goal)}/${achievement.goal}` : ''}
              </span>
              <span className="title-card-desc">{achievement.description}</span>
            </div>
          )
        })}
      </div>

      {/* ── Titres (limités, nécessitent un compte) ── */}
      <div className="multiplayer-title">Titres</div>
      {!configured ? (
        <p className="multiplayer-help">Supabase doit etre configure pour les titres.</p>
      ) : !user ? (
        <p className="multiplayer-help">Connecte ton compte pour debloquer et equiper des titres.</p>
      ) : (
      <div className="title-list">
        {titles.map((title) => {
          const unlocked = ownedSet.has(title.id)
          const equipped = equippedTitleId === title.id
          const rarity = getTitleRarity(title)
          const busy = titleActionState === title.id

          return (
            <button
              key={title.id}
              type="button"
              className={`title-card ${unlocked ? 'unlocked' : 'locked'} ${equipped ? 'equipped' : ''}`}
              style={{ '--title-color': rarity.color }}
              disabled={!unlocked || busy}
              onClick={() => onToggleTitle(title.id)}
            >
              <span className="title-card-name">{title.name}</span>
              <span className="title-card-meta">
                {unlocked ? equipped ? 'Equipe' : 'Debloque' : 'Verrouille'} / {rarity.label}
              </span>
              <span className="title-card-desc">{title.description}</span>
              {unlocked && (
                <span className="title-card-action">
                  {busy ? '...' : equipped ? 'Retirer' : 'Equiper'}
                </span>
              )}
            </button>
          )
        })}
      </div>
      )}
    </div>
  )
}

function MultiplayerPanel({
  configured,
  user,
  open,
  role,
  session,
  onlinePlayers,
  incomingRequest,
  outgoingRequest,
  sessionConnectionState,
  sessionTransport,
  hasRemotePlayer,
  message,
  onToggle,
  onRequestVisit,
  onCancelVisit,
  onAcceptRequest,
  onRejectRequest,
  onLeaveSession,
}) {
  const sessionLabel = role === 'host'
    ? `${session?.guestDisplayName ?? 'Visiteur'} visite ton monde`
    : role === 'guest'
      ? `Tu visites ${session?.hostDisplayName ?? 'un monde'}`
      : null

  return (
    <div className={`multiplayer-panel ${open ? 'open' : ''}`}>
      <button className="multiplayer-toggle" type="button" onClick={onToggle} aria-label="Multijoueur">
        <span className={`multiplayer-dot ${role !== 'solo' ? 'connected' : ''}`} />
        <span>Visites</span>
      </button>
      {open && (
        <div className="multiplayer-menu">
          {!configured && <p className="multiplayer-help">Supabase doit etre configure pour les visites.</p>}
          {configured && !user && <p className="multiplayer-help">Connecte ton compte pour voir les joueurs en ligne.</p>}
          {configured && user && role !== 'solo' && (
            <div className="multiplayer-session-card">
              <strong>{sessionLabel}</strong>
              <span>{role === 'guest' ? 'Mode visite: modification bloquee.' : 'Tu peux modifier ton monde, le visiteur voit les changements.'}</span>
              <span>
                Canal: {sessionConnectionState === 'connected' ? 'connecte' : 'connexion...'}
                {sessionTransport !== 'none' ? ` (${sessionTransport})` : ''}
                {' / '}
                Joueur distant: {hasRemotePlayer ? 'recu' : 'en attente'}
              </span>
              <button type="button" onClick={onLeaveSession}>Quitter</button>
            </div>
          )}
          {configured && user && role === 'solo' && incomingRequest && (
            <div className="multiplayer-request-card">
              <strong>{incomingRequest.fromDisplayName} veut visiter ton monde.</strong>
              <div className="multiplayer-actions">
                <button type="button" onClick={onAcceptRequest}>Accepter</button>
                <button type="button" onClick={onRejectRequest}>Refuser</button>
              </div>
            </div>
          )}
          {configured && user && role === 'solo' && outgoingRequest && (
            <div className="multiplayer-request">
              <p className="multiplayer-help">Demande envoyee a {outgoingRequest.toDisplayName}.</p>
              <div className="multiplayer-actions">
                <button type="button" onClick={onCancelVisit}>Annuler la demande</button>
              </div>
            </div>
          )}
          {configured && user && role === 'solo' && (
            <>
              <div className="multiplayer-title">Joueurs en ligne</div>
              <div className="multiplayer-list">
                {onlinePlayers.length === 0 && <span className="multiplayer-empty">Personne d'autre en ligne pour l'instant.</span>}
                {onlinePlayers.map((player) => (
                  <button
                    key={player.userId}
                    type="button"
                    className="multiplayer-player"
                    onClick={() => onRequestVisit(player)}
                    disabled={Boolean(outgoingRequest)}
                  >
                    <span>{player.displayName}</span>
                    <small>{player.status === 'available' ? 'Disponible' : 'Occupe'}</small>
                  </button>
                ))}
              </div>
            </>
          )}
          {message && <div className="multiplayer-message">{message}</div>}
        </div>
      )}
    </div>
  )
}

function GameChatPanel({
  open,
  value,
  disabled,
  onOpen,
  onClose,
  onChange,
  onFocus,
  onSubmit,
}) {
  const inputRef = useRef(null)
  const autoFocusChat = !isLikelyMobileDevice()

  useLayoutEffect(() => {
    if (!open || !autoFocusChat) return undefined
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [autoFocusChat, open])

  if (!open) {
    return (
      <button className="game-chat-toggle" type="button" onClick={onOpen}>
        Message
      </button>
    )
  }

  return (
    <form className="game-chat-panel" onSubmit={onSubmit}>
      <button className="game-chat-close" type="button" onClick={onClose} aria-label="Fermer le message">
        ×
      </button>
      <input
        ref={inputRef}
        type="text"
        value={value}
        maxLength={CHAT_MAX_LENGTH}
        placeholder="Message..."
        aria-label="Message de chat"
        enterKeyHint="send"
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
        onFocus={(event) => {
          onFocus?.()
          if (isLikelyMobileDevice()) {
            event.currentTarget.focus({ preventScroll: true })
          }
        }}
        onKeyDown={(event) => {
          event.stopPropagation()
          if (event.key === 'Escape') onClose()
        }}
        onKeyUp={(event) => event.stopPropagation()}
      />
      <button className="game-chat-send" type="submit" disabled={disabled || !value.trim()}>
        Envoyer
      </button>
    </form>
  )
}

function roundNetValue(value, precision = 100) {
  return Math.round(value * precision) / precision
}

function roundNetVector(values, precision = 100) {
  return values.map((value) => roundNetValue(value, precision))
}

function MultiplayerBridge({
  channelRef,
  role,
  localUserId,
  playerPositionRef,
  playerVelocityRef,
  localPlayerStateRef,
  remoteBallStateRef,
  ballRef,
  guestKickQueueRef,
  hostTimeOffsetRef,
  equippedTitleId,
  equippedWeapon,
  characterAppearance,
  catActive = false,
  catNetworkStateRef = null,
}) {
  const lastSendRef = useRef(0)
  const lastBallSendRef = useRef(0)
  const lastGuestBallPushRef = useRef(0)
  const playerSeqRef = useRef(0)
  const ballSeqRef = useRef(0)
  const guestKickSeqRef = useRef(0)
  const lastRemoteBallSeqRef = useRef(-1)

  useFrame(({ clock }) => {
    const channel = channelRef.current
    if (!channel || role === 'solo' || !localUserId) return

    const now = clock.elapsedTime
    const estimatedHostTime = Date.now() + (hostTimeOffsetRef?.current ?? 0)

    const velocity = playerVelocityRef?.current ?? { x: 0, z: 0 }
    const motion = localPlayerStateRef.current.motion
    const mountState = localPlayerStateRef.current.mount
    const playerActive =
      Math.hypot(velocity.x, velocity.z) > 0.02 ||
      motion !== 'idle' ||
      Boolean(mountState?.moving || mountState?.airborne || mountState?.jumping)
    const playerSendInterval = playerActive
      ? MULTIPLAYER_PLAYER_SEND_INTERVAL
      : (catActive ? MULTIPLAYER_PLAYER_PET_SEND_INTERVAL : MULTIPLAYER_PLAYER_IDLE_SEND_INTERVAL)

    if (now - lastSendRef.current > playerSendInterval) {
      const position = playerPositionRef.current
      const catState = catActive ? catNetworkStateRef?.current : null
      channel.sendPlayerState({
        seq: playerSeqRef.current++,
        hostTime: estimatedHostTime,
        position: roundNetVector([position.x, position.y, position.z]),
        rotationY: localPlayerStateRef.current.rotationY,
        velocity: roundNetVector([velocity.x, 0, velocity.z]),
        grounded: true,
        motion,
        zone: localPlayerStateRef.current.zone,
        mount: mountState
          ? {
              id: mountState.id,
              position: roundNetVector(mountState.position),
              yaw: mountState.yaw,
              airborne: mountState.airborne,
              moving: mountState.moving,
              movingForward: mountState.movingForward,
              jumping: mountState.jumping,
            }
          : null,
        catActive: catActive === true,
        cat: catState?.position
          ? {
              position: roundNetVector(catState.position),
              rotationY: roundNetValue(catState.rotationY ?? 0),
              motion: catState.motion ?? 'Idle',
            }
          : null,
        equippedWeapon,
        equippedTitleId,
        characterAppearance,
        sentAt: estimatedHostTime,
      })
      lastSendRef.current = now
    }

    const ball = ballRef.current
    if (!ball) return

    if (role === 'host') {
      const nextKick = guestKickQueueRef.current.shift()
      if (nextKick?.impulse) {
        ball.applyImpulse(nextKick.impulse, true)
      }

      const p = ball.translation()
      const v = ball.linvel()
      const a = ball.angvel()
      const isBallActive = Math.hypot(v.x, v.y, v.z) > 0.08 || Math.hypot(a.x, a.y, a.z) > 0.08
      const ballInterval = isBallActive ? MULTIPLAYER_BALL_ACTIVE_SEND_INTERVAL : MULTIPLAYER_BALL_SLEEP_SEND_INTERVAL

      if (now - lastBallSendRef.current > ballInterval) {
        channel.sendBallState({
          seq: ballSeqRef.current++,
          hostTime: Date.now(),
          position: roundNetVector([p.x, p.y, p.z]),
          linvel: roundNetVector([v.x, v.y, v.z]),
          angvel: roundNetVector([a.x, a.y, a.z]),
          sentAt: Date.now(),
        })
        lastBallSendRef.current = now
      }
      return
    }

    const remoteBallState = remoteBallStateRef.current
    if (
      role === 'guest' &&
      remoteBallState?.position &&
      (remoteBallState.seq ?? 0) > lastRemoteBallSeqRef.current
    ) {
      const [x, y, z] = remoteBallState.position ?? []
      const [vx, vy, vz] = remoteBallState.linvel ?? []
      const [ax, ay, az] = remoteBallState.angvel ?? []
      if ([x, y, z].every(Number.isFinite)) {
        const localPosition = ball.translation()
        const error = Math.hypot(localPosition.x - x, localPosition.y - y, localPosition.z - z)
        const correction = error < 0.5 ? 0.22 : error < 1.6 ? 0.55 : 1
        ball.setTranslation({
          x: MathUtils.lerp(localPosition.x, x, correction),
          y: MathUtils.lerp(localPosition.y, y, correction),
          z: MathUtils.lerp(localPosition.z, z, correction),
        }, true)
      }
      if ([vx, vy, vz].every(Number.isFinite)) {
        const localVelocity = ball.linvel()
        ball.setLinvel({
          x: MathUtils.lerp(localVelocity.x, vx, 0.35),
          y: MathUtils.lerp(localVelocity.y, vy, 0.35),
          z: MathUtils.lerp(localVelocity.z, vz, 0.35),
        }, true)
      }
      if ([ax, ay, az].every(Number.isFinite)) {
        const localAngularVelocity = ball.angvel()
        ball.setAngvel({
          x: MathUtils.lerp(localAngularVelocity.x, ax, 0.35),
          y: MathUtils.lerp(localAngularVelocity.y, ay, 0.35),
          z: MathUtils.lerp(localAngularVelocity.z, az, 0.35),
        }, true)
      }
      lastRemoteBallSeqRef.current = remoteBallState.seq ?? lastRemoteBallSeqRef.current
    }

    if (role === 'guest' && now - lastGuestBallPushRef.current > 0.11) {
      const playerPosition = playerPositionRef.current
      const playerVelocity = playerVelocityRef?.current
      const ballPosition = ball.translation()
      const dx = ballPosition.x - playerPosition.x
      const dz = ballPosition.z - playerPosition.z
      const distance = Math.hypot(dx, dz)
      const playerSpeed = Math.hypot(playerVelocity?.x ?? 0, playerVelocity?.z ?? 0)

      if (distance > 0.001 && distance < 0.48 && playerSpeed > 0.55) {
        const inv = 1 / distance
        const speedScale = MathUtils.clamp(playerSpeed / 3.4, 0.25, 1)
        const impulse = {
          x: dx * inv * 0.045 * speedScale,
          y: 0.012,
          z: dz * inv * 0.045 * speedScale,
        }
        ball.applyImpulse(impulse, true)
        channel.sendGuestKick({
          seq: guestKickSeqRef.current++,
          hostTime: estimatedHostTime,
          impulse,
          kind: 'body-push',
        })
        lastGuestBallPushRef.current = now
      }
    }
  })

  return null
}

// Halo d'interaction : anneau au sol qui s'agrandit et pulse quand on approche
function InteractionHalo({ isNear, color = '#ffffff', pulseColor, position, size = 1 }) {
  const outerRef = useRef()
  const innerRef = useRef()
  const scaleRef = useRef(0.35)
  const pulseRef = useRef(0)
  const innerRadius = 0.28 * size
  const outerInnerRadius = 0.28 * size
  const outerOuterRadius = 0.42 * size

  useFrame((_, delta) => {
    const target = isNear ? 1 : 0.35
    scaleRef.current += (target - scaleRef.current) * Math.min(1, 8 * delta)
    const s = scaleRef.current
    if (outerRef.current) outerRef.current.scale.set(s, s, 1)
    if (innerRef.current) {
      if (isNear) {
        pulseRef.current += delta * 2.2
        const pulse = 0.6 + 0.4 * Math.sin(pulseRef.current)
        innerRef.current.scale.set(s * pulse, s * pulse, 1)
        innerRef.current.material.opacity = 0.35 * pulse
      } else {
        pulseRef.current = 0
        innerRef.current.scale.set(s * 0.6, s * 0.6, 1)
        innerRef.current.material.opacity = 0
      }
    }
  })

  const pc = pulseColor ?? color

  return (
    <group position={position} rotation={[-Math.PI / 2, 0, 0]}>
      {/* Anneau principal */}
      <mesh ref={outerRef}>
        <ringGeometry args={[outerInnerRadius, outerOuterRadius, 48]} />
        <meshBasicMaterial color={color} transparent opacity={0.75} depthWrite={false} />
      </mesh>
      {/* Disque intérieur pulsé */}
      <mesh ref={innerRef}>
        <circleGeometry args={[innerRadius, 48]} />
        <meshBasicMaterial color={pc} transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  )
}

function BallStation({ isNear, goalObject }) {
  const BALL_SIDE_OFFSET = 2.0
  const gx = goalObject?.position?.[0] ?? 0
  const gz = goalObject?.position?.[2] ?? GOAL_Z
  const rotY = goalObject?.rotationY ?? 0
  const tx = gx - Math.cos(rotY) * BALL_SIDE_OFFSET
  const tz = gz + Math.sin(rotY) * BALL_SIDE_OFFSET
  return (
    <InteractionHalo
      isNear={isNear}
      color="#a8c4e0"
      pulseColor="#d0e8ff"
      position={[tx, 0.02, tz]}
    />
  )
}

function EnvironmentStation({ isNear }) {
  return (
    <InteractionHalo
      isNear={isNear}
      color="#a0d4b8"
      pulseColor="#c8f0d8"
      position={[ENV_STATION_POSITION.x, 0.02, ENV_STATION_POSITION.z]}
    />
  )
}

function CustomizationStation({ isNear }) {
  return (
    <InteractionHalo
      isNear={isNear}
      color="#f2c14e"
      pulseColor="#ffe599"
      position={[CUSTOM_STATION_POSITION.x, 0.02, CUSTOM_STATION_POSITION.z]}
    />
  )
}

function OutdoorDoor() {
  const doorWidth = outsideDoorOpening.width
  const doorHeight = outsideDoorOpening.height
  const doorY = (outsideDoorOpening.bottomY ?? 0) + doorHeight * 0.5

  return (
    <group position={[OUTDOOR_DOOR_POSITION.x, 0, OUTDOOR_DOOR_POSITION.z]} rotation={[0, Math.PI / 2, 0]}>
      <mesh position={[0, doorY, 0.02]}>
        <planeGeometry args={[doorWidth, doorHeight]} />
        <meshStandardMaterial color="#8b5a3d" roughness={0.66} side={DoubleSide} />
      </mesh>
      <mesh position={[doorWidth * 0.34, doorY, 0.06]}>
        <sphereGeometry args={[0.055, 12, 8]} />
        <meshStandardMaterial color="#f1c45b" metalness={0.25} roughness={0.35} />
      </mesh>
    </group>
  )
}

function OutdoorDoorStation({ isNear, currentZone }) {
  const isOutside = currentZone === ZONES.outside

  return (
    <>
      <InteractionHalo
        isNear={!isOutside && isNear}
        color="#c9b08a"
        pulseColor="#ffe8c8"
        position={[OUTDOOR_EXIT_POSITION.x, 0.02, OUTDOOR_EXIT_POSITION.z]}
        size={0.62}
      />
      <InteractionHalo
        isNear={isOutside && isNear}
        color="#c9b08a"
        pulseColor="#ffe8c8"
        position={[OUTDOOR_ENTRY_POSITION.x, 0.02, OUTDOOR_ENTRY_POSITION.z]}
        size={0.62}
      />
    </>
  )
}

function OutdoorDoorTrigger({ playerPositionRef, currentZone, onNearChange }) {
  const wasNearRef = useRef(false)

  useFrame(() => {
    const p = playerPositionRef.current
    const target = currentZone === ZONES.outside ? OUTDOOR_ENTRY_POSITION : OUTDOOR_EXIT_POSITION
    const near = Math.hypot(p.x - target.x, p.z - target.z) < DOOR_INTERACTION_DISTANCE
    if (near !== wasNearRef.current) {
      wasNearRef.current = near
      onNearChange(near)
    }
  })

  return null
}

function BallStationTrigger({ playerPositionRef, goalObject, onNearChange }) {
  const wasNearRef = useRef(false)
  const BALL_SIDE_OFFSET = 2.0

  useFrame(() => {
    const p = playerPositionRef.current
    const gx = goalObject?.position?.[0] ?? 0
    const gz = goalObject?.position?.[2] ?? GOAL_Z
    const rotY = goalObject?.rotationY ?? 0
    const tx = gx - Math.cos(rotY) * BALL_SIDE_OFFSET
    const tz = gz + Math.sin(rotY) * BALL_SIDE_OFFSET
    const near = Math.hypot(p.x - tx, p.z - tz) < 1.6
    if (near !== wasNearRef.current) {
      wasNearRef.current = near
      onNearChange(near)
    }
  })

  return null
}

function EnvironmentStationTrigger({ playerPositionRef, onNearChange }) {
  const wasNearRef = useRef(false)

  useFrame(() => {
    const p = playerPositionRef.current
    const d = Math.hypot(p.x - ENV_STATION_POSITION.x, p.z - ENV_STATION_POSITION.z)
    const near = d < 1.45
    if (near !== wasNearRef.current) {
      wasNearRef.current = near
      onNearChange(near)
    }
  })

  return null
}

function CustomizationStationTrigger({ playerPositionRef, onNearChange, enabled }) {
  const wasNearRef = useRef(false)

  useFrame(() => {
    if (!enabled) {
      if (wasNearRef.current) {
        wasNearRef.current = false
        onNearChange(false)
      }
      return
    }

    const p = playerPositionRef.current
    const d = Math.hypot(p.x - CUSTOM_STATION_POSITION.x, p.z - CUSTOM_STATION_POSITION.z)
    const near = d < 1.55
    if (near !== wasNearRef.current) {
      wasNearRef.current = near
      onNearChange(near)
    }
  })

  return null
}

function SeatInteractionTrigger({ playerPositionRef, objects, seatedState, onNearbySeatChange }) {
  const currentSeatIdRef = useRef(null)

  useFrame(() => {
    if (seatedState?.phase) {
      if (currentSeatIdRef.current !== null) {
        currentSeatIdRef.current = null
        onNearbySeatChange(null)
      }
      return
    }

    const playerPosition = playerPositionRef.current
    let nearestSeat = null
    let nearestDistance = Infinity

    objects.forEach((object) => {
      object.seats?.forEach((seat) => {
        const worldSeat = getSeatWorldData(object, seat)
        const interactionDistance = seat.interactionDistance ?? SEAT_INTERACTION_DISTANCE
        const distance = Math.hypot(
          playerPosition.x - worldSeat.position[0],
          playerPosition.z - worldSeat.position[2],
        )

        if (distance <= interactionDistance && distance < nearestDistance) {
          nearestDistance = distance
          nearestSeat = worldSeat
        }
      })
    })

    const nextSeat = nearestSeat
    if ((nextSeat?.id ?? null) !== currentSeatIdRef.current) {
      currentSeatIdRef.current = nextSeat?.id ?? null
      onNearbySeatChange(nextSeat)
    }
  })

  return null
}

function TvInteractionTrigger({ playerPositionRef, objects, enabled, onNearbyTvChange }) {
  const currentTvIdRef = useRef(null)

  useFrame(() => {
    if (!enabled) {
      if (currentTvIdRef.current !== null) {
        currentTvIdRef.current = null
        onNearbyTvChange(null)
      }
      return
    }

    const playerPosition = playerPositionRef.current
    let nearestTv = null
    let nearestDistance = Infinity

    objects.forEach((object) => {
      const catalogItem = objectCatalog[object.objectId]
      if (catalogItem?.type !== 'interactive_tv' || !object.position) return

      const distance = Math.hypot(
        playerPosition.x - object.position[0],
        playerPosition.z - object.position[2],
      )

      if (distance <= TV_INTERACTION_DISTANCE && distance < nearestDistance) {
        nearestDistance = distance
        nearestTv = object
      }
    })

    const nextTvId = nearestTv?.id ?? null
    if (nextTvId !== currentTvIdRef.current) {
      currentTvIdRef.current = nextTvId
      onNearbyTvChange(nearestTv)
    }
  })

  return null
}

function SeatTargetMarker({ seat }) {
  if (!seat) return null
  return (
    <InteractionHalo
      isNear={true}
      color="#ffd447"
      pulseColor="#fff0a0"
      position={[seat.position[0], 0.02, seat.position[2]]}
    />
  )
}

const CUSTOMIZE_ZOOM_MIN = 20
const CUSTOMIZE_ZOOM_MAX = 150
const CUSTOMIZE_ZOOM_DEFAULT = 58

function CustomizationCamera({ active }) {
  const { gl } = useThree()
  const camRef = useRef()
  const zoomRef = useRef(CUSTOMIZE_ZOOM_DEFAULT)
  const pinchDistRef = useRef(null)

  useEffect(() => {
    if (active) zoomRef.current = CUSTOMIZE_ZOOM_DEFAULT
  }, [active])

  useEffect(() => {
    if (!active) return
    const canvas = gl.domElement

    const onWheel = (e) => {
      e.preventDefault()
      zoomRef.current = MathUtils.clamp(
        zoomRef.current + Math.sign(e.deltaY) * -5,
        CUSTOMIZE_ZOOM_MIN,
        CUSTOMIZE_ZOOM_MAX,
      )
    }

    const onTouchStart = (e) => {
      if (e.touches.length === 2) {
        pinchDistRef.current = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY,
        )
      }
    }

    const onTouchMove = (e) => {
      if (e.touches.length !== 2 || pinchDistRef.current === null) return
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      )
      zoomRef.current = MathUtils.clamp(
        zoomRef.current + (dist - pinchDistRef.current) * 0.3,
        CUSTOMIZE_ZOOM_MIN,
        CUSTOMIZE_ZOOM_MAX,
      )
      pinchDistRef.current = dist
    }

    const onTouchEnd = () => { pinchDistRef.current = null }

    canvas.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('touchstart', onTouchStart, { passive: true })
    canvas.addEventListener('touchmove', onTouchMove, { passive: true })
    canvas.addEventListener('touchend', onTouchEnd, { passive: true })

    return () => {
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('touchstart', onTouchStart)
      canvas.removeEventListener('touchmove', onTouchMove)
      canvas.removeEventListener('touchend', onTouchEnd)
    }
  }, [active, gl])

  useFrame(() => {
    if (!camRef.current) return
    if (Math.abs(camRef.current.zoom - zoomRef.current) > 0.1) {
      camRef.current.zoom = MathUtils.lerp(camRef.current.zoom, zoomRef.current, 0.15)
      camRef.current.updateProjectionMatrix()
    }
  })

  return (
    <OrthographicCamera
      ref={camRef}
      makeDefault={active}
      position={[0, 18, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      zoom={CUSTOMIZE_ZOOM_DEFAULT}
      near={0.1}
      far={60}
    />
  )
}

function SofaModel() {
  const model = useFBX('/models/placeables/modular-sofa/modular-sofa.fbx')
  const texture = useTexture('/models/placeables/modular-sofa/tripo_convert_9412eb1b-7c85-49b7-86b8-96b1b5cc9732.fbm/modularsofa3dmodel_basecolor.JPEG')
  const sofa = useMemo(() => {
    const object = clone(model)
    texture.colorSpace = SRGBColorSpace
    texture.needsUpdate = true

    object.traverse((child) => {
      if (child instanceof Mesh) {
        child.castShadow = true
        child.receiveShadow = true
        if (child.material) {
          child.material = child.material.clone()
          child.material.map = texture
          child.material.needsUpdate = true
        }
      }
    })

    object.updateWorldMatrix(true, true)
    const box = new Box3().setFromObject(object)
    const size = box.getSize(new Vector3())
    const center = box.getCenter(new Vector3())
    const longestSide = Math.max(size.x, size.z, 0.001)
    const targetWidth = SOFA_WIDTH_METERS * WORLD_UNITS_PER_METER
    const scale = targetWidth / longestSide

    return {
      object,
      offset: [-center.x, -box.min.y, -center.z],
      scale,
    }
  }, [model, texture])

  return (
    <group scale={sofa.scale}>
      <primitive object={sofa.object} position={sofa.offset} />
    </group>
  )
}

function getMergeCompatibilityKey(mesh) {
  if (!mesh.geometry || !mesh.material || Array.isArray(mesh.material)) return null
  if (mesh.isSkinnedMesh || mesh.morphTargetInfluences) return null

  const attributeSignature = Object.entries(mesh.geometry.attributes)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, attribute]) => (
      `${name}:${attribute.array.constructor.name}:${attribute.itemSize}:${attribute.normalized ? 1 : 0}`
    ))
    .join('|')

  return [
    mesh.material.uuid,
    mesh.geometry.index ? 'indexed' : 'plain',
    attributeSignature,
  ].join(':')
}

function mergeStaticModelMeshes(root) {
  root.updateWorldMatrix(true, true)
  const rootInverse = root.matrixWorld.clone().invert()
  const batches = new Map()

  root.traverse((child) => {
    if (!(child instanceof Mesh) || !child.visible) return
    const key = getMergeCompatibilityKey(child)
    if (!key) return
    const batch = batches.get(key) ?? []
    batch.push(child)
    batches.set(key, batch)
  })

  batches.forEach((meshes) => {
    if (meshes.length < 2) return

    const geometries = meshes.map((mesh) => {
      const geometry = mesh.geometry.clone()
      const relativeMatrix = rootInverse.clone().multiply(mesh.matrixWorld)
      geometry.applyMatrix4(relativeMatrix)
      return geometry
    })
    const mergedGeometry = mergeGeometries(geometries, false)
    geometries.forEach((geometry) => geometry.dispose())
    if (!mergedGeometry) return

    const mergedMesh = new Mesh(mergedGeometry, meshes[0].material)
    mergedMesh.name = `Merged_${meshes[0].material.name || meshes[0].material.uuid}`
    mergedMesh.castShadow = meshes.some((mesh) => mesh.castShadow)
    mergedMesh.receiveShadow = meshes.some((mesh) => mesh.receiveShadow)
    meshes.forEach((mesh) => mesh.removeFromParent())
    root.add(mergedMesh)
  })

  return root
}

function GlbPlaceableModel({ objectId }) {
  const catalogItem = objectCatalog[objectId]
  const gltf = useGLTF(catalogItem.modelUrl)
  const model = useMemo(() => {
    const object = clone(gltf.scene)

    object.traverse((child) => {
      if (child instanceof Mesh) {
        child.castShadow = true
        child.receiveShadow = true
      }
    })
    mergeStaticModelMeshes(object)

    object.updateWorldMatrix(true, true)
    const box = new Box3().setFromObject(object)
    const size = box.getSize(new Vector3())
    const center = box.getCenter(new Vector3())
    const targetWidth = (catalogItem.targetWidthMeters ?? 0) * WORLD_UNITS_PER_METER
    const targetHeight = (catalogItem.targetHeightMeters ?? 0) * WORLD_UNITS_PER_METER
    const horizontalSize = Math.max(size.x, size.z, 0.001)
    const sourceSize = targetHeight > 0 ? Math.max(size.y, 0.001) : horizontalSize
    const targetSize = targetHeight > 0 ? targetHeight : targetWidth
    const scale = targetSize > 0 ? targetSize / sourceSize : 1

    return {
      object,
      offset: [-center.x, -box.min.y, -center.z],
      scale,
    }
  }, [catalogItem.targetHeightMeters, catalogItem.targetWidthMeters, gltf.scene])

  return (
    <group scale={model.scale} rotation={[0, catalogItem.modelRotationY ?? 0, 0]}>
      <primitive object={model.object} position={model.offset} />
    </group>
  )
}

function getNamedScreenInfo(object, offset, screenName = 'TV_SCREEN') {
  const screen = object.getObjectByName(screenName)
  if (!screen) return null

  object.updateWorldMatrix(true, true)
  screen.updateWorldMatrix(true, false)

  const position = new Vector3()
  const quaternion = new Quaternion()
  const scale = new Vector3()
  screen.matrixWorld.decompose(position, quaternion, scale)

  let width = 1
  let height = 0.56
  let screenQuaternion = quaternion.clone()
  const screenBox = new Box3().setFromObject(screen)
  if (!screenBox.isEmpty()) {
    position.copy(screenBox.getCenter(new Vector3()))
  }

  if (screen.geometry) {
    screen.geometry.computeBoundingBox()
    const size = new Vector3()
    screen.geometry.boundingBox.getSize(size)
    const dimensions = [
      { axis: new Vector3(1, 0, 0).applyQuaternion(quaternion).normalize(), size: Math.abs(size.x * scale.x) },
      { axis: new Vector3(0, 1, 0).applyQuaternion(quaternion).normalize(), size: Math.abs(size.y * scale.y) },
      { axis: new Vector3(0, 0, 1).applyQuaternion(quaternion).normalize(), size: Math.abs(size.z * scale.z) },
    ].sort((a, b) => b.size - a.size)
    const widthDimension = dimensions[0]
    const heightDimension = dimensions[1]
    const normalDimension = dimensions[2]
    const normalAxis = new Vector3().crossVectors(widthDimension.axis, heightDimension.axis).normalize()
    if (normalAxis.dot(normalDimension.axis) < 0) normalAxis.negate()
    const basis = new Matrix4().makeBasis(widthDimension.axis, heightDimension.axis, normalAxis)
    screenQuaternion = new Quaternion().setFromRotationMatrix(basis)
    width = Math.max(widthDimension.size, 0.01)
    height = Math.max(heightDimension.size, 0.01)
  } else if (!screenBox.isEmpty()) {
    const worldSize = screenBox.getSize(new Vector3())
    const dimensions = [worldSize.x, worldSize.y, worldSize.z].sort((a, b) => b - a)
    width = Math.max(dimensions[0], 0.01)
    height = Math.max(dimensions[1], 0.01)
  }

  screen.traverse((child) => {
    child.visible = false
  })

  const normal = new Vector3(0, 0, 1).applyQuaternion(screenQuaternion)
  position.add(new Vector3(offset[0], offset[1], offset[2]))
  position.add(normal.multiplyScalar(0.008))

  return {
    position: position.toArray(),
    quaternion: screenQuaternion,
    width,
    height,
  }
}

function InteractiveTvModel({ objectId, placedObjectId }) {
  const catalogItem = objectCatalog[objectId]
  const gltf = useGLTF(catalogItem.modelUrl)
  const model = useMemo(() => {
    const object = clone(gltf.scene)

    object.traverse((child) => {
      if (child instanceof Mesh) {
        child.castShadow = true
        child.receiveShadow = true
      }
    })

    object.updateWorldMatrix(true, true)
    const box = new Box3().setFromObject(object)
    const size = box.getSize(new Vector3())
    const center = box.getCenter(new Vector3())
    const targetWidth = (catalogItem.targetWidthMeters ?? 0) * WORLD_UNITS_PER_METER
    const horizontalSize = Math.max(size.x, size.z, 0.001)
    const scale = targetWidth > 0 ? targetWidth / horizontalSize : 1
    const offset = [-center.x, -box.min.y, -center.z]
    const namedScreenInfo = getNamedScreenInfo(object, offset, catalogItem.screenName ?? 'TV_SCREEN')
    const fallbackScreen = catalogItem.screen
    const fallbackScreenInfo = fallbackScreen
      ? {
          position: fallbackScreen.position ?? [0.045, 0.78, 0],
          quaternion: new Quaternion().setFromEuler(new Euler(
            fallbackScreen.rotation?.[0] ?? 0,
            fallbackScreen.rotation?.[1] ?? Math.PI / 2,
            fallbackScreen.rotation?.[2] ?? 0,
          )),
          width: fallbackScreen.size?.[0] ?? 1.16,
          height: fallbackScreen.size?.[1] ?? 0.65,
        }
      : null

    return {
      object,
      offset,
      scale,
      screenInfo: namedScreenInfo ?? fallbackScreenInfo,
    }
  }, [catalogItem.screen, catalogItem.screenName, catalogItem.targetWidthMeters, gltf.scene])

  return (
    <group scale={model.scale} rotation={[0, catalogItem.modelRotationY ?? 0, 0]}>
      <primitive object={model.object} position={model.offset} />
      {model.screenInfo && (
        <InteractiveTvScreen screenInfo={model.screenInfo} tvInstanceId={placedObjectId} />
      )}
    </group>
  )
}

function RugModel({ objectId }) {
  const catalogItem = objectCatalog[objectId]
  const texture = useTexture(catalogItem.imageUrl)
  const imageWidth = texture.image?.naturalWidth ?? texture.image?.width ?? 1
  const imageHeight = texture.image?.naturalHeight ?? texture.image?.height ?? 1
  const aspect = Math.max(imageWidth / Math.max(imageHeight, 1), 0.01)
  const longSide = (catalogItem.targetLongSideMeters ?? 2.15) * WORLD_UNITS_PER_METER
  const width = aspect >= 1 ? longSide : longSide * aspect
  const depth = aspect >= 1 ? longSide / aspect : longSide
  const thickness = 0.009 * WORLD_UNITS_PER_METER
  const cornerRadius = Math.min(width, depth) * 0.055
  const rugShape = useMemo(() => {
    const shape = new Shape()
    const halfWidth = width / 2
    const halfDepth = depth / 2

    shape.moveTo(-halfWidth + cornerRadius, -halfDepth)
    shape.lineTo(halfWidth - cornerRadius, -halfDepth)
    shape.quadraticCurveTo(halfWidth, -halfDepth, halfWidth, -halfDepth + cornerRadius)
    shape.lineTo(halfWidth, halfDepth - cornerRadius)
    shape.quadraticCurveTo(halfWidth, halfDepth, halfWidth - cornerRadius, halfDepth)
    shape.lineTo(-halfWidth + cornerRadius, halfDepth)
    shape.quadraticCurveTo(-halfWidth, halfDepth, -halfWidth, halfDepth - cornerRadius)
    shape.lineTo(-halfWidth, -halfDepth + cornerRadius)
    shape.quadraticCurveTo(-halfWidth, -halfDepth, -halfWidth + cornerRadius, -halfDepth)

    return shape
  }, [cornerRadius, depth, width])
  const rugCornerMask = useMemo(() => {
    const maskCanvas = document.createElement('canvas')
    const maskSize = 256
    const maskContext = maskCanvas.getContext('2d')
    const maskRadius = maskSize * (cornerRadius / Math.min(width, depth))

    maskCanvas.width = maskSize
    maskCanvas.height = maskSize
    maskContext.fillStyle = '#fff'
    maskContext.beginPath()
    maskContext.moveTo(maskRadius, 0)
    maskContext.lineTo(maskSize - maskRadius, 0)
    maskContext.quadraticCurveTo(maskSize, 0, maskSize, maskRadius)
    maskContext.lineTo(maskSize, maskSize - maskRadius)
    maskContext.quadraticCurveTo(maskSize, maskSize, maskSize - maskRadius, maskSize)
    maskContext.lineTo(maskRadius, maskSize)
    maskContext.quadraticCurveTo(0, maskSize, 0, maskSize - maskRadius)
    maskContext.lineTo(0, maskRadius)
    maskContext.quadraticCurveTo(0, 0, maskRadius, 0)
    maskContext.closePath()
    maskContext.fill()

    const mask = new CanvasTexture(maskCanvas)
    mask.minFilter = LinearFilter
    mask.magFilter = LinearFilter
    return mask
  }, [cornerRadius, depth, width])
  const rugExtrudeSettings = useMemo(() => ({
    bevelEnabled: true,
    bevelSegments: 3,
    bevelSize: thickness * 0.38,
    bevelThickness: thickness * 0.36,
    curveSegments: 10,
    depth: thickness,
    steps: 1,
  }), [thickness])
  const edgeColor = '#7d725c'
  const undersideColor = '#564f43'

  return (
    <group position={[0, 0.006, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <extrudeGeometry args={[rugShape, rugExtrudeSettings]} />
        <meshStandardMaterial color={edgeColor} roughness={0.98} />
      </mesh>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, thickness + rugExtrudeSettings.bevelThickness + 0.002, 0]}
        receiveShadow
      >
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial
          map={texture}
          alphaMap={rugCornerMask}
          alphaTest={0.01}
          roughness={0.98}
          metalness={0}
          side={DoubleSide}
          transparent
        />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -0.002, 0]}>
        <shapeGeometry args={[rugShape]} />
        <meshStandardMaterial color={undersideColor} roughness={1} side={DoubleSide} />
      </mesh>
    </group>
  )
}

function PlaceableModel({ objectId, type, placedObjectId }) {
  const catalogItem = objectCatalog[objectId]
  if (type === 'goal' || catalogItem?.type === 'goal') return <GoalVisual />
  if (type === 'rug' || catalogItem?.type === 'rug') return <RugModel objectId={objectId} />
  if (catalogItem?.type === 'interactive_tv') return <InteractiveTvModel objectId={objectId} placedObjectId={placedObjectId} />
  if (catalogItem?.modelUrl) return <GlbPlaceableModel objectId={objectId} />
  if (type === 'sofa' || catalogItem?.type === 'sofa') return <SofaModel />
  return null
}

function applyTrainingDummyBendMaterial(material, uniforms, minY, maxY) {
  const nextMaterial = material.clone()
  nextMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uDummyLean = uniforms.uDummyLean
    shader.uniforms.uDummyMinY = { value: minY }
    shader.uniforms.uDummyMaxY = { value: maxY }
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
      uniform vec2 uDummyLean;
      uniform float uDummyMinY;
      uniform float uDummyMaxY;`,
    )
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      float dummyHeightT = clamp((position.y - uDummyMinY) / max(uDummyMaxY - uDummyMinY, 0.0001), 0.0, 1.0);
      float dummyBend = smoothstep(0.24, 1.0, dummyHeightT);
      transformed.x += uDummyLean.x * dummyBend * dummyBend;
      transformed.z += uDummyLean.y * dummyBend * dummyBend;`,
    )
  }
  nextMaterial.needsUpdate = true
  return nextMaterial
}

function TrainingDummyModel({ object, registerCombatTarget, onDefeated }) {
  const catalogItem = objectCatalog[object.objectId]
  const gltf = useGLTF(catalogItem.modelUrl)
  const maxHp = catalogItem.combat?.maxHp ?? 100
  const [hp, setHp] = useState(maxHp)
  const [damageNumbers, setDamageNumbers] = useState([])
  const [flash, setFlash] = useState(false)
  const [defeated, setDefeated] = useState(false)
  const [hudVisible, setHudVisible] = useState(false)
  const hpRef = useRef(maxHp)
  const defeatedRef = useRef(false)
  const resetTimerRef = useRef(null)
  const flashTimerRef = useRef(null)
  const hudTimerRef = useRef(null)
  const leanRef = useRef({ x: 0, z: 0 })
  const leanVelocityRef = useRef({ x: 0, z: 0 })
  const targetRef = useRef({
    id: object.id,
    position: { x: 0, y: 0, z: 0 },
    radius: catalogItem.combat?.radius ?? 0.5,
    height: catalogItem.combat?.height ?? 1.9,
    disabled: false,
    takeDamage: null,
  })
  const uniforms = useMemo(() => ({
    uDummyLean: { value: new Vector2(0, 0) },
  }), [])

  const model = useMemo(() => {
    const source = clone(gltf.scene)
    source.updateWorldMatrix(true, true)
    const box = new Box3().setFromObject(source)
    const size = box.getSize(new Vector3())
    const center = box.getCenter(new Vector3())
    const targetHeight = (catalogItem.targetHeightMeters ?? 1.55) * WORLD_UNITS_PER_METER
    const scale = targetHeight / Math.max(size.y, 0.001)

    source.traverse((child) => {
      if (child instanceof Mesh) {
        child.castShadow = true
        child.receiveShadow = true
        child.frustumCulled = false
        if (Array.isArray(child.material)) {
          child.material = child.material.map((material) => applyTrainingDummyBendMaterial(material, uniforms, box.min.y, box.max.y))
        } else if (child.material) {
          child.material = applyTrainingDummyBendMaterial(child.material, uniforms, box.min.y, box.max.y)
        }
      }
    })

    return {
      object: source,
      offset: [-center.x, -box.min.y, -center.z],
      scale,
    }
  }, [catalogItem.modelUrl, catalogItem.targetHeightMeters, gltf.scene, uniforms])

  const takeDamage = useCallback(({ damage = PLAYER_PUNCH_DAMAGE, direction = { x: 0, z: 1 } }) => {
    if (defeatedRef.current) return false

    const rotationY = object.rotationY ?? 0
    const cos = Math.cos(rotationY)
    const sin = Math.sin(rotationY)
    const localX = direction.x * cos - direction.z * sin
    const localZ = direction.x * sin + direction.z * cos
    leanVelocityRef.current.x -= localX * 7.2
    leanVelocityRef.current.z -= localZ * 7.2

    setHudVisible(true)
    setFlash(true)
    if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current)
    flashTimerRef.current = window.setTimeout(() => setFlash(false), 130)

    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    setDamageNumbers((current) => [
      ...current,
      {
        id,
        value: damage,
        x: (Math.random() - 0.5) * 0.34,
        y: 1.42 + Math.random() * 0.18,
        z: (Math.random() - 0.5) * 0.22,
        duration: 680,
      },
    ])
    window.setTimeout(() => {
      setDamageNumbers((current) => current.filter((number) => number.id !== id))
    }, 720)

    setHp((current) => {
      const nextHp = Math.max(0, current - damage)
      hpRef.current = nextHp
      if (nextHp <= 0 && !defeatedRef.current) {
        defeatedRef.current = true
        setDefeated(true)
        onDefeated?.({
          objectId: object.id,
          position: object.position ?? [0, 0, 0],
          reward: 50,
        })
        if (hudTimerRef.current) window.clearTimeout(hudTimerRef.current)
        if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current)
        resetTimerRef.current = window.setTimeout(() => {
          defeatedRef.current = false
          hpRef.current = maxHp
          leanRef.current.x = 0
          leanRef.current.z = 0
          leanVelocityRef.current.x = 0
          leanVelocityRef.current.z = 0
          uniforms.uDummyLean.value.set(0, 0)
          setHp(maxHp)
          setDefeated(false)
          setHudVisible(false)
        }, 1200)
      } else if (nextHp > 0) {
        if (hudTimerRef.current) window.clearTimeout(hudTimerRef.current)
        hudTimerRef.current = window.setTimeout(() => setHudVisible(false), 2200)
      }
      return nextHp
    })

    return true
  }, [maxHp, object.id, object.position, object.rotationY, onDefeated, uniforms.uDummyLean])

  useEffect(() => {
    if (!registerCombatTarget) return undefined
    return registerCombatTarget(object.id, targetRef.current)
  }, [object.id, registerCombatTarget])

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current)
      if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current)
      if (hudTimerRef.current) window.clearTimeout(hudTimerRef.current)
    }
  }, [])

  useFrame((_, delta) => {
    const lean = leanRef.current
    const velocity = leanVelocityRef.current
    const spring = 42
    const damping = 6.4

    velocity.x += -lean.x * spring * delta
    velocity.z += -lean.z * spring * delta
    const dampingFactor = Math.exp(-damping * delta)
    velocity.x *= dampingFactor
    velocity.z *= dampingFactor
    lean.x = MathUtils.clamp(lean.x + velocity.x * delta, -0.62, 0.62)
    lean.z = MathUtils.clamp(lean.z + velocity.z * delta, -0.62, 0.62)
    uniforms.uDummyLean.value.set(lean.x, lean.z)
  })

  const position = object.position ?? [0, 0, 0]
  targetRef.current.id = object.id
  targetRef.current.position.x = position[0]
  targetRef.current.position.y = position[1]
  targetRef.current.position.z = position[2]
  targetRef.current.radius = catalogItem.combat?.radius ?? 0.5
  targetRef.current.height = catalogItem.combat?.height ?? 1.9
  targetRef.current.disabled = object.status === 'stored' || defeated
  targetRef.current.takeDamage = takeDamage

  const hpRatio = MathUtils.clamp(hp / maxHp, 0, 1)

  return (
    <group scale={model.scale} rotation={[0, catalogItem.modelRotationY ?? 0, 0]}>
      <mesh position={[0, 0.05 / model.scale, 0]} receiveShadow>
        <cylinderGeometry args={[0.5 / model.scale, 0.62 / model.scale, 0.1 / model.scale, 32]} />
        <meshStandardMaterial color={defeated ? '#6d7680' : '#272f37'} roughness={0.78} metalness={0.15} />
      </mesh>
      <mesh position={[0, 0.28 / model.scale, 0]} castShadow>
        <cylinderGeometry args={[0.13 / model.scale, 0.19 / model.scale, 0.34 / model.scale, 20]} />
        <meshStandardMaterial color="#c4ced8" roughness={0.42} metalness={0.35} />
      </mesh>
      <primitive object={model.object} position={model.offset} />
      {flash && (
        <mesh position={[0, 1.16 / model.scale, 0.02 / model.scale]}>
          <sphereGeometry args={[0.22 / model.scale, 18, 12]} />
          <meshBasicMaterial color="#ffd447" transparent opacity={0.42} depthWrite={false} />
        </mesh>
      )}
      {hudVisible && (
        <Html position={[0, 2.04 / model.scale, 0]} center transform sprite distanceFactor={5.2}>
          <div className={`training-dummy-hud ${defeated ? 'is-defeated' : ''}`}>
            <div className="training-dummy-bar">
              <span style={{ width: `${hpRatio * 100}%` }} />
              <div className="training-dummy-hp">{hp} / {maxHp}</div>
            </div>
          </div>
        </Html>
      )}
      {damageNumbers.map((number) => (
        <Html key={number.id} position={[number.x / model.scale, number.y / model.scale, number.z / model.scale]} center transform sprite distanceFactor={4.6}>
          <div className="training-damage-number" style={{ animationDuration: `${number.duration}ms` }}>
            {number.value}
          </div>
        </Html>
      ))}
    </group>
  )
}

function getDistanceToRotatedFootprint(x, z, footprint) {
  const rotationY = footprint.rotationY ?? 0
  const dx = x - footprint.x
  const dz = z - footprint.z
  const cos = Math.cos(-rotationY)
  const sin = Math.sin(-rotationY)
  const localX = dx * cos - dz * sin
  const localZ = dx * sin + dz * cos
  const outsideX = Math.max(Math.abs(localX) - footprint.hx, 0)
  const outsideZ = Math.max(Math.abs(localZ) - footprint.hz, 0)

  return Math.hypot(outsideX, outsideZ)
}

function getDistanceToPlayerHouse(x, z) {
  return houseLayout.rooms.reduce((closest, room) => {
    const footprint = {
      x: room.position[0],
      z: room.position[2],
      hx: room.size[0] * 0.5 + houseLayout.wallThickness,
      hz: room.size[2] * 0.5 + houseLayout.wallThickness,
    }

    return Math.min(closest, getDistanceToRotatedFootprint(x, z, footprint))
  }, Infinity)
}

function getDistanceToNeighborHouses(x, z) {
  return NEIGHBOR_HOUSES.reduce((closest, house) => {
    const cos = Math.cos(house.rotationY)
    const sin = Math.sin(house.rotationY)
    const houseDistance = getNeighborHouseParts(house).reduce((partClosest, part) => {
      const footprint = {
        x: house.position[0] + part.offset[0] * cos - part.offset[1] * sin,
        z: house.position[2] + part.offset[0] * sin + part.offset[1] * cos,
        hx: part.size[0] * 0.5,
        hz: part.size[2] * 0.5,
        rotationY: house.rotationY,
      }

      return Math.min(partClosest, getDistanceToRotatedFootprint(x, z, footprint))
    }, Infinity)

    return Math.min(closest, houseDistance)
  }, Infinity)
}

function getDistanceToNearestHouse(x, z) {
  return Math.min(getDistanceToPlayerHouse(x, z), getDistanceToNeighborHouses(x, z))
}

function getNearbyTreeCount(x, z, radius = MUSHROOM_ENEMY_SPAWN_TREE_RADIUS) {
  return EDITABLE_TREE_PLACEMENTS.reduce((count, treeEntry) => {
    const treePosition = getEditableTreePosition(treeEntry)
    return count + (Math.hypot(treePosition.x - x, treePosition.z - z) <= radius ? 1 : 0)
  }, 0)
}

function isMushroomEnemySpawnCandidateValid(x, z) {
  const insideWorld = Math.abs(x) < OUTDOOR_HALF_SIZE - 1.5 && Math.abs(z) < OUTDOOR_HALF_SIZE - 1.5
  if (!insideWorld) return false
  if (getNearbyTreeCount(x, z) < MUSHROOM_ENEMY_MIN_TREES_NEAR_SPAWN) return false
  if (getDistanceToNearestHouse(x, z) < MUSHROOM_ENEMY_HOUSE_CLEARANCE) return false
  if (EDITABLE_TREE_PLACEMENTS.some((treeEntry) => {
    const position = getEditableTreePosition(treeEntry)
    return Math.hypot(x - position.x, z - position.z) <= getEditableTreeCollisionRadius(treeEntry) + MUSHROOM_ENEMY_SPAWN_CLEARANCE
  })) return false

  return !OUTDOOR_PLAYER_COLLIDERS.some((collider) => {
    if (collider.type === 'circle') {
      return Math.hypot(x - collider.x, z - collider.z) <= collider.radius + MUSHROOM_ENEMY_SPAWN_CLEARANCE
    }

    const expanded = {
      ...collider,
      hx: collider.hx + MUSHROOM_ENEMY_SPAWN_CLEARANCE,
      hz: collider.hz + MUSHROOM_ENEMY_SPAWN_CLEARANCE,
    }

    return getDistanceToRotatedFootprint(x, z, expanded) <= 0
  })
}

function getMushroomEnemySpawnCandidates() {
  const forestTrees = EDITABLE_TREE_PLACEMENTS
    .map((treeEntry) => ({
      ...treeEntry,
      areaPriority: getEditableTreeAreaPriority(treeEntry),
    }))
    .filter((treeEntry) => treeEntry.areaPriority !== null)
  const offsets = [
    [0, 0],
    [1.8, 0],
    [-1.8, 0],
    [0, 1.8],
    [0, -1.8],
    [1.35, 1.35],
    [1.35, -1.35],
    [-1.35, 1.35],
    [-1.35, -1.35],
    [2.45, 0.75],
    [-2.45, -0.75],
  ]
  const candidates = forestTrees.flatMap((tree) => {
    const position = getEditableTreePosition(tree)
    return offsets.map(([offsetX, offsetZ]) => ({
      x: position.x + offsetX,
      z: position.z + offsetZ,
      areaPriority: tree.areaPriority,
    }))
  })

  return candidates
    .filter(({ x, z }) => isMushroomEnemySpawnCandidateValid(x, z))
    .map((candidate) => {
      const treeCount = getNearbyTreeCount(candidate.x, candidate.z)
      const houseDistance = getDistanceToNearestHouse(candidate.x, candidate.z)
      return {
        ...candidate,
        score: treeCount * 16 + candidate.areaPriority * 24 + Math.min(houseDistance, 20),
      }
    })
    .sort((a, b) => b.score - a.score)
}

function getMushroomEnemySpawnPositions(count = MUSHROOM_ENEMY_COUNT) {
  const selected = []
  const candidates = getMushroomEnemySpawnCandidates()

  for (const candidate of candidates) {
    if (selected.length >= count) break
    const hasSpacing = selected.every((spawn) => Math.hypot(spawn.x - candidate.x, spawn.z - candidate.z) >= MUSHROOM_ENEMY_MIN_SPAWN_SPACING)
    if (hasSpacing) selected.push(candidate)
  }

  if (selected.length < count) {
    for (const candidate of candidates) {
      if (selected.length >= count) break
      const alreadySelected = selected.some((spawn) => Math.hypot(spawn.x - candidate.x, spawn.z - candidate.z) < 0.1)
      if (!alreadySelected) selected.push(candidate)
    }
  }

  if (selected.length === 0) selected.push({ x: -30.5, z: -29.5 })

  return selected.map(({ x, z }) => [x, getTerrainHeight(x, z), z])
}

function getRandomEnemySpawnPositions(count, blockedPositions = []) {
  const selected = []
  const candidates = getMushroomEnemySpawnCandidates()
    .map((candidate) => ({ ...candidate, roll: Math.random() }))
    .sort((a, b) => a.roll - b.roll)

  for (const candidate of candidates) {
    if (selected.length >= count) break
    const blocked = [...blockedPositions, ...selected]
    const hasSpacing = blocked.every((spawn) => {
      const sx = Array.isArray(spawn) ? spawn[0] : spawn.x
      const sz = Array.isArray(spawn) ? spawn[2] : spawn.z
      return Math.hypot(sx - candidate.x, sz - candidate.z) >= MUSHROOM_ENEMY_MIN_SPAWN_SPACING
    })
    if (hasSpacing) selected.push(candidate)
  }

  if (selected.length < count) {
    for (const candidate of candidates) {
      if (selected.length >= count) break
      const alreadySelected = selected.some((spawn) => Math.hypot(spawn.x - candidate.x, spawn.z - candidate.z) < 0.1)
      if (!alreadySelected) selected.push(candidate)
    }
  }

  if (selected.length === 0) return getMushroomEnemySpawnPositions(count)
  return selected.map(({ x, z }) => [x, getTerrainHeight(x, z), z])
}

function hashSpawnerId(id) {
  return String(id ?? 'spawner').split('').reduce((hash, char) => (
    (hash * 31 + char.charCodeAt(0)) % 100000
  ), 17)
}

function getWeightedSpawnerVariant(spawner, slotIndex) {
  const variants = Array.isArray(spawner.variants) && spawner.variants.length
    ? spawner.variants
    : [{ monsterType: spawner.monsterType, weight: 100 }]
  const totalWeight = variants.reduce((total, variant) => total + Math.max(0, variant.weight ?? 0), 0)
  if (totalWeight <= 0) return variants[0] ?? { monsterType: spawner.monsterType, weight: 100 }

  const roll = getSeededUnitValue(hashSpawnerId(spawner.id) + slotIndex * 19.73) * totalWeight
  let cursor = 0
  for (const variant of variants) {
    cursor += Math.max(0, variant.weight ?? 0)
    if (roll <= cursor) return variant
  }
  return variants[variants.length - 1]
}

function getSpawnerSlotPosition(spawner, slotIndex, selectedSlots) {
  const [centerX, centerY, centerZ] = spawner.position
  const heightOffset = Number.isFinite(spawner.heightOffset)
    ? spawner.heightOffset
    : centerY - getTerrainHeight(centerX, centerZ)
  const radius = Math.max(0.5, spawner.radius ?? spawner.diameter * 0.5)
  const minDistance = Math.max(0, spawner.minDistance ?? 0)
  const seed = hashSpawnerId(spawner.id) + slotIndex * 43.17
  let fallback = null

  for (let attempt = 0; attempt < 24; attempt += 1) {
    const angle = getSeededUnitValue(seed + attempt * 11.31) * Math.PI * 2
    const distance = Math.sqrt(getSeededUnitValue(seed + attempt * 7.77 + 3.5)) * radius
    const x = centerX + Math.sin(angle) * distance
    const z = centerZ + Math.cos(angle) * distance
    const [safeX, safeZ] = clampMapPositionForSpawn(x, z)
    const candidate = [safeX, getTerrainHeight(safeX, safeZ) + heightOffset, safeZ]
    fallback = fallback ?? candidate

    const hasSpacing = selectedSlots.every((slot) => (
      Math.hypot(slot.spawnPosition[0] - safeX, slot.spawnPosition[2] - safeZ) >= minDistance
    ))
    if (hasSpacing) return candidate
  }

  return fallback ?? [centerX, getTerrainHeight(centerX, centerZ) + heightOffset, centerZ]
}

function getSpawnerMobConfig(monsterType, spawner) {
  const baseConfig = MOB_CONFIGS[monsterType] ?? MOB_CONFIGS[spawner.monsterType] ?? MOB_CONFIGS.mushroom
  const radius = Math.max(1, spawner.radius ?? spawner.diameter * 0.5)
  return {
    ...baseConfig,
    respawnMs: Math.max(1, spawner.respawnSeconds ?? 30) * 1000,
    wanderRadius: spawner.patrol ? Math.max(0.8, Math.min(baseConfig.wanderRadius ?? 3.8, radius * 0.35)) : 0,
    leashRange: Math.max(baseConfig.leashRange ?? 18, radius + 6),
  }
}

function getMonsterSpawnerSlots() {
  const slots = []

  MAP_MONSTER_SPAWNERS.forEach((spawner) => {
    const population = Math.max(1, Math.round(spawner.populationMax ?? 1))
    for (let index = 0; index < population; index += 1) {
      const variant = getWeightedSpawnerVariant(spawner, index)
      const monsterType = MOB_CONFIGS[variant.monsterType] ? variant.monsterType : spawner.monsterType
      const spawnPosition = getSpawnerSlotPosition(spawner, index, slots)
      slots.push({
        id: `${spawner.id}_${monsterType}_${index + 1}`,
        monsterType,
        spawnPosition,
        config: getSpawnerMobConfig(monsterType, spawner),
        aggressive: spawner.aggressive,
        patrol: spawner.patrol,
      })
    }
  })

  return slots
}

function clampMapPositionForSpawn(x, z) {
  return [
    MathUtils.clamp(x, -OUTDOOR_HALF_SIZE + 2, OUTDOOR_HALF_SIZE - 2),
    MathUtils.clamp(z, -OUTDOOR_HALF_SIZE + 2, OUTDOOR_HALF_SIZE - 2),
  ]
}

function getMushroomEnemySpawnPosition(spawnIndex = 0) {
  const positions = getMushroomEnemySpawnPositions(Math.max(MUSHROOM_ENEMY_COUNT, spawnIndex + 1))
  const selected = positions[spawnIndex] ?? positions[0]
  return selected
}

function getSeededUnitValue(seed) {
  const value = Math.sin(seed * 12.9898) * 43758.5453
  return value - Math.floor(value)
}

// `wanderRadius` DOIT correspondre au rayon de laisse utilisé par l'état 'wander'
// (cfg.wanderRadius), sinon la cible générée tombe hors laisse → 'return' immédiat
// → aucune patrouille. Pour un spawner ce rayon est petit (radius*0.35) ; on ne peut
// donc pas utiliser la constante globale 5.5 ici.
function getMushroomEnemyWanderPoint(spawnPosition, seed, wanderRadius = MUSHROOM_ENEMY_WANDER_RADIUS) {
  const minDistance = Math.min(1.1, wanderRadius * 0.5)
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const angle = getSeededUnitValue(seed + attempt * 2.31) * Math.PI * 2
    const distance = minDistance + getSeededUnitValue(seed + attempt * 5.17) * Math.max(0, wanderRadius - minDistance)
    const x = spawnPosition[0] + Math.sin(angle) * distance
    const z = spawnPosition[2] + Math.cos(angle) * distance

    if (
      Math.hypot(x - spawnPosition[0], z - spawnPosition[2]) <= wanderRadius &&
      isMushroomEnemySpawnCandidateValid(x, z)
    ) {
      return { x, y: getMobOutdoorFootY(x, z, spawnPosition[1]), z }
    }
  }

  return { x: spawnPosition[0], y: spawnPosition[1], z: spawnPosition[2] }
}

// Angles de déflexion essayés en ordre quand le chemin direct est bloqué.
// Le signe est multiplié par stuckDeflection (+1 ou -1) pour alterner gauche/droite
// si le mob reste coincé longtemps.
function getMobOutdoorFootY(x, z, currentFootY = getTerrainHeight(x, z)) {
  return getOutdoorWalkableHeight(x, z, currentFootY)
}

function getMobTargetFootY(target, fallbackIsPlayer = false) {
  if (!target?.position) return 0
  const isPlayer = target.isPlayer ?? fallbackIsPlayer
  return isPlayer ? target.position.y - PLAYER_HEIGHT : target.position.y
}

function getWeightedMobTargetDistance(enemyPosition, target, fallbackIsPlayer = false) {
  if (!target?.position) return Infinity
  const dx = target.position.x - enemyPosition.x
  const dz = target.position.z - enemyPosition.z
  const dy = getMobTargetFootY(target, fallbackIsPlayer) - enemyPosition.y
  return Math.hypot(dx, dz, dy * MOB_TARGET_VERTICAL_WEIGHT)
}

const AVOIDANCE_ANGLES = [Math.PI / 6, Math.PI / 3, Math.PI / 2, (2 * Math.PI) / 3]

function tryMoveAt(enemyPosition, dirX, dirZ, step) {
  const nx = enemyPosition.x + dirX * step
  const nz = enemyPosition.z + dirZ * step
  const nextY = getMobOutdoorFootY(nx, nz, enemyPosition.y)
  if (enemyPosition.y - nextY > MOB_GROUNDED_DROP_TO_FALL) return false
  if (collidesWithOutdoorObstacle(nx, nz, nextY)) return false
  enemyPosition.x = nx
  enemyPosition.z = nz
  enemyPosition.y = nextY
  return true
}

function moveMushroomEnemyToward(enemyPosition, target, speed, delta, stopDistance = 0, stuckTimerRef = null, stuckDeflectionRef = null, lastPositionRef = null) {
  const dx = target.x - enemyPosition.x
  const dz = target.z - enemyPosition.z
  const distance = Math.hypot(dx, dz)
  if (distance <= stopDistance + 0.001) return distance

  const step = Math.min(speed * delta, distance - stopDistance)
  const dirX = dx / distance
  const dirZ = dz / distance

  // ── 1. Chemin direct ────────────────────────────────────────────────────────
  if (tryMoveAt(enemyPosition, dirX, dirZ, step)) {
    if (stuckTimerRef) stuckTimerRef.current = Math.max(0, stuckTimerRef.current - delta * 2)
    return distance
  }

  // ── 2. Glissement axial (slide le long des murs/arbres) ────────────────────
  if (tryMoveAt(enemyPosition, dirX, 0, step)) return distance
  if (tryMoveAt(enemyPosition, 0, dirZ, step)) return distance

  // ── 3. Déflexions angulaires (contournement d'obstacle circulaire) ──────────
  const sign = stuckDeflectionRef ? stuckDeflectionRef.current : 1
  for (const angle of AVOIDANCE_ANGLES) {
    for (const s of [sign, -sign]) {
      const cos = Math.cos(angle * s)
      const sin = Math.sin(angle * s)
      const altX = dirX * cos - dirZ * sin
      const altZ = dirX * sin + dirZ * cos
      if (tryMoveAt(enemyPosition, altX, altZ, step)) return distance
    }
  }

  // ── 4. Vraiment coincé : incrémente le timer et alterne le sens ─────────────
  if (stuckTimerRef) {
    stuckTimerRef.current += delta
    if (stuckDeflectionRef && stuckTimerRef.current > 0.9) {
      stuckDeflectionRef.current *= -1
      stuckTimerRef.current = 0
    }
  }

  return distance
}

function canMobSeePlayer(enemyPosition, enemyYaw, playerPosition, visibilityRange, viewConeDegrees) {
  const dx = playerPosition.x - enemyPosition.x
  const dz = playerPosition.z - enemyPosition.z
  const distance = Math.hypot(dx, dz)
  if (distance <= 0.001 || distance > visibilityRange) return false

  const forwardX = Math.sin(enemyYaw)
  const forwardZ = Math.cos(enemyYaw)
  const dot = forwardX * (dx / distance) + forwardZ * (dz / distance)
  const minDot = Math.cos(MathUtils.degToRad(viewConeDegrees * 0.5))

  return dot >= minDot
}

function RuntimeParticleEffect({
  preset,
  playing = true,
  loop = false,
  playbackId = 0,
  layer = OUTDOOR_LIGHT_LAYER,
}) {
  const groupRef = useRef()

  useLayoutEffect(() => {
    groupRef.current?.traverse((object) => {
      object.layers.set(layer)
    })
  }, [layer])

  if (!preset) return null

  return (
    <group ref={groupRef}>
      <ParticleEffect
        preset={preset}
        playing={playing}
        loop={loop}
        playbackId={playbackId}
      />
    </group>
  )
}

function PlayerHealingAura({ active, playerPositionRef, layer }) {
  const groupRef = useRef()
  const [warming, setWarming] = useState(true)
  const warmupFramesRef = useRef(EFFECT_WARMUP_FRAMES)

  useFrame(() => {
    if (!groupRef.current) return

    if (!active && warming) {
      groupRef.current.position.set(0, -500, 0)
      warmupFramesRef.current -= 1
      if (warmupFramesRef.current <= 0) setWarming(false)
      return
    }

    const position = playerPositionRef?.current
    if (!active || !position) {
      groupRef.current.position.set(0, -500, 0)
      return
    }

    groupRef.current.position.set(position.x, position.y - PLAYER_HEIGHT, position.z)
  })

  return (
    <group ref={groupRef} visible={active || warming}>
      <RuntimeParticleEffect
        preset={HEAL_AURA_PARTICLE_PRESET}
        playing={active || warming}
        loop
        layer={layer}
      />
    </group>
  )
}

function SmallMushroomEnemy({
  enemyId,
  spawnIndex = 0,
  spawnPositionOverride = null,
  passive = false,
  aggressive = true,
  patrol = true,
  active,
  playerPositionRef,
  registerCombatTarget,
  onDefeated,
  onHitPlayer,
  config = MOB_CONFIGS.mushroom,
  monsterType = null,
  mobGroupRef = null,
  allyTargetsRef = null,
}) {
  const cfg = config
  const sourceModel = useFBX(cfg.modelUrl)
  const forcedTexture = useTexture(cfg.textureUrl ?? SKELETON_ENEMY_TEXTURE_URL)
  const sourceAnimations = sourceModel.animations ?? []
  const idle = useMixamoGlbAnimation('/models/player/anim/idle.glb')
  const walk = useMixamoGlbAnimation('/models/player/anim/walk.glb')
  const punch = useMixamoGlbAnimation('/models/player/anim/punch.glb')
  const groupRef = useRef()
  const [hp, setHp] = useState(cfg.maxHp)
  const [damageNumbers, setDamageNumbers] = useState([])
  const [hudVisible, setHudVisible] = useState(false)
  const [hitFlash, setHitFlash] = useState(false)
  const [defeated, setDefeated] = useState(false)
  const [isEvading, setIsEvading] = useState(false)
  const [motion, setMotion] = useState('idle')
  const hpRef = useRef(cfg.maxHp)
  const defeatedRef = useRef(false)
  const stateRef = useRef('idle')
  const attackRef = useRef(null)
  const nextAttackAtRef = useRef(0)
  const closeAlertTimerRef = useRef(0)
  const investigateTimerRef = useRef(0)
  const lastSeenPosRef = useRef(null)
  const leashTimerRef = useRef(0)
  const evadingRef = useRef(false)
  const stuckTimerRef = useRef(0)
  const stuckDeflectionRef = useRef(1)
  const lastPositionRef = useRef({ x: 0, z: 0 })
  const wanderTargetRef = useRef(null)
  const nextWanderAtRef = useRef(0)
  const wanderSeedRef = useRef(spawnIndex * 37 + 11)
  const threatRef = useRef(new Map())
  const currentPositionRef = useRef({ x: 0, y: 0, z: 0 })
  const respawnTimerRef = useRef(null)
  const hudTimerRef = useRef(null)
  const flashTimerRef = useRef(null)
  const recoilRef = useRef({ x: 0, z: 0, y: 0 })
  const recoilVelocityRef = useRef({ x: 0, z: 0, y: 0 })
  const spawnPosition = useMemo(() => spawnPositionOverride ?? getMushroomEnemySpawnPosition(spawnIndex), [spawnIndex, spawnPositionOverride])
  useEffect(() => {
    currentPositionRef.current.x = spawnPosition[0]
    currentPositionRef.current.y = spawnPosition[1]
    currentPositionRef.current.z = spawnPosition[2]
    if (groupRef.current) groupRef.current.rotation.y = cfg.spawnYaw
  }, [spawnPosition, cfg.spawnYaw])
  const targetRef = useRef({
    id: enemyId,
    position: { x: spawnPosition[0], y: spawnPosition[1], z: spawnPosition[2] },
    radius: cfg.targetRadius ?? 0.48,
    height: cfg.targetHeight ?? 1.2,
    disabled: true,
    takeDamage: null,
  })

  const model = useMemo(() => {
    const source = clone(sourceModel)
    if (cfg.textureUrl) {
      forcedTexture.colorSpace = SRGBColorSpace
      forcedTexture.needsUpdate = true
    }
    source.updateWorldMatrix(true, true)
    const box = new Box3().setFromObject(source)
    const size = box.getSize(new Vector3())
    const center = box.getCenter(new Vector3())
    const targetHeight = (cfg.modelTargetHeight ?? 1.15) * WORLD_UNITS_PER_METER
    const scale = targetHeight / Math.max(size.y, 0.001)

    source.traverse((child) => {
      if (child instanceof Mesh) {
        child.castShadow = true
        child.receiveShadow = true
        child.frustumCulled = false
        if (cfg.textureUrl && forcedTexture) {
          const materials = Array.isArray(child.material) ? child.material : [child.material]
          const patchedMaterials = materials.map((material) => {
            if (!material) return material
            const nextMaterial = material.clone()
            nextMaterial.map = forcedTexture
            nextMaterial.alphaMap = null
            nextMaterial.transparent = false
            nextMaterial.opacity = 1
            nextMaterial.depthWrite = true
            nextMaterial.side = DoubleSide
            nextMaterial.color?.set('#ffffff')
            nextMaterial.needsUpdate = true
            return nextMaterial
          })
          child.material = Array.isArray(child.material) ? patchedMaterials : patchedMaterials[0]
        }
        if (cfg.materialColor) {
          const materials = Array.isArray(child.material) ? child.material : [child.material]
          const patchedMaterials = materials.map((material) => {
            if (!material) return material
            const nextMaterial = material.clone()
            nextMaterial.map = null
            nextMaterial.alphaMap = null
            nextMaterial.transparent = false
            nextMaterial.opacity = 1
            nextMaterial.depthWrite = true
            nextMaterial.side = DoubleSide
            nextMaterial.color?.set(cfg.materialColor)
            return nextMaterial
          })
          child.material = Array.isArray(child.material) ? patchedMaterials : patchedMaterials[0]
        }
      }
    })

    return {
      object: source,
      offset: [-center.x, -box.min.y, -center.z],
      scale,
    }
  }, [cfg.materialColor, cfg.modelTargetHeight, cfg.textureUrl, forcedTexture, sourceModel])

  const enemyHipsRestHeight = useMemo(() => getObjectHipsRestHeight(model.object), [model.object])
  const modelIdleAnimation = useMemo(() => (
    sourceAnimations.reduce((best, clip) => (
      !best || clip.duration > best.duration ? clip : best
    ), null)
  ), [sourceAnimations])

  const animationClips = useMemo(() => {
    const idleSource = cfg.useModelIdleAnimation ? modelIdleAnimation : idle.animations[0]
    const walkSource = cfg.useModelAnimationForAllMotions ? modelIdleAnimation : walk.animations[0]
    const punchSource = cfg.useModelAnimationForAllMotions ? modelIdleAnimation : punch.animations[0]
    return [
      { source: idleSource, name: 'idle' },
      { source: walkSource, name: 'walk' },
      { source: punchSource, name: 'punch' },
    ]
      .filter(({ source }) => source)
      .map(({ source, name }) => {
        const clip = source.clone()
        clip.name = name
        lockEmoteHipsHeight(clip, enemyHipsRestHeight)
        lockHipsPlanarPosition(clip)
        return filterAnimationClipTracksForObject(clip, model.object)
      })
  }, [
    cfg.useModelAnimationForAllMotions,
    cfg.useModelIdleAnimation,
    enemyHipsRestHeight,
    idle.animations,
    model.object,
    modelIdleAnimation,
    punch.animations,
    walk.animations,
  ])

  const { actions, mixer } = useAnimations(animationClips, model.object)
  const currentActionRef = useRef(null)
  const currentMotionRef = useRef(null)
  const revealFramesRef = useRef(0)

  const playEnemyMotion = useCallback((nextMotion, options = {}) => {
    const { force = false, startTime = 0 } = options
    const nextAction = actions[nextMotion]
    if (!nextAction || (!force && currentActionRef.current === nextAction)) return false

    const previousAction = currentActionRef.current
    const isOneShot = nextMotion === 'punch'
    nextAction
      .reset()
      .setLoop(isOneShot ? LoopOnce : LoopRepeat, isOneShot ? 1 : Infinity)
      .setEffectiveWeight(1)
      .setEffectiveTimeScale(nextMotion === 'punch' ? 1.35 : 1)
      .play()
    if (startTime > 0) nextAction.time = startTime
    nextAction.clampWhenFinished = isOneShot

    if (previousAction && previousAction !== nextAction) {
      nextAction.crossFadeFrom(previousAction, nextMotion === 'punch' ? 0.08 : 0.16, false)
    }

    currentActionRef.current = nextAction
    currentMotionRef.current = nextMotion
    return true
  }, [actions])

  useLayoutEffect(() => {
    if (!passive || !active || !actions.idle) return undefined
    model.object.visible = false
    const started = playEnemyMotion('idle', { force: true, startTime: 0.35 })
    if (started) {
      mixer.update(1 / 30)
      model.object.updateMatrixWorld(true)
      revealFramesRef.current = 2
    } else {
      model.object.visible = true
    }
    return undefined
  }, [actions.idle, active, mixer, model.object, passive, playEnemyMotion])

  const resetEnemy = useCallback(() => {
    defeatedRef.current = false
    stateRef.current = 'idle'
    attackRef.current = null
    nextAttackAtRef.current = 0
    closeAlertTimerRef.current = 0
    investigateTimerRef.current = 0
    lastSeenPosRef.current = null
    leashTimerRef.current = 0
    evadingRef.current = false
    setIsEvading(false)
    stuckTimerRef.current = 0
    stuckDeflectionRef.current = 1
    wanderTargetRef.current = null
    nextWanderAtRef.current = 0
    threatRef.current.clear()
    currentPositionRef.current.x = spawnPosition[0]
    currentPositionRef.current.y = spawnPosition[1]
    currentPositionRef.current.z = spawnPosition[2]
    if (groupRef.current) groupRef.current.rotation.y = cfg.spawnYaw
    hpRef.current = cfg.maxHp
    recoilRef.current.x = 0
    recoilRef.current.y = 0
    recoilRef.current.z = 0
    recoilVelocityRef.current.x = 0
    recoilVelocityRef.current.y = 0
    recoilVelocityRef.current.z = 0
    setHp(cfg.maxHp)
    setDefeated(false)
    setHudVisible(false)
    setMotion('idle')
    setDamageNumbers([])
  }, [spawnPosition])

  const takeDamage = useCallback(({ damage = PLAYER_PUNCH_DAMAGE, direction = { x: 0, z: 1 }, attackerId = 'player' }) => {
    if (!active || passive || defeatedRef.current || evadingRef.current) return false

    // Menace : celui qui frappe attire l'aggro
    threatRef.current.set(attackerId, (threatRef.current.get(attackerId) ?? 0) + damage)

    recoilVelocityRef.current.x -= direction.x * 2.4
    recoilVelocityRef.current.z -= direction.z * 2.4
    recoilVelocityRef.current.y += 1.2

    setHudVisible(true)
    setHitFlash(true)
    if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current)
    flashTimerRef.current = window.setTimeout(() => setHitFlash(false), 120)

    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    setDamageNumbers((current) => [
      ...current,
      {
        id,
        value: damage,
        x: (Math.random() - 0.5) * 0.34,
        y: (cfg.targetHeight ?? 1.2) * 0.98 + Math.random() * 0.18,
        z: (Math.random() - 0.5) * 0.22,
        duration: 680,
      },
    ])
    window.setTimeout(() => {
      setDamageNumbers((current) => current.filter((number) => number.id !== id))
    }, 720)

    setHp((current) => {
      const nextHp = Math.max(0, current - damage)
      hpRef.current = nextHp
      closeAlertTimerRef.current = 0
      // Combat actif = réduit le leash timer (le mob reste engagé plus longtemps)
      leashTimerRef.current = Math.max(0, leashTimerRef.current - cfg.leashCombatBonus)
      const wasIdle = stateRef.current === 'idle' || stateRef.current === 'wander' || stateRef.current === 'investigate'
      if (nextHp > 0 && wasIdle) {
        investigateTimerRef.current = 0
        stateRef.current = 'chase'
        // Aggro groupe : prévenir les alliés proches (mollo : max 2, délai aléatoire)
        if (mobGroupRef) {
          let triggered = 0
          for (const [id, mob] of mobGroupRef.current) {
            if (id === enemyId || triggered >= GROUP_AGGRO_MAX_MOBS) continue
            const pos = mob.getPosition()
            const dist = Math.hypot(
              pos.x - currentPositionRef.current.x,
              pos.z - currentPositionRef.current.z,
            )
            if (dist <= GROUP_AGGRO_RADIUS) {
              const delay = GROUP_AGGRO_DELAY_MIN + Math.random() * (GROUP_AGGRO_DELAY_MAX - GROUP_AGGRO_DELAY_MIN)
              window.setTimeout(() => mob.triggerAggro(), delay)
              triggered++
            }
          }
        }
      }
      if (nextHp <= 0 && !defeatedRef.current) {
        defeatedRef.current = true
        stateRef.current = 'dead'
        attackRef.current = null
        setDefeated(true)
        setHudVisible(false)
        if (hudTimerRef.current) window.clearTimeout(hudTimerRef.current)
        onDefeated?.({
          enemyId,
          position: [
            currentPositionRef.current.x,
            currentPositionRef.current.y,
            currentPositionRef.current.z,
          ],
          reward: cfg.rewardCoins,
          mobType: monsterType,
        })
        if (respawnTimerRef.current) window.clearTimeout(respawnTimerRef.current)
        const tryRespawn = () => {
          const playerPosition = playerPositionRef?.current
          const playerDistance = playerPosition
            ? Math.hypot(playerPosition.x - spawnPosition[0], playerPosition.z - spawnPosition[2])
            : Infinity

          if (playerDistance < cfg.respawnPlayerSafeRange) {
            respawnTimerRef.current = window.setTimeout(tryRespawn, 1200)
            return
          }
          resetEnemy()
        }
        respawnTimerRef.current = window.setTimeout(tryRespawn, cfg.respawnMs)
      } else {
        if (hudTimerRef.current) window.clearTimeout(hudTimerRef.current)
        hudTimerRef.current = window.setTimeout(() => setHudVisible(false), 2200)
      }
      return nextHp
    })

    return true
  }, [active, cfg, enemyId, monsterType, mobGroupRef, onDefeated, passive, playerPositionRef, resetEnemy, spawnPosition])

  useEffect(() => {
    if (!registerCombatTarget || passive) return undefined
    return registerCombatTarget(enemyId, targetRef.current)
  }, [enemyId, passive, registerCombatTarget])

  // ── Enregistrement dans le groupe pour l'aggro partagée ────────────────────
  const triggerAggro = useCallback(() => {
    if (passive || !aggressive || defeatedRef.current || evadingRef.current) return
    if (stateRef.current === 'idle' || stateRef.current === 'wander' || stateRef.current === 'investigate') {
      wanderTargetRef.current = null
      investigateTimerRef.current = 0
      stateRef.current = 'chase'
    }
  }, [aggressive, passive])

  useEffect(() => {
    if (!mobGroupRef || passive) return undefined
    mobGroupRef.current.set(enemyId, {
      getPosition: () => currentPositionRef.current,
      triggerAggro,
    })
    return () => { mobGroupRef.current.delete(enemyId) }
  }, [enemyId, mobGroupRef, passive, triggerAggro])

  useEffect(() => {
    if (active) return undefined
    stateRef.current = defeatedRef.current ? 'dead' : 'idle'
    attackRef.current = null
    closeAlertTimerRef.current = 0
    investigateTimerRef.current = 0
    lastSeenPosRef.current = null
    wanderTargetRef.current = null
    setMotion('idle')
    return undefined
  }, [active])

  useEffect(() => {
    return () => {
      if (respawnTimerRef.current) window.clearTimeout(respawnTimerRef.current)
      if (hudTimerRef.current) window.clearTimeout(hudTimerRef.current)
      if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current)
    }
  }, [])

  useFrame((state, delta) => {
    if (currentMotionRef.current !== motion) {
      playEnemyMotion(motion)
    }

    if (revealFramesRef.current > 0) {
      revealFramesRef.current -= 1
      if (revealFramesRef.current <= 0 && currentActionRef.current) {
        model.object.visible = true
      }
    }

    const enemyPosition = currentPositionRef.current
    const recoil = recoilRef.current
    const velocity = recoilVelocityRef.current
    velocity.x += -recoil.x * 30 * delta
    velocity.z += -recoil.z * 30 * delta
    velocity.y += -recoil.y * 36 * delta
    const damping = Math.exp(-8.5 * delta)
    velocity.x *= damping
    velocity.z *= damping
    velocity.y *= damping
    recoil.x = MathUtils.clamp(recoil.x + velocity.x * delta, -0.28, 0.28)
    recoil.z = MathUtils.clamp(recoil.z + velocity.z * delta, -0.28, 0.28)
    recoil.y = MathUtils.clamp(recoil.y + velocity.y * delta, 0, 0.18)

    // ── Aggro réelle : cible = ennemi/joueur à la plus haute menace ───────────
    // Décroît les menaces, élague les cibles invalides, choisit la plus haute.
    // Sans menace (personne ne l'a frappé), la cible par défaut reste le joueur.
    let aggroTarget = null
    {
      const pp = playerPositionRef?.current
      if (pp && active && !passive && aggressive && !defeatedRef.current) {
        let best = null
        let bestThreat = 0
        for (const [aid, threat] of threatRef.current) {
          const decayed = threat - THREAT_DECAY_PER_SEC * delta
          if (decayed <= 0) { threatRef.current.delete(aid); continue }
          threatRef.current.set(aid, decayed)
          const ally = allyTargetsRef?.current?.get(aid)
          if (!ally || ally.disabled) { threatRef.current.delete(aid); continue }
          const dd = Math.hypot(ally.position.x - enemyPosition.x, ally.position.z - enemyPosition.z)
          if (dd > cfg.loseInterestRange) continue
          if (decayed > bestThreat) { bestThreat = decayed; best = ally }
        }
        aggroTarget = (best && !best.isPlayer)
          ? { id: best.id, position: best.position, isPlayer: false, takeDamage: best.takeDamage }
          : { id: 'player', position: pp, isPlayer: true, takeDamage: null }
      }
    }

    if (groupRef.current && !active) {
      groupRef.current.position.set(0, -500, 0)
    } else if (groupRef.current) {
      groupRef.current.position.set(
        enemyPosition.x + recoil.x,
        enemyPosition.y + recoil.y,
        enemyPosition.z + recoil.z,
      )
      const playerPosition = playerPositionRef?.current
      const shouldFacePlayer = stateRef.current === 'chase' || stateRef.current === 'attack' || Boolean(attackRef.current)
      const lookTarget = stateRef.current === 'return'
        ? { x: spawnPosition[0], z: spawnPosition[2] }
        : stateRef.current === 'wander' ? wanderTargetRef.current
          : stateRef.current === 'investigate' ? lastSeenPosRef.current
            : shouldFacePlayer ? (aggroTarget?.position ?? playerPosition) : null
      if (lookTarget && !defeated) {
        const dx = lookTarget.x - enemyPosition.x
        const dz = lookTarget.z - enemyPosition.z
        if (Math.hypot(dx, dz) > 0.001) {
          groupRef.current.rotation.y = dampAngle(groupRef.current.rotation.y, Math.atan2(dx, dz), 10, delta)
        }
      }
    }

    if (passive) {
      stateRef.current = 'idle'
      attackRef.current = null
      wanderTargetRef.current = null
      targetRef.current.position.x = enemyPosition.x
      targetRef.current.position.y = enemyPosition.y
      targetRef.current.position.z = enemyPosition.z
      return
    }

    if (!active || defeatedRef.current || !playerPositionRef?.current) return

    const playerPosition = playerPositionRef.current
    const distanceToPlayer = Math.hypot(
      playerPosition.x - enemyPosition.x,
      playerPosition.z - enemyPosition.z,
    )
    // Cible de combat effective (aggro). Par défaut le joueur.
    const aggroPosition = aggroTarget ? aggroTarget.position : playerPosition
    const distanceToTarget = Math.hypot(
      aggroPosition.x - enemyPosition.x,
      aggroPosition.z - enemyPosition.z,
    )
    const effectiveAggroTarget = aggroTarget ?? { id: 'player', position: playerPosition, isPlayer: true }
    const weightedDistanceToTarget = getWeightedMobTargetDistance(enemyPosition, effectiveAggroTarget)
    const distanceToSpawn = Math.hypot(enemyPosition.x - spawnPosition[0], enemyPosition.z - spawnPosition[2])
    const canAct = !attackRef.current

    if (aggressive && (stateRef.current === 'idle' || stateRef.current === 'wander' || stateRef.current === 'investigate')) {
      const enemyYaw = groupRef.current?.rotation.y ?? cfg.spawnYaw
      const seesPlayer = canMobSeePlayer(enemyPosition, enemyYaw, playerPosition, cfg.visibilityRange, cfg.viewConeDegrees)
      const acquire = () => {
        closeAlertTimerRef.current = 0
        investigateTimerRef.current = 0
        wanderTargetRef.current = null
        stateRef.current = 'chase'
      }

      if (seesPlayer) {
        // Vue directe = aggro immédiate
        acquire()
      } else if (distanceToPlayer <= cfg.closeAlertRange) {
        // Perception 360° (ouïe) : la jauge d'alerte monte d'autant plus vite
        // que le joueur est proche (réaction quasi instantanée au contact).
        const proximity = 1 - distanceToPlayer / cfg.closeAlertRange // 0 au bord → 1 collé
        closeAlertTimerRef.current += delta * (0.5 + proximity * 2.2)
        if (closeAlertTimerRef.current >= cfg.closeAlertSeconds) acquire()
      } else {
        // Hors de portée : l'alerte retombe progressivement (pas de reset brutal)
        closeAlertTimerRef.current = Math.max(0, closeAlertTimerRef.current - delta * 0.8)
      }
    }

    // ── Leash temporel ────────────────────────────────────────────────────────
    if (stateRef.current === 'chase' || stateRef.current === 'attack') {
      const outOfZone = distanceToSpawn > cfg.leashRange || distanceToTarget > cfg.loseInterestRange
      if (outOfZone) {
        leashTimerRef.current += delta
      } else {
        leashTimerRef.current = Math.max(0, leashTimerRef.current - delta * 0.5)
      }
      if (leashTimerRef.current >= cfg.leashTime) {
        leashTimerRef.current = 0
        attackRef.current = null
        closeAlertTimerRef.current = 0
        // Au lieu d'oublier le joueur d'un coup, le mob va fouiller sa dernière
        // position connue avant de rentrer. S'il n'a pas de piste, retour direct.
        if (lastSeenPosRef.current) {
          investigateTimerRef.current = 0
          stateRef.current = 'investigate'
          setMotion('walk')
        } else {
          evadingRef.current = true
          setIsEvading(true)
          stateRef.current = 'return'
          setMotion('walk')
        }
      }
    } else {
      if (leashTimerRef.current > 0) leashTimerRef.current = Math.max(0, leashTimerRef.current - delta)
    }

    if (stateRef.current === 'attack' && canAct && weightedDistanceToTarget > cfg.attackRange) {
      stateRef.current = 'chase'
    }

    if (stateRef.current === 'idle') {
      if (patrol && state.clock.elapsedTime >= nextWanderAtRef.current) {
        wanderSeedRef.current += 1
        wanderTargetRef.current = getMushroomEnemyWanderPoint(spawnPosition, wanderSeedRef.current, cfg.wanderRadius)
        const targetDistance = Math.hypot(wanderTargetRef.current.x - enemyPosition.x, wanderTargetRef.current.z - enemyPosition.z)
        if (targetDistance > cfg.wanderReachedDistance) {
          stateRef.current = 'wander'
          setMotion('walk')
        } else {
          nextWanderAtRef.current = state.clock.elapsedTime + cfg.wanderMinWait
          setMotion('idle')
        }
      } else {
        setMotion('idle')
      }
    }

    if (stateRef.current === 'wander' && canAct) {
      if (!patrol) {
        stateRef.current = 'idle'
        wanderTargetRef.current = null
        setMotion('idle')
        return
      }
      const wanderTarget = wanderTargetRef.current
      const tooFarFromSpawn = distanceToSpawn > cfg.wanderRadius + 0.6

      if (!wanderTarget || tooFarFromSpawn) {
        stateRef.current = 'return'
        wanderTargetRef.current = null
        setMotion('walk')
      } else {
        const distanceToTarget = moveMushroomEnemyToward(enemyPosition, wanderTarget, cfg.wanderSpeed, delta, 0, stuckTimerRef, stuckDeflectionRef, lastPositionRef)
        if (distanceToTarget <= cfg.wanderReachedDistance) {
          stateRef.current = 'idle'
          wanderTargetRef.current = null
          const waitRange = cfg.wanderMaxWait - cfg.wanderMinWait
          nextWanderAtRef.current = state.clock.elapsedTime + cfg.wanderMinWait + getSeededUnitValue(wanderSeedRef.current + 9.4) * waitRange
          setMotion('idle')
        } else {
          setMotion('walk')
        }
      }
    }

    // Mémorise en continu la position de la cible tant qu'on la poursuit :
    // sert de point de fouille si on finit par la perdre (état 'investigate').
    if (stateRef.current === 'chase' || stateRef.current === 'attack') {
      if (!lastSeenPosRef.current) lastSeenPosRef.current = { x: 0, z: 0 }
      lastSeenPosRef.current.x = aggroPosition.x
      lastSeenPosRef.current.z = aggroPosition.z
    }

    if (stateRef.current === 'chase' && canAct) {
      if (weightedDistanceToTarget > cfg.attackRange) {
        if (distanceToTarget - cfg.stopDistance > 0.001) {
          moveMushroomEnemyToward(enemyPosition, aggroPosition, cfg.chaseSpeed, delta, cfg.stopDistance, stuckTimerRef, stuckDeflectionRef, lastPositionRef)
        }
        setMotion('walk')
      } else {
        stateRef.current = 'attack'
        setMotion('idle')
      }
    }

    if (stateRef.current === 'investigate' && canAct) {
      const lead = lastSeenPosRef.current
      // Trop loin de la zone de spawn pour continuer à fouiller : on rentre.
      const tooFar = distanceToSpawn > cfg.leashRange + cfg.loseInterestRange * 0.5
      if (!lead || tooFar) {
        lastSeenPosRef.current = null
        evadingRef.current = true
        setIsEvading(true)
        stateRef.current = 'return'
        setMotion('walk')
      } else {
        const reached = moveMushroomEnemyToward(
          enemyPosition,
          { x: lead.x, y: enemyPosition.y, z: lead.z },
          cfg.moveSpeed,
          delta,
          0.1,
          stuckTimerRef,
          stuckDeflectionRef,
          lastPositionRef,
        )
        if (reached <= 0.3) {
          // Arrivé sur la piste : marque une pause pour « regarder autour »,
          // puis abandonne et rentre si rien n'a été repéré (la ré-acquisition
          // se fait via le bloc de détection ci-dessus, qui inclut 'investigate').
          investigateTimerRef.current += delta
          setMotion('idle')
          if (investigateTimerRef.current >= cfg.investigateLookSeconds) {
            investigateTimerRef.current = 0
            lastSeenPosRef.current = null
            evadingRef.current = true
            setIsEvading(true)
            stateRef.current = 'return'
            setMotion('walk')
          }
        } else {
          setMotion('walk')
        }
      }
    }

    if (stateRef.current === 'return' && canAct) {
      const returnDistance = Math.hypot(spawnPosition[0] - enemyPosition.x, spawnPosition[2] - enemyPosition.z)
      if (returnDistance <= 0.08) {
        enemyPosition.x = spawnPosition[0]
        enemyPosition.y = spawnPosition[1]
        enemyPosition.z = spawnPosition[2]
        evadingRef.current = false
        leashTimerRef.current = 0
        closeAlertTimerRef.current = 0
        hpRef.current = cfg.maxHp
        setHp(cfg.maxHp)
        setIsEvading(false)
        stateRef.current = 'idle'
        if (groupRef.current) groupRef.current.rotation.y = cfg.spawnYaw
        setMotion('idle')
      } else {
        moveMushroomEnemyToward(enemyPosition, { x: spawnPosition[0], y: spawnPosition[1], z: spawnPosition[2] }, cfg.returnSpeed, delta, 0, stuckTimerRef, stuckDeflectionRef, lastPositionRef)
        setMotion('walk')
      }
    }

    if (
      stateRef.current === 'attack' &&
      !attackRef.current &&
      weightedDistanceToTarget <= cfg.attackRange &&
      state.clock.elapsedTime >= nextAttackAtRef.current
    ) {
      attackRef.current = {
        contactAt: state.clock.elapsedTime + cfg.attackContactDelay,
        endsAt: state.clock.elapsedTime + cfg.attackDuration,
        fired: false,
      }
      nextAttackAtRef.current = state.clock.elapsedTime + cfg.attackCooldown
      setMotion('punch')
    }

    // ── Séparation : empêche les monstres de se chevaucher ────────────────────
    if (mobGroupRef?.current) {
      let pushX = 0
      let pushZ = 0
      for (const [otherId, mob] of mobGroupRef.current) {
        if (otherId === enemyId) continue
        const op = mob.getPosition()
        const dx = enemyPosition.x - op.x
        const dz = enemyPosition.z - op.z
        const d = Math.hypot(dx, dz)
        if (d > 0.0001 && d < MOB_SEPARATION_DISTANCE) {
          const f = (MOB_SEPARATION_DISTANCE - d) / MOB_SEPARATION_DISTANCE
          pushX += (dx / d) * f
          pushZ += (dz / d) * f
        } else if (d <= 0.0001) {
          pushX += Math.random() - 0.5
          pushZ += Math.random() - 0.5
        }
      }
      if (pushX !== 0 || pushZ !== 0) {
        enemyPosition.x += pushX * MOB_SEPARATION_STRENGTH * delta
        enemyPosition.z += pushZ * MOB_SEPARATION_STRENGTH * delta
      }
    }

    enemyPosition.y = getMobOutdoorFootY(enemyPosition.x, enemyPosition.z, enemyPosition.y)

    targetRef.current.position.x = enemyPosition.x
    targetRef.current.position.y = enemyPosition.y
    targetRef.current.position.z = enemyPosition.z

    const attack = attackRef.current
    if (!attack) return

    if (!attack.fired && state.clock.elapsedTime >= attack.contactAt) {
      attack.fired = true
      const currentDistance = Math.hypot(
        aggroPosition.x - enemyPosition.x,
        aggroPosition.z - enemyPosition.z,
      )
      const currentWeightedDistance = getWeightedMobTargetDistance(enemyPosition, effectiveAggroTarget)
      if (currentWeightedDistance <= cfg.attackRange + 0.15) {
        if (aggroTarget && !aggroTarget.isPlayer) {
          // Frappe un squelette invoqué (allié)
          aggroTarget.takeDamage?.({
            damage: cfg.attackDamage,
            direction: {
              x: (aggroPosition.x - enemyPosition.x) / (currentDistance || 1),
              z: (aggroPosition.z - enemyPosition.z) / (currentDistance || 1),
            },
            attackerId: enemyId,
          })
        } else {
          onHitPlayer?.({
            damage: cfg.attackDamage,
            sourcePosition: [enemyPosition.x, enemyPosition.y, enemyPosition.z],
            sourceId: enemyId,
          })
        }
        leashTimerRef.current = Math.max(0, leashTimerRef.current - cfg.leashCombatBonus)
      }
    }

    if (state.clock.elapsedTime >= attack.endsAt) {
      attackRef.current = null
      if (stateRef.current === 'attack') {
        stateRef.current = weightedDistanceToTarget > cfg.attackRange ? 'chase' : 'attack'
      }
      setMotion(stateRef.current === 'chase' ? 'walk' : 'idle')
    }

  })

  targetRef.current.position.x = currentPositionRef.current.x
  targetRef.current.position.y = currentPositionRef.current.y
  targetRef.current.position.z = currentPositionRef.current.z
  targetRef.current.id = enemyId
  targetRef.current.radius = cfg.targetRadius ?? 0.48
  targetRef.current.height = cfg.targetHeight ?? 1.2
  targetRef.current.disabled = passive || !active || defeated
  targetRef.current.takeDamage = takeDamage

  const hpRatio = MathUtils.clamp(hp / cfg.maxHp, 0, 1)
  const bodyHeight = cfg.targetHeight ?? 1.2
  const hudHeight = cfg.hudHeight ?? 1.55

  return (
    <group ref={groupRef} position={active ? spawnPosition : [0, -500, 0]} rotation={[0, cfg.spawnYaw, 0]}>
      {!defeated && (
        <>
          <group scale={model.scale} renderOrder={isEvading ? 1 : 0}>
            <primitive object={model.object} position={model.offset} />
          </group>
          {isEvading && (
            <>
              {/* Anneau bleu pulsant au sol = mob en fuite invincible */}
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
                <ringGeometry args={[0.32, 0.48, 32]} />
                <meshBasicMaterial color="#4fc3f7" transparent opacity={0.55} depthWrite={false} />
              </mesh>
              {/* Aura bleutée autour du corps */}
              <mesh position={[0, 0.6, 0]}>
                <sphereGeometry args={[0.38, 14, 10]} />
                <meshBasicMaterial color="#29b6f6" transparent opacity={0.18} depthWrite={false} side={DoubleSide} />
              </mesh>
            </>
          )}
          {hitFlash && !isEvading && (
            <mesh position={[0, bodyHeight * 0.65, 0.02]}>
              <sphereGeometry args={[0.24, 18, 12]} />
              <meshBasicMaterial color="#ff4f57" transparent opacity={0.34} depthWrite={false} />
            </mesh>
          )}
          {hudVisible && !isEvading && (
            <Html position={[0, hudHeight, 0]} center transform sprite distanceFactor={3.8}>
              <div className="training-dummy-hud enemy-hud">
                <div className="training-dummy-bar enemy-hp-bar">
                  <span style={{ width: `${hpRatio * 100}%` }} />
                  <div className="training-dummy-hp">{hp} / {cfg.maxHp}</div>
                </div>
              </div>
            </Html>
          )}
        </>
      )}
      {defeated && (
        <>
          <RuntimeParticleEffect
            preset={MOB_DEATH_PARTICLE_PRESET}
            playbackId={enemyId}
          />
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.035, 0]}>
            <ringGeometry args={[0.28, 0.42, 32]} />
            <meshBasicMaterial color="#83d37b" transparent opacity={0.34} />
          </mesh>
        </>
      )}
      {damageNumbers.map((number) => (
        <Html key={number.id} position={[number.x, number.y, number.z]} center transform sprite distanceFactor={4.6}>
          <div className="training-damage-number" style={{ animationDuration: `${number.duration}ms` }}>
            {number.value}
          </div>
        </Html>
      ))}
    </group>
  )
}

// ── Squelette invoqué (allié du joueur) ─────────────────────────────────────
// Réutilise le modèle/texture du squelette ennemi mais avec une IA qui cible
// les ennemis (combatTargetsRef) au lieu du joueur. Possède ses propres PV,
// disparaît à l'expiration de la durée d'invocation ou quand il est tué.
//
// Pool monté en permanence (tant que le crâne est possédé) : chaque instance
// occupe un "slot". Un slot `null` = squelette inactif (caché). Invoquer remplit
// les slots. Comme le modèle/les animations sont déjà construits, l'invocation
// ne provoque aucun freeze (le coût est payé une fois au montage, comme les
// squelettes ennemis qui existent dès le chargement du monde).
function SummonedSkeleton({
  index,
  slotRef,
  playerPositionRef,
  combatTargetsRef,
  groupPositionsRef,
  allyTargetsRef = null,
  playerTargetIdRef = null,
  onExpire,
}) {
  const cfg = MOB_CONFIGS.skeleton
  const allyId = `summon_${index}`
  const sourceModel = useFBX(cfg.modelUrl)
  const forcedTexture = useTexture(cfg.textureUrl ?? SKELETON_ENEMY_TEXTURE_URL)
  const idle = useMixamoGlbAnimation('/models/player/anim/idle.glb')
  const walk = useMixamoGlbAnimation('/models/player/anim/walk.glb')
  const punch = useMixamoGlbAnimation('/models/player/anim/punch.glb')

  const groupRef = useRef()
  const [hp, setHp] = useState(SUMMON_SKELETON_MAX_HP)
  const [motion, setMotion] = useState('idle')
  const [isActiveVisual, setIsActiveVisual] = useState(false)
  const hpRef = useRef(SUMMON_SKELETON_MAX_HP)
  const expiredRef = useRef(false)
  const activeVisualRef = useRef(false)
  const activeTokenRef = useRef(null)
  const nextAttackAtRef = useRef(0)
  const stuckTimerRef = useRef(0)
  const stuckDeflectionRef = useRef(1)
  const lastPositionRef = useRef({ x: 0, z: 0 })
  const currentPositionRef = useRef({ x: 0, y: 0, z: 0 })
  const setActiveVisual = useCallback((nextActive) => {
    if (activeVisualRef.current === nextActive) return
    activeVisualRef.current = nextActive
    setIsActiveVisual(nextActive)
  }, [])

  // Reçoit les dégâts des ennemis qui l'ont pris pour cible (aggro réelle).
  const takeAllyDamage = useCallback(({ damage = 0 }) => {
    if (expiredRef.current || !slotRef?.current) return
    hpRef.current = Math.max(0, hpRef.current - damage)
    setHp(Math.ceil(hpRef.current))
  }, [slotRef])

  // Entrée partagée pour que les ennemis puissent le cibler/le frapper.
  const allyEntryRef = useRef({
    id: allyId,
    isPlayer: false,
    position: currentPositionRef.current,
    disabled: true,
    takeDamage: null,
  })
  allyEntryRef.current.takeDamage = takeAllyDamage

  useEffect(() => {
    if (!allyTargetsRef) return undefined
    allyTargetsRef.current.set(allyId, allyEntryRef.current)
    return () => { allyTargetsRef.current.delete(allyId) }
  }, [allyTargetsRef, allyId])

  const model = useMemo(() => {
    const source = clone(sourceModel)
    if (cfg.textureUrl) {
      forcedTexture.colorSpace = SRGBColorSpace
      forcedTexture.needsUpdate = true
    }
    source.updateWorldMatrix(true, true)
    const box = new Box3().setFromObject(source)
    const size = box.getSize(new Vector3())
    const center = box.getCenter(new Vector3())
    const targetHeight = (cfg.modelTargetHeight ?? 0.85) * WORLD_UNITS_PER_METER
    const scale = targetHeight / Math.max(size.y, 0.001)

    source.traverse((child) => {
      if (child instanceof Mesh) {
        child.castShadow = true
        child.frustumCulled = false
        if (cfg.textureUrl && forcedTexture) {
          const materials = Array.isArray(child.material) ? child.material : [child.material]
          const patched = materials.map((material) => {
            if (!material) return material
            const next = material.clone()
            next.map = forcedTexture
            next.alphaMap = null
            next.transparent = false
            next.opacity = 1
            next.depthWrite = true
            next.side = DoubleSide
            // Teinte spectrale bleutée pour distinguer l'allié de l'ennemi
            next.color?.set('#acd6ff')
            next.emissive?.set('#1b3a6b')
            next.needsUpdate = true
            return next
          })
          child.material = Array.isArray(child.material) ? patched : patched[0]
        }
      }
    })

    return { object: source, offset: [-center.x, -box.min.y, -center.z], scale }
  }, [cfg.modelTargetHeight, cfg.textureUrl, forcedTexture, sourceModel])

  const skeletonHipsRestHeight = useMemo(() => getObjectHipsRestHeight(model.object), [model.object])
  const animationClips = useMemo(() => {
    return [
      { source: idle.animations[0], name: 'idle' },
      { source: walk.animations[0], name: 'walk' },
      { source: punch.animations[0], name: 'punch' },
    ]
      .filter(({ source }) => source)
      .map(({ source, name }) => {
        const clip = source.clone()
        clip.name = name
        lockEmoteHipsHeight(clip, skeletonHipsRestHeight)
        lockHipsPlanarPosition(clip)
        return filterAnimationClipTracksForObject(clip, model.object)
      })
  }, [idle.animations, model.object, walk.animations, punch.animations, skeletonHipsRestHeight])

  const { actions, mixer } = useAnimations(animationClips, model.object)
  const currentActionRef = useRef(null)
  const currentMotionRef = useRef(null)
  const setMotionIfChanged = useCallback((nextMotion) => {
    setMotion((current) => (current === nextMotion ? current : nextMotion))
  }, [])

  const playSummonMotion = useCallback((nextMotion) => {
    const nextAction = actions[nextMotion]
    if (!nextAction || currentActionRef.current === nextAction) return
    const previousAction = currentActionRef.current
    const isOneShot = nextMotion === 'punch'
    nextAction
      .reset()
      .setLoop(isOneShot ? LoopOnce : LoopRepeat, isOneShot ? 1 : Infinity)
      .setEffectiveWeight(1)
      .setEffectiveTimeScale(isOneShot ? 1.4 : 1)
      .play()
    nextAction.clampWhenFinished = isOneShot
    if (previousAction && previousAction !== nextAction) {
      nextAction.crossFadeFrom(previousAction, isOneShot ? 0.08 : 0.16, false)
    }
    currentActionRef.current = nextAction
    currentMotionRef.current = nextMotion
  }, [actions])

  useLayoutEffect(() => {
    if (!actions.idle) return
    playSummonMotion('idle')
    mixer.update(1 / 30)
  }, [actions.idle, mixer, playSummonMotion])

  const expire = useCallback(() => {
    if (expiredRef.current) return
    expiredRef.current = true
    groupPositionsRef?.current?.delete(index)
    setActiveVisual(false)
    onExpire?.(index)
  }, [index, onExpire, groupPositionsRef, setActiveVisual])

  useFrame((state, delta) => {
    const slot = slotRef?.current ?? null
    if (currentMotionRef.current !== motion) playSummonMotion(motion)

    // ── Activation / réinitialisation sur nouveau slot ────────────────────────
    const token = slot?.token ?? null
    if (token !== activeTokenRef.current) {
      activeTokenRef.current = token
      if (slot) {
        currentPositionRef.current.x = slot.spawnPosition[0]
        currentPositionRef.current.y = slot.spawnPosition[1]
        currentPositionRef.current.z = slot.spawnPosition[2]
        hpRef.current = SUMMON_SKELETON_MAX_HP
        setHp(SUMMON_SKELETON_MAX_HP)
        expiredRef.current = false
        setActiveVisual(true)
        nextAttackAtRef.current = 0
      }
    }

    const active = Boolean(slot) && !expiredRef.current
    if (!active) {
      setActiveVisual(false)
      allyEntryRef.current.disabled = true
      groupPositionsRef?.current?.delete(index)
      const g = groupRef.current
      if (g) g.position.set(0, -500, 0)
      return
    }

    const now = Date.now()
    if (now >= slot.expiresAt || hpRef.current <= 0) {
      allyEntryRef.current.disabled = true
      expire()
      const g = groupRef.current
      if (g) g.position.set(0, -500, 0)
      return
    }

    allyEntryRef.current.disabled = false
    const pos = currentPositionRef.current
    groupPositionsRef?.current?.set(index, pos)
    const playerPosition = playerPositionRef?.current

    // ── Cible : UNIQUEMENT la cible du joueur (le dernier ennemi frappé). ──────
    //    Pas de cible du joueur → les squelettes ne foncent pas, ils suivent.
    let target = null
    let targetDist = Infinity
    if (combatTargetsRef?.current) {
      const preferredId = playerTargetIdRef?.current
      if (preferredId) {
        const preferred = combatTargetsRef.current.get(preferredId)
        if (preferred?.position && !preferred.disabled) {
          const d = getWeightedMobTargetDistance(pos, preferred)
          if (d <= SUMMON_SKELETON_AGGRO_RANGE) {
            target = preferred
            targetDist = d
          }
        }
      }
    }
    const hasEnemy = Boolean(target)

    if (hasEnemy) {
      if (targetDist > SUMMON_SKELETON_ATTACK_RANGE) {
        moveMushroomEnemyToward(
          pos, target.position, SUMMON_SKELETON_MOVE_SPEED, delta,
          SUMMON_SKELETON_ATTACK_RANGE * 0.8, stuckTimerRef, stuckDeflectionRef, lastPositionRef,
        )
        setMotionIfChanged('walk')
      } else {
        // En mêlée : on frappe l'ennemi (qui peut riposter via l'aggro réelle)
        if (state.clock.elapsedTime >= nextAttackAtRef.current) {
          nextAttackAtRef.current = state.clock.elapsedTime + SUMMON_SKELETON_ATTACK_COOLDOWN
          const dx = target.position.x - pos.x
          const dz = target.position.z - pos.z
          const len = Math.hypot(dx, dz) || 1
          target.takeDamage?.({
            damage: SUMMON_SKELETON_DAMAGE,
            direction: { x: dx / len, z: dz / len },
            attackerId: allyId,
          })
          setMotionIfChanged('punch')
          window.setTimeout(() => setMotionIfChanged('idle'), 360)
        }
      }
    } else if (playerPosition) {
      // Pas d'ennemi : reste près du joueur
      const distToPlayer = getWeightedMobTargetDistance(pos, { position: playerPosition, isPlayer: true })
      if (distToPlayer > SUMMON_SKELETON_FOLLOW_DISTANCE) {
        moveMushroomEnemyToward(
          pos, playerPosition, SUMMON_SKELETON_MOVE_SPEED, delta,
          SUMMON_SKELETON_FOLLOW_DISTANCE * 0.8, stuckTimerRef, stuckDeflectionRef, lastPositionRef,
        )
        setMotionIfChanged('walk')
      } else {
        setMotionIfChanged('idle')
      }
    }

    // ── Séparation : repousse les squelettes qui se chevauchent ───────────────
    if (groupPositionsRef?.current) {
      let pushX = 0
      let pushZ = 0
      for (const [otherIndex, other] of groupPositionsRef.current) {
        if (otherIndex === index) continue
        const dx = pos.x - other.x
        const dz = pos.z - other.z
        const d = Math.hypot(dx, dz)
        if (d > 0.0001 && d < SUMMON_SKELETON_SEPARATION_DISTANCE) {
          const f = (SUMMON_SKELETON_SEPARATION_DISTANCE - d) / SUMMON_SKELETON_SEPARATION_DISTANCE
          pushX += (dx / d) * f
          pushZ += (dz / d) * f
        } else if (d <= 0.0001) {
          // Chevauchement exact : petite poussée aléatoire pour les décoller
          pushX += Math.random() - 0.5
          pushZ += Math.random() - 0.5
        }
      }
      if (pushX !== 0 || pushZ !== 0) {
        pos.x += pushX * SUMMON_SKELETON_SEPARATION_STRENGTH * delta
        pos.z += pushZ * SUMMON_SKELETON_SEPARATION_STRENGTH * delta
      }
    }

    pos.y = slot.outdoor ? getMobOutdoorFootY(pos.x, pos.z, pos.y) : 0

    const g = groupRef.current
    if (g) {
      g.position.set(pos.x, pos.y, pos.z)
      const look = hasEnemy ? target.position : (motion === 'walk' ? playerPosition : null)
      if (look) {
        const dx = look.x - pos.x
        const dz = look.z - pos.z
        if (Math.hypot(dx, dz) > 0.001) {
          g.rotation.y = dampAngle(g.rotation.y, Math.atan2(dx, dz), 10, delta)
        }
      }
    }
  })

  useEffect(() => {
    const positions = groupPositionsRef?.current
    return () => { positions?.delete(index) }
  }, [groupPositionsRef, index])

  const hpRatio = MathUtils.clamp(hp / SUMMON_SKELETON_MAX_HP, 0, 1)
  const isActive = isActiveVisual

  return (
    <group ref={groupRef} position={[0, -500, 0]}>
      <group scale={model.scale}>
        <primitive object={model.object} position={model.offset} />
      </group>
      <group>
          {/* Aura spectrale au sol pour signaler un allié */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
            <ringGeometry args={[0.28, 0.42, 28]} />
            <meshBasicMaterial color="#7cc4ff" transparent opacity={isActive ? 0.4 : 0} depthWrite={false} />
          </mesh>
          <pointLight color="#6da8ff" intensity={isActive ? 0.7 : 0} distance={2.2} position={[0, 0.6, 0]} />
          <Html position={[0, cfg.hudHeight ?? 1.1, 0]} center transform sprite distanceFactor={3.8}>
            <div className="training-dummy-hud enemy-hud" style={{ display: isActive ? undefined : 'none' }}>
              <div className="training-dummy-bar enemy-hp-bar" style={{ '--hp-color': '#5aa9ff' }}>
                <span style={{ width: `${hpRatio * 100}%`, background: '#5aa9ff' }} />
                <div className="training-dummy-hp">{hp} / {SUMMON_SKELETON_MAX_HP}</div>
              </div>
            </div>
          </Html>
      </group>
    </group>
  )
}

function getTwitchParentHost() {
  if (typeof window === 'undefined') return 'localhost'
  return window.location.hostname || 'localhost'
}

function collidesWithEditableTree(nextX, nextZ) {
  return EDITABLE_TREE_PLACEMENTS.some((treeEntry) => {
    const { x, z } = getEditableTreePosition(treeEntry)
    return Math.hypot(nextX - x, nextZ - z) <= getEditableTreeCollisionRadius(treeEntry) + PLAYER_CAPSULE_RADIUS
  })
}

function collidesWithOutdoorObstacle(nextX, nextZ, footY = getTerrainHeight(nextX, nextZ)) {
  const collidesWithAuthoredObstacle = OUTDOOR_PLAYER_COLLIDERS.some((collider) => {
    if (collider.type === 'circle') {
      return Math.hypot(nextX - collider.x, nextZ - collider.z) <= collider.radius + PLAYER_CAPSULE_RADIUS
    }

    const rotationY = collider.rotationY ?? 0
    const dx = nextX - collider.x
    const dz = nextZ - collider.z
    const cos = Math.cos(-rotationY)
    const sin = Math.sin(-rotationY)
    const localX = dx * cos - dz * sin
    const localZ = dx * sin + dz * cos

    const outsideX = Math.max(Math.abs(localX) - collider.hx, 0)
    const outsideZ = Math.max(Math.abs(localZ) - collider.hz, 0)
    return outsideX * outsideX + outsideZ * outsideZ <= PLAYER_CAPSULE_RADIUS * PLAYER_CAPSULE_RADIUS
  })

  return (
    collidesWithAuthoredObstacle ||
    collidesWithEditableTree(nextX, nextZ) ||
    collidesWithMapObjectSolid(nextX, nextZ, footY, PLAYER_CAPSULE_RADIUS)
  )
}

function getTwitchParentHosts() {
  const hosts = new Set([getTwitchParentHost(), 'localhost', '127.0.0.1'])

  try {
    const topHost = window.top?.location?.hostname
    if (topHost) hosts.add(topHost)
  } catch {}

  return [...hosts].filter(Boolean)
}

function appendTwitchParents(embedUrl) {
  getTwitchParentHosts().forEach((parent) => {
    embedUrl.searchParams.append('parent', parent)
  })
}

function getYouTubeEmbedUrl(url, host) {
  let videoId = ''

  if (host === 'youtu.be') {
    videoId = url.pathname.split('/').filter(Boolean)[0] ?? ''
  } else if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
    if (url.pathname.startsWith('/watch')) {
      videoId = url.searchParams.get('v') ?? ''
    } else if (url.pathname.startsWith('/embed/') || url.pathname.startsWith('/shorts/')) {
      videoId = url.pathname.split('/').filter(Boolean)[1] ?? ''
    }
  }

  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) return null

  const embedUrl = new URL(`https://www.youtube.com/embed/${videoId}`)
  embedUrl.searchParams.set('autoplay', '1')
  embedUrl.searchParams.set('playsinline', '1')
  embedUrl.searchParams.set('enablejsapi', '1')
  if (typeof window !== 'undefined') {
    embedUrl.searchParams.set('origin', window.location.origin)
  }
  return { url: embedUrl.toString(), platform: 'youtube' }
}

function getTwitchEmbedUrl(url, host) {
  const pathParts = url.pathname.split('/').filter(Boolean)

  if (host === 'clips.twitch.tv') {
    const clipSlug = pathParts[0] ?? ''
    if (!/^[a-zA-Z0-9_-]+$/.test(clipSlug)) return null
    const embedUrl = new URL('https://clips.twitch.tv/embed')
    embedUrl.searchParams.set('clip', clipSlug)
    appendTwitchParents(embedUrl)
    embedUrl.searchParams.set('autoplay', 'true')
    return { url: embedUrl.toString(), platform: 'twitch' }
  }

  if (host !== 'twitch.tv' && host !== 'm.twitch.tv') return null

  const clipIndex = pathParts.indexOf('clip')
  if (clipIndex >= 0) {
    const clipSlug = pathParts[clipIndex + 1] ?? ''
    if (!/^[a-zA-Z0-9_-]+$/.test(clipSlug)) return null
    const embedUrl = new URL('https://clips.twitch.tv/embed')
    embedUrl.searchParams.set('clip', clipSlug)
    appendTwitchParents(embedUrl)
    embedUrl.searchParams.set('autoplay', 'true')
    return { url: embedUrl.toString(), platform: 'twitch' }
  }

  if (pathParts[0] === 'videos') {
    const videoId = pathParts[1] ?? ''
    if (!/^\d+$/.test(videoId)) return null
    const embedUrl = new URL('https://player.twitch.tv/')
    embedUrl.searchParams.set('video', `v${videoId}`)
    appendTwitchParents(embedUrl)
    embedUrl.searchParams.set('autoplay', 'true')
    return { url: embedUrl.toString(), platform: 'twitch' }
  }

  const channel = pathParts[0] ?? ''
  if (!/^[a-zA-Z0-9_]{3,25}$/.test(channel)) return null
  const embedUrl = new URL('https://player.twitch.tv/')
  embedUrl.searchParams.set('channel', channel)
  appendTwitchParents(embedUrl)
  embedUrl.searchParams.set('autoplay', 'true')
  return { url: embedUrl.toString(), platform: 'twitch' }
}

function getTikTokEmbedUrl(url, host) {
  if (host !== 'tiktok.com' && host !== 'm.tiktok.com') return null
  const videoId = url.pathname.split('/').filter(Boolean).find((part) => /^\d{10,}$/.test(part)) ?? ''
  if (!videoId) return null
  const embedUrl = new URL(`https://www.tiktok.com/player/v1/${videoId}`)
  embedUrl.searchParams.set('autoplay', '1')
  embedUrl.searchParams.set('controls', '1')
  embedUrl.searchParams.set('volume_control', '1')
  embedUrl.searchParams.set('muted', '0')
  return { url: embedUrl.toString(), platform: 'tiktok' }
}

function getOnlineVideoEmbedUrl(rawUrl) {
  const value = rawUrl.trim()
  if (!value) return null

  try {
    const url = new URL(value.includes('://') ? value : `https://${value}`)
    const host = url.hostname.replace(/^www\./, '')
    return getYouTubeEmbedUrl(url, host) ?? getTwitchEmbedUrl(url, host) ?? getTikTokEmbedUrl(url, host)
  } catch {
    return null
  }
}

function escapeHtmlAttribute(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function InteractiveTvScreen({ screenInfo, tvInstanceId }) {
  const [texture, setTexture] = useState(null)
  const [captureState, setCaptureState] = useState('off')
  const [tvMenuOpen, setTvMenuOpen] = useState(false)
  const [tvOnlinePanelOpen, setTvOnlinePanelOpen] = useState(false)
  const [tvOnlineUrl, setTvOnlineUrl] = useState('')
  const [tvOnlineEmbedUrl, setTvOnlineEmbedUrl] = useState('')
  const [tvOnlinePlatform, setTvOnlinePlatform] = useState('')
  const [tvOnlineMessage, setTvOnlineMessage] = useState('')
  const [tvVolume, setTvVolume] = useState(1)
  const [tvPoweredOn, setTvPoweredOn] = useState(true)
  const [tvPaused, setTvPaused] = useState(false)
  const streamRef = useRef(null)
  const videoRef = useRef(null)
  const youtubeFrameRef = useRef(null)
  const audioContextRef = useRef(null)
  const audioSourceRef = useRef(null)
  const audioGainRef = useRef(null)
  const textureRef = useRef(null)
  const materialRef = useRef(null)
  const objectUrlRef = useRef(null)
  const fittedMediaRef = useRef(null)
  const screenGroupRef = useRef(null)
  const interactionLockRef = useRef(false)
  const mobileFileInputRef = useRef(null)
  const handleFileChangeRef = useRef(null)
  const fileSelectionKeyRef = useRef('')
  const soundUnlockPendingRef = useRef(false)
  const tvMenuElementRef = useRef(null)
  const tvMenuCallbacksRef = useRef({})
  const tvOnlinePlatformRef = useRef('')
  const tvVolumeRef = useRef(1)
  const tvPausedRef = useRef(false)
  const { camera, gl } = useThree()
  const [tvViewportKey, setTvViewportKey] = useState('0x0')
  const isMobileMediaMode = useMemo(() => {
    if (typeof navigator === 'undefined') return false
    return /android|iphone|ipad|ipod/i.test(navigator.userAgent) || !navigator.mediaDevices?.getDisplayMedia
  }, [])
  const cssScreenWidth = 1280
  const cssScreenHeight = Math.max(1, Math.round(cssScreenWidth * ((screenInfo?.height ?? 0.5625) / (screenInfo?.width ?? 1))))

  useEffect(() => {
    tvOnlinePlatformRef.current = tvOnlinePlatform
  }, [tvOnlinePlatform])

  useEffect(() => {
    tvVolumeRef.current = tvVolume
  }, [tvVolume])

  useEffect(() => {
    tvPausedRef.current = tvPaused
  }, [tvPaused])

  useEffect(() => {
    const updateViewportKey = () => {
      const rect = gl.domElement.getBoundingClientRect()
      const width = Math.round(rect.width)
      const height = Math.round(rect.height)
      setTvViewportKey(`${width}x${height}`)
    }

    updateViewportKey()
    const observer = new ResizeObserver(updateViewportKey)
    observer.observe(gl.domElement)
    window.addEventListener('orientationchange', updateViewportKey)
    return () => {
      observer.disconnect()
      window.removeEventListener('orientationchange', updateViewportKey)
    }
  }, [gl])

  const resetAudioGraph = () => {
    audioSourceRef.current?.disconnect()
    audioGainRef.current?.disconnect()
    audioSourceRef.current = null
    audioGainRef.current = null
  }

  const ensureAudioGraph = (video = videoRef.current) => {
    if (!video || audioGainRef.current) return audioGainRef.current
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (!AudioContextClass) return null
    try {
      const context = audioContextRef.current ?? new AudioContextClass()
      audioContextRef.current = context
      const source = context.createMediaElementSource(video)
      const gain = context.createGain()
      source.connect(gain)
      gain.connect(context.destination)
      audioSourceRef.current = source
      audioGainRef.current = gain
      return gain
    } catch (error) {
      console.warn('TV audio graph setup failed', error)
      return null
    }
  }

  useEffect(() => {
    const handleTikTokMessage = (event) => {
      const data = typeof event.data === 'string'
        ? (() => {
            try {
              return JSON.parse(event.data)
            } catch {
              return null
            }
          })()
        : event.data

      if (!data?.['x-tiktok-player'] || tvOnlinePlatformRef.current !== 'tiktok') return

      if (data.type === 'onPlayerReady' && tvVolumeRef.current > 0 && !tvPausedRef.current) {
        window.setTimeout(() => {
          unmuteTikTok()
          postTikTokCommand('play')
        }, 100)
      }

      if (data.type === 'onMute' && data.value === true && tvVolumeRef.current > 0 && !tvPausedRef.current) {
        window.setTimeout(unmuteTikTok, 100)
      }
    }

    window.addEventListener('message', handleTikTokMessage)
    return () => window.removeEventListener('message', handleTikTokMessage)
  }, [])

  const applyVideoVolume = (nextVolume) => {
    const video = videoRef.current
    if (!video) return
    const safeVolume = MathUtils.clamp(nextVolume, 0, 1)
    try {
      video.muted = safeVolume <= 0
      const gain = ensureAudioGraph(video)
      if (gain) {
        gain.gain.value = safeVolume
      } else if (!isMobileMediaMode) {
        video.volume = safeVolume
      }
      if (safeVolume > 0) {
        audioContextRef.current?.resume?.().catch((error) => {
          console.warn('TV audio context resume failed', error)
        })
        video.play().catch((error) => {
          console.warn('TV audio play failed', error)
        })
      }
    } catch (error) {
      console.warn('TV volume update failed', error)
    }
  }

  const prepareVideoAudio = (video, shouldStartMuted) => {
    try {
      video.muted = shouldStartMuted
    } catch (error) {
      console.warn('TV muted setup failed', error)
    }
    if (!isMobileMediaMode) {
      try {
        video.volume = tvVolume
      } catch (error) {
        console.warn('TV volume setup failed', error)
      }
    }
  }

  const postYouTubeCommand = (func, args = []) => {
    const frameWindow = youtubeFrameRef.current?.contentWindow
    if (!frameWindow) return
    frameWindow.postMessage(JSON.stringify({
      event: 'command',
      func,
      args,
    }), 'https://www.youtube.com')
  }

  const applyYouTubeVolume = (nextVolume) => {
    const percent = Math.round(MathUtils.clamp(nextVolume, 0, 1) * 100)
    postYouTubeCommand('setVolume', [percent])
    postYouTubeCommand(percent <= 0 ? 'mute' : 'unMute')
  }

  const postTikTokCommand = (type, value) => {
    const frameWindow = youtubeFrameRef.current?.contentWindow
    if (!frameWindow) return
    const message = {
      type,
      value: value ?? null,
      'x-tiktok-player': true,
    }
    const serializedMessage = JSON.stringify(message)
    frameWindow.postMessage(message, '*')
    frameWindow.postMessage(message, 'https://www.tiktok.com')
    frameWindow.postMessage(serializedMessage, '*')
    frameWindow.postMessage(serializedMessage, 'https://www.tiktok.com')
    window.setTimeout(() => {
      const delayedWindow = youtubeFrameRef.current?.contentWindow
      delayedWindow?.postMessage(message, '*')
      delayedWindow?.postMessage(message, 'https://www.tiktok.com')
      delayedWindow?.postMessage(serializedMessage, '*')
      delayedWindow?.postMessage(serializedMessage, 'https://www.tiktok.com')
    }, 250)
  }

  const unmuteTikTok = () => {
    postTikTokCommand('unMute')
    postTikTokCommand('unmute')
  }

  const restartTikTokPlayback = () => {
    if (!tvOnlineEmbedUrl) return
    try {
      const nextUrl = new URL(tvOnlineEmbedUrl)
      nextUrl.searchParams.set('autoplay', '1')
      nextUrl.searchParams.set('muted', '0')
      nextUrl.searchParams.set('playRequest', `${Date.now()}`)
      setTvOnlineEmbedUrl(nextUrl.toString())
    } catch {}
  }

  const applyOnlineVideoVolume = (nextVolume) => {
    if (tvOnlinePlatform === 'youtube') {
      applyYouTubeVolume(nextVolume)
      return
    }
    if (tvOnlinePlatform === 'tiktok') {
      if (nextVolume <= 0) {
        postTikTokCommand('mute')
      } else {
        unmuteTikTok()
      }
    }
  }

  const drawFittedMedia = (fittedMedia) => {
    const { canvas, context, source, sourceWidth, sourceHeight, texture: fittedTexture } = fittedMedia
    if (!context) return
    if (source instanceof HTMLVideoElement && source.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return
    const safeSourceWidth = Math.max(sourceWidth, 1)
    const safeSourceHeight = Math.max(sourceHeight, 1)
    const canvasAspect = canvas.width / canvas.height
    const sourceAspect = safeSourceWidth / safeSourceHeight
    let drawWidth = canvas.width
    let drawHeight = canvas.height

    if (sourceAspect > canvasAspect) {
      drawHeight = drawWidth / sourceAspect
    } else {
      drawWidth = drawHeight * sourceAspect
    }

    context.fillStyle = '#000000'
    context.fillRect(0, 0, canvas.width, canvas.height)
    try {
      context.drawImage(
        source,
        (canvas.width - drawWidth) / 2,
        (canvas.height - drawHeight) / 2,
        drawWidth,
        drawHeight,
      )
      fittedTexture.needsUpdate = true
    } catch (error) {
      console.warn('TV media draw failed', error)
    }
  }

  const getEventClientPoint = (event) => {
    const touch = event.touches?.[0] ?? event.changedTouches?.[0]
    if (touch) return { x: touch.clientX, y: touch.clientY }
    if (Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
      return { x: event.clientX, y: event.clientY }
    }
    return null
  }

  const isPointerInsideScreen = (event) => {
    const group = screenGroupRef.current
    if (!group) return false
    const point = getEventClientPoint(event)
    if (!point) return false

    group.updateWorldMatrix(true, false)
    const rect = gl.domElement.getBoundingClientRect()
    const localCorners = [
      new Vector3(-screenInfo.width / 2, -screenInfo.height / 2, 0),
      new Vector3(screenInfo.width / 2, -screenInfo.height / 2, 0),
      new Vector3(screenInfo.width / 2, screenInfo.height / 2, 0),
      new Vector3(-screenInfo.width / 2, screenInfo.height / 2, 0),
    ]
    const corners = localCorners.map((corner) => {
      const projected = corner.applyMatrix4(group.matrixWorld).project(camera)
      return {
        x: rect.left + ((projected.x + 1) / 2) * rect.width,
        y: rect.top + ((1 - projected.y) / 2) * rect.height,
      }
    })
    let inside = false
    for (let i = 0, j = corners.length - 1; i < corners.length; j = i, i += 1) {
      const current = corners[i]
      const previous = corners[j]
      const intersects = ((current.y > point.y) !== (previous.y > point.y))
        && point.x < ((previous.x - current.x) * (point.y - current.y)) / (previous.y - current.y) + current.x
      if (intersects) inside = !inside
    }
    return inside
  }

  const triggerScreenInteraction = (event) => {
    event?.stopPropagation?.()
    if (interactionLockRef.current) return
    interactionLockRef.current = true
    window.setTimeout(() => {
      interactionLockRef.current = false
    }, 250)

    handleActiveScreenClick(event)
  }

  const statusLabel = {
    off: isMobileMediaMode ? 'Touchez pour choisir' : 'Touchez pour allumer',
    requesting: 'Choisissez un onglet',
    warming: 'Chargement',
    denied: 'Partage refuse',
    insecure: 'HTTPS requis',
    mobile: 'Touchez pour choisir',
    unsupported: 'Non supporte',
    error: 'Reessayer',
  }[captureState] ?? 'Touchez pour allumer'

  const standbyTexture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = cssScreenWidth
    canvas.height = cssScreenHeight
    const context = canvas.getContext('2d')
    if (context) {
      const centerX = canvas.width / 2
      const centerY = canvas.height / 2
      context.fillStyle = '#020305'
      context.fillRect(0, 0, canvas.width, canvas.height)
      const glow = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, canvas.width * 0.55)
      glow.addColorStop(0, 'rgba(52, 140, 190, 0.2)')
      glow.addColorStop(0.45, 'rgba(14, 26, 38, 0.5)')
      glow.addColorStop(1, 'rgba(0, 0, 0, 0)')
      context.fillStyle = glow
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.fillStyle = '#f8fbff'
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      context.font = '900 68px Segoe UI, Arial, sans-serif'
      context.fillText(statusLabel, centerX, centerY)
      context.fillStyle = 'rgba(248, 251, 255, 0.55)'
      context.font = '500 30px Segoe UI, Arial, sans-serif'
      context.fillText(isMobileMediaMode ? 'Photo ou video' : 'Partage d onglet', centerX, centerY + 86)
    }
    const nextTexture = new CanvasTexture(canvas)
    nextTexture.colorSpace = SRGBColorSpace
    nextTexture.minFilter = LinearFilter
    nextTexture.magFilter = LinearFilter
    nextTexture.generateMipmaps = false
    nextTexture.needsUpdate = true
    return nextTexture
  }, [captureState, cssScreenHeight, isMobileMediaMode])

  useFrame(() => {
    if (fittedMediaRef.current?.isVideo) {
      drawFittedMedia(fittedMediaRef.current)
    }
  })

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      videoRef.current?.pause()
      videoRef.current = null
      resetAudioGraph()
      audioContextRef.current?.close?.()
      audioContextRef.current = null
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = null
      }
      fittedMediaRef.current = null
      mobileFileInputRef.current?.remove()
      mobileFileInputRef.current = null
      tvMenuElementRef.current?.remove()
      tvMenuElementRef.current = null
      setTvMenuOpen(false)
      setTvOnlinePanelOpen(false)
      setTexture((currentTexture) => {
        currentTexture?.dispose()
        textureRef.current = null
        return null
      })
    }
  }, [])

  useEffect(() => {
    return () => {
      standbyTexture.dispose()
    }
  }, [standbyTexture])

  useEffect(() => {
    const handleDocumentScreenPress = (event) => {
      if (activeNearbyTvId !== tvInstanceId) return
      if (event.button && event.button !== 0) return
      if (!isPointerInsideScreen(event)) return
      if (isMobileMediaMode && event.type === 'pointerdown' && event.pointerType === 'touch') return
      event.preventDefault?.()
      triggerScreenInteraction(event)
    }

    document.addEventListener('pointerdown', handleDocumentScreenPress, { capture: true })
    document.addEventListener('touchend', handleDocumentScreenPress, { capture: true, passive: false })
    document.addEventListener('click', handleDocumentScreenPress, { capture: true })
    return () => {
      document.removeEventListener('pointerdown', handleDocumentScreenPress, { capture: true })
      document.removeEventListener('touchend', handleDocumentScreenPress, { capture: true })
      document.removeEventListener('click', handleDocumentScreenPress, { capture: true })
    }
  })

  useEffect(() => {
    const handleOpenMenuRequest = (event) => {
      const requestedObjectId = event.detail?.objectId
      if (requestedObjectId && tvInstanceId && requestedObjectId !== tvInstanceId) return
      setTvMenuOpen(true)
      setTvOnlinePanelOpen(false)
      setTvOnlineMessage('')
    }

    window.addEventListener(TV_MENU_EVENT, handleOpenMenuRequest)
    return () => window.removeEventListener(TV_MENU_EVENT, handleOpenMenuRequest)
  }, [tvInstanceId])

  useEffect(() => {
    if (!tvMenuOpen) {
      tvMenuElementRef.current?.remove()
      tvMenuElementRef.current = null
      return undefined
    }

    const menu = document.createElement('div')
    menu.className = 'tv-control-menu'
    const onActiveClass = tvPoweredOn ? ' is-active' : ''
    const offActiveClass = !tvPoweredOn ? ' is-active' : ''
    const mediaActiveClass = texture && tvPoweredOn ? ' is-active' : ''
    const onlineActiveClass = tvOnlineEmbedUrl && tvPoweredOn ? ' is-active' : ''
    const pauseLabel = tvPaused ? 'Play' : 'Pause'
    menu.innerHTML = `
      <div class="tv-control-row">
        <button type="button" class="${onActiveClass}" data-tv-action="on">On</button>
        <button type="button" class="${offActiveClass}" data-tv-action="off">Off</button>
        <button type="button" data-tv-action="pause">${pauseLabel}</button>
        <button type="button" class="${mediaActiveClass}" data-tv-action="change">Fichier</button>
        <button type="button" class="${onlineActiveClass}" data-tv-action="online">Video en ligne</button>
        <button type="button" data-tv-action="volumeDown">Volume -</button>
        <span class="tv-volume-readout">${Math.round(tvVolume * 100)}%</span>
        <button type="button" data-tv-action="volumeUp">Volume +</button>
        <button type="button" class="tv-menu-close" data-tv-action="close" aria-label="Fermer">×</button>
      </div>
      ${tvOnlinePanelOpen ? `
        <form class="tv-online-form" data-tv-online-form>
          <input
            type="url"
            name="youtubeUrl"
            value="${escapeHtmlAttribute(tvOnlineUrl)}"
            placeholder="Lien video YouTube / TikTok / Twitch"
            autocomplete="off"
          />
          <button type="submit">Lire</button>
        </form>
        ${tvOnlineMessage ? `<span class="tv-online-message">${tvOnlineMessage}</span>` : ''}
      ` : ''}
    `
    const stopMenuEvent = (event) => {
      event.stopPropagation()
      if (!event.target?.closest?.('input, form')) {
        event.preventDefault?.()
      }
    }
    const handleMenuClick = (event) => {
      const action = event.target?.dataset?.tvAction
      if (!action) return
      event.preventDefault()
      event.stopPropagation()
      tvMenuCallbacksRef.current[action]?.(event)
    }
    const handleMenuSubmit = (event) => {
      event.preventDefault()
      event.stopPropagation()
      const form = event.target
      if (!form.matches('[data-tv-online-form]')) return
      const url = form.elements.youtubeUrl?.value ?? ''
      tvMenuCallbacksRef.current.submitOnline?.(url)
    }
    menu.addEventListener('pointerdown', stopMenuEvent)
    menu.addEventListener('touchend', stopMenuEvent)
    menu.addEventListener('dblclick', stopMenuEvent)
    menu.addEventListener('click', handleMenuClick)
    menu.addEventListener('submit', handleMenuSubmit)
    document.body.appendChild(menu)
    tvMenuElementRef.current = menu
    if (tvOnlinePanelOpen) {
      menu.querySelector('input[name="youtubeUrl"]')?.focus()
    }

    return () => {
      menu.removeEventListener('pointerdown', stopMenuEvent)
      menu.removeEventListener('touchend', stopMenuEvent)
      menu.removeEventListener('dblclick', stopMenuEvent)
      menu.removeEventListener('click', handleMenuClick)
      menu.removeEventListener('submit', handleMenuSubmit)
      menu.remove()
      if (tvMenuElementRef.current === menu) {
        tvMenuElementRef.current = null
      }
    }
  }, [texture, tvMenuOpen, tvOnlineEmbedUrl, tvOnlineMessage, tvOnlinePanelOpen, tvOnlinePlatform, tvOnlineUrl, tvPaused, tvVolume, tvPoweredOn])

  if (!screenInfo) return null

  const createFittedTexture = (source, sourceWidth, sourceHeight, isVideo = false) => {
    const canvas = document.createElement('canvas')
    canvas.width = cssScreenWidth
    canvas.height = cssScreenHeight
    const context = canvas.getContext('2d')
    const nextTexture = new CanvasTexture(canvas)
    nextTexture.colorSpace = SRGBColorSpace
    nextTexture.minFilter = LinearFilter
    nextTexture.magFilter = LinearFilter
    nextTexture.generateMipmaps = false
    const fittedMedia = {
      canvas,
      context,
      source,
      sourceWidth,
      sourceHeight,
      texture: nextTexture,
      isVideo,
    }
    drawFittedMedia(fittedMedia)
    fittedMediaRef.current = fittedMedia
    return nextTexture
  }

  const waitForVideoReady = (video, eventName, isReady, timeoutMs = 2500) => {
    if (isReady()) return Promise.resolve()
    return new Promise((resolve, reject) => {
      let timeoutId = null
      const cleanup = () => {
        video.removeEventListener(eventName, handleReady)
        video.removeEventListener('error', handleError)
        if (timeoutId) window.clearTimeout(timeoutId)
      }
      const handleReady = () => {
        cleanup()
        resolve()
      }
      const handleError = () => {
        cleanup()
        reject(video.error ?? new Error('Video load failed'))
      }
      timeoutId = window.setTimeout(() => {
        cleanup()
        resolve()
      }, timeoutMs)
      video.addEventListener(eventName, handleReady, { once: true })
      video.addEventListener('error', handleError, { once: true })
    })
  }

  const stopCapture = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    videoRef.current?.pause()
    videoRef.current = null
    resetAudioGraph()
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
    fittedMediaRef.current = null
    soundUnlockPendingRef.current = false
    setTvMenuOpen(false)
    setTexture((currentTexture) => {
      currentTexture?.dispose()
      textureRef.current = null
      return null
    })
    setTvPoweredOn(true)
    setTvPaused(false)
    setCaptureState('off')
  }

  const clearTextureMedia = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    videoRef.current?.pause()
    videoRef.current = null
    resetAudioGraph()
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
    fittedMediaRef.current = null
    soundUnlockPendingRef.current = false
    setTexture((currentTexture) => {
      currentTexture?.dispose()
      textureRef.current = null
      return null
    })
    setTvPaused(false)
  }

  const openFilePicker = (event) => {
    event?.stopPropagation?.()
    setTvMenuOpen(false)
    setTvOnlinePanelOpen(false)
    const input = mobileFileInputRef.current ?? document.createElement('input')
    input.type = 'file'
    input.accept = 'video/*,image/*'
    if (!mobileFileInputRef.current) {
      input.setAttribute('aria-hidden', 'true')
      input.tabIndex = -1
      Object.assign(input.style, {
        position: 'fixed',
        left: '0',
        top: '0',
        width: '1px',
        height: '1px',
        opacity: '0',
        pointerEvents: 'none',
        zIndex: '-1',
      })
      input.addEventListener('change', (changeEvent) => {
        handleFileChangeRef.current?.(changeEvent)
      })
      document.body.appendChild(input)
      mobileFileInputRef.current = input
    }
    input.value = ''
    input.click()
  }

  const handleActiveScreenClick = async (event) => {
    event?.stopPropagation?.()
    setTvMenuOpen(true)
  }

  const turnTvOff = (event) => {
    event?.stopPropagation?.()
    videoRef.current?.pause()
    if (tvOnlinePlatform === 'youtube') postYouTubeCommand('pauseVideo')
    if (tvOnlinePlatform === 'tiktok') postTikTokCommand('pause')
    setTvPoweredOn(false)
    setTvPaused(false)
    setTvMenuOpen(true)
  }

  const changeTvMedia = async (event) => {
    event?.stopPropagation?.()
    setTvMenuOpen(false)
    setTvOnlinePanelOpen(false)
    setTvOnlineEmbedUrl('')
    setTvOnlinePlatform('')
    setTvOnlineMessage('')
    if (isMobileMediaMode) {
      openFilePicker(event)
      return
    }
    stopCapture()
    await startCapture(event)
  }

  const changeVolume = (delta) => {
    const nextVolume = MathUtils.clamp(tvVolume + delta, 0, 1)
    setTvVolume(nextVolume)
    if (tvOnlineEmbedUrl && tvPoweredOn) {
      applyOnlineVideoVolume(nextVolume)
    } else {
      applyVideoVolume(nextVolume)
    }
    if (nextVolume > 0) {
      soundUnlockPendingRef.current = false
    }
  }

  const volumeDown = (event) => {
    event?.stopPropagation?.()
    changeVolume(-0.1)
  }

  const volumeUp = (event) => {
    event?.stopPropagation?.()
    changeVolume(0.1)
  }

  const openOnlinePanel = (event) => {
    event?.stopPropagation?.()
    setTvOnlinePanelOpen(true)
    setTvOnlineMessage('')
    setTvMenuOpen(true)
  }

  const submitOnlineVideo = (url) => {
    const nextUrl = url.trim()
    const embed = getOnlineVideoEmbedUrl(nextUrl)
    setTvOnlineUrl(nextUrl)

    if (!embed) {
      setTvOnlineMessage('Lien video invalide')
      setTvOnlinePanelOpen(true)
      setTvMenuOpen(true)
      return
    }

    clearTextureMedia()
    setTvOnlineEmbedUrl(embed.url)
    setTvOnlinePlatform(embed.platform)
    setTvOnlineMessage('')
    setTvOnlinePanelOpen(false)
    setTvPoweredOn(true)
    setTvPaused(false)
    setCaptureState('playing')
    setTvMenuOpen(true)
  }

  const turnTvOn = async (event) => {
    event?.stopPropagation?.()
    if (tvOnlineEmbedUrl) {
      setTvPoweredOn(true)
      setTvPaused(false)
      if (tvOnlinePlatform === 'youtube') {
        postYouTubeCommand('playVideo')
        applyYouTubeVolume(tvVolume)
      }
    if (tvOnlinePlatform === 'tiktok') {
      unmuteTikTok()
      postTikTokCommand('play')
    }
      setTvMenuOpen(true)
      return
    }
    if (texture && videoRef.current) {
      setTvPoweredOn(true)
      setTvPaused(false)
      applyVideoVolume(tvVolume > 0 ? tvVolume : 1)
      await videoRef.current.play().catch((error) => {
        console.warn('TV play failed', error)
      })
      setTvMenuOpen(true)
      return
    }
    setTvMenuOpen(false)
    if (isMobileMediaMode) {
      openFilePicker(event)
      return
    }
    await startCapture(event)
  }

  const toggleTvPause = async (event) => {
    event?.stopPropagation?.()
    if (!tvPoweredOn) return
    const shouldPause = !tvPaused

    if (tvOnlineEmbedUrl) {
      if (tvOnlinePlatform === 'youtube') {
        postYouTubeCommand(shouldPause ? 'pauseVideo' : 'playVideo')
        if (!shouldPause) applyYouTubeVolume(tvVolume)
      }
      if (tvOnlinePlatform === 'tiktok') {
        postTikTokCommand(shouldPause ? 'pause' : 'play')
        if (!shouldPause) {
          unmuteTikTok()
        }
      }
      setTvPaused(shouldPause)
      setTvMenuOpen(true)
      return
    }

    const video = videoRef.current
    if (!video) return
    if (shouldPause) {
      video.pause()
    } else {
      applyVideoVolume(tvVolume)
      await video.play().catch((error) => {
        console.warn('TV resume failed', error)
      })
    }
    setTvPaused(shouldPause)
    setTvMenuOpen(true)
  }

  tvMenuCallbacksRef.current = {
    on: turnTvOn,
    off: turnTvOff,
    pause: toggleTvPause,
    change: changeTvMedia,
    online: openOnlinePanel,
    submitOnline: submitOnlineVideo,
    close: () => {
      setTvMenuOpen(false)
      setTvOnlinePanelOpen(false)
      setTvOnlineMessage('')
    },
    volumeDown,
    volumeUp,
  }

  const handleScreenPointerDown = (event) => {
    triggerScreenInteraction(event)
  }

  const handleFileChange = async (event) => {
    event?.stopPropagation?.()
    const input = event.target
    const file = input.files?.[0]
    if (!file) return
    const selectionKey = `${file.name}-${file.size}-${file.lastModified}`
    if (fileSelectionKeyRef.current === selectionKey) return
    fileSelectionKeyRef.current = selectionKey
    window.setTimeout(() => {
      if (fileSelectionKeyRef.current === selectionKey) {
        fileSelectionKeyRef.current = ''
      }
    }, 2000)

    const fileName = file.name?.toLowerCase() ?? ''
    const isVideo = file.type.startsWith('video/') || /\.(mp4|mov|m4v|webm|ogg)$/i.test(fileName)
    const isImage = file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|heic|heif)$/i.test(fileName)
    if (!isVideo && !isImage) {
      setCaptureState('error')
      input.value = ''
      return
    }

    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    videoRef.current?.pause()
    videoRef.current = null
    resetAudioGraph()
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
    fittedMediaRef.current = null
    soundUnlockPendingRef.current = false
    setTvMenuOpen(false)
    setTvOnlineEmbedUrl('')
    setTvOnlinePlatform('')
    setTvOnlinePanelOpen(false)
    setTvPaused(false)
    setTvPoweredOn(true)
    setCaptureState('warming')

    try {
      if (isVideo) {
        const url = URL.createObjectURL(file)
        objectUrlRef.current = url
        const video = document.createElement('video')
        video.src = url
        video.loop = true
        video.playsInline = true
        video.setAttribute('playsinline', 'true')
        video.setAttribute('webkit-playsinline', 'true')
        video.autoplay = true
        video.preload = 'auto'
        videoRef.current = video
        prepareVideoAudio(video, isMobileMediaMode || tvVolume <= 0)
        video.load()
        await waitForVideoReady(
          video,
          'loadedmetadata',
          () => video.readyState >= HTMLMediaElement.HAVE_METADATA && video.videoWidth > 0,
        )
        await video.play().catch((error) => {
          console.warn('TV local video autoplay delayed', error)
        })
        await waitForVideoReady(
          video,
          'loadeddata',
          () => video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA,
        )
        const nextTexture = createFittedTexture(
          video,
          video.videoWidth || cssScreenWidth,
          video.videoHeight || cssScreenHeight,
          true,
        )
        setTexture((currentTexture) => {
          currentTexture?.dispose()
          textureRef.current = nextTexture
          return nextTexture
        })
        setTvPoweredOn(true)
        setTvPaused(false)
        soundUnlockPendingRef.current = isMobileMediaMode
        setCaptureState('playing')
        return
      }

      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      const image = new Image()
      await new Promise((resolve, reject) => {
        image.onload = resolve
        image.onerror = reject
        image.src = dataUrl
      })
      const nextTexture = createFittedTexture(image, image.naturalWidth, image.naturalHeight)
      setTexture((currentTexture) => {
        currentTexture?.dispose()
        textureRef.current = nextTexture
        return nextTexture
      })
      setTvPoweredOn(true)
      setTvPaused(false)
      soundUnlockPendingRef.current = false
      setCaptureState('playing')
    } catch (error) {
      console.warn('TV local media failed', error)
      stopCapture()
      setCaptureState('error')
    } finally {
      input.value = ''
    }
  }

  handleFileChangeRef.current = handleFileChange

  const startCapture = async (event) => {
    event?.stopPropagation?.()
    if (isMobileMediaMode) {
      setCaptureState('mobile')
      return
    }

    if (!window.isSecureContext) {
      setCaptureState('insecure')
      return
    }

    if (!navigator.mediaDevices?.getDisplayMedia) {
      setCaptureState('unsupported')
      return
    }

    setCaptureState('requesting')
    try {
      setTvOnlineEmbedUrl('')
      setTvOnlinePlatform('')
      setTvOnlinePanelOpen(false)
      setTvOnlineMessage('')
      setTvPaused(false)
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30, max: 30 },
        },
        audio: true,
      })
      streamRef.current = stream
      const video = document.createElement('video')
      video.srcObject = stream
      video.playsInline = true
      video.autoplay = true
      videoRef.current = video
      prepareVideoAudio(video, tvVolume <= 0)

      stream.getVideoTracks()[0]?.addEventListener('ended', stopCapture, { once: true })
      await video.play()
      if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
        await new Promise((resolve) => {
          video.addEventListener('loadedmetadata', resolve, { once: true })
        })
      }
      setCaptureState('warming')
      await new Promise((resolve) => {
        if ('requestVideoFrameCallback' in video) {
          video.requestVideoFrameCallback(() => resolve())
          return
        }
        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0) {
          resolve()
          return
        }
        video.addEventListener('loadeddata', resolve, { once: true })
      })

      const nextTexture = createFittedTexture(video, video.videoWidth, video.videoHeight, true)
      setTexture((currentTexture) => {
        currentTexture?.dispose()
        textureRef.current = nextTexture
        return nextTexture
      })
      setTvPoweredOn(true)
      setTvPaused(false)
      setCaptureState('playing')
    } catch (error) {
      console.warn('TV capture failed', error)
      stopCapture()
      setCaptureState(error?.name === 'NotAllowedError' ? 'denied' : 'error')
    }
  }

  const showTextureScreen = texture && tvPoweredOn
  const showOnlineScreen = tvOnlineEmbedUrl && tvPoweredOn
  const youtubeCssWidth = 640
  const youtubeCssHeight = Math.max(1, Math.round(youtubeCssWidth * ((screenInfo?.height ?? 0.5625) / (screenInfo?.width ?? 1))))
  const screenHtmlScale = (screenInfo.width * 400) / youtubeCssWidth
  const youtubeViewportReady = tvViewportKey !== '0x0'
  const youtubeFrameKey = `${tvOnlineEmbedUrl}:${tvViewportKey}`

  return (
    <group ref={screenGroupRef} position={screenInfo.position} quaternion={screenInfo.quaternion}>
      {(texture ? [-0.002, 0.002] : [0]).map((zOffset) => (
        <mesh
          key={zOffset}
          position={[0, 0, zOffset]}
          onPointerDown={handleScreenPointerDown}
        >
          <planeGeometry args={[screenInfo.width, screenInfo.height]} />
          {showTextureScreen ? (
            <meshBasicMaterial
              ref={zOffset > 0 ? materialRef : undefined}
              map={texture}
              toneMapped={false}
              side={zOffset > 0 ? FrontSide : BackSide}
            />
          ) : showOnlineScreen ? (
            <meshBasicMaterial color="#020202" toneMapped={false} side={DoubleSide} />
          ) : (
            <meshBasicMaterial map={standbyTexture} toneMapped={false} side={DoubleSide} />
          )}
        </mesh>
      ))}
      {showOnlineScreen && youtubeViewportReady && (
        <Html
          key={youtubeFrameKey}
          transform
          occlude="blending"
          center
          distanceFactor={screenHtmlScale}
          zIndexRange={[1, 0]}
          position={[0, 0, 0.006]}
          style={{
            width: `${youtubeCssWidth}px`,
            height: `${youtubeCssHeight}px`,
            pointerEvents: 'auto',
            overflow: 'hidden',
            transformOrigin: '50% 50%',
          }}
        >
          <div className="tv-youtube-fill">
            <iframe
              key={youtubeFrameKey}
              ref={youtubeFrameRef}
              className="tv-youtube-frame"
              src={tvOnlineEmbedUrl}
              title="Video en ligne"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; fullscreen; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              scrolling="no"
              onLoad={() => {
                if (tvOnlinePlatform === 'youtube') {
                  applyYouTubeVolume(tvVolume)
                  postYouTubeCommand(tvPaused ? 'pauseVideo' : 'playVideo')
                }
                if (tvOnlinePlatform === 'tiktok') {
                  if (tvPaused) {
                    postTikTokCommand('pause')
                  } else {
                    if (tvVolume > 0) unmuteTikTok()
                    postTikTokCommand('play')
                  }
                }
              }}
            />
          </div>
        </Html>
      )}
    </group>
  )
}

function EditableObject({ object, selected, mode, onSelect, onStartDragging, onObjectRef, registerCombatTarget, onTrainingDummyDefeated }) {
  const isCustomizeMode = mode === 'customize'
  const catalogItem = objectCatalog[object.objectId]
  const isTrainingDummy = catalogItem?.combat?.kind === 'training_dummy'
  const selectionRing = object.type === 'rug'
    ? [1.45, 1.54]
    : object.type === 'sofa' || object.type === 'desk'
      ? [1.05, 1.12]
      : [0.62, 0.68]
  const groupRef = useRef(null)

  useEffect(() => {
    const group = groupRef.current
    if (!group) return undefined

    group.userData.placedObjectId = object.id
    group.traverse((child) => {
      child.userData.placedObjectId = object.id
    })
    onObjectRef(object.id, group)

    return () => onObjectRef(object.id, null)
  }, [object.id, onObjectRef])

  if (object.type === 'goal') return null

  const handlePointerDown = (event) => {
    if (!isCustomizeMode || !object.canMove) return
    event.stopPropagation()
    onSelect(object.id)
    onStartDragging(object.id)
  }

  return (
    <group
      position={object.position}
      rotation={[0, object.rotationY, 0]}
      onPointerDown={handlePointerDown}
      userData={{ debugCategory: 'placeables' }}
    >
      <group ref={groupRef}>
        <Suspense fallback={null}>
          {isTrainingDummy ? (
            <TrainingDummyModel
              object={object}
              registerCombatTarget={registerCombatTarget}
              onDefeated={onTrainingDummyDefeated}
            />
          ) : (
            <PlaceableModel objectId={object.objectId} type={object.type} placedObjectId={object.id} />
          )}
        </Suspense>
      </group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.035, 0]}
        visible={selected}
        userData={{ ignorePlacementSupport: true, placedObjectId: object.id }}
      >
        <ringGeometry args={[selectionRing[0], selectionRing[1], 36]} />
        <meshBasicMaterial color="#ffd447" transparent opacity={0.95} />
      </mesh>
    </group>
  )
}

const CUSTOMIZE_PAN_BOUNDS = { minX: -6, maxX: 6, minZ: -6, maxZ: 12 }

function RoomBorder({ width, depth, posX = 0, posZ = 0, visible = true }) {
  const positions = useMemo(() => new Float32Array([
    -width / 2, 0, -depth / 2,
     width / 2, 0, -depth / 2,
     width / 2, 0,  depth / 2,
    -width / 2, 0,  depth / 2,
  ]), [width, depth])

  return (
    <lineLoop position={[posX, 0.07, posZ]} visible={visible}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" array={positions} count={4} itemSize={3} />
      </bufferGeometry>
      <lineBasicMaterial color="#f2c14e" />
    </lineLoop>
  )
}

function EditableFloor({
  mode,
  draggingObjectId,
  placingObjectId,
  placementLocked,
  getPlacementY,
  getFootprint,
  onDrag,
  onLockPlacement,
  onStopDragging,
  onClearSelection,
}) {
  const { camera } = useThree()
  const lastClientRef = useRef(null)
  const isActive = mode === 'customize'

  useEffect(() => {
    if (!isActive) {
      camera.position.x = 0
      camera.position.z = 0
    }
  }, [isActive, camera])

  const getSnappedPlacement = (point, objectId) => {
    const { hx, hz } = getFootprint(objectId)
    const x = MathUtils.clamp(snap(point.x), -PARCEL_HALF + hx, PARCEL_HALF - hx)
    const z = MathUtils.clamp(snap(point.z), -PARCEL_HALF + hz, PARCEL_HALF - hz)
    return [x, getPlacementY(x, z, objectId), z]
  }

  const isPanning = !draggingObjectId && !placingObjectId

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0.028, 0]}
      visible={isActive}
      onPointerDown={(event) => {
        if (!isActive) return
        if (isPanning) {
          if (event.pointerType === 'touch' && lastClientRef.current) {
            // Second finger landed — cancel pan to let pinch zoom take over
            lastClientRef.current = null
          } else {
            lastClientRef.current = { x: event.clientX, y: event.clientY }
          }
        }
      }}
      onPointerMove={(event) => {
        if (!isActive) return
        if (isPanning) {
          if (lastClientRef.current) {
            const dx = event.clientX - lastClientRef.current.x
            const dy = event.clientY - lastClientRef.current.y
            lastClientRef.current = { x: event.clientX, y: event.clientY }
            const worldPerPixel = 1 / camera.zoom
            camera.position.x = MathUtils.clamp(camera.position.x - dx * worldPerPixel, CUSTOMIZE_PAN_BOUNDS.minX, CUSTOMIZE_PAN_BOUNDS.maxX)
            camera.position.z = MathUtils.clamp(camera.position.z - dy * worldPerPixel, CUSTOMIZE_PAN_BOUNDS.minZ, CUSTOMIZE_PAN_BOUNDS.maxZ)
          }
          return
        }
        if (placingObjectId && placementLocked) return
        event.stopPropagation()
        const objectId = draggingObjectId ?? placingObjectId
        onDrag(objectId, getSnappedPlacement(event.point, objectId))
      }}
      onClick={(event) => {
        if (!isActive) return
        if (!placingObjectId || placementLocked) return
        event.stopPropagation()
        onDrag(placingObjectId, getSnappedPlacement(event.point, placingObjectId))
        onLockPlacement()
      }}
      onPointerUp={(event) => {
        if (!isActive) return
        lastClientRef.current = null
        event.stopPropagation()
        onStopDragging()
      }}
      onPointerMissed={() => {
        if (!isActive) return
        lastClientRef.current = null
        onStopDragging()
        onClearSelection()
      }}
    >
      <planeGeometry args={[PLAYER_PLOT_SIZE + 4, PLAYER_PLOT_SIZE + 4]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  )
}

function PlacementPreview({ object, preview, groupRef }) {
  if (!object || !preview) return null

  return (
    <group position={preview.position} rotation={[0, preview.rotationY, 0]}>
      <group ref={groupRef} scale={0.96}>
        <Suspense fallback={null}>
          <PlaceableModel objectId={object.objectId} type={object.type} placedObjectId={object.id} />
        </Suspense>
      </group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.045, 0]}
        userData={{ ignorePlacementSupport: true }}
      >
        <ringGeometry args={[1.08, 1.16, 40]} />
        <meshBasicMaterial color={preview.isValid ? '#66ff9a' : '#ff5f5f'} transparent opacity={0.92} />
      </mesh>
    </group>
  )
}

function CustomizationLayer({
  mode,
  objects,
  hideInteriorObjects = false,
  selectedObjectId,
  draggingObjectId,
  placingObjectId,
  placementPreview,
  placementLocked,
  onSelect,
  onStartDragging,
  onStopDragging,
  onUpdatePosition,
  onUpdatePlacementPreview,
  onLockPlacement,
  registerCombatTarget,
  onTrainingDummyDefeated,
}) {
  const placedObjects = objects.filter((object) => (
    object.status !== 'stored' &&
    (!hideInteriorObjects || !isPositionInsideHouse(object.position, 0.35))
  ))
  const placingObject = objects.find((object) => object.id === placingObjectId)
  const placeableRefs = useRef(new Map())
  const previewGroupRef = useRef()
  const placingObjectIdRef = useRef(placingObjectId)
  useEffect(() => { placingObjectIdRef.current = placingObjectId }, [placingObjectId])

  const registerPlaceableRef = useCallback((id, object3D) => {
    if (object3D) {
      placeableRefs.current.set(id, object3D)
      return
    }
    placeableRefs.current.delete(id)
  }, [])

  const getFootprint = useCallback((objectId) => {
    const isPreview = objectId === placingObjectIdRef.current
    const object3D = isPreview ? previewGroupRef.current : placeableRefs.current.get(objectId)
    if (!object3D) return { hx: 0, hz: 0 }
    object3D.updateWorldMatrix(true, true)
    const box = new Box3().setFromObject(object3D)
    const size = box.getSize(new Vector3())
    return { hx: size.x / 2, hz: size.z / 2 }
  }, [])

  const getFloorPlacementY = useCallback((x, z) => {
    const insideHouse = houseLayout.rooms.some((room) => {
      const [rx, , rz] = room.position
      return (
        Math.abs(x - rx) <= room.size[0] * 0.5 &&
        Math.abs(z - rz) <= room.size[2] * 0.5
      )
    })
    return insideHouse ? 0 : getTerrainHeight(x, z)
  }, [])

  const getPlacementY = useCallback((x, z, ignoredObjectId) => {
    const movingObject = objects.find((object) => object.id === ignoredObjectId)
    if (movingObject?.type === 'rug' || objectCatalog[movingObject?.objectId]?.type === 'rug') {
      return getFloorPlacementY(x, z)
    }

    const supportObjects = Array.from(placeableRefs.current.entries())
      .filter(([id]) => id !== ignoredObjectId)
      .map(([, object3D]) => object3D)

    if (supportObjects.length === 0) return getFloorPlacementY(x, z)

    supportObjects.forEach((object3D) => object3D.updateMatrixWorld(true))
    placementRayOrigin.set(x, CUSTOM_PLACEMENT_RAY_START_Y, z)
    placementRaycaster.set(placementRayOrigin, placementRayDirection)

    const hit = placementRaycaster
      .intersectObjects(supportObjects, true)
      .find((intersection) => {
        const hitObjectId = intersection.object.userData.placedObjectId
        return !intersection.object.userData.ignorePlacementSupport && hitObjectId !== ignoredObjectId
      })

    if (hit) return hit.point.y
    return getFloorPlacementY(x, z)
  }, [getFloorPlacementY, objects])

  return (
    <group userData={{ debugCategory: 'placeables' }}>
      <CustomizationCamera active={mode === 'customize'} />
      <EditableFloor
        mode={mode}
        draggingObjectId={draggingObjectId}
        placingObjectId={placingObjectId}
        placementLocked={placementLocked}
        getPlacementY={getPlacementY}
        getFootprint={getFootprint}
        onDrag={(id, position) => {
          if (placingObjectId) {
            onUpdatePlacementPreview(position)
            return
          }
          onUpdatePosition(id, position)
        }}
        onStopDragging={onStopDragging}
        onClearSelection={() => onSelect(null)}
        onLockPlacement={onLockPlacement}
      />
      <group visible={mode === 'customize'}>
        <gridHelper
          args={[MAIN_ROOM.width, MAIN_ROOM.width / CUSTOM_GRID_SIZE, '#f2c14e', '#d8e0e8']}
          position={[0, 0.032, 0]}
        />
        <RoomBorder width={MAIN_ROOM.width} depth={MAIN_ROOM.depth} />
        <RoomBorder
          width={secondRoom.size[0]}
          depth={secondRoom.size[2]}
          posX={secondRoom.position[0]}
          posZ={secondRoom.position[2]}
        />
      </group>
      {placedObjects.map((object) => (
        <EditableObject
          key={object.id}
          object={object}
          selected={selectedObjectId === object.id}
          mode={mode}
          onSelect={onSelect}
          onStartDragging={onStartDragging}
          onObjectRef={registerPlaceableRef}
          registerCombatTarget={registerCombatTarget}
          onTrainingDummyDefeated={onTrainingDummyDefeated}
        />
      ))}
      <PlacementPreview object={placingObject} preview={placementPreview} groupRef={previewGroupRef} />
    </group>
  )
}

function InventoryPreviewIcon({ type }) {
  return (
    <div className={`inventory-preview-icon ${type}`}>
      {type === 'sofa' && (
        <>
          <span className="inventory-sofa-back" />
          <span className="inventory-sofa-seat" />
          <span className="inventory-sofa-arm left" />
          <span className="inventory-sofa-arm right" />
        </>
      )}
    </div>
  )
}

function InventoryThumbnail({ card }) {
  const [failed, setFailed] = useState(false)

  if (card.thumbnail && !failed) {
    return (
      <img
        className="inventory-thumbnail-img"
        src={card.thumbnail}
        alt=""
        onError={() => setFailed(true)}
      />
    )
  }

  return <InventoryPreviewIcon type={card.type} />
}

function ObjectInventorySheet({ open, cards, placingObjectId, onToggle, onSelect }) {
  return (
    <div className={`object-inventory-sheet ${open ? 'open' : ''}`}>
      <button className="object-inventory-handle" type="button" onClick={onToggle}>
        Objets
      </button>
      {open && (
        <div className="object-inventory-content">
          <div className="object-inventory-header">
            <h2>Objets</h2>
            <button type="button" aria-label="Fermer" onClick={onToggle}>×</button>
          </div>
          <div className="object-inventory-tabs">
            <button type="button" className="active">Tous</button>
            <button type="button">Meubles</button>
            <button type="button">Lumières</button>
            <button type="button">Déco</button>
            <button type="button">Sols</button>
            <button type="button">Murs</button>
          </div>
          <div className="object-inventory-grid">
            {cards.map((card) => {
              const isAvailable = card.stored > 0
              return (
                <button
                  key={card.objectId}
                  type="button"
                  className={`inventory-card ${!isAvailable ? 'disabled' : ''} ${placingObjectId === card.storedInstanceId ? 'active' : ''}`}
                  onClick={() => {
                    if (isAvailable) onSelect(card.storedInstanceId)
                  }}
                  disabled={!isAvailable}
                >
                  <div className="inventory-card-preview">
                    <InventoryThumbnail card={card} />
                    <span className="inventory-card-quantity">x{card.stored}</span>
                  </div>
                  <div className="inventory-card-name">{card.name}</div>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function LegacyThumbnailTool() {
  const [captures, setCaptures] = useState({})
  const [busyObjectId, setBusyObjectId] = useState(null)
  const [toolMessage, setToolMessage] = useState('')
  const catalogItems = Object.values(objectCatalog)
  const isThumbnailGeneratable = (item) => {
    const url = item.thumbnailModelUrl ?? item.modelUrl
    return ['glb', 'fbx'].includes(url?.split('?')[0].split('.').pop()?.toLowerCase())
  }
  const generatableItems = catalogItems.filter(isThumbnailGeneratable)
  const captureObjectId = useMemo(() => {
    try {
      return new URLSearchParams(window.location.search).get('capture')
    } catch {
      return null
    }
  }, [])

  const generateItemThumbnail = async (item) => {
    const modelUrl = item.thumbnailModelUrl ?? item.modelUrl
    if (!isThumbnailGeneratable(item)) return
    setBusyObjectId(item.id)
    setToolMessage(`Generation de ${item.name}...`)
    try {
      const blob = await generateThumbnailBlob({
        modelUrl,
        textureUrl: item.thumbnailTextureUrl,
        rotationY: (item.modelRotationY ?? 0) + (item.thumbnailRotationY ?? 0),
        margin: item.thumbnailMargin ?? 1.24,
        view: item.thumbnailView ?? 'front',
      })
      const url = URL.createObjectURL(blob)
      setCaptures((current) => {
        if (current[item.id]?.url) URL.revokeObjectURL(current[item.id].url)
        return { ...current, [item.id]: { url, blob } }
      })
      setToolMessage(`Miniature prete : ${item.name}`)
    } catch (error) {
      setToolMessage(`Generation impossible pour ${item.name}: ${error.message}`)
    } finally {
      setBusyObjectId(null)
    }
  }

  const generateMissingThumbnails = async () => {
    for (const item of generatableItems) {
      if (!captures[item.id]) await generateItemThumbnail(item)
    }
    setToolMessage('Generation terminee. Telecharge les miniatures validees en WebP.')
  }

  const downloadCapture = (objectId) => {
    const blob = captures[objectId]?.blob
    if (blob) downloadBlob(blob, `${objectId}.webp`)
  }

  useEffect(() => {
    if (!captureObjectId) return
    const item = objectCatalog[captureObjectId]
    if (!item || !isThumbnailGeneratable(item)) return
    generateItemThumbnail(item)
  }, [captureObjectId])

  if (captureObjectId) {
    const capture = captures[captureObjectId]
    return (
      <main className="thumbnail-capture-page">
        {capture?.url ? <img src={capture.url} alt="" /> : null}
      </main>
    )
  }

  return (
    <main className="thumbnail-tool">
      <div className="thumbnail-tool-panel">
        <div className="thumbnail-tool-header">
          <div>
            <h1>Object thumbnails</h1>
            <p>Outil dev : genere des WebP carres depuis les GLB. Le jeu charge ensuite seulement les images sauvegardees.</p>
          </div>
          <button type="button" onClick={generateMissingThumbnails} disabled={Boolean(busyObjectId)}>
            Generer les manquantes
          </button>
        </div>
        {toolMessage && <div className="thumbnail-tool-message">{toolMessage}</div>}
        <div className="thumbnail-tool-grid">
          {catalogItems.map((item) => (
            <div className="thumbnail-tool-card" key={item.id}>
              <div className="thumbnail-tool-preview">
                {captures[item.id]?.url ? (
                  <img src={captures[item.id].url} alt="" />
                ) : item.thumbnail ? (
                  <img src={item.thumbnail} alt="" />
                ) : (
                  <span>Aucune image</span>
                )}
              </div>
              <div className="thumbnail-tool-info">
                <strong>{item.name}</strong>
                <span>{isThumbnailGeneratable(item) ? 'Compatible' : 'Miniature manuelle'}</span>
                <button
                  type="button"
                  onClick={() => generateItemThumbnail(item)}
                  disabled={Boolean(busyObjectId) || !isThumbnailGeneratable(item)}
                >
                  {captures[item.id] ? 'Regenerer' : 'Generer'}
                </button>
                <button type="button" onClick={() => downloadCapture(item.id)} disabled={!captures[item.id]}>
                  Télécharger PNG
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}

function SkinMenu({
  open,
  coins,
  skins,
  previewIndex,
  selectedSkinId,
  ownedSkinIds,
  onClose,
  onPrevious,
  onNext,
  onBuy,
  onSelect,
  onRespawn,
}) {
  if (!open) return null

  const skin = skins[previewIndex]
  const isOwned = ownedSkinIds.includes(skin.id)
  const isSelected = selectedSkinId === skin.id
  const canBuy = coins >= skin.price

  return (
    <div className="skin-menu-overlay">
      <div className="skin-menu">
        <div className="skin-coins">
          <img src="/ui/coins.png" alt="" aria-hidden="true" />
          <span>{coins} pieces</span>
        </div>
        <div className="skin-title">{skin.name}</div>
        <div className="skin-preview-wrap">
          <div
            className="skin-preview-ball"
            style={{ backgroundImage: `url(${skin.texture})` }}
          />
        </div>
        <div className="skin-nav">
          <button type="button" onClick={onPrevious} className="skin-nav-btn">{'<'}</button>
          <button type="button" onClick={onNext} className="skin-nav-btn">{'>'}</button>
        </div>
        {!isOwned && (
          <button
            type="button"
            className="skin-action-btn"
            onClick={onBuy}
            disabled={!canBuy}
          >
            Acheter - {skin.price}
          </button>
        )}
        {isOwned && !isSelected && (
          <button type="button" className="skin-action-btn" onClick={onSelect}>Selectionner</button>
        )}
        {isOwned && isSelected && <div className="skin-equipped">Equipe</div>}
        <button type="button" className="skin-respawn-btn" onClick={onRespawn}>Respawn ballon</button>
        <button type="button" className="skin-close-btn" onClick={onClose}>Fermer</button>
      </div>
    </div>
  )
}

function CharacterCustomizationMenu({ open, appearance, onApply, onClose }) {
  const [local, setLocal] = useState(appearance)

  useEffect(() => { setLocal({ ...CHARACTER_DEFAULT_APPEARANCE, ...appearance }) }, [appearance])

  if (!open) return null

  const sections = [
    { key: 'skinColor',         label: 'Teinte de peau',   palette: SKIN_TONE_PALETTE },
    { key: 'hairColor',         label: 'Cheveux',           palette: HAIR_COLOR_PALETTE },
    { key: 'eyeColor',          label: 'Yeux',              palette: EYE_COLOR_PALETTE },
    { key: 'eyebrowsColor',     label: 'Sourcils',          palette: HAIR_COLOR_PALETTE },
    { key: 'shirtColor',        label: 'Haut',              palette: CLOTHING_COLOR_PALETTE },
    { key: 'pantsColor',        label: 'Bas',               palette: CLOTHING_COLOR_PALETTE },
    { key: 'pantsDetailsColor', label: 'Détails du bas',    palette: CLOTHING_COLOR_PALETTE },
    { key: 'shoesColor',        label: 'Chaussures',        palette: CLOTHING_COLOR_PALETTE },
    { key: 'socksColor',        label: 'Chaussettes',       palette: CLOTHING_COLOR_PALETTE },
  ]

  return (
    <div className="char-menu-overlay">
      <div className="char-menu">
        <button type="button" className="char-menu-close" onClick={onClose} aria-label="Fermer la personnalisation">
          x
        </button>
        <div className="char-menu-title">Personnage</div>
        <button
          type="button"
          className={`char-gold-coat-btn char-gold-coat-global${local.goldCoat ? ' selected' : ''}`}
          onClick={() => setLocal((prev) => ({ ...prev, goldCoat: !prev.goldCoat }))}
          aria-pressed={Boolean(local.goldCoat)}
        >
          Vernis brillant
        </button>
        <button
          type="button"
          className={`char-aura-btn${local.auraEquipped ? ' selected' : ''}`}
          onClick={() => setLocal((prev) => ({ ...prev, auraEquipped: !prev.auraEquipped }))}
          aria-pressed={Boolean(local.auraEquipped)}
        >
          Aura brillante
        </button>
        {sections.map(({ key, label, palette }) => (
          <div key={key} className="char-menu-section">
            <div className="char-menu-label">{label}</div>
            <div className="char-color-palette">
              {palette.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`char-color-swatch${local[key] === color ? ' selected' : ''}`}
                  style={{ backgroundColor: color }}
                  onClick={() => setLocal((prev) => ({ ...prev, [key]: color }))}
                  aria-label={color}
                />
              ))}
            </div>
          </div>
        ))}
        <div className="char-menu-actions">
          <button type="button" className="char-apply-btn" onClick={() => { onApply(local); onClose() }}>
            Appliquer
          </button>
          <button type="button" className="char-reset-btn" onClick={() => setLocal({ ...CHARACTER_DEFAULT_APPEARANCE })}>
            Réinitialiser
          </button>
          <button type="button" className="char-close-btn" onClick={onClose}>
            Annuler
          </button>
        </div>
      </div>
    </div>
  )
}

function CustomizationChoiceMenu({ open, onChooseRoom, onClose }) {
  if (!open) return null

  return (
    <div className="skin-menu-overlay">
      <div className="skin-menu">
        <div className="skin-title">Personnaliser</div>
        <button type="button" className="skin-action-btn" onClick={onChooseRoom}>
          Piece
        </button>
        <button type="button" className="skin-close-btn" onClick={onClose}>
          Fermer
        </button>
      </div>
    </div>
  )
}

function EnvironmentMenu({
  open,
  coins,
  hasUnlimitedCoins = false,
  activeTab,
  onTabChange,
  floorSkins,
  wallSkins,
  furnitureItems,
  furnitureCounts,
  previewFloorIndex,
  previewWallIndex,
  selectedFloorSkinId,
  selectedWallSkinId,
  ownedFloorSkinIds,
  ownedWallSkinIds,
  applyWallToCeiling,
  canApplyWorldSkins = true,
  onApplyWallToCeilingChange,
  onClose,
  onPrevious,
  onNext,
  onBuy,
  onSelect,
  furnitureCart,
  onAddFurnitureToCart,
  onRemoveFurnitureFromCart,
  onClearFurnitureCart,
  onCheckoutFurnitureCart,
  ownedCat,
  catActive,
  onBuyCat,
  onToggleCat,
  ownedMagicBook,
  onBuyMagicBook,
  ownedMagicSkull,
  magicSkullDiscovered = false,
  onBuyMagicSkull,
  showWeaponShop = true,
  mountItems = [],
  ownedMountIds = [],
  onBuyMount,
}) {
  if (!open) return null

  const isAnimalsTab = activeTab === 'animals'
  const isWeaponsTab = showWeaponShop && activeTab === 'weapons'
  const isMountsTab = activeTab === 'mounts'
  const isFurnitureTab = activeTab === 'furniture'
  const isCartTab = activeTab === 'cart'
  const isFloorTab = activeTab === 'floor'
  const skins = isFloorTab ? floorSkins : wallSkins
  const previewIndex = isFloorTab ? previewFloorIndex : previewWallIndex
  const selectedSkinId = isFloorTab ? selectedFloorSkinId : selectedWallSkinId
  const ownedSkinIds = isFloorTab ? ownedFloorSkinIds : ownedWallSkinIds
  const skin = skins[previewIndex]
  const isOwned = skin ? ownedSkinIds.includes(skin.id) : false
  const isSelected = skin ? selectedSkinId === skin.id : false
  const canBuy = skin ? coins >= skin.price : false
  const cartEntries = furnitureCart
    .map((entry) => {
      const item = furnitureItems.find((candidate) => candidate.id === entry.objectId)
      return item ? { ...entry, item, lineTotal: item.price * entry.quantity } : null
    })
    .filter(Boolean)
  const cartItemCount = cartEntries.reduce((total, entry) => total + entry.quantity, 0)
  const cartTotal = cartEntries.reduce((total, entry) => total + entry.lineTotal, 0)
  const canCheckoutCart = cartItemCount > 0 && (hasUnlimitedCoins || coins >= cartTotal)
  const magicBookShopItem = objectCatalog.magic_book
  const magicSkullShopItem = objectCatalog.magic_skull

  return (
    <div className="skin-menu-overlay environment-shop-overlay">
      <div className="skin-menu environment-shop-menu">
        <button type="button" className="environment-shop-close" onClick={onClose} aria-label="Fermer la boutique">
          x
        </button>
        <div className="environment-shop-header">
          <div>
            <span className="environment-shop-kicker">Boutique</span>
            <div className="skin-title">{isCartTab ? 'Panier' : 'Maison'}</div>
          </div>
          <div className="skin-coins">
            <img src="/ui/coins.png" alt="" aria-hidden="true" />
            <span>{coins} pieces</span>
          </div>
        </div>
        <div className="env-tabs">
          <button
            type="button"
            className={`env-tab-btn ${isFloorTab ? 'active' : ''}`}
            onClick={() => onTabChange('floor')}
          >
            Sol
          </button>
          <button
            type="button"
            className={`env-tab-btn ${activeTab === 'wall' ? 'active' : ''}`}
            onClick={() => onTabChange('wall')}
          >
            Mur
          </button>
          <button
            type="button"
            className={`env-tab-btn ${isFurnitureTab ? 'active' : ''}`}
            onClick={() => onTabChange('furniture')}
          >
            Meubles
          </button>
          <button
            type="button"
            className={`env-tab-btn ${isAnimalsTab ? 'active' : ''}`}
            onClick={() => onTabChange('animals')}
          >
            Animaux
          </button>
          <button
            type="button"
            className={`env-tab-btn ${isMountsTab ? 'active' : ''}`}
            onClick={() => onTabChange('mounts')}
          >
            Montures
          </button>
          {showWeaponShop && (
            <button
              type="button"
              className={`env-tab-btn ${isWeaponsTab ? 'active' : ''}`}
              onClick={() => onTabChange('weapons')}
          >
            Armes
          </button>
        )}
        </div>
        {isCartTab ? (
          <>
            <div className="shop-cart-list">
              {cartEntries.length === 0 ? (
                <div className="shop-cart-empty">Ton panier est vide.</div>
              ) : (
                cartEntries.map(({ objectId, quantity, item, lineTotal }) => (
                  <div className="shop-cart-row" key={objectId}>
                    <div className="shop-cart-thumb">
                      <img src={item.thumbnail} alt="" />
                    </div>
                    <div className="shop-cart-info">
                      <span className="shop-cart-name">{item.name}</span>
                      <span className="shop-cart-meta">{item.price} pieces x {quantity}</span>
                    </div>
                    <div className="shop-cart-controls">
                      <button type="button" onClick={() => onRemoveFurnitureFromCart(objectId)} aria-label={`Retirer ${item.name}`}>
                        -
                      </button>
                      <span>{quantity}</span>
                      <button type="button" onClick={() => onAddFurnitureToCart(objectId)} aria-label={`Ajouter ${item.name}`}>
                        +
                      </button>
                    </div>
                    <span className="shop-cart-line-total">{lineTotal}</span>
                  </div>
                ))
              )}
            </div>
            <div className="shop-cart-summary">
              <span>Total</span>
              <strong>{cartTotal} pieces</strong>
            </div>
            {cartItemCount > 0 && !canCheckoutCart && (
              <div className="shop-cart-warning">Pas assez de pieces pour valider ce panier.</div>
            )}
            <button type="button" className="skin-action-btn" onClick={onCheckoutFurnitureCart} disabled={!canCheckoutCart}>
              Valider la commande
            </button>
            <button type="button" className="skin-close-btn" onClick={onClearFurnitureCart} disabled={cartItemCount === 0}>
              Vider le panier
            </button>
          </>
        ) : isWeaponsTab ? (
          <>
            <div className="skin-title">Armes</div>
            <div className="furniture-shop-grid">
              <button
                type="button"
                className="furniture-shop-card"
                onClick={onBuyMagicBook}
                disabled={ownedMagicBook || (!hasUnlimitedCoins && coins < MAGIC_BOOK_PRICE)}
              >
                <div className="furniture-shop-preview">
                  {magicBookShopItem?.thumbnail ? (
                    <img
                      src={magicBookShopItem.thumbnail}
                      alt=""
                      onError={(event) => {
                        event.currentTarget.style.display = 'none'
                        event.currentTarget.parentElement.textContent = '\u{1F4D6}'
                      }}
                    />
                  ) : (
                    <span aria-hidden="true">{'\u{1F4D6}'}</span>
                  )}
                  {ownedMagicBook && <span className="furniture-owned-badge">OK</span>}
                </div>
                <span className="furniture-shop-name">{magicBookShopItem?.name ?? 'Livre Magique'}</span>
                <span className="furniture-shop-price">
                  {ownedMagicBook ? 'Possede' : `${MAGIC_BOOK_PRICE} pieces`}
                </span>
              </button>
              <button
                type="button"
                className="furniture-shop-card"
                onClick={onBuyMagicSkull}
                disabled={ownedMagicSkull || (!magicSkullDiscovered && !hasUnlimitedCoins) || (!hasUnlimitedCoins && coins < MAGIC_SKULL_PRICE)}
              >
                <div className="furniture-shop-preview">
                  {magicSkullShopItem?.thumbnail ? (
                    <img
                      src={magicSkullShopItem.thumbnail}
                      alt=""
                      onError={(event) => {
                        event.currentTarget.style.display = 'none'
                        event.currentTarget.parentElement.textContent = '\u{1F480}'
                      }}
                    />
                  ) : (
                    <span aria-hidden="true">{'\u{1F480}'}</span>
                  )}
                  {ownedMagicSkull && <span className="furniture-owned-badge">OK</span>}
                </div>
                <span className="furniture-shop-name">{magicSkullShopItem?.name ?? 'Crâne Nécromancien'}</span>
                <span className="furniture-shop-price">
                  {ownedMagicSkull
                    ? 'Possede'
                    : !magicSkullDiscovered && !hasUnlimitedCoins
                      ? 'A apprendre dans le monde'
                      : `${MAGIC_SKULL_PRICE} pieces`}
                </span>
              </button>
            </div>
          </>
        ) : isMountsTab ? (
          <>
            <div className="skin-title">Montures</div>
            <div className="furniture-shop-grid">
              {mountItems.map((mount) => {
                const owned = ownedMountIds.includes(mount.id)
                const canBuyMount = hasUnlimitedCoins || coins >= mount.price
                return (
                  <button
                    key={mount.id}
                    type="button"
                    className="furniture-shop-card"
                    onClick={() => onBuyMount?.(mount.id)}
                    disabled={!owned && !canBuyMount}
                  >
                    <div className="furniture-shop-preview">
                      {mount.thumbnail ? (
                        <img
                          src={mount.thumbnail}
                          alt=""
                          onError={(event) => {
                            event.currentTarget.style.display = 'none'
                            event.currentTarget.parentElement.textContent = mount.icon
                          }}
                        />
                      ) : (
                        <span aria-hidden="true">{mount.icon}</span>
                      )}
                      {owned && <span className="furniture-owned-badge">OK</span>}
                    </div>
                    <span className="furniture-shop-name">{mount.name}</span>
                    <span className="furniture-shop-price">{owned ? 'Possede' : formatMountPrice(mount)}</span>
                  </button>
                )
              })}
            </div>
          </>
        ) : isAnimalsTab ? (
          <>
            <div className="skin-title">Animaux</div>
            <div className="animals-shop-grid">
              <div className="animal-shop-card">
                <div className="animal-shop-preview">
                  <img src="/ui/object-thumbnails/cat.webp" alt="Chat" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.parentElement.textContent = '🐱' }} />
                </div>
                <span className="animal-shop-name">Chat</span>
                {!ownedCat ? (
                  <>
                    <span className="animal-shop-price">500 pieces</span>
                    <button
                      type="button"
                      className="animal-buy-btn"
                      onClick={onBuyCat}
                      disabled={coins < 500}
                    >
                      Acheter
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className={`animal-toggle-btn ${catActive ? 'dismiss' : 'summon'}`}
                    onClick={onToggleCat}
                  >
                    {catActive ? 'Renvoyer' : 'Invoquer'}
                  </button>
                )}
              </div>
            </div>
          </>
        ) : isFurnitureTab ? (
          <>
            <div className="shop-section-heading">
              <span>Meubles</span>
              <strong>{cartItemCount} article{cartItemCount > 1 ? 's' : ''}</strong>
            </div>
            <div className="furniture-shop-grid">
              {furnitureItems.map((item) => {
                const ownedCount = furnitureCounts[item.id] ?? 0
                const cartQuantity = furnitureCart.find((entry) => entry.objectId === item.id)?.quantity ?? 0
                const canAddFurniture = hasUnlimitedCoins || coins >= cartTotal + item.price
                return (
                  <button
                    key={item.id}
                    type="button"
                    className="furniture-shop-card"
                    onClick={() => onAddFurnitureToCart(item.id)}
                    disabled={!canAddFurniture}
                  >
                    <div className="furniture-shop-preview">
                      <img src={item.thumbnail} alt="" />
                      {ownedCount > 0 && <span className="furniture-owned-badge">x{ownedCount}</span>}
                      {cartQuantity > 0 && <span className="furniture-cart-badge">+{cartQuantity}</span>}
                    </div>
                    <span className="furniture-shop-name">{item.name}</span>
                    <span className="furniture-shop-price">{item.price} pieces</span>
                  </button>
                )
              })}
            </div>
          </>
        ) : (
          <>
            <div className="skin-title">{skin.name}</div>
            <div className="env-preview-wrap">
              <div
                className="env-preview-wall"
                style={{
                  backgroundImage: `url(${isFloorTab ? wallSkins[previewWallIndex].texture : skin.texture})`,
                }}
              />
              <div
                className="env-preview-floor"
                style={{
                  backgroundImage: `url(${isFloorTab ? skin.texture : floorSkins[previewFloorIndex].texture})`,
                }}
              />
            </div>
            {!isFloorTab && (
              <label className="env-ceiling-toggle">
                <input
                  type="checkbox"
                  checked={applyWallToCeiling}
                  disabled={!canApplyWorldSkins}
                  onChange={(event) => canApplyWorldSkins && onApplyWallToCeilingChange(event.target.checked)}
                />
                <span>Appliquer au plafond</span>
              </label>
            )}
            <div className="skin-nav">
              <button type="button" onClick={onPrevious} className="skin-nav-btn">{'<'}</button>
              <button type="button" onClick={onNext} className="skin-nav-btn">{'>'}</button>
            </div>
            {!isOwned && (
              <button type="button" className="skin-action-btn" onClick={onBuy} disabled={!canBuy}>
                Acheter - {skin.price}
              </button>
            )}
            {isOwned && !isSelected && canApplyWorldSkins && (
              <button type="button" className="skin-action-btn" onClick={onSelect}>Selectionner</button>
            )}
            {isOwned && isSelected && canApplyWorldSkins && <div className="skin-equipped">Equipe</div>}
            {isOwned && !canApplyWorldSkins && <div className="skin-equipped">Possede</div>}
          </>
        )}
        {!isCartTab && (
          <button type="button" className="skin-action-btn shop-cart-open-btn" onClick={() => onTabChange('cart')}>
            Aller au panier{cartItemCount > 0 ? ` (${cartItemCount})` : ''}
          </button>
        )}
      </div>
    </div>
  )
}

function isPositionInsideHouse(position, margin = 0.5) {
  if (!position) return true
  const [x, , z] = position
  return houseLayout.rooms.some((room) => {
    const [rx, , rz] = room.position
    return (
      Math.abs(x - rx) <= room.size[0] * 0.5 + margin &&
      Math.abs(z - rz) <= room.size[2] * 0.5 + margin
    )
  })
}

function isGoalInsideHouse(goalPosition) {
  return isPositionInsideHouse(goalPosition, 0.5)
}

function BallRespawnGuard({ ballRef, goalObject, onOutOfBounds }) {
  const outTimerRef = useRef(0)
  const triggerLockRef = useRef(false)

  useFrame((_, delta) => {
    const ball = ballRef.current
    if (!ball) return

    const p = ball.translation()
    const goalInside = isGoalInsideHouse(goalObject?.position)
    const isOut = goalInside
      ? (p.y < -1.2 || p.y > 7 || Math.abs(p.x) > 8.2 || Math.abs(p.z) > 12)
      : (p.y < getTerrainHeight(p.x, p.z) - 0.5 || Math.abs(p.x) > OUTDOOR_HALF_SIZE - 1 || Math.abs(p.z) > OUTDOOR_HALF_SIZE - 1)

    if (isOut) {
      outTimerRef.current += delta
      if (outTimerRef.current > 1.6 && !triggerLockRef.current) {
        triggerLockRef.current = true
        onOutOfBounds()
      }
    } else {
      outTimerRef.current = 0
      triggerLockRef.current = false
    }
  })

  return null
}

function getEvenPixelSize(value) {
  const rounded = Math.max(2, Math.floor(value))
  return rounded % 2 === 0 ? rounded : rounded - 1
}

function getActiveViewportSize(freezeForKeyboard = false) {
  if (typeof window === 'undefined') {
    return { width: 1, height: 1, keyboardInset: 0 }
  }

  const visualViewport = window.visualViewport
  const layoutWidth = window.innerWidth ?? 1
  const layoutHeight = window.innerHeight ?? 1
  const visualWidth = visualViewport?.width ?? layoutWidth
  const visualHeight = visualViewport?.height ?? layoutHeight
  const visualOffsetTop = visualViewport?.offsetTop ?? 0
  const width = Math.max(1, Math.round(visualWidth))
  const height = Math.max(1, Math.round(freezeForKeyboard ? layoutHeight : visualHeight))
  const keyboardInset = freezeForKeyboard
    ? Math.max(0, Math.round(layoutHeight - visualOffsetTop - visualHeight))
    : 0

  return { width, height, keyboardInset }
}

function getViewportOrientation(freezeForKeyboard = false) {
  const { width, height } = getActiveViewportSize(freezeForKeyboard)
  return width > height ? 'landscape' : 'portrait'
}

function useMobileViewportSync(freezeForKeyboard = false) {
  const [orientation, setOrientation] = useState(() => getViewportOrientation())

  useLayoutEffect(() => {
    let frame = null

    const updateViewport = () => {
      if (frame) cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const { width, height, keyboardInset } = getActiveViewportSize(freezeForKeyboard)
        const nextOrientation = width > height ? 'landscape' : 'portrait'

        document.documentElement.style.setProperty('--app-viewport-width', `${width}px`)
        document.documentElement.style.setProperty('--app-viewport-height', `${height}px`)
        document.documentElement.style.setProperty('--chat-keyboard-inset', `${keyboardInset}px`)
        document.documentElement.dataset.orientation = nextOrientation
        if (freezeForKeyboard) {
          document.documentElement.dataset.chatOpen = 'true'
          if (window.scrollY > 0 || (window.visualViewport?.offsetTop ?? 0) > 0) {
            window.scrollTo(0, 0)
          }
        } else {
          delete document.documentElement.dataset.chatOpen
        }
        setOrientation((current) => (current === nextOrientation ? current : nextOrientation))
      })
    }

    updateViewport()
    window.addEventListener('resize', updateViewport)
    window.addEventListener('orientationchange', updateViewport)
    window.visualViewport?.addEventListener('resize', updateViewport)
    window.visualViewport?.addEventListener('scroll', updateViewport)
    window.screen?.orientation?.addEventListener?.('change', updateViewport)

    return () => {
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener('resize', updateViewport)
      window.removeEventListener('orientationchange', updateViewport)
      window.visualViewport?.removeEventListener('resize', updateViewport)
      window.visualViewport?.removeEventListener('scroll', updateViewport)
      window.screen?.orientation?.removeEventListener?.('change', updateViewport)
      document.documentElement.style.removeProperty('--app-viewport-width')
      document.documentElement.style.removeProperty('--app-viewport-height')
      document.documentElement.style.removeProperty('--chat-keyboard-inset')
      delete document.documentElement.dataset.orientation
      delete document.documentElement.dataset.chatOpen
    }
  }, [freezeForKeyboard])

  return orientation
}

function useVerticalFrameSize(active) {
  const [frameSize, setFrameSize] = useState(null)

  useLayoutEffect(() => {
    if (!active) {
      setFrameSize(null)
      return undefined
    }

    const updateFrameSize = () => {
      const widthFromHeight = window.innerHeight * (9 / 16)
      const heightFromWidth = window.innerWidth * (16 / 9)
      const widthLimited = widthFromHeight <= window.innerWidth
      const width = getEvenPixelSize(widthLimited ? widthFromHeight : window.innerWidth)
      const height = getEvenPixelSize(widthLimited ? window.innerHeight : heightFromWidth)
      setFrameSize({ width, height })
    }

    updateFrameSize()
    window.addEventListener('resize', updateFrameSize)
    window.addEventListener('orientationchange', updateFrameSize)
    return () => {
      window.removeEventListener('resize', updateFrameSize)
      window.removeEventListener('orientationchange', updateFrameSize)
    }
  }, [active])

  return frameSize
}

function ScorePopups({ popups }) {
  return (
    <>
      {popups.map((popup) => (
        <Html key={popup.id} position={[popup.x, popup.y, popup.z]} center transform sprite>
          <div
            className="score-value score-burst-world"
            style={{ animationDuration: `${popup.duration}ms` }}
          >
            {popup.label ?? `+${popup.value}`}
          </div>
        </Html>
      ))}
    </>
  )
}

function getViewportRenderSettings(renderScale = MAX_DYNAMIC_RENDER_SCALE) {
  if (typeof window === 'undefined') {
    return { dpr: 1, antialias: true }
  }

  const { width, height } = getActiveViewportSize()
  const nativeDpr = Math.min(MAX_RENDER_DPR, Math.max(MIN_RENDER_DPR, window.devicePixelRatio || 1))
  const viewportPixels = width * height
  // Plafond lié au budget pixels (utile sur grands écrans haute densité).
  const pixelCappedDpr = Math.sqrt(TARGET_MAX_RENDER_PIXELS / viewportPixels)
  // IMPORTANT : renderScale (qualité auto + basse résolution) s'applique DIRECTEMENT
  // au dpr. Sinon, sur petit écran (mobile), le budget pixels ne mord jamais et la
  // résolution ne baisse JAMAIS, même quand le jeu rame → scaler inopérant.
  const baseDpr = Math.min(pixelCappedDpr, nativeDpr)
  const dpr = MathUtils.clamp(baseDpr * renderScale, MIN_RENDER_DPR, nativeDpr)

  return {
    dpr: Number(dpr.toFixed(2)),
    antialias: dpr < 1.3,
  }
}

function useViewportRenderSettings(renderScale) {
  const [settings, setSettings] = useState(() => getViewportRenderSettings(renderScale))

  useEffect(() => {
    let frame = null
    const update = () => {
      if (frame) cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        setSettings((current) => {
          const next = getViewportRenderSettings(renderScale)
          return current.dpr === next.dpr && current.antialias === next.antialias ? current : next
        })
      })
    }

    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
    }
  }, [renderScale])

  return settings
}

function RenderQualityGovernor({ onScaleChange }) {
  const sampleTimeRef = useRef(0)
  const sampleFramesRef = useRef(0)
  const recoveryWindowsRef = useRef(0)

  useFrame((_, delta) => {
    sampleTimeRef.current += delta
    sampleFramesRef.current += 1

    if (sampleTimeRef.current < FPS_SAMPLE_WINDOW_SECONDS) return

    const fps = sampleFramesRef.current / sampleTimeRef.current
    sampleTimeRef.current = 0
    sampleFramesRef.current = 0

    if (fps < LOW_FPS_THRESHOLD) {
      recoveryWindowsRef.current = 0
      onScaleChange((current) => Math.max(MIN_DYNAMIC_RENDER_SCALE, Number((current - RENDER_SCALE_STEP).toFixed(2))))
      return
    }

    if (fps >= HIGH_FPS_THRESHOLD) {
      recoveryWindowsRef.current += 1
      if (recoveryWindowsRef.current >= 3) {
        recoveryWindowsRef.current = 0
        onScaleChange((current) => Math.min(MAX_DYNAMIC_RENDER_SCALE, Number((current + RENDER_SCALE_STEP).toFixed(2))))
      }
      return
    }

    recoveryWindowsRef.current = 0
  })

  return null
}

const INITIAL_ASSET_BATCH_MAX_WAIT_MS = 1800
const STABLE_INITIAL_ASSET_MAX_WAIT_MS = 9000
const WORLD_STREAM_INITIAL_READY_LEVEL = 2
const WORLD_STREAM_INITIAL_MAX_WAIT_MS = 2500
const OUTDOOR_EXIT_ZONE_SWITCH_DELAY_MS = 420
const OUTDOOR_EXIT_FADE_RELEASE_DELAY_MS = 320
const OUTDOOR_CONTENT_STAGES = [
  { level: 1, delay: 0 },
  { level: 2, delay: 140 },
  { level: 3, delay: 320 },
  { level: 4, delay: 640 },
  { level: 5, delay: 920 },
]
const MOUNT_PRELOAD_START_DELAY_MS = 900
const MOUNT_PRELOAD_STAGGER_MS = 450

const STABLE_INITIAL_ASSET_PRELOADS = [
  () => useGLTF.preload(PLAYER_MODEL_URL),
  () => useTexture.preload(PLAYER_FACE_DETAILS_MASK_URL),
  () => useGLTF.preload('/models/player/anim/idle.glb'),
  () => useGLTF.preload('/models/player/anim/walk.glb'),
  () => useGLTF.preload('/models/player/anim/run.glb'),
  () => useGLTF.preload('/models/player/anim/kick.glb'),
  () => useGLTF.preload('/models/player/anim/punch.glb'),
  () => useGLTF.preload('/models/player/anim/waving.glb'),
  () => useGLTF.preload('/models/player/anim/dance.glb'),
  () => useGLTF.preload('/models/player/anim/pointing-up.glb'),
  () => useGLTF.preload('/models/player/anim/jump-start.glb'),
  () => useGLTF.preload('/models/player/anim/jump-loop.glb'),
  () => useGLTF.preload('/models/player/anim/jump-land.glb'),
  () => useGLTF.preload('/models/player/anim/stand-to-sit.glb'),
  () => useGLTF.preload('/models/player/anim/sitting-idle.glb'),
  () => useGLTF.preload('/models/player/anim/stand-up.glb'),
  () => useGLTF.preload('/models/ball/ballon.glb'),
  () => useGLTF.preload('/models/dragon.glb'),
  () => useGLTF.preload(MAGIC_BOOK_MODEL_URL),
  () => useGLTF.preload(MAGIC_SKULL_MODEL_URL),
]

let stableInitialAssetPreloadPromise = null

function startStableInitialAssetPreloads() {
  if (!stableInitialAssetPreloadPromise) {
    stableInitialAssetPreloadPromise = Promise.allSettled(
      STABLE_INITIAL_ASSET_PRELOADS.map((preload) => Promise.resolve().then(preload)),
    )
  }
  return stableInitialAssetPreloadPromise
}

function waitForPromiseWithTimeout(promise, timeoutMs) {
  let timeoutId = 0
  const timeout = new Promise((resolve) => {
    timeoutId = window.setTimeout(() => resolve({ timedOut: true }), timeoutMs)
  })
  return Promise.race([
    promise.then((result) => ({ timedOut: false, result })),
    timeout,
  ]).finally(() => {
    if (timeoutId) window.clearTimeout(timeoutId)
  })
}

function ShaderWarmupGate({ onComplete }) {
  const { gl, scene, camera } = useThree()
  const [initialAssetsReady, setInitialAssetsReady] = useState(() => isInitialAssetBatchReady())
  const completedRef = useRef(false)
  const gateStartedRef = useRef(false)

  useEffect(() => {
    if (gateStartedRef.current) return undefined
    gateStartedRef.current = true

    let cancelled = false
    let timeoutId = 0

    // Sonde : QUAND l'effet du gate s'exécute = quand le gate s'est monté. S'il
    // est suspendu par la scène, ce jalon arrive tard (≈ fin de chargement).
    markLoad('gate:mount')

    const refresh = () => {
      if (!cancelled) setInitialAssetsReady(isInitialAssetBatchReady())
    }

    const unsubscribe = subscribeInitialAssetBatch(refresh)
    startInitialAssetBatchCollection()
    markLoad('gate:lock')
    lockInitialAssetBatch()
    timeoutId = window.setTimeout(() => {
      if (!isInitialAssetBatchReady()) {
        forceInitialAssetBatchReady(`${INITIAL_ASSET_BATCH_MAX_WAIT_MS}ms max wait`)
        refresh()
      }
    }, INITIAL_ASSET_BATCH_MAX_WAIT_MS)
    refresh()

    return () => {
      cancelled = true
      unsubscribe()
      if (timeoutId) window.clearTimeout(timeoutId)
    }
  }, [])

  useEffect(() => {
    if (completedRef.current) return undefined
    if (!initialAssetsReady) return undefined

    let cancelled = false
    let frameId = 0

    const waitFrame = () => new Promise((resolve) => {
      frameId = window.requestAnimationFrame(resolve)
    })

    const runWarmup = async () => {
      // Jalon : le lot initial est prêt ou libéré par le garde-fou. Les assets
      // démarrés ensuite ne peuvent plus garder l'overlay ouvert.
      const preloadResult = await waitForPromiseWithTimeout(
        startStableInitialAssetPreloads(),
        STABLE_INITIAL_ASSET_MAX_WAIT_MS,
      )
      if (preloadResult.timedOut) {
        console.warn(`[loadTiming] Stable initial asset preloads timed out after ${STABLE_INITIAL_ASSET_MAX_WAIT_MS}ms`)
      }
      markLoad('assetsLoaded')
      // Garantit que la collision binaire est chargée avant de masquer l'écran de
      // chargement (le fetch a démarré à l'import, donc déjà résolu en pratique).
      await collisionReady
      markLoad('collisionReady')
      startWorldStream()
      const streamResult = await waitForRevealLevel(WORLD_STREAM_INITIAL_READY_LEVEL, WORLD_STREAM_INITIAL_MAX_WAIT_MS)
      if (!streamResult.ready) {
        console.warn(`[loadTiming] World stream level ${WORLD_STREAM_INITIAL_READY_LEVEL} timed out after ${WORLD_STREAM_INITIAL_MAX_WAIT_MS}ms`)
      }
      markLoad('streamReady')
      // Let the loading overlay and the initial scene commit before WebGL shader work starts.
      await waitFrame()
      await waitFrame()
      if (cancelled) return

      const aspect = Math.max(0.1, gl.domElement.clientWidth / Math.max(gl.domElement.clientHeight, 1))
      const customizeCamera = new ThreeOrthographicCamera(-12 * aspect, 12 * aspect, 12, -12, 0.1, 120)
      customizeCamera.position.set(0, 18, 0)
      customizeCamera.lookAt(0, 0, 0)
      customizeCamera.updateProjectionMatrix()
      customizeCamera.updateMatrixWorld(true)

      const outsideSpawn = PLAYER_SPAWNS.outside ?? PLAYER_SPAWNS.interior
      const outsideCamera = new PerspectiveCamera(BASE_CAMERA_VERTICAL_FOV, aspect, 0.1, 420)
      outsideCamera.position.set(outsideSpawn[0], outsideSpawn[1] + 2.4, outsideSpawn[2] + 6)
      outsideCamera.lookAt(outsideSpawn[0], outsideSpawn[1] + 1.1, outsideSpawn[2])
      outsideCamera.updateProjectionMatrix()
      outsideCamera.updateMatrixWorld(true)

      const changedCulling = []
      if (PERF_SHADER_WARMUP) {
        scene.traverse((object) => {
          if (!(object.isMesh || object.isLine || object.isPoints || object.isSprite)) return
          changedCulling.push([object, object.frustumCulled])
          object.frustumCulled = false
        })
      }

      const compileAndRender = async (warmupCamera) => {
        const originalLayerMask = warmupCamera.layers.mask
        for (const layer of [OUTDOOR_LIGHT_LAYER, 0]) {
          warmupCamera.layers.set(layer)
          gl.compile(scene, warmupCamera)
          gl.render(scene, warmupCamera)
        }
        warmupCamera.layers.mask = originalLayerMask
      }

      try {
        await compileAndRender(camera)
        markLoad('warmup:runtime')

        const warmupLabels = ['warmup:customize', 'warmup:outside']
        const warmupCameras = PERF_SHADER_WARMUP ? [customizeCamera, outsideCamera] : []
        for (let i = 0; i < warmupCameras.length; i += 1) {
          if (cancelled) break
          await compileAndRender(warmupCameras[i])
          markLoad(warmupLabels[i])
        }
      } catch (error) {
        console.warn('Shader warmup failed', error)
      } finally {
        changedCulling.forEach(([object, frustumCulled]) => {
          object.frustumCulled = frustumCulled
        })
      }

      if (!cancelled) {
        completedRef.current = true
        markLoad('warmupEnd')
        reportLoadTiming()
        onComplete()
      }
    }

    runWarmup()

    return () => {
      cancelled = true
      if (frameId) window.cancelAnimationFrame(frameId)
    }
  }, [camera, gl, initialAssetsReady, onComplete, scene])

  return null
}

function getDebugCategory(object) {
  let current = object
  while (current) {
    if (current.userData?.debugCategory) return current.userData.debugCategory
    current = current.parent
  }
  return 'other'
}

function isObjectVisibleInScene(object) {
  let current = object
  while (current) {
    if (!current.visible) return false
    current = current.parent
  }
  return true
}

function getObjectTriangleCount(object) {
  if (!object.geometry || !object.isMesh) return 0
  if (!isObjectVisibleInScene(object)) return 0
  const geometry = object.geometry
  const indexCount = geometry.index?.count ?? 0
  const positionCount = geometry.attributes.position?.count ?? 0
  const triangleCount = indexCount > 0 ? indexCount / 3 : positionCount / 3
  return triangleCount * (object.isInstancedMesh ? object.count : 1)
}

function getMaterialDrawCallCount(geometry, material) {
  if (!material) return 0
  if (!Array.isArray(material)) return 1

  const groups = geometry?.groups ?? []
  if (groups.length > 0) {
    return groups.reduce((count, group) => (
      material[group.materialIndex] ? count + 1 : count
    ), 0)
  }

  return material.filter(Boolean).length
}

function getObjectDrawCallCount(object) {
  if (!isObjectVisibleInScene(object)) return 0
  if (object.isSprite) return object.material ? 1 : 0
  if (!object.geometry || !object.material) return 0
  if (!object.isMesh && !object.isLine && !object.isPoints) return 0
  return getMaterialDrawCallCount(object.geometry, object.material)
}

function getRendererInfo(gl) {
  const context = gl.getContext()
  const extension = context.getExtension('WEBGL_debug_renderer_info')
  const renderer = extension
    ? context.getParameter(extension.UNMASKED_RENDERER_WEBGL)
    : context.getParameter(context.RENDERER)
  const vendor = extension
    ? context.getParameter(extension.UNMASKED_VENDOR_WEBGL)
    : context.getParameter(context.VENDOR)

  return {
    renderer: String(renderer ?? ''),
    vendor: String(vendor ?? ''),
  }
}

function isWeakRenderer(rendererInfo) {
  const value = `${rendererInfo.vendor} ${rendererInfo.renderer}`.toLowerCase()
  return [
    'intel',
    'uhd graphics',
    'iris',
    'microsoft basic render driver',
    'swiftshader',
    'llvmpipe',
    'software',
  ].some((pattern) => value.includes(pattern))
}

function RenderStatsProbe({ onStatsChange, onRendererInfo, active }) {
  const { gl, scene } = useThree()
  const elapsedRef = useRef(0)
  const framesRef = useRef(0)
  const maxFrameTimeRef = useRef(0)
  const drawingBufferRef = useRef(new Vector2())
  const categoryElapsedRef = useRef(1)
  const categoryStatsRef = useRef({
    trianglesByCategory: {},
    drawCallsByCategory: {},
  })

  useEffect(() => {
    onRendererInfo(getRendererInfo(gl))
  }, [gl, onRendererInfo])

  useFrame((_, delta) => {
    if (!active) return

    const frameTimeMs = delta * 1000
    elapsedRef.current += delta
    framesRef.current += 1
    maxFrameTimeRef.current = Math.max(maxFrameTimeRef.current, frameTimeMs)

    if (elapsedRef.current < 0.25) return

    gl.getDrawingBufferSize(drawingBufferRef.current)
    const fps = framesRef.current / elapsedRef.current
    const averageFrameTimeMs = (elapsedRef.current / framesRef.current) * 1000
    categoryElapsedRef.current += elapsedRef.current
    if (categoryElapsedRef.current >= 1) {
      const trianglesByCategory = {}
      const drawCallsByCategory = {}

      scene.traverse((object) => {
        const category = getDebugCategory(object)
        const drawCalls = getObjectDrawCallCount(object)
        if (drawCalls > 0) {
          drawCallsByCategory[category] = (drawCallsByCategory[category] ?? 0) + drawCalls
        }

        const triangles = getObjectTriangleCount(object)
        if (triangles <= 0) return
        trianglesByCategory[category] = (trianglesByCategory[category] ?? 0) + triangles
      })

      categoryStatsRef.current = { trianglesByCategory, drawCallsByCategory }
      categoryElapsedRef.current = 0
    }

    onStatsChange({
      fps,
      frameTimeMs: averageFrameTimeMs,
      maxFrameTimeMs: maxFrameTimeRef.current,
      drawCalls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      textures: gl.info.memory.textures,
      geometries: gl.info.memory.geometries,
      dpr: gl.getPixelRatio(),
      drawingBufferWidth: drawingBufferRef.current.x,
      drawingBufferHeight: drawingBufferRef.current.y,
      drawCallsByCategory: categoryStatsRef.current.drawCallsByCategory,
      trianglesByCategory: categoryStatsRef.current.trianglesByCategory,
      grassDebug: typeof window !== 'undefined' ? window.__grassDebug ?? null : null,
    })

    elapsedRef.current = 0
    framesRef.current = 0
    maxFrameTimeRef.current = 0
  })

  return null
}

function RenderStatsOverlay({ stats, toggles, onToggle }) {
  if (!stats) return null

  const rows = [
    ['FPS', stats.fps.toFixed(1)],
    ['Frame', `${stats.frameTimeMs.toFixed(1)} ms`],
    ['Max frame', `${stats.maxFrameTimeMs.toFixed(1)} ms`],
    ['Draw calls', stats.drawCalls.toLocaleString('fr-FR')],
    ['Triangles', stats.triangles.toLocaleString('fr-FR')],
    ['Textures', stats.textures.toLocaleString('fr-FR')],
    ['Geometries', stats.geometries.toLocaleString('fr-FR')],
    ['DPR', stats.dpr.toFixed(2)],
    ['Buffer', `${stats.drawingBufferWidth} x ${stats.drawingBufferHeight}`],
  ]
  const triangleRows = Object.entries(stats.trianglesByCategory ?? {})
    .sort((left, right) => right[1] - left[1])
    .map(([label, value]) => [label, value.toLocaleString('fr-FR')])
  const drawCallRows = Object.entries(stats.drawCallsByCategory ?? {})
    .sort((left, right) => right[1] - left[1])
    .map(([label, value]) => [label, value.toLocaleString('fr-FR')])
  const grassRows = stats.grassDebug
    ? [
        ['G queue', stats.grassDebug.queuedChunks.toLocaleString('fr-FR')],
        ['G pending', stats.grassDebug.pendingChunks.toLocaleString('fr-FR')],
        ['G GPU wait', (stats.grassDebug.pendingGPUWrites ?? 0).toLocaleString('fr-FR')],
        ['G active', stats.grassDebug.activeChunk ?? '-'],
        ['G target', (stats.grassDebug.targetChunks ?? 0).toLocaleString('fr-FR')],
        ['G done', stats.grassDebug.completedChunks.toLocaleString('fr-FR')],
        ['G mounted', stats.grassDebug.mountedChunks.toLocaleString('fr-FR')],
        ['G mounted blades', (stats.grassDebug.mountedBlades ?? 0).toLocaleString('fr-FR')],
        ['G blades', stats.grassDebug.completedBlades.toLocaleString('fr-FR')],
        ['G build last', `${(stats.grassDebug.chunkBuildLastMs ?? 0).toFixed(2)} ms`],
        ['G build avg', `${(stats.grassDebug.chunkBuildAvgMs ?? 0).toFixed(2)} ms`],
        ['G build max', `${(stats.grassDebug.chunkBuildMaxMs ?? 0).toFixed(2)} ms`],
        ...(stats.grassDebug.visibilityEstimate
          ? [
              ['G est kept', stats.grassDebug.visibilityEstimate.estimatedKeptBlades.toLocaleString('fr-FR')],
              ['G est hidden', stats.grassDebug.visibilityEstimate.estimatedHiddenBlades.toLocaleString('fr-FR')],
              ['G est frustum', stats.grassDebug.visibilityEstimate.estimatedFrustumBlades.toLocaleString('fr-FR')],
              ['G est drawn', stats.grassDebug.visibilityEstimate.estimatedKeptFrustumBlades.toLocaleString('fr-FR')],
              ['G sample', `${stats.grassDebug.visibilityEstimate.sampled.toLocaleString('fr-FR')} / ${stats.grassDebug.visibilityEstimate.sampleStride}`],
            ]
          : []),
      ]
    : []
  const renderDebugRows = (items, keyPrefix = '') => items.map(([label, value]) => (
    <div className="render-stats-row" key={`${keyPrefix}${label}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  ))

  return (
    <aside className="render-stats" aria-label="Statistiques de rendu">
      <div className="render-stats-panel render-stats-controls-panel">
        <div className="render-stats-section-title">Toggles</div>
        <div className="render-stats-controls">
          {[
            ['grass', 'Herbe'],
            ['trees', 'Arbres'],
            ['terrain', 'Terrain'],
            ['sky', 'Ciel'],
            ['shadows', 'Ombres'],
            ['house', 'Maison'],
            ['player', 'Joueur'],
            ['plot', 'Parcelle'],
            ['portrait', '9:16'],
          ].map(([key, label]) => (
            <button
              className={toggles[key] ? 'is-active' : ''}
              key={key}
              type="button"
              onClick={() => onToggle(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="render-stats-panel">
        <div className="render-stats-section-title">Rendu</div>
        {renderDebugRows(rows, 'render-')}
      </div>

      {grassRows.length > 0 && (
        <div className="render-stats-panel render-stats-tall-panel">
          <div className="render-stats-section-title">Herbe</div>
          {renderDebugRows(grassRows, 'grass-')}
        </div>
      )}

      {drawCallRows.length > 0 && (
        <div className="render-stats-panel">
          <div className="render-stats-section-title">Draw calls / categorie</div>
          {renderDebugRows(drawCallRows, 'draw-')}
        </div>
      )}

      {triangleRows.length > 0 && (
        <div className="render-stats-panel">
          <div className="render-stats-section-title">Triangles / categorie</div>
          {renderDebugRows(triangleRows, 'tri-')}
        </div>
      )}
    </aside>
  )
}

function FpsOverlay({ stats }) {
  if (!stats) return null
  const fps = Math.round(stats.fps)
  const level = fps >= 50 ? 'good' : fps >= 30 ? 'ok' : 'low'

  return (
    <div className={`fps-overlay fps-${level}`} aria-label="FPS">
      {fps} FPS
    </div>
  )
}

function GpuWarning({ visible, onDismiss }) {
  if (!visible) return null

  return (
    <aside className="gpu-warning" role="status">
      <p>
        Votre navigateur utilise probablement le GPU integre. Pour de meilleures performances,
        activez le GPU haute performance pour Chrome dans les parametres graphiques Windows.
      </p>
      <button type="button" onClick={onDismiss}>
        Fermer
      </button>
    </aside>
  )
}

function AdaptiveCameraFov() {
  const { camera, size } = useThree()

  useLayoutEffect(() => {
    const aspect = Math.max(0.1, size.width / Math.max(1, size.height))
    const maxHorizontalFovRadians = MathUtils.degToRad(MAX_CAMERA_HORIZONTAL_FOV)
    const cappedVerticalFov = MathUtils.radToDeg(
      2 * Math.atan(Math.tan(maxHorizontalFovRadians * 0.5) / aspect),
    )
    camera.fov = Math.min(BASE_CAMERA_VERTICAL_FOV, cappedVerticalFov)
    camera.updateProjectionMatrix()
  }, [camera, size.height, size.width])

  return null
}

function FreeCameraController({ active, touchRef }) {
  const { camera, gl } = useThree()
  const keysRef = useRef({
    forward: false,
    back: false,
    left: false,
    right: false,
    up: false,
    down: false,
  })
  const forwardRef = useRef(new Vector3())
  const rightRef = useRef(new Vector3())
  const focusRef = useRef(new Vector3())
  const pointerDownRef = useRef(null)
  const raycasterRef = useRef(new Raycaster())
  const pointerRef = useRef(new Vector2())

  useEffect(() => {
    if (!active) {
      keysRef.current.forward = false
      keysRef.current.back = false
      keysRef.current.left = false
      keysRef.current.right = false
      keysRef.current.up = false
      keysRef.current.down = false
      return undefined
    }

    const direction = forwardRef.current
    camera.getWorldDirection(direction)
    touchRef.current.cameraYaw = Math.atan2(-direction.x, -direction.z)
    touchRef.current.cameraPitch = MathUtils.clamp(Math.asin(MathUtils.clamp(direction.y, -1, 1)), -0.8, 0.8)
    focusRef.current.copy(camera.position).addScaledVector(direction, CAMERA_DISTANCE)

    const setKey = (event, pressed) => {
      if (isTextInputEvent(event)) return
      const key = getKeyboardKey(event)
      if (key === 'z' || key === 'w' || key === 'arrowup') keysRef.current.forward = pressed
      if (key === 's' || key === 'arrowdown') keysRef.current.back = pressed
      if (key === 'q' || key === 'a' || key === 'arrowleft') keysRef.current.left = pressed
      if (key === 'd' || key === 'arrowright') keysRef.current.right = pressed
      if (key === ' ' || key === 'space') {
        event.preventDefault()
        keysRef.current.up = pressed
      }
      if (key === 'shift') {
        event.preventDefault()
        keysRef.current.down = pressed
      }
    }

    const onKeyDown = (event) => setKey(event, true)
    const onKeyUp = (event) => setKey(event, false)
    const resetKeys = () => {
      keysRef.current.forward = false
      keysRef.current.back = false
      keysRef.current.left = false
      keysRef.current.right = false
      keysRef.current.up = false
      keysRef.current.down = false
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', resetKeys)
    window.addEventListener('pagehide', resetKeys)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', resetKeys)
      window.removeEventListener('pagehide', resetKeys)
      resetKeys()
    }
  }, [active, camera, touchRef])

  useEffect(() => {
    if (!active) return undefined

    const element = gl.domElement
    const onPointerDown = (event) => {
      if (event.button !== 0) return
      pointerDownRef.current = { x: event.clientX, y: event.clientY }
    }
    const onPointerUp = (event) => {
      if (event.button !== 0 || !pointerDownRef.current) return
      const dx = event.clientX - pointerDownRef.current.x
      const dy = event.clientY - pointerDownRef.current.y
      pointerDownRef.current = null
      if (Math.hypot(dx, dy) > 6) return

      const rect = element.getBoundingClientRect()
      pointerRef.current.set(
        ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
        -(((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1),
      )
      raycasterRef.current.setFromCamera(pointerRef.current, camera)
      const ray = raycasterRef.current.ray
      if (Math.abs(ray.direction.y) < 0.0001) return
      const t = -ray.origin.y / ray.direction.y
      if (t <= 0) return
      focusRef.current.copy(ray.origin).addScaledVector(ray.direction, t)
    }

    element.addEventListener('pointerdown', onPointerDown)
    element.addEventListener('pointerup', onPointerUp)

    return () => {
      element.removeEventListener('pointerdown', onPointerDown)
      element.removeEventListener('pointerup', onPointerUp)
      pointerDownRef.current = null
    }
  }, [active, camera, gl])

  useFrame((_, delta) => {
    if (!active) return

    const keys = keysRef.current
    const touch = touchRef.current
    const forward = forwardRef.current
    const right = rightRef.current
    const focus = focusRef.current

    const cameraYawSpeed = 2.9
    const cameraPitchSpeed = 2.1
    if (touch.lookActive) {
      touch.cameraYaw -= touch.lookX * cameraYawSpeed * delta
      touch.cameraPitch = MathUtils.clamp(
        touch.cameraPitch - touch.lookY * cameraPitchSpeed * delta,
        -0.8,
        0.8,
      )
    } else {
      touch.lookX = 0
      touch.lookY = 0
    }

    const pitch = touch.cameraPitch
    const yaw = touch.cameraYaw
    const horizontal = Math.cos(pitch)
    forward.set(-Math.sin(yaw) * horizontal, 0, -Math.cos(yaw) * horizontal)
    if (forward.lengthSq() < 0.0001) forward.set(0, 0, -1)
    forward.normalize()
    right.set(-forward.z, 0, forward.x)

    const moveForward = (keys.forward ? 1 : 0) - (keys.back ? 1 : 0)
    const moveRight = (keys.right ? 1 : 0) - (keys.left ? 1 : 0)
    const moveUp = (keys.up ? 1 : 0) - (keys.down ? 1 : 0)

    const length = Math.hypot(moveForward, moveRight, moveUp)
    if (length > 0) {
      const speed = FREE_CAMERA_SPEED * delta / length
      focus.x += (forward.x * moveForward + right.x * moveRight) * speed
      focus.y += moveUp * speed
      focus.z += (forward.z * moveForward + right.z * moveRight) * speed
    }

    const orbitDistance = MathUtils.clamp(
      touch.cameraDistance ?? CAMERA_DISTANCE,
      CAMERA_SETTINGS.interior.minDistance ?? 1.6,
      CAMERA_SETTINGS.outside.maxDistance ?? 6,
    )
    const horizontalDistance = orbitDistance * horizontal
    camera.position.set(
      focus.x + Math.sin(yaw) * horizontalDistance,
      focus.y + Math.sin(pitch) * orbitDistance,
      focus.z + Math.cos(yaw) * horizontalDistance,
    )
    camera.lookAt(focus)
  })

  return null
}

function App() {
  const [isGameChatOpen, setIsGameChatOpen] = useState(false)
  const viewportOrientation = useMobileViewportSync(isGameChatOpen)
  const isAdminMode = useMemo(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      return params.get('mode') === 'admin'
    } catch {
      return false
    }
  }, [])
  const isVerticalFrameMode = useMemo(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      const frame = params.get('frame')?.toLowerCase()
      const format = params.get('format')?.toLowerCase()
      const aspect = params.get('aspect')?.toLowerCase()
      return (
        frame === '9x16' ||
        frame === '9:16' ||
        frame === 'vertical' ||
        format === 'tiktok' ||
        aspect === '9x16' ||
        aspect === '9:16'
      )
    } catch {
      return false
    }
  }, [])
  const isDebugMode = useMemo(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      return params.get('debug') === '1'
    } catch {
      return false
    }
  }, [])
  const isLocalNetwork = useMemo(() => {
    try {
      const h = window.location.hostname
      return h === 'localhost' || h === '127.0.0.1' || /^192\.168\./.test(h) || /^10\./.test(h)
    } catch {
      return false
    }
  }, [])
  const progressScope = isAdminMode ? 'admin' : 'player'
  const progressStorageKey = isAdminMode ? `${SKIN_STORAGE_KEY}:admin` : SKIN_STORAGE_KEY
  const verticalFrameSize = useVerticalFrameSize(isAdminMode || isVerticalFrameMode)
  const [performanceSettings, setPerformanceSettings] = useState(loadPerformanceSettings)
  const [showLocalCoinButton, setShowLocalCoinButton] = useState(() => {
    if (typeof window === 'undefined') return true
    try {
      return localStorage.getItem(LOCAL_COIN_BUTTON_STORAGE_KEY) !== '0'
    } catch {
      return true
    }
  })
  const [fullscreenSupported, setFullscreenSupported] = useState(false)
  const [fullscreenActive, setFullscreenActive] = useState(false)
  const [browserFullscreenFallback, setBrowserFullscreenFallback] = useState(false)
  const [pwaStandalone, setPwaStandalone] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [showPwaGuide, setShowPwaGuide] = useState(false)
  const [isIosDevice, setIsIosDevice] = useState(false)
  const [dynamicRenderScale, setDynamicRenderScale] = useState(MAX_DYNAMIC_RENDER_SCALE)
  const effectiveRenderScale = performanceSettings.lowResolution
    ? Math.min(performanceSettings.autoQuality ? dynamicRenderScale : MAX_DYNAMIC_RENDER_SCALE, LOW_RESOLUTION_RENDER_SCALE)
    : performanceSettings.autoQuality
      ? dynamicRenderScale
      : MAX_DYNAMIC_RENDER_SCALE
  const renderSettings = useViewportRenderSettings(effectiveRenderScale)
  const [renderStats, setRenderStats] = useState(null)
  const [rendererInfo, setRendererInfo] = useState(null)
  const [gpuWarningDismissed, setGpuWarningDismissed] = useState(false)
  const [freeCameraActive, setFreeCameraActive] = useState(false)
  const [debugToggles, setDebugToggles] = useState({
    grass: true,
    trees: true,
    terrain: true,
    sky: true,
    shadows: true,
    house: true,
    player: true,
    plot: false,
    portrait: false,
  })
  const showGpuWarning = Boolean(rendererInfo && isWeakRenderer(rendererInfo) && !gpuWarningDismissed)

  useEffect(() => {
    try {
      localStorage.setItem(PERFORMANCE_SETTINGS_STORAGE_KEY, JSON.stringify(performanceSettings))
    } catch {
      // localStorage can be unavailable in private browsing or embedded contexts.
    }
  }, [performanceSettings])

  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_COIN_BUTTON_STORAGE_KEY, showLocalCoinButton ? '1' : '0')
    } catch {
      // localStorage can be unavailable in private browsing or embedded contexts.
    }
  }, [showLocalCoinButton])

  useEffect(() => {
    document.documentElement.classList.toggle('app-browser-fullscreen', browserFullscreenFallback)
    if (browserFullscreenFallback) {
      requestAnimationFrame(() => {
        window.scrollTo(0, 1)
        window.dispatchEvent(new Event('resize'))
      })
    }
    return () => {
      document.documentElement.classList.remove('app-browser-fullscreen')
    }
  }, [browserFullscreenFallback])

  useEffect(() => {
    const doc = document
    const root = doc.documentElement
    const body = doc.body
    const canRequest = Boolean(
      root?.requestFullscreen ||
      root?.webkitRequestFullscreen ||
      body?.requestFullscreen ||
      body?.webkitRequestFullscreen,
    )

    const syncFullscreenState = () => {
      const nativeActive = Boolean(doc.fullscreenElement || doc.webkitFullscreenElement)
      setFullscreenActive(nativeActive)
      if (nativeActive) {
        setBrowserFullscreenFallback(false)
      }
    }

    setFullscreenSupported(canRequest)
    syncFullscreenState()
    doc.addEventListener('fullscreenchange', syncFullscreenState)
    doc.addEventListener('webkitfullscreenchange', syncFullscreenState)
    return () => {
      doc.removeEventListener('fullscreenchange', syncFullscreenState)
      doc.removeEventListener('webkitfullscreenchange', syncFullscreenState)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    // Detect iOS
    const ua = window.navigator.userAgent.toLowerCase()
    const isIos = /iphone|ipad|ipod/.test(ua)
    setIsIosDevice(isIos)

    // Detect standalone PWA mode
    const isStandalone = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches
    setPwaStandalone(Boolean(isStandalone))

    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    }
  }, [])

  const installPwa = useCallback(async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    console.log(`User response to PWA install: ${outcome}`)
    setDeferredPrompt(null)
  }, [deferredPrompt])

  const togglePerformanceSetting = useCallback((key) => {
    setPerformanceSettings((current) => ({ ...current, [key]: !current[key] }))
  }, [])

  const toggleLocalCoinButton = useCallback(() => {
    setShowLocalCoinButton((current) => !current)
  }, [])

  const toggleFullscreenMode = useCallback(async () => {
    const doc = document
    const activeElement = doc.fullscreenElement || doc.webkitFullscreenElement

    try {
      if (activeElement) {
        if (doc.exitFullscreen) {
          await doc.exitFullscreen()
        } else if (doc.webkitExitFullscreen) {
          doc.webkitExitFullscreen()
        }
        return
      }

      // Sur iOS, il n'y a pas d'API fullscreen — on ouvre directement le guide
      if (isIosDevice) {
        setShowPwaGuide(true)
        return
      }

      const root = doc.documentElement
      const body = doc.body
      const requestTarget = root?.requestFullscreen || root?.webkitRequestFullscreen ? root : body
      const requestFullscreen = requestTarget?.requestFullscreen || requestTarget?.webkitRequestFullscreen
      if (requestFullscreen) {
        await requestFullscreen.call(requestTarget)
      }
    } catch {
      const nativeActive = Boolean(doc.fullscreenElement || doc.webkitFullscreenElement)
      setFullscreenActive(nativeActive)
      setFullscreenSupported(nativeActive)
      if (!nativeActive && isIosDevice) {
        setShowPwaGuide(true)
      }
    }
  }, [isIosDevice])

  const touchRef = useRef({
    moveX: 0,
    moveY: 0,
    cameraYaw: 0,
    cameraPitch: -0.22,
    cameraDistance: CAMERA_DISTANCE,
    lookX: 0,
    lookY: 0,
    lookActive: false,
    actionQueued: false,
    punchQueued: false,
    kickQueued: false,
    emoteQueued: null,
    mountAscend: false,
    mountDescend: false,
  })
  const playerCombatActionsRef = useRef({ canKick: false, canPunch: false })
  const { canKick, canPunch } = useCombatActionsAvailability(playerCombatActionsRef)

  useEffect(() => {
    const resetTouchControls = () => {
      touchRef.current.moveX = 0
      touchRef.current.moveY = 0
      touchRef.current.lookX = 0
      touchRef.current.lookY = 0
      touchRef.current.lookActive = false
      touchRef.current.actionQueued = false
      touchRef.current.punchQueued = false
      touchRef.current.kickQueued = false
      touchRef.current.emoteQueued = null
      touchRef.current.mountAscend = false
      touchRef.current.mountDescend = false
    }

    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') resetTouchControls()
    }

    window.addEventListener('blur', resetTouchControls)
    window.addEventListener('pagehide', resetTouchControls)
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      window.removeEventListener('blur', resetTouchControls)
      window.removeEventListener('pagehide', resetTouchControls)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])

  useEffect(() => {
    if (!isLocalNetwork) {
      setFreeCameraActive(false)
      return undefined
    }

    const onKeyDown = (event) => {
      if (isTextInputEvent(event)) return
      if (getKeyboardKey(event) !== 'l') return
      if (event.repeat) return
      event.preventDefault()
      touchRef.current.moveX = 0
      touchRef.current.moveY = 0
      touchRef.current.lookX = 0
      touchRef.current.lookY = 0
      touchRef.current.lookActive = false
      touchRef.current.actionQueued = false
      touchRef.current.punchQueued = false
      touchRef.current.kickQueued = false
      touchRef.current.emoteQueued = null
      setFreeCameraActive((current) => !current)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isLocalNetwork])

  const ballRef = useRef()
  const playerPositionRef = useRef({ x: 0, y: PLAYER_HEIGHT, z: 2.2 })
  const playerVelocityRef = useRef({ x: 0, z: 0 })
  const combatTargetsRef = useRef(new Map())
  const mobGroupRef = useRef(new Map())
  // Cibles que les ennemis peuvent prendre pour cible via l'aggro : le joueur
  // ('player') et les squelettes invoqués. Sert aussi à router les dégâts.
  const allyTargetsRef = useRef(new Map())
  // Cible courante du joueur (dernier ennemi frappé) : les squelettes la focalisent.
  const playerTargetIdRef = useRef(null)
  const monsterSpawnSlots = useMemo(() => getMonsterSpawnerSlots(), [])
  const catPositionRef = useRef({ x: 0, y: 0, z: 0 })
  const catGroupRef = useRef(null)
  const catNetworkStateRef = useRef(null)
  const catTapCallbackRef = useRef(null)
  const dragonRidePositionRef = useRef({ x: 0, y: 0, z: 0 })
  const dragonRideYawRef = useRef(0)
  const dragonRideAnimStateRef = useRef({
    airborne: false,
    moving: false,
    movingForward: false,
  })
  const dragonRideSocketRef = useRef(null)
  const dragonRideMountProfileRef = useRef({
    width: DRAGON_RIDE_DEFAULT_BODY_WIDTH,
    riderLift: DRAGON_RIDE_RIDER_LIFT,
    leftHandTarget: new Vector3(),
    rightHandTarget: new Vector3(),
    leftHandLocalTarget: new Vector3(),
    rightHandLocalTarget: new Vector3(),
    handTargetsReady: false,
    handTargetsMeasured: false,
    seatHeightMeasured: false,
    ready: false,
  })
  const dragonRideRiderTransformRef = useRef({
    position: new Vector3(),
    quaternion: new Quaternion(),
    ready: false,
  })
  const [mountedMountId, setMountedMountId] = useState(null)
  const dragonMounted = mountedMountId !== null
  const activeMountConfig = getMountConfig(mountedMountId)
  const [cameraOnCat, setCameraOnCat] = useState(false)
  const scoreCooldownRef = useRef(false)
  const respawnTimerRef = useRef(null)
  const outRespawnCooldownRef = useRef(false)
  const [scorePopups, setScorePopups] = useState([])
  const [coins, setCoins] = useState(isAdminMode ? 850 : 0)
  const [playerHp, setPlayerHp] = useState(PLAYER_MAX_HP)
  const [playerHealing, setPlayerHealing] = useState(false)
  const playerHpRef = useRef(PLAYER_MAX_HP)
  const playerDamageLockRef = useRef(false)
  const playerRespawnTimerRef = useRef(null)
  const playerRegenDelayRef = useRef(null)
  const playerRegenIntervalRef = useRef(null)
  const [ownedSkins, setOwnedSkins] = useState(['classic'])
  const [selectedSkinId, setSelectedSkinId] = useState('classic')
  const [previewSkinId, setPreviewSkinId] = useState('classic')
  const [isSkinMenuOpen, setIsSkinMenuOpen] = useState(false)
  const [isNearSkinStation, setIsNearSkinStation] = useState(false)
  const [roomLightOn, setRoomLightOn] = useState(true)
  const [lightColor, setLightColor] = useState('#ffffff')
  const [lightIntensity, setLightIntensity] = useState(2)
  const [isNearLightSwitch, setIsNearLightSwitch] = useState(false)
  const [isLightMenuOpen, setIsLightMenuOpen] = useState(false)
  const [environmentTab, setEnvironmentTab] = useState('floor')
  const [ownedFloorSkins, setOwnedFloorSkins] = useState(['floor-classic'])
  const [ownedWallSkins, setOwnedWallSkins] = useState(['wall-classic'])
  const [selectedFloorSkinId, setSelectedFloorSkinId] = useState('floor-classic')
  const [selectedWallSkinId, setSelectedWallSkinId] = useState('wall-classic')
  const [previewFloorSkinId, setPreviewFloorSkinId] = useState('floor-classic')
  const [previewWallSkinId, setPreviewWallSkinId] = useState('wall-classic')
  const [applyWallToCeiling, setApplyWallToCeiling] = useState(false)
  const [isEnvironmentMenuOpen, setIsEnvironmentMenuOpen] = useState(false)
  const [furnitureCart, setFurnitureCart] = useState([])
  const [isNearEnvironmentStation, setIsNearEnvironmentStation] = useState(false)
  const [mode, setMode] = useState('play')
  const [currentZone, setCurrentZone] = useState(ZONES.interior)
  const [zoneFadeActive, setZoneFadeActive] = useState(false)
  const [outdoorTransitionPrimed, setOutdoorTransitionPrimed] = useState(false)
  const [outdoorContentStage, setOutdoorContentStage] = useState(0)
  const [spawnRequest, setSpawnRequest] = useState(null)
  const [captureUiHidden, setCaptureUiHidden] = useState(false)
  const [shaderWarmupComplete, setShaderWarmupComplete] = useState(false)
  const [editableObjects, setEditableObjects] = useState(defaultEditableObjects)
  const [selectedObjectId, setSelectedObjectId] = useState(null)
  const [draggingObjectId, setDraggingObjectId] = useState(null)
  const [placingObjectId, setPlacingObjectId] = useState(null)
  const [placementLocked, setPlacementLocked] = useState(false)
  const [placementPreview, setPlacementPreview] = useState(null)
  const [isObjectInventoryOpen, setIsObjectInventoryOpen] = useState(false)
  const [isNearCustomizationStation, setIsNearCustomizationStation] = useState(false)
  const [isNearOutdoorDoor, setIsNearOutdoorDoor] = useState(false)
  const [ownedCat, setOwnedCat] = useState(false)
  const [catActive, setCatActive] = useState(false)
  const [ownedMagicBook, setOwnedMagicBook] = useState(false)
  const [ownedMagicSkull, setOwnedMagicSkull] = useState(false)
  const [magicSkullDiscovered, setMagicSkullDiscovered] = useState(isAdminMode)
  const [isNearMagicSkullDiscovery, setIsNearMagicSkullDiscovery] = useState(false)
  const [isLearningMagicSkull, setIsLearningMagicSkull] = useState(false)
  const [magicSkullLearnProgress, setMagicSkullLearnProgress] = useState(0)
  const summonSlotRefs = useRef(Array.from({ length: SUMMON_SKELETON_COUNT }, () => ({ current: null })))
  const summonGroupPositionsRef = useRef(new Map())
  const summonCooldownRef = useRef(0)
  const [summonCooldownUntil, setSummonCooldownUntil] = useState(0)
  const [ownedMounts, setOwnedMounts] = useState([])
  const [equippedWeapon, setEquippedWeapon] = useState(null)
  const [isWeaponMenuOpen, setIsWeaponMenuOpen] = useState(false)
  const [characterAppearance, setCharacterAppearance] = useState(CHARACTER_DEFAULT_APPEARANCE)
  const [isCharacterMenuOpen, setIsCharacterMenuOpen] = useState(false)
  const [isCustomizationChoiceOpen, setIsCustomizationChoiceOpen] = useState(false)
  const projectilesRef = useRef([])
  const remoteProjectilesRef = useRef([])
  const fireballCooldownRef = useRef(0)
  const isChargingRef = useRef(false)
  const [isCharging, setIsCharging] = useState(false)
  const magicSkullLearnTimerRef = useRef(null)
  const chargeProgressRef = useRef(0)
  const [chargeProgress, setChargeProgress] = useState(0)
  const chargeStartTimeRef = useRef(0)
  const chargePosRef = useRef({ x: 0, z: 0 })
  const chargeYawRef = useRef(0)    // centre du cône = direction du corps joueur
  const chargeAimYawRef = useRef(0) // direction courante clampée dans le cône
  const playerBodyYawRef = useRef(0) // yaw du corps joueur (mis à jour par Player)
  const [nearbySeat, setNearbySeat] = useState(null)
  const [nearbyTv, setNearbyTv] = useState(null)
  useEffect(() => { activeNearbyTvId = nearbyTv?.id ?? null }, [nearbyTv])
  const [seatedState, setSeatedState] = useState(null)
  const [authUser, setAuthUser] = useState(null)
  const [isAccountOpen, setIsAccountOpen] = useState(false)
  const [authMode, setAuthMode] = useState('signup')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [authMessage, setAuthMessage] = useState('')
  const [cloudSaveState, setCloudSaveState] = useState(isSupabaseConfigured ? 'offline' : 'local')
  const [mainMenuTab, setMainMenuTab] = useState('account')
  const [ownedTitleIds, setOwnedTitleIds] = useState([])
  const [equippedTitleId, setEquippedTitleId] = useState(null)
  const [titleActionState, setTitleActionState] = useState(null)
  const [achievementToast, setAchievementToast] = useState(null)
  // Hauts faits locaux (débloqués pour tout le monde, persistés dans la progression)
  const [unlockedAchievements, setUnlockedAchievements] = useState([])
  const unlockedAchievementsRef = useRef([])
  const [mobKillCount, setMobKillCount] = useState(0)
  // État des quêtes (sérialisable, persisté dans world_settings.quests). Toute la
  // logique est dans src/quests/questState.js — ici on ne stocke que le bag.
  const [questProgress, setQuestProgress] = useState({})
  const [nearbyQuestNpcId, setNearbyQuestNpcId] = useState(null)
  const [questDialogOpen, setQuestDialogOpen] = useState(false)
  const [questJournalOpen, setQuestJournalOpen] = useState(false)
  // Inventaire de matériaux lootés (persisté dans world_settings.materials).
  const [materials, setMaterials] = useState({})
  const [vendorOpen, setVendorOpen] = useState(false)
  // Objets lootés au sol en attente d'absorption (transitoire, non persisté).
  const [lootDrops, setLootDrops] = useState([])
  // Quête épinglée (mini-tracker). Préférence d'UI : persistée en localStorage,
  // pas dans la sauvegarde de progression.
  const [pinnedQuestId, setPinnedQuestId] = useState(() => {
    try { return window.localStorage.getItem('questPinnedId') || null } catch { return null }
  })
  useEffect(() => {
    try {
      if (pinnedQuestId) window.localStorage.setItem('questPinnedId', pinnedQuestId)
      else window.localStorage.removeItem('questPinnedId')
    } catch { /* localStorage indisponible : on ignore */ }
  }, [pinnedQuestId])
  // Tant que true, on débloque en silence (hydratation/rattrapage) sans toast
  const suppressAchievementToastsRef = useRef(true)
  const [soloNameplateVisible, setSoloNameplateVisible] = useState(() => {
    try {
      return localStorage.getItem(SOLO_NAMEPLATE_STORAGE_KEY) !== '0'
    } catch {
      return true
    }
  })
  const achievementToastTimerRef = useRef(null)
  const hasLoadedCloudProgressRef = useRef(false)
  const skipNextCloudSaveRef = useRef(false)
  const authUserRef = useRef(null)
  const latestProgressRef = useRef(null)
  const personalProgressRef = useRef(null)
  const [personalProgressVersion, setPersonalProgressVersion] = useState(0)
  const cloudSaveTimeoutRef = useRef(null)
  const onlinePresenceRef = useRef(null)
  const multiplayerChannelRef = useRef(null)
  const localPlayerStateRef = useRef({ position: [0, PLAYER_HEIGHT, 2.2], rotationY: 0, motion: 'idle', zone: ZONES.interior })
  const guestKickQueueRef = useRef([])
  const hostTimeOffsetRef = useRef(0)
  const worldSyncTimeoutRef = useRef(null)
  const lastWorldSyncPayloadRef = useRef('')
  const lastRemoteWorldSeqRef = useRef(-1)
  const [isMultiplayerOpen, setIsMultiplayerOpen] = useState(false)
  const [onlinePlayers, setOnlinePlayers] = useState([])
  const onlinePlayersRef = useRef([])
  const [incomingVisitRequest, setIncomingVisitRequest] = useState(null)
  const [outgoingVisitRequest, setOutgoingVisitRequest] = useState(null)
  const outgoingVisitRequestIdRef = useRef(null)
  const didAttemptRejoinRef = useRef(false)
  const rejoinPendingRef = useRef(false)
  const rejoinTimerRef = useRef(null)
  const [visitRequestNow, setVisitRequestNow] = useState(Date.now())
  const [selectedSocialPlayerId, setSelectedSocialPlayerId] = useState(null)
  const [friends, setFriends] = useState([])
  const [incomingFriendRequests, setIncomingFriendRequests] = useState([])
  const [pendingFriendRequests, setPendingFriendRequests] = useState([])
  const [multiplayerRole, setMultiplayerRole] = useState('solo')
  const [multiplayerSession, setMultiplayerSession] = useState(null)
  // Refs instead of state: network updates 20x/sec must not trigger React re-renders
  const remotePlayerStateRef = useRef(null)
  const remoteBallStateRef = useRef(null)
  const localChatBubblesRef = useRef([])
  const remoteChatBubblesRef = useRef([])
  const chatBubbleTimersRef = useRef(new Map())
  const chatBubbleIdRef = useRef(0)
  const [chatBubbleVersion, setChatBubbleVersion] = useState(0)
  const [hasRemotePlayer, setHasRemotePlayer] = useState(false)
  const hasRemotePlayerRef = useRef(false)
  const [sessionConnectionState, setSessionConnectionState] = useState('idle')
  const [sessionTransport, setSessionTransport] = useState('none')
  const [multiplayerMessage, setMultiplayerMessage] = useState('')
  const [chatInput, setChatInput] = useState('')
  const isGuestVisit = multiplayerRole === 'guest'
  const isHostVisit = multiplayerRole === 'host'
  const isMultiplayerSession = multiplayerRole !== 'solo'
  const canModifyWorld = !isGuestVisit
  const activeVisitExpiry = incomingVisitRequest?.expiresAt || outgoingVisitRequest?.expiresAt
  const visitRemainingSeconds = activeVisitExpiry
    ? Math.max(0, Math.ceil((new Date(activeVisitExpiry).getTime() - visitRequestNow) / 1000))
    : Math.ceil(VISIT_REQUEST_TIMEOUT_MS / 1000)

  const clearChatBubbles = useCallback(() => {
    chatBubbleTimersRef.current.forEach((timerId) => window.clearTimeout(timerId))
    chatBubbleTimersRef.current.clear()
    localChatBubblesRef.current = []
    remoteChatBubblesRef.current = []
    setChatBubbleVersion((version) => version + 1)
  }, [])

  const addChatBubble = useCallback((target, message) => {
    const text = typeof message?.text === 'string'
      ? message.text.replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX_LENGTH)
      : ''
    if (!text) return

    const bubblesRef = target === 'remote' ? remoteChatBubblesRef : localChatBubblesRef
    const id = message?.id ?? `${target}-${chatBubbleIdRef.current++}`
    const bubble = { id, text }
    bubblesRef.current = [...bubblesRef.current, bubble].slice(-CHAT_MAX_VISIBLE_BUBBLES)
    setChatBubbleVersion((version) => version + 1)

    const timerId = window.setTimeout(() => {
      bubblesRef.current = bubblesRef.current.filter((current) => current.id !== id)
      chatBubbleTimersRef.current.delete(id)
      setChatBubbleVersion((version) => version + 1)
    }, CHAT_BUBBLE_LIFETIME_MS)
    chatBubbleTimersRef.current.set(id, timerId)
  }, [])

  const showAchievementToast = useCallback((toast) => {
    setAchievementToast(toast)
    if (achievementToastTimerRef.current) window.clearTimeout(achievementToastTimerRef.current)
    achievementToastTimerRef.current = window.setTimeout(() => {
      achievementToastTimerRef.current = null
      setAchievementToast(null)
    }, 4200)
  }, [])

  // Débloque un haut fait local (idempotent). Affiche un toast sauf en période
  // de silence (hydratation / rattrapage des hauts faits déjà mérités).
  const unlockAchievement = useCallback((id) => {
    if (unlockedAchievementsRef.current.includes(id)) return
    const def = getLocalAchievement(id)
    if (!def) return
    unlockedAchievementsRef.current = [...unlockedAchievementsRef.current, id]
    setUnlockedAchievements(unlockedAchievementsRef.current)
    if (!suppressAchievementToastsRef.current) {
      showAchievementToast({ kind: 'local', name: def.name, icon: def.icon, description: def.description })
    }
  }, [showAchievementToast])

  // Réévalue en continu les hauts faits basés sur un état mesurable.
  useEffect(() => {
    const furnitureCount = editableObjects.filter(
      (object) => objectCatalog[object.objectId]?.category === 'furniture',
    ).length
    const earned = evaluateMetricAchievements({ mobKills: mobKillCount, furniture: furnitureCount, coins })
    if (ownedMounts.length > 0) earned.push('own_mount')
    if (ownedMagicBook || ownedMagicSkull) earned.push('own_weapon')
    earned.forEach(unlockAchievement)
  }, [mobKillCount, coins, editableObjects, ownedMounts, ownedMagicBook, ownedMagicSkull, unlockAchievement])

  useEffect(() => {
    if (!shaderWarmupComplete || ownedMounts.length === 0) return undefined

    const timerIds = ownedMounts
      .filter((mountId) => VALID_MOUNT_IDS.has(mountId))
      .map((mountId, index) => window.setTimeout(() => {
        preloadMountModel(mountId)
      }, MOUNT_PRELOAD_START_DELAY_MS + index * MOUNT_PRELOAD_STAGGER_MS))

    return () => {
      timerIds.forEach((timerId) => window.clearTimeout(timerId))
    }
  }, [ownedMounts, shaderWarmupComplete])

  useEffect(() => {
    const shouldPrepareOutdoor = (
      currentZone === ZONES.outside ||
      outdoorTransitionPrimed ||
      (shaderWarmupComplete && currentZone !== ZONES.outside && isNearOutdoorDoor)
    )
    if (!shouldPrepareOutdoor) return undefined

    const timerIds = OUTDOOR_CONTENT_STAGES.map(({ level, delay }) => (
      window.setTimeout(() => {
        setOutdoorContentStage((stage) => Math.max(stage, level))
      }, delay)
    ))

    return () => {
      timerIds.forEach((timerId) => window.clearTimeout(timerId))
    }
  }, [currentZone, isNearOutdoorDoor, outdoorTransitionPrimed, shaderWarmupComplete])

  // Fin de la période de silence : les déblocages suivants affichent un toast.
  useEffect(() => {
    const timer = window.setTimeout(() => { suppressAchievementToastsRef.current = false }, 2500)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    return () => {
      clearChatBubbles()
      if (achievementToastTimerRef.current) window.clearTimeout(achievementToastTimerRef.current)
    }
  }, [clearChatBubbles])

  useEffect(() => {
    if (!authUser?.id) {
      setFriends([])
      setIncomingFriendRequests([])
      setPendingFriendRequests([])
      return
    }

    try {
      const raw = localStorage.getItem(`lab_friends_v1:${authUser.id}`)
      setFriends(raw ? mergeSocialFriends(JSON.parse(raw)) : [])
    } catch {
      setFriends([])
    }
  }, [authUser?.id])

  useEffect(() => {
    if (ownedMagicSkull && !magicSkullDiscovered) {
      setMagicSkullDiscovered(true)
    }
  }, [ownedMagicSkull, magicSkullDiscovered])

  useEffect(() => {
    if (!authUser?.id) return
    localStorage.setItem(`lab_friends_v1:${authUser.id}`, JSON.stringify(friends))
  }, [authUser?.id, friends])

  useEffect(() => {
    onlinePlayersRef.current = onlinePlayers
    if (!onlinePlayers.length) return
    setFriends((current) => {
      let changed = false
      const next = current.map((friend) => {
        const online = onlinePlayers.find((player) => player.userId === friend.userId)
        if (!online) return friend
        const lastSeenAt = online.onlineAt || new Date().toISOString()
        const displayName = online.displayName || friend.displayName
        if (friend.lastSeenAt === lastSeenAt && friend.displayName === displayName) return friend
        changed = true
        return { ...friend, displayName, lastSeenAt }
      })
      return changed ? next : current
    })
  }, [onlinePlayers])

  useEffect(() => {
    try {
      localStorage.setItem(SOLO_NAMEPLATE_STORAGE_KEY, soloNameplateVisible ? '1' : '0')
    } catch {}
  }, [soloNameplateVisible])

  useEffect(() => {
    if (!incomingVisitRequest && !outgoingVisitRequest) return undefined
    const intervalId = window.setInterval(() => setVisitRequestNow(Date.now()), 1000)
    return () => window.clearInterval(intervalId)
  }, [incomingVisitRequest, outgoingVisitRequest])

  useEffect(() => {
    const now = Date.now()
    if (incomingVisitRequest?.expiresAt && new Date(incomingVisitRequest.expiresAt).getTime() <= now) {
      setIncomingVisitRequest(null)
      setMultiplayerMessage('Demande de visite expiree.')
    }
    if (outgoingVisitRequest?.expiresAt && new Date(outgoingVisitRequest.expiresAt).getTime() <= now) {
      setOutgoingVisitRequest(null)
      setMultiplayerMessage('Demande de visite expiree.')
    }
  }, [incomingVisitRequest, outgoingVisitRequest, visitRequestNow])

  useEffect(() => {
    if (!isHostVisit || !multiplayerSession || !authUser) return undefined

    const snapshot = createWorldSyncSnapshot()
    const payload = JSON.stringify(snapshot)
    if (payload === lastWorldSyncPayloadRef.current) return undefined

    if (worldSyncTimeoutRef.current) window.clearTimeout(worldSyncTimeoutRef.current)
    worldSyncTimeoutRef.current = window.setTimeout(() => {
      worldSyncTimeoutRef.current = null
      const channel = multiplayerChannelRef.current
      if (!channel?.sendWorldState) return
      channel.sendWorldState(snapshot)
      lastWorldSyncPayloadRef.current = payload
    }, 120)

    return () => {
      if (worldSyncTimeoutRef.current) {
        window.clearTimeout(worldSyncTimeoutRef.current)
        worldSyncTimeoutRef.current = null
      }
    }
  }, [isHostVisit, multiplayerSession, authUser, sessionConnectionState, roomLightOn, lightColor, lightIntensity, selectedFloorSkinId, selectedWallSkinId, applyWallToCeiling, editableObjects])

  useEffect(() => {
    if (!isAdminMode && !isVerticalFrameMode) return undefined

    const onKeyDown = (event) => {
      const key = getKeyboardKey(event)
      const isDeleteToggle = key === 'delete'
      const isPointingUp = (isAdminMode || isVerticalFrameMode) && key === 'p' && !event.repeat
      if (!isDeleteToggle && !isPointingUp) return
      const target = event.target
      const isTyping =
        target instanceof HTMLElement &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      if (isTyping) return
      event.preventDefault()
      if (isDeleteToggle) {
        setCaptureUiHidden((current) => !current)
        return
      }
      touchRef.current.emoteQueued = 'pointingUp'
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isAdminMode, isVerticalFrameMode])

  const createCurrentProgressSnapshot = () => ({
    displayName,
    coins,
    ownedSkins,
    selectedSkinId,
    roomLightOn,
    lightColor,
    lightIntensity,
    ownedFloorSkins,
    ownedWallSkins,
    selectedFloorSkinId,
    selectedWallSkinId,
    applyWallToCeiling,
    editableObjects,
    ownedCat,
    catActive,
    ownedMagicBook,
    ownedMagicSkull,
    magicSkullDiscovered,
    ownedWeapons: [ownedMagicBook && 'magic_book', ownedMagicSkull && 'magic_skull'].filter(Boolean),
    unlockedAchievements,
    mobKillCount,
    ownedMounts,
    equippedWeapon,
    equippedTitleId,
    characterAppearance,
    friends,
    quests: questProgress,
    materials,
  })

  const createWorldSyncSnapshot = () => ({
    roomLightOn,
    lightColor,
    lightIntensity,
    selectedFloorSkinId,
    selectedWallSkinId,
    applyWallToCeiling,
    editableObjects,
  })

  const rememberPersonalProgress = (snapshot) => {
    if (!snapshot) return
    personalProgressRef.current = snapshot
    setPersonalProgressVersion((version) => version + 1)
  }

  const createPersonalProgressSnapshot = (worldOverride = null) => {
    const savedWorld = worldOverride ?? personalProgressRef.current ?? (isGuestVisit ? {} : latestProgressRef.current) ?? {}
    const fallbackEditableObjects = isGuestVisit ? defaultEditableObjects : editableObjects
    return {
      ...savedWorld,
      displayName,
      coins,
      ownedSkins,
      selectedSkinId,
      ownedFloorSkins,
      ownedWallSkins,
      ownedCat,
      catActive,
      ownedMagicBook,
      ownedMagicSkull,
      magicSkullDiscovered,
      ownedWeapons: [ownedMagicBook && 'magic_book', ownedMagicSkull && 'magic_skull'].filter(Boolean),
      unlockedAchievements,
      mobKillCount,
      ownedMounts,
      equippedWeapon,
      equippedTitleId,
      characterAppearance,
      friends,
      quests: questProgress,
      materials,
      roomLightOn: savedWorld.roomLightOn ?? roomLightOn,
      lightColor: savedWorld.lightColor ?? lightColor,
      lightIntensity: savedWorld.lightIntensity ?? lightIntensity,
      selectedFloorSkinId: savedWorld.selectedFloorSkinId ?? selectedFloorSkinId,
      selectedWallSkinId: savedWorld.selectedWallSkinId ?? selectedWallSkinId,
      applyWallToCeiling: savedWorld.applyWallToCeiling ?? applyWallToCeiling,
      editableObjects: Array.isArray(savedWorld.editableObjects) ? savedWorld.editableObjects : fallbackEditableObjects,
    }
  }

  const resetGuestProgress = () => {
    setCoins(isAdminMode ? 850 : 0)
    setOwnedSkins(['classic'])
    setSelectedSkinId('classic')
    setPreviewSkinId('classic')
    setRoomLightOn(true)
    setLightColor('#ffffff')
    setLightIntensity(2)
    setOwnedFloorSkins(['floor-classic'])
    setOwnedWallSkins(['wall-classic'])
    setSelectedFloorSkinId('floor-classic')
    setSelectedWallSkinId('wall-classic')
    setPreviewFloorSkinId('floor-classic')
    setPreviewWallSkinId('wall-classic')
    setApplyWallToCeiling(false)
    setEditableObjects(defaultEditableObjects)
    setSelectedObjectId(null)
    setDraggingObjectId(null)
    setPlacingObjectId(null)
    setPlacementLocked(false)
    setPlacementPreview(null)
    setIsObjectInventoryOpen(false)
    setNearbySeat(null)
    setSeatedState(null)
    setOwnedCat(false)
    setCatActive(false)
    setOwnedMagicBook(false)
    setOwnedMagicSkull(false)
    setMagicSkullDiscovered(isAdminMode)
    setIsNearMagicSkullDiscovery(false)
    summonSlotRefs.current.forEach((slotRef) => { slotRef.current = null })
    summonGroupPositionsRef.current.clear()
    summonCooldownRef.current = 0
    setSummonCooldownUntil(0)
    unlockedAchievementsRef.current = []
    setUnlockedAchievements([])
    setMobKillCount(0)
    setQuestProgress({})
    setMaterials({})
    setLootDrops([])
    setVendorOpen(false)
    setNearbyQuestNpcId(null)
    setQuestDialogOpen(false)
    setQuestJournalOpen(false)
    setOwnedMounts([])
    setMountedMountId(null)
    setEquippedWeapon(null)
    setIsWeaponMenuOpen(false)
    setCharacterAppearance(CHARACTER_DEFAULT_APPEARANCE)
    projectilesRef.current = []
    setOwnedTitleIds([])
    setEquippedTitleId(null)
    setAchievementToast(null)
    setPlayerHp(PLAYER_MAX_HP)
  }

  const applyProgressSnapshot = (parsed, { includeCoins = true, includeIdentity = includeCoins, includeInventory = includeCoins, includeWorld = true } = {}) => {
    if (!parsed) return
    if (includeIdentity && typeof parsed.displayName === 'string') setDisplayName(parsed.displayName)
    if (includeCoins && typeof parsed.coins === 'number') {
      setCoins(isAdminMode ? 850 : Math.max(0, parsed.coins))
    } else if (includeCoins) {
      setCoins(isAdminMode ? 850 : 0)
    }
    // Personal inventory (owned skins) must never be taken from a visited
    // player's snapshot — otherwise visiting someone would show their purchases
    // as yours. Gated behind includeInventory (false during a visit).
    if (includeInventory && Array.isArray(parsed.ownedSkins) && parsed.ownedSkins.length) setOwnedSkins(parsed.ownedSkins)
    if (includeIdentity && typeof parsed.selectedSkinId === 'string') {
      setSelectedSkinId(parsed.selectedSkinId)
      setPreviewSkinId(parsed.selectedSkinId)
    }
    // House appearance (lighting). includeWorld is false when reloading our own
    // progress while we are rejoining someone else's world as a guest, so our
    // own house doesn't overwrite the host's.
    if (includeWorld && typeof parsed.roomLightOn === 'boolean') setRoomLightOn(parsed.roomLightOn)
    if (includeWorld && typeof parsed.lightColor === 'string') setLightColor(parsed.lightColor)
    if (includeWorld && typeof parsed.lightIntensity === 'number') {
      setLightIntensity(MathUtils.clamp(parsed.lightIntensity, 0.1, 3))
    }
    if (includeIdentity && parsed.characterAppearance && typeof parsed.characterAppearance === 'object') {
      setCharacterAppearance({ ...CHARACTER_DEFAULT_APPEARANCE, ...parsed.characterAppearance })
    }

    const validFloorSkinIds = new Set(floorSkins.map((skin) => skin.id))
    const validWallSkinIds = new Set(wallSkins.map((skin) => skin.id))
    const ownedFloorSkinIds = Array.isArray(parsed.ownedFloorSkins)
      ? ['floor-classic', ...parsed.ownedFloorSkins.filter((id) => validFloorSkinIds.has(id) && id !== 'floor-classic')]
      : ['floor-classic']
    const ownedWallSkinIds = Array.isArray(parsed.ownedWallSkins)
      ? ['wall-classic', ...parsed.ownedWallSkins.filter((id) => validWallSkinIds.has(id) && id !== 'wall-classic')]
      : ['wall-classic']

    // Owned floor/wall skins are inventory (keep the visitor's own); the
    // selected ones below are the host's house appearance (apply always).
    if (includeInventory) {
      setOwnedFloorSkins(ownedFloorSkinIds)
      setOwnedWallSkins(ownedWallSkinIds)
    }

    if (includeWorld && typeof parsed.selectedFloorSkinId === 'string' && validFloorSkinIds.has(parsed.selectedFloorSkinId)) {
      setSelectedFloorSkinId(parsed.selectedFloorSkinId)
      setPreviewFloorSkinId(parsed.selectedFloorSkinId)
    }
    if (includeWorld && typeof parsed.selectedWallSkinId === 'string' && validWallSkinIds.has(parsed.selectedWallSkinId)) {
      setSelectedWallSkinId(parsed.selectedWallSkinId)
      setPreviewWallSkinId(parsed.selectedWallSkinId)
    }
    if (includeWorld && typeof parsed.applyWallToCeiling === 'boolean') {
      setApplyWallToCeiling(parsed.applyWallToCeiling)
    }

    if (includeWorld && Array.isArray(parsed.editableObjects)) {
      const knownIds = new Set(defaultEditableObjects.map((object) => object.id))
      const savedObjectsById = new Map(parsed.editableObjects.map((object) => [object?.id, object]))
      const mergedObjects = defaultEditableObjects.map((baseObject) => {
        const savedObject = savedObjectsById.get(baseObject.id)
        if (!savedObject || !knownIds.has(savedObject.id)) return baseObject
        const position = Array.isArray(savedObject.position) && savedObject.position.length === 3
          ? savedObject.position
          : baseObject.position
        return {
          ...baseObject,
          status: savedObject.status === 'stored' && baseObject.canStore ? 'stored' : 'placed',
          position: savedObject.status === 'stored' && baseObject.canStore
            ? null
            : normalizeSavedObjectPosition(position, baseObject.position),
          rotationY: Number.isFinite(savedObject.rotationY) ? savedObject.rotationY : baseObject.rotationY,
        }
      })
      const savedShopObjects = parsed.editableObjects
        .filter((object) =>
          object?.id &&
          !knownIds.has(object.id) &&
          !LEGACY_STARTER_FURNITURE_IDS.has(object.id) &&
          shopObjectIds.includes(object.objectId),
        )
        .map((object) => {
          const position = Array.isArray(object.position) && object.position.length === 3
            ? object.position
            : null
          return createEditableObjectInstance(object.objectId, {
            id: object.id,
            status: object.status === 'placed' ? 'placed' : 'stored',
            position: object.status === 'placed' && position
              ? normalizeSavedObjectPosition(position, [0, 0, 0])
              : null,
            rotationY: Number.isFinite(object.rotationY) ? object.rotationY : 0,
          })
        })
        .filter(Boolean)

      setEditableObjects([...mergedObjects, ...savedShopObjects])
    }
    // Pets, mounts, weapons are personal inventory: never apply them from a
    // visited player's snapshot (that would show their animals/mounts as yours).
    if (includeInventory) {
      if (typeof parsed.ownedCat === 'boolean') setOwnedCat(parsed.ownedCat)
      if (typeof parsed.catActive === 'boolean') setCatActive(parsed.catActive)
      // Hauts faits locaux : on charge le set sauvegardé (les hauts faits
      // événementiels ne sont pas redérivables, il faut les conserver).
      const parsedAchievements = Array.isArray(parsed.unlockedAchievements)
        ? parsed.unlockedAchievements.filter((id) => getLocalAchievement(id))
        : []
      unlockedAchievementsRef.current = parsedAchievements
      setUnlockedAchievements(parsedAchievements)
      if (typeof parsed.mobKillCount === 'number' && parsed.mobKillCount >= 0) {
        setMobKillCount(parsed.mobKillCount)
      }
      setQuestProgress(normalizeQuestProgress(parsed.quests))
      setMaterials(normalizeMaterials(parsed.materials))
      const parsedOwnedWeapons = Array.isArray(parsed.ownedWeapons) ? parsed.ownedWeapons : []
      const hasMagicBook = Boolean(parsed.ownedMagicBook || parsedOwnedWeapons.includes('magic_book'))
      const hasMagicSkull = Boolean(parsed.ownedMagicSkull || parsedOwnedWeapons.includes('magic_skull'))
      setOwnedMagicBook(hasMagicBook)
      setOwnedMagicSkull(hasMagicSkull)
      setMagicSkullDiscovered(Boolean(isAdminMode || parsed.magicSkullDiscovered || hasMagicSkull))
      const parsedOwnedMounts = Array.isArray(parsed.ownedMounts)
        ? parsed.ownedMounts.filter((id) => VALID_MOUNT_IDS.has(id))
        : []
      setOwnedMounts(Array.from(new Set(parsedOwnedMounts)))
      const savedEquipped = typeof parsed.equippedWeapon === 'string' ? parsed.equippedWeapon : null
      const equippedIsValid =
        (savedEquipped === 'magic_book' && hasMagicBook) ||
        (savedEquipped === 'magic_skull' && hasMagicSkull)
      setEquippedWeapon(equippedIsValid ? savedEquipped : null)
    }
    if (includeIdentity && (typeof parsed.equippedTitleId === 'string' || parsed.equippedTitleId === null)) setEquippedTitleId(parsed.equippedTitleId)
    if (includeIdentity && Array.isArray(parsed.friends)) {
      setFriends((current) => mergeSocialFriends(current, parsed.friends))
    }
  }

  // Remember the active session so a reload can rejoin it (auto-cleared when the
  // session ends or the player goes solo). The world snapshot is dropped — it is
  // reloaded fresh on rejoin.
  useEffect(() => {
    if (typeof window === 'undefined' || !authUser?.id) return
    // Only WRITE the active session here. It must NOT be cleared just because we
    // are solo at mount — otherwise it would be wiped before the rejoin effect
    // can read it. Clearing happens explicitly on leave / session-ended / dead
    // rejoin.
    if (!multiplayerSession || multiplayerRole === 'solo') return
    try {
      const { worldSnapshot, ...sessionLite } = multiplayerSession
      localStorage.setItem(
        activeSessionStorageKey(authUser.id),
        JSON.stringify({ session: sessionLite, role: multiplayerRole, savedAt: Date.now() }),
      )
    } catch {
      // Ignore storage errors (private mode, quota).
    }
  }, [authUser?.id, multiplayerSession, multiplayerRole])

  // On load, if a recent session was saved, rejoin it. If no peer responds
  // within a short window, the session is treated as dead and we fall back to
  // solo.
  useEffect(() => {
    if (didAttemptRejoinRef.current) return
    if (!authUser?.id || !isMultiplayerAvailable()) return
    if (multiplayerRole !== 'solo' || multiplayerSession) return
    didAttemptRejoinRef.current = true

    const saved = readSavedSession(authUser.id)
    if (!saved) {
      // Drop an expired/invalid entry so it can't accumulate.
      try { localStorage.removeItem(activeSessionStorageKey(authUser.id)) } catch { /* ignore */ }
      return
    }

    let cancelled = false
    const rejoin = async () => {
      if (saved.role === 'guest') {
        try {
          const hostWorld = await loadPlayerPublicWorld(saved.session.hostUserId, { scope: progressScope })
          if (!cancelled && hostWorld) {
            rememberPersonalProgress(latestProgressRef.current ?? createCurrentProgressSnapshot())
            applyProgressSnapshot(hostWorld, { includeCoins: false })
          }
        } catch {
          // Non-fatal: still attempt to rejoin; the world may already be loaded.
        }
      }
      if (cancelled) return
      setMultiplayerSession(saved.session)
      setMultiplayerRole(saved.role)
      setMode('play')
      setMultiplayerMessage('Reconnexion a la session...')
      // The give-up countdown is armed only once the channel is actually
      // connected (see effect below) so the long initial world load doesn't eat
      // the window.
      rejoinPendingRef.current = true
    }
    rejoin()
    return () => { cancelled = true }
  }, [authUser?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Drive the rejoin outcome from the live connection:
  //  - peer state arrived  -> confirmed, session is live.
  //  - channel connected but no peer within the window -> session is dead.
  useEffect(() => {
    if (!rejoinPendingRef.current) return undefined
    if (hasRemotePlayer) {
      rejoinPendingRef.current = false
      if (rejoinTimerRef.current) { window.clearTimeout(rejoinTimerRef.current); rejoinTimerRef.current = null }
      setMultiplayerMessage('Reconnecte a la session.')
      return undefined
    }
    if (sessionConnectionState !== 'connected') return undefined
    if (rejoinTimerRef.current) return undefined
    rejoinTimerRef.current = window.setTimeout(() => {
      rejoinTimerRef.current = null
      if (rejoinPendingRef.current && !hasRemotePlayerRef.current) {
        rejoinPendingRef.current = false
        setMultiplayerRole('solo')
        setMultiplayerSession(null)
        try { if (authUser?.id) localStorage.removeItem(activeSessionStorageKey(authUser.id)) } catch { /* ignore */ }
        setMultiplayerMessage('La session precedente n est plus active.')
      }
    }, ACTIVE_SESSION_REJOIN_TIMEOUT_MS)
    return undefined
  }, [hasRemotePlayer, sessionConnectionState, authUser?.id])

  const refreshPlayerTitles = async () => {
    if (!isSupabaseConfigured || !authUserRef.current) {
      setOwnedTitleIds([])
      setEquippedTitleId(null)
      return null
    }

    const titleState = await loadPlayerTitles({ scope: progressScope })
    const ownedTitles = Array.isArray(titleState?.ownedTitles) ? titleState.ownedTitles : []
    setOwnedTitleIds(ownedTitles.map((title) => title.titleId).filter(Boolean))
    setEquippedTitleId(titleState?.equippedTitleId ?? null)
    return titleState
  }

  const saveCurrentProgressToCloud = async () => {
    if (!isSupabaseConfigured || !authUserRef.current || !hasLoadedCloudProgressRef.current) return false
    setCloudSaveState('saving')
    try {
      const snapshot = isGuestVisit
        ? createPersonalProgressSnapshot()
        : latestProgressRef.current ?? createCurrentProgressSnapshot()
      await savePlayerProgress(snapshot, { scope: progressScope })
      if (isGuestVisit) rememberPersonalProgress(snapshot)
      setCloudSaveState('synced')
      return true
    } catch {
      setCloudSaveState('error')
      return false
    }
  }

  const applyCoinDelta = async (delta, { share = delta > 0, reason = 'reward', position = null } = {}) => {
    const previousCoins = latestProgressRef.current?.coins ?? coins
    setCoins((current) => Math.max(0, current + delta))
    const shareGain = () => {
      if (!share || delta <= 0 || !isMultiplayerSession) return
      multiplayerChannelRef.current?.sendCoinGain?.({
        id: `${authUserRef.current?.id ?? 'local'}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        delta,
        reason,
        position,
      })
    }
    if (!isSupabaseConfigured || !authUserRef.current || !hasLoadedCloudProgressRef.current) {
      shareGain()
      return true
    }

    try {
      const nextCoins = await addPlayerCoins(delta, { scope: progressScope })
      if (typeof nextCoins === 'number') setCoins(Math.max(0, nextCoins))
      shareGain()
      return true
    } catch {
      if (delta > 0 || previousCoins + delta >= 0) {
        try {
          const fallbackSnapshot = isGuestVisit
            ? createPersonalProgressSnapshot()
            : latestProgressRef.current ?? createCurrentProgressSnapshot()
          await savePlayerProgress({
            ...fallbackSnapshot,
            coins: Math.max(0, previousCoins + delta),
          }, { includeCoins: true, scope: progressScope })
          setCloudSaveState('synced')
          shareGain()
          return true
        } catch {}
      }
      setCoins(previousCoins)
      setCloudSaveState('error')
      return false
    }
  }

  const toggleEquippedTitle = async (titleId) => {
    if (!isSupabaseConfigured || !authUserRef.current || !ownedTitleIds.includes(titleId)) return
    const nextTitleId = equippedTitleId === titleId ? null : titleId
    setTitleActionState(titleId)
    try {
      await equipPlayerTitle(nextTitleId, { scope: progressScope })
      setEquippedTitleId(nextTitleId)
      setCloudSaveState('synced')
      await refreshPlayerTitles()
    } catch {
      setCloudSaveState('error')
    } finally {
      setTitleActionState(null)
    }
  }

  useEffect(() => {
    try {
      const raw = localStorage.getItem(progressStorageKey)
      if (!raw) return
      // Don't let our own house overwrite the host's while rejoining a visit.
      applyProgressSnapshot(JSON.parse(raw), { includeWorld: !hasSavedGuestSession(authUserRef.current?.id) })
    } catch {}
  }, [progressStorageKey])

  useEffect(() => {
    const snapshot = isGuestVisit ? createPersonalProgressSnapshot() : createCurrentProgressSnapshot()
    latestProgressRef.current = snapshot
    if (!isGuestVisit) rememberPersonalProgress(snapshot)
    localStorage.setItem(
      progressStorageKey,
      JSON.stringify(snapshot),
    )
  }, [isGuestVisit, progressStorageKey, displayName, coins, ownedSkins, selectedSkinId, roomLightOn, lightColor, lightIntensity, ownedFloorSkins, ownedWallSkins, selectedFloorSkinId, selectedWallSkinId, applyWallToCeiling, editableObjects, ownedCat, catActive, ownedMagicBook, ownedMagicSkull, magicSkullDiscovered, unlockedAchievements, mobKillCount, ownedMounts, equippedWeapon, equippedTitleId, characterAppearance, friends, questProgress, materials])

  useEffect(() => {
    authUserRef.current = authUser
  }, [authUser])

  useEffect(() => {
    playerHpRef.current = playerHp
  }, [playerHp])

  useEffect(() => {
    outgoingVisitRequestIdRef.current = outgoingVisitRequest?.id ?? null
  }, [outgoingVisitRequest?.id])

  const addFriend = useCallback((friend) => {
    if (!friend?.userId) return
    setFriends((current) => {
      if (current.some((item) => item.userId === friend.userId)) return current
      return mergeSocialFriends(current, [{
        userId: friend.userId,
        displayName: friend.displayName || 'Joueur',
        addedAt: new Date().toISOString(),
        lastSeenAt: friend.lastSeenAt || null,
      }])
    })
  }, [])

  useEffect(() => {
    if (!isMultiplayerAvailable() || !authUser) {
      setOnlinePlayers([])
      onlinePresenceRef.current?.disconnect()
      onlinePresenceRef.current = null
      return undefined
    }

    const connection = connectOnlinePresence({
      user: authUser,
      displayName,
      equippedTitleId,
      status: multiplayerRole === 'solo' ? 'available' : 'busy',
      onPlayers: setOnlinePlayers,
      onVisitRequest: (request) => {
        if (multiplayerRole !== 'solo') return
        if (request?.expiresAt && new Date(request.expiresAt).getTime() <= Date.now()) return
        setIncomingVisitRequest(request)
        setVisitRequestNow(Date.now())
        setIsMultiplayerOpen(true)
        setIsAccountOpen(true)
        setMainMenuTab('social')
        setMultiplayerMessage(`${request.fromDisplayName} veut visiter ton monde.`)
      },
      onVisitCancel: (payload) => {
        // The requester changed their mind: drop the matching incoming request.
        setIncomingVisitRequest((current) => {
          if (!current) return current
          if (payload?.requestId && current.id !== payload.requestId) return current
          if (payload?.fromUserId && current.fromUserId !== payload.fromUserId) return current
          setMultiplayerMessage('Demande de visite annulee.')
          return null
        })
      },
      onVisitResponse: async (response) => {
        if (response?.requestId && outgoingVisitRequestIdRef.current && response.requestId !== outgoingVisitRequestIdRef.current) return
        if (!response?.accepted) {
          setOutgoingVisitRequest(null)
          setMultiplayerMessage('Demande refusee.')
          return
        }

        setOutgoingVisitRequest(null)
        setMultiplayerMessage('Chargement du monde...')
        try {
          const hostWorld = response.session.worldSnapshot
            ?? await loadPlayerPublicWorld(response.session.hostUserId, { scope: progressScope })
          if (!hostWorld) {
            setMultiplayerMessage('Impossible de charger ce monde. Verifie le SQL Supabase.')
            return
          }
          rememberPersonalProgress(latestProgressRef.current ?? createCurrentProgressSnapshot())
          applyProgressSnapshot(hostWorld, { includeCoins: false })
          setMultiplayerSession(response.session)
          setMultiplayerRole('guest')
          setMode('play')
          setIsSkinMenuOpen(false)
          setIsEnvironmentMenuOpen(false)
          setIsObjectInventoryOpen(false)
          setSelectedObjectId(null)
          setMultiplayerMessage('Mode visite active: tu peux te balader et jouer au foot.')
        } catch {
          setMultiplayerMessage('Lecture du monde impossible. Lance le SQL Supabase mis a jour.')
        }
      },
      onFriendRequest: (request) => {
        if (!request?.fromUserId) return
        setIncomingFriendRequests((current) => (
          current.some((item) => item.id === request.id || item.fromUserId === request.fromUserId)
            ? current
            : [...current, request]
        ))
        setIsAccountOpen(true)
        setMainMenuTab('friends')
        setMultiplayerMessage(`${request.fromDisplayName} veut t'ajouter en ami.`)
      },
      onFriendResponse: (response) => {
        setPendingFriendRequests((current) => current.filter((request) => request.id !== response?.requestId))
        if (!response?.accepted) {
          setMultiplayerMessage('Demande d ami refusee.')
          return
        }
        const onlineFriend = onlinePlayersRef.current.find((player) => player.userId === response.fromUserId)
        addFriend({
          userId: response.fromUserId,
          displayName: onlineFriend?.displayName || response.fromDisplayName,
          lastSeenAt: onlineFriend?.onlineAt || null,
        })
        setMultiplayerMessage(`${response.fromDisplayName} est maintenant dans ta liste d'amis.`)
      },
      onSessionEnded: () => {
        setMultiplayerMessage('La visite est terminee.')
        setMultiplayerRole('solo')
        setMultiplayerSession(null)
        remotePlayerStateRef.current = null
        remoteBallStateRef.current = null
        clearChatBubbles()
        if (hasRemotePlayerRef.current) { hasRemotePlayerRef.current = false; setHasRemotePlayer(false) }
        setSessionConnectionState('idle')
        rejoinPendingRef.current = false
        try { if (authUserRef.current?.id) localStorage.removeItem(activeSessionStorageKey(authUserRef.current.id)) } catch { /* ignore */ }
        if (authUserRef.current) {
          loadPlayerProgress({ scope: progressScope })
            .then((progress) => {
              if (progress) applyProgressSnapshot(progress)
            })
            .catch(() => {})
        }
      },
    })

    onlinePresenceRef.current = connection
    return () => {
      connection.disconnect()
      if (onlinePresenceRef.current === connection) onlinePresenceRef.current = null
    }
  }, [addFriend, authUser, clearChatBubbles, displayName, equippedTitleId, multiplayerRole, progressScope])

  useEffect(() => {
    multiplayerChannelRef.current?.disconnect()
    multiplayerChannelRef.current = null
    remotePlayerStateRef.current = null
    remoteBallStateRef.current = null
    lastRemoteWorldSeqRef.current = -1
    if (multiplayerRole !== 'host') lastWorldSyncPayloadRef.current = ''
    clearChatBubbles()
    if (hasRemotePlayerRef.current) { hasRemotePlayerRef.current = false; setHasRemotePlayer(false) }
    setSessionConnectionState('idle')
    setSessionTransport('none')
    guestKickQueueRef.current = []

    if (!multiplayerSession || multiplayerRole === 'solo' || !authUser) return undefined

    let cancelled = false
    let activeChannel = null

    const applyRemotePlayerState = (msg) => {
      remotePlayerStateRef.current = msg
      if (!hasRemotePlayerRef.current) {
        hasRemotePlayerRef.current = true
        setHasRemotePlayer(true)
      }
    }
    const clearRemoteState = () => {
      remotePlayerStateRef.current = null
      remoteBallStateRef.current = null
      if (hasRemotePlayerRef.current) {
        hasRemotePlayerRef.current = false
        setHasRemotePlayer(false)
      }
    }
    const applyRemoteWorldState = (message) => {
      if (multiplayerRole !== 'guest') return
      const seq = Number.isFinite(message?.seq) ? message.seq : Date.now()
      if (seq <= lastRemoteWorldSeqRef.current) return
      if (!message?.snapshot) return
      lastRemoteWorldSeqRef.current = seq
      applyProgressSnapshot(message.snapshot, { includeCoins: false })
    }
    const applyRemoteCoinGain = async (message) => {
      const delta = Number(message?.delta)
      if (!Number.isFinite(delta) || delta <= 0) return
      const rewarded = await applyCoinDelta(delta, { share: false })
      if (!rewarded) return

      const position = Array.isArray(message?.position) ? message.position : null
      if (!position) return
      setScorePopups((previous) => [
        ...previous,
        {
          id: message.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          value: delta,
          x: position[0] ?? 0,
          y: position[1] ?? 1,
          z: position[2] ?? 0,
          startAt: Date.now(),
          duration: 700,
        },
      ])
    }
    const applyRemoteSpellCast = (message) => {
      if (message?.kind !== 'fireball' || !Array.isArray(message.position) || !Array.isArray(message.direction)) return
      const [x, y, z] = message.position
      const [dirX, dirZ] = message.direction
      if (![x, y, z, dirX, dirZ].every(Number.isFinite)) return
      const dirLength = Math.hypot(dirX, dirZ)
      if (dirLength < 0.001) return
      const safeDirX = dirX / dirLength
      const safeDirZ = dirZ / dirLength
      const localNow = Date.now()
      const estimatedServerNow = localNow + (hostTimeOffsetRef.current ?? 0)
      const serverAgeMs = Number.isFinite(message.serverTime) ? estimatedServerNow - message.serverTime : NaN
      const sentAgeMs = Number.isFinite(message.sentAt) ? localNow - message.sentAt : NaN
      const rawAgeMs = Number.isFinite(serverAgeMs) ? serverAgeMs : (Number.isFinite(sentAgeMs) ? sentAgeMs : 0)
      const ageMs = MathUtils.clamp(
        rawAgeMs,
        0,
        REMOTE_SPELL_LATENCY_COMPENSATION_MAX_MS,
      )
      const travelled = FIREBALL_SPEED * (ageMs / 1000)

      remoteProjectilesRef.current = [
        ...remoteProjectilesRef.current.slice(-(MAX_ACTIVE_FIREBALLS - 1)),
        {
          id: message.id ?? `remote_fb_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          x: x + safeDirX * travelled,
          y,
          z: z + safeDirZ * travelled,
          dirX: safeDirX,
          dirZ: safeDirZ,
          startedAt: localNow - ageMs,
          phase: Number.isFinite(message.phase) ? message.phase : Math.random() * Math.PI * 2,
        },
      ]
    }

    const connectFallbackSupabase = () => {
      const channel = connectMultiplayerSession({
        sessionId: multiplayerSession.id,
        userId: authUser.id,
        role: multiplayerRole,
        onRemotePlayerState: applyRemotePlayerState,
        onRemoteBallState: (msg) => { remoteBallStateRef.current = msg },
        onGuestKick: (payload) => {
          if (payload?.impulse) guestKickQueueRef.current.push(payload)
        },
        onChatMessage: (payload) => addChatBubble('remote', payload),
        onWorldState: applyRemoteWorldState,
        onCoinGain: applyRemoteCoinGain,
        onSpellCast: applyRemoteSpellCast,
        onStatusChange: setSessionConnectionState,
        onHostTimeOffsetChange: (offset) => {
          hostTimeOffsetRef.current = MathUtils.lerp(hostTimeOffsetRef.current, offset, 0.25)
        },
        onSessionEnded: () => {
          clearRemoteState()
          setMultiplayerRole('solo')
          setMultiplayerSession(null)
          setSessionConnectionState('idle')
          setSessionTransport('none')
          setMultiplayerMessage('La visite est terminee.')
        },
      })
      setSessionTransport('supabase')
      return channel
    }

    setSessionConnectionState('connecting')
    connectColyseusVisitSession({
      session: multiplayerSession,
      user: authUser,
      role: multiplayerRole,
      displayName: getVisiblePlayerName(displayName, authUser, ''),
      onRemotePlayerState: applyRemotePlayerState,
      onRemoteBallState: (msg) => { remoteBallStateRef.current = msg },
      onGuestKick: (payload) => {
        if (payload?.impulse) guestKickQueueRef.current.push(payload)
      },
      onChatMessage: (payload) => addChatBubble('remote', payload),
      onWorldState: applyRemoteWorldState,
      onCoinGain: applyRemoteCoinGain,
      onSpellCast: applyRemoteSpellCast,
      onPlayerLeft: () => {
        clearRemoteState()
        setMultiplayerMessage('Le joueur distant a quitte la visite.')
      },
      onStatusChange: setSessionConnectionState,
      onServerTimeOffsetChange: (offset) => {
        hostTimeOffsetRef.current = MathUtils.lerp(hostTimeOffsetRef.current, offset, 0.35)
      },
    })
      .then((channel) => {
        if (cancelled) {
          channel?.disconnect()
          return
        }
        if (channel) {
          activeChannel = channel
          multiplayerChannelRef.current = channel
          setSessionTransport('colyseus')
          return
        }
        activeChannel = connectFallbackSupabase()
        multiplayerChannelRef.current = activeChannel
      })
      .catch((error) => {
        if (cancelled) return
        activeChannel = connectFallbackSupabase()
        multiplayerChannelRef.current = activeChannel
        const errorMessage = error?.message ? ` (${error.message})` : ''
        setMultiplayerMessage(`Colyseus indisponible sur ${getColyseusConnectionLabel()}: fallback Supabase actif.${errorMessage}`)
      })

    return () => {
      cancelled = true
      activeChannel?.disconnect()
      if (multiplayerChannelRef.current === activeChannel) multiplayerChannelRef.current = null
    }
  }, [addChatBubble, authUser, clearChatBubbles, displayName, multiplayerRole, multiplayerSession])

  useEffect(() => {
    if (!isSupabaseConfigured) return undefined

    let cancelled = false

    const loadCloudProgress = async (user) => {
      setAuthUser(user)
      authUserRef.current = user
      if (!user) {
        hasLoadedCloudProgressRef.current = false
        setCloudSaveState('offline')
        setOwnedTitleIds([])
        setEquippedTitleId(null)
        return
      }
      setDisplayName((current) => current || getUserDisplayName(user))

      setCloudSaveState('loading')
      try {
        const cloudProgress = await loadPlayerProgress({ scope: progressScope })
        if (cancelled) return
        if (cloudProgress) {
          rememberPersonalProgress(cloudProgress)
          skipNextCloudSaveRef.current = true
          applyProgressSnapshot(cloudProgress, { includeWorld: !hasSavedGuestSession(user.id) })
        } else {
          const snapshot = latestProgressRef.current ?? createCurrentProgressSnapshot()
          await savePlayerProgress(snapshot, { scope: progressScope })
          rememberPersonalProgress(snapshot)
        }
        await refreshPlayerTitles()
        hasLoadedCloudProgressRef.current = true
        setCloudSaveState('synced')
      } catch {
        if (!cancelled) setCloudSaveState('error')
      }
    }

    getCurrentUser()
      .then(async (user) => {
        if (cancelled) return
        setAuthUser(user)
        authUserRef.current = user
        if (!user) {
          setCloudSaveState('offline')
          setOwnedTitleIds([])
          setEquippedTitleId(null)
          return null
        }
        setDisplayName((current) => current || getUserDisplayName(user))
        setCloudSaveState('loading')
        const cloudProgress = await loadPlayerProgress({ scope: progressScope })
        if (cloudProgress) {
          rememberPersonalProgress(cloudProgress)
          skipNextCloudSaveRef.current = true
          applyProgressSnapshot(cloudProgress, { includeWorld: !hasSavedGuestSession(user.id) })
        } else {
          const snapshot = latestProgressRef.current ?? createCurrentProgressSnapshot()
          await savePlayerProgress(snapshot, { scope: progressScope })
          rememberPersonalProgress(snapshot)
        }
        await refreshPlayerTitles()
        hasLoadedCloudProgressRef.current = true
        setCloudSaveState('synced')
        return cloudProgress
      })
      .catch(() => {
        if (!cancelled) setCloudSaveState('offline')
      })

    const unsubscribe = onAuthStateChange(loadCloudProgress)
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [progressScope])

  useEffect(() => {
    if (!isSupabaseConfigured || !authUser || !hasLoadedCloudProgressRef.current) return undefined
    if (skipNextCloudSaveRef.current) {
      skipNextCloudSaveRef.current = false
      return undefined
    }

    if (cloudSaveTimeoutRef.current) window.clearTimeout(cloudSaveTimeoutRef.current)
    setCloudSaveState('saving')
    cloudSaveTimeoutRef.current = window.setTimeout(() => {
      const snapshot = isGuestVisit
        ? createPersonalProgressSnapshot()
        : latestProgressRef.current ?? createCurrentProgressSnapshot()
      savePlayerProgress(snapshot, { scope: progressScope })
        .then(() => {
          if (isGuestVisit) rememberPersonalProgress(snapshot)
          setCloudSaveState('synced')
        })
        .catch(() => setCloudSaveState('error'))
    }, 800)

    return () => {
      if (cloudSaveTimeoutRef.current) window.clearTimeout(cloudSaveTimeoutRef.current)
    }
  }, [isGuestVisit, authUser, progressScope, displayName, coins, ownedSkins, selectedSkinId, roomLightOn, lightColor, lightIntensity, ownedFloorSkins, ownedWallSkins, selectedFloorSkinId, selectedWallSkinId, applyWallToCeiling, editableObjects, ownedCat, catActive, ownedMagicBook, ownedMagicSkull, magicSkullDiscovered, unlockedAchievements, mobKillCount, ownedMounts, equippedWeapon, equippedTitleId, characterAppearance, friends, questProgress, materials])

  useEffect(() => {
    const saveBeforeLeaving = () => {
      if (document.visibilityState === 'hidden') {
        saveCurrentProgressToCloud()
      }
    }
    const saveOnPageHide = () => {
      saveCurrentProgressToCloud()
    }

    document.addEventListener('visibilitychange', saveBeforeLeaving)
    window.addEventListener('pagehide', saveOnPageHide)
    return () => {
      document.removeEventListener('visibilitychange', saveBeforeLeaving)
      window.removeEventListener('pagehide', saveOnPageHide)
    }
  }, [progressScope])

  useEffect(() => {
    const interval = window.setInterval(() => {
      const now = Date.now()
      setScorePopups((previous) => previous.filter((popup) => now < popup.startAt + popup.duration))
    }, 120)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    return () => {
      if (playerRespawnTimerRef.current) window.clearTimeout(playerRespawnTimerRef.current)
    }
  }, [])

  useEffect(() => {
    const preventContextMenu = (event) => event.preventDefault()
    window.addEventListener('contextmenu', preventContextMenu)
    return () => window.removeEventListener('contextmenu', preventContextMenu)
  }, [])

  const handleBallRespawn = () => {
    const ball = ballRef.current
    if (!ball) return

    const gx = goalObject.position?.[0] ?? 0
    const gy = goalObject.position?.[1] ?? 0
    const gz = goalObject.position?.[2] ?? 0
    const rotY = goalObject.rotationY ?? 0
    const BALL_FORWARD_OFFSET = 3.5
    const spawnX = gx + Math.sin(rotY) * BALL_FORWARD_OFFSET
    const spawnZ = gz + Math.cos(rotY) * BALL_FORWARD_OFFSET
    const goalInside = isGoalInsideHouse(goalObject.position)
    const groundY = goalInside ? 0 : getTerrainHeight(spawnX, spawnZ)
    ball.setTranslation({
      x: spawnX,
      y: Math.max(gy + 1.2, groundY + 0.5),
      z: spawnZ,
    }, true)
    ball.setLinvel({ x: 0, y: 0, z: 0 }, true)
    ball.setAngvel({ x: 0, y: 0, z: 0 }, true)
    scoreCooldownRef.current = false
  }

  const handleOutOfBoundsRespawn = () => {
    if (outRespawnCooldownRef.current) return
    outRespawnCooldownRef.current = true
    if (respawnTimerRef.current) {
      clearTimeout(respawnTimerRef.current)
      respawnTimerRef.current = null
    }
    handleBallRespawn()
    window.setTimeout(() => {
      outRespawnCooldownRef.current = false
    }, 1200)
  }

  const handleGoal = () => {
    if (scoreCooldownRef.current) return
    if (isGuestVisit) return

    scoreCooldownRef.current = true

    const ball = ballRef.current
    const ballPosition = ball?.translation()
    const goalPosition = editableObjects.find((object) => object.id === 'goal_01')?.position ?? [0, 0, GOAL_Z]
    const popupPosition = [
      ballPosition?.x ?? 0,
      Math.max(0.9, ballPosition?.y ?? 0.9),
      ballPosition?.z ?? goalPosition[2] - 0.55,
    ]
    applyCoinDelta(GOAL_POINTS, { reason: 'goal', position: popupPosition })
    setScorePopups((previous) => [
      ...previous,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        value: GOAL_POINTS,
        x: popupPosition[0],
        y: popupPosition[1],
        z: popupPosition[2],
        startAt: Date.now(),
        duration: 620,
      },
    ])

    if (respawnTimerRef.current) clearTimeout(respawnTimerRef.current)
    respawnTimerRef.current = setTimeout(() => {
      respawnTimerRef.current = null
      handleBallRespawn()
    }, 1000)
  }

  const handleTrainingDummyDefeated = async ({ position, reward = 50 }) => {
    const popupPosition = [position?.[0] ?? 0, (position?.[1] ?? 0) + 1.55, position?.[2] ?? 0]
    const rewarded = await applyCoinDelta(reward, { reason: 'training_dummy', position: popupPosition })
    if (!rewarded) return

    setScorePopups((previous) => [
      ...previous,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        value: reward,
        x: popupPosition[0],
        y: popupPosition[1],
        z: popupPosition[2],
        startAt: Date.now(),
        duration: 700,
      },
    ])
  }

  const handleSmallEnemyDefeated = async ({ enemyId, position, reward = MUSHROOM_ENEMY_REWARD_COINS, mobType = null }) => {
    const popupPosition = [position?.[0] ?? 0, (position?.[1] ?? 0) + 1.05, position?.[2] ?? 0]
    const rewarded = await applyCoinDelta(reward, { reason: 'enemy_defeat', position: popupPosition })
    if (!rewarded) return

    // Hauts faits : compteur de kills + type de monstre
    setMobKillCount((current) => current + 1)
    if (typeof enemyId === 'string' && enemyId.includes('skeleton')) unlockAchievement('kill_skeleton')

    // Progression des quêtes : avance les objectifs "tuer N <type>" actifs.
    if (mobType) setQuestProgress((prev) => registerKill(prev, mobType))

    // Loot : tirage par type de monstre. Les objets tombent au sol (LootDrops)
    // puis sont aimantés/absorbés par le joueur, où ils rejoignent l'inventaire.
    if (mobType) {
      const drops = rollLoot(mobType)
      if (drops.length) {
        const base = [position?.[0] ?? 0, position?.[1] ?? 0, position?.[2] ?? 0]
        const born = performance.now()
        setLootDrops((prev) => {
          const additions = drops.map((itemId, index) => ({
            id: `drop-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`,
            itemId,
            from: [
              base[0] + (Math.random() - 0.5) * 0.6,
              base[1] + 0.1,
              base[2] + (Math.random() - 0.5) * 0.6,
            ],
            bornAt: born,
          }))
          const merged = [...prev, ...additions]
          return merged.length > LOOT_DROP_MAX ? merged.slice(merged.length - LOOT_DROP_MAX) : merged
        })
      }
    }

    if (!isAdminMode && !isGuestVisit && authUserRef.current) {
      try {
        const rewardResult = await claimFirstMobDefeatRewards({ scope: progressScope })
        if (rewardResult?.titleUnlocked) {
          const title = getTitleDefinition('first_mob_slayer_founder')
          await refreshPlayerTitles()
          setAuthMessage(`Titre rare obtenu: ${title?.name ?? 'Chasseur Originel'} #${rewardResult.claimNumber}.`)
          showAchievementToast({
            titleName: title?.name ?? 'Chasseur Originel',
            claimNumber: rewardResult.claimNumber,
          })
        } else if (rewardResult?.reason === 'limit_reached') {
          setAuthMessage('Premier monstre vaincu. Les 50 titres limites ont deja ete attribues.')
        } else if (rewardResult?.reason === 'already_claimed') {
          await refreshPlayerTitles()
        }
      } catch (error) {
        setCloudSaveState('error')
        const message = `${error?.message ?? ''} ${error?.details ?? ''} ${error?.hint ?? ''}`
        const readableMessage = message.trim() || 'erreur inconnue'
        setAuthMessage(
          message.includes('claim_first_mob_defeat_rewards') || message.includes('Could not find the function')
            ? 'Haut fait indisponible: lance le SQL Supabase mis a jour.'
            : `Haut fait indisponible: ${readableMessage}`,
        )
      }
    } else if (!isAdminMode && !isGuestVisit && !authUserRef.current) {
      setAuthMessage('Connecte ton compte pour debloquer les hauts faits limites.')
    }

    setScorePopups((previous) => [
      ...previous,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        value: reward,
        x: popupPosition[0],
        y: popupPosition[1],
        z: popupPosition[2],
        startAt: Date.now(),
        duration: 700,
      },
    ])
  }

  // --- Quêtes : accepter / terminer (logique pure dans src/quests/questState.js)
  const acceptQuest = (questId) => {
    setQuestProgress((prev) => startQuest(prev, questId))
  }

  const completeQuest = async (questId) => {
    // Garde anti-triche : on ne récompense que si les objectifs sont réellement
    // atteints (la source de vérité reste l'état sérialisé + Supabase).
    if (!isReadyToComplete(questProgress, questId)) return
    const def = getQuestDefinition(questId)
    const rewardCoins = def?.reward?.coins ?? 0
    if (rewardCoins > 0) {
      const p = playerPositionRef.current
      await applyCoinDelta(rewardCoins, {
        reason: 'quest_reward',
        position: p ? [p.x, p.y + 1.4, p.z] : undefined,
      })
    }
    setQuestProgress((prev) => completeQuestState(prev, questId))
    setQuestDialogOpen(false)
  }

  // --- Marchand : revente des matériaux lootés (logique pure dans materialsInventory)
  const sellMaterialsForCoins = async (result) => {
    if (!result || result.coins <= 0) return
    const p = playerPositionRef.current
    const rewarded = await applyCoinDelta(result.coins, {
      reason: 'vendor_sell',
      position: p ? [p.x, p.y + 1.4, p.z] : undefined,
    })
    if (!rewarded) return // on ne retire pas les objets si le crédit a échoué
    setMaterials(result.materials)
  }

  const handleSellItem = (itemId, quantity) => sellMaterialsForCoins(sellItem(materials, itemId, quantity))
  const handleSellAll = () => sellMaterialsForCoins(sellAll(materials))

  // Un objet au sol disparaît (durée de vie écoulée, jamais ramassé).
  const expireLootDrop = (dropId) => {
    setLootDrops((prev) => prev.filter((drop) => drop.id !== dropId))
  }

  // Le joueur absorbe un objet au sol : il rejoint l'inventaire + petit popup.
  const absorbLootDrop = (dropId, itemId) => {
    setLootDrops((prev) => prev.filter((drop) => drop.id !== dropId))
    setMaterials((prev) => addItems(prev, [itemId]))
    const p = playerPositionRef.current
    setScorePopups((previous) => [
      ...previous,
      {
        id: `lootpop-${dropId}`,
        label: `+1 ${getItemDefinition(itemId)?.emoji ?? '📦'}`,
        x: p?.x ?? 0,
        y: (p?.y ?? 0) + 1.3,
        z: p?.z ?? 0,
        startAt: Date.now(),
        duration: 700,
      },
    ])
  }

  const stopPlayerRegeneration = useCallback(() => {
    if (playerRegenDelayRef.current) {
      window.clearTimeout(playerRegenDelayRef.current)
      playerRegenDelayRef.current = null
    }
    if (playerRegenIntervalRef.current) {
      window.clearInterval(playerRegenIntervalRef.current)
      playerRegenIntervalRef.current = null
    }
    setPlayerHealing(false)
  }, [])

  const schedulePlayerRegeneration = useCallback(() => {
    stopPlayerRegeneration()
    playerRegenDelayRef.current = window.setTimeout(() => {
      playerRegenDelayRef.current = null
      if (playerHpRef.current <= 0 || playerHpRef.current >= PLAYER_MAX_HP) return

      setPlayerHealing(true)
      const healTick = () => {
        const nextHp = Math.min(PLAYER_MAX_HP, playerHpRef.current + PLAYER_REGEN_HP_PER_TICK)
        playerHpRef.current = nextHp
        setPlayerHp(nextHp)

        if (nextHp >= PLAYER_MAX_HP) {
          if (playerRegenIntervalRef.current) {
            window.clearInterval(playerRegenIntervalRef.current)
          }
          playerRegenIntervalRef.current = null
          setPlayerHealing(false)
        }
      }

      healTick()
      if (playerHpRef.current < PLAYER_MAX_HP) {
        playerRegenIntervalRef.current = window.setInterval(healTick, PLAYER_REGEN_TICK_MS)
      }
    }, PLAYER_REGEN_DELAY_MS)
  }, [stopPlayerRegeneration])

  useEffect(() => () => {
    if (playerRegenDelayRef.current) window.clearTimeout(playerRegenDelayRef.current)
    if (playerRegenIntervalRef.current) window.clearInterval(playerRegenIntervalRef.current)
  }, [])

  const handlePlayerHit = useCallback(({ damage = MUSHROOM_ENEMY_ATTACK_DAMAGE, sourceId = null } = {}) => {
    // Agression subie : les squelettes invoqués focalisent l'agresseur.
    if (sourceId) playerTargetIdRef.current = sourceId
    if (playerDamageLockRef.current || playerHpRef.current <= 0) return false
    playerDamageLockRef.current = true
    window.setTimeout(() => {
      playerDamageLockRef.current = false
    }, PLAYER_DAMAGE_INVULNERABILITY_MS)

    stopPlayerRegeneration()
    const nextHp = Math.max(0, playerHpRef.current - damage)
    playerHpRef.current = nextHp
    setPlayerHp(nextHp)

    if (nextHp > 0) {
      schedulePlayerRegeneration()
    } else if (!playerRespawnTimerRef.current) {
      playerRespawnTimerRef.current = window.setTimeout(() => {
        playerRespawnTimerRef.current = null
        playerDamageLockRef.current = false
        playerHpRef.current = PLAYER_MAX_HP
        setPlayerHp(PLAYER_MAX_HP)
        const spawn = PLAYER_SPAWNS.outside
        setSpawnRequest({ zone: ZONES.outside, position: spawn, token: Date.now() })
        touchRef.current.moveX = 0
        touchRef.current.moveY = 0
        touchRef.current.actionQueued = false
        touchRef.current.emoteQueued = null
      }, 900)
    }

    return true
  }, [schedulePlayerRegeneration, stopPlayerRegeneration])

  const handleBallZoneEnter = () => {
    if (scoreCooldownRef.current) return
    handleGoal()
  }

  const handleBallZoneExit = () => {}

  const previewIndex = Math.max(0, ballSkins.findIndex((skin) => skin.id === previewSkinId))
  const activeSkinId = isSkinMenuOpen ? previewSkinId : selectedSkinId
  const activeSkin = ballSkins.find((skin) => skin.id === activeSkinId) || ballSkins[0]
  const equippedTitle = getTitleDefinition(equippedTitleId)
  const achievementProgress = useMemo(() => ({
    mobKills: mobKillCount,
    coins,
    furniture: editableObjects.filter((object) => objectCatalog[object.objectId]?.category === 'furniture').length,
  }), [mobKillCount, coins, editableObjects])
  const showLocalNameplate = mode !== 'customize' &&
    (isMultiplayerSession || soloNameplateVisible) &&
    (authUser || displayName || equippedTitle)
  const remoteUserId = multiplayerRole === 'host'
    ? multiplayerSession?.guestUserId
    : multiplayerRole === 'guest'
      ? multiplayerSession?.hostUserId
      : null
  const remotePresenceTitleId = onlinePlayers.find((player) => player.userId === remoteUserId)?.equippedTitleId ?? null
  const availableWallSkins = (isAdminMode || isLocalNetwork) ? wallSkins : wallSkins.filter((skin) => !skin.adminOnly)
  const previewFloorIndex = Math.max(0, floorSkins.findIndex((skin) => skin.id === previewFloorSkinId))
  const previewWallIndex = Math.max(0, availableWallSkins.findIndex((skin) => skin.id === previewWallSkinId))
  const activeFloorSkinId = isEnvironmentMenuOpen ? previewFloorSkinId : selectedFloorSkinId
  const activeWallSkinId = isEnvironmentMenuOpen ? previewWallSkinId : selectedWallSkinId
  const activeFloorSkin = floorSkins.find((skin) => skin.id === activeFloorSkinId) || floorSkins[0]
  const activeWallSkin = availableWallSkins.find((skin) => skin.id === activeWallSkinId) || wallSkins[0]
  const activeCeilingTexturePath = applyWallToCeiling ? activeWallSkin.texture : DEFAULT_CEILING_TEXTURE
  const goalObject = editableObjects.find((object) => object.id === 'goal_01') || defaultEditableObjects[0]
  const placedEditableObjects = editableObjects.filter((object) => object.status !== 'stored')
  const selectedObject = editableObjects.find((object) => object.id === selectedObjectId)
  const inventoryCards = getInventoryCards(editableObjects)
  const showCaptureUi = shaderWarmupComplete && (!(isAdminMode || isVerticalFrameMode) || !captureUiHidden)
  const blocksBottomGameChat = isSkinMenuOpen || isEnvironmentMenuOpen || isCharacterMenuOpen || isCustomizationChoiceOpen || isWeaponMenuOpen || isAccountOpen || isLightMenuOpen
  const furnitureShopItems = shopObjectIds.map((objectId) => objectCatalog[objectId]).filter(Boolean)
  const furnitureInventoryObjects = isGuestVisit && personalProgressVersion >= 0
    ? personalProgressRef.current?.editableObjects ?? []
    : editableObjects
  const furnitureCounts = furnitureInventoryObjects.reduce((counts, object) => {
    if (shopObjectIds.includes(object.objectId)) {
      counts[object.objectId] = (counts[object.objectId] ?? 0) + 1
    }
    return counts
  }, {})

  const openSkinMenu = () => {
    setPreviewSkinId(selectedSkinId)
    setIsCharacterMenuOpen(false)
    setIsCustomizationChoiceOpen(false)
    setIsSkinMenuOpen(true)
  }

  const closeSkinMenu = () => {
    setPreviewSkinId(selectedSkinId)
    setIsSkinMenuOpen(false)
  }
  const openEnvironmentMenu = () => {
    setEnvironmentTab('floor')
    setPreviewFloorSkinId(selectedFloorSkinId)
    setPreviewWallSkinId(selectedWallSkinId)
    setIsCharacterMenuOpen(false)
    setIsCustomizationChoiceOpen(false)
    setIsEnvironmentMenuOpen(true)
  }
  const closeEnvironmentMenu = () => {
    setPreviewFloorSkinId(selectedFloorSkinId)
    setPreviewWallSkinId(selectedWallSkinId)
    setIsEnvironmentMenuOpen(false)
  }

  const addFurnitureToCart = (objectId) => {
    const item = objectCatalog[objectId]
    if (!item || !shopObjectIds.includes(objectId)) return
    setFurnitureCart((current) => {
      const currentTotal = current.reduce((total, entry) => {
        const cartItem = objectCatalog[entry.objectId]
        return total + (cartItem?.price ?? 0) * entry.quantity
      }, 0)
      if (!isAdminMode && currentTotal + item.price > coins) return current
      const existing = current.find((entry) => entry.objectId === objectId)
      if (existing) {
        return current.map((entry) => (
          entry.objectId === objectId
            ? { ...entry, quantity: entry.quantity + 1 }
            : entry
        ))
      }
      return [...current, { objectId, quantity: 1 }]
    })
  }

  const removeFurnitureFromCart = (objectId) => {
    setFurnitureCart((current) => current.flatMap((entry) => {
      if (entry.objectId !== objectId) return [entry]
      if (entry.quantity <= 1) return []
      return [{ ...entry, quantity: entry.quantity - 1 }]
    }))
  }

  const checkoutFurnitureCart = async () => {
    if (furnitureCart.length === 0) return
    const instances = []
    let total = 0
    for (const entry of furnitureCart) {
      const item = objectCatalog[entry.objectId]
      if (!item || !shopObjectIds.includes(entry.objectId)) return
      total += item.price * entry.quantity
      for (let index = 0; index < entry.quantity; index += 1) {
        const object = createEditableObjectInstance(entry.objectId)
        if (!object) return
        instances.push(object)
      }
    }
    if (!isAdminMode && coins < total) return
    const paid = isAdminMode ? true : await applyCoinDelta(-total)
    if (!paid) return
    if (isGuestVisit) {
      const previousPersonal = personalProgressRef.current ?? {}
      const nextEditableObjects = [
        ...(Array.isArray(previousPersonal.editableObjects) ? previousPersonal.editableObjects : defaultEditableObjects),
        ...instances.map((object) => ({ ...object, status: 'stored', position: null })),
      ]
      const nextPersonal = createPersonalProgressSnapshot({
        ...previousPersonal,
        editableObjects: nextEditableObjects,
      })
      rememberPersonalProgress(nextPersonal)
      try {
        localStorage.setItem(progressStorageKey, JSON.stringify(nextPersonal))
        if (isSupabaseConfigured && authUserRef.current && hasLoadedCloudProgressRef.current) {
          await savePlayerProgress(nextPersonal, { scope: progressScope })
          setCloudSaveState('synced')
        }
      } catch {
        setCloudSaveState('error')
      }
      setFurnitureCart([])
      setEnvironmentTab('furniture')
      return
    }
    setEditableObjects((current) => [...current, ...instances])
    setFurnitureCart([])
    setEnvironmentTab('furniture')
  }

  const openCustomizationChoice = () => {
    if (!canModifyWorld) return
    setIsSkinMenuOpen(false)
    setIsEnvironmentMenuOpen(false)
    setIsCharacterMenuOpen(false)
    setIsCustomizationChoiceOpen(true)
  }

  const openCharacterCustomizationFromBag = () => {
    if (!PUBLIC_BUILD_FLAGS.showCharacterCustomization) return
    setIsWeaponMenuOpen(false)
    setIsCharacterMenuOpen(true)
  }

  const goPreview = (direction) => {
    const current = Math.max(0, ballSkins.findIndex((skin) => skin.id === previewSkinId))
    const next = (current + direction + ballSkins.length) % ballSkins.length
    setPreviewSkinId(ballSkins[next].id)
  }
  const goEnvironmentPreview = (direction) => {
    if (environmentTab === 'floor') {
      const current = Math.max(0, floorSkins.findIndex((skin) => skin.id === previewFloorSkinId))
      const next = (current + direction + floorSkins.length) % floorSkins.length
      setPreviewFloorSkinId(floorSkins[next].id)
      return
    }
    const current = Math.max(0, availableWallSkins.findIndex((skin) => skin.id === previewWallSkinId))
    const next = (current + direction + availableWallSkins.length) % availableWallSkins.length
    setPreviewWallSkinId(availableWallSkins[next].id)
  }

  const buyPreviewSkin = async () => {
    const skin = ballSkins[previewIndex]
    if (ownedSkins.includes(skin.id)) return
    if (!isAdminMode && coins < skin.price) return
    const paid = isAdminMode ? true : await applyCoinDelta(-skin.price)
    if (!paid) return
    setOwnedSkins((current) => [...current, skin.id])
  }

  const selectPreviewSkin = () => {
    const skin = ballSkins[previewIndex]
    if (!ownedSkins.includes(skin.id)) return
    setSelectedSkinId(skin.id)
    setIsSkinMenuOpen(false)
  }
  const buyPreviewEnvironmentSkin = async () => {
    const skin = environmentTab === 'floor' ? floorSkins[previewFloorIndex] : availableWallSkins[previewWallIndex]
    const owned = environmentTab === 'floor' ? ownedFloorSkins : ownedWallSkins
    if (owned.includes(skin.id)) return
    if (!isAdminMode && coins < skin.price) return
    const paid = isAdminMode ? true : await applyCoinDelta(-skin.price)
    if (!paid) return
    if (environmentTab === 'floor') {
      setOwnedFloorSkins((current) => [...current, skin.id])
    } else {
      setOwnedWallSkins((current) => [...current, skin.id])
    }
  }
  const selectPreviewEnvironmentSkin = () => {
    if (!canModifyWorld) return
    if (environmentTab === 'floor') {
      const skin = floorSkins[previewFloorIndex]
      if (!ownedFloorSkins.includes(skin.id)) return
      setSelectedFloorSkinId(skin.id)
      return
    }
    const skin = availableWallSkins[previewWallIndex]
    if (!ownedWallSkins.includes(skin.id)) return
    setSelectedWallSkinId(skin.id)
  }

  const buyCat = async () => {
    if (ownedCat) return
    if (!isAdminMode && coins < 500) return
    const paid = isAdminMode ? true : await applyCoinDelta(-500)
    if (!paid) return
    setOwnedCat(true)
  }

  const buyMagicBook = async () => {
    if (ownedMagicBook) return
    if (!isAdminMode && coins < MAGIC_BOOK_PRICE) return
    const paid = isAdminMode ? true : await applyCoinDelta(-MAGIC_BOOK_PRICE)
    if (!paid) return
    setOwnedMagicBook(true)
  }

  const completeMagicSkullLearning = useCallback(() => {
    if (magicSkullDiscovered) return
    if (currentZone !== ZONES.outside) return
    setMagicSkullDiscovered(true)
    setIsNearMagicSkullDiscovery(false)
    setIsLearningMagicSkull(false)
    setMagicSkullLearnProgress(0)
    showAchievementToast({
      kind: 'info',
      kicker: 'Pouvoir appris',
      name: 'Crane Necromancien',
      description: 'Il est maintenant disponible dans la boutique.',
    })
  }, [currentZone, magicSkullDiscovered, showAchievementToast])

  const cancelMagicSkullLearning = useCallback(() => {
    if (magicSkullLearnTimerRef.current) {
      window.clearInterval(magicSkullLearnTimerRef.current)
      magicSkullLearnTimerRef.current = null
    }
    setIsLearningMagicSkull(false)
    setMagicSkullLearnProgress(0)
  }, [])

  const learnMagicSkull = useCallback(() => {
    if (magicSkullDiscovered || isLearningMagicSkull) return
    if (magicSkullLearnTimerRef.current) return
    if (currentZone !== ZONES.outside || !isNearMagicSkullDiscovery) return

    const startedAt = Date.now()
    setIsLearningMagicSkull(true)
    setMagicSkullLearnProgress(0)
    magicSkullLearnTimerRef.current = window.setInterval(() => {
      const progress = Math.min(1, (Date.now() - startedAt) / MAGIC_SKULL_DISCOVERY_CHARGE_MS)
      setMagicSkullLearnProgress(progress)
      if (progress < 1) return
      if (magicSkullLearnTimerRef.current) {
        window.clearInterval(magicSkullLearnTimerRef.current)
        magicSkullLearnTimerRef.current = null
      }
      completeMagicSkullLearning()
    }, 50)
  }, [completeMagicSkullLearning, currentZone, isLearningMagicSkull, isNearMagicSkullDiscovery, magicSkullDiscovered])

  useEffect(() => (
    () => {
      if (magicSkullLearnTimerRef.current) {
        window.clearInterval(magicSkullLearnTimerRef.current)
        magicSkullLearnTimerRef.current = null
      }
    }
  ), [])

  useEffect(() => {
    if (!isLearningMagicSkull) return
    if (mode !== 'play' || currentZone !== ZONES.outside || magicSkullDiscovered || !isNearMagicSkullDiscovery) {
      cancelMagicSkullLearning()
    }
  }, [cancelMagicSkullLearning, currentZone, isLearningMagicSkull, isNearMagicSkullDiscovery, magicSkullDiscovered, mode])

  const buyMagicSkull = async () => {
    if (ownedMagicSkull) return
    if (!magicSkullDiscovered && !isAdminMode) return
    if (!isAdminMode && coins < MAGIC_SKULL_PRICE) return
    const paid = isAdminMode ? true : await applyCoinDelta(-MAGIC_SKULL_PRICE)
    if (!paid) return
    setMagicSkullDiscovered(true)
    setOwnedMagicSkull(true)
  }

  const handleSummonExpire = useCallback((index) => {
    const slotRef = summonSlotRefs.current[index]
    if (slotRef) slotRef.current = null
  }, [])

  const summonSkeletons = useCallback(() => {
    if (mode !== 'play') return
    if (equippedWeapon !== 'magic_skull') return
    const now = Date.now()
    if (now < summonCooldownRef.current) return // réinvocation verrouillée

    const pos = playerPositionRef.current
    const baseYaw = playerBodyYawRef.current
    const expiresAt = now + SUMMON_SKELETON_DURATION_MS
    const outdoor = currentZone === ZONES.outside
    const spread = 0.6
    const distance = 1.5
    // Remplit les slots du pool (squelettes déjà montés → pas de freeze)
    summonSlotRefs.current.forEach((slotRef, index) => {
      const angle = baseYaw + (index - (SUMMON_SKELETON_COUNT - 1) / 2) * spread
      const sx = pos.x - Math.sin(angle) * distance
      const sz = pos.z - Math.cos(angle) * distance
      const sy = outdoor ? getTerrainHeight(sx, sz) : 0
      slotRef.current = {
        spawnPosition: [sx, sy, sz],
        expiresAt,
        outdoor,
        token: `${now}_${index}`,
      }
    })
    // Verrou : durée d'invocation + délai supplémentaire avant de réinvoquer
    summonCooldownRef.current = expiresAt + SUMMON_RECAST_EXTRA_MS
    setSummonCooldownUntil(summonCooldownRef.current)
    unlockAchievement('first_summon')
  }, [mode, equippedWeapon, currentZone, unlockAchievement])

  const buyMount = async (mountId) => {
    const mount = getMountConfig(mountId)
    if (!mount) return
    if (ownedMounts.includes(mount.id)) return
    if (!isAdminMode && coins < mount.price) return
    const paid = isAdminMode ? true : await applyCoinDelta(-mount.price)
    if (!paid) return
    preloadMountModel(mount.id)
    setOwnedMounts((current) => (
      current.includes(mount.id) ? current : [...current, mount.id]
    ))
  }

  const startCharge = useCallback(() => {
    if (mode !== 'play') return
    if (equippedWeapon !== 'magic_book') return
    if (isChargingRef.current) return
    if (Date.now() - fireballCooldownRef.current < FIREBALL_COOLDOWN_MS) return
    if (projectilesRef.current.length >= MAX_ACTIVE_FIREBALLS) return
    isChargingRef.current = true
    setIsCharging(true)
    chargeStartTimeRef.current = Date.now()
    chargeProgressRef.current = 0
    setChargeProgress(0)
    const pos = playerPositionRef.current
    chargePosRef.current = { x: pos.x, z: pos.z }
    chargeYawRef.current = playerBodyYawRef.current + Math.PI // +π car conventions opposées entre body yaw et direction fireball
  }, [mode, equippedWeapon])

  const launchFromCharge = useCallback(() => {
    isChargingRef.current = false
    setIsCharging(false)
    chargeProgressRef.current = 0
    setChargeProgress(0)
    if (projectilesRef.current.length >= MAX_ACTIVE_FIREBALLS) return
    const now = Date.now()
    fireballCooldownRef.current = now
    const pos = playerPositionRef.current
    const yaw = chargeAimYawRef.current // direction clampée dans le cône
    const projectile = {
      id: `fb_${now}_${Math.random().toString(36).slice(2, 6)}`,
      x: pos.x - Math.sin(yaw) * 0.85,
      y: pos.y + 0.3,
      z: pos.z - Math.cos(yaw) * 0.85,
      dirX: -Math.sin(yaw),
      dirZ: -Math.cos(yaw),
      startedAt: now,
      phase: Math.random() * Math.PI * 2,
    }
    projectilesRef.current = [
      ...projectilesRef.current,
      projectile,
    ]
    multiplayerChannelRef.current?.sendSpellCast?.({
      id: projectile.id,
      kind: 'fireball',
      position: [projectile.x, projectile.y, projectile.z],
      direction: [projectile.dirX, projectile.dirZ],
      startedAt: projectile.startedAt,
      sentAt: Date.now(),
      phase: projectile.phase,
    })
  }, [])

  const cancelCharge = useCallback(() => {
    if (!isChargingRef.current) return
    isChargingRef.current = false
    setIsCharging(false)
    chargeProgressRef.current = 0
    setChargeProgress(0)
  }, [])

  // Route l'action de sort selon l'arme équipée : charge de boule de feu
  // (livre) ou invocation de squelettes (crâne nécromancien).
  const handleSpellPress = useCallback(() => {
    if (equippedWeapon === 'magic_skull') {
      summonSkeletons()
      return
    }
    startCharge()
  }, [equippedWeapon, summonSkeletons, startCharge])

  const toggleCat = () => {
    // Summoning your own pet is a personal action (not a world edit), so it is
    // allowed while visiting too — the other player sees it via networked state.
    if (mode !== 'play') return
    if (!ownedCat) return
    setCatActive((v) => !v)
  }

  const toggleMount = (mountId) => {
    if (mode !== 'play') return
    if (!ownedMounts.includes(mountId)) return
    // Already mounted: a click on the active mount dismisses it; a click on a
    // different mount swaps to it (only when landed).
    if (mountedMountId) {
      const pos = dragonRidePositionRef.current
      const groundY = currentZone === ZONES.outside ? getTerrainHeight(pos.x, pos.z) : 0
      if (pos.y - groundY > 0.15) return
      if (mountId === mountedMountId) {
        setMountedMountId(null)
        setSpawnRequest({
          zone: currentZone,
          position: [pos.x, groundY + PLAYER_HEIGHT, pos.z],
          token: Date.now(),
        })
        return
      }
    }

    const config = getMountConfig(mountId)
    if (!config) return
    preloadMountModel(mountId)

    const yaw = playerBodyYawRef.current
    const px = playerPositionRef.current.x
    const pz = playerPositionRef.current.z
    const spawnX = px
    const spawnZ = pz
    const groundY = currentZone === ZONES.outside ? getTerrainHeight(spawnX, spawnZ) : 0
    dragonRidePositionRef.current = { x: spawnX, y: groundY, z: spawnZ }
    dragonRideYawRef.current = yaw
    dragonRideAnimStateRef.current = {
      airborne: false,
      moving: false,
      movingForward: false,
    }
    dragonRideMountProfileRef.current.riderLift = config.riderLift
    dragonRideMountProfileRef.current.torsoLean = config.torsoLean
    dragonRideMountProfileRef.current.ready = false
    dragonRideMountProfileRef.current.handTargetsReady = false
    dragonRideMountProfileRef.current.handTargetsMeasured = false
    dragonRideMountProfileRef.current.seatHeightMeasured = false
    dragonRideRiderTransformRef.current.ready = false
    setMountedMountId(mountId)
  }

  const toggleCameraOnCat = useCallback(() => setCameraOnCat(v => !v), [])

  const requestSit = () => {
    if (!nearbySeat || mode !== 'play') return
    setSeatedState({ phase: 'sitDown', seat: nearbySeat })
    setNearbySeat(null)
  }

  const requestStandUp = () => {
    if (seatedState?.phase !== 'sitting') return
    setSeatedState({ phase: 'standUp', seat: seatedState.seat })
  }

  const requestTvMenu = () => {
    if (!canModifyWorld) return
    if (!nearbyTv) return
    window.dispatchEvent(new CustomEvent(TV_MENU_EVENT, { detail: { objectId: nearbyTv.id } }))
  }

  const registerCombatTarget = useCallback((id, target) => {
    if (!id || !target) return undefined
    combatTargetsRef.current.set(id, target)
    return () => {
      if (combatTargetsRef.current.get(id) === target) {
        combatTargetsRef.current.delete(id)
      }
    }
  }, [])

  const handleCombatHit = useCallback((hit) => {
    // Le joueur frappe : il devient la cible focalisée par les squelettes et
    // génère de la menace ('player') sur l'ennemi touché.
    playerTargetIdRef.current = hit.targetId
    const target = combatTargetsRef.current.get(hit.targetId)
    target?.takeDamage?.({ ...hit, attackerId: 'player' })
  }, [])

  // Le joueur est une cible d'aggro permanente (id 'player').
  useEffect(() => {
    const entry = {
      id: 'player',
      isPlayer: true,
      position: playerPositionRef.current,
      disabled: false,
      takeDamage: null,
    }
    allyTargetsRef.current.set('player', entry)
    return () => { allyTargetsRef.current.delete('player') }
  }, [])

  const transitionToZone = (nextZone) => {
    if (zoneFadeActive || currentZone === nextZone) return
    const goingOutside = nextZone === ZONES.outside
    setZoneFadeActive(true)
    if (goingOutside) {
      setOutdoorTransitionPrimed(true)
      setOutdoorContentStage((stage) => Math.max(stage, 1))
    }
    setIsNearOutdoorDoor(false)
    setIsNearSkinStation(false)
    setIsNearEnvironmentStation(false)
    setIsNearCustomizationStation(false)
    setIsNearMagicSkullDiscovery(false)
    setNearbySeat(null)
    setNearbyTv(null)
    setSeatedState(null)
    setMode('play')
    setIsSkinMenuOpen(false)
    setIsEnvironmentMenuOpen(false)
    setIsCharacterMenuOpen(false)
    setIsCustomizationChoiceOpen(false)
    setSelectedObjectId(null)
    setDraggingObjectId(null)
    setPlacingObjectId(null)
    setPlacementLocked(false)
    setPlacementPreview(null)
    window.setTimeout(() => {
      const spawn = PLAYER_SPAWNS[nextZone] ?? PLAYER_SPAWNS.interior
      setCurrentZone(nextZone)
      if (!goingOutside) {
        setOutdoorTransitionPrimed(false)
        setOutdoorContentStage(0)
      }
      setSpawnRequest({ zone: nextZone, position: spawn, token: Date.now() })
      touchRef.current.moveX = 0
      touchRef.current.moveY = 0
      touchRef.current.lookX = 0
      touchRef.current.lookY = 0
      touchRef.current.cameraDistance = CAMERA_SETTINGS[nextZone]?.distance ?? CAMERA_DISTANCE
      window.setTimeout(() => {
        setZoneFadeActive(false)
        if (goingOutside) setOutdoorTransitionPrimed(false)
      }, goingOutside ? OUTDOOR_EXIT_FADE_RELEASE_DELAY_MS : 180)
    }, goingOutside ? OUTDOOR_EXIT_ZONE_SWITCH_DELAY_MS : 180)
  }

  const requestOutdoorTransition = () => {
    transitionToZone(currentZone === ZONES.outside ? ZONES.interior : ZONES.outside)
  }

  const updateSeatedPhase = (phase) => {
    setSeatedState((current) => {
      if (!current) return null
      if (!phase) return null
      return { ...current, phase }
    })
  }

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.repeat) return
      if (getKeyboardKey(event) !== 'f') return
      const target = event.target
      const isTyping = target instanceof HTMLElement &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      if (isTyping) return
      event.preventDefault()
      handleSpellPress()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleSpellPress])

  useEffect(() => {
    const onKeyDown = (event) => {
      if (getKeyboardKey(event) !== 'e') return
      if (mode !== 'play') return
      if (isLearningMagicSkull) {
        event.preventDefault()
        return
      }
      if (isNearMagicSkullDiscovery && !magicSkullDiscovered) {
        event.preventDefault()
        learnMagicSkull()
        return
      }
      if (isNearOutdoorDoor) {
        event.preventDefault()
        requestOutdoorTransition()
        return
      }
      if (seatedState?.phase === 'sitting') {
        event.preventDefault()
        requestStandUp()
        return
      }
      if (nearbySeat && !seatedState?.phase) {
        event.preventDefault()
        requestSit()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [mode, isLearningMagicSkull, isNearMagicSkullDiscovery, magicSkullDiscovered, isNearOutdoorDoor, nearbySeat, seatedState, currentZone, zoneFadeActive, learnMagicSkull])

  const openCustomizationMode = () => {
    if (!canModifyWorld) return
    setIsSkinMenuOpen(false)
    setIsEnvironmentMenuOpen(false)
    setIsCharacterMenuOpen(false)
    setIsCustomizationChoiceOpen(false)
    setMode('customize')
    setSelectedObjectId(placedEditableObjects[0]?.id ?? null)
    setDraggingObjectId(null)
    setPlacingObjectId(null)
    setPlacementLocked(false)
    setPlacementPreview(null)
    setIsObjectInventoryOpen(false)
    setNearbySeat(null)
    setNearbyTv(null)
    setSeatedState(null)
  }

  const closeCustomizationMode = () => {
    setMode('play')
    setIsCustomizationChoiceOpen(false)
    setSelectedObjectId(null)
    setDraggingObjectId(null)
    setPlacingObjectId(null)
    setPlacementLocked(false)
    setPlacementPreview(null)
    setIsObjectInventoryOpen(false)
    setIsNearCustomizationStation(false)
  }

  const updateEditableObjectPosition = (id, position) => {
    if (!canModifyWorld) return
    setEditableObjects((current) =>
      current.map((object) => (object.id === id ? { ...object, position } : object)),
    )
  }

  const storeSelectedObject = () => {
    if (!canModifyWorld) return
    if (!selectedObject?.canStore) return
    setEditableObjects((current) =>
      current.map((object) =>
        object.id === selectedObject.id
          ? { ...object, status: 'stored', position: null }
          : object,
      ),
    )
    setSelectedObjectId(null)
    setDraggingObjectId(null)
  }

  const beginPlaceObject = (id) => {
    if (!canModifyWorld) return
    const object = editableObjects.find((nextObject) => nextObject.id === id)
    if (!object || object.status !== 'stored') return
    setSelectedObjectId(null)
    setDraggingObjectId(null)
    setPlacingObjectId(id)
    setPlacementLocked(false)
    setPlacementPreview({
      position: [0, 0, 0],
      rotationY: object.rotationY ?? 0,
      isValid: true,
    })
    setIsObjectInventoryOpen(false)
  }

  const updatePlacementPreview = (position) => {
    if (!canModifyWorld) return
    setPlacementPreview((current) => {
      if (!current) return current
      const [x, z] = clampToCustomRoom(position[0], position[2])
      return {
        ...current,
        position: [x, Number.isFinite(Number(position[1])) ? Number(position[1]) : 0, z],
        isValid: true,
      }
    })
  }

  const confirmPlacement = () => {
    if (!canModifyWorld) return
    if (!placingObjectId || !placementPreview?.isValid) return
    setEditableObjects((current) =>
      current.map((object) =>
        object.id === placingObjectId
          ? {
            ...object,
            status: 'placed',
            position: placementPreview.position,
            rotationY: placementPreview.rotationY,
          }
          : object,
      ),
    )
    setSelectedObjectId(placingObjectId)
    setPlacingObjectId(null)
    setPlacementLocked(false)
    setPlacementPreview(null)
  }

  const cancelPlacement = () => {
    setPlacingObjectId(null)
    setPlacementLocked(false)
    setPlacementPreview(null)
  }

  const rotateSelectedObject = (direction) => {
    if (!canModifyWorld) return
    const angle = Math.PI / 4
    if (placingObjectId) {
      setPlacementPreview((current) => (
        current ? { ...current, rotationY: current.rotationY + direction * angle } : current
      ))
      return
    }
    if (!selectedObjectId) return
    setEditableObjects((current) =>
      current.map((object) => {
        if (object.id !== selectedObjectId || !object.canRotate) return object
        return { ...object, rotationY: object.rotationY + direction * angle }
      }),
    )
  }

  const requestVisitPlayer = async (player) => {
    if (!authUser || multiplayerRole !== 'solo') return
    if (outgoingVisitRequest?.expiresAt && new Date(outgoingVisitRequest.expiresAt).getTime() > Date.now()) return
    const request = {
      ...createVisitRequest({ fromUser: authUser, toUserId: player.userId }),
      toDisplayName: player.displayName,
    }
    setOutgoingVisitRequest(request)
    setVisitRequestNow(Date.now())
    setMultiplayerMessage(`Demande envoyee a ${player.displayName}.`)
    await onlinePresenceRef.current?.sendVisitRequest(request)
  }

  const cancelVisitRequest = async () => {
    const request = outgoingVisitRequest
    if (!request) return
    setOutgoingVisitRequest(null)
    setMultiplayerMessage('Demande annulee.')
    await onlinePresenceRef.current?.sendVisitCancel({
      requestId: request.id,
      toUserId: request.toUserId,
      fromUserId: authUser?.id,
    })
  }

  const acceptVisitRequest = async () => {
    if (!incomingVisitRequest || !authUser || multiplayerRole !== 'solo') return
    if (incomingVisitRequest.expiresAt && new Date(incomingVisitRequest.expiresAt).getTime() <= Date.now()) {
      setIncomingVisitRequest(null)
      setMultiplayerMessage('Demande de visite expiree.')
      return
    }
    await saveCurrentProgressToCloud()
    const session = createSessionFromRequest({
      ...incomingVisitRequest,
      toDisplayName: getVisiblePlayerName(displayName, authUser, 'Hote'),
    })
    session.worldSnapshot = latestProgressRef.current ?? createCurrentProgressSnapshot()
    const response = {
      accepted: true,
      requestId: incomingVisitRequest.id,
      toUserId: incomingVisitRequest.fromUserId,
      fromUserId: authUser.id,
      session,
    }
    setIncomingVisitRequest(null)
    setMultiplayerSession(session)
    setMultiplayerRole('host')
    setMode('play')
    setIsSkinMenuOpen(false)
    setIsEnvironmentMenuOpen(false)
    setSelectedObjectId(null)
    setDraggingObjectId(null)
    setPlacingObjectId(null)
    setPlacementPreview(null)
    setIsObjectInventoryOpen(false)
    setMultiplayerMessage(`${session.guestDisplayName} rejoint ton monde.`)
    await onlinePresenceRef.current?.sendVisitResponse(response)
  }

  const rejectVisitRequest = async () => {
    if (!incomingVisitRequest || !authUser) return
    await onlinePresenceRef.current?.sendVisitResponse({
      accepted: false,
      requestId: incomingVisitRequest.id,
      toUserId: incomingVisitRequest.fromUserId,
      fromUserId: authUser.id,
    })
    setIncomingVisitRequest(null)
    setMultiplayerMessage('Demande refusee.')
  }

  const selectSocialPlayer = (player) => {
    if (!player?.userId) return
    setSelectedSocialPlayerId(player.userId)
    setMainMenuTab('social')
  }

  const requestFriend = async (player) => {
    if (!authUser || !player?.userId) return
    if (friends.some((friend) => friend.userId === player.userId)) return
    if (pendingFriendRequests.some((request) => request.toUserId === player.userId)) return

    const request = {
      id: `friend-${authUser.id}-${player.userId}-${Date.now()}`,
      fromUserId: authUser.id,
      fromDisplayName: getVisiblePlayerName(displayName, authUser, 'Joueur'),
      toUserId: player.userId,
      toDisplayName: player.displayName,
      createdAt: new Date().toISOString(),
    }
    setPendingFriendRequests((current) => [...current, request])
    setMultiplayerMessage(`Demande d ami envoyee a ${player.displayName}.`)
    await onlinePresenceRef.current?.sendFriendRequest(request)
  }

  const acceptFriendRequest = async (request) => {
    if (!authUser || !request?.fromUserId) return
    const onlineFriend = onlinePlayers.find((player) => player.userId === request.fromUserId)
    addFriend({
      userId: request.fromUserId,
      displayName: onlineFriend?.displayName || request.fromDisplayName,
      lastSeenAt: onlineFriend?.onlineAt || null,
    })
    setIncomingFriendRequests((current) => current.filter((item) => item.id !== request.id))
    setMultiplayerMessage(`${request.fromDisplayName} est maintenant dans ta liste d'amis.`)
    await onlinePresenceRef.current?.sendFriendResponse({
      accepted: true,
      requestId: request.id,
      toUserId: request.fromUserId,
      fromUserId: authUser.id,
      fromDisplayName: getVisiblePlayerName(displayName, authUser, 'Joueur'),
    })
  }

  const rejectFriendRequest = async (request) => {
    if (!authUser || !request?.fromUserId) return
    setIncomingFriendRequests((current) => current.filter((item) => item.id !== request.id))
    setMultiplayerMessage('Demande d ami refusee.')
    await onlinePresenceRef.current?.sendFriendResponse({
      accepted: false,
      requestId: request.id,
      toUserId: request.fromUserId,
      fromUserId: authUser.id,
      fromDisplayName: getVisiblePlayerName(displayName, authUser, 'Joueur'),
    })
  }

  const leaveMultiplayerSession = async () => {
    if (multiplayerSession && authUser) {
      await multiplayerChannelRef.current?.sendSessionEnded({
        sessionId: multiplayerSession.id,
        hostUserId: multiplayerSession.hostUserId,
        guestUserId: multiplayerSession.guestUserId,
      })
      await onlinePresenceRef.current?.sendSessionEnded({
        sessionId: multiplayerSession.id,
        hostUserId: multiplayerSession.hostUserId,
        guestUserId: multiplayerSession.guestUserId,
        toUserId: authUser.id === multiplayerSession.hostUserId
          ? multiplayerSession.guestUserId
          : multiplayerSession.hostUserId,
      })
    }

    setMultiplayerRole('solo')
    setMultiplayerSession(null)
    remotePlayerStateRef.current = null
    remoteBallStateRef.current = null
    clearChatBubbles()
    if (hasRemotePlayerRef.current) { hasRemotePlayerRef.current = false; setHasRemotePlayer(false) }
    setIncomingVisitRequest(null)
    setOutgoingVisitRequest(null)
    setMultiplayerMessage('Visite terminee.')
    // Explicit leave: forget the session so a later reload won't try to rejoin.
    rejoinPendingRef.current = false
    try { if (authUser?.id) localStorage.removeItem(activeSessionStorageKey(authUser.id)) } catch { /* ignore */ }

    if (isGuestVisit) {
      try {
        const ownProgress = await loadPlayerProgress({ scope: progressScope })
        if (ownProgress) applyProgressSnapshot(ownProgress)
      } catch {}
    }
  }

  const submitChatMessage = (event) => {
    event.preventDefault()
    if (!isMultiplayerSession) return

    const text = chatInput.replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX_LENGTH)
    if (!text) return

    addChatBubble('local', { text })
    multiplayerChannelRef.current?.sendChatMessage?.(text)
    setChatInput('')
  }

  const pausePlayerControlsForChat = () => {
    touchRef.current.moveX = 0
    touchRef.current.moveY = 0
    touchRef.current.lookX = 0
    touchRef.current.lookY = 0
    touchRef.current.lookActive = false
    touchRef.current.actionQueued = false
    touchRef.current.punchQueued = false
    touchRef.current.kickQueued = false
    touchRef.current.emoteQueued = null
  }

  const completeShaderWarmup = useCallback(() => {
    setShaderWarmupComplete(true)
  }, [])

  const requestAccountSubmit = async (event) => {
    event.preventDefault()
    const email = authEmail.trim()
    const password = authPassword
    const pseudo = displayName.trim()
    if (!email) {
      setAuthMessage('Entre une adresse email valide.')
      return
    }
    if (authMode === 'signup' && pseudo.length < 2) {
      setAuthMessage("Choisis un pseudo d'au moins 2 caracteres.")
      return
    }
    if (password.length < 8) {
      setAuthMessage('Le mot de passe doit contenir au moins 8 caracteres.')
      return
    }
    const result = authMode === 'signup'
      ? await signUpWithPassword({ email, password, displayName: pseudo })
      : await signInWithPassword({ email, password })
    setAuthMessage(result.ok
      ? authMode === 'signup'
        ? result.needsEmailConfirmation
          ? 'Compte cree. Confirme ton email, ou desactive la confirmation dans Supabase pour le prototype.'
          : 'Compte cree et connecte.'
        : 'Connexion reussie.'
      : `Connexion impossible: ${result.error ?? 'erreur inconnue'}`)
  }

  const requestSignOut = async () => {
    await saveCurrentProgressToCloud()
    await signOut()
    setAuthUser(null)
    setAuthPassword('')
    setAuthMessage('')
    setCloudSaveState('offline')
    hasLoadedCloudProgressRef.current = false
    skipNextCloudSaveRef.current = false
    authUserRef.current = null
    resetGuestProgress()
  }

  const isFramedViewport = isAdminMode || isVerticalFrameMode
  const isOutsideZone = currentZone === ZONES.outside
  const outdoorContentMounted = isOutsideZone || outdoorTransitionPrimed
  const outdoorStaticReady = outdoorContentMounted && outdoorContentStage >= 1
  const outdoorVegetationReady = outdoorContentMounted && outdoorContentStage >= 2
  const outdoorObjectsReady = outdoorContentMounted && outdoorContentStage >= 3
  const outdoorGrassReady = isOutsideZone && outdoorContentStage >= 4
  const outdoorEnemiesReady = isOutsideZone && outdoorContentStage >= 5
  const showInteriorHouseDetails = !isOutsideZone
  const hasBottomInteractionPrompt = showCaptureUi && mode === 'play' && !isSkinMenuOpen && !isEnvironmentMenuOpen && !isCustomizationChoiceOpen && !isCharacterMenuOpen && (
    isNearOutdoorDoor ||
    (currentZone === ZONES.outside && isNearMagicSkullDiscovery && !magicSkullDiscovered) ||
    isNearSkinStation ||
    (currentZone !== ZONES.outside && isNearEnvironmentStation) ||
    (canModifyWorld && currentZone !== ZONES.outside && isNearCustomizationStation) ||
    Boolean(nearbyTv) ||
    Boolean(nearbySeat) ||
    seatedState?.phase === 'sitting'
  )
  const gameView = (
    <main className={`app app-${viewportOrientation}${isFramedViewport ? ' app-framed' : ''}${hasBottomInteractionPrompt ? ' app--bottom-interaction-prompt' : ''}`}>
      <div className={`canvas-wrap${isDebugMode && debugToggles.portrait ? ' debug-portrait' : ''}`}>
      <Canvas
        dpr={renderSettings.dpr}
        camera={{ fov: BASE_CAMERA_VERTICAL_FOV, position: [0, 2.4, 6], near: 0.1, far: 420 }}
        shadows={{ enabled: performanceSettings.shadows && (!isDebugMode || debugToggles.shadows), type: PCFShadowMap }}
        gl={{
          antialias: renderSettings.antialias && !performanceSettings.lowResolution,
          powerPreference: 'high-performance',
          stencil: true,
          depth: true,
        }}
        onCreated={({ gl }) => {
          gl.outputColorSpace = SRGBColorSpace
          gl.toneMapping = ACESFilmicToneMapping
          gl.toneMappingExposure = 1.1
          gl.debug.checkShaderErrors = new URLSearchParams(window.location.search).get('shaderDebug') === '1'
        }}
        resize={{ debounce: 80 }}
      >
        <ShaderWarmupGate onComplete={completeShaderWarmup} />
        {PERF_RUNTIME_WARMUP_RIG && <RuntimeWarmupRig />}
        <LayeredSceneRenderer currentZone={currentZone} />
        <AdaptiveCameraFov />
        <FreeCameraController active={isLocalNetwork && freeCameraActive} touchRef={touchRef} />
        {performanceSettings.autoQuality && <RenderQualityGovernor onScaleChange={setDynamicRenderScale} />}
        <RenderStatsProbe onStatsChange={setRenderStats} onRendererInfo={setRendererInfo} active={isDebugMode || performanceSettings.showFps} />
        <SceneAtmosphere currentZone={currentZone} playerPositionRef={playerPositionRef} />
        <MultiplayerBridge
          channelRef={multiplayerChannelRef}
          role={multiplayerRole}
          localUserId={authUser?.id}
          playerPositionRef={playerPositionRef}
          playerVelocityRef={playerVelocityRef}
          localPlayerStateRef={localPlayerStateRef}
          remoteBallStateRef={remoteBallStateRef}
          ballRef={ballRef}
          guestKickQueueRef={guestKickQueueRef}
          hostTimeOffsetRef={hostTimeOffsetRef}
          equippedTitleId={equippedTitleId}
          equippedWeapon={equippedWeapon}
          characterAppearance={characterAppearance}
          catActive={catActive}
          catNetworkStateRef={catNetworkStateRef}
        />
        <InteriorLighting
          active={currentZone !== ZONES.outside}
          hideCeiling={mode === 'customize'}
          roomLightOn={roomLightOn}
          lightColor={lightColor}
          lightIntensity={lightIntensity}
        />
        {(!isDebugMode || debugToggles.house) && (
        <Suspense fallback={null}>
        <Profiler id="PlayerHouse+Interior" onRender={recordRenderProfile}>
        <PlayerHouse exteriorVisible>
          <group>
            <HouseInterior
              floorTexturePath={activeFloorSkin.texture}
              wallTexturePath={activeWallSkin.texture}
              ceilingTexturePath={activeCeilingTexturePath}
              hideCeiling={mode === 'customize'}
              hideRoof={mode === 'customize' || currentZone !== ZONES.outside}
              exteriorOnly={currentZone === ZONES.outside}
            />
            <group visible={showInteriorHouseDetails} userData={{ debugCategory: 'house-interior' }}>
                <LightSwitch
                  isOn={roomLightOn}
                  isNear={isNearLightSwitch && canModifyWorld}
                  onOpen={() => canModifyWorld && setIsLightMenuOpen(true)}
                  mode={mode}
                />
                <Dragon playerPositionRef={playerPositionRef} visible={showInteriorHouseDetails} />
                <GlassContainmentRoom
                  roomLightOn={roomLightOn}
                  lightColor={lightColor}
                  lightweight={performanceSettings.lowResolution}
                />
            </group>
            {catActive && (
              <Cat
                playerPositionRef={playerPositionRef}
                playerVelocityRef={playerVelocityRef}
                currentZone={currentZone}
                catPositionRef={catPositionRef}
                catGroupRef={catGroupRef}
                onNetworkState={(nextState) => {
                  catNetworkStateRef.current = nextState
                }}
              />
            )}
            {activeMountConfig && (
              <MountedMount
                key={activeMountConfig.id}
                config={activeMountConfig}
                positionRef={dragonRidePositionRef}
                yawRef={dragonRideYawRef}
                animStateRef={dragonRideAnimStateRef}
                riderTransformRef={dragonRideRiderTransformRef}
                riderSocketRef={dragonRideSocketRef}
                mountProfileRef={dragonRideMountProfileRef}
                currentZone={currentZone}
              />
            )}
            {catActive && (isAdminMode || isVerticalFrameMode) && <CatTapDetector catPositionRef={catPositionRef} callbackRef={catTapCallbackRef} onToggle={toggleCameraOnCat} />}
            <group userData={{ debugCategory: 'interactions' }}>
              <OutdoorDoor />
              <OutdoorDoorStation isNear={isNearOutdoorDoor} currentZone={currentZone} />
              <BallStation isNear={isNearSkinStation} goalObject={goalObject} />
              <MagicSkullDiscovery
                discovered={magicSkullDiscovered}
                isNear={isNearMagicSkullDiscovery}
              />
              <group visible={showInteriorHouseDetails}>
                <EnvironmentStation isNear={isNearEnvironmentStation} />
                <CustomizationStation isNear={isNearCustomizationStation} />
              </group>
              <SeatTargetMarker seat={mode === 'play' && !seatedState?.phase ? nearbySeat : null} />
            </group>
          </group>
          <Defer level={6}>
          <CustomizationLayer
            mode={currentZone === ZONES.outside || !canModifyWorld ? 'play' : mode}
            objects={editableObjects}
            hideInteriorObjects={currentZone === ZONES.outside}
            selectedObjectId={selectedObjectId}
            draggingObjectId={draggingObjectId}
            placingObjectId={placingObjectId}
            placementLocked={placementLocked}
            placementPreview={placementPreview}
            onSelect={setSelectedObjectId}
            onStartDragging={setDraggingObjectId}
            onStopDragging={() => setDraggingObjectId(null)}
            onUpdatePosition={updateEditableObjectPosition}
            onUpdatePlacementPreview={updatePlacementPreview}
            onLockPlacement={() => setPlacementLocked(true)}
            registerCombatTarget={registerCombatTarget}
            onTrainingDummyDefeated={handleTrainingDummyDefeated}
          />
          </Defer>
        </PlayerHouse>
        </Profiler>
        </Suspense>
        )}
        <Profiler id="OutdoorNeighborhood" onRender={recordRenderProfile}>
        <Suspense fallback={null}>
        <group>
          <OutdoorNeighborhood
            lightingActive
            viewerOutside={isOutsideZone}
            playerPositionRef={playerPositionRef}
            ballRef={ballRef}
            showGrass={outdoorGrassReady && performanceSettings.grass && (!isDebugMode || debugToggles.grass)}
            showTrees={outdoorVegetationReady && performanceSettings.trees && (!isDebugMode || debugToggles.trees)}
            showTerrain
            showRoad={outdoorStaticReady}
            showNeighborHouses={outdoorStaticReady}
            showMapObjects={outdoorObjectsReady}
            preloadMapObjects={outdoorContentStage >= 3}
            showBiomeEffects={outdoorVegetationReady}
            showSky={outdoorStaticReady && performanceSettings.sky && (!isDebugMode || debugToggles.sky)}
            castShadows={performanceSettings.shadows && (!isDebugMode || debugToggles.shadows)}
            showPlayerPlot={isOutsideZone && isDebugMode && debugToggles.plot}
            debugStats={isDebugMode}
          />
        </group>
        </Suspense>
        </Profiler>
        {hasRemotePlayer && (
          <RemotePlayer
            stateRef={remotePlayerStateRef}
            label={multiplayerRole === 'host' ? multiplayerSession?.guestDisplayName : multiplayerSession?.hostDisplayName}
            fallbackTitleId={remotePresenceTitleId}
            transport={sessionTransport}
            currentZone={currentZone}
            serverTimeOffsetRef={hostTimeOffsetRef}
            chatBubblesRef={remoteChatBubblesRef}
            chatVersion={chatBubbleVersion}
            showOverlays={mode !== 'customize'}
          />
        )}
        {isMultiplayerSession && (
          <PlayerChatAnchor
            playerPositionRef={playerPositionRef}
            bubblesRef={localChatBubblesRef}
            version={chatBubbleVersion}
          />
        )}
        {showLocalNameplate && (
          <PlayerNameplateAnchor
            playerPositionRef={playerPositionRef}
            label={getVisiblePlayerName(displayName, authUser)}
            title={equippedTitle}
          />
        )}
        <Suspense fallback={null}>
        <Physics gravity={[0, -9.81, 0]}>
          <PhysicsBounds />
          <GlassContainmentColliders />
          <OutdoorBounds includeHouseFootprint={false} />
          {!PERF_NO_MAP_COLLIDERS && (
            <Profiler id="MapObjectPhysicsColliders" onRender={recordRenderProfile}>
              <MapObjectPhysicsColliders />
            </Profiler>
          )}
          <Goal
            object={goalObject}
            mode={canModifyWorld ? mode : 'play'}
            selected={selectedObjectId === goalObject.id}
            onSelect={setSelectedObjectId}
            onStartDragging={setDraggingObjectId}
            onBallZoneEnter={handleBallZoneEnter}
            onBallZoneExit={handleBallZoneExit}
            ballRef={ballRef}
          />
          <Suspense fallback={null}>
            <Ball
              ballRef={ballRef}
              skinTexturePath={activeSkin.texture}
              linearDamping={currentZone === ZONES.outside ? 0.08 : 0.35}
              angularDamping={currentZone === ZONES.outside ? 0.12 : 0.4}
              spawnPosition={(() => {
                const gx = goalObject.position?.[0] ?? 0
                const gy = goalObject.position?.[1] ?? 0
                const gz = goalObject.position?.[2] ?? 0
                const rotY = goalObject.rotationY ?? 0
                const offset = 3.5
                const sx = gx + Math.sin(rotY) * offset
                const sz = gz + Math.cos(rotY) * offset
                const groundY = isGoalInsideHouse(goalObject.position) ? 0 : getTerrainHeight(sx, sz)
                return [sx, Math.max(gy + 1.2, groundY + 0.5), sz]
              })()}
            />
          </Suspense>
          <BallRespawnGuard ballRef={ballRef} goalObject={goalObject} onOutOfBounds={handleOutOfBoundsRespawn} />
          {outdoorEnemiesReady && (
            <Defer level={2}>
            <Profiler id="MushroomEnemies" onRender={recordRenderProfile}>
            {monsterSpawnSlots.map((slot, index) => (
              <SmallMushroomEnemy
                key={slot.id}
                enemyId={slot.id}
                spawnIndex={index}
                spawnPositionOverride={slot.spawnPosition}
                active
                playerPositionRef={playerPositionRef}
                registerCombatTarget={registerCombatTarget}
                onDefeated={handleSmallEnemyDefeated}
                onHitPlayer={handlePlayerHit}
                config={slot.config}
                monsterType={slot.monsterType}
                aggressive={slot.aggressive}
                patrol={slot.patrol}
                mobGroupRef={mobGroupRef}
                allyTargetsRef={allyTargetsRef}
              />
            ))}
            </Profiler>
            </Defer>
          )}
          <FireballManager
            projectilesRef={projectilesRef}
            combatTargetsRef={combatTargetsRef}
            playerTargetIdRef={playerTargetIdRef}
          />
          <FireballManager
            projectilesRef={remoteProjectilesRef}
            combatTargetsRef={null}
          />
          {/* Pool de squelettes invoqués : monté dès le chargement du monde
              pour précharger modèle/animations/GPU et éviter tout freeze au sort. */}
          {ownedMagicSkull && (
            <Defer level={4}>
            <Profiler id="SummonSkeletonPool" onRender={recordRenderProfile}>
            {Array.from({ length: SUMMON_SKELETON_COUNT }, (_, index) => (
              <Suspense key={`summon_slot_${index}`} fallback={null}>
                <SummonedSkeleton
                  index={index}
                  slotRef={summonSlotRefs.current[index]}
                  playerPositionRef={playerPositionRef}
                  combatTargetsRef={combatTargetsRef}
                  groupPositionsRef={summonGroupPositionsRef}
                  allyTargetsRef={allyTargetsRef}
                  playerTargetIdRef={playerTargetIdRef}
                  onExpire={handleSummonExpire}
                />
              </Suspense>
            ))}
            </Profiler>
            </Defer>
          )}
          <PlayerHealingAura
            active={playerHealing}
            playerPositionRef={playerPositionRef}
            layer={currentZone === ZONES.outside ? OUTDOOR_LIGHT_LAYER : 0}
          />
          <ChargingFireball
            active={isCharging && equippedWeapon === 'magic_book'}
            playerPositionRef={playerPositionRef}
            touchRef={touchRef}
            chargeYawRef={chargeYawRef}
            chargeAimYawRef={chargeAimYawRef}
            chargeProgressRef={chargeProgressRef}
            chargeStartTimeRef={chargeStartTimeRef}
            chargePosRef={chargePosRef}
            setChargeProgress={setChargeProgress}
            onCancel={cancelCharge}
            onLaunch={launchFromCharge}
          />
          {(!isDebugMode || debugToggles.player) && (
            <Suspense fallback={null}>
            <Profiler id="Player" onRender={recordRenderProfile}>
            <Player
              touchRef={touchRef}
              ballRef={ballRef}
              playerPositionRef={playerPositionRef}
              playerVelocityRef={playerVelocityRef}
              mode={mode}
              currentZone={currentZone}
              spawnRequest={spawnRequest}
              goalObject={goalObject}
              seatedState={seatedState}
              onSeatedPhaseChange={updateSeatedPhase}
              cameraOnCat={cameraOnCat}
              catPositionRef={catPositionRef}
              localPlayerStateRef={localPlayerStateRef}
              onKickIntent={isGuestVisit
                ? ({ impulse }) => {
                  multiplayerChannelRef.current?.sendGuestKick({ impulse })
                  return false
                }
                : null}
              combatTargetsRef={combatTargetsRef}
              onCombatHit={handleCombatHit}
              equippedWeapon={equippedWeapon}
              playerBodyYawRef={playerBodyYawRef}
              appearance={characterAppearance}
              freeCameraActive={isLocalNetwork && freeCameraActive}
              movementLocked={isCharging || isLearningMagicSkull}
              playerCombatActionsRef={playerCombatActionsRef}
              dragonRide={{
                active: dragonMounted,
                config: activeMountConfig,
                positionRef: dragonRidePositionRef,
                yawRef: dragonRideYawRef,
                animStateRef: dragonRideAnimStateRef,
                riderTransformRef: dragonRideRiderTransformRef,
                riderSocketRef: dragonRideSocketRef,
                mountProfileRef: dragonRideMountProfileRef,
                onFlight: () => unlockAchievement('first_fly'),
              }}
            />
            </Profiler>
            </Suspense>
          )}
          <OutdoorDoorTrigger
            playerPositionRef={playerPositionRef}
            currentZone={currentZone}
            onNearChange={setIsNearOutdoorDoor}
          />
          <MagicSkullDiscoveryTrigger
            playerPositionRef={playerPositionRef}
            enabled={currentZone === ZONES.outside && mode === 'play' && !magicSkullDiscovered}
            onNearChange={setIsNearMagicSkullDiscovery}
          />
          <QuestNpcInteraction
            placements={QUEST_NPC_PLACEMENTS}
            playerPositionRef={playerPositionRef}
            questProgress={questProgress}
            enabled={currentZone === ZONES.outside && mode === 'play'}
            onNearChange={(id) => { setNearbyQuestNpcId(id); if (!id) setQuestDialogOpen(false) }}
          />
          <LootDrops
            drops={lootDrops}
            playerPositionRef={playerPositionRef}
            onAbsorb={absorbLootDrop}
            onExpire={expireLootDrop}
          />
          <SeatInteractionTrigger
            playerPositionRef={playerPositionRef}
            objects={placedEditableObjects}
            seatedState={seatedState}
            onNearbySeatChange={setNearbySeat}
          />
          <TvInteractionTrigger
            playerPositionRef={playerPositionRef}
            objects={placedEditableObjects}
            enabled={mode === 'play'}
            onNearbyTvChange={setNearbyTv}
          />
          <LightSwitchTrigger
            playerPositionRef={playerPositionRef}
            enabled={currentZone !== ZONES.outside && mode === 'play' && canModifyWorld}
            onNearChange={(near) => { setIsNearLightSwitch(near); if (!near) setIsLightMenuOpen(false) }}
          />
          <BallStationTrigger playerPositionRef={playerPositionRef} goalObject={goalObject} onNearChange={setIsNearSkinStation} />
          {currentZone !== ZONES.outside && (
            <>
              <EnvironmentStationTrigger playerPositionRef={playerPositionRef} onNearChange={setIsNearEnvironmentStation} />
              <CustomizationStationTrigger
                playerPositionRef={playerPositionRef}
                onNearChange={setIsNearCustomizationStation}
                enabled={mode === 'play' && canModifyWorld}
              />
            </>
          )}
          {showCaptureUi && <ScorePopups popups={scorePopups} />}
        </Physics>
        </Suspense>
      </Canvas>
      </div>
      {!shaderWarmupComplete && (
        <div className="game-loading-overlay" role="status" aria-live="polite">
          <div className="game-loading-panel">
            <div className="game-loading-title">Chargement du monde</div>
            <div className="game-loading-text">Preparation du rendu...</div>
            <div className="game-loading-bar" aria-hidden="true">
              <span />
            </div>
          </div>
        </div>
      )}
      {isDebugMode && (
        <RenderStatsOverlay
          stats={renderStats}
          toggles={debugToggles}
          onToggle={(key) => setDebugToggles((current) => ({ ...current, [key]: !current[key] }))}
        />
      )}
      {!isDebugMode && performanceSettings.showFps && <FpsOverlay stats={renderStats} />}
      <GpuWarning visible={showGpuWarning} onDismiss={() => setGpuWarningDismissed(true)} />

      {mode === 'play' && (
        <ControlsOverlay
          touchRef={touchRef}
          adminCameraControls={isAdminMode || isVerticalFrameMode || (isLocalNetwork && freeCameraActive)}
          uiHidden={!showCaptureUi}
          mountFlying={dragonMounted && activeMountConfig?.canFly === true}
          onTap={catActive && (isAdminMode || isVerticalFrameMode) ? (clientX, clientY) => { catTapCallbackRef.current?.(clientX, clientY) } : undefined}
        />
      )}
      {showCaptureUi && <CoinsOverlay coins={coins} />}
      {showCaptureUi && <AchievementToast toast={achievementToast} />}
      {showCaptureUi && currentZone === ZONES.outside && <PlayerHealthOverlay hp={playerHp} />}
      {showCaptureUi && isLocalNetwork && freeCameraActive && (
        <div className="free-camera-badge">Camera libre</div>
      )}
      {showCaptureUi && PUBLIC_BUILD_FLAGS.showWeaponInventory && mode === 'play' && (
        <button
          className="weapon-inventory-btn"
          type="button"
          onClick={() => setIsWeaponMenuOpen((v) => !v)}
          aria-label="Sac"
        >
          🎒
        </button>
      )}
      {showCaptureUi && mode === 'play' && (
        <button
          className="quest-journal-btn"
          type="button"
          onClick={() => setQuestJournalOpen((v) => !v)}
          aria-label="Journal de quêtes"
        >
          📜
        </button>
      )}
      {showCaptureUi && isCharging && (
        <div className="charge-bar-wrap">
          <div className="charge-bar-fill" style={{ width: `${chargeProgress * 100}%` }} />
          <span className="charge-bar-label">✨ {chargeProgress >= 1 ? 'Prêt !' : 'Charge...'}</span>
        </div>
      )}
      {showCaptureUi && isLearningMagicSkull && (
        <div className="charge-bar-wrap">
          <div className="charge-bar-fill" style={{ width: `${magicSkullLearnProgress * 100}%` }} />
          <span className="charge-bar-label">💀 {magicSkullLearnProgress >= 1 ? 'Appris !' : 'Apprentissage...'}</span>
        </div>
      )}
      {showCaptureUi && mode === 'play' && equippedWeapon === 'magic_skull' && (
        <SummonCooldownBadge until={summonCooldownUntil} />
      )}
      {showCaptureUi && mode === 'play' && (
        <CombatActionDock
          touchRef={touchRef}
          canKick={canKick}
          canPunch={canPunch}
          showSpell={equippedWeapon === 'magic_book' || equippedWeapon === 'magic_skull'}
          onSpellPress={handleSpellPress}
        />
      )}
      {showCaptureUi && (
        <CharacterCustomizationMenu
          open={PUBLIC_BUILD_FLAGS.showCharacterCustomization && isCharacterMenuOpen}
          appearance={characterAppearance}
          onApply={setCharacterAppearance}
          onClose={() => setIsCharacterMenuOpen(false)}
        />
      )}
      {showCaptureUi && canModifyWorld && (
        <CustomizationChoiceMenu
          open={isCustomizationChoiceOpen}
          onChooseRoom={openCustomizationMode}
          onClose={() => setIsCustomizationChoiceOpen(false)}
        />
      )}
      {showCaptureUi && (
        <BagPanel
          open={PUBLIC_BUILD_FLAGS.showWeaponInventory && isWeaponMenuOpen}
          ownedItems={BAG_ITEM_DEFS
            .filter((def) => def.id === 'magic_book' ? ownedMagicBook : def.id === 'magic_skull' ? ownedMagicSkull : false)
            .map((def) => ({
              ...def,
              name: objectCatalog[def.id]?.name ?? def.name,
              thumbnail: objectCatalog[def.id]?.thumbnail ?? def.thumbnail,
            }))}
          equippedWeapon={equippedWeapon}
          onEquip={(weapon) => { setEquippedWeapon(weapon) }}
          onCustomizeCharacter={
            PUBLIC_BUILD_FLAGS.showCharacterCustomization
              ? openCharacterCustomizationFromBag
              : undefined
          }
          ownedMountIds={ownedMounts}
          mountedMountId={mountedMountId}
          onToggleMount={mode === 'play' ? toggleMount : undefined}
          onClose={() => setIsWeaponMenuOpen(false)}
          materials={materials}
        />
      )}
      {showCaptureUi && isLocalNetwork && showLocalCoinButton && canModifyWorld && (
        <button className="debug-add-coins-btn" type="button" onClick={() => applyCoinDelta(500)}>
          +500
        </button>
      )}
      {showCaptureUi && catActive && cameraOnCat && (isAdminMode || isVerticalFrameMode) && (
        <button className="cat-cam-btn" type="button" onClick={() => setCameraOnCat(false)}>
          🐱 Caméra chat — Retour joueur
        </button>
      )}
      {showCaptureUi && (
        <GameMenuPanel
          configured={isSupabaseConfigured}
          user={authUser}
          email={authEmail}
          password={authPassword}
          displayName={displayName}
          mode={authMode}
          open={isAccountOpen}
          activeTab={mainMenuTab}
          message={authMessage}
          socialMessage={multiplayerMessage}
          saveState={cloudSaveState}
          role={multiplayerRole}
          session={multiplayerSession}
          onlinePlayers={onlinePlayers}
          selectedPlayerId={selectedSocialPlayerId}
          incomingRequest={incomingVisitRequest}
          outgoingRequest={outgoingVisitRequest}
          visitRemainingSeconds={visitRemainingSeconds}
          sessionConnectionState={sessionConnectionState}
          sessionTransport={sessionTransport}
          hasRemotePlayer={hasRemotePlayer}
          friends={friends}
          incomingFriendRequests={incomingFriendRequests}
          pendingFriendRequests={pendingFriendRequests}
          ownedTitleIds={ownedTitleIds}
          equippedTitleId={equippedTitleId}
          titleActionState={titleActionState}
          unlockedAchievements={unlockedAchievements}
          achievementProgress={achievementProgress}
          soloNameplateVisible={soloNameplateVisible}
          performanceSettings={performanceSettings}
          isLocalNetwork={isLocalNetwork}
          showLocalCoinButton={showLocalCoinButton}
          fullscreenSupported={fullscreenSupported}
          fullscreenActive={fullscreenActive}
          onToggle={() => setIsAccountOpen((current) => !current)}
          onTabChange={setMainMenuTab}
          onEmailChange={setAuthEmail}
          onPasswordChange={setAuthPassword}
          onDisplayNameChange={setDisplayName}
          onModeChange={(nextMode) => {
            setAuthMode(nextMode)
            setAuthMessage('')
          }}
          onSubmit={requestAccountSubmit}
          onSignOut={requestSignOut}
          onSelectPlayer={selectSocialPlayer}
          onRequestVisit={requestVisitPlayer}
          onCancelVisit={cancelVisitRequest}
          onAcceptRequest={acceptVisitRequest}
          onRejectRequest={rejectVisitRequest}
          onLeaveSession={leaveMultiplayerSession}
          onRequestFriend={requestFriend}
          onAcceptFriend={acceptFriendRequest}
          onRejectFriend={rejectFriendRequest}
          onToggleTitle={toggleEquippedTitle}
          onToggleSoloNameplate={() => setSoloNameplateVisible((current) => !current)}
          onTogglePerformanceSetting={togglePerformanceSetting}
          onToggleLocalCoinButton={toggleLocalCoinButton}
          onToggleFullscreen={toggleFullscreenMode}
          pwaStandalone={pwaStandalone}
          deferredPrompt={deferredPrompt}
          isIosDevice={isIosDevice}
          onInstallPwa={installPwa}
          onShowPwaGuide={() => setShowPwaGuide(true)}
        />
      )}
      {showCaptureUi && isNearOutdoorDoor && mode === 'play' && !isSkinMenuOpen && !isEnvironmentMenuOpen && !isCustomizationChoiceOpen && !isCharacterMenuOpen && (
        <button className="skin-open-btn outdoor-open-btn" type="button" onClick={requestOutdoorTransition}>
          {currentZone === ZONES.outside ? 'Entrer' : 'Sortir'}
        </button>
      )}
      {showCaptureUi && currentZone === ZONES.outside && isNearMagicSkullDiscovery && !magicSkullDiscovered && mode === 'play' && !isSkinMenuOpen && !isEnvironmentMenuOpen && !isCustomizationChoiceOpen && !isCharacterMenuOpen && (
        <button className="skin-open-btn custom-open-btn" type="button" onClick={learnMagicSkull} disabled={isLearningMagicSkull}>
          {isLearningMagicSkull ? 'Apprentissage...' : 'Apprendre'}
        </button>
      )}
      {showCaptureUi && nearbyQuestNpcId && !questDialogOpen && mode === 'play' && !isSkinMenuOpen && !isEnvironmentMenuOpen && !isCustomizationChoiceOpen && !isCharacterMenuOpen && (
        <button className="skin-open-btn custom-open-btn" type="button" onClick={() => setQuestDialogOpen(true)}>
          Parler
        </button>
      )}
      {questDialogOpen && (
        <QuestDialog
          questId={FIRST_QUEST_ID}
          questProgress={questProgress}
          onAccept={acceptQuest}
          onComplete={completeQuest}
          onClose={() => setQuestDialogOpen(false)}
          onOpenVendor={() => { setQuestDialogOpen(false); setVendorOpen(true) }}
        />
      )}
      {vendorOpen && (
        <VendorPanel
          materials={materials}
          onSell={handleSellItem}
          onSellAll={handleSellAll}
          onClose={() => setVendorOpen(false)}
        />
      )}
      {showCaptureUi && mode === 'play' && pinnedQuestId && !questJournalOpen && (
        <QuestTracker questId={pinnedQuestId} questProgress={questProgress} />
      )}
      {questJournalOpen && (
        <QuestJournal
          questProgress={questProgress}
          pinnedQuestId={pinnedQuestId}
          onPin={setPinnedQuestId}
          onClose={() => setQuestJournalOpen(false)}
        />
      )}
      {showCaptureUi && isNearSkinStation && !isSkinMenuOpen && !isCustomizationChoiceOpen && !isCharacterMenuOpen && mode === 'play' && (
        <button className="skin-open-btn" type="button" onClick={openSkinMenu}>
          Personnaliser le ballon
        </button>
      )}
      {showCaptureUi && currentZone !== ZONES.outside && isNearEnvironmentStation && !isEnvironmentMenuOpen && !isCustomizationChoiceOpen && !isCharacterMenuOpen && mode === 'play' && (
        <button className="skin-open-btn environment-open-btn" type="button" onClick={openEnvironmentMenu}>
          Boutique
        </button>
      )}
      {showCaptureUi && canModifyWorld && currentZone !== ZONES.outside && isNearCustomizationStation && mode === 'play' && !isSkinMenuOpen && !isEnvironmentMenuOpen && !isCustomizationChoiceOpen && !isCharacterMenuOpen && (
        <button className="skin-open-btn custom-open-btn" type="button" onClick={openCustomizationChoice}>
          Personnaliser
        </button>
      )}
      {showCaptureUi && canModifyWorld && isLightMenuOpen && isNearLightSwitch && mode === 'play' && !isSkinMenuOpen && !isEnvironmentMenuOpen && !isCustomizationChoiceOpen && !isCharacterMenuOpen && (
        <div className="light-panel">
          <button
            className={`light-panel-toggle ${roomLightOn ? 'on' : 'off'}`}
            type="button"
            onClick={() => setRoomLightOn((v) => !v)}
          >
            {roomLightOn ? 'Lumière ON' : 'Lumière OFF'}
          </button>
          {roomLightOn && (
            <>
              <label className="light-panel-intensity">
                <span>
                  Intensité
                  <strong>{Math.round(lightIntensity * 50)} %</strong>
                </span>
                <input
                  type="range"
                  min="5"
                  max="150"
                  step="5"
                  value={Math.round(lightIntensity * 50)}
                  onChange={(event) => setLightIntensity(Number(event.target.value) / 50)}
                  aria-label="Intensité de la lumière"
                />
              </label>
              <LightColorWheel onChange={setLightColor} />
            </>
          )}
          <button className="light-panel-close" type="button" onClick={() => setIsLightMenuOpen(false)}>
            Fermer
          </button>
        </div>
      )}
      {showCaptureUi && canModifyWorld && nearbyTv && mode === 'play' && !isSkinMenuOpen && !isEnvironmentMenuOpen && !isCustomizationChoiceOpen && !isCharacterMenuOpen && (
        <button className="skin-open-btn tv-open-btn" type="button" onClick={requestTvMenu}>
          TV
        </button>
      )}
      {showCaptureUi && nearbySeat && mode === 'play' && !seatedState?.phase && !isSkinMenuOpen && !isEnvironmentMenuOpen && !isCustomizationChoiceOpen && !isCharacterMenuOpen && (
        <button className="skin-open-btn seat-open-btn" type="button" onClick={requestSit}>
          S'asseoir
        </button>
      )}
      {showCaptureUi && seatedState?.phase === 'sitting' && (
        <button className="skin-open-btn seat-open-btn" type="button" onClick={requestStandUp}>
          Se relever
        </button>
      )}
      {showCaptureUi && isMultiplayerSession && !blocksBottomGameChat && (
        <GameChatPanel
          open={isGameChatOpen}
          value={chatInput}
          disabled={sessionConnectionState !== 'connected'}
          onOpen={() => setIsGameChatOpen(true)}
          onClose={() => setIsGameChatOpen(false)}
          onChange={setChatInput}
          onFocus={pausePlayerControlsForChat}
          onSubmit={submitChatMessage}
        />
      )}
      {showCaptureUi && canModifyWorld && currentZone !== ZONES.outside && mode === 'customize' && (
        <div className="customize-ui">
          <div className="customize-rotation">
            <button type="button" onClick={() => rotateSelectedObject(-1)} disabled={!selectedObjectId && !placingObjectId}>
              {'<'}
            </button>
            <button type="button" onClick={() => rotateSelectedObject(1)} disabled={!selectedObjectId && !placingObjectId}>
              {'>'}
            </button>
            {PUBLIC_BUILD_FLAGS.showObjectInventory && selectedObject?.canStore && !placingObjectId && (
              <button type="button" onClick={storeSelectedObject}>
                Ranger
              </button>
            )}
          </div>
          {placingObjectId ? (
            <div className="customize-placement-actions">
              <button
                className="customize-done"
                type="button"
                onClick={confirmPlacement}
                disabled={!placementPreview?.isValid || !placementLocked}
              >
                Poser
              </button>
              <button className="customize-cancel" type="button" onClick={cancelPlacement}>
                Annuler
              </button>
            </div>
          ) : (
            <button className="customize-done" type="button" onClick={closeCustomizationMode}>
              Valider
            </button>
          )}
        </div>
      )}
      {showCaptureUi && PUBLIC_BUILD_FLAGS.showObjectInventory && canModifyWorld && currentZone !== ZONES.outside && mode === 'customize' && (
        <ObjectInventorySheet
          open={isObjectInventoryOpen}
          cards={inventoryCards}
          placingObjectId={placingObjectId}
          onToggle={() => setIsObjectInventoryOpen((current) => !current)}
          onSelect={beginPlaceObject}
        />
      )}
      <SkinMenu
        open={showCaptureUi && isSkinMenuOpen}
        coins={coins}
        skins={ballSkins}
        previewIndex={previewIndex}
        selectedSkinId={selectedSkinId}
        ownedSkinIds={ownedSkins}
        onClose={closeSkinMenu}
        onPrevious={() => goPreview(-1)}
        onNext={() => goPreview(1)}
        onBuy={buyPreviewSkin}
        onSelect={selectPreviewSkin}
        onRespawn={handleBallRespawn}
      />
      <EnvironmentMenu
        open={showCaptureUi && isEnvironmentMenuOpen}
        coins={coins}
        hasUnlimitedCoins={isAdminMode}
        activeTab={environmentTab}
        onTabChange={setEnvironmentTab}
        floorSkins={floorSkins}
        wallSkins={availableWallSkins}
        furnitureItems={furnitureShopItems}
        furnitureCounts={furnitureCounts}
        previewFloorIndex={previewFloorIndex}
        previewWallIndex={previewWallIndex}
        selectedFloorSkinId={selectedFloorSkinId}
        selectedWallSkinId={selectedWallSkinId}
        ownedFloorSkinIds={ownedFloorSkins}
        ownedWallSkinIds={ownedWallSkins}
        applyWallToCeiling={applyWallToCeiling}
        canApplyWorldSkins={canModifyWorld}
        onApplyWallToCeilingChange={setApplyWallToCeiling}
        onClose={closeEnvironmentMenu}
        onPrevious={() => goEnvironmentPreview(-1)}
        onNext={() => goEnvironmentPreview(1)}
        onBuy={buyPreviewEnvironmentSkin}
        onSelect={selectPreviewEnvironmentSkin}
        furnitureCart={furnitureCart}
        onAddFurnitureToCart={addFurnitureToCart}
        onRemoveFurnitureFromCart={removeFurnitureFromCart}
        onClearFurnitureCart={() => setFurnitureCart([])}
        onCheckoutFurnitureCart={checkoutFurnitureCart}
        ownedCat={ownedCat}
        catActive={catActive}
        onBuyCat={buyCat}
        onToggleCat={toggleCat}
        ownedMagicBook={ownedMagicBook}
        onBuyMagicBook={buyMagicBook}
        ownedMagicSkull={ownedMagicSkull}
        magicSkullDiscovered={magicSkullDiscovered}
        onBuyMagicSkull={buyMagicSkull}
        showWeaponShop={PUBLIC_BUILD_FLAGS.showWeaponShop}
        mountItems={MOUNT_SHOP_ITEMS}
        ownedMountIds={ownedMounts}
        onBuyMount={buyMount}
      />
      <div className={`zone-fade${zoneFadeActive ? ' active' : ''}`} />

      {showPwaGuide && (
        <div className="pwa-guide-overlay" onClick={() => setShowPwaGuide(false)}>
          <div className="pwa-guide-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pwa-guide-header">
              <div className="pwa-guide-logo">⚽</div>
              <div>
                <h3 className="pwa-guide-title">Jouer en Plein Écran</h3>
                <p className="pwa-guide-subtitle">Ajouter Lord Thomas Mobile Game à votre écran d'accueil</p>
              </div>
            </div>
            <div className="pwa-guide-steps">
              <div className="pwa-guide-step">
                <span className="pwa-guide-step-num">1</span>
                <p className="pwa-guide-step-text">
                  Appuyez sur le bouton <strong>Partager</strong> dans la barre Safari du bas (ou du haut sur iPad) : 📤
                </p>
              </div>
              <div className="pwa-guide-step">
                <span className="pwa-guide-step-num">2</span>
                <p className="pwa-guide-step-text">
                  Faites défiler le menu vers le bas et choisissez <strong>Sur l'écran d'accueil</strong> : ➕
                </p>
              </div>
              <div className="pwa-guide-step">
                <span className="pwa-guide-step-num">3</span>
                <p className="pwa-guide-step-text">
                  Renommez-le si vous le souhaitez et appuyez sur <strong>Ajouter</strong> en haut à droite.
                </p>
              </div>
            </div>
            <div className="pwa-guide-footer">
              <button className="pwa-guide-close-btn" type="button" onClick={() => setShowPwaGuide(false)}>
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )

  if (isAdminMode || isVerticalFrameMode) {
    return (
      <div className="admin-viewport">
        <div
          className="admin-frame"
          style={verticalFrameSize ? {
            width: `${verticalFrameSize.width}px`,
            height: `${verticalFrameSize.height}px`,
          } : undefined}
        >
          {gameView}
        </div>
      </div>
    )
  }

  return gameView
}

export default App

// ─── Cat tap detector ────────────────────────────────────────────────────────

function CatTapDetector({ catPositionRef, callbackRef, onToggle }) {
  const { camera, gl } = useThree()

  useEffect(() => {
    callbackRef.current = (clientX, clientY) => {
      const rect = gl.domElement.getBoundingClientRect()
      const nx = ((clientX - rect.left) / rect.width) * 2 - 1
      const ny = -((clientY - rect.top) / rect.height) * 2 + 1
      const raycaster = new Raycaster()
      raycaster.setFromCamera({ x: nx, y: ny }, camera)
      const catVec = new Vector3(
        catPositionRef.current.x,
        catPositionRef.current.y + 0.3,
        catPositionRef.current.z,
      )
      const closest = raycaster.ray.closestPointToPoint(catVec, new Vector3())
      if (closest.distanceTo(catVec) < 0.7) onToggle()
    }
    return () => { callbackRef.current = null }
  }, [camera, gl, catPositionRef, callbackRef, onToggle])

  return null
}

// ─── Cat NPC ────────────────────────────────────────────────────────────────

const PET_STATE = {
  IDLE_NEAR:      'idle_near',
  FOLLOW:         'follow',
  CATCH_UP:       'catch_up',
  RUN_WITH_PLAYER:'run_with_player',
  WANDER:         'wander',
  DECIDING:       'deciding',
}

const CAT_MAX_WALK_SPEED   = 1.7
const CAT_MAX_RUN_SPEED    = 4.0
const CAT_TURN_SPEED       = 5.5
const CAT_SLOW_RADIUS      = 1.2   // arrive : commence à freiner dans ce rayon
const CAT_IDLE_DIST        = 1.1   // en dessous → IDLE_NEAR
const CAT_CATCHUP_DIST     = 4.0   // au-delà → CATCH_UP
const CAT_RUN_PLAYER_SPEED = 2.8   // vitesse joueur déclenchant RUN_WITH_PLAYER
// Seuils d'hysteresis pour IDLE_NEAR : le chat ne part pas au premier micro-mouvement
const CAT_LAZY_MOVE_DIST   = 1.8   // distance minimale pour quitter IDLE_NEAR
const CAT_LAZY_MOVE_TIME   = 1.2   // secondes à cette distance avant de se décider
const CAT_SIT_DELAY        = 4.0   // secondes idle avant de s'asseoir
const CAT_WANDER_INTERVAL  = 6000  // ms entre tentatives de promenade
const CAT_WANDER_RADIUS    = 1.5

const CAT_OFFSETS = [
  { side: -0.7, back: 0.9 },
  { side:  0.7, back: 0.9 },
  { side: -0.5, back: 0.3 },
  { side:  0.5, back: 0.3 },
  { side:  0.0, back: 1.1 },
]

function Cat({ playerPositionRef, playerVelocityRef, currentZone, catPositionRef, catGroupRef, onNetworkState = null }) {
  const { scene, animations } = useGLTF('/models/cat.glb')
  const cat = useMemo(() => clone(scene), [scene])
  const { actions } = useAnimations(animations, cat)
  const groupRef         = useRef()
  const stateRef         = useRef(PET_STATE.IDLE_NEAR)
  const timerRef         = useRef(CAT_SIT_DELAY)
  // Accumule le temps passé hors de la zone confortable (hysteresis)
  const lazyTimerRef     = useRef(0)
  const wanderTargetRef  = useRef(new Vector3())
  const offsetRef        = useRef(CAT_OFFSETS[0])
  const currentActionRef = useRef(null)
  const currentAnimRef   = useRef('')

  const playAnim = useCallback((name, loop = true, fade = 0.3) => {
    if (currentAnimRef.current === name) return
    const action = actions[name]
    if (!action) return
    currentActionRef.current?.fadeOut(fade)
    action.reset().setLoop(loop ? LoopRepeat : LoopOnce, loop ? Infinity : 1).play()
    action.setEffectiveWeight(1).setEffectiveTimeScale(1)
    if (fade > 0) action.fadeIn(fade)
    action.clampWhenFinished = !loop
    currentActionRef.current = action
    currentAnimRef.current = name
  }, [actions])

  useEffect(() => {
    cat.traverse((obj) => {
      if (obj instanceof Mesh) { obj.castShadow = true; obj.receiveShadow = true }
    })
    playAnim('Idle')
  }, [cat, playAnim])

  // Hauteur du sol sous une position XZ donnée
  const getFloorY = useCallback((x, z) => {
    return currentZone === ZONES.outside ? getTerrainHeight(x, z) : 0
  }, [currentZone])

  const pickOffset = useCallback(() => {
    const prev = offsetRef.current
    const choices = CAT_OFFSETS.filter(o => o !== prev)
    offsetRef.current = choices[Math.floor(Math.random() * choices.length)]
  }, [])

  const computeTarget = useCallback((pp, pv, side, back) => {
    const speed = Math.sqrt(pv.x * pv.x + pv.z * pv.z)
    let fwdX, fwdZ
    if (speed > 0.15) {
      fwdX = pv.x / speed; fwdZ = pv.z / speed
    } else {
      const g = groupRef.current
      if (!g) return { x: pp.x, z: pp.z }
      const dx = pp.x - g.position.x
      const dz = pp.z - g.position.z
      const d = Math.sqrt(dx * dx + dz * dz) || 1
      fwdX = dx / d; fwdZ = dz / d
    }
    const rightX = fwdZ, rightZ = -fwdX
    return {
      x: pp.x - fwdX * back + rightX * side,
      z: pp.z - fwdZ * back + rightZ * side,
    }
  }, [])

  // Steering arrive + colle le chat au sol
  const arriveToward = useCallback((tx, tz, maxSpeed, delta) => {
    const g = groupRef.current
    const dx = tx - g.position.x
    const dz = tz - g.position.z
    const dist = Math.sqrt(dx * dx + dz * dz)
    if (dist < 0.02) return 0
    const speed = maxSpeed * MathUtils.clamp(dist / CAT_SLOW_RADIUS, 0, 1)
    const step = Math.min(speed * delta, dist)
    const nx = g.position.x + (dx / dist) * step
    const nz = g.position.z + (dz / dist) * step
    g.position.x = nx
    g.position.z = nz
    g.position.y = getFloorY(nx, nz)
    return dist
  }, [getFloorY])

  const turnToward = useCallback((tx, tz, delta) => {
    const g = groupRef.current
    const dx = tx - g.position.x
    const dz = tz - g.position.z
    if (Math.abs(dx) < 0.001 && Math.abs(dz) < 0.001) return
    let diff = Math.atan2(dx, dz) - g.rotation.y
    while (diff > Math.PI)  diff -= Math.PI * 2
    while (diff < -Math.PI) diff += Math.PI * 2
    g.rotation.y += diff * Math.min(CAT_TURN_SPEED * delta, 1)
  }, [])

  useFrame((_, delta) => {
    if (!groupRef.current || !playerPositionRef?.current) return

    const pp  = playerPositionRef.current
    const pv  = playerVelocityRef?.current ?? { x: 0, z: 0 }
    const pos = groupRef.current.position

    const playerSpeed = Math.sqrt(pv.x * pv.x + pv.z * pv.z)
    const dist = Math.hypot(pp.x - pos.x, pp.z - pos.z)
    const publishCatState = (motion = currentAnimRef.current || 'Idle') => {
      if (catPositionRef) {
        catPositionRef.current.x = pos.x
        catPositionRef.current.y = pos.y
        catPositionRef.current.z = pos.z
      }
      if (onNetworkState) {
        onNetworkState({
          position: [pos.x, pos.y, pos.z],
          rotationY: groupRef.current.rotation.y,
          motion,
        })
      }
    }

    // Colle toujours le chat au sol, même quand il est immobile
    pos.y = getFloorY(pos.x, pos.z)

    // ── Transitions d'état ────────────────────────────────────────────────
    const state = stateRef.current

    if (state === PET_STATE.IDLE_NEAR) {
      // Hysteresis : n'accumule le timer que si le joueur est vraiment loin ET bouge
      if (dist > CAT_LAZY_MOVE_DIST) {
        lazyTimerRef.current += delta
        if (lazyTimerRef.current >= CAT_LAZY_MOVE_TIME) {
          lazyTimerRef.current = 0
          // Le joueur court : RUN_WITH_PLAYER directement
          if (playerSpeed > CAT_RUN_PLAYER_SPEED) {
            pickOffset(); stateRef.current = PET_STATE.RUN_WITH_PLAYER
          } else if (dist > CAT_CATCHUP_DIST) {
            stateRef.current = PET_STATE.CATCH_UP
          } else {
            pickOffset(); stateRef.current = PET_STATE.FOLLOW; timerRef.current = CAT_SIT_DELAY
          }
        }
      } else {
        lazyTimerRef.current = Math.max(0, lazyTimerRef.current - delta * 2) // oublie vite si revenu proche
      }

      timerRef.current -= delta
      const motion = timerRef.current <= 0 ? 'Sit' : 'Idle'
      playAnim(motion)
      publishCatState(motion)
      return
    }

    // Dans tous les autres états, retour à IDLE_NEAR si le joueur est revenu
    if (dist <= CAT_IDLE_DIST && state !== PET_STATE.WANDER) {
      stateRef.current = PET_STATE.IDLE_NEAR
      timerRef.current = CAT_SIT_DELAY
      lazyTimerRef.current = 0
      playAnim('Idle')
      publishCatState('Idle')
      return
    }

    // Escalade vers CATCH_UP ou RUN si nécessaire depuis FOLLOW
    if (state === PET_STATE.FOLLOW) {
      if (playerSpeed > CAT_RUN_PLAYER_SPEED) { pickOffset(); stateRef.current = PET_STATE.RUN_WITH_PLAYER; return }
      if (dist > CAT_CATCHUP_DIST) { stateRef.current = PET_STATE.CATCH_UP; return }
    }
    // Retour vers FOLLOW depuis CATCH_UP quand assez proche
    if (state === PET_STATE.CATCH_UP && dist <= CAT_CATCHUP_DIST * 0.7) {
      pickOffset(); stateRef.current = PET_STATE.FOLLOW; timerRef.current = CAT_SIT_DELAY
    }
    // Retour vers FOLLOW depuis RUN si le joueur ralentit
    if (state === PET_STATE.RUN_WITH_PLAYER && playerSpeed <= CAT_RUN_PLAYER_SPEED * 0.7 && dist <= CAT_CATCHUP_DIST) {
      pickOffset(); stateRef.current = PET_STATE.FOLLOW; timerRef.current = CAT_SIT_DELAY
    }

    // ── Comportements ─────────────────────────────────────────────────────
    if (stateRef.current === PET_STATE.FOLLOW) {
      const { side, back } = offsetRef.current
      const tgt = computeTarget(pp, pv, side, back)
      turnToward(tgt.x, tgt.z, delta)
      const remaining = arriveToward(tgt.x, tgt.z, CAT_MAX_WALK_SPEED, delta)
      const motion = remaining > 0.15 ? 'Walk' : 'Idle'
      playAnim(motion)
      publishCatState(motion)
      return
    }

    if (stateRef.current === PET_STATE.CATCH_UP) {
      playAnim('Run')
      turnToward(pp.x, pp.z, delta)
      arriveToward(pp.x, pp.z, CAT_MAX_RUN_SPEED, delta)
      publishCatState('Run')
      return
    }

    if (stateRef.current === PET_STATE.RUN_WITH_PLAYER) {
      const { side, back } = offsetRef.current
      const tgt = computeTarget(pp, pv, side, back)
      playAnim('Run')
      turnToward(tgt.x, tgt.z, delta)
      arriveToward(tgt.x, tgt.z, CAT_MAX_RUN_SPEED, delta)
      publishCatState('Run')
      return
    }

    if (stateRef.current === PET_STATE.WANDER) {
      if (dist > CAT_CATCHUP_DIST) { stateRef.current = PET_STATE.CATCH_UP; return }
      const wt = wanderTargetRef.current
      turnToward(wt.x, wt.z, delta)
      const remaining = arriveToward(wt.x, wt.z, CAT_MAX_WALK_SPEED * 0.75, delta)
      const motion = remaining > 0.1 ? 'Walk' : 'Idle'
      playAnim(motion)
      timerRef.current -= delta
      if (remaining < 0.2 || timerRef.current <= 0) {
        stateRef.current = PET_STATE.IDLE_NEAR
        timerRef.current = CAT_SIT_DELAY
        lazyTimerRef.current = 0
        playAnim('Idle')
        publishCatState('Idle')
        return
      }
      publishCatState(motion)
    }
  })

  useEffect(() => {
    const id = setInterval(() => {
      if (stateRef.current !== PET_STATE.IDLE_NEAR) return
      if (!playerPositionRef?.current || !groupRef.current) return
      const pv = playerVelocityRef?.current ?? { x: 0, z: 0 }
      if (Math.sqrt(pv.x * pv.x + pv.z * pv.z) > 0.2) return
      if (Math.random() > 0.5) return
      const pp = playerPositionRef.current
      const angle = Math.random() * Math.PI * 2
      const r = CAT_WANDER_RADIUS * (0.4 + Math.random() * 0.6)
      wanderTargetRef.current.set(pp.x + Math.cos(angle) * r, 0, pp.z + Math.sin(angle) * r)
      stateRef.current = PET_STATE.WANDER
      timerRef.current = 3 + Math.random() * 3
    }, CAT_WANDER_INTERVAL)
    return () => clearInterval(id)
  }, [playerPositionRef, playerVelocityRef])

  return (
    <group
      ref={(el) => { groupRef.current = el; if (catGroupRef) catGroupRef.current = el }}
      position={[1, 0, 2]}
      userData={{ debugCategory: 'npcs' }}
    >
      <primitive object={cat} />
    </group>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

// Décodeur Draco hébergé localement (copié dans public/draco/ depuis three).
// Route TOUS les useGLTF du jeu vers ce décodeur, sans dépendre du CDN Google.
// Les .glb sont recompressés en Draco par scripts/compress-glb.mjs : le décodage
// se fait dans un worker et ne crée donc aucun freeze au spawn.
useGLTF.setDecoderPath('/draco/')

installAssetLoadProfiler(DefaultLoadingManager)
installLongTaskObserver()

// Jalon de chargement : début d'exécution du module App (bundle JS téléchargé+parsé).
markLoad('jsBoot')

// Test de chargement mobile : ne pas bloquer l'affichage initial sur tout le
// catalogue boutique/maison. Les assets encore nécessaires apparaîtront dans le
// tableau "Assets Three.js les plus lents" s'ils sont montés par la scène initiale.
// NE PAS précharger toutes les variantes de skins : ces .png (~26 textures, ~50 Mo)
// gonflaient l'écran de chargement pour RIEN — le rendu utilise les .ktx2 (via
// useGameTexture), pas ces PNG. Le skin actif charge son .ktx2 au montage de la scène ;
// les autres variantes chargent à la demande (sélection / vignettes boutique en CSS).
