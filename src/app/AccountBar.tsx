import Logo from '../ui/Logo'

type Props = {
  email: string
  onSignOut: () => void
}

export default function AccountBar({ email, onSignOut }: Props) {
  return (
    <div className="account-bar" role="group" aria-label="アカウント">
      <div className="account-brand">
        <Logo width={30} />
        <span>がんばり畑</span>
      </div>
      <div className="account-meta">
        <span className="account-user" title={email}>
          <span className="account-avatar" aria-hidden="true">
            {(email[0] ?? '?').toUpperCase()}
          </span>
          <span className="account-email">{email}</span>
        </span>
        <button type="button" className="btn ghost account-signout" onClick={onSignOut}>
          ログアウト
        </button>
      </div>
    </div>
  )
}