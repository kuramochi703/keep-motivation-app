/**
 * デバッグ画面からだけ呼ぶ、DB を直接書き換える操作。
 *
 * **本番の経路（useGoalState）には「消す」が無い。** 記録は INSERT だけ、
 * 目標は行を足すだけで、行が減ることはない。消す手段をそちらに置くと
 * 「押せてしまう導線」が本番の画面に生まれるので、ここに隔離する。
 *
 * このファイルを import するのは DebugPage だけで、その DebugPage は
 * `import.meta.env.DEV` の中でしか読み込まれない（app/App.tsx）。
 * つまり**本番のバンドルにはこのファイルごと入らない**。
 *
 * 呼んだ側は必ず `reload()` で DB を読み直すこと。画面の値を手で合わせると
 * 「消えたつもりで消えていない」を見逃す。
 *
 * 返り値はエラーメッセージ（成功なら null）。throw ではなく戻り値にしているのは、
 * デバッグ画面が失敗をそのまま画面に出すため。
 */
import { supabase } from '../lib/supabase'

/** Supabase のエラーから、画面に出せる文字列を取り出す */
const messageOf = (cause: unknown, fallback: string) =>
  cause && typeof cause === 'object' && 'message' in cause
    ? String((cause as { message: unknown }).message)
    : fallback

/** 目標の一覧の1行。いまの目標かどうかは呼んだ側が `id` の最大で判定する */
export type GoalRow = {
  id: number
  goal: string
  startedAt: string
  cycleDays: number
  deadline: string
  records: number
}

/**
 * その人の目標を、過去のものも含めて全部そのまま出す。
 *
 * **アプリ本体はいちばん新しい1件しか読まない**（useGoalState の fetchGoal）。
 * 何件たまっているかを見る手段がどこにも無いので、デバッグ画面にだけ置く。
 */
export async function listGoals(userId: string): Promise<GoalRow[] | string> {
  const { data, error } = await supabase
    .from('goals')
    .select('id, goal, deadline, cycle_days, started_at, records(id)')
    .eq('user_id', userId)
    .order('id', { ascending: false })

  if (error) return messageOf(error, '目標の一覧を取れませんでした。')

  return (data ?? []).map((row) => ({
    id: row.id as number,
    goal: (row.goal as string) ?? '',
    startedAt: (row.started_at as string) ?? '',
    cycleDays: (row.cycle_days as number) ?? 1,
    deadline: (row.deadline as string) ?? '',
    // count ではなく id を引いて数える。行数だけなら join の結果を数えれば足りる
    records: ((row.records as unknown[]) ?? []).length,
  }))
}

/** 1日ぶんの記録を消す。**1レコード＝1日**なので、これが最小単位 */
export async function deleteRecord(goalId: number, day: string): Promise<string | null> {
  const { error } = await supabase
    .from('records')
    .delete()
    .eq('goal_id', goalId)
    .eq('done_on', day)

  return error ? messageOf(error, `${day} の記録を消せませんでした。`) : null
}

/** いまの目標の記録を全部消す。目標とアバターは残る（たまごに戻る） */
export async function clearRecords(goalId: number): Promise<string | null> {
  const { error } = await supabase.from('records').delete().eq('goal_id', goalId)

  return error ? messageOf(error, '記録を消せませんでした。') : null
}

/**
 * 目標を1つ、まるごと消す。
 *
 * **子から先に消す。** `records.goal_id` と `avatars.goal_id` は
 * `REFERENCES goals(id)` だけで `ON DELETE CASCADE` が付いていない
 * （supabase/schema.sql）ので、親から消すと外部キー違反で落ちる。
 */
export async function deleteGoal(goalId: number): Promise<string | null> {
  const records = await supabase.from('records').delete().eq('goal_id', goalId)
  if (records.error) return messageOf(records.error, '記録を消せませんでした。')

  const avatars = await supabase.from('avatars').delete().eq('goal_id', goalId)
  if (avatars.error) return messageOf(avatars.error, 'アバターを消せませんでした。')

  const goals = await supabase.from('goals').delete().eq('id', goalId)
  if (goals.error) return messageOf(goals.error, '目標を消せませんでした。')

  return null
}

/**
 * その人の目標を、過去のものも含めて全部消す。
 *
 * 目標を作り直すたびに `goals` へ行が積まれる（前の目標は消さない）ので、
 * デバッグしていると増え続ける。まっさらから試したいとき用。
 * 対象は RLS が自分の行に絞るが、`user_id` でも絞って意図をコードに残す。
 */
export async function deleteAllGoals(userId: string): Promise<string | null> {
  const { data, error } = await supabase.from('goals').select('id').eq('user_id', userId)
  if (error) return messageOf(error, '目標の一覧を取れませんでした。')

  for (const row of data ?? []) {
    const failed = await deleteGoal(row.id as number)
    if (failed) return failed
  }
  return null
}

/**
 * 「進化の演出をどこまで見せたか」を戻す。
 *
 * 演出は `stage.id > seenStage` の間だけ流れ、流し終わると `seenStage` が
 * 上がって二度と出ない（pages/MainPage.tsx）。**もう一度見るにはここを戻すしかない。**
 * 0 に戻せば孵化から、2 に戻せば完全体への進化だけを見られる。
 */
export async function rewindSeenStage(goalId: number, stage: number): Promise<string | null> {
  const { error } = await supabase
    .from('avatars')
    .update({ seen_stage: Math.max(0, stage) })
    .eq('goal_id', goalId)

  return error ? messageOf(error, '演出の見せ済みを戻せませんでした。') : null
}
