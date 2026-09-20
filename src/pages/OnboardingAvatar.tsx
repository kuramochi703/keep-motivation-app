import { Component, lazy, Suspense, useState, type ReactNode } from 'react'
import Avatar from '../avatar/Avatar'
import { levelOf } from '../state/logic'

const OnboardingAvatarModel = lazy(() => import('./OnboardingAvatarModel'))

type Props = {
  src: string
  days?: number
  vitality?: number
}

/** 素材が未指定ならもりおを表示し、画像・GLB / glTF で差し替えられる枠。 */
export default function OnboardingAvatar({ src, days = 0, vitality = 90 }: Props) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)

  return (
    <div className="onboarding-avatar" aria-hidden="true">
      {!src ? (
        <div className="onboarding-morio">
          <Avatar variant={0} lv={levelOf(vitality).lv} vitality={vitality} days={days} />
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
