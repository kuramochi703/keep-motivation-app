import { useEffect, useRef, useState } from 'react'
import Calendar from '../features/calendar/Calendar'
import Avatar from '../avatar/Avatar'
import GoalsList from './GoalsList'
import './main-page.css'
import {
  SESSION,
  bestRun,
  cycleLabel,
  daysUntil,
  fmtClock,
  isExpired,
  key,
  moodOf,
  runOf,
  startOf,
  today,
  type State,
} from '../state/logic'
import { evolutionOf, nextGoalOf } from '../avatar/stage'
import { useAccent } from '../ui/useAccent'

const DASH = 326.7

type PanelId = 'goal' | 'calendar'

const PANELS: { id: PanelId; label: string; icon: string }[] = [
  { id: 'goal', label: '目標', icon: '✎' },
  { id: 'calendar', label: 'カレンダー', icon: '▣' },
]

type Props = {
  state: State
  goals: State[]
  currentGoalId: number | null
  onSelectGoal: (id: number) => void
  elapsed: number
  running: boolean
  onToggleTimer: () => void
  onNewGoal: () => void
  onExtend: () => void
  /** 進化の演出を流し終わったら呼ぶ。`avatars.seen_stage` を進める */
  onStageSeen: (stage: number) => void
}

/** 演出を流す長さ。たまごが割れるクリップ（3.0秒）に少し余裕を足した値 */
const EFFECT_MS = 4200

export default function MainPage({
  state,
  goals,
  currentGoalId,
  onSelectGoal,
  elapsed,
  running,
  onToggleTimer,
  onNewGoal,
  onExtend,
  onStageSeen,
}: Props) {
  const t = today(state)
  // 気分もステージも保存していない。**記録とサイクル長から毎回その場で計算する**
  const stage = evolutionOf(state.done, state.cycleDays, startOf(state), key(t))
  // **気分はステージ1以上のもの。** たまごに気分は無い
  const mood = stage.id === 0 ? null : moodOf(state)
  useAccent(state.hue, mood?.s ?? 24)
  const next = nextGoalOf(state.done, state.cycleDays, startOf(state), key(t))
  const run = runOf(state)

  // **演出は条件を満たした瞬間に1回だけ。** 計算したステージが
  // 「見せ終わったステージ」を超えていたら流し、終わってから記録を進める。
  // localStorage と違って DB に置くので、別の端末で開いても1回で済む
  const [celebrating, setCelebrating] = useState(false)
  const pending = stage.id > state.seenStage
  useEffect(() => {
    if (!pending) return
    setCelebrating(true)
    const id = window.setTimeout(() => {
      setCelebrating(false)
      onStageSeen(stage.id)
    }, EFFECT_MS)
    return () => window.clearTimeout(id)
    // onStageSeen は毎描画で作り直されるので、依存に入れると演出が流れ続ける
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, stage.id, state.goalId])

  // 孵化（たまご → 幼体）だけは、殻が割れるところから見せる
  const hatching = celebrating && state.seenStage === 0 && stage.id >= 1

  const expired = isExpired(state)
  const deadlineDays = daysUntil(state)
  const [yd, mo, dd] = (state.deadline ?? '').split('-').map(Number)
  const deadlineText = mo && dd ? `${mo}月${dd}日まで` : '設定されていません'
  const [open, setOpen] = useState<'calendar' | null>(null)
  const [showGoals, setShowGoals] = useState(false)
  const goalsDialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (showGoals) goalsDialog.current?.showModal()
    else goalsDialog.current?.close()
  }, [showGoals])
  const closePanel = () => {
    setOpen(null)
    setShowGoals(false)
  }

  /**
   * **押すと目標がもう1本増える。** 新しいアバターはたまごから育て直しになるので一度止める。
   * いまの目標は終わらない（目標一覧に並んだまま）ので、そう読めるように書く。
   */
  const askNewGoal = () =>
    window.confirm(
      `新しい目標を始めますか？\n` +
        `新しいアバターは たまご から育てることになります。\n` +
        `いまの「${state.goal}」と${state.name || 'アバター'}はそのまま残るので、目標一覧からいつでも戻れます。`
    )
  const confirmNewGoal = () => {
    if (askNewGoal()) onNewGoal()
  }

  return (
    <div className="wrap dashboard">
      <div className="dash-area">
      {expired ? (
          <section className="card done-overlay">
            <h2>目標の期間が終わりました</h2>
            <p className="sub">「{state.goal}」の振り返り</p>
            <div className="stats">
              <div>
                <b>{state.done.length}</b>
                <span>達成日数</span>
              </div>
              <div>
                <b>{run}</b>
                <span>今の連続サイクル</span>
              </div>
              <div>
                <b>{bestRun(state)}</b>
                <span>最長記録</span>
              </div>
            </div>
            {/* **ここから新しい目標は作らせない。** 期限が切れた直後は、
                作るより「他に育てているものがあったか」を見にいくほうが先。
                作りたければ目標一覧の「新しい目標を作る」から入れる */}
            <div className="acts done-acts">
              <button className="btn" onClick={() => setShowGoals(true)}>
                目標一覧を見る
              </button>
              <button className="btn sec" onClick={onExtend}>
                期限を1ヶ月伸ばす
              </button>
            </div>
          </section>
      ) : (
        <>
          <div className={`bg-stage${open ? ' dim' : ''}`}>
            <div className="deco-window" aria-hidden="true" />
            <div className="deco-books" aria-hidden="true"><i /><i /><i /></div>
            <div className="deco-plant" aria-hidden="true">🪴</div>

            <div className="bg-top">
              <p className="owner">{state.name}</p>
              <div className="bg-say">
                <span className="badge">
                  <i />
                  <span>{stage.name}{mood ? ` / ${mood.name}` : ''}</span>
                </span>
                <p className="speech">{mood?.say ?? 'まだ殻の中。最初の1回をつけてみよう。'}</p>
              </div>
              <p className="bg-streak">🔥 {run}サイクル連続（{cycleLabel(state.cycleDays)}）</p>
            </div>

            <section className="stage-goal" aria-label="現在の目標と期限">
            <div className="goal current-goal-card">
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
                {expired ? '期限から' : 'あと'} <b>{deadlineDays !== null ? Math.abs(deadlineDays) : '—'}</b><small>{expired ? '日経過' : '日'}</small>
              </p>
            </div>
            </section>

            {celebrating && (
              <div className="evolve-banner" role="status">
                <b>{state.seenStage === 0 ? `${state.name} がうまれた！` : `${stage.name} に進化！`}</b>
                <span>{stage.gains}</span>
              </div>
            )}

            <div className={`stage-avatar${celebrating ? ' evolving' : ''}`}>
              <Avatar
                key={hatching ? 'egg' : 'chick'}
                stage={hatching ? 0 : stage.id}
                hue={state.hue}
                mood={hatching ? null : mood}
                egg={hatching}
                hatching={hatching}
                fill
                interactive
              />
            </div>

            {/* 活力ゲージだった場所を、そのまま進化ゲージに作り替えている。
                **「あと○回」ではなく `x / y`**。ステージ2は窓の条件なので、
                「あと○回」はサボるほど増えるうえ、その回数では届かない */}
            <div className="meter">
              <div className="row">
                <span>{next ? `つぎは ${next.stage.name}` : `${stage.name}（最終）`}</span>
                <b>
                  {next ? next.have : '★'}
                  <small>{next ? `/${next.need}` : ''}</small>
                </b>
              </div>
              <div className="gauge">
                <i style={{ width: `${next ? Math.min(100, (next.have / next.need) * 100) : 100}%` }} />
              </div>
              <p className="meter-note">
                {next
                  ? next.kind === 'run'
                    ? `連続 ${next.have} / ${next.need} サイクル`
                    : `直近${next.window}サイクルで ${next.have} / ${next.need}`
                  : 'ここまで育てきりました'}
              </p>
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
            </div>
          </div>

          <nav className="dash-menu" aria-label="メニュー">
            {PANELS.map((panel) => (
              <button
                key={panel.id}
                type="button"
                className={`menu-btn${(panel.id === 'goal' ? showGoals : open === panel.id) ? ' active' : ''}`}
                aria-pressed={panel.id === 'goal' ? showGoals : open === panel.id}
                aria-haspopup={panel.id === 'goal' ? 'dialog' : undefined}
                aria-controls={panel.id === 'goal' ? 'goal-list-dialog' : undefined}
                onClick={() => {
                  if (panel.id === 'goal') {
                    setOpen(null)
                    setShowGoals(true)
                    return
                  }
                  setOpen((current) => (current === 'calendar' ? null : 'calendar'))
                  setShowGoals(false)
                }}
              >
                <span aria-hidden="true">{panel.icon}</span>
                {panel.label}
              </button>
            ))}
          </nav>
        </>
      )}

          <section
            className={`dash-panel${open ? ' open' : ''}`}
            aria-hidden={open === null}
            inert={open === null}
            aria-label="ダッシュボードパネル"
          >
            <button type="button" className="panel-close" aria-label="閉じる" onClick={closePanel}>
              ✕
            </button>

            {open === 'calendar' && (
              <div className="panel-body">
                <h2>達成カレンダー</h2>
                <Calendar state={state} />
              </div>
            )}
          </section>
          <dialog
            ref={goalsDialog}
            id="goal-list-dialog"
            className="goals-dialog"
            aria-labelledby="goals-list-title"
            onCancel={() => setShowGoals(false)}
            onClose={() => setShowGoals(false)}
          >
            <button type="button" className="panel-close" aria-label="目標一覧を閉じる" onClick={() => setShowGoals(false)}>
              ✕
            </button>
            {showGoals && (
              <GoalsList
                goals={goals}
                currentGoalId={currentGoalId}
                onSelect={(id) => { onSelectGoal(id); closePanel() }}
                onNewGoal={confirmNewGoal}
              />
            )}
          </dialog>
        </div>
    </div>
  )
}
