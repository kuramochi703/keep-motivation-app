// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGoalState } from './useGoalState'

const database = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('../lib/supabase', () => ({ supabase: database }))

type Reply = { data: unknown; error: { message: string } | null }
type ReadPlan = { table: string; run: () => Promise<Reply> }
const plans: ReadPlan[] = []
const reads: ReadQuery[] = []

/** Only SELECT is supported: any accidental database write fails the test. */
class ReadQuery {
  columns = ''
  filters: [string, string, unknown][] = []
  orders: { column: string; ascending: boolean }[] = []
  maxRows: number | null = null
  constructor(readonly table: string, private readonly run: ReadPlan['run']) {}
  select(columns: string) { this.columns = columns; return this }
  eq(column: string, value: unknown) { this.filters.push(['eq', column, value]); return this }
  in(column: string, values: unknown[]) { this.filters.push(['in', column, values]); return this }
  order(column: string, options = { ascending: true }) { this.orders.push({ column, ascending: options.ascending }); return this }
  limit(count: number) { this.maxRows = count; return this }
  maybeSingle() { return this.run() }
  then(resolve: (reply: Reply) => unknown, reject: (error: unknown) => unknown) {
    return this.run().then(resolve, reject)
  }
}

const ok = (data: unknown): Reply => ({ data, error: null })
const failed: Reply = { data: null, error: { message: 'read failed' } }
const enqueue = (table: string, reply: Reply) => plans.push({ table, run: () => Promise.resolve(
  table === 'goals' && reply.data && !Array.isArray(reply.data)
    ? { ...reply, data: [reply.data] } : reply
) })
const goalRow = (id = 1) => ({
  id,
  goal: `Goal ${id}`,
  deadline: '2026-12-31',
  cycle_days: 3,
  started_at: '2026-09-01',
  avatars: [{ name: `Avatar ${id}`, hue: 120, seen_stage: 1 }],
})

function enqueueGoal(id = 1) {
  enqueue('goals', ok(goalRow(id)))
  enqueue('records', ok([{ goal_id: id, done_on: '2026-09-02' }]))
}

function deferred() {
  let resolve!: (value: Reply) => void
  const promise = new Promise<Reply>((done) => { resolve = done })
  return { promise, resolve }
}

let root: Root
let container: HTMLDivElement
let current: ReturnType<typeof useGoalState>
const snapshots: { userId: string | null; loaded: boolean; goalId: number | null; hasStarted: boolean; hasGoalHistory: boolean }[] = []

function Probe({ userId }: { userId: string | null }) {
  current = useGoalState(userId)
  snapshots.push({
    userId,
    loaded: current.loaded,
    goalId: current.state.goalId,
    hasStarted: current.hasStarted,
    hasGoalHistory: current.hasGoalHistory,
  })
  return null
}

async function render(userId: string | null) {
  await act(async () => { root.render(createElement(Probe, { userId })) })
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  localStorage.clear()
  plans.length = 0
  reads.length = 0
  snapshots.length = 0
  database.from.mockReset()
  database.from.mockImplementation((table: string) => {
    const plan = plans.shift()
    expect(plan?.table).toBe(table)
    if (!plan) throw new Error(`Unexpected query: ${table}`)
    const query = new ReadQuery(table, plan.run)
    reads.push(query)
    return query
  })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  expect(plans).toHaveLength(0)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('useGoalState loading', () => {
  it('keeps multiple goals and their records separate when selecting and reloading', async () => {
    const rows = [goalRow(2), goalRow(1)]
    const records = [{ goal_id: 1, done_on: '2026-09-02' }, { goal_id: 2, done_on: '2026-09-03' }]
    enqueue('goals', ok(rows))
    enqueue('records', ok(records))
    await render('account-a')
    expect(current.currentGoalId).toBe(2)
    expect(current.goals).toHaveLength(2)
    expect(current.state.done).toEqual(['2026-09-03'])
    await act(async () => current.selectGoal(1))
    expect(current.state.goalId).toBe(1)
    expect(current.state.done).toEqual(['2026-09-02'])
    expect(reads).toHaveLength(2)
    expect(localStorage.getItem('kma.currentGoal.account-a')).toBe('1')
    await act(async () => current.setDayOffset(-2))
    enqueue('goals', ok(rows))
    enqueue('records', ok(records))
    await act(async () => current.reload())
    expect(current.state.goalId).toBe(1)
    expect(current.state.dayOffset).toBe(-2)
    await render(null)
    enqueue('goals', ok(rows))
    enqueue('records', ok(records))
    await render('account-a')
    expect(current.currentGoalId).toBe(1)
    expect(current.state.dayOffset).toBe(0)
  })

  it('falls back to the newest goal if the saved selection no longer exists', async () => {
    localStorage.setItem('kma.currentGoal.account-a', '99')
    enqueueGoal(2)
    await render('account-a')
    expect(current.currentGoalId).toBe(2)
    await act(async () => current.selectGoal(99))
    expect(current.currentGoalId).toBe(2)
  })

  it('clears deleted goals on reload while retaining tutorial completion evidence', async () => {
    enqueueGoal()
    await render('account-a')
    enqueue('goals', ok([]))
    await act(async () => current.reload())
    expect(current.loaded).toBe(true)
    expect(current.goals).toEqual([])
    expect(current.currentGoalId).toBeNull()
    expect(current.hasStarted).toBe(false)
    expect(current.hasGoalHistory).toBe(true)
  })

  it('loads the current account’s goal, avatar and records before reporting ready', async () => {
    enqueueGoal()
    await render('account-a')

    expect(current.loaded).toBe(true)
    expect(current.loadError).toBeNull()
    expect(current.hasStarted).toBe(true)
    expect(current.hasGoalHistory).toBe(true)
    expect(current.state).toMatchObject({
      goalId: 1,
      goal: 'Goal 1',
      deadline: '2026-12-31',
      cycleDays: 3,
      startedAt: '2026-09-01',
      name: 'Avatar 1',
      hue: 120,
      seenStage: 1,
      done: ['2026-09-02'],
    })
    expect(reads[0].filters).toEqual([['eq', 'user_id', 'account-a']])
    expect(reads[0].orders).toEqual([{ column: 'id', ascending: false }])
    expect(reads[0].maxRows).toBeNull()
    expect(reads[0].columns).not.toContain('archived_at')
    expect(reads[1].filters).toContainEqual(['in', 'goal_id', [1]])
    expect(reads).toHaveLength(2)
  })

  it('reports no current goal or history when the account has no goal rows', async () => {
    enqueue('goals', ok(null))
    await render('account-a')

    expect(current.loaded).toBe(true)
    expect(current.loadError).toBeNull()
    expect(current.hasStarted).toBe(false)
    expect(current.state.goalId).toBeNull()
    expect(current.hasGoalHistory).toBe(false)
    expect(reads).toHaveLength(1)
  })

  it.each(['goal', 'records', 'network'] as const)('surfaces a %s read failure and recovers after retry', async (failure) => {
    if (failure === 'network') {
      plans.push({ table: 'goals', run: () => Promise.reject(new Error('network unavailable')) })
    } else if (failure === 'goal') {
      enqueue('goals', failed)
    } else {
      enqueue('goals', ok(goalRow()))
      enqueue('records', failed)
    }
    await render('account-a')

    expect(current.loaded).toBe(false)
    expect(current.loadError).toBeTruthy()
    expect(current.hasStarted).toBe(false)
    expect(current.state.goalId).toBeNull()
    expect(console.error).toHaveBeenCalledTimes(1)

    const retry = current.retryLoad
    const pending = deferred()
    plans.push({ table: 'goals', run: () => pending.promise })
    await act(async () => retry())
    expect(current.loaded).toBe(false)
    expect(current.loadError).toBeNull()

    enqueue('records', ok([]))
    await act(async () => pending.resolve(ok([goalRow()])))
    expect(current.loaded).toBe(true)
    expect(current.loadError).toBeNull()
    expect(current.hasStarted).toBe(true)
    expect(current.state.goalId).toBe(1)
    expect(current.retryLoad).toBe(retry)
  })

  it('keeps tutorial evidence when reset or newGoal clears the current goal', async () => {
    enqueueGoal()
    await render('account-a')

    await act(async () => current.newGoal())
    expect(current.hasStarted).toBe(false)
    expect(current.hasGoalHistory).toBe(true)
    await act(async () => current.reset())
    expect(current.hasGoalHistory).toBe(true)
    expect(reads).toHaveLength(2)
  })

  it('masks the previous account on the first render after switching accounts', async () => {
    enqueueGoal()
    await render('account-a')
    const beforeSwitch = snapshots.length
    const pending = deferred()
    plans.push({ table: 'goals', run: () => pending.promise })
    await render('account-b')

    expect(snapshots[beforeSwitch]).toEqual({
      userId: 'account-b', loaded: false, goalId: null, hasStarted: false, hasGoalHistory: false,
    })
    expect(current.loaded).toBe(false)
    await act(async () => pending.resolve(ok(null)))
    expect(current.loaded).toBe(true)
    expect(current.hasStarted).toBe(false)
    expect(current.hasGoalHistory).toBe(false)
    expect(current.state.goalId).toBeNull()
  })

  it.each(['goal', 'records'] as const)('ignores a slow previous account’s %s response', async (phase) => {
    const pending = deferred()
    if (phase === 'goal') {
      plans.push({ table: 'goals', run: () => pending.promise })
    } else {
      enqueue('goals', ok(goalRow(1)))
      plans.push({ table: 'records', run: () => pending.promise })
    }
    await render('account-a')
    expect(current.loaded).toBe(false)

    enqueueGoal(2)
    await render('account-b')
    expect(current.state.goalId).toBe(2)
    await act(async () => pending.resolve(phase === 'goal' ? ok([goalRow(1)]) : ok([])))
    expect(current.loaded).toBe(true)
    expect(current.state.goalId).toBe(2)
    expect(current.state.done).toEqual(['2026-09-02'])
  })

  it('clears account state on logout without querying anonymously', async () => {
    enqueueGoal()
    await render('account-a')
    await render(null)

    expect(current.loaded).toBe(false)
    expect(current.loadError).toBeNull()
    expect(current.hasStarted).toBe(false)
    expect(current.hasGoalHistory).toBe(false)
    expect(current.state.goalId).toBeNull()
    expect(reads).toHaveLength(2)
  })
})

describe('useGoalState account changes during goal creation', () => {
  it.each(['goal', 'avatar'] as const)('stops after a pending %s write when the account changes', async (pendingStage) => {
    enqueueGoal(1)
    await render('account-a')

    const pending = deferred()
    const stages = [
      { stage: 'goal', table: 'goals', method: 'insert', reply: ok({ id: 10 }) },
      { stage: 'avatar', table: 'avatars', method: 'insert', reply: ok(null) },
    ]
    const pendingIndex = stages.findIndex(({ stage }) => stage === pendingStage)
    for (const [index, stage] of stages.slice(0, pendingIndex + 1).entries()) {
      // These are entirely mocked writes; other tests still only permit SELECT.
      database.from.mockImplementationOnce((table: string) => {
        expect(table).toBe(stage.table)
        const result = index === pendingIndex ? pending.promise : Promise.resolve(stage.reply)
        const query = {
          select: () => query,
          single: () => result,
          then: (resolve: (reply: Reply) => unknown, reject: (error: unknown) => unknown) => result.then(resolve, reject),
        }
        return { [stage.method]: () => query }
      })
    }

    let operation!: Promise<boolean>
    await act(async () => {
      operation = current.start({
        goal: 'New goal for A', deadline: '2026-12-31', cycleDays: 1, name: 'A avatar', hue: 120,
      })
    })
    enqueue('goals', ok(null))
    await render('account-b')
    const accountBState = current.state
    const callsBeforeCompletion = database.from.mock.calls.length

    let created: boolean | undefined
    await act(async () => {
      pending.resolve(stages[pendingIndex].reply)
      created = await operation
    })

    expect(created).toBe(false)
    expect(database.from).toHaveBeenCalledTimes(callsBeforeCompletion)
    expect(current.loaded).toBe(true)
    expect(current.state).toEqual(accountBState)
    expect(current.state.goalId).toBeNull()
    expect(current.hasStarted).toBe(false)
    expect(current.hasGoalHistory).toBe(false)
  })
})

describe('useGoalState goal creation without schema changes', () => {
  it('inserts only a goal and avatar, retains the previous data, and reloads the latest goal', async () => {
    const originalGoal = goalRow(1)
    const storedGoals = [originalGoal]
    const storedRecords = [{ goal_id: 1, done_on: '2026-09-02' }]
    enqueue('goals', ok(originalGoal))
    enqueue('records', ok(storedRecords))
    await render('account-a')

    const writes: { table: string; values: Record<string, unknown> }[] = []
    database.from.mockImplementationOnce((table: string) => {
      expect(table).toBe('goals')
      return {
        insert: (values: Record<string, unknown>) => {
          writes.push({ table, values })
          storedGoals.push({ ...goalRow(2), ...values })
          return { select: () => ({ single: async () => ok({ id: 2 }) }) }
        },
      }
    })
    database.from.mockImplementationOnce((table: string) => {
      expect(table).toBe('avatars')
      return {
        insert: async (values: Record<string, unknown>) => {
          writes.push({ table, values })
          return ok(null)
        },
      }
    })

    let created: boolean | undefined
    await act(async () => {
      created = await current.start({
        goal: 'A newer goal', deadline: '2026-12-31', cycleDays: 1, name: 'New avatar', hue: 150,
      })
    })
    expect(created).toBe(true)
    expect(writes.map(({ table }) => table)).toEqual(['goals', 'avatars'])
    expect(writes[0].values).toMatchObject({ user_id: 'account-a', goal: 'A newer goal' })
    expect(writes[1].values).toEqual({ goal_id: 2, name: 'New avatar', hue: 150 })
    expect(storedGoals[0]).toBe(originalGoal)
    expect(storedRecords).toEqual([{ goal_id: 1, done_on: '2026-09-02' }])
    expect(current.state.goalId).toBe(2)

    enqueue('goals', ok({ ...storedGoals[1], avatars: [{ name: 'New avatar', hue: 150, seen_stage: 0 }] }))
    enqueue('records', ok([]))
    await act(async () => current.retryLoad())
    expect(reads[2].filters).toEqual([['eq', 'user_id', 'account-a']])
    expect(reads[2].orders).toEqual([{ column: 'id', ascending: false }])
    expect(reads[2].maxRows).toBeNull()
    expect(current.loaded).toBe(true)
    expect(current.state).toMatchObject({ goalId: 2, goal: 'A newer goal', name: 'New avatar', done: [] })
    expect(current.hasStarted).toBe(true)
    expect(current.hasGoalHistory).toBe(true)
    expect(storedRecords).toEqual([{ goal_id: 1, done_on: '2026-09-02' }])
  })
})
