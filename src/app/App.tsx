import GoalsPage from '../pages/GoalsPage'
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

/**
 * **目標設定はメニューに出さない。** あの画面は「編集」ではなく「新しい目標を作る」なので、
 * いつでも押せる場所に置くと、育てている目標がもう1本増えるだけの操作になる。
 * 入口は目標一覧の「新しい目標を作る」とダッシュボードのボタンに絞って、
 * どちらも作るのだと分かる文脈から入るようにしている。
 */
const NAV: NavItem[] = [
  { id: 'top', label: 'トップ' },
  { id: 'goals', label: '目標一覧' },
  { id: 'main', label: 'アバター部屋' },
]

export default function App() {
  const { user, ready, signIn, signOut, state, goals, currentGoalId, selectGoal, setDayOffset, reload, loaded, loadError, retryLoad, hasStarted, completeTutorial, screen, go, start, reset, extendDeadline, markStageSeen, newGoal, elapsed, running, toggleTimer, recordOnly, nextDay } = useApp()

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
        ) : screen === 'goals' ? (
          <GoalsPage
            goals={goals}
            currentGoalId={currentGoalId}
            onSelect={selectGoal}
            onNewGoal={newGoal}
          />
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
            onNewGoal={newGoal}
            onGoalList={() => go('goals')}
            onExtend={extendDeadline}
            onStageSeen={markStageSeen}
            onReset={reset}
          />
        )}
      </main>
    </div>
  )
}
