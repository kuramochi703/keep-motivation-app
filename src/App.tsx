import { useEffect, useRef, useState } from 'react'
import Avatar from './Avatar'
import {
  DECAY,
  SESSION,
  fmtClock,
  initialState,
  isDone,
  key,
  levelOf,
  load,
  markDone,
  rollover,
  save,
  shift,
  streak,
  today,
  type State,
} from './logic'

const DASH = 326.7

export default function App() {
  const [state, setState] = useState<State>(() => rollover(load()))
  const [peek, setPeek] = useState<number | null>(null)
  const [left, setLeft] = useState(SESSION)
  const [running, setRunning] = useState(false)
  const doneRef = useRef(false)

  useEffect(() => save(state), [state])

  // タイマー
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setLeft((v) => v - 1), 1000)
    return () => clearInterval(id)
  }, [running])

  useEffect(() => {
    if (left > 0 || doneRef.current) return
    doneRef.current = true
    setRunning(false)
    setLeft(SESSION)
    finish()
  }, [left])

  const t = today(state)
  const doneToday = isDone(state, t)
  const vital = peek ?? state.vitality
  const L = levelOf(vital)
  const st = streak(state)
  const best = Math.max(state.best, st)

  useEffect(() => {
    const r = document.documentElement.style
    r.setProperty('--h', String(L.h))
    r.setProperty('--s', String(L.s))
  }, [L])

  function finish() {
    setPeek(null)
    setState((s) => markDone(s))
    doneRef.current = false
  }

  function recordOnly() {
    setRunning(false)
    setLeft(SESSION)
    finish()
  }

  function nextDay() {
    setRunning(false)
    setLeft(SESSION)
    setPeek(null)
    setState((s) => rollover({ ...s, dayOffset: s.dayOffset + 1 }))
  }

  function reset() {
    setRunning(false)
    setLeft(SESSION)
    setPeek(null)
    setState({ ...initialState(), lastDate: key(new Date()) })
  }

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
            <input
              maxLength={30}
              aria-label="勉強していること"
              placeholder="勉強していること"
              value={state.goal}
              onChange={(e) => setState((s) => ({ ...s, goal: e.target.value }))}
            />
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
                  strokeDashoffset={(DASH * (1 - left / SESSION)).toFixed(1)}
                />
              </svg>
              <div className="num">
                <span>{fmtClock(Math.max(0, left))}</span>
                <em>{running ? '集中中' : '最低ライン'}</em>
              </div>
            </div>
            <div className="acts">
              {doneToday ? (
                <>
                  <div className="donemsg">今日はもう積んだ。あとは自由時間。</div>
                  <button className="btn sec" onClick={() => setRunning((r) => !r)}>
                    {running ? 'タイマーを止める' : 'もう5分やる'}
                  </button>
                </>
              ) : (
                <>
                  <button className="btn" onClick={() => setRunning((r) => !r)}>
                    {running ? '一時停止' : left < SESSION ? '再開する' : '5分はじめる'}
                  </button>
                  <button className="btn sec" onClick={recordOnly}>
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
              <button className="btn ghost" onClick={nextDay}>
                翌日にする（お試し）
              </button>
              <button className="btn ghost" onClick={reset}>
                最初から
              </button>
            </div>
            <label className="preview">
              見た目をためす
              <input
                type="range"
                min={0}
                max={100}
                value={vital}
                aria-label="活力を動かして見た目を確認"
                onChange={(e) => setPeek(Number(e.target.value))}
              />
            </label>
          </footer>
        </section>
      </div>
    </div>
  )
}
