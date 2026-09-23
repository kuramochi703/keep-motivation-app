/**
 * 「ステージ × 気分」から、3D で描くための見た目パラメータを決める。
 *
 * ここは three.js に一切依存しない、ただの計算。理由は2つ。
 *
 * 1. 見た目の仕様（どのステージで何が増える／気分で色と姿勢がどう変わる）を
 *    1ファイルで読めるようにするため。絵の調整はまずここを触る。
 * 2. 3D をやめて別の描き方に差し替えるときも、この対応表だけは残せるため。
 *
 * 描画そのものは Chick.tsx。値の意味は下のコメントを参照。
 *
 * **活力（0〜100 の連続値）はもう無い。** 色は気分の表（logic.ts の `MOODS`）を
 * 引くだけで、**色相はユーザーが選んだ `hue` に固定**する。色相まで動かすと、
 * 選んだ色が画面から消えてしまう。
 */
import type { Mood, MoodId } from '../state/logic'

export type EyeShape =
  /** 元気。∩ の形に笑う */
  | 'happy'
  /** ふつう。まるい目 */
  | 'open'
  /** しょんぼり。∪ の形に下がる */
  | 'half'
  /** ボロボロ。閉じている */
  | 'closed'

/**
 * 座り込むときに流すクリップ。**落ち込みの2段は、色ではほとんど読めない。**
 * 彩度はもう下限近く、明度は下げない決まりなので、差は姿勢で見せる。
 */
export type SitClip =
  /** ひと休み。背中側へ倒れてくつろぐ。元気なときも流す */
  | 'Rest'
  /** 3サイクル放置。うずくまってうなだれる */
  | 'Slump'
  /** 4サイクル放置。ぺたんと伏せて、ほとんど動かない */
  | 'Sink'

export type Look = {
  /** 0〜3。0 はたまご */
  stage: number
  /** 色相 0〜359。ユーザーが選んだ色 */
  hue: number
  /** 今の気分。たまご（ステージ0）は気分を持たない */
  mood: MoodId | null

  /** まだ殻の中か。true の間はからだのパーツを一切出さない */
  isEgg: boolean

  /** からだの半径。ステージが上がるほど大きく丸くなる */
  bodyRadius: number
  /** 頭の大きさ。からだに対する比。育つほど頭でっかちでなくなる */
  headRatio: number

  bodyColor: string
  bellyColor: string
  beakColor: string
  eye: EyeShape
  /** 0〜1。うつむき具合。1 で完全にへたる */
  droop: number
  /** 0〜1。元気さ。低いと歩き出さず、立ち止まったままになる */
  liveliness: number
  /** 座り込むときに流すクリップ。気分で変わる */
  sit: SitClip

  /** 翼。モデルの Wing_L / Wing_R を出し入れする */
  wings: boolean
  /**
   * 頭の羽（とさか）。**どのステージでも必ず出す。**
   * ひよこだと分かる目印なので、消すと別の生き物に見えてしまう。
   * 成長は出し入れではなく `crestScale` の大きさで表す。
   */
  crest: boolean
  /** とさかの大きさの倍率。育つと立派になる */
  crestScale: number
  scarf: boolean
  crown: boolean
  /** あぶら汗。しんどいときだけ */
  sweat: boolean
  /** まわりのエフェクト（Effects.tsx）。気分の表から引く。たまごには出さない */
  effects: Effects
}

/**
 * まわりのエフェクト。**3つは同時に出せる**（かがやきは輝き＋光の粒）。
 * どの気分で何が出るかは logic.ts の `MOODS` が持つ
 */
export type Effects = {
  /** アバターが輝く。後光と、からだの発光。粒は出さない（それは motes） */
  glow: boolean
  /** 足元から光の粒が立ちのぼる */
  motes: boolean
  /** どんより。背中に垂れ込める暗いもやと、沈んでいく暗い粒 */
  gloom: boolean
}

export const NO_EFFECTS: Effects = { glow: false, motes: false, gloom: false }

/** 0〜1 に丸める */
const unit = (v: number) => Math.max(0, Math.min(1, v))

/** three.js が読める形の hsl 文字列 */
const hsl = (h: number, s: number, l: number) =>
  `hsl(${h.toFixed(1)}, ${s.toFixed(1)}%, ${l.toFixed(1)}%)`

/** たまごの殻。**気分を持たないので、色相以外は固定** */
const EGG_S = 24
const EGG_L = 88

const EYE_OF: Record<MoodId, EyeShape> = {
  sink: 'closed',
  down: 'closed',
  low: 'half',
  ok: 'open',
  good: 'open',
  lively: 'happy',
  shine: 'happy',
}

/**
 * 座り込む姿勢。**落ち込んだときだけ専用のクリップ**にする。
 * 休憩（Rest）は元気なときのひと休みでもあるので、落ち込みに使い回すと
 * 「休んでいる」のか「へこんでいる」のかが区別できない。
 */
const SIT_OF: Record<MoodId, SitClip> = {
  sink: 'Sink',
  down: 'Slump',
  low: 'Rest',
  ok: 'Rest',
  good: 'Rest',
  lively: 'Rest',
  shine: 'Rest',
}

/**
 * @param stage 進化のステージ 0〜3（avatar/stage.ts の `evolutionOf`）
 * @param hue 色相 0〜359（ユーザーが選んだ色）
 * @param mood 今の気分（logic.ts の `moodOf`）。たまごなら null
 */
export function lookOf(stage: number, hue: number, mood: Mood | null): Look {
  const isEgg = stage <= 0 || mood === null
  // ステージを 0〜1 に。からだの大きさに効かせる
  const s = unit(stage / 3)

  // **落ち込みは彩度で表し、明度は下げない**（下限 58）。暗く沈めると汚く
  // 見えるうえ、前かがみ（droop）と汗で十分しんどそうに見える
  // **たまごは気分を持たない。** 気分が渡ってきても色は固定値で塗る
  const sat = isEgg ? EGG_S : mood?.s ?? EGG_S
  const lum = isEgg ? EGG_L : mood?.l ?? EGG_L
  const liveliness = isEgg ? 0 : mood?.liveliness ?? 0

  return {
    stage: isEgg ? 0 : stage,
    hue,
    mood: isEgg ? null : mood?.id ?? null,
    isEgg,

    bodyRadius: 0.62 + s * 0.26,
    headRatio: 0.86 - s * 0.16,

    // ここは必ずカンマ区切りの hsl() で書くこと。three.js の Color は
    // CSS Color 4 のスペース区切り（`hsl(50 80% 70%)`）を解釈できず、
    // 黙って白になる。色が出ない時はまずここを疑う。
    bodyColor: hsl(hue, sat, lum),
    // おなか（白い側）。胴体を明るくしたぶん、こちらも上げないと差が消える。
    // **たまごのときはこれが殻の色**（Chick.tsx の Egg が使う）
    bellyColor: hsl(hue, sat * 0.5, Math.min(94, lum + 20)),
    // くちばしと足。ここだけ彩度が高いと浮くので、杏子色くらいで止める
    beakColor: hsl(30, 24 + sat * 0.5, 66),

    eye: !isEgg && mood ? EYE_OF[mood.id] : 'open',
    // 元気なほど背筋が伸びる。いきいき（0.9）以上で完全にまっすぐ
    droop: unit((0.6 - liveliness) / 0.6),
    liveliness,
    sit: !isEgg && mood ? SIT_OF[mood.id] : 'Rest',

    wings: stage >= 2,
    // とさかは常に出す。ステージ2で「生える」のではなく、そこから立派になる
    crest: true,
    crestScale: stage >= 2 ? 1 : 0.62,
    scarf: stage >= 3,
    crown: stage >= 3,
    sweat: !isEgg && (mood?.sweat ?? false),
    effects: isEgg || !mood ? NO_EFFECTS : { glow: mood.glow, motes: mood.motes, gloom: mood.gloom },
  }
}
