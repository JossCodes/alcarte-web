import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

export const isSupabaseConfigured = Boolean(url && anonKey)

/**
 * The browser may only receive the publishable/anon key. Administrative
 * service-role credentials must never use the VITE_ prefix or enter this app.
 */
export const supabase = isSupabaseConfigured
  ? createClient(url!, anonKey!, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    })
  : null

/** A session-free client keeps the public menu on the anon RLS policies. */
export const publicSupabase = isSupabaseConfigured
  ? createClient(url!, anonKey!, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    })
  : null

/**
 * Recovery links authenticate the account being recovered. Keep that temporary
 * auth session in memory so opening a store owner's link cannot replace the
 * administrator's persisted browser session.
 */
export const recoverySupabase = isSupabaseConfigured
  ? createClient(url!, anonKey!, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    })
  : null
