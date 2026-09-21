import { useState } from 'react'
import Avatar from '../avatar/Avatar'
import { stageOf } from '../avatar/stage'
import { supabase } from '../lib/supabase'
import { isDone, key, levelOf, today, type State } from '../state/logic'
import './debug-page.css'

type Props = {
  state: State
  loaded: boolean
  hasStarted: boolean
  elapsed: number
  running: boolean
  onRecord: () => void
  onNextDay: () => void
  onNewGoal: () => void
}

export default function DebugPage({ state, loaded, hasStarted, elapsed, running, onRecord, onNextDay, onNewGoal }: Props) {
  const [snapshot, setSnapshot] = useState<{ data: unknown; at: string } | null>(null)
  // たまごの孵化。**モデルのクリップは1回きり**で、割れた姿のまま止まる。
  // もう一度見るには「閉じる」でアバターごと作り直す（key を変える）
  const [hatching, setHatching] = useState(false)
  const [eggKey, setEggKey] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const readDatabase = async () => {
    setBusy(true)
    setError('')
    try {
      const { data, error } = await supabase.from('user_state')
        .select('id, goal_id, vitality, avatar_id, name, done, best, goals(id, goal, deadline, frequency)')
        .eq('id', 1).maybeSingle()
      if (error) throw error
      setSnapshot({ data, at: new Date().toLocaleTimeString('ja-JP') })
    } catch (cause) {
      setError(cause && typeof cause === 'object' && 'message' in cause
        ? String(cause.message) : 'DBの取得に失敗しました。')
    } finally {
      setBusy(false)
    }
  }

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
          <p className="debug-note">活力 {state.vitality} / 100 · 達成 {state.done.length}日 · {stageOf(state.done.length).name}</p>
          <p>{levelOf(state.vitality).say}</p>
        </div>
        <div className="debug-avatar-preview">
          <Avatar lv={levelOf(state.vitality).lv} variant={state.avatarId}
            vitality={state.vitality} days={state.done.length} />
        </div>
      </section>

      <section className="card" aria-label="現在の状態">
        <dl className="debug-summary">
          <div><dt>活力</dt><dd>{state.vitality} <small>/ 100 · {levelOf(state.vitality).name}</small></dd></div>
          <div><dt>目標ID</dt><dd>{state.goalId ?? '未設定'}</dd></div>
          <div><dt>アプリ内の日付</dt><dd>{key(today(state))}</dd></div>
          <div><dt>自動保存の条件</dt><dd>{loaded && hasStarted ? '有効' : '停止中'}</dd></div>
        </dl>
        <p className="debug-note">保存条件の表示は、保存成功を示すものではありません。DB取得ボタンで保存値を確認してください。</p>
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
          <Avatar key={eggKey} egg lv={levelOf(state.vitality).lv} variant={state.avatarId}
            vitality={state.vitality} hatching={hatching} />
        </div>
      </section>

      <section className="card">
        <h2>動作を試す</h2>
        <p className="debug-note">達成・日付の操作は実際の状態を変更し、自動保存が有効な場合はDBにも反映されます。</p>
        <div className="tools">
          <button className="btn sec" disabled={!hasStarted || isDone(state, today(state))} onClick={onRecord}>今日を達成にする</button>
          <button className="btn sec" disabled={!hasStarted} onClick={onNextDay}>1日進める</button>
          <button className="btn sec" onClick={onNewGoal}>目標を作り直す（活力50）</button>
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
          <p className="debug-note">user_state.id = 1 と関連する目標を取得します。アプリのStateは変更しません。</p>
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
