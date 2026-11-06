import type { Session } from '@supabase/supabase-js'

export type AuthPhase = 'checking' | 'authenticated' | 'anonymous' | 'error'

export interface AuthSnapshot {
  phase: AuthPhase
  session: Session | null
  message: string
}

export const INITIAL_AUTH_SNAPSHOT: AuthSnapshot = {
  phase: 'checking',
  session: null,
  message: '',
}

export function authSnapshotFromCheck(
  current: AuthSnapshot,
  session: Session | null,
  failed = false,
): AuthSnapshot {
  if (failed) {
    if (current.phase === 'authenticated' && current.session) return current
    return {
      phase: 'error',
      session: null,
      message: 'No pudimos comprobar tu sesión. Revisa tu conexión e inténtalo de nuevo.',
    }
  }
  if (current.phase === 'authenticated' && current.session) return current
  return session
    ? { phase: 'authenticated', session, message: '' }
    : { phase: 'anonymous', session: null, message: '' }
}

export function authSnapshotFromEvent(
  current: AuthSnapshot,
  event: string,
  session: Session | null,
): AuthSnapshot {
  if (event === 'SIGNED_OUT') {
    return { phase: 'anonymous', session: null, message: 'Tu sesión terminó o se cerró en otra pestaña. Inicia sesión para continuar.' }
  }
  if (session) {
    return { phase: 'authenticated', session, message: '' }
  }
  if (event === 'INITIAL_SESSION') {
    return { phase: 'anonymous', session: null, message: '' }
  }
  // A null token-refresh event is not proof that the stored session was revoked.
  // Keep the current identity until Supabase emits a definitive SIGNED_OUT event.
  return current
}

export function authenticatedHome(isPlatformAdmin: boolean): '/admin' | '/panel' {
  return isPlatformAdmin ? '/admin' : '/panel'
}

export function privateRouteDecision(phase: AuthPhase): 'wait' | 'login' | 'render' {
  if (phase === 'checking' || phase === 'error') return 'wait'
  return phase === 'anonymous' ? 'login' : 'render'
}

export function isPublicMenuPath(pathname: string): boolean {
  return pathname.startsWith('/m/')
}
