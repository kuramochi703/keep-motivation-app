import LoginPage from '../pages/LoginPage'
import MainPage from '../pages/MainPage'
import SetupPage from '../pages/SetupPage'
import Sidebar, { type NavItem } from './Sidebar'
import TopPage from '../pages/TopPage'
import { useApp } from '../state/useApp'
import { lazy, Suspense } from 'react'

const DebugPage = import.meta.env.DEV
  ? lazy(() => import('../pages/DebugPage'))
  : null

const NAV: NavItem[] = [
  { id: 'top', label: 'トップ' },
  { id: 'setup', label: '目標設定' },
  { id: 'main', label: 'ダッシュボード' },
]

export default function App() {
  const { user, ready, signIn, signOut, state, loaded, hasStarted, screen, go, start, reset, extendDeadline, markStageSeen, newGoal, elapsed, running, toggleTimer, recordOnly, nextDay } = useApp()

  const select = (id: string) => {
    if (id === 'top' || id === 'setup' || id === 'main') go(id)
  }

  // ゲートは3段。セッションの確認 → ログイン → 目標の読み込み（AUTH_PLAN 4章）
  if (!ready) {
    return <div role="status">読み込み中...</div>
  }

  if (!user) {
    return <LoginPage onSignIn={signIn} />
  }

  if (!loaded) {
    return <div role="status">読み込み中...</div>
  }

  return (
    <div className={`shell${screen === 'main' ? ' dashboard-shell' : ''}`}>
      <Sidebar
        items={NAV}
        current={screen}
        onSelect={select}
        userLabel={user.user_metadata.name ?? user.email ?? ''}
        onSignOut={signOut}
      />
      <main className="content">
        {screen === 'debug' && DebugPage ? (
          <Suspense fallback={<p role="status">読み込み中...</p>}>
            <DebugPage state={state} loaded={loaded} hasStarted={hasStarted}
              elapsed={elapsed} running={running} onRecord={recordOnly}
              onNextDay={nextDay} onNewGoal={newGoal} />
          </Suspense>
        ) : screen === 'top' ? (
          <TopPage onStart={() => go('setup')} />
        ) : screen === 'setup' ? (
          <SetupPage state={state} onStart={start} />
        ) : (
          <MainPage
            state={state}
            elapsed={elapsed}
            running={running}
            onToggleTimer={toggleTimer}
            onRecordOnly={recordOnly}
            onNextDay={nextDay}
            onEditGoal={() => go('setup')}
            onNewGoal={newGoal}
            onExtend={extendDeadline}
            onStageSeen={markStageSeen}
            onReset={reset}
          />
        )}
      </main>
    </div>
  )
}
