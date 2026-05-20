import { isSupabaseConfigured, supabase } from '../lib/supabase'

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
  return {
    ...progress,
    ownedSkins: mergeUnique(existing.ownedSkins, progress.ownedSkins),
    ownedFloorSkins: mergeUnique(existing.ownedFloorSkins, progress.ownedFloorSkins),
    ownedWallSkins: mergeUnique(existing.ownedWallSkins, progress.ownedWallSkins),
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
    },
  }
}

export function fromProgressRow(row) {
  if (!row) return null
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
    editableObjects: Array.isArray(row.placed_decorations) ? row.placed_decorations : [],
  }
}

export async function getCurrentUser() {
  if (!isSupabaseConfigured) return null
  const { data, error } = await supabase.auth.getUser()
  if (error) return null
  return data.user ?? null
}

export async function signUpWithPassword({ email, password, displayName }) {
  if (!isSupabaseConfigured) return { ok: false, error: 'Supabase is not configured.' }
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName } },
  })
  return {
    ok: !error,
    error: error?.message ?? null,
    needsEmailConfirmation: Boolean(data?.user && !data?.session),
  }
}

export async function signInWithPassword({ email, password }) {
  if (!isSupabaseConfigured) return { ok: false, error: 'Supabase is not configured.' }
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  return { ok: !error, error: error?.message ?? null }
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
