import { useEffect, useState } from 'react'
import { STORAGE_KEY, initialState, load, rollover, save, type State } from './logic'

export type Screen = 'top' | 'setup' | 'main'

export function useApp() {
  const [state, setState] = useState<State>(() => rollover(load()))
  const [screen, setScreen] = useState<Screen>(() =>
    localStorage.getItem(STORAGE_KEY) ? 'main' : 'top'
  )

  // 目標設定の完了後から保存する（トップ・設定画面では保存しない）
  useEffect(() => {
    if (screen === 'main') save(state)
  }, [state, screen])

  const start = (goal: string) => {
    setState((s) => ({ ...s, goal }))
    setScreen('main')
  }

  const reset = () => {
    localStorage.removeItem(STORAGE_KEY)
    setState(initialState())
    setScreen('top')
  }

  const go = (id: Screen) => setScreen(id)

  return { state, setState, screen, go, start, reset }
}