import { useEffect, useState } from 'react'
import Calendar from '../features/calendar/Calendar'
import Avatar from '../avatar/Avatar'
import './main-page.css'
import {
  SESSION,
  bestRun,
  cycleLabel,
  daysUntil,
  fmtClock,
  isDone,
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
  elapsed: number
  running: boolean
  onToggleTimer: () => void
  onRecordOnly: () => void
  onNextDay: () => void
  onEditGoal: () => void
  onNewGoal: () => void
  onExtend: () => void
  /** 進化の演出を流し終わったら呼ぶ。`avatars.seen_stage` を進める */
  onStageSeen: (stage: number) => void
  onReset: () => void
}

/** 演出を流す長さ。たまごが割れるクリップ（3.0秒）に少し余裕を足した値 */
const EFFECT_MS = 4200

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
  onStageSeen,
  onReset,
}: Props) {
  const t = today(state)
  const doneToday = isDone(state, t)
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
  }, [pending, stage.id])

  // 孵化（たまご → 幼体）だけは、殻が割れるところから見せる
  const hatching = celebrating && state.seenStage === 0 && stage.id >= 1

  const expired = isExpired(state)
  const deadlineDays = daysUntil(state)
  const [yd, mo, dd] = (state.deadline ?? '').split('-').map(Number)
  const deadlineText = mo && dd ? `${mo}月${dd}日まで` : '設定されていません'
  const [open, setOpen] = useState<PanelId | null>(null)

  /** **押すとアバターがたまごに戻る。** 取り返しがつかないので一度止める */
  const askNewGoal = () =>
    window.confirm(
      `いまの「${state.goal}」を終わりにして、新しい目標を始めますか？\n` +
        `${state.name || 'アバター'}は たまご から育て直しになります（これまでの記録は残ります）。`
    )
  const confirmNewGoal = () => {
    if (askNewGoal()) onNewGoal()
  }
  const confirmEditGoal = () => {
    if (askNewGoal()) onEditGoal()
  }

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
                <b>{run}</b>
                <span>今の連続サイクル</span>
              </div>
              <div>
                <b>{bestRun(state)}</b>
                <span>最長記録</span>
              </div>
            </div>
            <div className="acts done-acts">
              <button className="btn" onClick={confirmNewGoal}>
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
                <span>{stage.name}{mood ? ` / ${mood.name}` : ''}</span>
              </span>
              <p className="speech">{mood?.say ?? 'まだ殻の中。最初の1回をつけてみよう。'}</p>
            </div>

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
              />
            </div>

            <p className="owner">{state.name}</p>
            <p className="bg-streak">🔥 {run}サイクル連続（{cycleLabel(state.cycleDays)}）</p>
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

                <button className="btn new-goal-cta" onClick={confirmEditGoal}>
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