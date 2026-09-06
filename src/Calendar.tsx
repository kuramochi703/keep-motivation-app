import { useState, type CSSProperties } from 'react'
import { isDone, key, shift, streak, today, type State } from './logic'
import MonthlyCalendar from './MonthlyCalendar'
import './calendar.css'

export default function Calendar({ state }: { state: State }) {
  const [view, setView] = useState<'week' | 'month'>('week')
  const [selected, setSelected] = useState<string | null>(null)
  const current = today(state)
  const currentKey = key(current)
  const start = shift(current, -((current.getDay() + 6) % 7))
  const days = Array.from({ length: 7 }, (_, i) => shift(start, i))
  const completed = days.filter((d) => key(d) <= currentKey && isDone(state, d)).length
  const rate = Math.round(completed / (((current.getDay() + 6) % 7) + 1) * 100)

  return (
    <section className="cal activity-calendar" aria-label="達成カレンダー">
      <div className="cal-heading">
        <h3>▣ 達成カレンダー</h3>
        <div className="period-switch" role="group" aria-label="表示期間">
          <button type="button" aria-pressed={view === 'week'} onClick={() => setView('week')}>今週</button>
          <button type="button" aria-pressed={view === 'month'} onClick={() => setView('month')}>1か月</button>
        </div>
      </div>
      <div className="activity-summary">
        <div><span className="summary-icon" aria-hidden="true">▣</span><p><small>今週</small><b>{completed}/7</b></p></div>
        <div><i className="rate-ring" style={{ '--rate': `${rate}%` } as CSSProperties} aria-hidden="true" /><p><small>今週の達成率</small><b>{rate}%</b></p></div>
        <div><span className="summary-icon blue" aria-hidden="true">▥</span><p><small>累計</small><b>{state.done.length}日</b></p></div>
        <aside><span aria-hidden="true">🌱</span>{isDone(state, current) ? <>今日も一歩前進！<br />自分のペースで続けよう。</> : <>小さな一歩を、<br />今日の達成につなげよう。</>}</aside>
      </div>
      {view === 'month' ? <MonthlyCalendar state={state} /> : <>
        <div className="week-layout">
          <div className="week-grid">
            {['月', '火', '水', '木', '金', '土', '日'].map((d) => <span className="week-label" key={d}>{d}</span>)}
            {days.map((d) => {
              const id = key(d)
              const done = isDone(state, d)
              const future = id > currentKey
              return <button type="button" key={id} className={`week-day${done ? ' achieved' : ''}${future ? ' future' : ''}`}
                aria-label={`${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${done ? '達成済み' : future ? 'これからの日付' : '達成の記録なし'}`}
                aria-current={id === currentKey ? 'date' : undefined} aria-pressed={selected === id} onClick={() => setSelected(id)}>
                <span>{d.getMonth() + 1}/{d.getDate()}</span><i aria-hidden="true">{done ? '✓' : future ? '·' : '●'}</i>
              </button>
            })}
          </div>
          <div className="week-legend"><span><i className="legend-done">✓</i>達成した日</span><span><i className="legend-missed" />達成の記録なし</span><span><i className="legend-today" />今日</span><span className="legend-streak">●　連続 {streak(state)}日</span></div>
        </div>
        {selected && <p className="cal-detail" aria-live="polite"><time dateTime={selected}>{selected.replaceAll('-', '/')}</time><strong>{state.done.includes(selected) ? '達成済み' : selected > currentKey ? 'これからの日付です' : '達成の記録はありません'}</strong></p>}
      </>}
      <p className="activity-footnote">達成率は今週の月曜日から今日までの日数で計算しています。</p>
    </section>
  )
}
