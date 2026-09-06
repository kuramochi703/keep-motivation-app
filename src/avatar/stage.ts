/**
 * 成長ステージ（進化）の軸。
 *
 * 活力（logic.ts の 0〜100）が「今の調子」を表すのに対し、こちらは
 * 「のべ何日やったか」で決まる、下がらない軸。見た目は この2軸の掛け合わせ。
 *
 * ここは avatar/ の中で完結させている。logic.ts には手を入れていないので、
 * ロジック係がステージ軸を State に持たせたくなったら、この表をそのまま
 * 移して `days` の出どころだけ差し替えればいい。
 */
export type Stage = {
  /** 見た目の分岐に使う番号。0 が最小 */
  id: number
  /** 到達に必要な、のべ達成日数 */
  min: number
  name: string
  /** そのステージで見た目に何が増えるか。README.md の表と対応 */
  gains: string
}

export const STAGES: Stage[] = [
  { id: 0, min: 0, name: 'たまご', gains: 'まだ殻の中。ゆらゆら揺れるだけ' },
  { id: 1, min: 1, name: 'ひよこ', gains: '殻を破って登場。小さなからだと足' },
  { id: 2, min: 3, name: 'やんちゃひよこ', gains: 'つばさが生える' },
  { id: 3, min: 7, name: 'もふもふ', gains: 'からだが丸くなり、しっぽがつく' },
  { id: 4, min: 14, name: 'いっちょまえ', gains: 'とさかが立つ' },
  { id: 5, min: 30, name: 'りりしい', gains: 'マフラーを巻く' },
  { id: 6, min: 60, name: 'まんまるの主', gains: '冠をかぶり、まわりが光る' },
]

/** のべ達成日数から今のステージを返す */
export const stageOf = (days: number): Stage =>
  STAGES.reduce((acc, s) => (days >= s.min ? s : acc), STAGES[0])

/** 次のステージまであと何日か。最終ステージなら null */
export const daysToNextStage = (days: number): number | null => {
  const next = STAGES.find((s) => s.min > days)
  return next ? next.min - days : null
}
