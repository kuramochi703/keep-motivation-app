import { Component, Suspense, lazy, type ReactNode, useEffect, useState } from 'react'
import AvatarSvg from './AvatarSvg'
import { lookOf } from './look'

// three.js は gzip でも 300KB 近くある。初回表示をこれに待たせたくないので
// 別チャンクに切り出し、読み込み終わるまでは SVG を出しておく。
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
}

/**
 * アバターの入口。
 *
 * 中身は react-three-fiber の 3D だが、WebGL が使えない環境（古い端末、
 * ソフトウェア描画を切った状態など）では従来のインライン SVG に落とす。
 * ここで落ちてもアプリの他の部分は動く、という状態を保つのが目的。
 */
export default function Avatar({ lv, variant = 0, vitality, days = 0 }: Props) {
  const look = lookOf(days, vitality ?? 0, lv, variant)
  const animate = useAnimationAllowed()
  const fallback = <AvatarSvg lv={lv} variant={variant} />

  if (!hasWebGL()) return fallback

  return (
    <WebGLBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <AvatarCanvas look={look} animate={animate} />
      </Suspense>
    </WebGLBoundary>
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
  return webgl
}

/**
 * 3D の初期化に失敗したときに SVG へ切り替えるための境界。
 * React のエラー境界はクラスでしか書けないので、ここだけクラス。
 */
class WebGLBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.warn('[avatar] 3D の描画に失敗したので SVG で表示します。', error)
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
