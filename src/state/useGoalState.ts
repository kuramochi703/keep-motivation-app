import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  addMonths,
  initialState,
  key,
  parseKey,
  resetGoal,
  today,
  type SetupInput,
  type State,
} from './logic'

/**
 * 目標そのもの（達成の記録・アバター）の管理と、その永続化を担当する。
 * 画面遷移・タイマーは持たず、達成の記録は `markSessionDone` として外から呼ばれる。
 *
 * **記録から計算できるものは保存しない**（README 2章）。DB に置くのは
 * 「何日つけたか」と「進化の演出をどこまで見せたか」だけで、連続サイクル数も
 * 気分もステージも画面を描くたびにその場で計算する。丸ごと UPSERT はやめて、
 * 変わったものだけを INSERT / UPDATE する。
 *
 * 持ち主が誰かは知らない。`userId`（`auth.users.id` の uuid）を1つ受け取るだけで、
 * ログインの面倒は useAuth が見る（AUTH_PLAN 4章）。
 * RLS が同じ条件で絞るので、`.eq('user_id', ...)` はもう防御ではなく「最新1件」の絞り込み。
 */

/** 1セッションの長さ。`records.minutes` に入れる */
const SESSION_MINUTES = 5

/** join の結果。1目標に1体だが、返りが配列になることがある */
const oneOf = <T,>(v: T | T[] | null | undefined): T | null =>
  Array.isArray(v) ? v[0] ?? null : v ?? null

export function useGoalState(userId: string | null) {
  const [state, setState] = useState<State>(() => initialState())
  const [hasStarted, setHasStarted] = useState(false)
  const [hasGoalHistory, setHasGoalHistory] = useState(false)
  const [stateUserId, setStateUserId] = useState(userId)
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const currentUserId = useRef(userId)
  currentUserId.current = userId

  // アカウント変更の描画から、前のアカウントのデータを公開しない。
  const belongsToUser = stateUserId === userId
  const currentState = belongsToUser ? state : initialState()
  const loaded = userId !== null && belongsToUser && loadedUserId === userId

  // タイマーからの達成は、最後に描いた state ではなく「今の state」で書きたい
  const latest = useRef(currentState)
  latest.current = currentState

  useEffect(() => {
    setStateUserId(userId)
    setState(initialState())
    setHasStarted(false)
    setHasGoalHistory(false)
  }, [userId])

  // 同じ user_id の最新1件を現在の目標とし、その記録を読む。
  useEffect(() => {
    setLoadedUserId(null)
    setLoadError(null)
    // 未ログインの間は何も読まない。
    if (!userId) return

    let alive = true

    async function loadGoal() {
      try {
        const { data, error } = await supabase
          .from('goals')
          .select('id, goal, deadline, cycle_days, started_at, avatars(name, hue, seen_stage)')
          .eq('user_id', userId)
          .order('id', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (!alive) return
        if (error) throw error

        if (data) {
          const avatar = oneOf(data.avatars as { name: string; hue: number; seen_stage: number }[])
          const { data: records, error: recordsError } = await supabase
            .from('records')
            .select('done_on')
            .eq('goal_id', data.id)
            .order('done_on')

          if (!alive) return
          if (recordsError) throw recordsError

          setState({
            ...initialState(),
            goalId: data.id,
            goal: data.goal ?? '',
            deadline: data.deadline ?? null,
            cycleDays: data.cycle_days ?? 1,
            startedAt: data.started_at ?? null,
            hue: avatar?.hue ?? 150,
            name: avatar?.name ?? '',
            seenStage: avatar?.seen_stage ?? 0,
            done: (records ?? []).map((r) => r.done_on as string),
          })
          setHasStarted(true)
          setHasGoalHistory(true)
        } else {
          setState(initialState())
          setHasStarted(false)
        }

        setLoadedUserId(userId)
      } catch (error) {
        if (!alive) return
        console.error('目標・記録の読み込みエラー:', error)
        setLoadError('目標の読み込みに失敗しました。時間をおいて再試行してください。')
      }
    }

    loadGoal()

    return () => {
      alive = false
    }
  }, [userId, loadAttempt])

  const retryLoad = useCallback(() => {
    setLoadedUserId(null)
    setLoadError(null)
    setLoadAttempt((attempt) => attempt + 1)
  }, [])

  /** 目標を作る。`goals` → `avatars` の2回。片方だけ成功する余地は残っている */
  const start = async (input: SetupInput) => {
    if (!userId) return false
    const startedAt = key(new Date())

    // 最新の目標を追加する。前の目標・記録・アバターはそのまま残す。
    const { data, error } = await supabase
      .from('goals')
      .insert({
        user_id: userId,
        goal: input.goal,
        deadline: input.deadline,
        cycle_days: input.cycleDays,
        started_at: startedAt,
      })
      .select('id')
      .single()

    if (currentUserId.current !== userId) return false
    if (error) {
      console.error('目標作成エラー:', error)
      return false
    }

    const { error: avatarError } = await supabase
      .from('avatars')
      .insert({ goal_id: data.id, name: input.name, hue: input.hue })

    if (currentUserId.current !== userId) return false
    if (avatarError) {
      console.error('アバター作成エラー:', avatarError)
      return false
    }

    setHasStarted(true)
    setHasGoalHistory(true)
    setState((s) => ({
      ...resetGoal(s),
      goalId: data.id,
      goal: input.goal,
      deadline: input.deadline,
      cycleDays: input.cycleDays,
      startedAt,
      hue: input.hue,
      name: input.name,
      seenStage: 0,
      done: [],
    }))
    return true
  }

  const reset = () => {
    setHasStarted(false)
    setState(initialState())
  }

  /** 今日を達成にする。`records` に1行 INSERT するだけ（同日は UNIQUE が弾く） */
  const markSessionDone = async () => {
    const s = latest.current
    const doneOn = key(today(s))
    if (s.done.includes(doneOn)) return

    setState((prev) =>
      prev.done.includes(doneOn) ? prev : { ...prev, done: [...prev.done, doneOn] }
    )

    if (s.goalId === null) return

    const { error } = await supabase
      .from('records')
      .insert({ goal_id: s.goalId, done_on: doneOn, minutes: SESSION_MINUTES })

    // 同じ日を2回つけたときの一意制約違反は、記録としては正しい状態なので流す
    if (error && error.code !== '23505') console.error('記録の保存エラー:', error)
  }

  /** 進化の演出を流し終わった（README 2章） */
  const markStageSeen = async (stage: number) => {
    const s = latest.current
    if (stage <= s.seenStage) return

    setState((prev) => ({ ...prev, seenStage: stage }))

    if (s.goalId === null) return
    const { error } = await supabase
      .from('avatars')
      .update({ seen_stage: stage })
      .eq('goal_id', s.goalId)

    if (error) console.error('演出の記録に失敗:', error)
  }

  /** お試し用。アプリの中の日付だけを進める（DB には触らない） */
  const nextDay = () => setState((s) => ({ ...s, dayOffset: s.dayOffset + 1 }))

  const extendDeadline = async () => {
    const s = latest.current
    if (!s.deadline || s.goalId === null) return

    const newDeadline = key(addMonths(parseKey(s.deadline), 1))

    const { error } = await supabase
      .from('goals')
      .update({ deadline: newDeadline })
      .eq('id', s.goalId)

    if (error) {
      console.error('期限更新エラー:', error)
      return
    }

    setState((prev) => ({ ...prev, deadline: newDeadline }))
  }

  /** 目標設定画面へ戻る。新しい目標の保存までは、DB上の現在の目標を維持する。 */
  const newGoal = () => {
    setHasStarted(false)
    setState((s) => resetGoal(s))
  }

  return {
    state: currentState,
    loaded,
    loadError: belongsToUser ? loadError : null,
    retryLoad,
    hasStarted: belongsToUser && hasStarted,
    hasGoalHistory: belongsToUser && hasGoalHistory,
    start,
    reset,
    markSessionDone,
    markStageSeen,
    nextDay,
    extendDeadline,
    newGoal,
  }
}
