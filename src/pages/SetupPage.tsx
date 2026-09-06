import { useState } from 'react'
import Avatar from '../avatar/Avatar'
import {
  AVATARS,
  FREQUENCIES,
  addMonths,
  key,
  parseKey,
  type AvatarId,
  type Frequency,
  type SetupInput,
  type State,
} from '../logic'

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

export default function SetupPage({ state, onStart }: Props) {
  const [draft, setDraft] = useState(state.goal)
  const [deadline, setDeadline] = useState(state.deadline ?? '')
  const [frequency, setFrequency] = useState<Frequency>(state.frequency)
  const [avatarId, setAvatarId] = useState<AvatarId>(state.avatarId)
  const [name, setName] = useState(state.name)

  const todayKey = key(new Date())
  const daysTo = deadline
    ? Math.round((parseKey(deadline).getTime() - parseKey(todayKey).getTime()) / 86400000)
    : null

  const ready = draft.trim().length > 0 && deadline.length > 0

  const pickAvatar = (id: AvatarId) => {
    setAvatarId(id)
    setName((prev) =>
      prev === '' || prev === AVATARS[avatarId].name ? AVATARS[id].name : prev
    )
  }

  const submit = () => {
    if (!ready) return
    onStart({
      goal: draft.trim(),
      deadline,
      frequency,
      avatarId,
      name: name.trim() || AVATARS[avatarId].name,
    })
  }

  return (
    <div className="wrap setup">
      <header>
        <h1>サボると、やつれる。</h1>
        <p>
          やることを細かく決めなくていい。1日5分でも机に向かえば、その日は達成。手を止めた日数だけ、アバターは痩せていく。
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
          <label className="setup-label">取り組む頻度（任意）</label>
          <div className="freqs">
            {FREQUENCIES.map((f) => (
              <button
                key={f.id}
                type="button"
                className={`seg${frequency === f.id ? ' active' : ''}`}
                aria-pressed={frequency === f.id}
                onClick={() => setFrequency(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="setup-block">
          <label className="setup-label">
            育てるアバター <em>必須</em>
          </label>
          <div className="avators">
            {AVATARS.map((a) => (
              <button
                key={a.id}
                type="button"
                className={`avator-card${avatarId === a.id ? ' active' : ''}`}
                aria-pressed={avatarId === a.id}
                onClick={() => pickAvatar(a.id)}
              >
                {/* 3D は活力とステージで見た目が決まる。選ぶ時の見本なので、
                    たまご（0日）ではなく育った姿を固定値で見せる */}
                <Avatar lv={2} variant={a.id} vitality={60} days={7} />
                <b>{a.name}</b>
                <span>{a.desc}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="setup-block">
          <label className="setup-label" htmlFor="name-input">
            アバターの名前（任意）
          </label>
          <input
            className="setup-input"
            id="name-input"
            type="text"
            maxLength={12}
            placeholder={AVATARS[avatarId].name}
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