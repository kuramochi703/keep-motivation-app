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
        .select(`
    *,
    goals (
      id,
      goal,
      deadline,
      frequency
    )
  `)
        .eq('id', 1)
        .maybeSingle()

      if (error) {
        console.error('Supabase読み込みエラー:', error)
        setLoaded(true)
        return
      }

      if (data) {
        const loadedState: State = {
          ...initialState(),

          goalId: data.goal_id ?? null,
          vitality: data.vitality ?? 100,

          goal: data.goals?.goal ?? '',
          deadline: data.goals?.deadline ?? null,
          frequency: data.goals?.frequency ?? 'any',

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

  const start = async (input: SetupInput) => {
    const { data, error } = await supabase
      .from('goals')
      .insert({
        goal: input.goal,
        deadline: input.deadline,
        frequency: input.frequency,
      })
      .select('id')
      .single()

    if (error) {
      console.error('目標作成エラー:', error)
      return false
    }

    setHasStarted(true)

    setState((s) => ({
      ...rollover(resetGoal(s)),

      goalId: data.id,
      goal: input.goal,
      deadline: input.deadline,
      frequency: input.frequency,
      avatarId: input.avatarId,
      name: input.name,

      done: [],
      best: 0,
    }))
    return true
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

  const extendDeadline = async () => {
    if (!state.deadline || state.goalId === null) return

    const newDeadline = key(
      addMonths(parseKey(state.deadline), 1)
    )

    const { error } = await supabase
      .from('goals')
      .update({
        deadline: newDeadline,
      })
      .eq('id', state.goalId)

    if (error) {
      console.error('期限更新エラー:', error)
      return
    }

    setState((s) => ({
      ...s,
      deadline: newDeadline,
    }))
  }

  const newGoal = () => {
    setHasStarted(false)
    setState((s) => resetGoal(s))
  }
  useEffect(() => {
    if (!loaded || !hasStarted) return

    async function saveUserState() {
      console.log('保存処理スタート', state)

      const { data, error } = await supabase
        .from('user_state')
        .upsert({
          id: 1,
          vitality: state.vitality,
          avatar_id: state.avatarId,
          name: state.name,
          done: state.done,
          best: state.best,
          goal_id: state.goalId,
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
