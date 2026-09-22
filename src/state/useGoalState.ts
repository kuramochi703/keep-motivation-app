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
 *
 * **消す操作はここに置かない。** 本番の画面からは記録も目標も消えない（行は増える
 * だけ）。消せるのはデバッグ画面だけで、実体は `state/debug.ts` にある。
 */

/** 1セッションの長さ。`records.minutes` に入れる */
const SESSION_MINUTES = 5

/** join の結果。1目標に1体だが、返りが配列になることがある */
const oneOf = <T,>(v: T | T[] | null | undefined): T | null =>
  Array.isArray(v) ? v[0] ?? null : v ?? null

/**
 * 読み込みの結果。**「読めて、目標が無かった」と「読めなかった」を混ぜない。**
 * 前者は初期状態へ戻す（デバッグ画面で目標を消した直後がこれ）が、
 * 後者で戻すと、通信が切れただけで画面から目標が消えてしまう。
 */
type Loaded = { ok: true; state: State | null } | { ok: false }

/**
 * いまの目標と、その記録を読む。
 *
 * **「いまの目標」＝ その人の `goals` のうち `id` がいちばん大きい1件。**
 * 以前は `archived_at` に時刻を入れて「終わった印」を付けていたが、
 * 目標は作った順に並ぶので、最新が現役だと決めれば印は要らない。
 * 過去の目標は行として残るので、記録もアバターも消えない。
 */
async function fetchGoal(userId: string): Promise<Loaded> {
  const { data, error } = await supabase
    .from('goals')
    .select('id, goal, deadline, cycle_days, started_at, avatars(name, hue, seen_stage)')
    .eq('user_id', userId)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('Supabase読み込みエラー:', error)
    return { ok: false }
  }

  if (!data) return { ok: true, state: null }

  const avatar = oneOf(data.avatars as { name: string; hue: number; seen_stage: number }[])
  const { data: records, error: recordsError } = await supabase
    .from('records')
    .select('done_on')
    .eq('goal_id', data.id)
    .order('done_on')

  if (recordsError) console.error('記録の読み込みエラー:', recordsError)

  return {
    ok: true,
    state: {
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
    },
  }
}

export function useGoalState(userId: string | null) {
  const [state, setState] = useState<State>(() => initialState())
  const [hasStarted, setHasStarted] = useState(false)
  const [loaded, setLoaded] = useState(false)

  // タイマーからの達成は、最後に描いた state ではなく「今の state」で書きたい
  const latest = useRef(state)
  latest.current = state

  useEffect(() => {
    // 未ログインの間は何も読まない。ログアウトすると初期状態に戻る
    if (!userId) {
      setState(initialState())
      setHasStarted(false)
      setLoaded(false)
      return
    }

    let alive = true

    fetchGoal(userId).then((result) => {
      if (!alive) return
      if (result.ok && result.state) {
        setState(result.state)
        setHasStarted(true)
      }
      setLoaded(true)
    })

    return () => {
      alive = false
    }
  }, [userId])

  /**
   * DB から読み直す。デバッグ画面が「消したあと、本当に消えたか」を
   * 画面で確かめるために使う。**日送り（`dayOffset`）は DB に無い画面の都合
   * なので引き継ぐ。** 読み直すたびに今日へ戻ると、日付を動かしながらの
   * 確認ができない。
   */
  const reload = useCallback(async () => {
    if (!userId) return
    const result = await fetchGoal(userId)
    if (!result.ok) return

    const { dayOffset } = latest.current
    if (result.state) {
      setState({ ...result.state, dayOffset })
      setHasStarted(true)
    } else {
      setState({ ...initialState(), dayOffset })
      setHasStarted(false)
    }
  }, [userId])

  const markStarted = () => setHasStarted(true)

  /**
   * 目標を作る。`goals` → `avatars` の2回。片方だけ成功する余地は残っている。
   *
   * **前の目標には何もしません。** 行を足すだけで、新しい方が `id` の大きい
   * 1件になるので自動的に現役が入れ替わります。記録もアバターもそのまま残ります。
   */
  const start = async (input: SetupInput) => {
    if (!userId) return false
    const startedAt = key(new Date())

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

    if (error) {
      console.error('目標作成エラー:', error)
      return false
    }

    const { error: avatarError } = await supabase
      .from('avatars')
      .insert({ goal_id: data.id, name: input.name, hue: input.hue })

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

  /**
   * お試し用。アプリの中の日付だけをずらす（DB には触らない）。
   * **負の値も入る。** 過去へ戻せないと、行き過ぎた日送りをやり直せない。
   */
  const setDayOffset = (days: number) => setState((s) => ({ ...s, dayOffset: days }))

  /** お試し用。1日進める */
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
    reload,
    markSessionDone,
    markStageSeen,
    setDayOffset,
    nextDay,
    extendDeadline,
    newGoal,
  }
}
