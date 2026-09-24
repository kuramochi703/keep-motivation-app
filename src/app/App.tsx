import LoginPage from '../pages/LoginPage'
import MainPage from '../pages/MainPage'
import SetupPage from '../pages/SetupPage'
import AccountBar from './AccountBar'
import TopPage from '../pages/TopPage'
import { useApp } from '../state/useApp'
import { lazy, Suspense } from 'react'

const DebugPage = import.meta.env.DEV
  ? lazy(() => import('../pages/DebugPage'))
  : null

export default function App() {
  const { user, ready, signIn, signOut, state, goals, currentGoalId, selectGoal, setDayOffset, reload, loaded, loadError, retryLoad, hasStarted, completeTutorial, screen, start, extendDeadline, markStageSeen, newGoal, elapsed, running, toggleTimer, recordOnly } = useApp()

  // ゲートは3段。セッションの確認 → ログイン → 目標の読み込み（AUTH_PLAN 4章）
  if (!ready) {
    return <div role="status">読み込み中...</div>
  }

  if (!user) {
    return <LoginPage onSignIn={signIn} />
  }

  if (loadError) {
    return (
      <div role="alert">
        <p>{loadError}</p>
        <button type="button" onClick={retryLoad}>再試行</button>
        <button type="button" onClick={signOut}>ログアウト</button>
      </div>
    )
  }

  if (!loaded) {
    return <div role="status">読み込み中...</div>
  }

  return (
    <div className={`shell${screen === 'main' ? ' dashboard-shell' : ''}`}>
      <AccountBar email={user.email ?? ''} onSignOut={signOut} />
      <main className="content">
        {screen === 'debug' && DebugPage ? (
          <Suspense fallback={<p role="status">読み込み中...</p>}>
            <DebugPage state={state} userId={user.id} loaded={loaded} hasStarted={hasStarted}
              elapsed={elapsed} running={running} onRecord={recordOnly}
              onSetDayOffset={setDayOffset} onReload={reload} onNewGoal={newGoal} />
          </Suspense>
        ) : screen === 'top' ? (
          <TopPage onStart={completeTutorial} />
        ) : screen === 'setup' ? (
          <SetupPage state={state} onStart={start} />
        ) : (
          <MainPage
            state={state}
            goals={goals}
            currentGoalId={currentGoalId}
            onSelectGoal={selectGoal}
            elapsed={elapsed}
            running={running}
            onToggleTimer={toggleTimer}
            onRecordOnly={recordOnly}
            onNewGoal={newGoal}
            onExtend={extendDeadline}
            onStageSeen={markStageSeen}
          />
        )}
      </main>
    </div>
  )
}
