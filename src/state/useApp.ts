import type { SetupInput } from './logic'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from './useAuth'
import { useGoalState } from './useGoalState'
import { isDebugPath, useScreen, type Screen } from './useScreen'
import { useTimer } from './useTimer'
import { allowedScreen, entryScreen } from './screenFlow'

export type { Screen }

/**
 * ログイン状態（useAuth）・画面遷移（useScreen）・タイマー（useTimer）・
 * 目標の状態と保存（useGoalState）を1つのAPIにまとめる合成層。
 * 4つの間をまたぐ操作（達成でタイマーを止める、ログアウトで全部戻す、など）はここで配線する。
 */
export function useApp() {
  const { screen: requestedScreen, setScreen } = useScreen()
  const auth = useAuth()
  const userId = auth.user?.id ?? null
  // useGoalState が知るのは uuid 1つだけ。誰かはここで渡す
  const goal = useGoalState(userId)
  const timer = useTimer(goal.markSessionDone)
  const [routedUserId, setRoutedUserId] = useState<string | null>(null)
  const currentUserId = useRef(userId)
  currentUserId.current = userId
  // 以前に目標を設定したアカウントも、初回の案内は完了済みとして扱う。
  const tutorialCompleted = auth.tutorialCompleted || goal.hasGoalHistory
  const hasCurrentGoal = goal.hasStarted && goal.state.goalId !== null
  const screen = allowedScreen(requestedScreen, tutorialCompleted, hasCurrentGoal)

  useEffect(() => {
    if (!userId || !goal.loaded) {
      setRoutedUserId(null)
      return
    }
    if (routedUserId === userId) return
    setScreen(isDebugPath() ? 'debug' : entryScreen(tutorialCompleted, hasCurrentGoal))
    setRoutedUserId(userId)
  }, [userId, goal.loaded, tutorialCompleted, hasCurrentGoal, routedUserId, setScreen])

  const go = (id: Screen) => {
    setScreen(allowedScreen(id, tutorialCompleted, hasCurrentGoal))
  }

  const completeTutorial = async () => {
    if (!userId) return
    if (await auth.completeTutorial() && currentUserId.current === userId) {
      setScreen('setup')
    }
  }

  const start = async (input: SetupInput) => {
    if (await goal.start(input) && currentUserId.current === userId) {
      setScreen('main')
    }
  }

  const reset = () => {
    timer.reset()
    goal.reset()
    setScreen('setup')
  }

  const recordOnly = () => {
    timer.complete()
    goal.markSessionDone()
  }

  const nextDay = () => {
    timer.reset()
    goal.nextDay()
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
    loaded: goal.loaded && routedUserId === userId,
    loadError: goal.loadError,
    retryLoad: goal.retryLoad,
    hasStarted: goal.hasStarted,
    hasCurrentGoal,
    tutorialCompleted,
    completeTutorial,
    screen,
    go,
    start,
    reset,
    extendDeadline: goal.extendDeadline,
    markStageSeen: goal.markStageSeen,
    newGoal,
    elapsed: timer.elapsed,
    running: timer.running,
    toggleTimer: timer.toggle,
    recordOnly,
    nextDay,
  }
}
