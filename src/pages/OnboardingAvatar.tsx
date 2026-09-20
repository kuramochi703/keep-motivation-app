import { Component, lazy, Suspense, useState, type ReactNode } from 'react'

const OnboardingAvatarModel = lazy(() => import('./OnboardingAvatarModel'))

/** 画像と GLB / glTF を拡張子で切り替える装飾用の枠。 */
export default function OnboardingAvatar({ src }: { src: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)

  return (
    <div className="onboarding-avatar" aria-hidden="true">
      {/\.(glb|gltf)(?:[?#]|$)/i.test(src) ? (
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
