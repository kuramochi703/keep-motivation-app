import Avatar from '../avatar/Avatar'
import Logo from '../Logo'
import { levelOf } from '../logic'
import { useAccent } from '../ui/useAccent'

const PRESET = 50

type Props = {
  onStart: () => void
  variant?: number
}

export default function TopPage({ onStart, variant = 0 }: Props) {
  const L = levelOf(PRESET)
  useAccent(L)

  return (
    <div className="wrap top">
      <header className="top-head">
        <Logo width={64} />
        <h1>がんばり畑</h1>
        <p>
          1日5分でも畑に通えば、苗はすこしずつ育っていく。
          やることを細かく決めなくていい。手を抜いた日数だけ、苗はやつれていく。
        </p>
      </header>

      <section className="card top-card">
        <Avatar lv={L.lv} variant={variant} />
        <p className="speech">{L.say}</p>
        <p className="top-tag">— サボると、やつれる。 —</p>
        <div className="top-cta">
          <button className="btn top-btn" onClick={onStart}>
            はじめる
          </button>
        </div>
      </section>
    </div>
  )
}