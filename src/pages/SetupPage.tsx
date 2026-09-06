import { useState } from 'react'

type Props = {
  goal: string
  onStart: (goal: string) => void
}

export default function SetupPage({ goal, onStart }: Props) {
  const [draft, setDraft] = useState(goal)

  const submit = () => {
    const g = draft.trim()
    if (g) onStart(g)
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
        <label className="setup-label" htmlFor="goal-input">
          いま頑張っていることは？
        </label>
        <div className="field">
          <input
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
          <button className="btn" onClick={submit} disabled={!draft.trim()}>
            はじめる
          </button>
        </div>
      </section>
    </div>
  )
}