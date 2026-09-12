export const STORAGE_KEY = 'yatsure:state:v4'
export const GAIN = 12
export const DECAY = 20
export const SESSION = 300 // 秒

export type Level = {
  min: number
  lv: 0 | 1 | 2 | 3 | 4
  name: string
  say: string
  h: number
  s: number
}

export const LEVELS: Level[] = [
  { min: 0, lv: 0, name: 'ボロボロ', say: 'もう、うごけない…', h: 212, s: 8 },
  { min: 20, lv: 1, name: 'しょんぼり', say: 'ちょっとしんどいかも。', h: 208, s: 16 },
  { min: 45, lv: 2, name: 'ふつう', say: 'ふつう。ここからだよ。', h: 190, s: 28 },
  { min: 70, lv: 3, name: '元気', say: '調子いいね。', h: 166, s: 52 },
  { min: 90, lv: 4, name: '絶好調', say: '絶好調。今日もいける。', h: 156, s: 68 },
]

export type Frequency = 'everyday' | 'week3' | 'week1' | 'any'

export const FREQUENCIES: { id: Frequency; label: string }[] = [
  { id: 'everyday', label: '毎日' },
  { id: 'week3', label: '週3回' },
  { id: 'week1', label: '週1回' },
  { id: 'any', label: '決めてない' },
]

export const freqLabel = (f: Frequency) =>
  FREQUENCIES.find((x) => x.id === f)?.label ?? ''

export type AvatarId = 0 | 1 | 2

export const AVATARS: { id: AvatarId; name: string; desc: string }[] = [
  { id: 0, name: 'もりお', desc: 'みどりの野草タイプ' },
  { id: 1, name: 'だいち', desc: 'あおの力持ちタイプ' },
  { id: 2, name: 'こむぎ', desc: 'ピンクのいやしタイプ' },
]

export const avatarName = (id: AvatarId) => AVATARS[id].name

export type State = {
  vitality: number
  goal: string
  deadline: string | null // YYYY-MM-DD（目標の期限）
  frequency: Frequency
  avatarId: AvatarId
  name: string
  lastDate: string | null
  dayOffset: number
  done: string[]
  best: number
}

export type SetupInput = {
  goal: string
  deadline: string
  frequency: Frequency
  avatarId: AvatarId
  name: string
}

export const initialState = (): State => ({
  vitality: 62,
  goal: '資格の勉強',
  deadline: null,
  frequency: 'any',
  avatarId: 0,
  name: 'もりお',
  lastDate: null,
  dayOffset: 0,
  done: [],
  best: 0,
})

export const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)))

export const key = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export const parseKey = (k: string) => {
  const [y, m, d] = k.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export const shift = (d: Date, n: number) => {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

export const addMonths = (d: Date, n: number) => {
  const x = new Date(d)
  x.setMonth(x.getMonth() + n)
  return x
}

export const today = (s: State) => shift(new Date(), s.dayOffset)

export const isDone = (s: State, d: Date) => s.done.includes(key(d))

export const levelOf = (v: number) =>
  LEVELS.reduce((acc, l) => (v >= l.min ? l : acc), LEVELS[0])

export const fmtClock = (sec: number) =>
  `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`

/** 期限までの残り日数（負なら期限切れ） */
export const daysUntil = (s: State): number | null => {
  if (!s.deadline) return null
  const t0 = parseKey(key(today(s))).getTime()
  return Math.round((parseKey(s.deadline).getTime() - t0) / 86400000)
}

/** 期限切れかどうか */
export const isExpired = (s: State) => {
  const d = daysUntil(s)
  return d !== null && d < 0
}

/** 連続日数 */
export function streak(s: State) {
  let n = 0
  let d = today(s)
  if (!isDone(s, d)) d = shift(d, -1)
  while (isDone(s, d)) {
    n++
    d = shift(d, -1)
  }
  return n
}

/** 前回起動日から今日までの未達成日ぶん、活力を減らす */
export function rollover(s: State): State {
  const tk = key(today(s))
  if (!s.lastDate) return { ...s, lastDate: tk }
  if (s.lastDate === tk) return s

  let vitality = s.vitality
  let d = parseKey(s.lastDate)
  while (key(d) !== tk) {
    if (!isDone(s, d)) vitality = clamp(vitality - DECAY)
    d = shift(d, 1)
  }
  return { ...s, vitality, lastDate: tk }
}

/** 今日を達成にする */
export function markDone(s: State): State {
  const tk = key(today(s))
  if (s.done.includes(tk)) return s
  const next: State = {
    ...s,
    done: [...s.done, tk],
    vitality: clamp(s.vitality + GAIN),
  }
  return { ...next, best: Math.max(next.best, streak(next)) }
}

/** 新しい目標に切り替える（アバターと活力は引き継ぐ） */
export const resetGoal = (s: State): State => ({
  ...initialState(),
  vitality: s.vitality,
  avatarId: s.avatarId,
  name: s.name,
  lastDate: key(today(s)),
})

export function load(): State {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? { ...initialState(), ...JSON.parse(raw) } : initialState()
  } catch {
    return initialState()
  }
}

export function save(s: State) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  } catch {
    /* ignore */
  }
}