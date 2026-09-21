import { Component, Suspense, lazy, type ReactNode, useEffect, useState } from 'react'
import { lookOf } from './look'
import { MOODS, type Mood } from '../state/logic'

// three.js は容量が大きい。初回表示をこれに待たせたくないので
// 別チャンクに切り出し、読み込み終わるまでは場所取りだけしておく。
const AvatarCanvas = lazy(() => import('./AvatarCanvas'))

type Props = {
  /** 進化のステージ 0〜3（avatar/stage.ts の `evolutionOf`）。0 はたまご */
  stage?: number
  /** 色相 0〜359。ユーザーが選んだ色 */
  hue?: number
  /** 今の気分（logic.ts の `moodOf`）。**たまごには渡さない** */
  mood?: Mood | null
  /** デバッグ画面用に、ステージを問わずたまごの姿を出す */
  egg?: boolean
  /**
   * たまごを割る（孵化の演出）。false → true になった瞬間に
   * `EggCrack` を1回だけ流し、割れた姿のまま止まる。
   */
  hatching?: boolean
  /** 置き場いっぱいに広げる。ダッシュボードの背景ステージのように、
      決まった比率の枠ではなく与えられた面積すべてを使いたいときに */
  fill?: boolean

  /* ---- ここから下は活力時代の旧 props。画面を移す #6 までの繋ぎ ---- */
  /** @deprecated 活力レベル 0〜4。`mood` へ */
  lv?: number
  /** @deprecated アバターの種類 0〜2。`hue` へ */
  variant?: number
  /** @deprecated 活力 0〜100。`mood` へ */
  vitality?: number
  /** @deprecated のべ達成日数。`stage` へ */
  days?: number
}

/** 旧 props で呼ばれたときの読み替え。#6 で呼ぶ側を移したら消す */
const LEGACY_HUES = [150, 205, 344]
const LEGACY_MOODS: Mood['id'][] = ['down', 'low', 'ok', 'good', 'lively']
const legacyMood = (lv: number) =>
  MOODS.find((m) => m.id === (LEGACY_MOODS[lv] ?? 'ok')) ?? null
const legacyStage = (days: number) => (days >= 30 ? 3 : days >= 7 ? 2 : 1)

/**
 * アバターの入口。
 *
 * 表示は react-three-fiber の 3D ひとつだけ。以前は WebGL が使えない時に
 * インライン SVG の 2D 版へ落としていたが、見た目が二種類あると
 * 「環境によって別のアバターが出る」状態になるのでやめた。
 * 3D を出せない場合は、レイアウトを崩さないための空の枠だけを置く。
 */
export default function Avatar({
  stage,
  hue,
  mood,
  egg = false,
  fill = false,
  hatching = false,
  lv,
  variant,
  vitality: _vitality,
  days,
}: Props) {
  // **たまごかどうかはステージ判定の結果で決まる。** `egg` は
  // デバッグ画面が殻の姿だけを見たいときの手動上書き
  const resolvedStage = egg ? 0 : stage ?? (days !== undefined ? legacyStage(days) : 0)
  const resolvedHue = hue ?? LEGACY_HUES[variant ?? 0] ?? 150
  const resolvedMood = egg
    ? null
    : mood !== undefined
      ? mood
      : lv !== undefined
        ? legacyMood(lv)
        : null

  const look = lookOf(resolvedStage, resolvedHue, resolvedMood)
  const animate = useAnimationAllowed()

  if (!hasWebGL()) {
    return <AvatarPlaceholder fill={fill} />
  }

  return (
    <WebGLBoundary fill={fill}>
      <Suspense fallback={<AvatarPlaceholder fill={fill} />}>
        <AvatarCanvas look={look} animate={animate} fill={fill} hatching={hatching} />
      </Suspense>
    </WebGLBoundary>
  )
}

/**
 * 3D がまだ出せない間の場所取り。
 * `.avatar-3d` と同じ比率・同じ幅なので、3D に入れ替わっても行がずれない。
 */
function AvatarPlaceholder({ fill = false }: { fill?: boolean }) {
  return (
    <div
      className={`avatar avatar-3d avatar-placeholder${fill ? ' avatar-fill' : ''}`}
      aria-hidden="true"
    />
  )
}

/** OS の「視差効果を減らす」設定を尊重する */
function useAnimationAllowed() {
  const [ok, setOk] = useState(true)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => setOk(!mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])
  return ok
}

/** WebGL が使えるか。結果は変わらないので一度だけ調べる */
let webgl: boolean | null = null
function hasWebGL() {
  if (webgl !== null) return webgl
  try {
    const c = document.createElement('canvas')
    webgl = !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    webgl = false
  }
  if (!webgl) console.warn('[avatar] WebGL が使えないため、アバターを表示できません。')
  return webgl
}

/**
 * 3D の初期化に失敗したときに空の枠へ切り替えるための境界。
 * ここで受け止めないとアプリ全体が落ちる。
 * React のエラー境界はクラスでしか書けないので、ここだけクラス。
 */
class WebGLBoundary extends Component<{ children: ReactNode; fill?: boolean }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.warn('[avatar] 3D の描画に失敗しました。', error)
  }

  render() {
    return this.state.failed ? <AvatarPlaceholder fill={this.props.fill} /> : this.props.children
  }
}
