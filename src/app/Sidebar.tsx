import Logo from '../ui/Logo'

export type NavItem = { id: string; label: string }

type Props = {
  items: NavItem[]
  current: string
  onSelect: (id: string) => void
  /** 表示名。JWT から来る（public に users テーブルは無い） */
  userLabel: string
  onSignOut: () => void
}

export default function Sidebar({ items, current, onSelect, userLabel, onSignOut }: Props) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <Logo width={26} />
        <span>がんばり畑</span>
      </div>
      <nav className="nav">
        {items.map((it) => (
          <button
            key={it.id}
            type="button"
            className={`nav-item${current === it.id ? ' active' : ''}`}
            aria-current={current === it.id ? 'page' : undefined}
            onClick={() => onSelect(it.id)}
          >
            {it.label}
          </button>
        ))}
      </nav>
      <div className="sidebar-user">
        <span className="sidebar-user-name" title={userLabel}>
          {userLabel}
        </span>
        <button type="button" className="btn ghost sidebar-signout" onClick={onSignOut}>
          ログアウト
        </button>
      </div>
    </aside>
  )
}