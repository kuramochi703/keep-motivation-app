import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

const source = readFileSync(new URL('../src/logic.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
})
const { initialState, key, today, shift, rollover, resetGoal, DECAY } =
  await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)

test('future and invalid saved dates return without reducing vitality', () => {
  const state = initialState()
  for (const lastDate of [key(shift(today(state), 3)), 'invalid']) {
    const result = rollover({ ...state, lastDate })
    assert.equal(result.lastDate, key(today(state)))
    assert.equal(result.vitality, state.vitality)
  }
})

test('past days still decay only when incomplete', () => {
  const state = initialState()
  const yesterday = key(shift(today(state), -1))
  const result = rollover({
    ...state, lastDate: key(shift(today(state), -3)), done: [yesterday],
  })
  assert.equal(result.vitality, state.vitality - 2 * DECAY)
  assert.equal(result.lastDate, key(today(state)))
})

test('a new goal after advancing days can be reopened', () => {
  const reset = resetGoal({ ...initialState(), vitality: 100, dayOffset: 5 })
  assert.equal(reset.vitality, 50)
  assert.equal(reset.dayOffset, 0)
  assert.equal(reset.lastDate, key(today(reset)))
  assert.deepEqual(rollover(reset), reset)
})
