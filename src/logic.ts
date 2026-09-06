export const STORAGE_KEY = 'yatsure:state:v3'
export const GAIN = 12
export const DECAY = 20
export const SESSION = 300 // 達成に必要な秒数

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

export type State = {
  vitality: number
  goal: string
  lastDate: string | null
  dayOffset: number
  done: string[]
  best: number
}

export const initialState = (): State => ({
  vitality: 62,
  goal: '資格の勉強',
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

export const today = (s: State) => shift(new Date(), s.dayOffset)

export const isDone = (s: State, d: Date) => s.done.includes(key(d))

export const levelOf = (v: number) =>
  LEVELS.reduce((acc, l) => (v >= l.min ? l : acc), LEVELS[0])

export const fmtClock = (sec: number) =>
  `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`

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
