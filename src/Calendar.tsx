import { useId, useState } from 'react'
import { isDone, key, shift, today, type State } from './logic'

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

export default function Calendar({ state }: { state: State }) {
  const [visible, setVisible] = useState(true)
  const panelId = useId()
  const current = today(state)
  const [month, setMonth] = useState(() => new Date(current.getFullYear(), current.getMonth(), 1))
  const [selected, setSelected] = useState(() => key(current))
  const start = shift(month, -month.getDay())
  const count = Math.ceil((month.getDay() + new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()) / 7) * 7
  const cells = Array.from({ length: count }, (_, i) => shift(start, i))
  const monthPrefix = key(month).slice(0, 7)
  const completed = state.done.filter((date) => date.startsWith(monthPrefix)).length

  function changeMonth(offset: number) {
    const next = new Date(month.getFullYear(), month.getMonth() + offset, 1)
    setMonth(next)
    setSelected(key(next))
  }

  function showToday() {
    setMonth(new Date(current.getFullYear(), current.getMonth(), 1))
    setSelected(key(current))
  }

  return (
    <section className="cal" aria-label="達成カレンダー">
      <div className="cal-heading">
        <h3>達成カレンダー</h3>
        <button
          type="button"
          className="btn ghost"
          aria-expanded={visible}
          aria-controls={panelId}
          onClick={() => setVisible((value) => !value)}
        >
          {visible ? 'カレンダーを閉じる' : 'カレンダーを表示'}
        </button>
      </div>
      <div id={panelId} hidden={!visible} className="cal-panel">
      <div className="cal-heading">
        <h3>{month.getFullYear()}年{month.getMonth() + 1}月</h3>
        <div className="cal-nav">
          <button type="button" className="btn ghost" aria-label="前の月" onClick={() => changeMonth(-1)}>‹</button>
          <button type="button" className="btn ghost" onClick={showToday}>今日</button>
          <button type="button" className="btn ghost" aria-label="次の月" onClick={() => changeMonth(1)}>›</button>
        </div>
      </div>
      <p className="cal-summary">この月の達成：{completed}日</p>
      <div className="cal-grid">
        {WEEKDAYS.map((day) => <span className="cal-weekday" key={day}>{day}</span>)}
        {cells.map((date) => {
          const id = key(date)
          const done = isDone(state, date)
          const inMonth = date.getMonth() === month.getMonth()
          return (
            <button
              type="button"
              key={id}
              className={`cal-day${done ? ' achieved' : ''}${inMonth ? '' : ' outside'}`}
              aria-label={`${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日${done ? ' 達成済み' : ''}`}
              aria-current={id === key(current) ? 'date' : undefined}
              aria-pressed={id === selected}
              onClick={() => {
                setSelected(id)
                if (!inMonth) setMonth(new Date(date.getFullYear(), date.getMonth(), 1))
              }}
            >
              <span>{date.getDate()}</span>
              <small aria-hidden="true">{done ? '✓' : '\u00a0'}</small>
            </button>
          )
        })}
      </div>
      <p className="cal-detail" aria-live="polite">
        <time dateTime={selected}>{selected.replaceAll('-', '/')}</time>
        <strong>{state.done.includes(selected) ? '達成済み' : selected > key(current) ? 'これからの日付です' : '達成の記録はありません'}</strong>
      </p>
      <p className="cal-summary">✓ 達成済み・下線は今日・枠は選択中の日付</p>
      </div>
    </section>
  )
}
