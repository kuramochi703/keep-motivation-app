export type NavItem = { id: string; label: string }

type Props = {
  items: NavItem[]
  current: string
  onSelect: (id: string) => void
}

export default function Sidebar({ items, current, onSelect }: Props) {
  return (
    <aside className="sidebar">
      <p className="brand">サボると、やつれる。</p>
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