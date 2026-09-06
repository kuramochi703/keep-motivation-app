import Avatar from '../avatar/Avatar'
import {
  DECAY,
  SESSION,
  fmtClock,
  isDone,
  key,
  levelOf,
  shift,
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
  onReset: () => void
}

export default function MainPage({ state, elapsed, running, onToggleTimer, onRecordOnly, onNextDay, onEditGoal, onReset }: Props) {
  const t = today(state)
  const doneToday = isDone(state, t)
  const vital = state.vitality
  const L = levelOf(vital)
  useAccent(L)
  const st = streak(state)
  const best = Math.max(state.best, st)

  const daysLeft = Math.ceil((vital - 19) / DECAY)
  const forecast =
    vital < 20
      ? { text: 'これ以上は落ちない。ここから戻すしかない。', warn: true }
      : { text: `このまま手を止めれば、${daysLeft}日でボロボロになる。`, warn: daysLeft <= 2 }

  // カレンダー（直近5週間）
  const end = shift(t, 6 - t.getDay())
  const cells = Array.from({ length: 35 }, (_, i) => shift(end, -(34 - i)))

  return (
    <div className="wrap">
      <header>
        <h1>サボると、やつれる。</h1>
        <p>
          やることを細かく決めなくていい。1日5分でも机に向かえば、その日は達成。手を止めた日数だけ、アバターは痩せていく。
        </p>
      </header>

      <div className="grid">
        <section className="card stage">
          <span className="badge">
            <i />
            <span>{L.name}</span>
          </span>
          <Avatar lv={L.lv} />
          <p className="speech">{L.say}</p>
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
        </section>

        <section className="card">
          <div className="goal">
            <span className="goal-text" title={state.goal}>
              {state.goal}
            </span>
            <button className="btn ghost" onClick={onEditGoal}>
              目標を変える
            </button>
          </div>
          <p className="sub">
            {t.getMonth() + 1}月{t.getDate()}日 ・ {doneToday ? '今日は達成ずみ' : '今日はまだ手つかず'}
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
                <em>{running ? '集中中' : '最低ライン'}</em>
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
                    {running ? '一時停止' : elapsed > 0 ? '再開する' : '5分はじめる'}
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
              <b>{st}</b>
              <span>連続日数</span>
            </div>
            <div>
              <b>{best}</b>
              <span>最長記録</span>
            </div>
            <div>
              <b>{state.done.length}</b>
              <span>のべ日数</span>
            </div>
          </div>

          <div className="cal">
            <h3>この5週間</h3>
            <div className="cells">
              {cells.map((d) => (
                <i
                  key={key(d)}
                  title={key(d)}
                  className={`${isDone(state, d) ? 'on' : ''}${key(d) === key(t) ? ' today' : ''}`}
                  style={d > t ? { opacity: 0.35 } : undefined}
                />
              ))}
            </div>
          </div>

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
        </section>
      </div>
    </div>
  )
}
