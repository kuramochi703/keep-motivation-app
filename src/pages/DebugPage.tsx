import { useCallback, useEffect, useState, type ComponentProps } from 'react'
import AccountBar from '../app/AccountBar'
import Avatar from '../avatar/Avatar'
import { NO_EFFECTS, type Effects } from '../avatar/look'
import { evolutionOf, nextGoalOf, STAGES } from '../avatar/stage'
import { supabase } from '../lib/supabase'
import {
  clearRecords,
  deleteAllGoals,
  deleteGoal,
  deleteRecord,
  listGoals,
  rewindSeenStage,
  type GoalRow,
} from '../state/debug'
import {
  currentCycle,
  cycleIndex,
  cycleLabel,
  diffDays,
  idleOf,
  isDone,
  key,
  MOODS,
  moodOf,
  type MoodId,
  runOf,
  startOf,
  today,
  type State,
} from '../state/logic'
import MainPage from './MainPage'
import './debug-page.css'

/** 上に埋め込むアプリ画面に渡すもの。デバッグ画面自身は使わない */
type AppProps = Pick<ComponentProps<typeof MainPage>,
  'goals' | 'currentGoalId' | 'onSelectGoal' | 'onToggleTimer' | 'onExtend' | 'onStageSeen'> & {
  email: string
  onSignOut: () => void
}

type Props = {
  state: State
  userId: string
  loaded: boolean
  hasStarted: boolean
  elapsed: number
  running: boolean
  onRecord: () => void
  /** アプリの中の日付をずらす。負の値も渡す（過去へ戻る） */
  onSetDayOffset: (days: number) => void
  /** DB から読み直す。**消したあとは必ずこれを通す** */
  onReload: () => Promise<void>
  onNewGoal: () => void
  app: AppProps
}

/**
 * デバッグ画面。
 *
 * **並びは「見る」→「動かす」→「生データ」の3段。** 動かすものは2列で並べ、
 * 左が日付と記録（ふだん使う）、右が演出と目標（たまにしか触らない）。
 *
 * 説明文は置かない。何をするカードかは見出しとボタンの文言で分かるようにし、
 * 仕組みの理由はコード中のコメントと ARCHITECTURE 4章に書く。
 */
export default function DebugPage({
  state,
  userId,
  loaded,
  hasStarted,
  elapsed,
  running,
  onRecord,
  onSetDayOffset,
  onReload,
  onNewGoal,
  app,
}: Props) {
  // 保存値ではなく、記録から毎回その場で計算した値を出す
  const todayKey = key(today(state))
  const stage = evolutionOf(state.done, state.cycleDays, startOf(state), todayKey)
  const mood = stage.id === 0 ? null : moodOf(state)
  const next = nextGoalOf(state.done, state.cycleDays, startOf(state), todayKey)
  const [snapshot, setSnapshot] = useState<{ data: unknown; at: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // 消す操作は読み取りと別に持つ。同じ枠に出すと、どちらが失敗したか分からない
  const [working, setWorking] = useState(false)
  const [failure, setFailure] = useState('')

  const goalId = state.goalId

  // エフェクトの見比べ。**DB にも本番の気分にも触らない**、この画面だけの値。
  // 気分は姿勢と色のため（どんよりは座り込んだ姿で見たい）。最初はいまの気分
  const [previewMood, setPreviewMood] = useState<MoodId>(mood?.id ?? 'good')
  const [effects, setEffects] = useState<Effects>(() => effectsOf(mood?.id ?? 'good'))
  const pickPreviewMood = (id: MoodId) => {
    setPreviewMood(id)
    setEffects(effectsOf(id))
  }

  // アプリ本体はいちばん新しい1件しか読まない。たまっている目標はここでだけ見える
  const [goals, setGoals] = useState<GoalRow[]>([])
  const [goalsError, setGoalsError] = useState('')

  const refreshGoals = useCallback(async () => {
    const result = await listGoals(userId)
    if (typeof result === 'string') {
      setGoalsError(result)
      return
    }
    setGoalsError('')
    setGoals(result)
  }, [userId])

  // 画面を開いたとき・目標が入れ替わったとき・記録が増減したときに引き直す。
  // **記録の数も依存に入れる。** 「今日を達成にする」は run() を通らない
  // （本番と同じ markSessionDone を呼ぶ）ので、これが無いと件数が古いまま残る
  useEffect(() => {
    refreshGoals()
  }, [refreshGoals, goalId, state.done.length])

  /**
   * DB を書き換える操作は必ずここを通す。**終わったら DB から読み直す。**
   * 画面の値を手で合わせると「消えたつもりで消えていない」を見逃す。
   */
  const run = async (task: () => Promise<string | null>) => {
    setWorking(true)
    setFailure('')
    try {
      const message = await task()
      if (message) setFailure(message)
    } finally {
      await onReload()
      await refreshGoals()
      setWorking(false)
    }
  }

  const readDatabase = async () => {
    setBusy(true)
    setError('')
    try {
      const { data, error } = await supabase.from('goals')
        .select('id, goal, deadline, cycle_days, started_at, avatars(name, hue, seen_stage), records(done_on, minutes)')
        .order('id', { ascending: false }).limit(1).maybeSingle()
      if (error) throw error
      setSnapshot({ data, at: new Date().toLocaleTimeString('ja-JP') })
    } catch (cause) {
      setError(cause && typeof cause === 'object' && 'message' in cause
        ? String(cause.message) : 'DBの取得に失敗しました。')
    } finally {
      setBusy(false)
    }
  }

  // 記録は日付順に並べて出す。1行が records の1行に対応する
  const records = [...state.done].sort()
  const pending = stage.id > state.seenStage

  return (
    <div className="debug-screen">
    <div className="wrap debug-page debug-page-head">
      <header>
        <span className="badge">開発用</span>
        <h1>デバッグ</h1>
      </header>

      {/*
        まとめのカードは置かない。値はそれぞれ関係するカードの中に置く方が、
        探さずに済むし、同じ数字が2か所に出ることもない。
        サイクル長と目標IDは目標の一覧に、日送りは日付カードに出ている。
      */}
      <section className="card" aria-label="現在のアバター">
        <h2 className="debug-avatar-name">{state.name || 'アバター'}</h2>
        <p className="debug-meta">
          <span>{stage.name} <b>{stage.id}</b></span>
          <span>気分 <b>{mood?.name ?? 'なし'}</b></span>
          <span>連続 <b>{runOf(state)}</b></span>
          <span>放置 <b>{idleOf(state) ?? '—'}</b></span>
          <span>
            つぎ <b>{next ? `${next.kind === 'run' ? '連続' : `直近${next.window}で`} ${next.have}/${next.need}` : '最終'}</b>
          </span>
        </p>
      </section>
    </div>

    {/*
      **アバターの姿は、アプリの画面（App.tsx の main と同じ組み立て）をそのまま出す。**
      切り出した Avatar だけだと、部屋・HUD・演出との重なりが本番と違って見える。
      ハンドラも本番のものを渡すので、ここでタイマーを回せば本当に記録が付き、
      「見せ済み」を戻せばここで進化の演出が流れて、流し終わると本番どおり進む。
      .debug-page の外に置くのは、デバッグ用の詰めた見た目（.btn / .card / h2）を持ち込まないため
    */}
    <section className="debug-app" aria-label="アプリの画面">
      <div className="shell dashboard-shell">
        <AccountBar email={app.email} onSignOut={app.onSignOut} />
        <main className="content">
          <MainPage
            state={state}
            goals={app.goals}
            currentGoalId={app.currentGoalId}
            onSelectGoal={app.onSelectGoal}
            elapsed={elapsed}
            running={running}
            onToggleTimer={app.onToggleTimer}
            onNewGoal={onNewGoal}
            onExtend={app.onExtend}
            onStageSeen={app.onStageSeen}
          />
        </main>
      </div>
    </section>

    <div className="wrap debug-page debug-page-body">
      {/*
        エフェクト（avatar/Effects.tsx）の見比べ。本番では気分の表（MOODS の
        glow / motes / gloom）で決まるが、ここでは**気分と別に**出し入れできる。
        気分を選ぶと、その気分の本番どおりの組み合わせに戻る。
        ステージはいまのものを使う（たまごには出ないので、たまごなら幼体で見せる）
      */}
      <section className="card debug-avatar debug-effects" aria-label="エフェクト">
        <div>
          <h2>エフェクト</h2>
          <div className="tools">
            {EFFECTS.map(({ id, name }) => (
              <button
                key={id}
                className={effects[id] ? 'btn' : 'btn sec'}
                aria-pressed={effects[id]}
                onClick={() => setEffects((e) => ({ ...e, [id]: !e[id] }))}
              >
                {name}
              </button>
            ))}
            <button className="btn ghost" onClick={() => setEffects(NO_EFFECTS)}>全部オフ</button>
          </div>
          <div className="debug-row">
            <label htmlFor="debug-effect-mood">気分</label>
            <select
              id="debug-effect-mood"
              value={previewMood}
              onChange={(e) => pickPreviewMood(e.target.value as MoodId)}
            >
              {MOODS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}（{EFFECTS.filter(({ id }) => m[id]).map(({ name }) => name).join('＋') || 'なし'}）
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="debug-effects-preview">
          <Avatar
            stage={Math.max(1, stage.id)}
            hue={state.hue}
            mood={MOODS.find((m) => m.id === previewMood) ?? null}
            effects={effects}
          />
        </div>
      </section>

      <div className="debug-columns">
        {/*
          気分もステージも、生の日付ではなく cycleIndex() で番号に直してからしか
          見ていない（logic.ts / stage.ts）。**だから日付さえ動かせれば、
          気分7段もステージ4段も全部ここから再現できる。**
          ずらすのは `dayOffset` だけで、DB には触らない。
        */}
        <section className="card" aria-label="日付">
          <h2>日付</h2>
          <p className="debug-meta">
            <span>いま <b>{todayKey}</b></span>
            <span className={state.dayOffset !== 0 ? 'on' : undefined}>
              日送り <b>{state.dayOffset >= 0 ? `+${state.dayOffset}` : state.dayOffset}日</b>
            </span>
            <span>{cycleLabel(state.cycleDays)} <b>{currentCycle(state)}</b>番目</span>
          </p>
          <div className="tools">
            <button className="btn sec" onClick={() => onSetDayOffset(state.dayOffset - 7)}>−7日</button>
            <button className="btn sec" onClick={() => onSetDayOffset(state.dayOffset - 1)}>−1日</button>
            <button className="btn sec" onClick={() => onSetDayOffset(state.dayOffset + 1)}>+1日</button>
            <button className="btn sec" onClick={() => onSetDayOffset(state.dayOffset + 7)}>+7日</button>
            <button className="btn sec" onClick={() => onSetDayOffset(state.dayOffset - state.cycleDays)}>−1サイクル</button>
            <button className="btn sec" onClick={() => onSetDayOffset(state.dayOffset + state.cycleDays)}>+1サイクル</button>
          </div>
          <div className="debug-row">
            <label htmlFor="debug-date">日付を指定</label>
            <input
              id="debug-date"
              type="date"
              value={todayKey}
              onChange={(e) => e.target.value && onSetDayOffset(diffDays(key(new Date()), e.target.value))}
            />
            <button className="btn ghost" disabled={state.dayOffset === 0} onClick={() => onSetDayOffset(0)}>
              今日に戻す
            </button>
          </div>
        </section>

        {/*
          演出の発動条件は `stage.id > seenStage` の1行だけ（MainPage.tsx）。
          流し終わると seenStage が上がって二度と出ないので、**もう一度見るには
          ここを戻すしかない。** 0 に戻せば孵化から、2 に戻せば完全体への進化だけ。
        */}
        <section className="card" aria-label="進化の演出" aria-busy={working}>
          <h2>進化の演出</h2>
          <p className="debug-meta">
            <span>ステージ <b>{stage.id}</b></span>
            <span>見せ済み <b>{state.seenStage}</b></span>
            <span className={pending ? 'on' : undefined}>{pending ? '流れる' : '流れない'}</span>
          </p>
          <div className="tools">
            {STAGES.slice(0, -1).map((s) => (
              <button
                key={s.id}
                className="btn sec"
                disabled={working || goalId === null || state.seenStage === s.id}
                onClick={() => run(() => rewindSeenStage(goalId!, s.id))}
              >
                見せ済みを {s.id} に（{STAGES[s.id + 1].name}）
              </button>
            ))}
          </div>
        </section>
      </div>

      <div className="debug-columns">
        {/*
          **1レコード＝1日。** 同じ日に何度タイマーを回しても増えない
          （schema.sql の UNIQUE (goal_id, done_on) と markSessionDone の早期 return）。
          だからこの一覧の1行が、そのまま records の1行になる。
        */}
        <section className="card" aria-label="記録" aria-busy={working}>
          <h2>記録（{records.length}件）</h2>
          <div className="tools">
            {isDone(state, today(state)) ? (
              <button
                className="btn sec"
                disabled={working || goalId === null}
                onClick={() => run(() => deleteRecord(goalId!, todayKey))}
              >
                今日（{todayKey}）の記録を外す
              </button>
            ) : (
              <button className="btn sec" disabled={!hasStarted} onClick={onRecord}>
                今日（{todayKey}）を達成にする
              </button>
            )}
            <button
              className="btn ghost"
              disabled={working || goalId === null || records.length === 0}
              onClick={() => {
                if (window.confirm(`記録を ${records.length}件すべて消します。目標とアバターは残るので、たまごに戻ります。`)) {
                  run(() => clearRecords(goalId!))
                }
              }}
            >
              全部消す
            </button>
          </div>

          {failure && <p className="debug-error" role="alert">{failure}</p>}
          {goalId === null && <p className="debug-note">目標がないため、記録はDBに入りません。</p>}

          {records.length > 0 && (
            <ul className="debug-records">
              {records.map((day) => {
                const cycle = cycleIndex(day, startOf(state), state.cycleDays)
                return (
                  <li key={day} className={day === todayKey ? 'now' : undefined}>
                    <span className="debug-record-day">{day}</span>
                    <span className="debug-note">
                      {cycle < 0 ? '起点より前（数えない）' : `${cycle}番目のサイクル`}
                      {cycle > currentCycle(state) && ' · 未来'}
                    </span>
                    <button
                      className="btn ghost"
                      aria-label={`${day} の記録を消す`}
                      disabled={working || goalId === null}
                      onClick={() => run(() => deleteRecord(goalId!, day))}
                    >
                      消す
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {/*
          **いまの目標は「id がいちばん大きい1件」。** 終わった印の列は持たない。
          本番の「新しい目標をはじめる」は行を足すだけで前の目標を消さないので、
          古い目標はここに残り続ける。アプリ本体からは見えないため、一覧はここだけ。
          子（records / avatars）から先に消す理由は state/debug.ts を参照。
        */}
        <section className="card debug-danger" aria-label="目標" aria-busy={working}>
          <h2>目標（{goals.length}件）</h2>

          {goalsError && <p className="debug-error" role="alert">{goalsError}</p>}

          {goals.length > 0 && (
            <ul className="debug-goals">
              {goals.map((g) => (
                <li key={g.id} className={g.id === goalId ? 'now' : undefined}>
                  <span className="debug-goal-id">#{g.id}</span>
                  <span className="debug-goal-text" title={g.goal}>{g.goal || '（無題）'}</span>
                  <span className="debug-note">
                    起点 {g.startedAt} · {cycleLabel(g.cycleDays)} · 記録 {g.records}件
                    {g.id === goalId ? ' · いまの目標' : ''}
                  </span>
                  <button
                    className="btn ghost"
                    aria-label={`目標 #${g.id} を消す`}
                    disabled={working}
                    onClick={() => {
                      if (window.confirm(`目標 #${g.id}「${g.goal}」を、記録${g.records}件とアバターごと消します。取り消せません。`)) {
                        run(() => deleteGoal(g.id))
                      }
                    }}
                  >
                    消す
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* 1件ずつ消すのは一覧の各行に置いた。ここは一括のものだけ */}
          <div className="tools">
            <button
              className="btn ghost"
              disabled={working}
              onClick={() => {
                if (window.confirm('この人の目標を、過去のものも含めて全部消します。取り消せません。')) {
                  run(() => deleteAllGoals(userId))
                }
              }}
            >
              全部消す
            </button>
            <button className="btn sec" disabled={working} onClick={onNewGoal}>
              目標を作り直す
            </button>
          </div>
        </section>
      </div>

      <div className="debug-columns">
        <section className="card">
          <h2>アプリのState</h2>
          <pre>{JSON.stringify(state, null, 2)}</pre>
          <h3>実行状態</h3>
          <pre>{JSON.stringify({ loaded, hasStarted, elapsed, running }, null, 2)}</pre>
        </section>
        <section className="card" aria-busy={busy}>
          <h2>DBの保存値</h2>
          <div className="tools">
            <button className="btn sec" disabled={busy} onClick={readDatabase}>{busy ? '取得中...' : 'DBの最新値を取得'}</button>
          </div>
          {error && <p className="debug-error" role="alert">{error}</p>}
          <p className="debug-note" role="status">{snapshot ? `最終取得 ${snapshot.at}` : '未取得'}</p>
          {snapshot && (snapshot.data === null
            ? <p>該当する行がありません。</p>
            : <pre>{JSON.stringify(snapshot.data, null, 2)}</pre>)}
        </section>
      </div>
    </div>
    </div>
  )
}

/** デバッグ画面で出し入れするエフェクト。並びはボタンの並び */
const EFFECTS: { id: keyof Effects; name: string }[] = [
  { id: 'glow', name: '輝き' },
  { id: 'motes', name: '光の粒' },
  { id: 'gloom', name: 'どんより' },
]

/** その気分の本番どおりのエフェクト */
function effectsOf(id: MoodId): Effects {
  const m = MOODS.find((x) => x.id === id)
  return m ? { glow: m.glow, motes: m.motes, gloom: m.gloom } : NO_EFFECTS
}
