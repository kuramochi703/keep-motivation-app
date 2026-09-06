import { useEffect, useRef, useState } from 'react'
import { SESSION, STORAGE_KEY, initialState, load, markDone, rollover, save, type State } from './logic'

export type Screen = 'top' | 'setup' | 'main'

export function useApp() {
  const [state, setState] = useState<State>(() => rollover(load()))
  const [screen, setScreen] = useState<Screen>(() =>
    localStorage.getItem(STORAGE_KEY) ? 'main' : 'top'
  )

  const [hasStarted, setHasStarted] = useState(screen === 'main')
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
    setState((s) => markDone(s))
  }, [elapsed])

  // 利用開始後は、別画面でのタイマー達成も保存する。
  useEffect(() => {
    if (hasStarted) save(state)
  }, [state, hasStarted])

  const start = (goal: string) => {
    setHasStarted(true)
    setState((s) => ({ ...s, goal }))
    setScreen('main')
  }

  const reset = () => {
    setRunning(false)
    setElapsed(0)
    doneRef.current = false
    setHasStarted(false)
    localStorage.removeItem(STORAGE_KEY)
    setState(initialState())
    setScreen('top')
  }

  const go = (id: Screen) => {
    if (id === 'main') setHasStarted(true)
    setScreen(id)
  }

  const toggleTimer = () => setRunning((r) => !r)

  const recordOnly = () => {
    setRunning(false)
    setElapsed(0)
    doneRef.current = true
    setState((s) => markDone(s))
  }

  const nextDay = () => {
    setRunning(false)
    setElapsed(0)
    doneRef.current = false
    setState((s) => rollover({ ...s, dayOffset: s.dayOffset + 1 }))
  }

  return { state, screen, go, start, reset, elapsed, running, toggleTimer, recordOnly, nextDay }
}
