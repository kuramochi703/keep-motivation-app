/**
 * 「ステージ × 活力」から、3D で描くための見た目パラメータを決める。
 *
 * ここは three.js に一切依存しない、ただの計算。理由は2つ。
 *
 * 1. 見た目の仕様（何日で何が増える／活力がいくつで表情がどう変わる）を
 *    1ファイルで読めるようにするため。絵の調整はまずここを触る。
 * 2. 3D をやめて別の描き方に差し替えるときも、この対応表だけは残せるため。
 *
 * 描画そのものは Chick.tsx。値の意味は下のコメントを参照。
 */
import { stageOf } from './stage'

export type EyeShape =
  /** 元気。∩ の形に笑う */
  | 'happy'
  /** ふつう。まるい目 */
  | 'open'
  /** しょんぼり。半目 */
  | 'half'
  /** ボロボロ。閉じている */
  | 'closed'

export type Look = {
  /** 0〜6 */
  stage: number
  /** どのアバターか。0:もりお 1:だいち 2:こむぎ */
  variant: number
  /** 0〜100 */
  vitality: number
  /** 0〜4 */
  lv: number

  /** まだ殻の中か。true の間はからだのパーツを一切出さない */
  isEgg: boolean

  /** からだの半径。ステージが上がるほど大きく丸くなる */
  bodyRadius: number
  /** 頭の大きさ。からだに対する比。育つほど頭でっかちでなくなる */
  headRatio: number

  bodyColor: string
  bellyColor: string
  beakColor: string
  /** ほっぺの赤み。活力が高いときだけ出す */
  cheekOpacity: number

  eye: EyeShape
  /** 0〜1。うつむき具合。1 で完全にへたる */
  droop: number
  /** 0〜1。揺れ・跳ねの大きさ。0 でほぼ静止 */
  liveliness: number

  wings: boolean
  tail: boolean
  crest: boolean
  scarf: boolean
  crown: boolean
  /** まわりの光の粒。絶好調のときだけ */
  sparkles: boolean
  /** あぶら汗。しんどいときだけ */
  sweat: boolean
}

/** 0〜1 に丸める */
const unit = (v: number) => Math.max(0, Math.min(1, v))

/**
 * アバターの種類ごとの色相。
 * **logic.ts の `AVATARS` と並び順を必ず合わせること。**
 * 名前と説明（もりお＝みどり など）が向こうにあり、こちらは色だけを持つ。
 */
const VARIANTS = [
  /** もりお: みどり */
  { hue: 158 },
  /** だいち: あお */
  { hue: 218 },
  /** こむぎ: ピンク */
  { hue: 342 },
]

/** three.js が読める形の hsl 文字列 */
const hsl = (h: number, s: number, l: number) =>
  `hsl(${h.toFixed(1)}, ${s.toFixed(1)}%, ${l.toFixed(1)}%)`

const eyeOf = (lv: number): EyeShape =>
  lv >= 4 ? 'happy' : lv >= 2 ? 'open' : lv >= 1 ? 'half' : 'closed'

/**
 * @param days のべ達成日数
 * @param vitality 活力 0〜100
 * @param lv 活力レベル 0〜4（logic.ts の levelOf と同じもの）
 * @param variant どのアバターか（logic.ts の AvatarId）
 */
export function lookOf(days: number, vitality: number, lv: number, variant = 0): Look {
  const stage = stageOf(days).id
  const kind = VARIANTS[variant] ?? VARIANTS[0]
  // 活力を 0〜1 に。色と姿勢はこの値で連続的に変える。
  // レベル（0〜4）は表情のような、段階で切り替わるものにだけ使う。
  const v = unit(vitality / 100)
  // ステージを 0〜1 に。からだの大きさに効かせる。
  const s = stage / 6

  return {
    stage,
    variant,
    vitality,
    lv,
    isEgg: stage === 0,

    bodyRadius: 0.62 + s * 0.26,
    headRatio: 0.86 - s * 0.16,

    // やつれると彩度が抜けて灰色に寄る。色相もわずかに冷たくする。
    // ここは必ずカンマ区切りの hsl() で書くこと。three.js の Color は
    // CSS Color 4 のスペース区切り（`hsl(50 80% 70%)`）を解釈できず、
    // 黙って白になる。色が出ない時はまずここを疑う。
    // 色相はアバターの種類で決まり、彩度と明度は活力で決まる。
    // やつれると彩度が抜けて灰色に寄るので、どの種類でも「やつれ」が同じに読める。
    bodyColor: hsl(kind.hue, 6 + v * 62, 58 + v * 16),
    bellyColor: hsl(kind.hue, 8 + v * 44, 80 + v * 8),
    beakColor: hsl(30 - v * 4, 16 + v * 68, 50 + v * 8),
    cheekOpacity: unit((v - 0.6) * 2.2),

    eye: eyeOf(lv),
    droop: unit((0.55 - v) * 2),
    liveliness: 0.15 + v * 0.85,

    wings: stage >= 2,
    tail: stage >= 3,
    crest: stage >= 4,
    scarf: stage >= 5,
    crown: stage >= 6,
    sparkles: lv >= 4,
    sweat: lv === 1,
  }
}
