import { describe, expect, it } from 'vitest'
import { key, parseKey, shift } from './logic'

describe('日付のものさし', () => {
  it('key() は YYYY-MM-DD を0埋めで返す', () => {
    expect(key(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  it('parseKey() と key() は行き来できる', () => {
    expect(key(parseKey('2026-09-22'))).toBe('2026-09-22')
  })

  it('shift() は月をまたいでも日をずらせる', () => {
    expect(key(shift(parseKey('2026-01-31'), 1))).toBe('2026-02-01')
  })
})
