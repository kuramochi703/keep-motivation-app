// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { User } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from './useAuth'

const authApi = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  updateUser: vi.fn(),
}))
vi.mock('../lib/supabase', () => ({ supabase: { auth: authApi } }))

function user(id = 'account-a', metadata: Record<string, unknown> = {}): User {
  return { id, aud: 'authenticated', app_metadata: {}, user_metadata: metadata, created_at: '' }
}

type UpdateResult = { data: { user: User | null }; error: Error | null }
type Session = { user: User } | null

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

describe('account tutorial completion', () => {
  let root: Root
  let container: HTMLDivElement
  let auth: ReturnType<typeof useAuth>
  let restoredUser: User | null
  let onAuthChange: (event: string, session: Session) => void
  const unsubscribe = vi.fn()

  function Harness() {
    auth = useAuth()
    return null
  }

  async function render() {
    await act(async () => { root.render(createElement(Harness)) })
  }

  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    vi.spyOn(window, 'alert').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    restoredUser = user()
    authApi.getSession.mockImplementation(async () => ({
      data: { session: restoredUser ? { user: restoredUser } : null },
    }))
    authApi.onAuthStateChange.mockImplementation((callback: typeof onAuthChange) => {
      onAuthChange = callback
      return { data: { subscription: { unsubscribe } } }
    })
    authApi.updateUser.mockResolvedValue({
      data: { user: user('account-a', { tutorial_completed: true }) }, error: null,
    })
    authApi.signInWithPassword.mockResolvedValue({ error: null })
    authApi.signOut.mockResolvedValue({ error: null })
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => { root.unmount() })
    expect(unsubscribe).toHaveBeenCalledOnce()
    container.remove()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it.each([true, false])('restores tutorial completion %s from the saved session', async (completed) => {
    restoredUser = user('account-a', completed ? { tutorial_completed: true } : {})
    await render()
    expect(auth.ready).toBe(true)
    expect(auth.tutorialCompleted).toBe(completed)
    expect(authApi.updateUser).not.toHaveBeenCalled()
  })

  it.each([true, false])('reads tutorial completion %s from the signed-in account', async (completed) => {
    restoredUser = null
    await render()
    const signedInUser = user('account-b', completed ? { tutorial_completed: true } : {})
    await act(async () => { onAuthChange('SIGNED_IN', { user: signedInUser }) })
    expect(auth.user?.id).toBe('account-b')
    expect(auth.tutorialCompleted).toBe(completed)
    expect(authApi.updateUser).not.toHaveBeenCalled()
  })

  it('saves only the completion marker and keeps the account metadata returned by Auth', async () => {
    restoredUser = user('account-a', { name: 'みどり' })
    const savedUser = user('account-a', { name: 'みどり', tutorial_completed: true })
    authApi.updateUser.mockResolvedValue({ data: { user: savedUser }, error: null })
    await render()

    let result: boolean | undefined
    await act(async () => { result = await auth.completeTutorial() })
    expect(result).toBe(true)
    expect(authApi.updateUser).toHaveBeenCalledExactlyOnceWith({ data: { tutorial_completed: true } })
    expect(auth.tutorialCompleted).toBe(true)
    expect(auth.user?.user_metadata).toEqual({ name: 'みどり', tutorial_completed: true })
  })

  it('does not mark the tutorial complete before the save resolves', async () => {
    const save = deferred<UpdateResult>()
    authApi.updateUser.mockReturnValue(save.promise)
    await render()
    let request!: Promise<boolean>
    await act(async () => { request = auth.completeTutorial() })
    expect(auth.tutorialCompleted).toBe(false)

    await act(async () => {
      save.resolve({ data: { user: user('account-a', { tutorial_completed: true }) }, error: null })
      expect(await request).toBe(true)
    })
    expect(auth.tutorialCompleted).toBe(true)
  })

  it('reports a failed save, stays incomplete, and allows another attempt', async () => {
    authApi.updateUser.mockResolvedValueOnce({
      data: { user: null }, error: new Error('network unavailable'),
    })
    await render()
    await act(async () => { expect(await auth.completeTutorial()).toBe(false) })
    expect(auth.tutorialCompleted).toBe(false)
    expect(window.alert).toHaveBeenCalledOnce()

    await act(async () => { expect(await auth.completeTutorial()).toBe(true) })
    expect(authApi.updateUser).toHaveBeenCalledTimes(2)
    expect(auth.tutorialCompleted).toBe(true)
  })

  it('combines repeated clicks into one pending save', async () => {
    const save = deferred<UpdateResult>()
    authApi.updateUser.mockReturnValue(save.promise)
    await render()
    let first!: Promise<boolean>
    let second!: Promise<boolean>
    await act(async () => {
      first = auth.completeTutorial()
      second = auth.completeTutorial()
    })
    expect(first).toBe(second)
    expect(authApi.updateUser).toHaveBeenCalledOnce()

    await act(async () => {
      save.resolve({ data: { user: user('account-a', { tutorial_completed: true }) }, error: null })
      expect(await first).toBe(true)
      expect(await second).toBe(true)
    })
  })

  it('does not write again when the account already completed the tutorial', async () => {
    restoredUser = user('account-a', { tutorial_completed: true })
    await render()
    await act(async () => { expect(await auth.completeTutorial()).toBe(true) })
    expect(authApi.updateUser).not.toHaveBeenCalled()
  })

  it('does not save when there is no signed-in account', async () => {
    restoredUser = null
    await render()
    await act(async () => { expect(await auth.completeTutorial()).toBe(false) })
    expect(authApi.updateUser).not.toHaveBeenCalled()
  })

  it.each(['sign out', 'switch account'])('does not restore the previous user after %s during a save', async (action) => {
    const save = deferred<UpdateResult>()
    authApi.updateUser.mockReturnValue(save.promise)
    await render()
    let request!: Promise<boolean>
    await act(async () => { request = auth.completeTutorial() })

    const nextUser = action === 'sign out' ? null : user('account-b')
    await act(async () => {
      onAuthChange(nextUser ? 'SIGNED_IN' : 'SIGNED_OUT', nextUser ? { user: nextUser } : null)
    })
    await act(async () => {
      save.resolve({ data: { user: user('account-a', { tutorial_completed: true }) }, error: null })
      expect(await request).toBe(false)
    })
    expect(auth.user).toEqual(nextUser)
    expect(auth.tutorialCompleted).toBe(false)
    expect(window.alert).not.toHaveBeenCalled()
  })
})
