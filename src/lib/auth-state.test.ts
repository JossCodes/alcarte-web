import { describe, expect, it } from 'vitest'
import type { Session } from '@supabase/supabase-js'
import {
  authenticatedHome,
  authSnapshotFromCheck,
  authSnapshotFromEvent,
  INITIAL_AUTH_SNAPSHOT,
  isPublicMenuPath,
  privateRouteDecision,
} from './auth-state'

function session(userId: string): Session {
  return { user: { id: userId } } as Session
}

describe('auth session state', () => {
  it('restores a persisted session after an initial check', () => {
    expect(authSnapshotFromCheck(INITIAL_AUTH_SNAPSHOT, session('owner-1'))).toMatchObject({
      phase: 'authenticated', session: { user: { id: 'owner-1' } },
    })
  })

  it('routes authenticated accounts according to the trusted platform-admin lookup', () => {
    expect(authenticatedHome(true)).toBe('/admin')
    expect(authenticatedHome(false)).toBe('/panel')
  })

  it('keeps anonymous users out of protected routes while allowing public menu paths', () => {
    expect(authSnapshotFromCheck(INITIAL_AUTH_SNAPSHOT, null).phase).toBe('anonymous')
    expect(privateRouteDecision('anonymous')).toBe('login')
    expect(privateRouteDecision('checking')).toBe('wait')
    expect(isPublicMenuPath('/m/cafe-demo')).toBe(true)
    expect(isPublicMenuPath('/panel')).toBe(false)
  })

  it('accepts refreshed tokens and clears the session on definitive expiry/sign-out', () => {
    const signedIn = authSnapshotFromEvent(INITIAL_AUTH_SNAPSHOT, 'SIGNED_IN', session('owner-1'))
    expect(authSnapshotFromEvent(signedIn, 'TOKEN_REFRESHED', session('owner-1')).phase).toBe('authenticated')
    expect(authSnapshotFromEvent(signedIn, 'SIGNED_OUT', null)).toMatchObject({ phase: 'anonymous', session: null })
  })

  it('does not discard an authenticated session on a transient initial network failure', () => {
    const signedIn = authSnapshotFromEvent(INITIAL_AUTH_SNAPSHOT, 'SIGNED_IN', session('owner-1'))
    expect(authSnapshotFromCheck(signedIn, null, true)).toBe(signedIn)
  })

  it('clears the prior identity on sign-out and replaces it on account change', () => {
    const firstUser = authSnapshotFromEvent(INITIAL_AUTH_SNAPSHOT, 'SIGNED_IN', session('owner-1'))
    const signedOut = authSnapshotFromEvent(firstUser, 'SIGNED_OUT', null)
    expect(signedOut.session).toBeNull()
    expect(authSnapshotFromEvent(signedOut, 'SIGNED_IN', session('admin-2')).session?.user.id).toBe('admin-2')
  })

  it('treats a sign-out event received from another tab as definitive for this browser session', () => {
    const active = authSnapshotFromEvent(INITIAL_AUTH_SNAPSHOT, 'SIGNED_IN', session('owner-1'))
    expect(authSnapshotFromEvent(active, 'SIGNED_OUT', null).phase).toBe('anonymous')
  })

  it('surfaces an initial session check failure instead of flashing the login form', () => {
    expect(authSnapshotFromCheck(INITIAL_AUTH_SNAPSHOT, null, true)).toMatchObject({
      phase: 'error', message: expect.stringContaining('No pudimos comprobar tu sesión'),
    })
  })
})
