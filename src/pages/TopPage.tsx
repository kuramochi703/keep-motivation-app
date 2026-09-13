import OnboardingPage from './OnboardingPage'

type Props = {
  onStart: () => void
  variant?: number
}

export default function TopPage({ onStart }: Props) {
  return <OnboardingPage onComplete={onStart} />
}
