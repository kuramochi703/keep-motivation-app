import { useState } from 'react'
import Avatar from '../avatar/Avatar'
import { levelOf } from '../logic'
import { useAccent } from '../ui/useAccent'

const PRESET = 50

type Props = {
  onStart: () => void
  variant?: number
}

export default function TopPage({ onStart, variant = 0 }: Props) {
  const [vital, setVital] = useState(PRESET)
  const L = levelOf(vital)
  useAccent(L)

  return (
    <div className="wrap top">
      <header>
        <h1>サボると、やつれる。</h1>
        <p>
          やることを細かく決めなくていい。1日5分でも机に向かえば、その日は達成。手を止めた日数だけ、アバターは痩せていく。
        </p>
      </header>

      <section className="card top-card">
        <Avatar lv={L.lv} variant={variant} />
        <p className="speech">{L.say}</p>
        <div className="meter">
          <div className="row">
            <span>活力</span>
            <b>
              {vital}
              <small>/100</small>
            </b>
          </div>
          <div className="gauge">
            <i style={{ width: `${vital}%` }} />
          </div>
        </div>
        <label className="preview top-preview">
          スライドでわかる、サボりの代償
          <input
            type="range"
            min={0}
            max={100}
            value={vital}
            aria-label="活力を動かしてアバターの変化を確認"
            onChange={(e) => setVital(Number(e.target.value))}
          />
        </label>
        <div className="top-cta">
          <button className="btn top-btn" onClick={onStart}>
            はじめる
          </button>
        </div>
      </section>
    </div>
  )
}