import { describe, expect, it } from 'vitest'
import { allowedScreen, entryScreen } from './screenFlow'

describe('ログイン時の表示先', () => {
  it('チュートリアル未完了なら、最初にチュートリアルを表示する', () => {
    expect(entryScreen(false, false)).toBe('top')
    expect(entryScreen(false, true)).toBe('top')
  })

  it('チュートリアル完了済みで現在の目標がなければ目標設定を表示する', () => {
    expect(entryScreen(true, false)).toBe('setup')
  })

  it('チュートリアル完了済みで現在の目標があればダッシュボードを表示する', () => {
    expect(entryScreen(true, true)).toBe('main')
  })
})

describe('ログイン後の画面遷移', () => {
  it('チュートリアルが終わるまでは目標設定やダッシュボードへ飛ばない', () => {
    expect(allowedScreen('setup', false, false)).toBe('top')
    expect(allowedScreen('main', false, false)).toBe('top')
  })

  it('完了済みチュートリアルへ戻ろうとしたら、目標の有無で表示先を決める', () => {
    expect(allowedScreen('top', true, false)).toBe('setup')
    expect(allowedScreen('top', true, true)).toBe('main')
  })

  it('目標がない状態ではダッシュボードを表示しない', () => {
    expect(allowedScreen('main', true, false)).toBe('setup')
  })

  it('目標がない状態では目標の修正画面を表示しない', () => {
    expect(allowedScreen('edit', true, false)).toBe('setup')
    expect(allowedScreen('edit', true, true)).toBe('edit')
  })

  it('現在の目標があっても、明示的に目標設定へ移動できる', () => {
    expect(allowedScreen('setup', true, true)).toBe('setup')
  })

  it('開発用デバッグ画面は従来どおり使える', () => {
    expect(allowedScreen('debug', false, false)).toBe('debug')
  })
})
