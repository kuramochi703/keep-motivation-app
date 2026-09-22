import { useCallback, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

/**
 * ログイン状態だけを持つ。DB のことは知らない（AUTH_PLAN 4章）。
 *
 * パスワードは `auth.users.encrypted_password` にあり、照合は Supabase の中で終わる。
 * こちら側が触るのは JWT だけで、`supabase.from(...)` には自動で付く。
 *
 * 登録画面は無い。アカウントは管理画面で配る。
 */

/** 何が違うかは言わない。アドレスの存在を当てられるため（AUTH_PLAN 4章） */
const SIGN_IN_ERROR = 'メールアドレスかパスワードが違います'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  /** セッションの確認が終わったか。これが false の間はログイン画面も出さない */
  const [ready, setReady] = useState(false)

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

  return { user, ready, signIn, signOut }
}
