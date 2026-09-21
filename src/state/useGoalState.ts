import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  addMonths,
  initialState,
  key,
  parseKey,
  resetGoal,
  today,
  type AvatarId,
  type Frequency,
  type SetupInput,
  type State,
} from './logic'

/**
 * 目標そのもの（達成の記録・アバター）の管理と、その永続化を担当する。
 * 画面遷移・タイマーは持たず、達成の記録は `markSessionDone` として外から呼ばれる。
 *
 * **記録から計算できるものは保存しない**（EVOLUTION_PLAN 1章）。DB に置くのは
 * 「何日つけたか」と「進化の演出をどこまで見せたか」だけで、連続サイクル数も
 * 気分もステージも画面を描くたびにその場で計算する。丸ごと UPSERT はやめて、
 * 変わったものだけを INSERT / UPDATE する。
 */

/** 認証を入れるまでは1行目のユーザーで固定（EVOLUTION_PLAN 3章） */
const USER_ID = 1

/** 1セッションの長さ。`records.minutes` に入れる */
const SESSION_MINUTES = 5

/** join の結果。1目標に1体だが、返りが配列になることがある */
const oneOf = <T,>(v: T | T[] | null | undefined): T | null =>
  Array.isArray(v) ? v[0] ?? null : v ?? null

/**
 * 旧 `SetupInput`（頻度・アバター3種）から新しい列への変換。
 * **目標設定画面を作り替える #6 で消す**、それまでの繋ぎ。
 */
const cycleDaysOf = (f: Frequency) => (f === 'week1' ? 7 : f === 'week3' ? 3 : 1)
const hueOf = (id: AvatarId) => [150, 205, 344][id] ?? 150

export function useGoalState() {
  const [state, setState] = useState<State>(() => initialState())
  const [hasStarted, setHasStarted] = useState(false)
  const [loaded, setLoaded] = useState(false)

  // タイマーからの達成は、最後に描いた state ではなく「今の state」で書きたい
  const latest = useRef(state)
  latest.current = state

  // いまの目標（archived_at が NULL の最新1件）と、その記録を読む
  useEffect(() => {
    async function loadGoal() {
      const { data, error } = await supabase
        .from('goals')
        .select('id, goal, deadline, cycle_days, started_at, avatars(name, hue, seen_stage)')
        .eq('user_id', USER_ID)
        .is('archived_at', null)
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) {
        console.error('Supabase読み込みエラー:', error)
        setLoaded(true)
        return
      }

      if (data) {
        const avatar = oneOf(data.avatars as { name: string; hue: number; seen_stage: number }[])
        const { data: records, error: recordsError } = await supabase
          .from('records')
          .select('done_on')
          .eq('goal_id', data.id)
          .order('done_on')

        if (recordsError) console.error('記録の読み込みエラー:', recordsError)

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
      }

      setLoaded(true)
    }

    loadGoal()
  }, [])

  const markStarted = () => setHasStarted(true)

  /** 目標を作る。`goals` → `avatars` の2回。片方だけ成功する余地は残っている */
  const start = async (input: SetupInput) => {
    const startedAt = key(new Date())

    // 前の目標はしまっておく。記録もアバターも消さない
    const { error: archiveError } = await supabase
      .from('goals')
      .update({ archived_at: new Date().toISOString() })
      .eq('user_id', USER_ID)
      .is('archived_at', null)

    if (archiveError) {
      console.error('前の目標のアーカイブに失敗:', archiveError)
      return false
    }

    const cycleDays = cycleDaysOf(input.frequency)
    const hue = hueOf(input.avatarId)

    const { data, error } = await supabase
      .from('goals')
      .insert({
        user_id: USER_ID,
        goal: input.goal,
        deadline: input.deadline,
        cycle_days: cycleDays,
        started_at: startedAt,
      })
      .select('id')
      .single()

    if (error) {
      console.error('目標作成エラー:', error)
      return false
    }

    const { error: avatarError } = await supabase
      .from('avatars')
      .insert({ goal_id: data.id, name: input.name, hue })

    if (avatarError) {
      console.error('アバター作成エラー:', avatarError)
      return false
    }

    setHasStarted(true)
    setState((s) => ({
      ...resetGoal(s),
      goalId: data.id,
      goal: input.goal,
      deadline: input.deadline,
      cycleDays,
      startedAt,
      hue,
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

  /** 進化の演出を流し終わった（EVOLUTION_PLAN 2章） */
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

  /** 目標設定画面へ戻る。**アーカイブは新しい目標を作った時** */
  const newGoal = () => {
    setHasStarted(false)
    setState((s) => resetGoal(s))
  }

  return {
    state,
    loaded,
    hasStarted,
    markStarted,
    start,
    reset,
    markSessionDone,
    markStageSeen,
    nextDay,
    extendDeadline,
    newGoal,
  }
}
