// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useTimer } from './useTimer'

let root: Root
let container: HTMLDivElement
let timer: ReturnType<typeof useTimer>
const onComplete = vi.fn()

function Harness({ seconds }: { seconds: number }) {
  timer = useTimer(onComplete, seconds)
  return null
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.useFakeTimers()
  onComplete.mockClear()
  container = document.createElement('div')
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const tick = async (sec: number) => {
  for (let i = 0; i < sec; i++) await act(async () => vi.advanceTimersByTime(1000))
}

// 本番（300秒）とデバッグ（5秒）で、長さ以外の動きが同じであることを確かめる
it.each([300, 5])('keeps counting past %i seconds and records only on finish', async (seconds) => {
  await act(async () => root.render(createElement(Harness, { seconds })))
  await act(async () => timer.toggle())

  // 時間前の「完了」は効かない
  await tick(seconds - 1)
  await act(async () => timer.finish())
  expect(timer.reached).toBe(false)
  expect(timer.running).toBe(true)
  expect(onComplete).not.toHaveBeenCalled()

  // 時間を過ぎても勝手には止まらず、記録も付かない
  await tick(3)
  expect(timer.reached).toBe(true)
  expect(timer.running).toBe(true)
  expect(timer.elapsed).toBe(seconds + 2)
  expect(onComplete).not.toHaveBeenCalled()

  // 「完了」で止まって、記録は1回だけ
  await act(async () => timer.finish())
  expect(timer.running).toBe(false)
  expect(onComplete).toHaveBeenCalledTimes(1)

  // つけ終わったあとは、押しても動かない
  await act(async () => timer.toggle())
  await act(async () => timer.finish())
  await tick(3)
  expect(timer.running).toBe(false)
  expect(timer.elapsed).toBe(seconds + 2)
  expect(onComplete).toHaveBeenCalledTimes(1)

  // 日をまたぐ等で reset されたら、また回せる
  await act(async () => timer.reset())
  await act(async () => timer.toggle())
  expect(timer.running).toBe(true)
  expect(timer.reached).toBe(false)
})
