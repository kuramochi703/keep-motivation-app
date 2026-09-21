import type { SetupInput } from './logic'
import { useEffect } from 'react'
import { useGoalState } from './useGoalState'
import { isDebugPath, useScreen, type Screen } from './useScreen'
import { useTimer } from './useTimer'

export type { Screen }

/**
 * 画面遷移（useScreen）・タイマー（useTimer）・目標の状態と保存（useGoalState）を
 * 1つのAPIにまとめる合成層。3つの間をまたぐ操作（達成でタイマーを止める、など）はここで配線する。
 */
export function useApp() {
  const { screen, setScreen } = useScreen()
  const goal = useGoalState()
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

  return {
    state: goal.state,
    loaded: goal.loaded,
    hasStarted: goal.hasStarted,
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
