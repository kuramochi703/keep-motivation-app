
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
  goalId: number | null
  vitality: number
  goal: string
  deadline: string | null // YYYY-MM-DD（目標の期限）
  frequency: Frequency
  /** 何日に1回つけるか。サイクル長（EVOLUTION_PLAN 2章） */
  cycleDays: number
  /** サイクルの起点。目標を作った日 YYYY-MM-DD */
  startedAt: string | null
  avatarId: AvatarId
  /** アバターの色相 0〜359。`avatarId` を置き換える */
  hue: number
  name: string
  /** 進化の演出をどこまで見せたか。記録から計算できない唯一の保存値 */
  seenStage: number
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
  goalId: null,
  vitality: 62,
  goal: '資格の勉強',
  deadline: null,
  frequency: 'any',
  cycleDays: 1,
  startedAt: null,
  avatarId: 0,
  hue: 150,
  name: 'もりお',
  seenStage: 0,
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


export function resetGoal(state: State): State {
  return {
    ...state,

    goalId: null,
    goal: '',
    deadline: null,
    frequency: 'any',
    cycleDays: 1,
    startedAt: null,
    seenStage: 0,

    done: [],
    best: 0,

    vitality: 50,

    lastDate: null,
    dayOffset: 0,
  }
}


/* ------------------------------------------------------------------
 * サイクル ― すべての判定の単位（EVOLUTION_PLAN 2章）
 *
 * 「n日に1回」の n が `cycleDays`。連続もサボりも「日」ではなく
 * 「サイクル」で数えるので、週1回の人が毎日しょんぼりすることがない。
 * 判定はすべて日単位で、境界はサイクル初日の午前0時。
 * ------------------------------------------------------------------ */

/** 日付キーの差（日数）。`to` が後なら正 */
export const diffDays = (from: string, to: string) =>
  Math.round((parseKey(to).getTime() - parseKey(from).getTime()) / 86400000)

/**
 * その日が何番目のサイクルか。起点の日が 0 番。
 * 起点より前の日は負になる（＝どのサイクルにも属さない）。
 */
export const cycleIndex = (day: string, startedAt: string, cycleDays: number) =>
  Math.floor(diffDays(startedAt, day) / Math.max(1, cycleDays))

/** サイクルの起点。目標がまだ無いときは今日を起点とみなす */
export const startOf = (s: State) => s.startedAt ?? key(today(s))

/** 今のサイクル番号 */
export const currentCycle = (s: State) =>
  cycleIndex(key(today(s)), startOf(s), s.cycleDays)

/**
 * 達成したサイクルの番号。1サイクルに何回つけても1サイクル達成なので集合で持つ。
 * 起点より前の記録は捨てる（ペースを変えたときに「連続だけ切る」ため）。
 */
export const doneCycles = (done: string[], startedAt: string, cycleDays: number) => {
  const set = new Set<number>()
  for (const d of done) {
    const i = cycleIndex(d, startedAt, cycleDays)
    if (i >= 0) set.add(i)
  }
  return set
}

/** 達成の記録があるいちばん新しいサイクル。記録が無ければ null */
export const lastDoneCycle = (s: State): number | null => {
  const cycles = doneCycles(s.done, startOf(s), s.cycleDays)
  let last: number | null = null
  for (const i of cycles) if (last === null || i > last) last = i
  return last
}

/** 放置しているサイクル数。今のサイクルを達成済みなら 0。記録が無ければ null */
export const idleOf = (s: State): number | null => {
  const last = lastDoneCycle(s)
  return last === null ? null : currentCycle(s) - last
}

/**
 * 連続達成サイクル数。進行中のサイクルも、つけた時点で数に入る。
 *
 * **1サイクルぶんの猶予**は `idle == 1` のとき連続を残すことで表す。
 * 2サイクル放置したら 0 に落ちる。
 */
export const runOf = (s: State): number => {
  const last = lastDoneCycle(s)
  if (last === null) return 0
  if (currentCycle(s) - last >= 2) return 0

  const cycles = doneCycles(s.done, startOf(s), s.cycleDays)
  let n = 0
  for (let i = last; i >= 0 && cycles.has(i); i--) n++
  return n
}

/** いちばん長かった連続達成サイクル数（旧 `best` の代わり） */
export const bestRun = (s: State): number => {
  const cycles = doneCycles(s.done, startOf(s), s.cycleDays)
  let best = 0
  let run = 0
  const last = lastDoneCycle(s)
  if (last === null) return 0
  for (let i = 0; i <= last; i++) {
    run = cycles.has(i) ? run + 1 : 0
    if (run > best) best = run
  }
  return best
}

/* ------------------------------------------------------------------
 * 連続ボーナス（気分）
 *
 * 気分はステージ1以上のもの。卵に気分は無い（記録が無ければ null）。
 * **落ち込みは彩度で表し、明度は下げない**（下限 58）。暗く沈めると汚く
 * 見えるし、前かがみ（droop）と汗で十分沈んで見える。
 * ------------------------------------------------------------------ */

export type MoodId = 'down' | 'low' | 'ok' | 'good' | 'lively' | 'shine'

export type Mood = {
  id: MoodId
  name: string
  say: string
  /** 彩度 */
  s: number
  /** 明度 */
  l: number
  /** 0〜1。低いと歩き出さず、立ち止まったままになる */
  liveliness: number
  /** あぶら汗。しんどいときだけ */
  sweat: boolean
  /** 豪華なエフェクト。7サイクル連続から */
  sparkle: boolean
}

/**
 * 気分の表。**上から順に見て、最初に当てはまったものを採る。**
 * 数字を動かしたいときはこの表だけを触ればいい。
 */
export const MOODS: (Mood & { hit: (run: number, idle: number) => boolean })[] = [
  {
    id: 'down',
    name: 'ぐったり',
    say: 'もう、うごけない…',
    s: 8,
    l: 58,
    liveliness: 0,
    sweat: true,
    sparkle: false,
    hit: (_run, idle) => idle >= 3,
  },
  {
    id: 'low',
    name: 'うつむき',
    say: 'ちょっとしんどいかも。',
    s: 18,
    l: 58,
    liveliness: 0.2,
    sweat: false,
    sparkle: false,
    hit: (_run, idle) => idle >= 2,
  },
  {
    id: 'ok',
    name: 'すこし元気',
    say: 'ここからだよ。',
    s: 34,
    l: 66,
    liveliness: 0.4,
    sweat: false,
    sparkle: false,
    hit: (run) => run <= 1,
  },
  {
    id: 'good',
    name: '元気',
    say: '調子いいね。',
    s: 44,
    l: 72,
    liveliness: 0.6,
    sweat: false,
    sparkle: false,
    hit: (run) => run === 2,
  },
  {
    id: 'lively',
    name: 'いきいき',
    say: '続いてるね。いい調子。',
    s: 56,
    l: 80,
    liveliness: 0.9,
    sweat: false,
    sparkle: false,
    hit: (run) => run <= 6,
  },
  {
    id: 'shine',
    name: 'かがやき',
    say: '絶好調。今日もいける。',
    s: 56,
    l: 80,
    liveliness: 1,
    sweat: false,
    sparkle: true,
    hit: (run) => run >= 7,
  },
]

/** 今の気分。記録が1つも無ければ「気分なし」（＝たまご） */
export const moodOf = (s: State): Mood | null => {
  const idle = idleOf(s)
  if (idle === null) return null
  const run = runOf(s)
  const hit = MOODS.find((m) => m.hit(run, idle)) ?? MOODS[MOODS.length - 1]
  const { hit: _drop, ...mood } = hit
  return mood
}
