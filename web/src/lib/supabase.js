import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const configuredRedirectUrl = import.meta.env.VITE_SUPABASE_REDIRECT_URL

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)
export const supabaseRedirectUrl = configuredRedirectUrl || window.location.origin

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  })
  : null
