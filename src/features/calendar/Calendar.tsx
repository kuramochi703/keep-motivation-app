import { useState, type CSSProperties } from 'react'
import './calendar.css'
import { daysUntil, isDone, key, parseKey, shift, today, type State } from '../../state/logic'

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

const md = (k: string) => {
  const d = parseKey(k)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

export default function Calendar({ state }: { state: State }) {
  const current = today(state)
  const currentKey = key(current)
  const [month, setMonth] = useState(() => new Date(current.getFullYear(), current.getMonth(), 1))
  const [selected, setSelected] = useState(() => currentKey)
  const start = shift(month, -month.getDay())
  const count = Math.ceil((month.getDay() + new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()) / 7) * 7
  const cells = Array.from({ length: count }, (_, i) => shift(start, i))
  const monthPrefix = key(month).slice(0, 7)
  const completed = state.done.filter((date) => date.startsWith(monthPrefix)).length

  const { startedAt, deadline } = state
  const left = daysUntil(state)
  const total = startedAt && deadline ? Math.round((parseKey(deadline).getTime() - parseKey(startedAt).getTime()) / 86400000) : 0
  const progress = total > 0 && left !== null ? Math.min(100, Math.max(0, ((total - left) / total) * 100)) : 0
  const inPeriod = (id: string) => !!startedAt && !!deadline && id >= startedAt && id <= deadline

  function changeMonth(offset: number) {
    const next = new Date(month.getFullYear(), month.getMonth() + offset, 1)
    setMonth(next)
    setSelected(key(next))
  }

  function showToday() {
    setMonth(new Date(current.getFullYear(), current.getMonth(), 1))
    setSelected(currentKey)
  }

  const isCurrentMonth = month.getFullYear() === current.getFullYear() && month.getMonth() === current.getMonth()
  const selectedTags = [selected === startedAt && 'START', selected === deadline && 'DEADLINE'].filter(Boolean).join(' / ')

  return (
    <section className="cal" aria-label="達成カレンダー">
      <div className="cal-heading">
        <div className="cal-nav">
          <button type="button" aria-label="前の月" onClick={() => changeMonth(-1)}>‹</button>
          <h3>{month.getFullYear()}年{month.getMonth() + 1}月</h3>
          <button type="button" aria-label="次の月" onClick={() => changeMonth(1)}>›</button>
        </div>
        {!isCurrentMonth && <button type="button" className="cal-back" onClick={showToday}>今月</button>}
      </div>
      <div className="cal-stats">
        <p><small>この月の達成</small><b>{completed}<em>日</em></b></p>
        <p><small>累計</small><b>{state.done.length}<em>日</em></b></p>
      </div>
      {startedAt && deadline && (
        <div className="cal-period">
          <div className="cal-period-row">
            <span><small>START</small>{md(startedAt)}</span>
            <strong className={left !== null && left <= 3 ? 'warn' : undefined}>
              {left === null ? '' : left < 0 ? `期限から${-left}日経過` : left === 0 ? '今日が期限' : `あと${left}日`}
            </strong>
            <span className="end"><small>DEADLINE</small>{md(deadline)}</span>
          </div>
          <i className="cal-period-bar" style={{ '--p': `${progress}%` } as CSSProperties} aria-hidden="true" />
        </div>
      )}
      <div className="cal-grid">
        {WEEKDAYS.map((day) => <span className="cal-weekday" key={day}>{day}</span>)}
        {cells.map((date) => {
          const id = key(date)
          const done = isDone(state, date)
          const inMonth = date.getMonth() === month.getMonth()
          const band = inPeriod(id)
          const isStart = id === startedAt
          const isDeadline = id === deadline
          const cellClass = `cal-cell${band ? ' in-period' : ''}${isStart ? ' period-start' : ''}${isDeadline ? ' period-end' : ''}`
          return (
            <div className={cellClass} key={id}>
              <button
                type="button"
                className={`cal-day${done ? ' achieved' : ''}${inMonth ? '' : ' outside'}${isDeadline ? ' deadline' : ''}`}
                aria-label={`${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日${done ? ' 達成済み' : ''}${isStart ? ' 開始日' : ''}${isDeadline ? ' 期限' : ''}`}
                aria-current={id === currentKey ? 'date' : undefined}
                aria-pressed={id === selected}
                onClick={() => {
                  setSelected(id)
                  if (!inMonth) setMonth(new Date(date.getFullYear(), date.getMonth(), 1))
                }}
              >
                {date.getDate()}
              </button>
              {(isStart || isDeadline) && (
                <small className={`cal-tag${isDeadline ? ' end' : ''}`} aria-hidden="true">{isDeadline ? 'DEADLINE' : 'START'}</small>
              )}
            </div>
          )
        })}
      </div>
      <p className="cal-detail" aria-live="polite">
        <time dateTime={selected}>{selected.replaceAll('-', '/')}{selectedTags && <em>{selectedTags}</em>}</time>
        <strong>{state.done.includes(selected) ? '達成済み' : selected > currentKey ? 'これからの日付です' : '達成の記録はありません'}</strong>
      </p>
    </section>
  )
}
