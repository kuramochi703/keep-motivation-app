import type { SetupInput } from './logic'
import { useEffect } from 'react'
import { useAuth } from './useAuth'
import { useGoalState } from './useGoalState'
import { isDebugPath, useScreen, type Screen } from './useScreen'
import { useTimer } from './useTimer'

export type { Screen }

/**
 * ログイン状態（useAuth）・画面遷移（useScreen）・タイマー（useTimer）・
 * 目標の状態と保存（useGoalState）を1つのAPIにまとめる合成層。
 * 4つの間をまたぐ操作（達成でタイマーを止める、ログアウトで全部戻す、など）はここで配線する。
 */
export function useApp() {
  const { screen, setScreen } = useScreen()
  const auth = useAuth()
  // useGoalState が知るのは uuid 1つだけ。誰かはここで渡す
  const goal = useGoalState(auth.user?.id ?? null)
  const timer = useTimer(goal.markSessionDone)

  useEffect(() => {
    if (goal.loaded && goal.hasStarted && !isDebugPath()) {
      setScreen('main')
    }
  }, [goal.loaded, goal.hasStarted, setScreen])

  const go = (id: Screen) => {
    if (id === 'main') goal.markStarted()
    setScreen(id)
  }

  const start = async (input: SetupInput) => {
    if (await goal.start(input)) {
      setScreen('main')
    }
  }

  const reset = () => {
    timer.reset()
    goal.reset()
    setScreen('top')
  }

  /**
   * 目標一覧で別の目標に切り替える。**走っているタイマーは捨てる。**
   * 5分の途中で切り替えたぶんが、切り替え先の記録になってしまうため。
   */
  const selectGoal = (id: number) => {
    timer.reset()
    goal.selectGoal(id)
    setScreen('main')
  }

  const recordOnly = () => {
    timer.complete()
    goal.markSessionDone()
  }

  const nextDay = () => {
    timer.reset()
    goal.nextDay()
  }

  /** デバッグ画面の日付操作。日をまたぐのでタイマーは捨てる */
  const setDayOffset = (days: number) => {
    timer.reset()
    goal.setDayOffset(days)
  }

  const newGoal = () => {
    timer.reset()
    goal.newGoal()
    setScreen('setup')
  }

  /** ログアウト。目標の状態は user が null になった useGoalState 側で戻る */
  const signOut = async () => {
    timer.reset()
    setScreen('top')
    await auth.signOut()
  }

  return {
    user: auth.user,
    ready: auth.ready,
    signIn: auth.signIn,
    signOut,
    state: goal.state,
    goals: goal.goals,
    currentGoalId: goal.currentGoalId,
    loaded: goal.loaded,
    hasStarted: goal.hasStarted,
    screen,
    go,
    start,
    selectGoal,
    reset,
    extendDeadline: goal.extendDeadline,
    markStageSeen: goal.markStageSeen,
    newGoal,
    elapsed: timer.elapsed,
    running: timer.running,
    toggleTimer: timer.toggle,
    recordOnly,
    nextDay,
    setDayOffset,
    reload: goal.reload,
  }
}
