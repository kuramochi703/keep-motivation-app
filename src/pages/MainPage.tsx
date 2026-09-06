import Calendar from '../Calendar'
import Avatar from '../avatar/Avatar'
import './main-page.css'
import {
  DECAY,
  LEVELS,
  SESSION,
  daysUntil,
  fmtClock,
  freqLabel,
  isDone,
  isExpired,
  levelOf,
  streak,
  today,
  type State,
} from '../logic'
import { useAccent } from '../ui/useAccent'

const DASH = 326.7

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
  const best = Math.max(state.best, st)

  const expired = isExpired(state)
  const daysToDeadline = daysUntil(state)

  const daysToWreck = Math.ceil((vital - 19) / DECAY)
  const forecast =
    vital < 20
      ? { text: 'これ以上は落ちない。ここから戻すしかない。', warn: true }
      : { text: `このまま手を止めれば、${daysToWreck}日でボロボロになる。`, warn: daysToWreck <= 2 }

  return (
    <div className="wrap dashboard">
      <header>
        <h1>サボると、やつれる。</h1>
        <p>
          やることを細かく決めなくていい。1日5分でも机に向かえば、その日は達成。手を止めた日数だけ、アバターは痩せていく。
        </p>
        <aside className="header-note"><span aria-hidden="true">🌱</span>小さな一歩が<br />きっと明日の元気につながる。</aside>
        <button className="settings-button" aria-label="目標設定を開く" onClick={onEditGoal}>⚙</button>
      </header>

      <div className="grid">
        <section className="card stage">
          <div className="growth-panel">
            <span>アバターの状態</span>
            <h2>Level {L.lv + 1} <small>{L.name}</small></h2>
            <div className="gauge"><i style={{ width: `${vital}%` }} /></div>
            <p>{L.lv < 4 ? `次の状態まで 活力あと ${LEVELS[L.lv + 1].min - vital}` : '今日もいい調子。そのまま続けよう。'}<b>{vital}<small> /100</small></b></p>
          </div>
          <div className="avatar-room">
            <p className="room-bubble">よし、<br />今日も少しずつ<br />やってみよう！</p>
            <div className="room-window" aria-hidden="true" />
            <div className="room-books" aria-hidden="true"><i /><i /><i /></div>
            <div className="room-plant" aria-hidden="true">🪴</div>
            <Avatar lv={L.lv} variant={state.avatarId} />
          </div>
          <div className="avatar-caption">
          <span className="badge">
            <i />
            <span>{L.name}</span>
          </span>
          <p className="speech">{L.say}</p>
          </div>
          <p className="owner">{state.name}</p>
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
          <p className={`forecast${forecast.warn ? ' warn' : ''}`}>{forecast.text}</p>
          <div className="level-line" aria-label="活力によるアバターの状態">
            {LEVELS.map((level) => <div key={level.lv} className={L.lv === level.lv ? 'current' : ''} aria-current={L.lv === level.lv ? 'step' : undefined}><Avatar lv={level.lv} variant={state.avatarId} /><span>{level.name}</span></div>)}
          </div>
        </section>

        <section className="card">
          {expired ? (
            <div className="done">
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
                  <b>{best}</b>
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
            </div>
          ) : (
            <>
              <div className="goal">
                <span className="goal-text" title={state.goal}>
                  <span aria-hidden="true">✎ </span>{state.goal}
                </span>
                <button className="btn ghost" onClick={onEditGoal}>
                  目標を変える
                </button>
              </div>
              <p className="sub">
                {t.getMonth() + 1}月{t.getDate()}日 ・ {doneToday ? '今日は達成ずみ' : '今日はまだ手つかず'}
              </p>
              <p className="meta">
                期限まで {daysToDeadline !== null ? `${daysToDeadline}日` : '—'} ・ 頻度：{freqLabel(state.frequency)}
              </p>

              <div className="timer">
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
                    <em>{doneToday ? '今日の達成、おめでとう！' : <>あと {fmtClock(Math.max(0, SESSION - elapsed))} で<br />今日の達成！</>}</em>
                  </div>
                </div>
                <div className="acts">
                  {doneToday ? (
                    <>
                      <div className="donemsg">今日はもう積んだ。あとは自由時間。</div>
                      <button className="btn sec" onClick={onToggleTimer}>
                        {running ? '一時停止' : elapsed > 0 ? '再開する' : '計測をはじめる'}
                      </button>
                    </>
                  ) : (
                    <>
                      <button className="btn" onClick={onToggleTimer}>
                        <span aria-hidden="true">{running ? 'Ⅱ' : '▶'}　</span>{running ? '一時停止' : elapsed > 0 ? '再開する' : '5分はじめる'}
                      </button>
                      <button className="btn sec" onClick={onRecordOnly}>
                        もうやった（記録だけつける）
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="stats">
                <div>
                  <span>🔥　連続日数</span>
                  <b>{st}<small>日</small></b>
                </div>
                <div>
                  <span>👑　最長記録</span>
                  <b>{best}<small>日</small></b>
                </div>
                <div>
                  <span>▥　累積達成日数</span>
                  <b>{state.done.length}<small>日</small></b>
                </div>
              </div>

              <Calendar state={state} />

              <footer>
                <p>やった日は活力+12、やらなかった日は-20。1日サボると、取り戻すのに2日かかる。</p>
                <div className="tools">
                  <button className="btn ghost" onClick={onNextDay}>
                    翌日にする（お試し）
                  </button>
                  <button className="btn ghost" onClick={onReset}>
                    最初から
                  </button>
                </div>
              </footer>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
