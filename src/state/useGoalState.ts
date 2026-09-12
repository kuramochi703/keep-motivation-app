import { useEffect, useState } from 'react'
import {
  STORAGE_KEY,
  addMonths,
  initialState,
  key,
  load,
  markDone,
  parseKey,
  resetGoal,
  rollover,
  save,
  type SetupInput,
  type State,
} from './logic'

/**
 * 目標そのもの（活力・達成履歴など）の管理と、その永続化を担当する。
 * 画面遷移・タイマーは持たず、達成の記録は `markSessionDone` として外から呼ばれる。
 */
export function useGoalState(initialHasStarted: boolean) {
  const [state, setState] = useState<State>(() => rollover(load()))
  const [hasStarted, setHasStarted] = useState(initialHasStarted)

  // 利用開始後は、別画面での変更も保存する。
  useEffect(() => {
    if (hasStarted) save(state)
  }, [state, hasStarted])

  const markStarted = () => setHasStarted(true)

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
  }

  const reset = () => {
    setHasStarted(false)
    localStorage.removeItem(STORAGE_KEY)
    setState(initialState())
  }

  const markSessionDone = () => setState((s) => markDone(s))

  const nextDay = () => setState((s) => rollover({ ...s, dayOffset: s.dayOffset + 1 }))

  const extendDeadline = () =>
    setState((s) =>
      s.deadline ? { ...s, deadline: key(addMonths(parseKey(s.deadline), 1)) } : s
    )

  const newGoal = () => setState((s) => resetGoal(s))

  return { state, markStarted, start, reset, markSessionDone, nextDay, extendDeadline, newGoal }
}
