import Logo from './Logo'

export type NavItem = { id: string; label: string }

type Props = {
  items: NavItem[]
  current: string
  onSelect: (id: string) => void
}

export default function Sidebar({ items, current, onSelect }: Props) {
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
    </aside>
  )
}