import { useCallback, useEffect, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

/**
 * ログイン状態と初回案内の完了を持つ。目標のDBは扱わない（AUTH_PLAN 4章）。
 *
 * パスワードは `auth.users.encrypted_password` にあり、照合は Supabase の中で終わる。
 * JWT は `supabase.from(...)` に自動で付く。
 * 初回案内の完了は Auth の user_metadata に保存し、別端末でのログインにも引き継ぐ。
 *
 * 登録画面は無い。アカウントは管理画面で配る。
 */

/** 何が違うかは言わない。アドレスの存在を当てられるため（AUTH_PLAN 4章） */
const SIGN_IN_ERROR = 'メールアドレスかパスワードが違います'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  /** セッションの確認が終わったか。これが false の間はログイン画面も出さない */
  const [ready, setReady] = useState(false)
  const tutorialSave = useRef<{ userId: string; promise: Promise<boolean> } | null>(null)
  const currentUserId = useRef<string | null>(null)
  currentUserId.current = user?.id ?? null
  const tutorialCompleted = user?.user_metadata.tutorial_completed === true

  useEffect(() => {
    let alive = true

    // リロードしてもログインが続くのはここ。localStorage のセッションから戻す
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return
      setUser(data.session?.user ?? null)
      setReady(true)
    })

    // ログイン・ログアウト・トークン更新をまとめて受ける
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setReady(true)
    })

    return () => {
      alive = false
      sub.subscription.unsubscribe()
    }
  }, [])

  /**
   * ログインする。第2段階（Google）で差し替わるのはこの関数だけ。
   * `signInWithPassword` は throw せず `{ data, error }` を返す。
   * 返りはエラー文言（成功なら null）。
   */
  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (!error) return null
    return error.message === 'Invalid login credentials'
      ? SIGN_IN_ERROR
      : `ログインできませんでした（${error.message}）`
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  /** 初回案内の完了だけをアカウントに保存する。権限判定には使わない。 */
  const completeTutorial = useCallback((): Promise<boolean> => {
    if (!user) return Promise.resolve(false)
    if (tutorialCompleted) return Promise.resolve(true)
    if (tutorialSave.current?.userId === user.id) return tutorialSave.current.promise

    const request = { userId: user.id, promise: Promise.resolve(false) }
    const save = async () => {
      try {
        const { data, error } = await supabase.auth.updateUser({
          data: { tutorial_completed: true },
        })
        if (error) throw error
        if (!data.user || data.user.id !== user.id) return false
        if (currentUserId.current !== user.id) return false
        setUser((current) => current?.id === user.id ? data.user : current)
        return true
      } catch (error) {
        console.error('チュートリアル完了の保存に失敗:', error)
        if (currentUserId.current === user.id) {
          window.alert('チュートリアルの完了を保存できませんでした。通信状況を確認して、もう一度お試しください。')
        }
        return false
      }
    }
    request.promise = save().finally(() => {
      if (tutorialSave.current === request) tutorialSave.current = null
    })
    tutorialSave.current = request
    return request.promise
  }, [user, tutorialCompleted])

  return { user, ready, signIn, signOut, tutorialCompleted, completeTutorial }
}
