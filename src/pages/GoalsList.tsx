import type { CSSProperties } from 'react'
import './goals-list.css'
import {
  cycleLabel,
  daysUntil,
  isExpired,
  key,
  moodOf,
  runOf,
  startOf,
  today,
  type State,
} from '../state/logic'
import { evolutionOf } from '../avatar/stage'

type Props = {
  /** 新しい順。`useGoalState` がそのまま渡す */
  goals: State[]
  /** いま開いている目標。null は「どれも開いていない」 */
  currentGoalId: number | null
  onSelect: (id: number) => void
  onNewGoal: () => void
}

/**
 * 目標の一覧。**目標は同時に何本あってもよく、ここで開くものを選ぶ。**
 *
 * 数字は1つも保存していない。連続サイクルもステージも気分も、カードを描くたびに
 * `done` と `cycleDays` から計算している（README 2章）。ダッシュボードと同じ関数を
 * 呼んでいるので、一覧とダッシュボードで値が食い違うことはない。
 */
export default function GoalsList({ goals, currentGoalId, onSelect, onNewGoal }: Props) {
  return (
    <section className="goals" aria-labelledby="goals-list-title">
      <header className="goals-head">
        <h3 id="goals-list-title">目標一覧</h3>
        <p className="goals-lead">
          育てているアバターは目標ごとに別々です。切り替えても記録は消えません。
        </p>
      </header>

      <div className="goals-scroll">
      {goals.length === 0 ? (
        <div className="card goals-empty">
          <p>まだ目標がありません。</p>
        </div>
      ) : (
          <ul className="goal-list">
            {goals.map((g) => (
              <GoalCard
                key={g.goalId}
                goal={g}
                current={g.goalId === currentGoalId}
                onSelect={onSelect}
              />
            ))}
          </ul>
      )}
      </div>
      <footer className="goals-actions">
        <button type="button" className="btn" onClick={onNewGoal}>
          新しい目標を作る
        </button>
      </footer>
    </section>
  )
}

/**
 * 期限の出し方。ダッシュボードと同じ「○月○日」と、残り日数を分けて返す。
 * 残りが読めないと「あと何日ぶんの猶予か」が分からない
 */
function deadlineOf(g: State): { date: string; left: string } {
  if (!g.deadline) return { date: 'なし', left: '' }
  const [, m, d] = g.deadline.split('-').map(Number)
  const date = m && d ? `${m}月${d}日` : g.deadline
  const left = daysUntil(g)
  if (left === null) return { date, left: '' }
  if (isExpired(g)) return { date, left: '期限切れ' }
  if (left === 0) return { date, left: '今日まで' }
  return { date, left: `あと${left}日` }
}

function GoalCard({
  goal,
  current,
  onSelect,
}: {
  goal: State
  current: boolean
  onSelect: (id: number) => void
}) {
  const t = today(goal)
  const stage = evolutionOf(goal.done, goal.cycleDays, startOf(goal), key(t))
  // **気分はステージ1以上のもの。** たまごに気分は無い（MainPage と同じ扱い）
  const mood = stage.id === 0 ? null : moodOf(goal)

  // 目標が無い状態のカードは描かれないが、型のうえでは null がありうる
  if (goal.goalId === null) return null
  const id = goal.goalId

  const deadline = deadlineOf(goal)
  const expired = isExpired(goal)
  // カードごとに色相と彩度を差し替える。目標ごとにアバターの色が違う
  const tint = { ['--h' as string]: goal.hue, ['--s' as string]: mood?.s ?? 24 }

  return (
    <li>
      <button
        type="button"
        className={`goal-card${current ? ' current' : ''}`}
        aria-current={current ? 'true' : undefined}
        onClick={() => onSelect(id)}
        style={tint as CSSProperties}
      >
        <span className="goal-card-dot" aria-hidden="true" />

        <span className="goal-card-body">
          <span className="goal-card-top">
            <span className="goal-card-name">{goal.name}</span>
            <span className="goal-card-stage">{stage.name}</span>
            <span className="goal-card-cycle">{cycleLabel(goal.cycleDays)}</span>
            {current && <span className="goal-card-badge">開いています</span>}
          </span>

          <span className="goal-card-goal">{goal.goal}</span>

          <span className="goal-card-stats">
            <span className="goal-stat">
              <span className="goal-stat-label">連続</span>
              <span className="goal-stat-value"><b>{runOf(goal)}</b>サイクル</span>
            </span>
            <span className="goal-stat">
              <span className="goal-stat-label">達成</span>
              <span className="goal-stat-value"><b>{goal.done.length}</b>日</span>
            </span>
            <span className={`goal-stat${expired ? ' expired' : ''}`}>
              <span className="goal-stat-label">期限</span>
              <span className="goal-stat-value">
                <b className="date">{deadline.date}</b>
                {deadline.left && <small>{deadline.left}</small>}
              </span>
            </span>
          </span>
        </span>
      </button>
    </li>
  )
}
