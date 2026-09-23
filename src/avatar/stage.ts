/**
 * 成長ステージ（進化）の軸。
 *
 * 気分（logic.ts の `moodOf`）が「今の調子」を表すのに対し、こちらは
 * **下がらない軸**。見た目はこの2軸の掛け合わせ。
 *
 * 「のべ達成日数」ではなく**サイクル**で決まる（README 2章）。
 * ここは avatar/ の中で完結させているが、中身はただの計算なので
 * `state/` へ移したくなったら**関数名と型を変えずに**そのまま移せる。
 */
import { cycleIndex, doneCycles } from '../state/logic'

/** ステージに上がる条件 */
export type StageCondition =
  /** 連続 `need` サイクル */
  | { kind: 'run'; need: number }
  /** 直近 `window` サイクルのうち `need` サイクル */
  | { kind: 'window'; window: number; need: number }

export type Stage = {
  /** 見た目の分岐に使う番号。0（たまご）から始まる */
  id: number
  name: string
  /** そのステージで見た目に何が増えるか。分岐の実体は look.ts / Chick.tsx */
  gains: string
  /** このステージに上がる条件。たまご（0）は初期状態なので持たない */
  to?: StageCondition
}

/**
 * 進化の条件はこの表1か所に閉じ込める。**きつすぎたら数字だけ動かす。**
 * （ステージ3の14サイクル連続は、週1回の人だと98日かかる）
 */
export const STAGES: Stage[] = [
  { id: 0, name: 'たまご', gains: '殻のまま。気分を持たない1状態だけ' },
  {
    id: 1,
    name: '幼体',
    gains: 'からだ・あし・くちばし・小さいとさか',
    to: { kind: 'run', need: 2 },
  },
  {
    id: 2,
    name: '成体',
    gains: 'つばさ ＋ 一回り大きく ＋ とさかが立派に',
    to: { kind: 'window', window: 5, need: 4 },
  },
  {
    id: 3,
    name: '完全体',
    gains: 'マフラー ＋ 冠',
    to: { kind: 'run', need: 14 },
  },
]

/** 次のステージまでの進捗。`あと○` ではなく `have / need` で出す */
export type NextGoal = {
  /** 次のステージ */
  stage: Stage
  kind: StageCondition['kind']
  have: number
  need: number
  /** 窓の広さ。`kind === 'window'` のときだけ意味がある */
  window: number
}

/** サイクルごとの「そこまでの連続数」と「直近5サイクルの達成数」 */
const scan = (cycles: Set<number>, upto: number) => {
  let run = 0
  const window: number[] = []
  const rows: { run: number; inWindow: (w: number) => number }[] = []
  for (let i = 0; i <= upto; i++) {
    run = cycles.has(i) ? run + 1 : 0
    window.push(cycles.has(i) ? 1 : 0)
    const at = i
    rows.push({
      run,
      inWindow: (w: number) => {
        let n = 0
        for (let j = Math.max(0, at - w + 1); j <= at; j++) n += window[j]
        return n
      },
    })
  }
  return rows
}

/** 条件を満たしているか */
const meets = (
  row: { run: number; inWindow: (w: number) => number },
  to: StageCondition
) => (to.kind === 'run' ? row.run >= to.need : row.inWindow(to.window) >= to.need)

/**
 * 今のステージ。
 *
 * **起点サイクルから1サイクルずつ走査し、その時点の次の条件だけを見る。**
 * 「いまの値で当てはまる最大のステージ」を採ると、卵から成体へ飛んでしまう
 * （`✓✓✓✓✗` のサイクルは連続 0 なのに「直近5で4」が成立する）。
 * 一度上がったステージは下がらない。
 *
 * @param done 達成日の配列 YYYY-MM-DD
 * @param cycleDays サイクル長
 * @param startedAt サイクルの起点 YYYY-MM-DD
 * @param todayKey 今日 YYYY-MM-DD
 */
export function evolutionOf(
  done: string[],
  cycleDays: number,
  startedAt: string,
  todayKey: string
): Stage {
  const now = cycleIndex(todayKey, startedAt, cycleDays)
  if (now < 0) return STAGES[0]

  const cycles = doneCycles(done, startedAt, cycleDays)
  const rows = scan(cycles, now)

  let stage = 0
  for (const row of rows) {
    const next = STAGES[stage + 1]
    if (next?.to && meets(row, next.to)) stage++
  }
  return STAGES[stage]
}

/** 次のステージと、そこまでの進捗。最終ステージなら null */
export function nextGoalOf(
  done: string[],
  cycleDays: number,
  startedAt: string,
  todayKey: string
): NextGoal | null {
  const stage = evolutionOf(done, cycleDays, startedAt, todayKey)
  const next = STAGES[stage.id + 1]
  if (!next?.to) return null

  const now = Math.max(0, cycleIndex(todayKey, startedAt, cycleDays))
  const cycles = doneCycles(done, startedAt, cycleDays)
  const rows = scan(cycles, now)
  const row = rows[rows.length - 1]

  return next.to.kind === 'run'
    ? { stage: next, kind: 'run', have: row.run, need: next.to.need, window: 0 }
    : {
        stage: next,
        kind: 'window',
        have: row.inWindow(next.to.window),
        need: next.to.need,
        window: next.to.window,
      }
}
