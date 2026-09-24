import { useEffect, useRef, useState } from 'react'

/**
 * 5分タイマーだけを担当する。達成の保存は持たず、
 * `seconds` を過ぎてから `finish()`（「完了」ボタン）が押されたら `onComplete` を1回だけ呼ぶ。
 *
 * **時間になっても勝手には止めない。** 5分を過ぎても数え続け、区切りは本人が
 * 「完了」で付ける。乗っているところで切られないように、また「押した＝やった」がはっきりするように。
 *
 * **長さは引数で受け取るだけで、動きは長さによらず同じ。** 本番は300秒、
 * デバッグ画面は5秒を渡す（useApp）。デバッグ画面で5秒回して確かめたことは、
 * 本番の5分でもそのまま起きる。
 */
export function useTimer(onComplete: () => void, seconds: number) {
  const [elapsed, setElapsed] = useState(0)
  const [running, setRunning] = useState(false)
  const doneRef = useRef(false)

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setElapsed((v) => v + 1), 1000)
    return () => clearInterval(id)
  }, [running])

  /** 時間を過ぎた。ここから「完了」を押せる */
  const reached = elapsed >= seconds

  /** 「完了」。時間を過ぎる前・つけ終わったあとは何もしない */
  const finish = () => {
    if (!reached || doneRef.current) return
    doneRef.current = true
    setRunning(false)
    onComplete()
  }

  /** 終わったタイマーは動かさない。次に回せるのは reset（日をまたぐ等）のあと */
  const toggle = () => {
    if (doneRef.current) return
    setRunning((r) => !r)
  }

  /** タイマーを未達成の状態に戻す（翌日にする・最初から、など） */
  const reset = () => {
    setRunning(false)
    setElapsed(0)
    doneRef.current = false
  }

  /** タイマーを使わずに達成扱いにする（「もうやった」ボタン用） */
  const complete = () => {
    setRunning(false)
    setElapsed(0)
    doneRef.current = true
  }

  return { elapsed, running, reached, toggle, finish, reset, complete }
}
