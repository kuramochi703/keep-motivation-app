import { Component, lazy, Suspense, useState, type ReactNode } from 'react'
import Avatar from '../avatar/Avatar'
import { MOODS, type Mood } from '../state/logic'

const OnboardingAvatarModel = lazy(() => import('./OnboardingAvatarModel'))

type Props = {
  src: string
  /** 進化のステージ 0〜3 */
  stage?: number
  /** 気分。案内の絵なので、既定は「いきいき」 */
  mood?: Mood | null
}

const LIVELY = MOODS.find((m) => m.id === 'lively') ?? null

/** 素材が未指定ならアプリ共通のアバターを表示し、画像・GLB / glTF で差し替えられる枠。 */
export default function OnboardingAvatar({ src, stage = 1, mood = LIVELY }: Props) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)

  return (
    <div className="onboarding-avatar" aria-hidden="true">
      {!src ? (
        <div className="onboarding-morio">
          <Avatar stage={stage} hue={150} mood={mood} />
        </div>
      ) : /\.(glb|gltf)(?:[?#]|$)/i.test(src) ? (
        <ModelBoundary key={src}>
          <Suspense fallback={<AvatarPlaceholder />}>
            <OnboardingAvatarModel src={src} fallback={<AvatarPlaceholder />} />
          </Suspense>
        </ModelBoundary>
      ) : src && failedSrc !== src ? (
        <img src={src} alt="" onError={() => setFailedSrc(src)} />
      ) : (
        <AvatarPlaceholder />
      )}
    </div>
  )
}

function AvatarPlaceholder() {
  return <div className="onboarding-avatar-placeholder">
          <svg viewBox="0 0 120 140" fill="currentColor">
            <circle cx="60" cy="40" r="27" />
            <path d="M15 123c0-32 18-50 45-50s45 18 45 50c0 8-90 8-90 0Z" />
          </svg>
        </div>
}

class ModelBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.warn('[onboarding-avatar] 3Dモデルを表示できませんでした。', error)
  }

  render() {
    return this.state.failed ? <AvatarPlaceholder /> : this.props.children
  }
}
