import { useState } from 'react'
import OnboardingAvatar from './OnboardingAvatar'
import { MOODS } from '../state/logic'
import { onboardingAvatarImages as avatars } from './onboarding-avatar'
import './onboarding-page.css'

const steps = [
  { title: '目標を設定しよう', lines: ['勉強・運動・趣味など、', '続けたい目標を決めよう。'] },
  { title: 'キャラクターが成長する', lines: ['続けるほど、キャラクターが', '元気に成長していくよ。'] },
  { title: 'さあ、はじめよう', lines: ['小さな一歩が、', 'きっと明日の元気につながる。'] },
]

/** 進化の3段階。ステージと気分の組み合わせで見せる */
const growthExamples = [
  { label: 'たまご', stage: 0, mood: null },
  { label: '幼体', stage: 1, mood: MOODS.find((m) => m.id === 'good') ?? null },
  { label: '成体', stage: 2, mood: MOODS.find((m) => m.id === 'shine') ?? null },
]

export default function OnboardingPage({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0)
  return (
    <div className="onboarding-page">
      <section className="onboarding-card" aria-label="はじめての方へ">
        <div className="onboarding-navigation">
          <span>{step + 1} / 3</span>
          <div className="onboarding-progress" role="progressbar" aria-label="案内の進捗" aria-valuemin={0} aria-valuemax={3} aria-valuenow={step + 1}><span style={{ width: `${(step + 1) / 3 * 100}%` }} /></div>
          <button className="onboarding-skip" type="button" onClick={onComplete}>スキップ</button>
        </div>
        <div className="onboarding-body" key={step}>
          <header className="onboarding-heading" aria-live="polite">
            <h1>{steps[step].title}</h1>
            <p>{steps[step].lines[0]}<br />{steps[step].lines[1]}</p>
          </header>
          {step === 0 && <>
            <div className="onboarding-goal"><span>目標（例）</span><div>
              <svg width="25" height="25" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v15m0-15C9 3 5 3 2 5v14c3-2 7-2 10 1 3-3 7-3 10-1V5c-3-2-7-2-10 0Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg>
              資格の勉強</div></div>
            <div className="onboarding-scene"><p className="onboarding-bubble">たった5分から<br />始められるよ！</p><div className="onboarding-avatar-space"><OnboardingAvatar src={avatars.goal || avatars.default} /></div></div>
          </>}
          {step === 1 && <>
            <div className="onboarding-growth">
              {growthExamples.map(({ label, stage, mood }, index) => <div key={label}><div className="onboarding-growth-space"><OnboardingAvatar src={avatars.growth[index] || avatars.default} stage={stage} mood={mood} /></div><span>{label}</span>{index < 2 && <i aria-hidden="true">→</i>}</div>)}
            </div>
            <div className="onboarding-evolution"><span className="onboarding-sprout" aria-hidden="true">🌱</span><div>
              <p><b>2サイクル続ける</b>と、たまごがかえる。</p>
              <p><b>直近5サイクルのうち4サイクル</b>で成体に。</p>
              <p className="onboarding-evolution-note">サイクルを続けるほど色が濃くなり、休むと色が抜けていく。1サイクルぶんの猶予はあるよ。</p>
            </div></div>
            <div className="onboarding-scene onboarding-scene-small"><p className="onboarding-bubble">いっしょに<br />がんばろう！</p><div className="onboarding-avatar-space"><OnboardingAvatar src={avatars.encouragement || avatars.default} /></div></div>
          </>}
          {step === 2 && <>
            <div className="onboarding-scene onboarding-scene-final"><p className="onboarding-note">5分で<br />変わるよ！</p><div className="onboarding-avatar-space"><OnboardingAvatar src={avatars.start || avatars.default} /></div></div>
            <p className="onboarding-closing">今日のわたしが、<br />もっとすきになる。<span aria-hidden="true">🌱</span></p>
          </>}
        </div>
        <button className="onboarding-next" type="button" onClick={() => step < 2 ? setStep(step + 1) : onComplete()}>{step === 2 ? 'はじめる' : '次へ'}<svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
      </section>
    </div>
  )
}
