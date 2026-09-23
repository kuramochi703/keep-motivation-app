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

      {goals.length === 0 ? (
        <div className="card goals-empty">
          <p>まだ目標がありません。</p>
          <button type="button" className="btn" onClick={onNewGoal}>
            最初の目標を作る
          </button>
        </div>
      ) : (
        <>
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
          <div className="goals-actions">
            <button type="button" className="btn" onClick={onNewGoal}>
              新しい目標を作る
            </button>
          </div>
        </>
      )}
    </section>
  )
}

/** 期限の出し方。残りが読めないと「あと何日ぶんの猶予か」が分からない */
function deadlineText(g: State): string {
  if (!g.deadline) return '期限なし'
  const left = daysUntil(g)
  if (left === null) return g.deadline
  if (isExpired(g)) return `${g.deadline}（期限切れ）`
  if (left === 0) return `${g.deadline}（今日まで）`
  return `${g.deadline}（あと${left}日）`
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
            {mood && <span className="goal-card-mood">{mood.name}</span>}
            {current && <span className="goal-card-badge">開いています</span>}
          </span>

          <span className="goal-card-goal">{goal.goal}</span>

          <span className="goal-card-meta">
            <span>{cycleLabel(goal.cycleDays)}</span>
            <span>連続 {runOf(goal)} サイクル</span>
            <span>達成 {goal.done.length} 日</span>
            <span className={isExpired(goal) ? 'expired' : undefined}>{deadlineText(goal)}</span>
          </span>
        </span>
      </button>
    </li>
  )
}
