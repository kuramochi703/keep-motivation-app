import MainPage from './pages/MainPage'
import SetupPage from './pages/SetupPage'
import Sidebar, { type NavItem } from './Sidebar'
import TopPage from './pages/TopPage'
import { useApp } from './useApp'

const NAV: NavItem[] = [
  { id: 'top', label: 'トップ' },
  { id: 'setup', label: '目標設定' },
  { id: 'main', label: 'ダッシュボード' },
]

export default function App() {
  const { state, screen, go, start, reset, extendDeadline, newGoal, elapsed, running, toggleTimer, recordOnly, nextDay } = useApp()

  const select = (id: string) => {
    if (id === 'top' || id === 'setup' || id === 'main') go(id)
  }

  return (
    <div className={`shell${screen === 'main' ? ' dashboard-shell' : ''}`}>
      <Sidebar items={NAV} current={screen} onSelect={select} />
      <main className="content">
        {screen === 'top' ? (
          <TopPage onStart={() => go('setup')} variant={state.avatarId} />
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
            onReset={reset}
          />
        )}
      </main>
    </div>
  )
}
