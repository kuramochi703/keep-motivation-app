import { useState, type CSSProperties } from 'react'
import Avatar from '../avatar/Avatar'
import {
  CYCLES,
  HUES,
  MOODS,
  addMonths,
  key,
  parseKey,
  type SetupInput,
  type State,
} from '../state/logic'

type Props = {
  state: State
  onStart: (input: SetupInput) => void
}

const PRESETS = [
  { n: 1, label: '1ヶ月後' },
  { n: 3, label: '3ヶ月後' },
  { n: 6, label: '半年後' },
  { n: 12, label: '1年後' },
]

/** 見本のアバター。**気分は「いきいき」で固定**。色で選べるように一番のびのびした姿を出す */
const SAMPLE_MOOD = MOODS.find((m) => m.id === 'lively') ?? null

export default function SetupPage({ state, onStart }: Props) {
  const [draft, setDraft] = useState(state.goal)
  const [deadline, setDeadline] = useState(state.deadline ?? '')
  const [cycleDays, setCycleDays] = useState(state.cycleDays || 1)
  const [hue, setHue] = useState(state.hue)
  const [name, setName] = useState(state.name)

  const todayKey = key(new Date())
  const daysTo = deadline
    ? Math.round((parseKey(deadline).getTime() - parseKey(todayKey).getTime()) / 86400000)
    : null

  // 名前は必須。アバター3種が無くなったので、既定値の出どころが無い
  const ready = draft.trim().length > 0 && deadline.length > 0 && name.trim().length > 0

  const submit = () => {
    if (!ready) return
    onStart({ goal: draft.trim(), deadline, cycleDays, hue, name: name.trim() })
  }

  return (
    <div className="wrap setup">
      <header>
        <h1>がんばり畑</h1>
        <p>
          やることを細かく決めなくていい。決めたペースで机に向かえば、そのサイクルは達成。
          サイクルを続けるほどアバターは色づき、止まると色が抜けていく。
        </p>
      </header>

      <section className="card setup-card">
        <div className="setup-block">
          <label className="setup-label" htmlFor="goal-input">
            いま頑張っていることは？
          </label>
          <input
            className="setup-input"
            id="goal-input"
            type="text"
            maxLength={30}
            placeholder="例: 資格の勉強"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
            }}
          />
        </div>

        <div className="setup-block">
          <label className="setup-label">
            目標の期限 <em>必須</em>
          </label>
          <div className="presets">
            {PRESETS.map((p) => (
              <button
                key={p.n}
                type="button"
                className={`preset${deadline === key(addMonths(new Date(), p.n)) ? ' active' : ''}`}
                onClick={() => setDeadline(key(addMonths(new Date(), p.n)))}
              >
                {p.label}
              </button>
            ))}
          </div>
          <input
            className="date-field"
            type="date"
            min={todayKey}
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
          />
          {daysTo !== null && <p className="hint">期限まであと {daysTo} 日</p>}
        </div>

        <div className="setup-block">
          <label className="setup-label">
            取り組むペース <em>必須</em>
          </label>
          <div className="freqs">
            {CYCLES.map((c) => (
              <button
                key={c.days}
                type="button"
                className={`seg${cycleDays === c.days ? ' active' : ''}`}
                aria-pressed={cycleDays === c.days}
                onClick={() => setCycleDays(c.days)}
              >
                {c.label}
              </button>
            ))}
          </div>
          <p className="hint">
            連続もお休みも「日」ではなく<b>サイクル</b>で数えます。
            {cycleLabelNote(cycleDays)}
            <br />
            <b>あとから変えられません。</b>変えたくなったら、新しい目標をたまごから始めます。
          </p>
        </div>

        <div className="setup-block">
          <label className="setup-label">
            アバターの色 <em>必須</em>
          </label>
          {/* 見本の3D は1体だけ。色は CSS の丸で選ぶ。
              選択肢ごとに WebGL キャンバスを並べると、端末によっては
              それだけで描画が重くなる */}
          <div className="avatar-picker">
            <div className="avatar-sample">
              <Avatar stage={2} hue={hue} mood={SAMPLE_MOOD} />
            </div>
            <div className="hues" role="group" aria-label="アバターの色">
              {HUES.map((h) => (
                <button
                  key={h.hue}
                  type="button"
                  className={`hue-dot${hue === h.hue ? ' active' : ''}`}
                  style={{ '--dot': `hsl(${h.hue}, 56%, 70%)` } as CSSProperties}
                  aria-pressed={hue === h.hue}
                  aria-label={h.label}
                  title={h.label}
                  onClick={() => setHue(h.hue)}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="setup-block">
          <label className="setup-label" htmlFor="name-input">
            アバターの名前 <em>必須</em>
          </label>
          <input
            className="setup-input"
            id="name-input"
            type="text"
            maxLength={12}
            placeholder="例: もりお"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <button type="button" className="btn top-btn" onClick={submit} disabled={!ready}>
          この目標で始める
        </button>
      </section>
    </div>
  )
}

const cycleLabelNote = (days: number) =>
  days === 1 ? '1日が1サイクルです。' : `${days}日が1サイクルです。`
