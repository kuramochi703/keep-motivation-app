import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  addMonths,
  initialState,
  key,
  markDone,
  parseKey,
  resetGoal,
  rollover,
  type SetupInput,
  type State,
} from './logic'

/**
 * 目標そのもの（活力・達成履歴など）の管理と、その永続化を担当する。
 * 画面遷移・タイマーは持たず、達成の記録は `markSessionDone` として外から呼ばれる。
 */
export function useGoalState() {
  const [state, setState] = useState<State>(() => initialState())
  const [hasStarted, setHasStarted] = useState(false)

  const [loaded, setLoaded] = useState(false)

  // Supabaseから読み込む
  useEffect(() => {
    console.log('ロード', state)
    async function loadUserState() {
      const { data, error } = await supabase
        .from('user_state')
        .select('*')
        .limit(1)
        .maybeSingle()

      if (error) {
        console.error('Supabase読み込みエラー:', error)
        setLoaded(true)
        return
      }

      if (data) {
        const loadedState: State = {
          ...initialState(),

          vitality: data.vitality ?? 100,
          goal: data.goal ?? '',
          deadline: data.deadline ?? null,
          frequency: data.frequency ?? '毎日',

          avatarId: data.avatar_id ?? 0,
          name: data.name ?? '',

          done: data.done ?? [],
          best: data.best ?? 0,
        }

        setState(rollover(loadedState))
        setHasStarted(true)
      }

      setLoaded(true)
    }

    loadUserState()
  }, [])

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
    setState(initialState())
  }

  const markSessionDone = () =>
    setState((s) => markDone(s))

  const nextDay = () =>
    setState((s) =>
      rollover({
        ...s,
        dayOffset: s.dayOffset + 1,
      })
    )

  const extendDeadline = () =>
    setState((s) =>
      s.deadline
        ? {
          ...s,
          deadline: key(
            addMonths(parseKey(s.deadline), 1)
          ),
        }
        : s
    )

  const newGoal = () =>
    setState((s) => resetGoal(s))

  useEffect(() => {
    if (!loaded || !hasStarted) return

    async function saveUserState() {
      console.log('保存処理スタート', state)

      const { data, error } = await supabase
        .from('user_state')
        .upsert({
          id: 1,
          vitality: state.vitality,
          goal: state.goal,
          deadline: state.deadline,
          frequency: state.frequency,
          avatar_id: state.avatarId,
          name: state.name,
          done: state.done,
          best: state.best,
        })
        .select()

      console.log('保存結果:', data)

      if (error) {
        console.error('Supabase保存エラー:', error)
      }
    }

    saveUserState()
  }, [state, loaded, hasStarted])

  return {
    state,
    loaded,
    hasStarted,
    markStarted,
    start,
    reset,
    markSessionDone,
    nextDay,
    extendDeadline,
    newGoal,
  }
}