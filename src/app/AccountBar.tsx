type Props = {
  email: string
  onSignOut: () => void
}

export default function AccountBar({ email, onSignOut }: Props) {
  return (
    <div className="account-bar" role="group" aria-label="アカウント">
      <span className="account-email">{email}</span>
      <button type="button" className="btn ghost account-signout" onClick={onSignOut}>
        ログアウト
      </button>
    </div>
  )
}
