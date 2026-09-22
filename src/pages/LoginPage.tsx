import { useState } from 'react'
import Logo from '../ui/Logo'

type Props = {
  /** 成功なら null、失敗ならそのまま出すエラー文言を返す */
  onSignIn: (email: string, password: string) => Promise<string | null>
}

/**
 * ログイン画面。入力欄2つ・ボタン1つ・エラー表示だけ（AUTH_PLAN 4章）。
 * アカウントは管理画面で配るので、**新規登録リンクは置かない**。
 */
export default function LoginPage({ onSignIn }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const ready = email.trim().length > 0 && password.length > 0

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ready || busy) return
    setBusy(true)
    setError(null)
    // 失敗しても画面は生きたまま。busy を戻すのは成功・失敗どちらでも
    const message = await onSignIn(email.trim(), password)
    setBusy(false)
    if (message) {
      setError(message)
      setPassword('')
    }
    // 成功したときは onAuthStateChange が App のゲートを開ける
  }

  return (
    <div className="wrap login">
      <header className="login-head">
        <Logo width={44} />
        <h1>がんばり畑</h1>
        <p>ログインすると、自分の目標と記録が出てきます。</p>
      </header>

      <form className="card login-card" onSubmit={submit}>
        <div className="setup-block">
          <label className="setup-label" htmlFor="login-email">
            メールアドレス
          </label>
          <input
            className="setup-input"
            id="login-email"
            type="email"
            autoComplete="username"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="setup-block">
          <label className="setup-label" htmlFor="login-password">
            パスワード
          </label>
          <input
            className="setup-input"
            id="login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && (
          <p className="login-error" role="alert">
            {error}
          </p>
        )}

        <button className="btn" type="submit" disabled={!ready || busy}>
          {busy ? 'ログイン中...' : 'ログイン'}
        </button>
      </form>
    </div>
  )
}
