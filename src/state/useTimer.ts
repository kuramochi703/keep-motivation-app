import { useEffect, useRef, useState } from 'react'
import { SESSION } from './logic'

/**
 * 5分タイマーだけを担当する。達成の判定・保存は持たず、
 * 300秒たったタイミングで `onComplete` を1回だけ呼ぶ。
 */
export function useTimer(onComplete: () => void) {
  const [elapsed, setElapsed] = useState(0)
  const [running, setRunning] = useState(false)
  const doneRef = useRef(false)

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setElapsed((v) => v + 1), 1000)
    return () => clearInterval(id)
  }, [running])

  useEffect(() => {
    if (elapsed < SESSION || doneRef.current) return
    doneRef.current = true
    onComplete()
  }, [elapsed, onComplete])

  const toggle = () => setRunning((r) => !r)

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

  return { elapsed, running, toggle, reset, complete }
}
