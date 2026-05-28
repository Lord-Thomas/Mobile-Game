import { isSupabaseConfigured, supabase, supabaseRedirectUrl } from '../lib/supabase'

function getInventory(objects) {
  return objects.reduce((inventory, object) => {
    if (!object.canStore || !object.objectId || object.objectId === 'soccer_goal') return inventory
    inventory[object.objectId] = (inventory[object.objectId] ?? 0) + 1
    return inventory
  }, {})
}

function mergeUnique(left = [], right = []) {
  return Array.from(new Set([...left, ...right]))
}

function mergeEditableObjects(existingObjects = [], currentObjects = []) {
  const byId = new Map()
  existingObjects.forEach((object) => {
    if (object?.id) byId.set(object.id, object)
  })
  currentObjects.forEach((object) => {
    if (object?.id) byId.set(object.id, object)
  })
  return Array.from(byId.values())
}

function mergeProgressRow(existingRow, progress) {
  if (!existingRow) return progress
  const existing = fromProgressRow(existingRow)
  const ownedWeapons = mergeUnique(existing.ownedWeapons, progress.ownedWeapons)
  const ownedMagicBook = Boolean(existing.ownedMagicBook || progress.ownedMagicBook || ownedWeapons.includes('magic_book'))
  const equippedWeapon = ownedWeapons.includes(progress.equippedWeapon) || (progress.equippedWeapon === 'magic_book' && ownedMagicBook)
    ? progress.equippedWeapon
    : null

  return {
    ...progress,
    ownedSkins: mergeUnique(existing.ownedSkins, progress.ownedSkins),
    ownedFloorSkins: mergeUnique(existing.ownedFloorSkins, progress.ownedFloorSkins),
    ownedWallSkins: mergeUnique(existing.ownedWallSkins, progress.ownedWallSkins),
    selectedFloorSkinId: progress.selectedFloorSkinId === 'floor-classic'
      && (progress.ownedFloorSkins?.length ?? 0) <= 1
      && existing.selectedFloorSkinId !== 'floor-classic'
      ? existing.selectedFloorSkinId
      : progress.selectedFloorSkinId,
    selectedWallSkinId: progress.selectedWallSkinId === 'wall-classic'
      && (progress.ownedWallSkins?.length ?? 0) <= 1
      && existing.selectedWallSkinId !== 'wall-classic'
      ? existing.selectedWallSkinId
      : progress.selectedWallSkinId,
    ownedWeapons,
    ownedCat: Boolean(existing.ownedCat || progress.ownedCat),
    ownedMagicBook,
    equippedWeapon,
    editableObjects: mergeEditableObjects(existing.editableObjects, progress.editableObjects),
  }
}

const DEFAULT_PROGRESS_SCOPE = 'player'

function normalizeProgressScope(scope) {
  return scope === 'admin' ? 'admin' : DEFAULT_PROGRESS_SCOPE
}

function isProgressScopeSchemaError(error) {
  const message = `${error?.message ?? ''} ${error?.details ?? ''} ${error?.hint ?? ''}`
  return (
    error?.code === '42703' ||
    error?.code === 'PGRST204' ||
    message.includes('progress_scope') ||
    message.includes('requested_scope') ||
    message.includes('Could not find the function')
  )
}

function toLegacyProgressRow(userId, progress, { includeCoins = false } = {}) {
  const row = toProgressRow(userId, progress, { includeCoins, scope: DEFAULT_PROGRESS_SCOPE })
  delete row.progress_scope
  return row
}

function toLegacyInitialProgressRow(userId, progress) {
  const row = toInitialProgressRow(userId, progress, { scope: DEFAULT_PROGRESS_SCOPE })
  delete row.progress_scope
  return row
}

async function loadLegacyRow(userId) {
  const { data, error } = await supabase
    .from('player_progress')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  return data
}

async function loadLegacyAdminProgress(userId) {
  const row = await loadLegacyRow(userId)
  return row?.world_settings?.adminProgress ?? null
}

async function saveLegacyAdminProgress(userId, progress) {
  const legacyRow = await loadLegacyRow(userId)
  const worldSettings = {
    ...(legacyRow?.world_settings ?? {}),
    adminProgress: progress,
  }

  if (!legacyRow) {
    const { error } = await supabase
      .from('player_progress')
      .insert({
        user_id: userId,
        world_settings: worldSettings,
      })

    if (error) throw error
    return true
  }

  const { error } = await supabase
    .from('player_progress')
    .update({
      world_settings: worldSettings,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)

  if (error) throw error
  return true
}

function toProgressRow(userId, progress, { includeCoins = false, scope = DEFAULT_PROGRESS_SCOPE } = {}) {
  const row = {
    user_id: userId,
    progress_scope: normalizeProgressScope(scope),
    inventory: getInventory(progress.editableObjects),
    placed_decorations: progress.editableObjects,
    owned_skins: progress.ownedSkins,
    equipped_skin: progress.selectedSkinId,
    world_settings: {
      displayName: progress.displayName || '',
      ownedFloorSkins: progress.ownedFloorSkins,
      ownedWallSkins: progress.ownedWallSkins,
      selectedFloorSkinId: progress.selectedFloorSkinId,
      selectedWallSkinId: progress.selectedWallSkinId,
      applyWallToCeiling: progress.applyWallToCeiling,
      ownedCat: progress.ownedCat ?? false,
      catActive: progress.catActive ?? false,
      ownedMagicBook: progress.ownedMagicBook ?? false,
      ownedWeapons: progress.ownedWeapons ?? (progress.ownedMagicBook ? ['magic_book'] : []),
      equippedWeapon: progress.equippedWeapon ?? null,
      characterAppearance: progress.characterAppearance ?? null,
    },
    updated_at: new Date().toISOString(),
  }

  if (includeCoins) row.coins = progress.coins
  return row
}

function toInitialProgressRow(userId, progress, { scope = DEFAULT_PROGRESS_SCOPE } = {}) {
  return {
    user_id: userId,
    progress_scope: normalizeProgressScope(scope),
    coins: progress.coins,
    inventory: getInventory(progress.editableObjects),
    placed_decorations: progress.editableObjects,
    owned_skins: progress.ownedSkins,
    equipped_skin: progress.selectedSkinId,
    world_settings: {
      displayName: progress.displayName || '',
      ownedFloorSkins: progress.ownedFloorSkins,
      ownedWallSkins: progress.ownedWallSkins,
      selectedFloorSkinId: progress.selectedFloorSkinId,
      selectedWallSkinId: progress.selectedWallSkinId,
      applyWallToCeiling: progress.applyWallToCeiling,
      ownedCat: progress.ownedCat ?? false,
      catActive: progress.catActive ?? false,
      ownedMagicBook: progress.ownedMagicBook ?? false,
      ownedWeapons: progress.ownedWeapons ?? (progress.ownedMagicBook ? ['magic_book'] : []),
      equippedWeapon: progress.equippedWeapon ?? null,
      characterAppearance: progress.characterAppearance ?? null,
    },
  }
}

export function fromProgressRow(row) {
  if (!row) return null
  const ownedWeapons = Array.isArray(row.world_settings?.ownedWeapons)
    ? row.world_settings.ownedWeapons
    : []
  const ownedMagicBook = Boolean(row.world_settings?.ownedMagicBook || ownedWeapons.includes('magic_book'))

  return {
    coins: row.coins ?? 0,
    displayName: row.world_settings?.displayName ?? row.display_name ?? '',
    ownedSkins: Array.isArray(row.owned_skins) ? row.owned_skins : ['classic'],
    selectedSkinId: row.equipped_skin ?? 'classic',
    ownedFloorSkins: Array.isArray(row.world_settings?.ownedFloorSkins)
      ? row.world_settings.ownedFloorSkins
      : ['floor-classic'],
    ownedWallSkins: Array.isArray(row.world_settings?.ownedWallSkins)
      ? row.world_settings.ownedWallSkins
      : ['wall-classic'],
    selectedFloorSkinId: row.world_settings?.selectedFloorSkinId ?? 'floor-classic',
    selectedWallSkinId: row.world_settings?.selectedWallSkinId ?? 'wall-classic',
    applyWallToCeiling: Boolean(row.world_settings?.applyWallToCeiling),
    ownedCat: Boolean(row.world_settings?.ownedCat),
    catActive: Boolean(row.world_settings?.catActive),
    ownedMagicBook,
    ownedWeapons: ownedMagicBook ? mergeUnique(ownedWeapons, ['magic_book']) : ownedWeapons,
    equippedWeapon: typeof row.world_settings?.equippedWeapon === 'string' ? row.world_settings.equippedWeapon : null,
    equippedTitleId: row.equipped_title_id ?? null,
    editableObjects: Array.isArray(row.placed_decorations) ? row.placed_decorations : [],
    characterAppearance: row.world_settings?.characterAppearance ?? null,
  }
}

export async function getCurrentUser() {
  if (!isSupabaseConfigured) return null
  const { data, error } = await supabase.auth.getUser()
  if (error) return null
  return data.user ?? null
}

function getAuthErrorMessage(error) {
  const message = typeof error === 'string'
    ? error
    : error?.message ?? error?.error_description ?? error?.error ?? ''
  const normalized = message.toLowerCase()

  if (!isSupabaseConfigured) return "La connexion en ligne n'est pas configuree."
  if (!message) return null
  if (normalized.includes('invalid login credentials')) {
    return 'Email ou mot de passe incorrect, ou email pas encore confirme.'
  }
  if (normalized.includes('email not confirmed')) {
    return 'Email pas encore confirme. Ouvre le lien recu par email puis reconnecte-toi.'
  }
  if (normalized.includes('user already registered') || normalized.includes('already registered')) {
    return 'Un compte existe deja avec cet email. Essaie Connexion ou Mot de passe oublie dans Supabase.'
  }
  if (normalized.includes('password') && normalized.includes('weak')) {
    return 'Mot de passe trop faible. Utilise au moins 8 caracteres avec une combinaison plus variee.'
  }
  if (normalized.includes('rate limit') || normalized.includes('too many')) {
    return "Trop d'essais. Attends une minute puis reessaie."
  }
  if (normalized.includes('failed to fetch') || normalized.includes('network')) {
    return 'Impossible de joindre le serveur de connexion. Verifie la connexion internet puis reessaie.'
  }
  return message
}

export async function signUpWithPassword({ email, password, displayName }) {
  if (!isSupabaseConfigured) return { ok: false, error: getAuthErrorMessage() }
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName },
        emailRedirectTo: supabaseRedirectUrl,
      },
    })
    return {
      ok: !error,
      error: getAuthErrorMessage(error),
      needsEmailConfirmation: Boolean(data?.user && !data?.session),
    }
  } catch (error) {
    return { ok: false, error: getAuthErrorMessage(error) }
  }
}

export async function signInWithPassword({ email, password }) {
  if (!isSupabaseConfigured) return { ok: false, error: getAuthErrorMessage() }
  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { ok: !error, error: getAuthErrorMessage(error) }
  } catch (error) {
    return { ok: false, error: getAuthErrorMessage(error) }
  }
}

export async function signOut() {
  if (!isSupabaseConfigured) return
  await supabase.auth.signOut()
}

export function onAuthStateChange(callback) {
  if (!isSupabaseConfigured) return () => {}
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user ?? null)
  })
  return () => data.subscription.unsubscribe()
}

export async function loadPlayerProgress({ scope = DEFAULT_PROGRESS_SCOPE } = {}) {
  const user = await getCurrentUser()
  if (!user) return null
  const progressScope = normalizeProgressScope(scope)

  const { data, error } = await supabase
    .from('player_progress')
    .select('*')
    .eq('user_id', user.id)
    .eq('progress_scope', progressScope)
    .maybeSingle()

  if (error && isProgressScopeSchemaError(error)) {
    if (progressScope === 'admin') return loadLegacyAdminProgress(user.id)
    const legacyData = await loadLegacyRow(user.id)
    return legacyData ? fromProgressRow(legacyData) : null
  }
  if (error) throw error
  return data ? fromProgressRow(data) : null
}

export async function loadPlayerPublicWorld(userId, { scope = DEFAULT_PROGRESS_SCOPE } = {}) {
  if (!isSupabaseConfigured || !userId) return null
  const progressScope = normalizeProgressScope(scope)

  const { data, error } = await supabase.rpc('get_player_visit_world', {
    target_user_id: userId,
    requested_scope: progressScope,
  })

  if (error) throw error
  return data ? fromProgressRow(data) : null
}

export async function addPlayerCoins(delta, { scope = DEFAULT_PROGRESS_SCOPE } = {}) {
  const user = await getCurrentUser()
  if (!user) return null

  const { data, error } = await supabase.rpc('add_player_coins', {
    delta,
    requested_scope: normalizeProgressScope(scope),
  })
  if (error && isProgressScopeSchemaError(error)) {
    if (normalizeProgressScope(scope) === 'admin') return null
    const { data: legacyData, error: legacyError } = await supabase.rpc('add_player_coins', { delta })
    if (legacyError) throw legacyError
    return legacyData
  }
  if (error) throw error
  return data
}

export async function loadPlayerTitles({ scope = DEFAULT_PROGRESS_SCOPE } = {}) {
  const user = await getCurrentUser()
  if (!user) return null

  const { data, error } = await supabase.rpc('get_player_titles', {
    requested_scope: normalizeProgressScope(scope),
  })
  if (error) throw error
  return data
}

export async function equipPlayerTitle(titleId, { scope = DEFAULT_PROGRESS_SCOPE } = {}) {
  const user = await getCurrentUser()
  if (!user) return false

  const { data, error } = await supabase.rpc('equip_player_title', {
    p_title_id: titleId,
    requested_scope: normalizeProgressScope(scope),
  })
  if (error) throw error
  return Boolean(data)
}

export async function claimFirstMobDefeatRewards({ scope = DEFAULT_PROGRESS_SCOPE } = {}) {
  const user = await getCurrentUser()
  if (!user) {
    return {
      ok: false,
      reason: 'not_authenticated',
      achievementUnlocked: false,
      titleUnlocked: false,
      claimNumber: null,
    }
  }

  const { data, error } = await supabase.rpc('claim_first_mob_defeat_rewards', {
    requested_scope: normalizeProgressScope(scope),
  })
  if (error) throw error
  return data
}

export async function savePlayerProgress(progress, { includeCoins = false, scope = DEFAULT_PROGRESS_SCOPE } = {}) {
  const user = await getCurrentUser()
  if (!user) return false
  const progressScope = normalizeProgressScope(scope)

  const { data: existingRow, error: loadError } = await supabase
    .from('player_progress')
    .select('*')
    .eq('user_id', user.id)
    .eq('progress_scope', progressScope)
    .maybeSingle()

  if (loadError && isProgressScopeSchemaError(loadError)) {
    if (progressScope === 'admin') return saveLegacyAdminProgress(user.id, progress)

    const legacyRow = await loadLegacyRow(user.id)

    if (!legacyRow) {
      const { error } = await supabase
        .from('player_progress')
        .insert(toLegacyInitialProgressRow(user.id, progress))

      if (error) throw error
      return true
    }

    const mergedProgress = mergeProgressRow(legacyRow, progress)
    const { error } = await supabase
      .from('player_progress')
      .update(toLegacyProgressRow(user.id, mergedProgress, { includeCoins }))
      .eq('user_id', user.id)

    if (error) throw error
    return true
  }

  if (loadError) throw loadError

  if (!existingRow) {
    const { error } = await supabase
      .from('player_progress')
      .insert(toInitialProgressRow(user.id, progress, { scope: progressScope }))

    if (error && isProgressScopeSchemaError(error)) return false
    if (error) throw error
    return true
  }

  const mergedProgress = mergeProgressRow(existingRow, progress)
  const { error } = await supabase
    .from('player_progress')
    .update(toProgressRow(user.id, mergedProgress, { includeCoins, scope: progressScope }))
    .eq('user_id', user.id)
    .eq('progress_scope', progressScope)

  if (error && isProgressScopeSchemaError(error)) return false
  if (error) throw error
  return true
}
