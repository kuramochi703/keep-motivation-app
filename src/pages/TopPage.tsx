import OnboardingPage from './OnboardingPage'

type Props = {
  onStart: () => void
}

export default function TopPage({ onStart }: Props) {
  return <OnboardingPage onComplete={onStart} />
}
