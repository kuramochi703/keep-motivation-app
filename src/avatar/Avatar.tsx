import { Component, Suspense, lazy, type ReactNode, useEffect, useState } from 'react'
import { lookOf } from './look'

// three.js は容量が大きい。初回表示をこれに待たせたくないので
// 別チャンクに切り出し、読み込み終わるまでは場所取りだけしておく。
const AvatarCanvas = lazy(() => import('./AvatarCanvas'))

type Props = {
  /** 活力レベル 0〜4（logic.ts の levelOf が返す lv） */
  lv: number
  /** どのアバターか。logic.ts の AvatarId（0:もりお 1:だいち 2:こむぎ） */
  variant?: number
  /** 活力 0〜100。色と姿勢を連続的に変えるのに使う */
  vitality?: number
  /** のべ達成日数。成長ステージはここから決まる */
  days?: number
  /** トップページ用に卵の姿を表示する */
  egg?: boolean
}

/**
 * アバターの入口。
 *
 * 表示は react-three-fiber の 3D ひとつだけ。以前は WebGL が使えない時に
 * インライン SVG の 2D 版へ落としていたが、見た目が二種類あると
 * 「環境によって別のアバターが出る」状態になるのでやめた。
 * 3D を出せない場合は、レイアウトを崩さないための空の枠だけを置く。
 */
export default function Avatar({ lv, variant = 0, vitality, days = 0, egg = false }: Props) {
  const look = lookOf(days, vitality ?? 0, lv, variant)
  if (egg) {
    look.stage = 0
    look.isEgg = true
  }
  const animate = useAnimationAllowed()

  if (!hasWebGL()) {
    return <AvatarPlaceholder />
  }

  return (
    <WebGLBoundary>
      <Suspense fallback={<AvatarPlaceholder />}>
        <AvatarCanvas look={look} animate={animate} />
      </Suspense>
    </WebGLBoundary>
  )
}

/**
 * 3D がまだ出せない間の場所取り。
 * `.avatar-3d` と同じ比率・同じ幅なので、3D に入れ替わっても行がずれない。
 */
function AvatarPlaceholder() {
  return <div className="avatar avatar-3d avatar-placeholder" aria-hidden="true" />
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
class WebGLBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.warn('[avatar] 3D の描画に失敗しました。', error)
  }

  render() {
    return this.state.failed ? <AvatarPlaceholder /> : this.props.children
  }
}
