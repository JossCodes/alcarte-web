import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { authSnapshotFromCheck, authSnapshotFromEvent, INITIAL_AUTH_SNAPSHOT, type AuthPhase, type AuthSnapshot } from './auth-state'

interface AuthState {
  session: Session | null
  phase: AuthPhase
  ready: boolean
  checkingError: string
  notice: string
  retrySessionCheck: () => Promise<void>
  signOutLocally: () => Promise<string | null>
}

const AuthContext = createContext<AuthState>({
  session: null,
  phase: 'checking',
  ready: false,
  checkingError: '',
  notice: '',
  retrySessionCheck: async () => {},
  signOutLocally: async () => 'Supabase no está configurado.',
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<AuthSnapshot>(supabase
    ? INITIAL_AUTH_SNAPSHOT
    : { phase: 'anonymous', session: null, message: '' })

  useEffect(() => {
    if (!supabase) return

    let active = true
    let initialCheckSettled = false
    let eventVersion = 0
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return
      if (_event === 'INITIAL_SESSION' && !nextSession && !initialCheckSettled) {
        // Wait for getSession() to distinguish a real empty store from an
        // initial storage/refresh check failure; this prevents a login flash.
        return
      }
      if (_event === 'INITIAL_SESSION' && initialCheckSettled) {
        if (nextSession) {
          eventVersion += 1
          setAuth((current) => current.phase === 'error'
            ? authSnapshotFromEvent(current, _event, nextSession)
            : current)
        }
        return
      }
      initialCheckSettled = true
      eventVersion += 1
      setAuth((current) => authSnapshotFromEvent(current, _event, nextSession))
    })

    const versionAtStart = eventVersion
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active || initialCheckSettled || eventVersion !== versionAtStart) return
      initialCheckSettled = true
      setAuth((current) => authSnapshotFromCheck(current, data.session, Boolean(error)))
    }).catch(() => {
      if (!active || initialCheckSettled || eventVersion !== versionAtStart) return
      initialCheckSettled = true
      setAuth((current) => authSnapshotFromCheck(current, null, true))
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  const retrySessionCheck = useCallback(async () => {
    if (!supabase) return
    setAuth((current) => current.phase === 'authenticated' ? current : {
      phase: 'checking', session: null, message: '',
    })
    try {
      const { data, error } = await supabase.auth.getSession()
      setAuth((current) => authSnapshotFromCheck(current, data.session, Boolean(error)))
    } catch {
      setAuth((current) => authSnapshotFromCheck(current, null, true))
    }
  }, [])

  const signOutLocally = useCallback(async () => {
    if (!supabase) return 'Supabase no está configurado.'
    try {
      // Supabase defaults to global scope. Local scope signs out this browser
      // session without revoking sessions on the user's other devices.
      const { error } = await supabase.auth.signOut({ scope: 'local' })
      if (error) return 'No se pudo cerrar la sesión. Comprueba tu conexión e inténtalo de nuevo.'
      setAuth({ phase: 'anonymous', session: null, message: 'Has cerrado sesión en este navegador.' })
      return null
    } catch {
      return 'No se pudo cerrar la sesión. Inténtalo de nuevo.'
    }
  }, [])

  const value = useMemo(() => ({
    session: auth.session,
    phase: auth.phase,
    ready: auth.phase !== 'checking',
    checkingError: auth.phase === 'error' ? auth.message : '',
    notice: auth.phase === 'anonymous' ? auth.message : '',
    retrySessionCheck,
    signOutLocally,
  }), [auth, retrySessionCheck, signOutLocally])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
