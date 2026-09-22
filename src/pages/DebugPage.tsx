import { useState } from 'react'
import Avatar from '../avatar/Avatar'
import { evolutionOf, nextGoalOf, STAGES } from '../avatar/stage'
import { supabase } from '../lib/supabase'
import {
  clearRecords,
  deleteAllGoals,
  deleteGoal,
  deleteRecord,
  rewindSeenStage,
} from '../state/debug'
import {
  currentCycle,
  cycleIndex,
  cycleLabel,
  diffDays,
  idleOf,
  isDone,
  key,
  moodOf,
  runOf,
  startOf,
  today,
  type State,
} from '../state/logic'
import './debug-page.css'

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
}

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
}: Props) {
  // 保存値ではなく、記録から毎回その場で計算した値を出す
  const todayKey = key(today(state))
  const stage = evolutionOf(state.done, state.cycleDays, startOf(state), todayKey)
  const mood = stage.id === 0 ? null : moodOf(state)
  const next = nextGoalOf(state.done, state.cycleDays, startOf(state), todayKey)
  const [snapshot, setSnapshot] = useState<{ data: unknown; at: string } | null>(null)
  // たまごの孵化。**モデルのクリップは1回きり**で、割れた姿のまま止まる。
  // もう一度見るには「閉じる」でアバターごと作り直す（key を変える）
  const [hatching, setHatching] = useState(false)
  const [eggKey, setEggKey] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // 消す操作は読み取りと別に持つ。同じ枠に出すと、どちらが失敗したか分からない
  const [working, setWorking] = useState(false)
  const [failure, setFailure] = useState('')

  const goalId = state.goalId

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
      setWorking(false)
    }
  }

  const readDatabase = async () => {
    setBusy(true)
    setError('')
    try {
      const { data, error } = await supabase.from('goals')
        .select('id, goal, deadline, cycle_days, started_at, archived_at, avatars(name, hue, seen_stage), records(done_on, minutes)')
        .is('archived_at', null).order('id', { ascending: false }).limit(1).maybeSingle()
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

  return (
    <div className="wrap debug-page">
      <header>
        <span className="badge">開発用</span>
        <h1>デバッグ</h1>
        <p>アプリの現在値と、Supabaseに保存された値を確認できます。</p>
      </header>

      <section className="card debug-avatar" aria-label="現在のアバター">
        <div>
          <h2>{state.name || 'アバター'}</h2>
          <p className="debug-note">
            {stage.name}（{stage.id}） · {mood?.name ?? '気分なし'} · 連続 {runOf(state)}サイクル · 放置 {idleOf(state) ?? '—'}
          </p>
          <p>{mood?.say ?? 'まだ殻の中。'}</p>
        </div>
        <div className="debug-avatar-preview">
          <Avatar stage={stage.id} hue={state.hue} mood={mood} />
        </div>
      </section>

      <section className="card" aria-label="現在の状態">
        <dl className="debug-summary">
          <div><dt>気分</dt><dd>{mood?.name ?? '気分なし'} <small>· 彩度 {mood?.s ?? '—'}</small></dd></div>
          <div><dt>ステージ</dt><dd>{stage.name} <small>· 見せ済み {state.seenStage}</small></dd></div>
          <div><dt>つぎの条件</dt><dd>{next ? `${next.kind === 'run' ? '連続' : `直近${next.window}サイクルで`} ${next.have} / ${next.need}` : '最終ステージ'}</dd></div>
          <div><dt>サイクル</dt><dd>{cycleLabel(state.cycleDays)} <small>· 今 {currentCycle(state)}番目 · 起点 {startOf(state)}</small></dd></div>
          <div><dt>目標ID</dt><dd>{goalId ?? '未設定'}</dd></div>
          <div><dt>アプリ内の日付</dt><dd>{todayKey} <small>· 日送り {state.dayOffset >= 0 ? `+${state.dayOffset}` : state.dayOffset}日</small></dd></div>
          <div><dt>自動保存の条件</dt><dd>{loaded && hasStarted ? '有効' : '停止中'}</dd></div>
        </dl>
        <p className="debug-note">保存条件の表示は、保存成功を示すものではありません。DB取得ボタンで保存値を確認してください。</p>
      </section>

      <section className="card" aria-label="日付">
        <h2>日付</h2>
        {/*
          気分もステージも、生の日付ではなく cycleIndex() で番号に直してからしか
          見ていない（logic.ts / stage.ts）。**だから日付さえ動かせれば、
          気分7段もステージ4段も全部ここから再現できる。**
          ずらすのは `dayOffset` だけで、DB には触らない。
        */}
        <p className="debug-note">
          アプリの中の日付だけをずらします（DBには触りません）。記録をつけると、
          ここに出ている日付で <code>records.done_on</code> に入ります。
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

      <section className="card" aria-label="記録" aria-busy={working}>
        <h2>記録</h2>
        {/*
          **1レコード＝1日。** 同じ日に何度タイマーを回しても増えない
          （schema.sql の UNIQUE (goal_id, done_on) と markSessionDone の早期 return）。
          だからこの一覧の1行が、そのまま records の1行になる。
        */}
        <p className="debug-note">
          1行が <code>records</code> の1行です。同じ日は何度つけても1行のまま
          （<code>UNIQUE (goal_id, done_on)</code>）。消すとDBからも消えます。
        </p>

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
            記録を全部消す（{records.length}件）
          </button>
        </div>

        {failure && <p className="debug-error" role="alert">{failure}</p>}
        {goalId === null && <p className="debug-note">目標がまだありません。記録はDBに入らず、画面の中だけで動きます。</p>}

        {records.length === 0 ? (
          <p className="debug-note">記録はまだありません。</p>
        ) : (
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

      <section className="card" aria-label="進化の演出" aria-busy={working}>
        <h2>進化の演出</h2>
        {/*
          演出の発動条件は `stage.id > seenStage` の1行だけ（MainPage.tsx）。
          流し終わると seenStage が上がって二度と出ないので、**もう一度見るには
          ここを戻すしかない。** 0 に戻せば孵化から、2 に戻せば究極体への進化だけ。
        */}
        <p className="debug-note">
          演出は <code>ステージ({stage.id}) &gt; 見せ済み({state.seenStage})</code> の間だけ、
          ダッシュボードで1回流れます。いまは
          <b>{stage.id > state.seenStage ? ' 流れる状態です' : ' 流れません'}</b>。
          戻してからダッシュボードを開くと、もう一度見られます。
        </p>
        <div className="tools">
          {STAGES.slice(0, -1).map((s) => (
            <button
              key={s.id}
              className="btn sec"
              disabled={working || goalId === null || state.seenStage === s.id}
              onClick={() => run(() => rewindSeenStage(goalId!, s.id))}
            >
              見せ済みを {s.id} に（{STAGES[s.id + 1].name}への演出から）
            </button>
          ))}
        </div>
      </section>

      <section className="card debug-avatar" aria-label="たまご（ステージ0）">
        <div>
          <h2>たまご</h2>
          <p className="debug-note">
            ステージ0の姿と、孵化（割れる）アニメーションの確認用。進化の演出につなぐ前の手動トリガです。
          </p>
          <div className="tools">
            <button className="btn sec" disabled={hatching} onClick={() => setHatching(true)}>割る</button>
            <button className="btn sec" onClick={() => { setHatching(false); setEggKey((n) => n + 1) }}>戻す</button>
          </div>
        </div>
        <div className="debug-avatar-preview">
          <Avatar key={eggKey} egg hue={state.hue} hatching={hatching} />
        </div>
      </section>

      <section className="card debug-danger" aria-label="目標を消す" aria-busy={working}>
        <h2>目標を消す</h2>
        {/*
          本番の「新しい目標をはじめる」は archive するだけで行を消さない。
          デバッグしていると goals が積み上がるので、ここだけが消せる。
          子（records / avatars）から先に消す理由は state/debug.ts を参照。
        */}
        <p className="debug-note">
          <b>取り消せません。</b>記録・アバターごとDBから消えます。本番の「新しい目標をはじめる」は
          しまう（archive）だけなので、行が消えるのはここだけです。
        </p>
        <div className="tools">
          <button
            className="btn ghost"
            disabled={working || goalId === null}
            onClick={() => {
              if (window.confirm(`いまの目標「${state.goal}」を、記録${records.length}件とアバターごと消します。取り消せません。`)) {
                run(() => deleteGoal(goalId!))
              }
            }}
          >
            いまの目標を消す
          </button>
          <button
            className="btn ghost"
            disabled={working}
            onClick={() => {
              if (window.confirm('この人の目標を、しまってあるもの（archive済み）も含めて全部消します。取り消せません。')) {
                run(() => deleteAllGoals(userId))
              }
            }}
          >
            全部の目標を消す（archive済みも）
          </button>
          <button className="btn sec" disabled={working} onClick={onNewGoal}>
            目標を作り直す（たまごから）
          </button>
        </div>
      </section>

      <div className="debug-columns">
        <section className="card">
          <h2>アプリのState</h2>
          <p className="debug-note">画面の操作に合わせて更新されます。</p>
          <pre>{JSON.stringify(state, null, 2)}</pre>
          <h3>実行状態</h3>
          <pre>{JSON.stringify({ loaded, hasStarted, elapsed, running }, null, 2)}</pre>
        </section>
        <section className="card" aria-busy={busy}>
          <h2>DBの保存値</h2>
          <p className="debug-note">いまの目標（archived_at が NULL の最新1件）と、そのアバター・記録を取得します。アプリのStateは変更しません。</p>
          <button className="btn" disabled={busy} onClick={readDatabase}>{busy ? '取得中...' : 'DBの最新値を取得'}</button>
          {error && <p className="debug-error" role="alert">{error}</p>}
          <p className="debug-note" role="status">{snapshot ? `最終取得: ${snapshot.at}（取得時点の値）` : 'まだ取得していません。'}</p>
          {snapshot && (snapshot.data === null
            ? <p>該当する行がないか、読み取り権限により表示されていません。</p>
            : <pre>{JSON.stringify(snapshot.data, null, 2)}</pre>)}
        </section>
      </div>
    </div>
  )
}
