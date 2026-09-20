import { useState } from 'react'
import Calendar from '../features/calendar/Calendar'
import Avatar from '../avatar/Avatar'
import './main-page.css'
import {
  SESSION,
  daysUntil,
  fmtClock,
  isDone,
  isExpired,
  levelOf,
  streak,
  today,
  type State,
} from '../state/logic'
import { useAccent } from '../ui/useAccent'

const DASH = 326.7

type PanelId = 'goal' | 'calendar'

const PANELS: { id: PanelId; label: string; icon: string }[] = [
  { id: 'goal', label: '目標', icon: '✎' },
  { id: 'calendar', label: 'カレンダー', icon: '▣' },
]

type Props = {
  state: State
  elapsed: number
  running: boolean
  onToggleTimer: () => void
  onRecordOnly: () => void
  onNextDay: () => void
  onEditGoal: () => void
  onNewGoal: () => void
  onExtend: () => void
  onReset: () => void
}

export default function MainPage({
  state,
  elapsed,
  running,
  onToggleTimer,
  onRecordOnly,
  onNextDay,
  onEditGoal,
  onNewGoal,
  onExtend,
  onReset,
}: Props) {
  const t = today(state)
  const doneToday = isDone(state, t)
  const vital = state.vitality
  const L = levelOf(vital)
  useAccent(L)
  const st = streak(state)

  const expired = isExpired(state)
  const deadlineDays = daysUntil(state)
  const [yd, mo, dd] = (state.deadline ?? '').split('-').map(Number)
  const deadlineText = mo && dd ? `${mo}月${dd}日まで` : '設定されていません'
  const [open, setOpen] = useState<PanelId | null>(null)

  return (
    <div className="wrap dashboard">
      <header>
        <h1>がんばり畑</h1>
        <p>
          1日5分でいい。継続した日だけ、アバターの畑は少しずつ育っていく。
        </p>
      </header>

      {expired ? (
        <div className="dash-area">
          <section className="card done-overlay">
            <h2>目標の期間が終わりました</h2>
            <p className="sub">「{state.goal}」の振り返り</p>
            <div className="stats">
              <div>
                <b>{state.done.length}</b>
                <span>達成日数</span>
              </div>
              <div>
                <b>{st}</b>
                <span>今の連続日数</span>
              </div>
              <div>
                <b>{Math.max(state.best, st)}</b>
                <span>最長記録</span>
              </div>
            </div>
            <div className="acts done-acts">
              <button className="btn" onClick={onNewGoal}>
                新しい目標をはじめる
              </button>
              <button className="btn sec" onClick={onExtend}>
                期限を1ヶ月伸ばす
              </button>
            </div>
          </section>
        </div>
      ) : (
        <div className="dash-area">
          <div className={`bg-stage${open ? ' dim' : ''}`}>
            <div className="deco-window" aria-hidden="true" />
            <div className="deco-books" aria-hidden="true"><i /><i /><i /></div>
            <div className="deco-plant" aria-hidden="true">🪴</div>

            <div className="bg-top">
              <span className="badge">
                <i />
                <span>{L.name}</span>
              </span>
              <p className="speech">{L.say}</p>
            </div>

            <div className="stage-avatar">
              <Avatar lv={L.lv} variant={state.avatarId} vitality={vital} days={state.done.length} fill />
            </div>

            <p className="owner">{state.name}</p>
            <p className="bg-streak">🔥 {st}日連続</p>
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

            <div className="stage-timer" aria-label="5分タイマー">
              <div className="ring">
                <svg viewBox="0 0 120 120">
                  <circle className="track" cx="60" cy="60" r="52" />
                  <circle
                    className="prog"
                    cx="60"
                    cy="60"
                    r="52"
                    strokeDasharray={DASH}
                    strokeDashoffset={(DASH * (1 - Math.min(elapsed / SESSION, 1))).toFixed(1)}
                  />
                </svg>
                <div className="num">
                  <span>{fmtClock(elapsed)}</span>
                  <button
                    type="button"
                    className={`stage-toggler${running ? ' running' : ''}`}
                    aria-pressed={running}
                    aria-label={running ? '一時停止' : elapsed > 0 ? '再開する' : 'タイマーをはじめる'}
                    onClick={onToggleTimer}
                  >
                    <span aria-hidden="true">{running ? 'Ⅱ' : '▶'}</span>
                  </button>
                </div>
              </div>
              {!doneToday && (
                <button type="button" className="btn ghost stage-record" onClick={onRecordOnly}>
                  記録だけつける
                </button>
              )}
            </div>
          </div>

          <nav className="dash-menu" aria-label="メニュー">
            {PANELS.map((panel) => (
              <button
                key={panel.id}
                type="button"
                className={`menu-btn${open === panel.id ? ' active' : ''}`}
                aria-pressed={open === panel.id}
                onClick={() => setOpen((current) => (current === panel.id ? null : panel.id))}
              >
                <span aria-hidden="true">{panel.icon}</span>
                {panel.label}
              </button>
            ))}
          </nav>

          <section
            className={`dash-panel${open ? ' open' : ''}`}
            aria-hidden={open === null}
            aria-label="ダッシュボードパネル"
          >
            <button type="button" className="panel-close" aria-label="閉じる" onClick={() => setOpen(null)}>
              ✕
            </button>

            {open === 'goal' && (
              <div className="panel-body">
                <h2>目標</h2>
                <div className="goal goal-card">
                  <span className="goal-text" title={state.goal}>
                    <span aria-hidden="true">✎ </span>{state.goal}
                  </span>
                </div>

                <div className={`deadline${deadlineDays !== null && deadlineDays <= 3 ? ' warn' : ''}`}>
                  <div className="deadline-label">
                    <small>目標の期限は</small>
                    <span>{deadlineText}</span>
                  </div>
                  <p className="deadline-days">
                    あと <b>{deadlineDays !== null ? deadlineDays : '—'}</b><small>日</small>
                  </p>
                </div>
                <p className="deadline-hint">
                  {deadlineDays !== null && deadlineDays <= 3 ? 'あと少し！今日の1つを積んでいこう。' : '自分のペースで続ければ、きっと大丈夫。'}
                </p>

                <button className="btn new-goal-cta" onClick={onEditGoal}>
                  新しい目標をはじめる
                </button>

                <div className="tools">
                  <button className="btn ghost" onClick={onNextDay}>
                    翌日にする（お試し）
                  </button>
                  <button className="btn ghost" onClick={onReset}>
                    最初から
                  </button>
                </div>
              </div>
            )}

            {open === 'calendar' && (
              <div className="panel-body">
                <h2>達成カレンダー</h2>
                <Calendar state={state} />
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}