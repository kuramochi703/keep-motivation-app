import { useEffect, useRef, useState } from 'react'
import { SESSION, STORAGE_KEY, addMonths, initialState, key, load, markDone, parseKey, resetGoal, rollover, save, type SetupInput, type State } from './logic'

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

  const start = (input: SetupInput) => {
    setHasStarted(true)
    setState((s) => ({
      ...s,
      goal: input.goal,
      deadline: input.deadline,
      frequency: input.frequency,
      avatarId: input.avatarId,
      name: input.name,
    }))
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

  const extendDeadline = () => {
    setState((s) =>
      s.deadline ? { ...s, deadline: key(addMonths(parseKey(s.deadline), 1)) } : s
    )
  }

  const newGoal = () => {
    setRunning(false)
    setElapsed(0)
    doneRef.current = false
    setState((s) => resetGoal(s))
    setScreen('setup')
  }

  return { state, screen, go, start, reset, extendDeadline, newGoal, elapsed, running, toggleTimer, recordOnly, nextDay }
}
