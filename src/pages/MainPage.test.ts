// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import MainPage from './MainPage'
import { initialState, type State } from '../state/logic'

vi.mock('../avatar/Avatar', () => ({ default: () => null }))
vi.mock('../features/calendar/Calendar', () => ({ default: () => null }))

let root: Root
let container: HTMLDivElement
const select = vi.fn()
const newGoal = vi.fn()
const goal = (id: number): State => ({
  ...initialState(), goalId: id, goal: `目標${id}`, name: `アバター${id}`, deadline: '2099-12-31',
})

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.clearAllMocks()
  // jsdom does not implement the native dialog methods.
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value: function (this: HTMLDialogElement) { this.open = true } },
    close: { configurable: true, value: function (this: HTMLDialogElement) { this.open = false } },
  })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.restoreAllMocks()
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal')
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'close')
  vi.unstubAllGlobals()
})

async function render(expired = false) {
  const state = { ...goal(1), deadline: expired ? '2000-01-01' : '2099-12-31' }
  await act(async () => root.render(createElement(MainPage, {
    state, goals: [state, goal(2)], currentGoalId: 1, onSelectGoal: select,
    session: 300, elapsed: 0, running: false, reached: false, onToggleTimer: vi.fn(), onFinishTimer: vi.fn(),
    onNewGoal: newGoal, onExtend: vi.fn(), onStageSeen: vi.fn(),
  })))
}

async function clickButton(text: string) {
  const scope = container.querySelector('dialog[open]') ?? container
  const button = Array.from(scope.querySelectorAll('button')).find((item) => item.textContent?.includes(text))
  expect(button).toBeDefined()
  await act(async () => button!.click())
}

it.each([false, true])('selects a goal inside the goal popup (expired = %s)', async (expired) => {
  await render(expired)
  expect(container.querySelector('.goal-list')).toBeNull()
  await clickButton(expired ? '目標一覧を見る' : '目標')
  const panel = container.querySelector<HTMLDialogElement>('.goals-dialog')!
  expect(panel.querySelectorAll('.goal-list > li')).toHaveLength(2)
  expect(panel.open).toBe(true)
  expect(container.querySelector('.dash-panel .goal-list')).toBeNull()
  expect(panel.querySelector('.goal-card.current')?.textContent).toContain('目標1')
  await clickButton('目標2')
  expect(select).toHaveBeenCalledExactlyOnceWith(2)
  expect(panel.open).toBe(false)
  expect(panel.querySelector('.goal-list')).toBeNull()
})

it('starts a new goal from the popup only after confirmation', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
  await render()
  await clickButton('目標')
  await clickButton('新しい目標を作る')
  expect(newGoal).not.toHaveBeenCalled()
  await clickButton('新しい目標を作る')
  expect(confirm).toHaveBeenCalledTimes(2)
  expect(newGoal).toHaveBeenCalledOnce()
})

it('closes the list popup and returns to the dashboard', async () => {
  await render()
  await clickButton('目標')
  const dialog = container.querySelector<HTMLDialogElement>('.goals-dialog')!
  expect(dialog.open).toBe(true)
  expect(container.querySelector('.goal-list')).not.toBeNull()
  await act(async () => dialog.querySelector<HTMLButtonElement>('.panel-close')!.click())
  expect(dialog.open).toBe(false)
  expect(container.querySelector('.dash-panel')?.getAttribute('aria-hidden')).toBe('true')
  expect(container.querySelector('.goal-list')).toBeNull()
  await clickButton('目標')
  await act(async () => dialog.dispatchEvent(new Event('cancel')))
  expect(dialog.open).toBe(false)
  expect(container.querySelector('.goal-list')).toBeNull()
})
